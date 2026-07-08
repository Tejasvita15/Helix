"""MindTrail-owned clock drawing image baseline package.

Imports are intentionally lazy so experimental CNN modules can be used even
when optional HOG/scikit-image dependencies are not installed correctly.
"""

from __future__ import annotations

from typing import Any


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


_EXPORT_MODULES = {
    "ALL_OUTPUT_SIGNALS": ".labels",
    "ClockCanvas": ".schemas",
    "ClockDrawingMetadata": ".schemas",
    "ClockDrawingPayload": ".schemas",
    "ClockImageRecord": ".features",
    "ClockPoint": ".schemas",
    "ClockScoreResult": ".schemas",
    "ClockStroke": ".schemas",
    "DrawingCompletionStats": ".renderer",
    "SAFETY_STATEMENT": ".labels",
    "SIGNAL_CLASSES": ".labels",
    "SIGNAL_TEXT": ".labels",
    "build_safe_result": ".scorer",
    "compute_completion_stats": ".renderer",
    "extract_hog_features_from_path": ".features",
    "extract_hog_features_from_zip": ".features",
    "iter_clock_image_records": ".features",
    "load_model": ".scorer",
    "render_strokes_to_image": ".renderer",
    "score_image": ".scorer",
    "shulman_score_to_signal": ".labels",
}


def __getattr__(name: str) -> Any:
    module_name = _EXPORT_MODULES.get(name)
    if module_name is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

    from importlib import import_module

    module = import_module(module_name, package=__name__)
    value = getattr(module, name)
    globals()[name] = value
    return value
