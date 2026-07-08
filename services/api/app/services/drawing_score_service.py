"""Service wrapper for product-facing clock drawing scoring."""

from __future__ import annotations

import os
from pathlib import Path
import sys
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[4]
DEFAULT_MODEL_PATH = ROOT_DIR / "ml" / "drawing" / "clock_signal" / "artifacts" / "clock_signal_baseline.joblib"
DEFAULT_CNN_MODEL_PATH = (
    ROOT_DIR
    / "ml"
    / "drawing"
    / "clock_signal"
    / "experiments"
    / "cnn_baseline"
    / "artifacts"
    / "densenet121_clock_cnn.pt"
)
DEFAULT_CNN_MODEL_INFO_PATH = DEFAULT_CNN_MODEL_PATH.with_name("densenet121_model_info.json")
DEFAULT_THRESHOLD = 0.60
HOG_BACKEND = "hog"
CNN_BACKEND = "cnn"
CNN_SCORING_MODE = "cnn_densenet121_experimental"
CNN_MODEL_VERSION = "densenet121_clock_cnn_v0"


def score_clock_drawing_payload(payload: dict[str, Any], threshold: float | None = None) -> dict[str, Any]:
    """Score a clock drawing stroke payload with safe fallback behavior."""

    backend = resolve_backend()
    resolved_threshold = resolve_threshold(threshold)
    try:
        if backend == CNN_BACKEND:
            return _score_with_cnn_adapter(payload, threshold=resolved_threshold)
        return _score_with_adapter(payload, threshold=resolved_threshold)
    except Exception:
        if backend == CNN_BACKEND:
            return _safe_uncertain_result(
                "cnn_scoring_error",
                scoring_mode=CNN_SCORING_MODE,
                model_version=CNN_MODEL_VERSION,
            )
        return _safe_uncertain_result("scoring_error")


def resolve_backend() -> str:
    """Resolve scorer backend. HOG remains the default demo-safe backend."""

    configured = os.environ.get("CLOCK_SCORER_BACKEND", HOG_BACKEND).strip().lower()
    if configured in {HOG_BACKEND, "image", "image_baseline"}:
        return HOG_BACKEND
    if configured == CNN_BACKEND:
        return CNN_BACKEND
    return HOG_BACKEND


def resolve_model_path() -> Path:
    """Resolve the model path from env, then the repo-relative default."""

    configured = os.environ.get("CLOCK_SIGNAL_MODEL_PATH")
    return Path(configured).expanduser() if configured else DEFAULT_MODEL_PATH


def resolve_cnn_model_path() -> Path:
    """Resolve the CNN checkpoint path from env, then the DenseNet artifact default."""

    configured = os.environ.get("CLOCK_CNN_MODEL_PATH")
    return Path(configured).expanduser() if configured else DEFAULT_CNN_MODEL_PATH


def resolve_cnn_model_info_path() -> Path:
    """Resolve the CNN metadata path from env, then the DenseNet model info default."""

    configured = os.environ.get("CLOCK_CNN_MODEL_INFO_PATH")
    return Path(configured).expanduser() if configured else DEFAULT_CNN_MODEL_INFO_PATH


def resolve_threshold(explicit_threshold: float | None = None) -> float:
    """Resolve scorer confidence threshold from argument, env, then default."""

    if explicit_threshold is not None:
        return explicit_threshold
    configured = os.environ.get("CLOCK_SIGNAL_THRESHOLD")
    if configured is None:
        return DEFAULT_THRESHOLD
    try:
        threshold = float(configured)
    except ValueError:
        return DEFAULT_THRESHOLD
    return threshold if 0 <= threshold <= 1 else DEFAULT_THRESHOLD


def _score_with_adapter(payload: dict[str, Any], threshold: float) -> dict[str, Any]:
    if str(ROOT_DIR) not in sys.path:
        sys.path.insert(0, str(ROOT_DIR))

    from ml.drawing.clock_signal.score_payload import score_payload

    return score_payload(payload, model_path=resolve_model_path(), threshold=threshold)


def _score_with_cnn_adapter(payload: dict[str, Any], threshold: float) -> dict[str, Any]:
    if str(ROOT_DIR) not in sys.path:
        sys.path.insert(0, str(ROOT_DIR))

    from ml.drawing.clock_signal.renderer import compute_completion_stats, render_strokes_to_image
    from ml.drawing.clock_signal.schemas import ClockDrawingPayload
    from ml.drawing.clock_signal.score_payload import _incomplete_reason

    parsed = ClockDrawingPayload.from_raw(payload)
    completion_stats = compute_completion_stats(parsed)
    incomplete_reason = _incomplete_reason(parsed, completion_stats)
    if incomplete_reason is not None:
        return _safe_uncertain_result(
            incomplete_reason,
            scoring_mode=CNN_SCORING_MODE,
            model_version=CNN_MODEL_VERSION,
            explanation="The drawing was too incomplete to score reliably. Please try the task again.",
        )

    cnn_model_path = resolve_cnn_model_path()
    cnn_model_info_path = resolve_cnn_model_info_path()
    if not cnn_model_path.exists() or not cnn_model_info_path.exists():
        return _safe_uncertain_result(
            "cnn_model_unavailable",
            scoring_mode=CNN_SCORING_MODE,
            model_version=CNN_MODEL_VERSION,
        )

    rendered = render_strokes_to_image(parsed)
    try:
        from ml.drawing.clock_signal.experiments.cnn_baseline.cnn_scorer import score_cnn_image
    except ImportError:
        return _safe_uncertain_result(
            "cnn_model_unavailable",
            scoring_mode=CNN_SCORING_MODE,
            model_version=CNN_MODEL_VERSION,
        )

    return score_cnn_image(
        image_path_or_pil=rendered,
        model_path=cnn_model_path,
        model_info_path=cnn_model_info_path,
        threshold=threshold,
        device=os.environ.get("CLOCK_CNN_DEVICE", "auto"),
    )


def _safe_uncertain_result(
    reason: str,
    scoring_mode: str = "image_baseline_v0",
    model_version: str = "clock_signal_baseline_v0",
    explanation: str = "The clock task could not be scored reliably. Please try the task again.",
) -> dict[str, Any]:
    return {
        "task": "clock_drawing",
        "task_completed": False,
        "signal_band": "uncertain",
        "confidence": 0.0,
        "domains": ["visuospatial", "planning"],
        "explanation": explanation,
        "report_summary": (
            "Clock drawing task was incomplete or could not be scored reliably."
        ),
        "model_version": model_version,
        "scoring_mode": scoring_mode,
        "reason": reason,
    }
