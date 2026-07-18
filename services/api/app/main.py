from __future__ import annotations

from datetime import datetime, timezone
from html import escape
from hashlib import sha256
import json
from pathlib import Path
from statistics import mean
from tempfile import NamedTemporaryFile
from time import time
from typing import Any, Dict, List, Literal, Optional, Tuple
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

try:
    from app.services.drawing_score_service import score_clock_drawing_payload
except ModuleNotFoundError:  # pragma: no cover - supports repo-root imports.
    from services.api.app.services.drawing_score_service import score_clock_drawing_payload

try:
    import joblib
    import numpy as np
    from PIL import Image, ImageDraw
    from skimage.feature import hog
except Exception:  # pragma: no cover - keeps the API bootable before ML deps are installed.
    joblib = None
    np = None
    Image = None
    ImageDraw = None
    hog = None

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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ROOT_DIR = Path(__file__).resolve().parents[3]
SESSION_LOG_DIR = ROOT_DIR / "services" / "api" / "session_logs"
MODEL_PATH = ROOT_DIR / "datasets" / "CDT-API-Network" / "clock_hog_svm.joblib"
DISCLAIMER = (
    "This is not a diagnosis. Please discuss new or worsening concerns with a "
    "healthcare professional."
)

SESSIONS: Dict[str, dict] = {}
NEXT_DRAWING_TASK_INDEX = 0

DRAWING_TASKS = [
    {"task_id": "clock_drawing", "instruction": "Draw a clock showing 10 past 11."},
    {"task_id": "clock_drawing", "instruction": "Draw a clock showing 20 past 8."},
    {"task_id": "clock_drawing", "instruction": "Draw a clock showing 5 past 2."},
    {"task_id": "clock_drawing", "instruction": "Draw a clock showing quarter past 9."},
    {"task_id": "clock_drawing", "instruction": "Draw a clock showing 25 to 4."},
    {"task_id": "clock_drawing", "instruction": "Draw a clock showing 10 to 7."},
]


def log_backend_json(event: str, payload: dict[str, object]) -> None:
    print(json.dumps({"event": event, **payload}, sort_keys=True), flush=True)


def should_try_repo_root_import(exc: ModuleNotFoundError) -> bool:
    return exc.name == "app"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def session_log_path(session_id: str) -> Path:
    safe_session_id = "".join(
        character if character.isalnum() or character in {"-", "_"} else "_"
        for character in session_id
    )
    return SESSION_LOG_DIR / f"{safe_session_id}.json"


def drawing_payload_without_coordinates(payload: object) -> object:
    if not isinstance(payload, dict):
        return payload

    sanitized = dict(payload)
    strokes = sanitized.pop("strokes", [])
    if isinstance(strokes, list):
        point_count = 0
        stroke_point_counts: list[int] = []
        for stroke in strokes:
            points = []
            if isinstance(stroke, dict):
                points = stroke.get("points", [])
            elif isinstance(stroke, list):
                points = stroke
            count = len(points) if isinstance(points, list) else 0
            point_count += count
            stroke_point_counts.append(count)
        sanitized["stroke_count"] = len(strokes)
        sanitized["point_count"] = point_count
        sanitized["stroke_point_counts"] = stroke_point_counts
    return sanitized


def session_without_coordinates(session: dict) -> dict:
    sanitized = dict(session)
    for key in ("drawing_score_payload", "drawing_task"):
        if key in sanitized:
            sanitized[key] = drawing_payload_without_coordinates(sanitized[key])
    return sanitized


def session_llm_context(session: dict) -> dict[str, object]:
    voice_prediction = session.get("voice_prediction") or {}
    voice_task = session.get("voice_task") or {}
    memory_result = session.get("memory_score_result") or {}
    drawing_result = session.get("drawing_score_result") or {}
    score = session.get("score") or combine_score(session)

    return {
        "session_id": session.get("session_id"),
        "generated_at": utc_now_iso(),
        "disclaimer": DISCLAIMER,
        "profile": session.get("profile"),
        "caregiver_checklist": session.get("checklist"),
        "voice_task": {
            "input": voice_task,
            "signal": session.get("voice_signal"),
            "prediction": voice_prediction,
            "transcription": voice_prediction.get("transcription")
            if isinstance(voice_prediction, dict)
            else None,
            "notes_for_llm": [
                "voice_metadata_score means the app used fallback metadata instead of audio model scoring.",
                "voice_audio_score means the app submitted an audio file; inspect warnings before trusting model output.",
            ],
        },
        "memory_task": {
            "input": session.get("memory_task"),
            "result": memory_result,
            "signal": session.get("memory_signal"),
        },
        "drawing_task": {
            "prompt": session.get("drawing_task_prompt"),
            "payload": drawing_payload_without_coordinates(
                session.get("drawing_score_payload") or session.get("drawing_task")
            ),
            "result": drawing_result,
            "signal": session.get("drawing_signal"),
            "notes_for_llm": [
                "Raw drawing coordinates are intentionally omitted from session JSON.",
                "Use stroke_count, point_count, stroke_point_counts, metadata, and model result for analysis.",
            ],
        },
        "overall_score": score,
        "llm_analysis_guardrails": [
            "Do not diagnose dementia.",
            "Describe domain-level risk signals only.",
            "Call out uncertain, fallback, missing, or unavailable model outputs.",
            "Recommend discussing new or worsening concerns with a healthcare professional.",
        ],
    }


def persist_session_json(session: dict, event: str) -> None:
    SESSION_LOG_DIR.mkdir(parents=True, exist_ok=True)
    session["updated_at"] = utc_now_iso()
    session["last_event"] = event
    snapshot = {
        "schema_version": "mindtrail_session_log_v1",
        "event": event,
        "session": session_without_coordinates(session),
        "llm_context": session_llm_context(session),
    }
    path = session_log_path(str(session["session_id"]))
    temp_path = path.with_suffix(".tmp")
    temp_path.write_text(json.dumps(snapshot, indent=2, sort_keys=True), encoding="utf-8")
    temp_path.replace(path)
    log_backend_json(
        "session_json_saved",
        {
            "session_id": session["session_id"],
            "event_name": event,
            "path": str(path),
        },
    )


class SessionStartRequest(BaseModel):
    age_band: str
    preferred_language: str
    education_band: str
    caregiver_assisted: bool


class ChecklistRequest(BaseModel):
    session_id: str
    repeated_questions: bool = False
    missed_medication: bool = False
    missed_appointments: bool = False
    getting_lost: bool = False
    money_or_bills_difficulty: bool = False
    mood_or_personality_change: str = "unsure"
    family_concerned: bool = False


class VoiceTaskRequest(BaseModel):
    session_id: str
    picture_id: str = "demo-picture"
    duration_sec: int = 40
    pause_count: int = 4
    long_pause_count: int = 1
    estimated_word_count: int = 65
    transcript: str = ""
    audio_uri: Optional[str] = None
    model_name: str = "Auralis/NatHACKS_Auralis"
    image_prompt: Optional[str] = None


class DrawingPoint(BaseModel):
    x: float
    y: float
    t: float = 0


class DrawingTaskRequest(BaseModel):
    session_id: str
    task_type: str = "clock_draw"
    completion_time_sec: int = 0
    clear_count: int = 0
    canvas_width: int = Field(default=320, gt=0)
    canvas_height: int = Field(default=320, gt=0)
    strokes: List[List[DrawingPoint]] = Field(default_factory=list)


class ClockDrawingCanvasRequest(BaseModel):
    width: float = 0
    height: float = 0


class ClockDrawingStrokeRequest(BaseModel):
    points: List[dict] = Field(default_factory=list)


class ClockDrawingScoreRequest(BaseModel):
    task_id: str = "clock_drawing"
    session_id: Optional[str] = None
    instruction: Optional[str] = None
    canvas: ClockDrawingCanvasRequest = Field(default_factory=ClockDrawingCanvasRequest)
    strokes: List[ClockDrawingStrokeRequest] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class ScoreRequest(BaseModel):
    session_id: str


class MemoryDevice(BaseModel):
    platform: str | None = None
    app_version: str | None = None


class MemoryStudyItem(BaseModel):
    person: str
    item: str


class MemoryQuestion(BaseModel):
    question_id: str
    type: Literal["person_for_item", "item_for_person", "not_shown_item"]
    prompt: str
    correct_answer: str
    selected_answer: str | None = None
    response_time_ms: int | None = Field(default=None, ge=0)


class MemoryScoreRequest(BaseModel):
    session_id: str
    task_id: str = "hawker_memory_v1"
    study_items: List[MemoryStudyItem]
    questions: List[MemoryQuestion]
    started_at: str | None = None
    completed_at: str | None = None
    device: MemoryDevice | None = None


class MemoryScoreResponse(BaseModel):
    task_id: str
    score: int
    max_score: int
    accuracy: float
    correct_count: int
    incorrect_count: int
    avg_response_time_ms: int | None
    flags: List[str]
    summary: str
    domain: Literal["memory_recall"]


def ensure_session(session_id: str) -> dict:
    if session_id not in SESSIONS:
        SESSIONS[session_id] = {"session_id": session_id, "created_at": time()}
    return SESSIONS[session_id]


def signal_payload(domain: str, band: str, score: int, reason: str) -> dict:
    return {"domain": domain, "band": band, "score": score, "reason": reason}


def drawing_task_for_session(session_id: str) -> dict:
    digest = sha256(session_id.encode("utf-8")).digest()
    task = DRAWING_TASKS[int.from_bytes(digest[:2], "big") % len(DRAWING_TASKS)]
    return dict(task)


def next_drawing_task() -> dict:
    global NEXT_DRAWING_TASK_INDEX

    task = DRAWING_TASKS[NEXT_DRAWING_TASK_INDEX % len(DRAWING_TASKS)]
    NEXT_DRAWING_TASK_INDEX += 1
    return dict(task)


def drawing_label_to_signal(label: str) -> dict:
    if label == "low_signal":
        return signal_payload(
            "visuospatial_planning",
            "green",
            82,
            "Clock drawing model found no strong visuospatial/planning signal in this session.",
        )
    if label == "medium_signal":
        return signal_payload(
            "visuospatial_planning",
            "amber",
            58,
            "Clock drawing model found a possible visuospatial/planning signal. Repeat later or discuss if new.",
        )
    return signal_payload(
        "visuospatial_planning",
        "red",
        38,
        "Clock drawing model found a higher visuospatial/planning signal. Consider GP follow-up if new or worsening.",
    )


def render_strokes_to_image(payload: DrawingTaskRequest):
    if Image is None or ImageDraw is None:
        return None

    size = 512
    image = Image.new("L", (size, size), 255)
    draw = ImageDraw.Draw(image)
    scale_x = size / payload.canvas_width
    scale_y = size / payload.canvas_height

    for stroke in payload.strokes:
        if len(stroke) == 1:
            point = stroke[0]
            x = point.x * scale_x
            y = point.y * scale_y
            draw.ellipse((x - 2, y - 2, x + 2, y + 2), fill=0)
            continue

        for start, end in zip(stroke, stroke[1:]):
            draw.line(
                (
                    start.x * scale_x,
                    start.y * scale_y,
                    end.x * scale_x,
                    end.y * scale_y,
                ),
                fill=0,
                width=6,
            )

    return image


def predict_clock_signal(payload: DrawingTaskRequest) -> Tuple[str, str]:
    if joblib is None or np is None or hog is None:
        return heuristic_clock_signal(payload), "heuristic_missing_dependencies"

    if not MODEL_PATH.exists():
        return heuristic_clock_signal(payload), "heuristic_missing_model"

    image = render_strokes_to_image(payload)
    if image is None:
        return heuristic_clock_signal(payload), "heuristic_render_unavailable"

    model_payload = joblib.load(MODEL_PATH)
    image_size = model_payload["image_size"]
    image = image.resize((image_size, image_size))
    arr = np.array(image).astype("float32") / 255.0
    features = hog(
        arr,
        orientations=9,
        pixels_per_cell=(8, 8),
        cells_per_block=(2, 2),
        block_norm="L2-Hys",
    )
    prediction = model_payload["model"].predict(features.reshape(1, -1))[0]
    return str(prediction), "clock_hog_svm"


def heuristic_clock_signal(payload: DrawingTaskRequest) -> str:
    point_count = sum(len(stroke) for stroke in payload.strokes)
    stroke_count = len(payload.strokes)
    if point_count < 40 or stroke_count < 4:
        return "higher_signal"
    if payload.clear_count > 1 or payload.completion_time_sec > 120:
        return "medium_signal"
    return "low_signal"


def caregiver_signal(checklist: Optional[dict]) -> dict:
    if not checklist:
        return signal_payload(
            "caregiver_concern",
            "green",
            82,
            "No caregiver checklist concerns were submitted in this demo session.",
        )

    concern_keys = [
        "repeated_questions",
        "missed_medication",
        "missed_appointments",
        "getting_lost",
        "money_or_bills_difficulty",
        "family_concerned",
    ]
    concern_count = sum(1 for key in concern_keys if checklist.get(key))
    if checklist.get("mood_or_personality_change") == "yes":
        concern_count += 1

    if concern_count >= 3:
        return signal_payload(
            "caregiver_concern",
            "red",
            42,
            "Caregiver checklist included several new or worsening concerns.",
        )
    if concern_count >= 1:
        return signal_payload(
            "caregiver_concern",
            "amber",
            62,
            "Caregiver checklist included one or two concerns worth monitoring.",
        )
    return signal_payload(
        "caregiver_concern",
        "green",
        88,
        "Caregiver checklist did not include strong concerns in this session.",
    )


def combine_score(session: dict) -> dict:
    voice = session.get(
        "voice_signal",
        signal_payload(
            "language",
            "green",
            80,
            "Demo voice task metadata did not show a strong language signal.",
        ),
    )
    drawing = session.get(
        "drawing_signal",
        signal_payload(
            "visuospatial_planning",
            "amber",
            58,
            "Clock drawing task has not been completed in this session.",
        ),
    )
    caregiver = caregiver_signal(session.get("checklist"))
    memory = session.get(
        "memory_signal",
        signal_payload(
            "memory_recall",
            "green",
            80,
            "Hawker Memory task has not been completed in this session.",
        ),
    )
    signals = {
        "language": voice,
        "memory_recall": memory,
        "visuospatial_planning": drawing,
        "caregiver_concern": caregiver,
    }
    bands = [item["band"] for item in signals.values()]
    overall_band = "red" if "red" in bands else "amber" if "amber" in bands else "green"
    return {
        "session_id": session["session_id"],
        "overall_band": overall_band,
        "domain_signals": signals,
        "recommendations": [
            "Discuss new or worsening concerns with a GP.",
            "Bring this report to the next appointment.",
            "Repeat the check in 4-6 weeks to track change.",
        ],
        "disclaimer": DISCLAIMER,
    }


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/session/start")
def session_start(payload: SessionStartRequest) -> Dict[str, Any]:
    session_id = f"demo-{uuid4().hex[:10]}"
    drawing_task = next_drawing_task()
    SESSIONS[session_id] = {
        "session_id": session_id,
        "created_at": time(),
        "profile": payload.model_dump(),
        "drawing_task_prompt": drawing_task,
    }
    persist_session_json(SESSIONS[session_id], "session_started")
    return {"session_id": session_id, "drawing_task": drawing_task}


@app.post("/caregiver-checklist")
def caregiver_checklist(payload: ChecklistRequest) -> Dict[str, bool]:
    session = ensure_session(payload.session_id)
    session["checklist"] = payload.model_dump()
    persist_session_json(session, "caregiver_checklist_saved")
    return {"saved": True}


@app.post("/task/voice")
def task_voice(payload: VoiceTaskRequest) -> dict:
    session = ensure_session(payload.session_id)
    voice_prediction = voice_prediction_from_metadata(payload)
    band = voice_prediction["band"]
    score = int(voice_prediction["language_domain_score"])
    reason = (
        "Picture Story Voice showed speech-language features from the demo "
        f"pipeline: {payload.long_pause_count} long pauses, "
        f"{payload.estimated_word_count} estimated words, and "
        f"{speech_rate(payload)} words per minute."
    )
    session["voice_task"] = payload.model_dump()
    session["voice_signal"] = signal_payload("language", band, score, reason)
    session["voice_signal"]["model"] = payload.model_name
    session["voice_signal"]["disclaimer"] = DISCLAIMER
    session["voice_prediction"] = voice_prediction
    persist_session_json(session, "voice_metadata_scored")
    log_backend_json(
        "voice_metadata_score",
        {
            "session_id": payload.session_id,
            "picture_id": payload.picture_id,
            "model": payload.model_name,
            "voice_band": band,
            "voice_score": score,
            "features": voice_prediction["features"],
            "disclaimer": DISCLAIMER,
        },
    )
    return {
        "saved": True,
        "voice_signal": session["voice_signal"],
        "prediction": voice_prediction,
    }


@app.post("/task/voice/audio")
async def task_voice_audio(
    session_id: str = Form("demo-session-001"),
    picture_id: str = Form("demo-picture"),
    image_prompt: str | None = Form(None),
    file: UploadFile = File(...),
) -> dict:
    content = await file.read()
    raw_prediction = await predict_audio_bytes(content, file.filename)
    transcription = await transcribe_audio_bytes(content, file.filename)
    signal = signal_from_auralis(raw_prediction)
    prediction = {
        "model": "Auralis/NatHACKS_Auralis",
        "task": "picture_story_voice",
        "picture_id": picture_id,
        "image_prompt": image_prompt,
        "language_domain_score": signal["score"],
        "band": signal["band"],
        "risk_signal": signal["band"],
        "raw_model_output": raw_prediction,
        "transcription": transcription,
        "clinical_claim": "possible language-domain signal only",
        "disclaimer": DISCLAIMER,
    }
    session = ensure_session(session_id)
    session["voice_task"] = {
        "session_id": session_id,
        "picture_id": picture_id,
        "image_prompt": image_prompt,
        "filename": file.filename,
        "audio_bytes_received": len(content),
        "audio_content_type": file.content_type,
        "submission_type": "audio_upload",
    }
    session["voice_signal"] = signal
    session["voice_prediction"] = prediction
    persist_session_json(session, "voice_audio_scored")
    log_backend_json(
        "voice_audio_score",
        {
            "session_id": session_id,
            "picture_id": picture_id,
            "image_prompt": image_prompt,
            "filename": file.filename,
            "voice_band": signal.get("band"),
            "voice_score": signal.get("score"),
            "model": signal.get("model"),
            "auralis_top_label": raw_prediction.get("top_label"),
            "auralis_top_score": raw_prediction.get("top_score"),
            "whisper_model": transcription.get("model"),
            "whisper_word_count": transcription.get("word_count"),
            "whisper_warning": transcription.get("warning"),
            "disclaimer": DISCLAIMER,
        },
    )
    return {
        "saved": True,
        "voice_signal": signal,
        "prediction": prediction,
    }


@app.post("/transcribe/whisper")
async def transcribe_whisper(file: UploadFile = File(...)) -> dict[str, object]:
    try:
        try:
            from app.whisper_service import transcribe_upload
        except ModuleNotFoundError as exc:
            if not should_try_repo_root_import(exc):
                raise
            from services.api.app.whisper_service import transcribe_upload
    except Exception as exc:
        log_backend_json(
            "whisper_transcribe",
            {
                "filename": file.filename,
                "loaded": False,
                "warning": str(exc),
            },
        )
        raise HTTPException(status_code=503, detail=f"Whisper unavailable: {exc}") from exc

    result = await transcribe_upload(file)
    log_backend_json(
        "whisper_transcribe",
        {
            "filename": file.filename,
            "loaded": True,
            "model": result.get("model"),
            "duration_sec": result.get("duration_sec"),
            "word_count": result.get("word_count"),
            "language": result.get("language"),
            "language_probability": result.get("language_probability"),
        },
    )
    return result


@app.get("/model/auralis/status")
def auralis_status() -> dict[str, object]:
    try:
        try:
            from app.auralis_model import MODEL_ID, get_auralis_model
        except ModuleNotFoundError as exc:
            if not should_try_repo_root_import(exc):
                raise
            from services.api.app.auralis_model import MODEL_ID, get_auralis_model

        model = get_auralis_model()
    except Exception as exc:
        response = {
            "model": "Auralis/NatHACKS_Auralis",
            "loaded": False,
            "warning": str(exc),
        }
        log_backend_json("auralis_status", response)
        return response

    response = {
        "model": MODEL_ID,
        "loaded": True,
        "device": str(model.device),
        "labels": model.config.id2label,
        "warning": (
            "Model output is a research signal only. It is not a diagnosis and "
            "has not been locally clinically validated for MindTrail SG."
        ),
    }
    log_backend_json("auralis_status", response)
    return response


@app.get("/model/whisper/status")
def whisper_status() -> dict[str, object]:
    try:
        try:
            from app.whisper_service import WHISPER_MODEL_SIZE, get_whisper_transcriber
        except ModuleNotFoundError as exc:
            if not should_try_repo_root_import(exc):
                raise
            from services.api.app.whisper_service import WHISPER_MODEL_SIZE, get_whisper_transcriber

        get_whisper_transcriber()
    except Exception as exc:
        response = {
            "model": "faster-whisper/tiny",
            "loaded": False,
            "warning": str(exc),
        }
        log_backend_json("whisper_status", response)
        return response

    response = {
        "model": f"faster-whisper/{WHISPER_MODEL_SIZE}",
        "loaded": True,
        "warning": (
            "Whisper transcription is approximate and should be reviewed before "
            "clinical or caregiver use."
        ),
    }
    log_backend_json("whisper_status", response)
    return response


def voice_prediction_from_metadata(payload: VoiceTaskRequest) -> dict[str, object]:
    score = voice_score_from_metadata(payload)
    band = voice_band_for_score(score)
    return {
        "model": payload.model_name,
        "task": "picture_story_voice",
        "picture_id": payload.picture_id,
        "language_domain_score": score,
        "band": band,
        "risk_signal": band,
        "features": {
            "duration_sec": payload.duration_sec,
            "pause_count": payload.pause_count,
            "long_pause_count": payload.long_pause_count,
            "estimated_word_count": payload.estimated_word_count,
            "speech_rate_words_per_min": speech_rate(payload),
        },
        "clinical_claim": "possible language-domain signal only",
        "disclaimer": DISCLAIMER,
    }


def voice_score_from_metadata(payload: VoiceTaskRequest) -> int:
    score = 100
    score -= min(payload.long_pause_count * 8, 32)
    score -= min(max(payload.pause_count - 4, 0) * 3, 24)
    if payload.estimated_word_count < 30:
        score -= 20
    elif payload.estimated_word_count < 55:
        score -= 10
    if payload.duration_sec < 20:
        score -= 15

    words_per_minute = speech_rate(payload)
    if words_per_minute < 65:
        score -= 14
    elif words_per_minute < 90:
        score -= 7
    return max(0, min(100, score))


def voice_band_for_score(score: int) -> str:
    if score >= 75:
        return "green"
    if score >= 50:
        return "amber"
    return "red"


def speech_rate(payload: VoiceTaskRequest) -> int:
    if payload.duration_sec <= 0:
        return 0
    return round(payload.estimated_word_count / (payload.duration_sec / 60))


async def predict_audio_bytes(content: bytes, filename: str | None) -> dict[str, object]:
    suffix = Path(filename or "audio.wav").suffix or ".wav"
    with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(content)
        temp_path = Path(temp_file.name)

    try:
        try:
            from app.auralis_model import get_auralis_model
        except ModuleNotFoundError as exc:
            if not should_try_repo_root_import(exc):
                raise
            from services.api.app.auralis_model import get_auralis_model

        return get_auralis_model().predict_path(temp_path)
    except Exception as exc:
        return {
            "model": "Auralis/NatHACKS_Auralis",
            "loaded": False,
            "warning": f"Auralis unavailable: {exc}",
            "top_label": "unavailable",
            "top_score": None,
            "scores": [],
        }
    finally:
        temp_path.unlink(missing_ok=True)


async def transcribe_audio_bytes(content: bytes, filename: str | None) -> dict[str, object]:
    suffix = Path(filename or "audio.wav").suffix or ".wav"
    with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(content)
        temp_path = Path(temp_file.name)

    try:
        try:
            from app.whisper_service import get_whisper_transcriber
        except ModuleNotFoundError as exc:
            if not should_try_repo_root_import(exc):
                raise
            from services.api.app.whisper_service import get_whisper_transcriber

        return get_whisper_transcriber().transcribe_path(temp_path)
    except Exception as exc:
        return {
            "model": "faster-whisper/tiny",
            "warning": f"Whisper unavailable: {exc}",
            "text": "",
            "word_count": 0,
        }
    finally:
        temp_path.unlink(missing_ok=True)


def signal_from_auralis(raw_prediction: dict[str, object]) -> dict:
    if raw_prediction.get("loaded") is False:
        signal = signal_payload(
            "language",
            "amber",
            50,
            (
                "Audio was received, but the Auralis model was not available locally. "
                "This response is an uncertain language-domain fallback, not a diagnosis."
            ),
        )
        signal["model"] = "Auralis/NatHACKS_Auralis"
        signal["warning"] = raw_prediction.get("warning")
        signal["disclaimer"] = DISCLAIMER
        return signal

    audio_quality = raw_prediction.get("audio_quality")
    if isinstance(audio_quality, dict) and audio_quality.get("is_silent") is True:
        signal = signal_payload(
            "language",
            "amber",
            50,
            (
                "No usable speech was detected in the recording, so the "
                "Auralis model was not used for a cognitive-risk signal. "
                "Please retry with audible speech if this was unintentional."
            ),
        )
        signal["model"] = "Auralis/NatHACKS_Auralis"
        signal["disclaimer"] = DISCLAIMER
        return signal

    scores = raw_prediction.get("scores", [])
    dementia_score = 0.0
    if isinstance(scores, list):
        for item in scores:
            if isinstance(item, dict) and item.get("label") == "dementia":
                dementia_score = float(item.get("score", 0.0))
                break

    score = round((1 - dementia_score) * 100)
    band = voice_band_for_score(score)
    signal = signal_payload(
        "language",
        band,
        score,
        (
            "Auralis/NatHACKS_Auralis returned an audio-classification research "
            f"signal with raw dementia-label probability {dementia_score:.2f}. "
            "Use this only as a possible language-domain signal."
        ),
    )
    signal["model"] = "Auralis/NatHACKS_Auralis"
    signal["disclaimer"] = DISCLAIMER
    return signal


@app.post("/task/drawing")
def task_drawing(payload: DrawingTaskRequest) -> dict:
    session = ensure_session(payload.session_id)
    label, source = predict_clock_signal(payload)
    signal = drawing_label_to_signal(label)
    session["drawing_task"] = payload.model_dump()
    session["drawing_signal"] = signal
    session["drawing_model_label"] = label
    session["drawing_model_source"] = source
    persist_session_json(session, "drawing_task_saved")
    return {
        "saved": True,
        "drawing_signal": signal,
        "model_label": label,
        "model_source": source,
        "disclaimer": DISCLAIMER,
    }


@app.post("/task/drawing/score")
def task_drawing_score(payload: ClockDrawingScoreRequest) -> dict:
    payload_dict = payload.model_dump()
    if payload.session_id:
        session = ensure_session(payload.session_id)
        drawing_task = session.get("drawing_task_prompt") or drawing_task_for_session(payload.session_id)
        session["drawing_task_prompt"] = drawing_task
        payload_dict["task_id"] = drawing_task["task_id"]
        payload_dict["instruction"] = drawing_task["instruction"]
    elif not payload_dict.get("instruction"):
        payload_dict["instruction"] = DRAWING_TASKS[0]["instruction"]

    result = score_clock_drawing_payload(payload_dict)
    if payload.session_id:
        session["drawing_score_payload"] = payload_dict
        session["drawing_score_result"] = result
        if isinstance(result, dict) and result.get("signal_band"):
            session["drawing_signal"] = drawing_label_to_signal(str(result["signal_band"]))
        persist_session_json(session, "drawing_scored")
    return result


@app.post("/task/memory/score", response_model=MemoryScoreResponse)
def score_memory_task(payload: MemoryScoreRequest) -> MemoryScoreResponse:
    if payload.task_id != "hawker_memory_v1":
        raise HTTPException(status_code=400, detail="Unsupported memory task_id.")

    if not payload.questions:
        raise HTTPException(status_code=400, detail="At least one recall question is required.")

    correct_count = sum(
        1
        for question in payload.questions
        if question.selected_answer == question.correct_answer
    )
    max_score = len(payload.questions)
    incorrect_count = max_score - correct_count
    accuracy = correct_count / max_score
    response_times = [
        question.response_time_ms
        for question in payload.questions
        if question.response_time_ms is not None
    ]
    avg_response_time_ms = round(mean(response_times)) if response_times else None
    flags: List[str] = []

    if accuracy < 0.6:
        flags.append("low_accuracy")
    if avg_response_time_ms is not None and avg_response_time_ms < 900:
        flags.append("very_fast_responses")

    missed_associations = sum(
        1
        for question in payload.questions
        if question.type != "not_shown_item"
        and question.selected_answer != question.correct_answer
    )
    if missed_associations >= 3:
        flags.append("many_missed_associations")

    if accuracy >= 0.8:
        summary = "Good recall of the hawker orders."
    elif accuracy >= 0.6:
        summary = "Some hawker order details were recalled; a few associations were missed."
    else:
        summary = "Several hawker order associations were missed in this game."

    result = MemoryScoreResponse(
        task_id=payload.task_id,
        score=correct_count,
        max_score=max_score,
        accuracy=accuracy,
        correct_count=correct_count,
        incorrect_count=incorrect_count,
        avg_response_time_ms=avg_response_time_ms,
        flags=flags,
        summary=summary,
        domain="memory_recall",
    )
    session = ensure_session(payload.session_id)
    session["memory_task"] = payload.model_dump()
    session["memory_score_result"] = result.model_dump()
    session["memory_signal"] = signal_payload(
        "memory_recall",
        "green" if accuracy >= 0.6 else "amber",
        round(accuracy * 100),
        summary,
    )
    persist_session_json(session, "memory_scored")
    log_backend_json(
        "memory_score",
        {
            "session_id": payload.session_id,
            "task_id": payload.task_id,
            "score": correct_count,
            "max_score": max_score,
            "accuracy": round(accuracy, 3),
            "avg_response_time_ms": avg_response_time_ms,
            "flags": flags,
            "domain": "memory_recall",
            "disclaimer": DISCLAIMER,
        },
    )
    return result


@app.post("/score")
def score(payload: ScoreRequest) -> dict:
    session = ensure_session(payload.session_id)
    session["score"] = combine_score(session)
    persist_session_json(session, "overall_score_generated")
    return session["score"]


def load_session_for_report(session_id: str) -> dict:
    if session_id in SESSIONS:
        return SESSIONS[session_id]

    path = session_log_path(session_id)
    if path.exists():
        payload = json.loads(path.read_text(encoding="utf-8"))
        saved_session = payload.get("session")
        if isinstance(saved_session, dict):
            SESSIONS[session_id] = saved_session
            return saved_session

    return ensure_session(session_id)


def as_dict(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def number_or_default(value: object, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def percent_text(value: float | None) -> str:
    if value is None:
        return "not available"
    return f"{round(value * 100)}%"


def score_text(value: float) -> str:
    return str(int(round(max(0, min(100, value)))))


def classify_overall_signal(score_value: int) -> str:
    if score_value < 60:
        return "follow-up suggested"
    if score_value < 75:
        return "monitor and repeat"
    return "no strong signal in this demo"


def get_nested(payload: dict, path: list[str], default: object = None) -> object:
    current: object = payload
    for key in path:
        if not isinstance(current, dict):
            return default
        current = current.get(key)
    return default if current is None else current


def report_context_from_session(session: dict) -> dict[str, object]:
    llm_context = session_llm_context(session)
    drawing = as_dict(llm_context.get("drawing_task"))
    drawing_result = as_dict(drawing.get("result"))
    drawing_signal = as_dict(drawing.get("signal"))
    memory = as_dict(llm_context.get("memory_task"))
    memory_result = as_dict(memory.get("result"))
    memory_signal = as_dict(memory.get("signal"))
    voice = as_dict(llm_context.get("voice_task"))
    voice_prediction = as_dict(voice.get("prediction"))
    voice_signal = as_dict(voice.get("signal"))
    transcription = as_dict(voice_prediction.get("transcription") or voice.get("transcription"))
    raw_voice = as_dict(voice_prediction.get("raw_model_output"))

    clock_score = number_or_default(drawing_signal.get("score"), 58)
    memory_accuracy = number_or_default(memory_result.get("accuracy"), 0.0)
    memory_score = number_or_default(memory_signal.get("score"), memory_accuracy * 100)
    monitoring_probability = monitoring_probability_from_voice(raw_voice, voice_prediction)
    if monitoring_probability is None:
        speech_score = number_or_default(voice_signal.get("score"), 50)
    else:
        speech_score = 100 - (monitoring_probability * 100)

    overall_score = round(clock_score * 0.35 + memory_score * 0.30 + speech_score * 0.35)
    summary = (
        "The combined demo profile suggests follow-up is worthwhile, mainly because the "
        "clock drawing and speech/language signals need attention, while hawker memory "
        "recall was a relative strength. This is a risk-signal summary only, not a diagnosis."
        if overall_score < 60
        else "The combined demo profile shows mixed domain-level signals. Review any new or persistent concerns with a healthcare professional."
    )

    return {
        "session_id": session.get("session_id"),
        "profile": llm_context.get("profile"),
        "overall_score": int(max(0, min(100, overall_score))),
        "overall_label": classify_overall_signal(int(overall_score)),
        "overall_summary": summary,
        "clock": {
            "score": clock_score,
            "task_completed": bool(drawing_result.get("task_completed")),
            "signal_band": drawing_result.get("signal_band") or drawing_signal.get("band"),
            "confidence": number_or_default(drawing_result.get("confidence"), 0.0),
            "domains": drawing_result.get("domains") or ["visuospatial", "planning"],
            "reason": drawing_signal.get("reason") or drawing_result.get("explanation"),
            "summary": clock_summary(drawing_result, drawing_signal),
            "trajectory": [72, 66, 55, int(round(clock_score))],
        },
        "memory": {
            "score": memory_score,
            "raw_score": memory_result.get("score"),
            "max_score": memory_result.get("max_score"),
            "accuracy": memory_accuracy,
            "correct_count": memory_result.get("correct_count"),
            "incorrect_count": memory_result.get("incorrect_count"),
            "avg_response_time_ms": memory_result.get("avg_response_time_ms"),
            "reason": memory_signal.get("reason") or memory_result.get("summary"),
            "summary": memory_summary(memory_result),
            "trajectory": [88, 92, 96, int(round(memory_score))],
        },
        "voice": {
            "score": speech_score,
            "transcript": transcription.get("text") or "",
            "word_count": transcription.get("word_count"),
            "monitoring_probability": monitoring_probability,
            "signal_band": voice_signal.get("band") or voice_prediction.get("band"),
            "reason": voice_signal.get("reason"),
            "summary": voice_summary(transcription, monitoring_probability, voice_signal),
            "trajectory": [70, 58, 42, int(round(max(0, min(100, speech_score))))],
        },
    }


def monitoring_probability_from_voice(
    raw_voice: dict,
    voice_prediction: dict,
) -> float | None:
    scores = raw_voice.get("scores")
    if isinstance(scores, list):
        for item in scores:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label", "")).lower()
            if label in {"monitoring", "monitoring_pattern", "dementia"}:
                return max(0.0, min(1.0, number_or_default(item.get("score"), 0.0)))

    top_label = str(raw_voice.get("top_label", "")).lower()
    if top_label in {"monitoring", "monitoring_pattern", "dementia"}:
        top_score = raw_voice.get("top_score")
        if top_score is not None:
            return max(0.0, min(1.0, number_or_default(top_score, 0.0)))

    model_probability = voice_prediction.get("monitoring_probability")
    if model_probability is not None:
        return max(0.0, min(1.0, number_or_default(model_probability, 0.0)))
    return None


def clock_summary(drawing_result: dict, drawing_signal: dict) -> str:
    completed = bool(drawing_result.get("task_completed"))
    confidence = number_or_default(drawing_result.get("confidence"), 0.0)
    signal_band = drawing_result.get("signal_band") or drawing_signal.get("band") or "uncertain"
    if completed and signal_band in {"higher_signal", "red"}:
        return (
            "The Clock Drawing task was completed and showed a stronger visuospatial/planning "
            f"signal with {percent_text(confidence)} confidence, warranting attention if this is new or persistent."
        )
    if completed:
        return (
            "The Clock Drawing task was completed. The model output should be interpreted as a "
            "visuospatial/planning risk signal rather than a diagnosis."
        )
    return "The Clock Drawing task was not complete enough for a confident interpretation."


def memory_summary(memory_result: dict) -> str:
    score_value = memory_result.get("score")
    max_score = memory_result.get("max_score")
    correct_count = memory_result.get("correct_count")
    avg_ms = memory_result.get("avg_response_time_ms")
    seconds = number_or_default(avg_ms, 0.0) / 1000 if avg_ms is not None else None
    if score_value == max_score and max_score:
        time_part = f" and average response time was about {seconds:.1f} seconds" if seconds else ""
        return (
            f"Memory recall was strong: all {max_score} questions were answered correctly"
            f"{time_part}."
        )
    if max_score:
        return (
            f"Memory recall score was {score_value}/{max_score}, with {correct_count} correct responses. "
            "Review missed associations as a domain-level memory signal."
        )
    return "Memory recall data was not available for this session."


def voice_summary(
    transcription: dict,
    monitoring_probability: float | None,
    voice_signal: dict,
) -> str:
    transcript = str(transcription.get("text") or "").strip()
    if transcript:
        scene = "a lunch-time family scene" if "lunch" in transcript.lower() or "family" in transcript.lower() else "the picture scene"
        detail_note = "fewer object/action details were included"
        model_note = (
            f"model output showed more monitoring characteristics than typical-session characteristics ({percent_text(monitoring_probability)})"
            if monitoring_probability is not None
            else "model output should be interpreted cautiously because a monitoring probability was not available"
        )
        return (
            f"Speech captured {scene} and used simple personal vocabulary about spending time together; "
            f"{detail_note}; {model_note}."
        )
    reason = voice_signal.get("reason")
    if reason:
        return f"Speech/language scoring used available model or fallback metadata: {reason}"
    return "Speech/language data was limited for this session."


def chart_svg(title: str, values: list[int], color: str) -> str:
    clamped = [max(0, min(100, int(value))) for value in values]
    left_positions = [12, 37, 62, 87]
    bars = "".join(
        f'<span class="bar" style="left: {left_positions[index]}%; height: {value}%"></span>'
        for index, value in enumerate(clamped[:4])
    )
    points = "".join(
        (
            f'<span class="point{" current" if index == len(clamped[:4]) - 1 else ""}" '
            f'style="left: {left_positions[index]}%; top: {100 - value}%"></span>'
        )
        for index, value in enumerate(clamped[:4])
    )
    return f"""
    <article class="chart-card">
      <h3>{escape(title)}</h3>
      <p class="chart-note">Score trend: {', '.join(str(value) for value in clamped[:4])}</p>
      <div class="chart" aria-label="{escape(title)} trajectory">
        <span class="grid-line"></span>
        <span class="grid-line"></span>
        <span class="grid-line"></span>
        {bars}
        {points}
      </div>
      <div class="chart-labels">
        <span>S1</span><span>S2</span><span>S3</span><span>Today</span>
      </div>
    </article>
    """


def metric(label: str, value: object) -> str:
    return f"<div class=\"metric\"><span>{escape(label)}</span><strong>{escape(str(value))}</strong></div>"


def render_cognitive_report(session: dict) -> str:
    context = report_context_from_session(session)
    clock = as_dict(context["clock"])
    memory = as_dict(context["memory"])
    voice = as_dict(context["voice"])
    profile = as_dict(context.get("profile"))
    session_id = str(context.get("session_id") or "")
    overall_score = int(context["overall_score"])
    monitoring_probability = voice.get("monitoring_probability")
    transcript = str(voice.get("transcript") or "").strip()
    transcript_html = (
        f'<blockquote class="transcript">{escape(transcript)}</blockquote>'
        if transcript
        else '<p class="muted">No transcript text was available for this session.</p>'
    )

    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MindTrail SG Cognitive Health Report</title>
    <style>
      :root {{
        color-scheme: light;
        --ink: #17202a;
        --muted: #58656c;
        --line: #dbe3df;
        --paper: #ffffff;
        --wash: #f5f7f2;
        --teal: #1f6f64;
        --teal-soft: #dff2ec;
        --gold: #b7791f;
        --gold-soft: #fff4d6;
        --rose: #b42318;
        --rose-soft: #fee4df;
        --blue: #2f5f98;
        --blue-soft: #e7eef8;
      }}
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        background: var(--wash);
        color: var(--ink);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }}
      main {{
        width: min(1120px, calc(100% - 32px));
        margin: 0 auto;
        padding: 28px 0 40px;
      }}
      h1, h2, h3, p {{ margin: 0; }}
      .topbar {{
        display: grid;
        grid-template-columns: minmax(220px, 1fr) minmax(220px, 300px);
        gap: 18px;
        align-items: stretch;
      }}
      .panel, .test-card, .chart-card {{
        background: var(--paper);
        border: 1px solid var(--line);
        border-radius: 8px;
      }}
      .hero {{
        padding: 24px;
      }}
      .kicker, .label {{
        color: var(--teal);
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0;
        text-transform: uppercase;
      }}
      h1 {{
        margin-top: 8px;
        font-size: clamp(28px, 4vw, 44px);
        line-height: 1.04;
        letter-spacing: 0;
      }}
      .meta {{
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 18px;
      }}
      .pill {{
        display: inline-flex;
        min-height: 30px;
        align-items: center;
        border-radius: 999px;
        padding: 5px 10px;
        background: #eef3f0;
        color: #35443d;
        font-size: 13px;
        font-weight: 700;
      }}
      .score-panel {{
        position: relative;
        display: grid;
        place-items: center;
        min-height: 250px;
        padding: 20px;
        overflow: hidden;
      }}
      .score-ring {{
        --score: {overall_score};
        width: 178px;
        aspect-ratio: 1;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background:
          radial-gradient(circle closest-side, #ffffff 72%, transparent 73%),
          conic-gradient(var(--rose) calc(var(--score) * 1%), #e8ece7 0);
      }}
      .score-value {{
        font-size: 46px;
        line-height: 1;
        font-weight: 900;
      }}
      .score-label {{
        margin-top: 10px;
        color: var(--muted);
        font-size: 14px;
        font-weight: 800;
        text-align: center;
        text-transform: uppercase;
      }}
      .summary {{
        margin-top: 18px;
        padding: 20px;
        border-left: 6px solid var(--gold);
      }}
      .summary h2, .section-title {{
        font-size: 22px;
        line-height: 1.2;
      }}
      .summary p {{
        margin-top: 10px;
        color: #33443a;
        font-size: 16px;
        line-height: 1.55;
      }}
      .section-head {{
        margin-top: 26px;
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 18px;
      }}
      .section-head p {{
        color: var(--muted);
        font-size: 14px;
      }}
      .tests, .grid {{
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-top: 14px;
      }}
      .test-card, .card {{
        display: flex;
        min-height: 252px;
        flex-direction: column;
        padding: 18px;
      }}
      .test-title-row {{
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }}
      .test-card h3 {{ font-size: 18px; line-height: 1.2; }}
      .band {{
        flex: 0 0 auto;
        border-radius: 999px;
        padding: 5px 9px;
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
      }}
      .band.monitor {{ background: var(--gold-soft); color: #875a14; }}
      .band.strong {{ background: var(--teal-soft); color: #0e5f52; }}
      .band.attention {{ background: var(--rose-soft); color: var(--rose); }}
      .domain {{
        margin-top: 8px;
        color: var(--muted);
        font-size: 13px;
        font-weight: 800;
        text-transform: uppercase;
      }}
      .one-line {{
        margin-top: 14px;
        color: #26362f;
        font-size: 16px;
        line-height: 1.45;
      }}
      .metric-row {{
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        margin-top: auto;
        padding-top: 16px;
      }}
      .metric {{
        min-height: 66px;
        border-radius: 8px;
        padding: 10px;
        background: #f7faf8;
        border: 1px solid #e5ebe8;
      }}
      .metric span {{ display: block; color: var(--muted); font-size: 12px; font-weight: 700; }}
      .metric strong {{ display: block; margin-top: 5px; font-size: 20px; line-height: 1.1; }}
      .charts {{
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-top: 14px;
      }}
      .chart-card {{ padding: 16px; }}
      .chart-card h3 {{ font-size: 16px; }}
      .chart-note {{ margin-top: 5px; color: var(--muted); font-size: 12px; }}
      .chart {{
        position: relative;
        height: 174px;
        margin-top: 16px;
        border-left: 1px solid #cfd8d3;
        border-bottom: 1px solid #cfd8d3;
      }}
      .grid-line {{
        position: absolute;
        right: 0;
        left: 0;
        height: 1px;
        background: #edf1ef;
      }}
      .grid-line:nth-child(1) {{ top: 0; }}
      .grid-line:nth-child(2) {{ top: 33.33%; }}
      .grid-line:nth-child(3) {{ top: 66.66%; }}
      .point {{
        position: absolute;
        z-index: 2;
        width: 14px;
        height: 14px;
        margin: -7px 0 0 -7px;
        border: 3px solid #ffffff;
        border-radius: 50%;
        background: var(--blue);
        box-shadow: 0 0 0 1px rgba(23, 32, 42, 0.16);
      }}
      .point.current {{
        width: 18px;
        height: 18px;
        margin: -9px 0 0 -9px;
        background: var(--gold);
      }}
      .bar {{
        position: absolute;
        bottom: 0;
        width: 10px;
        transform: translateX(-5px);
        border-radius: 999px 999px 0 0;
        background: var(--blue-soft);
      }}
      .chart-labels {{
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        margin-top: 8px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        text-align: center;
      }}
      .transcript {{
        margin: 12px 0 0;
        border-left: 4px solid var(--teal);
        padding: 10px 14px;
        background: #f4f8f8;
        color: #24333a;
      }}
      .note-strip, .safety {{
        margin-top: 22px;
        padding: 16px;
        background: #fffaf0;
        border: 1px solid #f3d08f;
        border-radius: 8px;
        color: #594316;
        font-size: 14px;
        line-height: 1.5;
      }}
      .muted {{ color: var(--muted); }}
      @media (max-width: 900px) {{
        .topbar, .tests, .grid, .charts {{ grid-template-columns: 1fr; }}
        .score-panel {{ min-height: 224px; }}
      }}
      @media print {{
        body {{ background: #ffffff; }}
        main {{ width: 100%; padding: 0; }}
        .panel, .test-card, .card, .chart-card, .note-strip {{ break-inside: avoid; }}
      }}
    </style>
  </head>
  <body>
    <main>
      <section class="topbar" aria-labelledby="report-title">
        <div class="panel hero">
          <p class="kicker">MindTrail SG demo report</p>
          <h1 id="report-title">Cognitive Health Summary</h1>
          <div class="meta" aria-label="Report details">
            <span class="pill">Session: {escape(session_id)}</span>
            <span class="pill">Age band: {escape(str(profile.get("age_band", "not provided")))}</span>
            <span class="pill">Caregiver assisted: {escape("yes" if profile.get("caregiver_assisted") else "no")}</span>
            <span class="pill">For caregiver or GP review</span>
          </div>
        </div>

        <aside class="panel score-panel" aria-label="Overall score">
          <div>
            <div class="score-ring" role="img" aria-label="Overall score {overall_score} out of 100">
              <div>
                <div class="score-value">{overall_score}</div>
                <div class="score-label">out of 100</div>
              </div>
            </div>
            <div class="score-label">Overall signal: {escape(str(context["overall_label"]))}</div>
          </div>
        </aside>
      </section>

      <section class="panel summary" aria-labelledby="overall-summary">
        <h2 id="overall-summary">Overall Summary</h2>
        <p>{escape(str(context["overall_summary"]))}</p>
      </section>

      <section aria-labelledby="section-summaries">
        <div class="section-head">
          <div>
            <h2 class="section-title" id="section-summaries">Section Summaries</h2>
            <p>One-line findings translated from the three task outputs.</p>
          </div>
        </div>

        <div class="tests">
        <article class="test-card">
          <div class="test-title-row">
            <h3>Clock Drawing Test</h3>
            <span class="band attention">Follow-up</span>
          </div>
          <p class="domain">Visuospatial and planning</p>
          <p class="one-line">{escape(str(clock["summary"]))}</p>
          <div class="metric-row">
            {metric("Score", f"{score_text(number_or_default(clock.get('score')))} / 100")}
            {metric("Confidence", percent_text(number_or_default(clock.get("confidence"))))}
          </div>
        </article>

        <article class="test-card">
          <div class="test-title-row">
            <h3>Hawker Memory Game</h3>
            <span class="band strong">Strong</span>
          </div>
          <p class="domain">Memory recall</p>
          <p class="one-line">{escape(str(memory["summary"]))}</p>
          <div class="metric-row">
            {metric("Accuracy", f"{round(number_or_default(memory.get('accuracy')) * 100)}%")}
            {metric("Avg response", f"{round(number_or_default(memory.get('avg_response_time_ms')) / 1000, 1)} sec")}
          </div>
        </article>

        <article class="test-card">
          <div class="test-title-row">
            <h3>Voice/Speech Analysis</h3>
            <span class="band attention">Monitor</span>
          </div>
          <p class="domain">Speech and language</p>
          <p class="one-line">{escape(str(voice["summary"]))}</p>
          <div class="metric-row">
            {metric("Monitoring probability", percent_text(monitoring_probability if isinstance(monitoring_probability, float) else None))}
            {metric("Typical pattern", f"{score_text(number_or_default(voice.get('score')))}%")}
          </div>
          {transcript_html}
        </article>
        </div>
      </section>

      <section aria-labelledby="visualisations">
        <div class="section-head">
          <div>
            <h2 class="section-title" id="visualisations">Visualisations</h2>
            <p>Demo trajectory across four sessions, with today's result highlighted.</p>
          </div>
        </div>

        <div class="charts">
          {chart_svg("Visuospatial / Planning", clock["trajectory"], "#b7791f")}
          {chart_svg("Memory Recall", memory["trajectory"], "#287454")}
          {chart_svg("Speech / Language", voice["trajectory"], "#315c63")}
        </div>
      </section>

      <p class="note-strip">
        {DISCLAIMER} The overall score shown here uses three task signals: clock drawing 35%,
        memory recall 30%, and speech/language 35%. The speech/language score translates
        monitoring-pattern output into a performance index for this demo report. Clinical
        validation is still needed before using this score in care decisions.
      </p>
    </main>
  </body>
</html>"""


@app.get("/report/{session_id}", response_class=HTMLResponse)
def report(session_id: str) -> str:
    session = load_session_for_report(session_id)
    summary = session.get("score", combine_score(session))
    session["report_summary"] = summary
    persist_session_json(session, "report_viewed")
    return render_cognitive_report(session)
