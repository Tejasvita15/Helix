from __future__ import annotations

from pathlib import Path
from time import time
from typing import Dict, List, Optional, Tuple
from uuid import uuid4

from fastapi import FastAPI
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
MODEL_PATH = ROOT_DIR / "datasets" / "CDT-API-Network" / "clock_hog_svm.joblib"
DISCLAIMER = (
    "This is not a diagnosis. Please discuss new or worsening concerns with a "
    "healthcare professional."
)

SESSIONS: Dict[str, dict] = {}


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
    duration_sec: int = 40
    pause_count: int = 4
    long_pause_count: int = 1
    estimated_word_count: int = 65
    transcript: str = ""


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
    instruction: str = "Draw a clock showing 10 past 11."
    canvas: ClockDrawingCanvasRequest = Field(default_factory=ClockDrawingCanvasRequest)
    strokes: List[ClockDrawingStrokeRequest] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class ScoreRequest(BaseModel):
    session_id: str


def ensure_session(session_id: str) -> dict:
    if session_id not in SESSIONS:
        SESSIONS[session_id] = {"session_id": session_id, "created_at": time()}
    return SESSIONS[session_id]


def signal_payload(domain: str, band: str, score: int, reason: str) -> dict:
    return {"domain": domain, "band": band, "score": score, "reason": reason}


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
    signals = {
        "language": voice,
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
def session_start(payload: SessionStartRequest) -> Dict[str, str]:
    session_id = f"demo-{uuid4().hex[:10]}"
    SESSIONS[session_id] = {
        "session_id": session_id,
        "created_at": time(),
        "profile": payload.model_dump(),
    }
    return {"session_id": session_id}


@app.post("/caregiver-checklist")
def caregiver_checklist(payload: ChecklistRequest) -> Dict[str, bool]:
    session = ensure_session(payload.session_id)
    session["checklist"] = payload.model_dump()
    return {"saved": True}


@app.post("/task/voice")
def task_voice(payload: VoiceTaskRequest) -> dict:
    session = ensure_session(payload.session_id)
    band = "amber" if payload.long_pause_count >= 3 or payload.estimated_word_count < 45 else "green"
    score = 62 if band == "amber" else 82
    reason = (
        "Mock voice metadata showed longer pauses or lower estimated fluency."
        if band == "amber"
        else "Mock voice metadata did not show a strong language signal."
    )
    session["voice_task"] = payload.model_dump()
    session["voice_signal"] = signal_payload("language", band, score, reason)
    return {"saved": True, "voice_signal": session["voice_signal"]}


@app.post("/task/drawing")
def task_drawing(payload: DrawingTaskRequest) -> dict:
    session = ensure_session(payload.session_id)
    label, source = predict_clock_signal(payload)
    signal = drawing_label_to_signal(label)
    session["drawing_task"] = payload.model_dump()
    session["drawing_signal"] = signal
    return {
        "saved": True,
        "drawing_signal": signal,
        "model_label": label,
        "model_source": source,
        "disclaimer": DISCLAIMER,
    }


@app.post("/task/drawing/score")
def task_drawing_score(payload: ClockDrawingScoreRequest) -> dict:
    return score_clock_drawing_payload(payload.model_dump())


@app.post("/score")
def score(payload: ScoreRequest) -> dict:
    session = ensure_session(payload.session_id)
    session["score"] = combine_score(session)
    return session["score"]


@app.get("/report/{session_id}", response_class=HTMLResponse)
def report(session_id: str) -> str:
    session = ensure_session(session_id)
    summary = session.get("score", combine_score(session))
    domains = "".join(
        f"<li><strong>{value['domain']}</strong>: {value['band']} - {value['reason']}</li>"
        for value in summary["domain_signals"].values()
    )
    recommendations = "".join(f"<li>{item}</li>" for item in summary["recommendations"])
    return f"""
    <html>
      <head><title>MindTrail SG Report</title></head>
      <body>
        <h1>MindTrail SG GP-ready report</h1>
        <p><strong>Session:</strong> {session_id}</p>
        <p><strong>Overall signal:</strong> {summary['overall_band']}</p>
        <h2>Domain signals</h2>
        <ul>{domains}</ul>
        <h2>Recommendations</h2>
        <ul>{recommendations}</ul>
        <p><strong>{DISCLAIMER}</strong></p>
      </body>
    </html>
    """
