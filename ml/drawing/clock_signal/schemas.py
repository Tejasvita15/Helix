"""Lightweight product-facing schemas for clock drawing scoring."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class ClockPoint:
    x: float
    y: float
    t: float | None = None

    @classmethod
    def from_raw(cls, value: Any) -> "ClockPoint | None":
        if not isinstance(value, dict):
            return None
        if "x" not in value or "y" not in value:
            return None
        try:
            x = float(value["x"])
            y = float(value["y"])
            t = None if value.get("t") is None else float(value["t"])
        except (TypeError, ValueError):
            return None
        return cls(x=x, y=y, t=t)


@dataclass(frozen=True)
class ClockStroke:
    points: list[ClockPoint] = field(default_factory=list)

    @classmethod
    def from_raw(cls, value: Any) -> "ClockStroke":
        raw_points = value.get("points", []) if isinstance(value, dict) else []
        points = [point for point in (ClockPoint.from_raw(item) for item in raw_points) if point is not None]
        return cls(points=points)


@dataclass(frozen=True)
class ClockCanvas:
    width: float
    height: float

    @classmethod
    def from_raw(cls, value: Any) -> "ClockCanvas":
        raw = value if isinstance(value, dict) else {}
        return cls(width=_float_or_zero(raw.get("width")), height=_float_or_zero(raw.get("height")))

    @property
    def is_valid(self) -> bool:
        return self.width > 0 and self.height > 0


@dataclass(frozen=True)
class ClockDrawingMetadata:
    completion_time_ms: int | None = None
    clear_count: int = 0
    undo_count: int = 0
    device: str | None = None

    @classmethod
    def from_raw(cls, value: Any) -> "ClockDrawingMetadata":
        raw = value if isinstance(value, dict) else {}
        return cls(
            completion_time_ms=_optional_int(raw.get("completion_time_ms")),
            clear_count=_int_or_zero(raw.get("clear_count")),
            undo_count=_int_or_zero(raw.get("undo_count")),
            device=str(raw["device"]) if raw.get("device") is not None else None,
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ClockDrawingPayload:
    task_id: str
    instruction: str
    canvas: ClockCanvas
    strokes: list[ClockStroke] = field(default_factory=list)
    metadata: ClockDrawingMetadata = field(default_factory=ClockDrawingMetadata)

    @classmethod
    def from_raw(cls, value: Any) -> "ClockDrawingPayload":
        raw = value if isinstance(value, dict) else {}
        raw_strokes = raw.get("strokes", [])
        strokes = [ClockStroke.from_raw(item) for item in raw_strokes] if isinstance(raw_strokes, list) else []
        return cls(
            task_id=str(raw.get("task_id") or "clock_drawing"),
            instruction=str(raw.get("instruction") or ""),
            canvas=ClockCanvas.from_raw(raw.get("canvas")),
            strokes=strokes,
            metadata=ClockDrawingMetadata.from_raw(raw.get("metadata")),
        )

    @property
    def valid_point_count(self) -> int:
        return sum(len(stroke.points) for stroke in self.strokes)

    @property
    def has_strokes(self) -> bool:
        return any(stroke.points for stroke in self.strokes)


@dataclass(frozen=True)
class ClockScoreResult:
    task: str
    task_completed: bool
    signal_band: str
    confidence: float
    domains: list[str]
    explanation: str
    report_summary: str
    model_version: str
    scoring_mode: str
    reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {key: value for key, value in asdict(self).items() if value is not None}


def _float_or_zero(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _int_or_zero(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
