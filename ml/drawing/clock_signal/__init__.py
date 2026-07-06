"""MindTrail-owned clock drawing image baseline package."""

from .features import (
    ClockImageRecord,
    extract_hog_features_from_path,
    extract_hog_features_from_zip,
    iter_clock_image_records,
)
from .labels import (
    ALL_OUTPUT_SIGNALS,
    SAFETY_STATEMENT,
    SIGNAL_CLASSES,
    SIGNAL_TEXT,
    shulman_score_to_signal,
)
from .renderer import DrawingCompletionStats, compute_completion_stats, render_strokes_to_image
from .schemas import (
    ClockCanvas,
    ClockDrawingMetadata,
    ClockDrawingPayload,
    ClockPoint,
    ClockScoreResult,
    ClockStroke,
)
from .scorer import build_safe_result, load_model, score_image

__all__ = [
    "ALL_OUTPUT_SIGNALS",
    "ClockCanvas",
    "ClockDrawingMetadata",
    "ClockDrawingPayload",
    "ClockImageRecord",
    "ClockPoint",
    "ClockScoreResult",
    "ClockStroke",
    "DrawingCompletionStats",
    "SAFETY_STATEMENT",
    "SIGNAL_CLASSES",
    "SIGNAL_TEXT",
    "build_safe_result",
    "compute_completion_stats",
    "extract_hog_features_from_path",
    "extract_hog_features_from_zip",
    "iter_clock_image_records",
    "load_model",
    "render_strokes_to_image",
    "score_image",
    "shulman_score_to_signal",
]
