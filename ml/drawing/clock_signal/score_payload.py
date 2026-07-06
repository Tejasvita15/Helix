"""CLI adapter for scoring product clock-drawing stroke payloads."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

try:
    from .labels import UNCERTAIN_SIGNAL
    from .renderer import DrawingCompletionStats, compute_completion_stats, render_strokes_to_image
    from .schemas import ClockDrawingPayload
    from .scorer import DEFAULT_MODEL_PATH, DEFAULT_THRESHOLD, build_safe_result, score_image
except ImportError:  # pragma: no cover - supports direct script execution.
    from labels import UNCERTAIN_SIGNAL
    from renderer import DrawingCompletionStats, compute_completion_stats, render_strokes_to_image
    from schemas import ClockDrawingPayload
    from scorer import DEFAULT_MODEL_PATH, DEFAULT_THRESHOLD, build_safe_result, score_image


MIN_COMPLETION_VALID_POINTS = 20
MIN_COMPLETION_INK_LENGTH_PX = 80.0


def score_payload(
    payload: dict[str, Any] | ClockDrawingPayload,
    model_path: Path | str = DEFAULT_MODEL_PATH,
    threshold: float = DEFAULT_THRESHOLD,
    save_rendered: Path | str | None = None,
) -> dict[str, Any]:
    """Render a stroke payload and score it through the image baseline."""

    parsed = payload if isinstance(payload, ClockDrawingPayload) else ClockDrawingPayload.from_raw(payload)
    completion_stats = compute_completion_stats(parsed)
    incomplete_reason = _incomplete_reason(parsed, completion_stats)
    if incomplete_reason is not None:
        return build_safe_result(
            signal_band=UNCERTAIN_SIGNAL,
            confidence=0.0,
            metadata={
                "task_completed": False,
                "reason": incomplete_reason,
                "completion_stats": completion_stats.to_dict(),
            },
        )

    try:
        rendered = render_strokes_to_image(parsed, save_path=save_rendered)
    except Exception:
        return build_safe_result(
            signal_band=UNCERTAIN_SIGNAL,
            confidence=0.0,
            metadata={"task_completed": False, "reason": "rendering_failed"},
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

def _incomplete_reason(
    payload: ClockDrawingPayload,
    completion_stats: DrawingCompletionStats,
    min_valid_points: int = MIN_COMPLETION_VALID_POINTS,
    min_total_ink_length_px: float = MIN_COMPLETION_INK_LENGTH_PX,
) -> str | None:
    if not completion_stats.canvas_valid:
        return "invalid_canvas"
    if not payload.strokes or not payload.has_strokes:
        return "no_strokes"
    if completion_stats.valid_point_count < min_valid_points:
        return "too_few_points"
    if completion_stats.stroke_count_with_at_least_2_valid_points < 1:
        return "no_complete_stroke"
    if completion_stats.total_ink_length_px < min_total_ink_length_px:
        return "insufficient_ink"
    return None


if __name__ == "__main__":
    main()
