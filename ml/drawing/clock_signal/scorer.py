"""Product-facing scorer for the clock drawing image baseline."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from PIL import Image

try:
    from .features import extract_hog_features_from_bytes, extract_hog_features_from_path
    from .labels import HIGHER_SIGNAL, LOW_SIGNAL, MEDIUM_SIGNAL, SIGNAL_TEXT, UNCERTAIN_SIGNAL
    from .schemas import ClockDrawingMetadata, ClockScoreResult
except ImportError:  # pragma: no cover - supports direct script execution.
    from features import extract_hog_features_from_bytes, extract_hog_features_from_path
    from labels import HIGHER_SIGNAL, LOW_SIGNAL, MEDIUM_SIGNAL, SIGNAL_TEXT, UNCERTAIN_SIGNAL
    from schemas import ClockDrawingMetadata, ClockScoreResult


PACKAGE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_PATH = PACKAGE_DIR / "artifacts" / "clock_signal_baseline.joblib"
DEFAULT_THRESHOLD = 0.60
SCORING_MODE = "image_baseline_v0"
MODEL_VERSION = "clock_signal_baseline_v0"
DOMAINS = ["visuospatial", "planning"]


def load_model(model_path: Path | str = DEFAULT_MODEL_PATH) -> dict[str, Any]:
    """Load the saved model artifact."""

    payload = joblib.load(Path(model_path))
    if "model" not in payload:
        raise ValueError("Model artifact is missing the fitted model.")
    if not hasattr(payload["model"], "predict_proba"):
        raise ValueError("Model must support predict_proba.")
    return payload


def score_image(
    image_or_path: Image.Image | Path | str,
    model_path: Path | str = DEFAULT_MODEL_PATH,
    threshold: float = DEFAULT_THRESHOLD,
) -> dict[str, Any]:
    """Score one rendered image or image path with confidence-based uncertainty."""

    if not 0 <= threshold <= 1:
        raise ValueError("threshold must be between 0 and 1.")

    payload = load_model(model_path)
    model = payload["model"]
    features = _features_from_image_or_path(image_or_path).reshape(1, -1)
    probabilities = model.predict_proba(features)[0]
    best_index = int(np.argmax(probabilities))
    predicted_signal = str(model.classes_[best_index])
    confidence = float(probabilities[best_index])
    signal_band = UNCERTAIN_SIGNAL if confidence < threshold else predicted_signal

    return build_safe_result(
        signal_band=signal_band,
        confidence=confidence,
        metadata={
            "task_completed": True,
            "model_version": payload.get("model_version") or MODEL_VERSION,
        },
    )


def build_safe_result(
    signal_band: str,
    confidence: float,
    metadata: ClockDrawingMetadata | dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the JSON-compatible result used by product adapters."""

    meta = _metadata_to_dict(metadata)
    task_completed = bool(meta.get("task_completed", True))
    reason = meta.get("reason")
    model_version = str(meta.get("model_version") or MODEL_VERSION)
    safe_signal = signal_band if signal_band in SIGNAL_TEXT else UNCERTAIN_SIGNAL
    explanation = _explanation_for_signal(safe_signal, reason)
    report_summary = _report_summary_for_signal(safe_signal, task_completed, reason)

    return ClockScoreResult(
        task="clock_drawing",
        task_completed=task_completed,
        signal_band=safe_signal,
        confidence=round(float(confidence), 6),
        domains=DOMAINS,
        explanation=explanation,
        report_summary=report_summary,
        model_version=model_version,
        scoring_mode=SCORING_MODE,
    ).to_dict()


def _features_from_image_or_path(image_or_path: Image.Image | Path | str) -> np.ndarray:
    if isinstance(image_or_path, Image.Image):
        buffer = BytesIO()
        image_or_path.convert("RGB").save(buffer, format="PNG")
        return extract_hog_features_from_bytes(buffer.getvalue())
    return extract_hog_features_from_path(Path(image_or_path))


def _metadata_to_dict(metadata: ClockDrawingMetadata | dict[str, Any] | None) -> dict[str, Any]:
    if metadata is None:
        return {}
    if isinstance(metadata, ClockDrawingMetadata):
        return metadata.to_dict()
    return dict(metadata)


def _explanation_for_signal(signal_band: str, reason: Any = None) -> str:
    if signal_band == LOW_SIGNAL:
        return "No strong visuospatial/planning signal was found in this clock task. This is not a diagnosis."
    if signal_band == MEDIUM_SIGNAL:
        return "A possible visuospatial/planning signal was found. This is not a diagnosis."
    if signal_band == HIGHER_SIGNAL:
        return "A stronger possible visuospatial/planning signal was found. This is not a diagnosis."

    if reason:
        return f"The clock task could not be scored reliably: {reason}. This is not a diagnosis."
    return "The clock task could not be scored reliably. This is not a diagnosis."


def _report_summary_for_signal(signal_band: str, task_completed: bool, reason: Any = None) -> str:
    if not task_completed:
        detail = f" Reason: {reason}." if reason else ""
        return f"Clock drawing task was not scored reliably.{detail} Consider retrying or reviewing with a caregiver or GP if concerns persist."
    if signal_band == LOW_SIGNAL:
        return "Clock drawing task showed no strong visuospatial/planning signal today. Consider follow-up if concerns persist or worsen."
    if signal_band == MEDIUM_SIGNAL:
        return "Clock drawing task showed a possible visuospatial/planning signal worth monitoring. Consider follow-up if concerns persist or worsen."
    if signal_band == HIGHER_SIGNAL:
        return "Clock drawing task showed a stronger possible visuospatial/planning signal. Consider follow-up with a GP if this is new, persistent, or affecting daily life."
    return "Clock drawing task result is uncertain. Consider retrying or reviewing with a caregiver or GP if concerns persist."
