"""Audit saved clock signal predictions on sampled source-zip images."""

from __future__ import annotations

import argparse
import csv
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.metrics import f1_score, recall_score

try:
    from .features import ClockImageRecord, extract_hog_features_from_zip, iter_clock_image_records
    from .labels import SIGNAL_CLASSES, UNCERTAIN_SIGNAL, infer_shulman_score_from_folder, shulman_score_to_signal
except ImportError:  # pragma: no cover - supports direct script execution.
    from features import ClockImageRecord, extract_hog_features_from_zip, iter_clock_image_records
    from labels import SIGNAL_CLASSES, UNCERTAIN_SIGNAL, infer_shulman_score_from_folder, shulman_score_to_signal


PACKAGE_DIR = Path(__file__).resolve().parent
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_MODEL_PATH = PACKAGE_DIR / "artifacts" / "clock_signal_baseline.joblib"
DEFAULT_ZIP_PATH = REPO_ROOT / "research" / "drawing" / "cdt-api-network" / "clock_shulman.zip"
DEFAULT_AUDIT_CSV_PATH = PACKAGE_DIR / "artifacts" / "sample_prediction_audit.csv"
DEFAULT_SUMMARY_PATH = PACKAGE_DIR / "artifacts" / "sample_prediction_summary.json"
DEFAULT_THRESHOLD_ANALYSIS_PATH = PACKAGE_DIR / "artifacts" / "threshold_analysis.json"
DEFAULT_SAMPLES_PER_FOLDER = 20
DEFAULT_RANDOM_STATE = 42
THRESHOLDS = (0.50, 0.55, 0.60, 0.65, 0.70)
ORIGINAL_SHULMAN_FOLDERS = (
    "5_perfect_clock",
    "4_minor_VIS_errors",
    "3_hands_vis_errors",
    "2_mod_vis_xhands",
    "1_severe_vis",
    "0_no_clock",
)


@dataclass(frozen=True)
class AuditRow:
    member_name: str
    source_folder: str
    shulman_score: int
    true_signal: str
    predicted_signal: str
    confidence: float
    matched: bool

    def to_csv_row(self) -> dict[str, str | int | float | bool]:
        payload = asdict(self)
        payload["confidence"] = round(self.confidence, 6)
        return payload


def audit_predictions(
    model_path: Path = DEFAULT_MODEL_PATH,
    zip_path: Path = DEFAULT_ZIP_PATH,
    samples_per_folder: int = DEFAULT_SAMPLES_PER_FOLDER,
    random_state: int = DEFAULT_RANDOM_STATE,
    audit_csv_path: Path = DEFAULT_AUDIT_CSV_PATH,
    summary_path: Path = DEFAULT_SUMMARY_PATH,
    threshold_analysis_path: Path = DEFAULT_THRESHOLD_ANALYSIS_PATH,
) -> dict[str, Any]:
    """Sample source images, score them, and save audit reports."""

    if samples_per_folder <= 0:
        raise ValueError("samples_per_folder must be positive.")

    payload = joblib.load(model_path)
    model = payload["model"]
    if not hasattr(model, "predict_proba"):
        raise ValueError("Saved model must support predict_proba for audit confidence.")

    sampled_records = _sample_records(zip_path, samples_per_folder, random_state)
    if not sampled_records:
        raise ValueError("No source-folder records were available for auditing.")

    probabilities = _predict_probabilities(model, zip_path, sampled_records)
    audit_rows = _build_audit_rows(model.classes_, sampled_records, probabilities)
    summary = _build_summary(audit_rows, samples_per_folder, random_state, model_path, zip_path)
    threshold_analysis = _threshold_analysis(model.classes_, sampled_records, probabilities)
    summary["recommended_default_threshold"] = _recommend_threshold(threshold_analysis)

    audit_csv_path.parent.mkdir(parents=True, exist_ok=True)
    _write_audit_csv(audit_csv_path, audit_rows)
    _write_json(summary_path, summary)
    _write_json(threshold_analysis_path, threshold_analysis)

    _print_summary(summary)
    return {
        "audit_csv_path": str(audit_csv_path),
        "summary_path": str(summary_path),
        "threshold_analysis_path": str(threshold_analysis_path),
        "summary": summary,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit sampled clock drawing signal predictions.")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL_PATH, help="Path to saved joblib model.")
    parser.add_argument("--zip", type=Path, default=DEFAULT_ZIP_PATH, help="Path to clock_shulman.zip.")
    parser.add_argument(
        "--samples-per-folder",
        type=int,
        default=DEFAULT_SAMPLES_PER_FOLDER,
        help="Number of images to sample from each original Shulman folder.",
    )
    parser.add_argument("--random-state", type=int, default=DEFAULT_RANDOM_STATE)
    parser.add_argument("--audit-csv", type=Path, default=DEFAULT_AUDIT_CSV_PATH)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY_PATH)
    parser.add_argument("--threshold-analysis", type=Path, default=DEFAULT_THRESHOLD_ANALYSIS_PATH)
    args = parser.parse_args()

    audit_predictions(
        model_path=args.model,
        zip_path=args.zip,
        samples_per_folder=args.samples_per_folder,
        random_state=args.random_state,
        audit_csv_path=args.audit_csv,
        summary_path=args.summary,
        threshold_analysis_path=args.threshold_analysis,
    )


def _sample_records(zip_path: Path, samples_per_folder: int, random_state: int) -> list[ClockImageRecord]:
    records_by_folder: dict[str, list[ClockImageRecord]] = defaultdict(list)
    for record in iter_clock_image_records(zip_path):
        if record.source_folder in ORIGINAL_SHULMAN_FOLDERS:
            records_by_folder[record.source_folder].append(record)

    rng = np.random.default_rng(random_state)
    sampled: list[ClockImageRecord] = []
    for folder in ORIGINAL_SHULMAN_FOLDERS:
        folder_records = sorted(records_by_folder.get(folder, []), key=lambda record: record.member_name)
        if not folder_records:
            continue

        sample_size = min(samples_per_folder, len(folder_records))
        sample_indexes = rng.choice(len(folder_records), size=sample_size, replace=False)
        sampled.extend(folder_records[int(index)] for index in sorted(sample_indexes))

    return sampled


def _predict_probabilities(model: Any, zip_path: Path, records: list[ClockImageRecord]) -> np.ndarray:
    features = np.vstack([extract_hog_features_from_zip(zip_path, record) for record in records])
    return model.predict_proba(features)


def _build_audit_rows(
    model_classes: np.ndarray,
    records: list[ClockImageRecord],
    probabilities: np.ndarray,
) -> list[AuditRow]:
    rows: list[AuditRow] = []
    classes = list(model_classes)
    for record, probability_row in zip(records, probabilities):
        shulman_score = infer_shulman_score_from_folder(record.source_folder)
        true_signal = shulman_score_to_signal(shulman_score)
        best_index = int(probability_row.argmax())
        predicted_signal = classes[best_index]
        confidence = float(probability_row[best_index])
        rows.append(
            AuditRow(
                member_name=record.member_name,
                source_folder=record.source_folder,
                shulman_score=shulman_score,
                true_signal=true_signal,
                predicted_signal=predicted_signal,
                confidence=confidence,
                matched=predicted_signal == true_signal,
            )
        )
    return rows


def _build_summary(
    rows: list[AuditRow],
    samples_per_folder: int,
    random_state: int,
    model_path: Path,
    zip_path: Path,
) -> dict[str, Any]:
    prediction_counts = Counter(row.predicted_signal for row in rows)
    true_counts = Counter(row.true_signal for row in rows)
    folder_counts = Counter(row.source_folder for row in rows)
    confusions = Counter(
        (row.true_signal, row.predicted_signal)
        for row in rows
        if row.true_signal != row.predicted_signal
    )

    return {
        "sample_count": len(rows),
        "samples_per_folder_requested": samples_per_folder,
        "random_state": random_state,
        "model_path": str(model_path),
        "zip_path": str(zip_path),
        "folder_counts": dict(sorted(folder_counts.items())),
        "true_signal_counts": _ordered_signal_counts(true_counts),
        "prediction_counts": _ordered_signal_counts(prediction_counts),
        "matched_count": sum(1 for row in rows if row.matched),
        "accuracy_on_sample": round(sum(1 for row in rows if row.matched) / len(rows), 6),
        "most_common_confusions": [
            {"true_signal": true, "predicted_signal": predicted, "count": count}
            for (true, predicted), count in confusions.most_common(10)
        ],
    }


def _threshold_analysis(
    model_classes: np.ndarray,
    records: list[ClockImageRecord],
    probabilities: np.ndarray,
) -> list[dict[str, Any]]:
    classes = list(model_classes)
    true_labels = [shulman_score_to_signal(infer_shulman_score_from_folder(record.source_folder)) for record in records]
    best_indexes = probabilities.argmax(axis=1)
    best_probabilities = probabilities.max(axis=1)
    base_predictions = [classes[int(index)] for index in best_indexes]
    total = len(records)

    results: list[dict[str, Any]] = []
    for threshold in THRESHOLDS:
        predictions = [
            predicted if float(confidence) >= threshold else UNCERTAIN_SIGNAL
            for predicted, confidence in zip(base_predictions, best_probabilities)
        ]
        covered_indexes = [index for index, predicted in enumerate(predictions) if predicted != UNCERTAIN_SIGNAL]
        covered_true = [true_labels[index] for index in covered_indexes]
        covered_predicted = [predictions[index] for index in covered_indexes]

        if covered_indexes:
            macro_f1 = f1_score(
                covered_true,
                covered_predicted,
                labels=list(SIGNAL_CLASSES),
                average="macro",
                zero_division=0,
            )
            recall_values = recall_score(
                covered_true,
                covered_predicted,
                labels=list(SIGNAL_CLASSES),
                average=None,
                zero_division=0,
            )
            per_class_recall = {
                label: round(float(value), 6)
                for label, value in zip(SIGNAL_CLASSES, recall_values)
                if label in covered_true
            }
        else:
            macro_f1 = None
            per_class_recall = {}

        uncertain_count = total - len(covered_indexes)
        results.append(
            {
                "threshold": threshold,
                "coverage_percentage": round(100.0 * len(covered_indexes) / total, 3),
                "uncertain_percentage": round(100.0 * uncertain_count / total, 3),
                "non_uncertain_count": len(covered_indexes),
                "uncertain_count": uncertain_count,
                "macro_f1_non_uncertain": None if macro_f1 is None else round(float(macro_f1), 6),
                "per_class_recall": per_class_recall,
            }
        )

    return results


def _recommend_threshold(threshold_analysis: list[dict[str, Any]]) -> float:
    scored = [
        item
        for item in threshold_analysis
        if item["macro_f1_non_uncertain"] is not None and item["non_uncertain_count"] > 0
    ]
    if not scored:
        return 0.55

    best = max(
        scored,
        key=lambda item: (
            item["macro_f1_non_uncertain"],
            item["coverage_percentage"],
            -item["threshold"],
        ),
    )
    return float(best["threshold"])


def _ordered_signal_counts(counter: Counter[str]) -> dict[str, int]:
    return {label: int(counter.get(label, 0)) for label in (*SIGNAL_CLASSES, UNCERTAIN_SIGNAL)}


def _write_audit_csv(path: Path, rows: list[AuditRow]) -> None:
    fieldnames = [
        "member_name",
        "source_folder",
        "shulman_score",
        "true_signal",
        "predicted_signal",
        "confidence",
        "matched",
    ]
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row.to_csv_row())


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2, sort_keys=True)
        file.write("\n")


def _print_summary(summary: dict[str, Any]) -> None:
    print(f"Sample count: {summary['sample_count']}")
    print(f"Per-class prediction counts: {summary['prediction_counts']}")
    print(f"Most common confusions: {summary['most_common_confusions'][:5]}")
    print(f"Recommended default threshold: {summary['recommended_default_threshold']:.2f}")


if __name__ == "__main__":
    main()
