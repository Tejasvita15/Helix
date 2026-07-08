"""Safe signal labels for the clock drawing image baseline."""

from __future__ import annotations

import re


LOW_SIGNAL = "low_signal"
MEDIUM_SIGNAL = "medium_signal"
HIGHER_SIGNAL = "higher_signal"
UNCERTAIN_SIGNAL = "uncertain"

SIGNAL_CLASSES = (LOW_SIGNAL, MEDIUM_SIGNAL, HIGHER_SIGNAL)
ALL_OUTPUT_SIGNALS = (*SIGNAL_CLASSES, UNCERTAIN_SIGNAL)

SAFETY_STATEMENT = (
    "This is not a diagnosis. Please discuss new or worsening concerns with a "
    "healthcare professional."
)

SIGNAL_TEXT = {
    LOW_SIGNAL: {
        "title": "Low signal",
        "summary": "No strong visuospatial/planning signal in this clock task.",
    },
    MEDIUM_SIGNAL: {
        "title": "Medium signal",
        "summary": "Some visuospatial/planning signals are worth monitoring.",
    },
    HIGHER_SIGNAL: {
        "title": "Higher signal",
        "summary": "Stronger visuospatial/planning signals may warrant follow-up if new or worsening.",
    },
    UNCERTAIN_SIGNAL: {
        "title": "Uncertain",
        "summary": "The model confidence was too low to score this image reliably.",
    },
}


def shulman_score_to_signal(score: int) -> str:
    """Map the source Shulman score to MindTrail's non-diagnostic signal labels."""

    if score == 5:
        return LOW_SIGNAL
    if score == 4:
        return MEDIUM_SIGNAL
    if 0 <= score <= 3:
        return HIGHER_SIGNAL
    raise ValueError(f"Unexpected Shulman score: {score}")


def infer_shulman_score_from_folder(folder_name: str) -> int:
    """Infer score from folders such as ``5_perfect_clock`` or ``0_no_clock``."""

    match = re.match(r"^\D*(?P<score>[0-5])(?:\D|$)", folder_name)
    if not match:
        raise ValueError(f"Could not infer Shulman score from folder: {folder_name}")
    return int(match.group("score"))
