from datetime import UTC, datetime
from html import escape
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

app = FastAPI(
    title="MindTrail SG API",
    description=(
        "API scaffold for possible cognitive-risk signal workflows. "
        "This is not a diagnosis."
    ),
    version="0.1.0",
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
    prediction = {
        "model": payload.model_name,
        "task": "picture_story_voice",
        "picture_id": payload.picture_id,
        "language_domain_score": signal.score,
        "band": signal.band,
        "risk_signal": signal.band,
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
