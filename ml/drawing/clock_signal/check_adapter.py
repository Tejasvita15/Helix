"""Lightweight smoke checks for the product-facing clock scoring adapter."""

from __future__ import annotations

import json
from pathlib import Path

try:
    from .renderer import render_strokes_to_image
    from .score_payload import score_payload
    from .scorer import DEFAULT_MODEL_PATH, score_image
    from .schemas import ClockDrawingPayload
except ImportError:  # pragma: no cover - supports direct script execution.
    from renderer import render_strokes_to_image
    from score_payload import score_payload
    from scorer import DEFAULT_MODEL_PATH, score_image
    from schemas import ClockDrawingPayload


PACKAGE_DIR = Path(__file__).resolve().parent
EXAMPLE_PAYLOAD_PATH = PACKAGE_DIR / "examples" / "sample_clock_payload.json"


def main() -> None:
    with EXAMPLE_PAYLOAD_PATH.open("r", encoding="utf-8") as file:
        raw_payload = json.load(file)

    parsed = ClockDrawingPayload.from_raw(raw_payload)
    rendered = render_strokes_to_image(parsed)
    result_from_image = score_image(rendered, model_path=DEFAULT_MODEL_PATH)
    result_from_payload = score_payload(raw_payload, model_path=DEFAULT_MODEL_PATH)

    json.dumps(result_from_image)
    json.dumps(result_from_payload)

    required_keys = {
        "task",
        "task_completed",
        "signal_band",
        "confidence",
        "domains",
        "explanation",
        "report_summary",
        "model_version",
        "scoring_mode",
    }
    missing = required_keys - set(result_from_payload)
    if missing:
        raise AssertionError(f"Payload result is missing keys: {sorted(missing)}")

    print("clock_signal adapter smoke checks passed")


if __name__ == "__main__":
    main()
