"""Service wrapper for product-facing clock drawing scoring."""

from __future__ import annotations

import os
from pathlib import Path
import sys
from time import time_ns
from typing import Any
from uuid import uuid4

from PIL import Image, ImageDraw


ROOT_DIR = Path(__file__).resolve().parents[4]
DEFAULT_MODEL_PATH = ROOT_DIR / "ml" / "drawing" / "clock_signal" / "artifacts" / "clock_signal_baseline.joblib"
DEFAULT_THRESHOLD = 0.60


def score_clock_drawing_payload(payload: dict[str, Any], threshold: float = DEFAULT_THRESHOLD) -> dict[str, Any]:
    """Score a clock drawing stroke payload with safe fallback behavior."""

    try:
        return _score_with_adapter(payload, threshold=threshold)
    except Exception:
        return _safe_uncertain_result("scoring_error")


def resolve_model_path() -> Path:
    """Resolve the model path from env, then the repo-relative default."""

    configured = os.environ.get("CLOCK_SIGNAL_MODEL_PATH")
    return Path(configured).expanduser() if configured else DEFAULT_MODEL_PATH


def _score_with_adapter(payload: dict[str, Any], threshold: float) -> dict[str, Any]:
    if str(ROOT_DIR) not in sys.path:
        sys.path.insert(0, str(ROOT_DIR))

    save_rendered = _debug_render_path(payload)
    if save_rendered is not None:
        _save_debug_render(payload, save_rendered)

    from ml.drawing.clock_signal.score_payload import score_payload

    return score_payload(
        payload,
        model_path=resolve_model_path(),
        threshold=threshold,
        save_rendered=save_rendered,
    )


def _debug_render_path(payload: dict[str, Any]) -> Path | None:
    debug_dir = os.environ.get("CLOCK_DEBUG_RENDER_DIR")
    if not debug_dir:
        return None

    output_dir = Path(debug_dir).expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)
    session_id = str(payload.get("session_id") or "no-session")
    safe_session_id = "".join(
        char if char.isalnum() or char in ("-", "_") else "-"
        for char in session_id
    )
    filename = f"{time_ns()}_{safe_session_id}_{uuid4().hex[:8]}.png"
    return output_dir / filename


def _save_debug_render(payload: dict[str, Any], save_path: Path, output_size: int = 256) -> None:
    canvas = payload.get("canvas") if isinstance(payload.get("canvas"), dict) else {}
    width = float(canvas.get("width") or 0)
    height = float(canvas.get("height") or 0)
    if width <= 0 or height <= 0:
        raise ValueError("Canvas width and height must be greater than zero.")

    image = Image.new("RGB", (output_size, output_size), "white")
    draw = ImageDraw.Draw(image)
    x_scale = output_size / width
    y_scale = output_size / height

    for stroke in payload.get("strokes") or []:
        raw_points = stroke.get("points") if isinstance(stroke, dict) else []
        points = []
        for point in raw_points or []:
            x = float(point.get("x", -1))
            y = float(point.get("y", -1))
            if 0 <= x <= width and 0 <= y <= height:
                points.append((round(x * x_scale), round(y * y_scale)))
        if len(points) == 1:
            x, y = points[0]
            draw.ellipse((x - 1, y - 1, x + 1, y + 1), fill="black")
        elif len(points) >= 2:
            draw.line(points, fill="black", width=3, joint="curve")

    save_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(save_path)


def _safe_uncertain_result(reason: str) -> dict[str, Any]:
    return {
        "task": "clock_drawing",
        "task_completed": False,
        "signal_band": "uncertain",
        "confidence": 0.0,
        "domains": ["visuospatial", "planning"],
        "explanation": "The clock task could not be scored reliably. Please try the task again.",
        "report_summary": (
            "Clock drawing task was incomplete or could not be scored reliably."
        ),
        "model_version": "clock_signal_baseline_v0",
        "scoring_mode": "image_baseline_v0",
        "reason": reason,
    }
