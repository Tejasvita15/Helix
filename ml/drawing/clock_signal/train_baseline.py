"""Train the MindTrail-owned clock drawing signal baseline from a zip archive."""

from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

try:
    from .features import HOG_CONFIG, IMAGE_SIZE, extract_hog_features_from_zip, iter_clock_image_records
    from .labels import SAFETY_STATEMENT, SIGNAL_CLASSES
except ImportError:  # pragma: no cover - supports direct script execution.
    from features import HOG_CONFIG, IMAGE_SIZE, extract_hog_features_from_zip, iter_clock_image_records
    from labels import SAFETY_STATEMENT, SIGNAL_CLASSES


PACKAGE_DIR = Path(__file__).resolve().parent
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_ZIP_PATH = REPO_ROOT / "research" / "drawing" / "cdt-api-network" / "clock_shulman.zip"
DEFAULT_ARTIFACT_DIR = PACKAGE_DIR / "artifacts"
DEFAULT_RANDOM_STATE = 42


def train_baseline(
    zip_path: Path = DEFAULT_ZIP_PATH,
    artifact_dir: Path = DEFAULT_ARTIFACT_DIR,
    random_state: int = DEFAULT_RANDOM_STATE,
    validation_size: float = 0.2,
    test_size: float = 0.2,
) -> dict[str, Any]:
    """Train, evaluate, and save the baseline model and reports."""

    records = iter_clock_image_records(zip_path)
    if not records:
        raise ValueError(f"No supported clock images found in {zip_path}")

    labels = np.array([record.signal_label for record in records])
    _validate_split_feasibility(labels)

    features = np.vstack([extract_hog_features_from_zip(zip_path, record) for record in records])
    indices = np.arange(len(records))
    train_idx, validation_idx, test_idx = _stratified_train_validation_test_split(
        indices=indices,
        labels=labels,
        validation_size=validation_size,
        test_size=test_size,
        random_state=random_state,
    )

    model = make_pipeline(
        StandardScaler(),
        LogisticRegression(
            class_weight="balanced",
            max_iter=2000,
            random_state=random_state,
        ),
    )
    model.fit(features[train_idx], labels[train_idx])

    validation_report = _evaluate_split(model, features[validation_idx], labels[validation_idx])
    test_report = _evaluate_split(model, features[test_idx], labels[test_idx])

    artifact_dir.mkdir(parents=True, exist_ok=True)
    model_path = artifact_dir / "clock_signal_baseline.joblib"
    model_info_path = artifact_dir / "clock_signal_model_info.json"
    evaluation_path = artifact_dir / "evaluation_report.json"
    confusion_matrix_path = artifact_dir / "confusion_matrix.csv"

    model_payload = {
        "model": model,
        "classes": list(SIGNAL_CLASSES),
        "image_size": IMAGE_SIZE,
        "hog_config": _json_ready_hog_config(),
        "label_type": "clock_signal",
        "safety_statement": SAFETY_STATEMENT,
    }
    joblib.dump(model_payload, model_path)

    model_info = {
        "model_name": "clock_signal_hog_logistic_regression_baseline",
        "model_type": "HOG features + LogisticRegression(class_weight='balanced')",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "dataset_source": str(zip_path),
        "image_size": IMAGE_SIZE,
        "hog_config": _json_ready_hog_config(),
        "classes": list(SIGNAL_CLASSES),
        "label_mapping": {
            "shulman_5": "low_signal",
            "shulman_4": "medium_signal",
            "shulman_0_1_2_3": "higher_signal",
        },
        "split": {
            "random_state": random_state,
            "validation_size": validation_size,
            "test_size": test_size,
            "train_count": int(len(train_idx)),
            "validation_count": int(len(validation_idx)),
            "test_count": int(len(test_idx)),
            "train_members": [records[index].member_name for index in train_idx],
            "validation_members": [records[index].member_name for index in validation_idx],
            "test_members": [records[index].member_name for index in test_idx],
        },
        "source_score_counts": _count_values(record.shulman_score for record in records),
        "signal_counts": _count_values(record.signal_label for record in records),
        "intended_output": "Non-diagnostic drawing-task signal only.",
        "safety_statement": SAFETY_STATEMENT,
    }

    evaluation_report = {
        "model_path": str(model_path),
        "model_info_path": str(model_info_path),
        "validation": validation_report,
        "test": test_report,
        "labels": list(SIGNAL_CLASSES),
        "safety_statement": SAFETY_STATEMENT,
    }

    _write_json(model_info_path, model_info)
    _write_json(evaluation_path, evaluation_report)
    _write_confusion_matrix_csv(confusion_matrix_path, test_report["confusion_matrix"], SIGNAL_CLASSES)

    return {
        "model_path": str(model_path),
        "model_info_path": str(model_info_path),
        "evaluation_report_path": str(evaluation_path),
        "confusion_matrix_path": str(confusion_matrix_path),
        "validation": validation_report["metrics"],
        "test": test_report["metrics"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the clock drawing signal baseline.")
    parser.add_argument("--zip", type=Path, default=DEFAULT_ZIP_PATH, help="Path to clock_shulman.zip.")
    parser.add_argument("--artifact-dir", type=Path, default=DEFAULT_ARTIFACT_DIR, help="Output artifact folder.")
    parser.add_argument("--random-state", type=int, default=DEFAULT_RANDOM_STATE)
    parser.add_argument("--validation-size", type=float, default=0.2)
    parser.add_argument("--test-size", type=float, default=0.2)
    args = parser.parse_args()

    result = train_baseline(
        zip_path=args.zip,
        artifact_dir=args.artifact_dir,
        random_state=args.random_state,
        validation_size=args.validation_size,
        test_size=args.test_size,
    )
    print(json.dumps(result, indent=2))


def _stratified_train_validation_test_split(
    indices: np.ndarray,
    labels: np.ndarray,
    validation_size: float,
    test_size: float,
    random_state: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if validation_size <= 0 or test_size <= 0 or validation_size + test_size >= 1:
        raise ValueError("validation_size and test_size must be positive and sum to less than 1.")

    train_validation_idx, test_idx = train_test_split(
        indices,
        test_size=test_size,
        random_state=random_state,
        stratify=labels,
    )
    relative_validation_size = validation_size / (1.0 - test_size)
    train_idx, validation_idx = train_test_split(
        train_validation_idx,
        test_size=relative_validation_size,
        random_state=random_state,
        stratify=labels[train_validation_idx],
    )
    return train_idx, validation_idx, test_idx


def _evaluate_split(model: Any, features: np.ndarray, labels: np.ndarray) -> dict[str, Any]:
    predictions = model.predict(features)
    matrix = confusion_matrix(labels, predictions, labels=list(SIGNAL_CLASSES))
    return {
        "metrics": {
            "accuracy": round(float(accuracy_score(labels, predictions)), 6),
            "balanced_accuracy": round(float(balanced_accuracy_score(labels, predictions)), 6),
            "macro_f1": round(float(f1_score(labels, predictions, average="macro", zero_division=0)), 6),
        },
        "classification_report": classification_report(
            labels,
            predictions,
            labels=list(SIGNAL_CLASSES),
            output_dict=True,
            zero_division=0,
        ),
        "confusion_matrix": matrix.astype(int).tolist(),
    }


def _write_confusion_matrix_csv(path: Path, matrix: list[list[int]], labels: tuple[str, ...]) -> None:
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["actual\\predicted", *labels])
        for label, row in zip(labels, matrix):
            writer.writerow([label, *row])


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2, sort_keys=True)
        file.write("\n")


def _json_ready_hog_config() -> dict[str, Any]:
    return {
        "orientations": HOG_CONFIG["orientations"],
        "pixels_per_cell": list(HOG_CONFIG["pixels_per_cell"]),
        "cells_per_block": list(HOG_CONFIG["cells_per_block"]),
        "block_norm": HOG_CONFIG["block_norm"],
    }


def _count_values(values: Any) -> dict[str, int]:
    counts: dict[str, int] = {}
    for value in values:
        key = str(value)
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items()))


def _validate_split_feasibility(labels: np.ndarray) -> None:
    counts = _count_values(labels)
    too_small = {label: count for label, count in counts.items() if count < 3}
    if too_small:
        raise ValueError(f"Each signal class needs at least 3 examples for stratified splits: {too_small}")


if __name__ == "__main__":
    main()
