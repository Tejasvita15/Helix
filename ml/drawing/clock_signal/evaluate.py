"""Evaluate a saved clock drawing signal baseline against the source zip."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import joblib
import numpy as np

try:
    from .features import extract_hog_features_from_zip, iter_clock_image_records
    from .labels import SIGNAL_CLASSES
    from .train_baseline import DEFAULT_ARTIFACT_DIR, DEFAULT_ZIP_PATH, _evaluate_split, _write_json
except ImportError:  # pragma: no cover - supports direct script execution.
    from features import extract_hog_features_from_zip, iter_clock_image_records
    from labels import SIGNAL_CLASSES
    from train_baseline import DEFAULT_ARTIFACT_DIR, DEFAULT_ZIP_PATH, _evaluate_split, _write_json


DEFAULT_MODEL_PATH = DEFAULT_ARTIFACT_DIR / "clock_signal_baseline.joblib"
DEFAULT_OUTPUT_PATH = DEFAULT_ARTIFACT_DIR / "evaluation_report.json"


def evaluate_model(
    zip_path: Path = DEFAULT_ZIP_PATH,
    model_path: Path = DEFAULT_MODEL_PATH,
    output_path: Path | None = DEFAULT_OUTPUT_PATH,
) -> dict[str, Any]:
    """Evaluate a saved model on all labelled images in the source zip."""

    payload = joblib.load(model_path)
    model = payload["model"]
    records = iter_clock_image_records(zip_path)
    if not records:
        raise ValueError(f"No supported clock images found in {zip_path}")

    features = np.vstack([extract_hog_features_from_zip(zip_path, record) for record in records])
    labels = np.array([record.signal_label for record in records])
    report = {
        "model_path": str(model_path),
        "zip_path": str(zip_path),
        "split": "all_labelled_zip_images",
        "labels": list(SIGNAL_CLASSES),
        "all_images": _evaluate_split(model, features, labels),
    }

    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        _write_json(output_path, report)

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a saved clock drawing signal baseline.")
    parser.add_argument("--zip", type=Path, default=DEFAULT_ZIP_PATH, help="Path to clock_shulman.zip.")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL_PATH, help="Path to saved joblib model.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH, help="Optional JSON output path.")
    parser.add_argument("--no-output", action="store_true", help="Print only; do not write a JSON report.")
    args = parser.parse_args()

    report = evaluate_model(
        zip_path=args.zip,
        model_path=args.model,
        output_path=None if args.no_output else args.output,
    )
    print(report["all_images"]["metrics"])


if __name__ == "__main__":
    main()
