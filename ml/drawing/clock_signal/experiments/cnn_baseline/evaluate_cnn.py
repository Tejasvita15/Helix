"""Evaluate an experimental clock drawing CNN checkpoint."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

import torch
from torch.utils.data import DataLoader

try:
    from .dataset import (
        CLASS_NAMES,
        DEFAULT_ZIP_PATH,
        ClockZipImageDataset,
        list_clock_records,
        load_split_metadata,
        make_stratified_splits,
        save_split_metadata,
    )
    from .train_cnn import DEFAULT_OUTPUT_DIR, build_model, build_transforms, evaluate_loader, resolve_device
except ImportError:  # pragma: no cover - supports direct script execution.
    from dataset import (
        CLASS_NAMES,
        DEFAULT_ZIP_PATH,
        ClockZipImageDataset,
        list_clock_records,
        load_split_metadata,
        make_stratified_splits,
        save_split_metadata,
    )
    from train_cnn import DEFAULT_OUTPUT_DIR, build_model, build_transforms, evaluate_loader, resolve_device


def evaluate_cnn(
    model_path: Path,
    zip_path: Path = DEFAULT_ZIP_PATH,
    batch_size: int = 32,
    split_metadata_path: Path | None = None,
    split: str = "test",
    output_dir: Path | None = None,
    seed: int = 42,
    device_name: str = "auto",
) -> dict[str, Any]:
    checkpoint = torch.load(model_path, map_location="cpu")
    model_name = checkpoint["model_name"]
    model, _ = build_model(model_name, num_classes=len(CLASS_NAMES), pretrained=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    device = resolve_device(device_name)
    model = model.to(device)

    records = list_clock_records(zip_path)
    if split_metadata_path is not None and split_metadata_path.exists():
        splits = load_split_metadata(split_metadata_path, records)
    else:
        splits = make_stratified_splits(records, seed=seed)
        if output_dir is not None:
            generated_split_path = output_dir / f"{model_name}_split_metadata.json"
            save_split_metadata(
                generated_split_path,
                records=records,
                splits=splits,
                seed=seed,
                validation_size=0.2,
                test_size=0.2,
                zip_path=zip_path,
            )

    if split not in splits:
        raise ValueError(f"Unknown split '{split}'. Expected one of: {sorted(splits)}")

    loader = DataLoader(
        ClockZipImageDataset(zip_path, records, splits[split], transform=build_transforms(train=False)),
        batch_size=batch_size,
        shuffle=False,
        num_workers=0,
    )
    report = {
        "model_path": str(model_path),
        "zip_path": str(zip_path),
        "split": split,
        "classes": list(CLASS_NAMES),
        "evaluation": evaluate_loader(model, loader, device),
    }

    if output_dir is not None:
        output_dir.mkdir(parents=True, exist_ok=True)
        report_path = output_dir / f"{model_name}_evaluation_report.json"
        matrix_path = output_dir / f"{model_name}_confusion_matrix.csv"
        _write_json(report_path, report)
        _write_confusion_matrix_csv(matrix_path, report["evaluation"]["confusion_matrix"])

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate an experimental clock drawing CNN baseline.")
    parser.add_argument("--zip", type=Path, default=DEFAULT_ZIP_PATH, help="Path to clock_shulman.zip.")
    parser.add_argument("--model-path", type=Path, required=True, help="Path to a *_clock_cnn.pt checkpoint.")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--split-metadata", type=Path, default=None)
    parser.add_argument("--split", choices=("train", "validation", "test"), default="test")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", choices=("cuda", "mps", "cpu", "auto"), default="auto")
    args = parser.parse_args()

    report = evaluate_cnn(
        model_path=args.model_path,
        zip_path=args.zip,
        batch_size=args.batch_size,
        split_metadata_path=args.split_metadata,
        split=args.split,
        output_dir=args.output_dir,
        seed=args.seed,
        device_name=args.device,
    )
    print(json.dumps(report["evaluation"]["metrics"], indent=2, sort_keys=True))


def _write_confusion_matrix_csv(path: Path, matrix: list[list[int]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["actual\\predicted", *CLASS_NAMES])
        for label, row in zip(CLASS_NAMES, matrix):
            writer.writerow([label, *row])


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2, sort_keys=True)
        file.write("\n")


if __name__ == "__main__":
    main()
