"""Render product stroke payloads into clock images for baseline scoring."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from math import hypot
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

try:
    from .schemas import ClockDrawingPayload, ClockPoint
except ImportError:  # pragma: no cover - supports direct script execution.
    from schemas import ClockDrawingPayload, ClockPoint


MIN_VALID_POINTS = 2


@dataclass(frozen=True)
class DrawingCompletionStats:
    valid_point_count: int
    stroke_count_with_at_least_2_valid_points: int
    total_ink_length_px: float
    canvas_valid: bool

    def to_dict(self) -> dict[str, bool | float | int]:
        return asdict(self)


def render_strokes_to_image(
    payload: ClockDrawingPayload | dict[str, Any],
    output_size: int = 256,
    save_path: Path | str | None = None,
) -> Image.Image:
    """Render valid strokes as black lines on a white square image."""

    parsed = payload if isinstance(payload, ClockDrawingPayload) else ClockDrawingPayload.from_raw(payload)
    if not parsed.canvas.is_valid:
        raise ValueError("Canvas width and height must be greater than zero.")
    if output_size <= 0:
        raise ValueError("output_size must be greater than zero.")

    image = Image.new("RGB", (output_size, output_size), "white")
    draw = ImageDraw.Draw(image)
    x_scale = output_size / parsed.canvas.width
    y_scale = output_size / parsed.canvas.height

    for stroke in parsed.strokes:
        scaled_points = [
            _scale_point(point, x_scale=x_scale, y_scale=y_scale, output_size=output_size)
            for point in stroke.points
            if _is_point_in_canvas(point, parsed)
        ]
        if len(scaled_points) == 1:
            x, y = scaled_points[0]
            draw.ellipse((x - 1, y - 1, x + 1, y + 1), fill="black")
        elif len(scaled_points) >= MIN_VALID_POINTS:
            draw.line(scaled_points, fill="black", width=3, joint="curve")

    if save_path is not None:
        output_path = Path(save_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(output_path)

    return image


def compute_completion_stats(payload: ClockDrawingPayload | dict[str, Any]) -> DrawingCompletionStats:
    """Compute drawing completion stats before model scoring."""

    parsed = payload if isinstance(payload, ClockDrawingPayload) else ClockDrawingPayload.from_raw(payload)
    if not parsed.canvas.is_valid:
        return DrawingCompletionStats(
            valid_point_count=0,
            stroke_count_with_at_least_2_valid_points=0,
            total_ink_length_px=0.0,
            canvas_valid=False,
        )

    valid_point_count = 0
    stroke_count_with_at_least_2_valid_points = 0
    total_ink_length_px = 0.0
    for stroke in parsed.strokes:
        valid_points = [point for point in stroke.points if _is_point_in_canvas(point, parsed)]
        valid_point_count += len(valid_points)
        if len(valid_points) >= MIN_VALID_POINTS:
            stroke_count_with_at_least_2_valid_points += 1
            total_ink_length_px += _stroke_length(valid_points)

    return DrawingCompletionStats(
        valid_point_count=valid_point_count,
        stroke_count_with_at_least_2_valid_points=stroke_count_with_at_least_2_valid_points,
        total_ink_length_px=round(total_ink_length_px, 3),
        canvas_valid=True,
    )


def count_renderable_points(payload: ClockDrawingPayload | dict[str, Any]) -> int:
    """Count points that can be safely placed on the declared canvas."""

    parsed = payload if isinstance(payload, ClockDrawingPayload) else ClockDrawingPayload.from_raw(payload)
    if not parsed.canvas.is_valid:
        return 0
    return sum(
        1
        for stroke in parsed.strokes
        for point in stroke.points
        if _is_point_in_canvas(point, parsed)
    )


def _is_point_in_canvas(point: ClockPoint, payload: ClockDrawingPayload) -> bool:
    return 0 <= point.x <= payload.canvas.width and 0 <= point.y <= payload.canvas.height


def _scale_point(
    point: ClockPoint,
    x_scale: float,
    y_scale: float,
    output_size: int,
) -> tuple[int, int]:
    x = max(0, min(output_size - 1, round(point.x * x_scale)))
    y = max(0, min(output_size - 1, round(point.y * y_scale)))
    return x, y


def _stroke_length(points: list[ClockPoint]) -> float:
    return sum(
        hypot(current.x - previous.x, current.y - previous.y)
        for previous, current in zip(points, points[1:])
    )
