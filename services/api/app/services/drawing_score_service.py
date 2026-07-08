"""Service wrapper for product-facing clock drawing scoring."""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from time import time_ns
from typing import Any
from uuid import uuid4
from math import hypot

from PIL import Image, ImageDraw


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
DEFAULT_CNN_MODEL_INFO_PATH = (
    ROOT_DIR
    / "ml"
    / "drawing"
    / "clock_signal"
    / "experiments"
    / "cnn_baseline"
    / "artifacts"
    / "densenet121_model_info.json"
)
DEFAULT_THRESHOLD = 0.60
MIN_COMPLETION_VALID_POINTS = 20
MIN_COMPLETION_INK_LENGTH_PX = 80.0


def score_clock_drawing_payload(payload: dict[str, Any], threshold: float = DEFAULT_THRESHOLD) -> dict[str, Any]:
    """Score a clock drawing stroke payload with safe fallback behavior."""

    try:
        result = _score_with_adapter(payload, threshold=threshold)
    except Exception:
        result = _safe_uncertain_result("scoring_error")

    _print_backend_score_result(payload, result)
    return result


def resolve_model_path() -> Path:
    """Resolve the model path from env, then the repo-relative default."""

    configured = os.environ.get("CLOCK_SIGNAL_MODEL_PATH")
    return Path(configured).expanduser() if configured else DEFAULT_MODEL_PATH


def resolve_cnn_model_path() -> Path:
    """Resolve the experimental CNN checkpoint path."""

    configured = os.environ.get("CLOCK_CNN_MODEL_PATH")
    return Path(configured).expanduser() if configured else DEFAULT_CNN_MODEL_PATH


def resolve_cnn_model_info_path() -> Path:
    """Resolve the experimental CNN model-info path."""

    configured = os.environ.get("CLOCK_CNN_MODEL_INFO_PATH")
    return Path(configured).expanduser() if configured else DEFAULT_CNN_MODEL_INFO_PATH


def _score_with_adapter(payload: dict[str, Any], threshold: float) -> dict[str, Any]:
    if str(ROOT_DIR) not in sys.path:
        sys.path.insert(0, str(ROOT_DIR))

    save_rendered = _debug_render_path(payload)
    if save_rendered is not None:
        _save_debug_render(payload, save_rendered)

    scoring_backend = os.environ.get("CLOCK_DRAWING_SCORER", "hog").strip().lower()
    if scoring_backend == "cnn":
        return _score_with_cnn(payload, threshold=threshold, save_rendered=save_rendered)
    if scoring_backend not in {"hog", "baseline"}:
        return _safe_uncertain_result("unsupported_scoring_backend")

    from ml.drawing.clock_signal.score_payload import score_payload

    return score_payload(
        payload,
        model_path=resolve_model_path(),
        threshold=threshold,
        save_rendered=save_rendered,
    )


def _score_with_cnn(
    payload: dict[str, Any],
    threshold: float,
    save_rendered: Path | None,
) -> dict[str, Any]:
    incomplete_reason = _incomplete_reason(payload)
    if incomplete_reason is not None:
        return _safe_uncertain_result(incomplete_reason, scoring_mode="experimental_cnn_baseline")

    cnn_model_path = resolve_cnn_model_path()
    if not cnn_model_path.exists():
        return _safe_uncertain_result("cnn_model_missing", scoring_mode="experimental_cnn_baseline")

    cnn_model_info_path = resolve_cnn_model_info_path()
    model_info_arg = cnn_model_info_path if cnn_model_info_path.exists() else None
    image_or_path: Image.Image | Path
    image_or_path = save_rendered if save_rendered is not None else _render_strokes_to_image(payload)

    try:
        from ml.drawing.clock_signal.experiments.cnn_baseline.cnn_scorer import score_cnn_image
    except ImportError:
        return _safe_uncertain_result("cnn_dependencies_missing", scoring_mode="experimental_cnn_baseline")

    try:
        return score_cnn_image(
            image_path_or_pil=image_or_path,
            model_path=cnn_model_path,
            model_info_path=model_info_arg,
            threshold=threshold,
            device=os.environ.get("CLOCK_CNN_DEVICE", "cpu"),
        )
    except Exception:
        return _safe_uncertain_result("cnn_scoring_error", scoring_mode="experimental_cnn_baseline")


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
    image = _render_strokes_to_image(payload, output_size=output_size)
    save_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(save_path)


def _render_strokes_to_image(payload: dict[str, Any], output_size: int = 256) -> Image.Image:
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

    return image


def _incomplete_reason(payload: dict[str, Any]) -> str | None:
    canvas = payload.get("canvas") if isinstance(payload.get("canvas"), dict) else {}
    width = float(canvas.get("width") or 0)
    height = float(canvas.get("height") or 0)
    if width <= 0 or height <= 0:
        return "invalid_canvas"

    valid_point_count = 0
    stroke_count = 0
    total_ink_length = 0.0
    for stroke in payload.get("strokes") or []:
        raw_points = stroke.get("points") if isinstance(stroke, dict) else []
        points = [
            (float(point.get("x", -1)), float(point.get("y", -1)))
            for point in raw_points or []
            if isinstance(point, dict)
        ]
        valid_points = [(x, y) for x, y in points if 0 <= x <= width and 0 <= y <= height]
        valid_point_count += len(valid_points)
        if len(valid_points) >= 2:
            stroke_count += 1
            total_ink_length += sum(
                hypot(x2 - x1, y2 - y1)
                for (x1, y1), (x2, y2) in zip(valid_points, valid_points[1:])
            )

    if valid_point_count == 0:
        return "no_strokes"
    if valid_point_count < MIN_COMPLETION_VALID_POINTS:
        return "too_few_points"
    if stroke_count < 1:
        return "no_complete_stroke"
    if total_ink_length < MIN_COMPLETION_INK_LENGTH_PX:
        return "insufficient_ink"
    return None


def _safe_uncertain_result(reason: str, scoring_mode: str = "image_baseline_v0") -> dict[str, Any]:
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
        "scoring_mode": scoring_mode,
        "class_probabilities": {},
        "reason": reason,
    }


def _print_backend_score_result(payload: dict[str, Any], result: dict[str, Any]) -> None:
    score_log = {
        "event": "clock_drawing_score",
        "session_id": payload.get("session_id"),
        "instruction": payload.get("instruction"),
        "scoring_mode": result.get("scoring_mode"),
        "model_version": result.get("model_version"),
        "signal_band": result.get("signal_band"),
        "confidence": result.get("confidence"),
        "class_probabilities": result.get("class_probabilities", {}),
        "task_completed": result.get("task_completed"),
        "reason": result.get("reason"),
    }
    print(json.dumps(score_log, sort_keys=True), flush=True)
