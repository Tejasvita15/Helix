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

__all__ = [
    "ALL_OUTPUT_SIGNALS",
    "ClockImageRecord",
    "SAFETY_STATEMENT",
    "SIGNAL_CLASSES",
    "SIGNAL_TEXT",
    "extract_hog_features_from_path",
    "extract_hog_features_from_zip",
    "iter_clock_image_records",
    "shulman_score_to_signal",
]
