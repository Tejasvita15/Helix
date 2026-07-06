"""Service wrapper for product-facing clock drawing scoring."""

from __future__ import annotations

import os
from pathlib import Path
import sys
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[4]
DEFAULT_MODEL_PATH = ROOT_DIR / "ml" / "drawing" / "clock_signal" / "artifacts" / "clock_signal_baseline.joblib"
DEFAULT_THRESHOLD = 0.60


def score_clock_drawing_payload(payload: dict[str, Any], threshold: float = DEFAULT_THRESHOLD) -> dict[str, Any]:
    """Score a clock drawing stroke payload with safe fallback behavior."""

    try:
        return _score_with_adapter(payload, threshold=threshold)
    except Exception:
        return _safe_uncertain_result("scoring service unavailable")


def resolve_model_path() -> Path:
    """Resolve the model path from env, then the repo-relative default."""

    configured = os.environ.get("CLOCK_SIGNAL_MODEL_PATH")
    return Path(configured).expanduser() if configured else DEFAULT_MODEL_PATH


def _score_with_adapter(payload: dict[str, Any], threshold: float) -> dict[str, Any]:
    if str(ROOT_DIR) not in sys.path:
        sys.path.insert(0, str(ROOT_DIR))

    from ml.drawing.clock_signal.score_payload import score_payload

    return score_payload(payload, model_path=resolve_model_path(), threshold=threshold)


def _safe_uncertain_result(reason: str) -> dict[str, Any]:
    return {
        "task": "clock_drawing",
        "task_completed": False,
        "signal_band": "uncertain",
        "confidence": 0.0,
        "domains": ["visuospatial", "planning"],
        "explanation": f"The clock task could not be scored reliably: {reason}. This is not a diagnosis.",
        "report_summary": (
            "Clock drawing task was not scored reliably. Consider retrying or reviewing "
            "with a caregiver or GP if concerns persist."
        ),
        "model_version": "clock_signal_baseline_v0",
        "scoring_mode": "image_baseline_v0",
    }
