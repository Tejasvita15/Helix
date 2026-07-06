"""Lightweight smoke checks for the clock drawing score endpoint."""

from __future__ import annotations

import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

from fastapi.testclient import TestClient


ROOT_DIR = Path(__file__).resolve().parents[3]
SERVICES_API_DIR = ROOT_DIR / "services" / "api"
for path in (ROOT_DIR, SERVICES_API_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from app.main import app


SAMPLE_PAYLOAD = {
    "task_id": "clock_drawing",
    "instruction": "Draw a clock showing 10 past 11.",
    "canvas": {"width": 320, "height": 320},
    "strokes": [
        {
            "points": [
                {"x": 160, "y": 40, "t": 0},
                {"x": 220, "y": 58, "t": 16},
                {"x": 266, "y": 106, "t": 32},
                {"x": 282, "y": 166, "t": 48},
                {"x": 258, "y": 230, "t": 64},
                {"x": 210, "y": 274, "t": 80},
                {"x": 148, "y": 286, "t": 96},
                {"x": 88, "y": 260, "t": 112},
                {"x": 46, "y": 210, "t": 128},
                {"x": 38, "y": 148, "t": 144},
                {"x": 62, "y": 88, "t": 160},
                {"x": 110, "y": 50, "t": 176},
                {"x": 160, "y": 40, "t": 192},
            ]
        },
        {"points": [{"x": 160, "y": 160, "t": 240}, {"x": 160, "y": 78, "t": 256}]},
        {"points": [{"x": 160, "y": 160, "t": 280}, {"x": 102, "y": 126, "t": 296}]},
        {"points": [{"x": 156, "y": 58, "t": 320}, {"x": 164, "y": 58, "t": 336}]},
        {"points": [{"x": 270, "y": 156, "t": 360}, {"x": 282, "y": 156, "t": 376}]},
        {"points": [{"x": 156, "y": 274, "t": 400}, {"x": 164, "y": 274, "t": 416}]},
        {"points": [{"x": 42, "y": 156, "t": 440}, {"x": 54, "y": 156, "t": 456}]},
    ],
    "metadata": {"completion_time_ms": 42000, "clear_count": 1, "undo_count": 0, "device": "mobile"},
}


def main() -> None:
    client = TestClient(app)

    valid_response = client.post("/task/drawing/score", json=SAMPLE_PAYLOAD)
    valid_response.raise_for_status()
    valid_payload = valid_response.json()
    assert valid_payload["task"] == "clock_drawing"
    assert valid_payload["task_completed"] is True
    assert valid_payload["signal_band"] in {"low_signal", "medium_signal", "higher_signal", "uncertain"}

    two_point_response = client.post(
        "/task/drawing/score",
        json={
            **SAMPLE_PAYLOAD,
            "strokes": [
                {
                    "points": [
                        {"x": 100, "y": 120, "t": 0},
                        {"x": 101, "y": 121, "t": 16},
                    ]
                }
            ],
        },
    )
    two_point_response.raise_for_status()
    two_point_payload = two_point_response.json()
    assert two_point_payload["task_completed"] is False
    assert two_point_payload["signal_band"] == "uncertain"
    assert two_point_payload["reason"] == "too_few_points"

    empty_response = client.post(
        "/task/drawing/score",
        json={**SAMPLE_PAYLOAD, "strokes": []},
    )
    empty_response.raise_for_status()
    empty_payload = empty_response.json()
    assert empty_payload["task_completed"] is False
    assert empty_payload["signal_band"] == "uncertain"

    invalid_canvas_response = client.post(
        "/task/drawing/score",
        json={**SAMPLE_PAYLOAD, "canvas": {"width": 0, "height": 320}},
    )
    invalid_canvas_response.raise_for_status()
    invalid_canvas_payload = invalid_canvas_response.json()
    assert invalid_canvas_payload["task_completed"] is False
    assert invalid_canvas_payload["signal_band"] == "uncertain"
    assert invalid_canvas_payload["reason"] == "invalid_canvas"

    with TemporaryDirectory() as temp_dir:
        old_model_path = os.environ.get("CLOCK_SIGNAL_MODEL_PATH")
        os.environ["CLOCK_SIGNAL_MODEL_PATH"] = str(Path(temp_dir) / "missing.joblib")
        try:
            missing_model_response = client.post("/task/drawing/score", json=SAMPLE_PAYLOAD)
            missing_model_response.raise_for_status()
            missing_model_payload = missing_model_response.json()
            assert missing_model_payload["task_completed"] is False
            assert missing_model_payload["signal_band"] == "uncertain"
        finally:
            if old_model_path is None:
                os.environ.pop("CLOCK_SIGNAL_MODEL_PATH", None)
            else:
                os.environ["CLOCK_SIGNAL_MODEL_PATH"] = old_model_path

    print("drawing score endpoint smoke checks passed")


if __name__ == "__main__":
    main()
