"""CLI adapter for scoring product clock-drawing stroke payloads."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

try:
    from .labels import UNCERTAIN_SIGNAL
    from .renderer import MIN_VALID_POINTS, count_renderable_points, render_strokes_to_image
    from .schemas import ClockDrawingPayload
    from .scorer import DEFAULT_MODEL_PATH, DEFAULT_THRESHOLD, build_safe_result, score_image
except ImportError:  # pragma: no cover - supports direct script execution.
    from labels import UNCERTAIN_SIGNAL
    from renderer import MIN_VALID_POINTS, count_renderable_points, render_strokes_to_image
    from schemas import ClockDrawingPayload
    from scorer import DEFAULT_MODEL_PATH, DEFAULT_THRESHOLD, build_safe_result, score_image


def score_payload(
    payload: dict[str, Any] | ClockDrawingPayload,
    model_path: Path | str = DEFAULT_MODEL_PATH,
    threshold: float = DEFAULT_THRESHOLD,
    save_rendered: Path | str | None = None,
) -> dict[str, Any]:
    """Render a stroke payload and score it through the image baseline."""

    parsed = payload if isinstance(payload, ClockDrawingPayload) else ClockDrawingPayload.from_raw(payload)
    incomplete_reason = _incomplete_reason(parsed)
    if incomplete_reason is not None:
        return build_safe_result(
            signal_band=UNCERTAIN_SIGNAL,
            confidence=0.0,
            metadata={"task_completed": False, "reason": incomplete_reason},
        )

    try:
        rendered = render_strokes_to_image(parsed, save_path=save_rendered)
    except Exception as exc:
        return build_safe_result(
            signal_band=UNCERTAIN_SIGNAL,
            confidence=0.0,
            metadata={"task_completed": False, "reason": f"rendering failed ({exc})"},
        )

    return score_image(rendered, model_path=model_path, threshold=threshold)


def main() -> None:
    parser = argparse.ArgumentParser(description="Score a clock drawing stroke payload.")
    parser.add_argument("--payload", type=Path, required=True, help="Path to payload JSON.")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL_PATH, help="Path to saved joblib model.")
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_THRESHOLD,
        help="Return uncertain when max class probability is below this value.",
    )
    parser.add_argument("--save-rendered", type=Path, default=None, help="Optional rendered PNG output path.")
    args = parser.parse_args()

    with args.payload.open("r", encoding="utf-8") as file:
        raw_payload = json.load(file)

    result = score_payload(
        raw_payload,
        model_path=args.model,
        threshold=args.threshold,
        save_rendered=args.save_rendered,
    )
    print(json.dumps(result, indent=2, sort_keys=True))


def _incomplete_reason(payload: ClockDrawingPayload) -> str | None:
    if not payload.canvas.is_valid:
        return "canvas is invalid"
    if not payload.strokes or not payload.has_strokes:
        return "no strokes were provided"
    valid_point_count = count_renderable_points(payload)
    if valid_point_count < MIN_VALID_POINTS:
        return f"too few valid points ({valid_point_count})"
    return None


if __name__ == "__main__":
    main()
