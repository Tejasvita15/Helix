from datetime import UTC, datetime
from html import escape
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from app.auralis_model import MODEL_ID, get_auralis_model
from app.whisper_service import WHISPER_MODEL_SIZE, get_whisper_transcriber, transcribe_upload

app = FastAPI(
    title="MindTrail SG API",
    description=(
        "API scaffold for possible cognitive-risk signal workflows. "
        "This is not a diagnosis."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:8082",
        "http://127.0.0.1:8082",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Band = Literal["green", "amber", "red"]


class SessionStartRequest(BaseModel):
    age_band: str
    preferred_language: str
    education_band: str
    caregiver_assisted: bool


class SessionStartResponse(BaseModel):
    session_id: str


class CaregiverChecklistRequest(BaseModel):
    session_id: str
    repeated_questions: bool = False
    missed_medication: bool = False
    missed_appointments: bool = False
    getting_lost: bool = False
    money_or_bills_difficulty: bool = False
    mood_or_personality_change: Literal["yes", "no", "unsure"] = "unsure"
    family_concerned: bool = False


class SavedResponse(BaseModel):
    saved: bool


class VoiceTaskRequest(BaseModel):
    session_id: str = "demo-session-001"
    picture_id: str = "demo-picture"
    duration_sec: int = Field(ge=0, le=300)
    pause_count: int = Field(ge=0)
    long_pause_count: int = Field(ge=0)
    estimated_word_count: int = Field(ge=0)
    transcript: str = ""
    audio_uri: str | None = None
    model_name: str = "Auralis/NatHACKS_Auralis"
    image_prompt: str | None = None


class DomainSignal(BaseModel):
    domain: str
    band: Band
    score: int
    reason: str
    model: str | None = None
    disclaimer: str = (
        "This is not a diagnosis. Please discuss new or worsening concerns "
        "with a healthcare professional."
    )


class VoiceTaskResponse(BaseModel):
    saved: bool
    voice_signal: DomainSignal
    prediction: dict[str, object]


class ModelStatusResponse(BaseModel):
    model: str
    loaded: bool
    device: str | None = None
    labels: dict[int, str] | None = None
    warning: str | None = None


class WhisperStatusResponse(BaseModel):
    model: str
    loaded: bool
    warning: str | None = None


class UserReminiscenceDetails(BaseModel):
    age_band: str | None = None
    preferred_language: str | None = None
    childhood_neighbourhood: str | None = None
    former_occupation: str | None = None
    hobbies: list[str] = []
    familiar_places: list[str] = []
    family_context: str | None = None


class PersonalizedPictureRequest(BaseModel):
    session_id: str = "demo-session-001"
    details: UserReminiscenceDetails | None = None


class PersonalizedPictureResponse(BaseModel):
    use_personalized_generation: bool
    generated_image_url: str | None = None
    image_prompt: str | None = None
    fallback_picture_id: str
    safety_note: str


class ScoreRequest(BaseModel):
    session_id: str


class ScoreResponse(BaseModel):
    session_id: str
    overall_band: Band
    domain_signals: dict[str, DomainSignal]
    recommendations: list[str]
    disclaimer: str


SESSIONS: dict[str, dict[str, object]] = {}
CAREGIVER_CHECKLISTS: dict[str, CaregiverChecklistRequest] = {}
VOICE_TASKS: dict[str, VoiceTaskResponse] = {}
PICTURE_STORY_PROMPTS: dict[str, str] = {}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/session/start")
def start_session(payload: SessionStartRequest) -> SessionStartResponse:
    session_id = f"demo-session-{uuid4().hex[:8]}"
    SESSIONS[session_id] = {
        "profile": payload.model_dump(),
        "created_at": datetime.now(UTC).isoformat(),
    }
    return SessionStartResponse(session_id=session_id)


@app.post("/caregiver-checklist")
def caregiver_checklist(payload: CaregiverChecklistRequest) -> SavedResponse:
    CAREGIVER_CHECKLISTS[payload.session_id] = payload
    return SavedResponse(saved=True)


@app.post("/task/voice")
def voice_task(payload: VoiceTaskRequest) -> VoiceTaskResponse:
    signal = score_voice_task(payload)
    image_prompt = payload.image_prompt or PICTURE_STORY_PROMPTS.get(payload.session_id)
    word_timing_metrics = empty_word_timing_metrics()
    prediction = {
        "model": payload.model_name,
        "task": "picture_story_voice",
        "picture_id": payload.picture_id,
        "user_score": signal.score,
        "auralis_score_probability": None,
        "language_domain_score": signal.score,
        "band": signal.band,
        "risk_signal": signal.band,
        "average_time_taken_per_word_sec": word_timing_metrics[
            "average_time_taken_per_word_sec"
        ],
        "median_time_taken_per_word_sec": word_timing_metrics[
            "median_time_taken_per_word_sec"
        ],
        "p90_time_taken_per_word_sec": word_timing_metrics[
            "p90_time_taken_per_word_sec"
        ],
        "average_gap_between_words_sec": None,
        "sentence_translated_by_whisper": payload.transcript,
        "whisper_transcript": payload.transcript,
        "image_prompt": image_prompt,
        "features": {
            "duration_sec": payload.duration_sec,
            "pause_count": payload.pause_count,
            "long_pause_count": payload.long_pause_count,
            "estimated_word_count": payload.estimated_word_count,
            "speech_rate_words_per_min": speech_rate(payload),
        },
        "clinical_claim": "possible language-domain signal only",
        "disclaimer": signal.disclaimer,
    }
    response = VoiceTaskResponse(saved=True, voice_signal=signal, prediction=prediction)
    VOICE_TASKS[payload.session_id] = response
    return response


@app.post("/task/voice/audio")
async def voice_task_audio(
    session_id: str = Form("demo-session-001"),
    picture_id: str = Form("demo-picture"),
    image_prompt: str | None = Form(None),
    file: UploadFile = File(...),
) -> VoiceTaskResponse:
    content = await file.read()
    raw_prediction = await predict_audio_bytes(content, file.filename)
    transcription = await transcribe_audio_bytes(content, file.filename)
    signal = signal_from_auralis(raw_prediction)
    resolved_image_prompt = image_prompt or PICTURE_STORY_PROMPTS.get(session_id)
    word_timing_metrics = word_timing_metrics_from_transcription(transcription)
    whisper_text = str(transcription.get("text") or "")
    prediction = {
        "model": MODEL_ID,
        "task": "picture_story_voice",
        "picture_id": picture_id,
        "user_score": signal.score,
        "auralis_score_probability": auralis_label_probability(
            raw_prediction,
            "dementia",
        ),
        "language_domain_score": signal.score,
        "band": signal.band,
        "risk_signal": signal.band,
        "average_time_taken_per_word_sec": word_timing_metrics[
            "average_time_taken_per_word_sec"
        ],
        "median_time_taken_per_word_sec": word_timing_metrics[
            "median_time_taken_per_word_sec"
        ],
        "p90_time_taken_per_word_sec": word_timing_metrics[
            "p90_time_taken_per_word_sec"
        ],
        "average_gap_between_words_sec": transcription.get(
            "average_gap_between_words_sec"
        ),
        "sentence_translated_by_whisper": whisper_text,
        "whisper_transcript": whisper_text,
        "image_prompt": resolved_image_prompt,
        "raw_model_output": raw_prediction,
        "transcription": transcription,
        "clinical_claim": "possible language-domain signal only",
        "disclaimer": signal.disclaimer,
    }
    response = VoiceTaskResponse(saved=True, voice_signal=signal, prediction=prediction)
    VOICE_TASKS[session_id] = response
    return response


@app.post("/transcribe/whisper")
async def transcribe_whisper(file: UploadFile = File(...)) -> dict[str, object]:
    return await transcribe_upload(file)


@app.post("/picture-story/personalized")
def personalized_picture(
    payload: PersonalizedPictureRequest,
) -> PersonalizedPictureResponse:
    fallback_picture_id = fallback_picture_for_session(payload.session_id)
    if payload.details is None:
        return PersonalizedPictureResponse(
            use_personalized_generation=False,
            fallback_picture_id=fallback_picture_id,
            safety_note=(
                "No user details were provided. Use a built-in everyday picture "
                "story image."
            ),
        )

    image_prompt = build_reminiscence_image_prompt(payload.details)
    PICTURE_STORY_PROMPTS[payload.session_id] = image_prompt
    return PersonalizedPictureResponse(
        use_personalized_generation=True,
        generated_image_url=None,
        image_prompt=image_prompt,
        fallback_picture_id=fallback_picture_id,
        safety_note=(
            "Generated reminiscence images should avoid medical claims, avoid "
            "showing real identifiable people, and be reviewed before use."
        ),
    )


@app.get("/model/auralis/status")
def auralis_status() -> ModelStatusResponse:
    try:
        model = get_auralis_model()
    except Exception as exc:
        return ModelStatusResponse(
            model=MODEL_ID,
            loaded=False,
            warning=str(exc),
        )

    return ModelStatusResponse(
        model=MODEL_ID,
        loaded=True,
        device=str(model.device),
        labels=model.config.id2label,
        warning=(
            "Model output is a research signal only. It is not a diagnosis and "
            "has not been locally clinically validated for MindTrail SG."
        ),
    )


@app.get("/model/whisper/status")
def whisper_status() -> WhisperStatusResponse:
    try:
        get_whisper_transcriber()
    except Exception as exc:
        return WhisperStatusResponse(
            model=f"faster-whisper/{WHISPER_MODEL_SIZE}",
            loaded=False,
            warning=str(exc),
        )

    return WhisperStatusResponse(
        model=f"faster-whisper/{WHISPER_MODEL_SIZE}",
        loaded=True,
        warning=(
            "Whisper transcription is approximate and should be reviewed before "
            "clinical or caregiver use."
        ),
    )


@app.post("/task/drawing")
def drawing_task() -> dict[str, object]:
    return {
        "saved": True,
        "drawing_signal": {
            "domain": "visuospatial_planning",
            "band": "green",
            "score": 80,
            "reason": "Demo placeholder. Drawing task is outside this Picture Story Voice iteration.",
            "disclaimer": (
                "This is not a diagnosis. Please discuss new or worsening concerns "
                "with a healthcare professional."
            ),
        },
    }


@app.post("/score")
def score(payload: ScoreRequest) -> ScoreResponse:
    voice_response = VOICE_TASKS.get(payload.session_id)
    if voice_response is None:
        raise HTTPException(status_code=404, detail="No voice task found for this session.")

    caregiver_signal = score_caregiver(payload.session_id)
    overall_band = combine_bands(voice_response.voice_signal.band, caregiver_signal.band)

    return ScoreResponse(
        session_id=payload.session_id,
        overall_band=overall_band,
        domain_signals={
            "language": voice_response.voice_signal,
            "caregiver_concern": caregiver_signal,
        },
        recommendations=[
            "Discuss new or worsening concerns with a GP.",
            "Bring this report to the next appointment.",
            "Repeat the check in 4-6 weeks to track change.",
        ],
        disclaimer=(
            "This is not a diagnosis. Please discuss new or worsening concerns "
            "with a healthcare professional."
        ),
    )


@app.get("/report/{session_id}", response_class=HTMLResponse)
def report(session_id: str) -> str:
    voice_response = VOICE_TASKS.get(session_id)
    if voice_response is None:
        raise HTTPException(status_code=404, detail="No report found for this session.")

    signal = voice_response.voice_signal
    return f"""
    <!doctype html>
    <html>
      <head>
        <title>MindTrail SG Voice Task Report</title>
        <style>
          body {{ font-family: Arial, sans-serif; margin: 40px; color: #111827; }}
          .band {{ text-transform: uppercase; font-weight: 700; }}
          .note {{ color: #4b5563; }}
        </style>
      </head>
      <body>
        <h1>MindTrail SG Picture Story Voice Report</h1>
        <p><strong>Session:</strong> {escape(session_id)}</p>
        <p><strong>Language signal:</strong> <span class="band">{signal.band}</span></p>
        <p><strong>Score:</strong> {signal.score}</p>
        <p><strong>Reason:</strong> {escape(signal.reason)}</p>
        <p class="note">{escape(signal.disclaimer)}</p>
      </body>
    </html>
    """


def score_voice_task(payload: VoiceTaskRequest) -> DomainSignal:
    words_per_minute = speech_rate(payload)
    score = 100
    score -= min(payload.long_pause_count * 8, 32)
    score -= min(max(payload.pause_count - 4, 0) * 3, 24)

    if payload.estimated_word_count < 30:
        score -= 20
    elif payload.estimated_word_count < 55:
        score -= 10

    if payload.duration_sec < 20:
        score -= 15

    if words_per_minute < 65:
        score -= 14
    elif words_per_minute < 90:
        score -= 7

    score = max(0, min(100, score))
    band = band_for_score(score)
    reason = (
        "Picture Story Voice showed speech-language features from the demo "
        f"pipeline: {payload.long_pause_count} long pauses, "
        f"{payload.estimated_word_count} estimated words, and "
        f"{words_per_minute} words per minute."
    )
    return DomainSignal(
        domain="language",
        band=band,
        score=score,
        reason=reason,
        model=payload.model_name,
    )


async def predict_audio_bytes(
    content: bytes,
    filename: str | None,
) -> dict[str, object]:
    suffix = Path(filename or "audio.wav").suffix or ".wav"
    with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(content)
        temp_path = Path(temp_file.name)

    try:
        return get_auralis_model().predict_path(temp_path)
    finally:
        temp_path.unlink(missing_ok=True)


async def transcribe_audio_bytes(
    content: bytes,
    filename: str | None,
) -> dict[str, object]:
    suffix = Path(filename or "audio.wav").suffix or ".wav"
    with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(content)
        temp_path = Path(temp_file.name)

    try:
        return get_whisper_transcriber().transcribe_path(temp_path)
    finally:
        temp_path.unlink(missing_ok=True)


def signal_from_auralis(raw_prediction: dict[str, object]) -> DomainSignal:
    audio_quality = raw_prediction.get("audio_quality")
    if (
        isinstance(audio_quality, dict)
        and audio_quality.get("is_silent") is True
    ):
        return DomainSignal(
            domain="language",
            band="amber",
            score=50,
            reason=(
                "No usable speech was detected in the recording, so the "
                "Auralis model was not used for a cognitive-risk signal. "
                "Please retry with audible speech if this was unintentional."
            ),
            model=MODEL_ID,
        )

    scores = raw_prediction.get("scores", [])
    dementia_score = 0.0
    if isinstance(scores, list):
        for item in scores:
            if isinstance(item, dict) and item.get("label") == "dementia":
                dementia_score = float(item.get("score", 0.0))
                break

    score = round((1 - dementia_score) * 100)
    band = band_for_score(score)
    reason = (
        "Auralis/NatHACKS_Auralis returned an audio-classification research "
        f"signal with raw dementia-label probability {dementia_score:.2f}. "
        "Use this only as a possible language-domain signal."
    )
    return DomainSignal(
        domain="language",
        band=band,
        score=score,
        reason=reason,
        model=MODEL_ID,
    )


def auralis_label_probability(
    raw_prediction: dict[str, object],
    label: str,
) -> float | None:
    scores = raw_prediction.get("scores", [])
    if not isinstance(scores, list):
        return None

    for item in scores:
        if isinstance(item, dict) and item.get("label") == label:
            return round(float(item.get("score", 0.0)), 4)

    return None


def empty_word_timing_metrics() -> dict[str, float | None]:
    return {
        "average_time_taken_per_word_sec": None,
        "median_time_taken_per_word_sec": None,
        "p90_time_taken_per_word_sec": None,
    }


def word_timing_metrics_from_transcription(
    transcription: dict[str, object],
) -> dict[str, float | None]:
    words = transcription.get("words", [])
    if not isinstance(words, list):
        return empty_word_timing_metrics()

    durations: list[float] = []
    for word in words:
        if not isinstance(word, dict):
            continue
        duration = word.get("duration_sec")
        if isinstance(duration, int | float):
            durations.append(float(duration))

    if not durations:
        return empty_word_timing_metrics()

    durations.sort()
    p90_index = min(len(durations) - 1, max(0, round((len(durations) - 1) * 0.9)))
    midpoint = len(durations) // 2
    if len(durations) % 2:
        median_duration = durations[midpoint]
    else:
        median_duration = (durations[midpoint - 1] + durations[midpoint]) / 2

    return {
        "average_time_taken_per_word_sec": round(sum(durations) / len(durations), 3),
        "median_time_taken_per_word_sec": round(median_duration, 3),
        "p90_time_taken_per_word_sec": round(durations[p90_index], 3),
    }


def score_caregiver(session_id: str) -> DomainSignal:
    checklist = CAREGIVER_CHECKLISTS.get(session_id)
    if checklist is None:
        return DomainSignal(
            domain="caregiver_concern",
            band="green",
            score=85,
            reason="No caregiver checklist has been submitted in this demo session.",
        )

    concerns = [
        checklist.repeated_questions,
        checklist.missed_medication,
        checklist.missed_appointments,
        checklist.getting_lost,
        checklist.money_or_bills_difficulty,
        checklist.mood_or_personality_change == "yes",
        checklist.family_concerned,
    ]
    concern_count = sum(1 for concern in concerns if concern)
    if concern_count >= 3 or checklist.getting_lost:
        band: Band = "red"
        score = 45
    elif concern_count == 2:
        band = "amber"
        score = 65
    else:
        band = "green"
        score = 85

    return DomainSignal(
        domain="caregiver_concern",
        band=band,
        score=score,
        reason=f"Caregiver checklist includes {concern_count} reported concern(s).",
    )


def speech_rate(payload: VoiceTaskRequest) -> int:
    if payload.duration_sec <= 0:
        return 0
    return round(payload.estimated_word_count / (payload.duration_sec / 60))


def band_for_score(score: int) -> Band:
    if score >= 75:
        return "green"
    if score >= 50:
        return "amber"
    return "red"


def combine_bands(language: Band, caregiver: Band) -> Band:
    if caregiver == "red" and language in {"amber", "red"}:
        return "red"
    if "red" in {language, caregiver}:
        return "amber"
    if "amber" in {language, caregiver}:
        return "amber"
    return "green"


def fallback_picture_for_session(session_id: str) -> str:
    picture_ids = [
        "hdb-breakfast",
        "hawker-lunch",
        "clinic-waiting",
        "void-deck-exercise",
        "wet-market",
        "commute-station",
    ]
    index = abs(hash(session_id)) % len(picture_ids)
    return picture_ids[index]


def build_reminiscence_image_prompt(details: UserReminiscenceDetails) -> str:
    hobbies = ", ".join(details.hobbies) if details.hobbies else "everyday routines"
    places = ", ".join(details.familiar_places) if details.familiar_places else "familiar Singapore neighbourhood spaces"
    return (
        "Create a respectful, non-medical Picture Story image for an older adult "
        "to describe aloud. Make it feel familiar and reminiscence-friendly, "
        "based on these user details: "
        f"age band: {details.age_band or 'unknown'}; "
        f"preferred language/culture cue: {details.preferred_language or 'unknown'}; "
        f"childhood neighbourhood: {details.childhood_neighbourhood or 'unknown'}; "
        f"former occupation: {details.former_occupation or 'unknown'}; "
        f"hobbies/interests: {hobbies}; "
        f"familiar places: {places}; "
        f"family context: {details.family_context or 'unknown'}. "
        "The scene should show ordinary Singapore everyday life, multiple clear "
        "actions, objects, and relationships that are easy to describe. Avoid "
        "diagnosis themes, hospital distress, readable text, logos, political or "
        "religious symbols, and real-person likenesses. Use a warm realistic "
        "16:9 editorial-photo style."
    )
