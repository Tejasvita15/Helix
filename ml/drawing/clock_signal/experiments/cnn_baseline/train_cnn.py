"""Train an experimental transfer-learning CNN for clock drawing signals."""

from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.metrics import accuracy_score, balanced_accuracy_score, classification_report, confusion_matrix, f1_score
import torch
from torch import nn
from torch.utils.data import DataLoader
from torchvision import models, transforms

try:
    from .dataset import (
        CLASS_NAMES,
        DEFAULT_ZIP_PATH,
        IMAGE_SIZE,
        ClockZipImageDataset,
        list_clock_records,
        make_stratified_splits,
        records_to_labels,
        save_split_metadata,
    )
except ImportError:  # pragma: no cover - supports direct script execution.
    from dataset import (
        CLASS_NAMES,
        DEFAULT_ZIP_PATH,
        IMAGE_SIZE,
        ClockZipImageDataset,
        list_clock_records,
        make_stratified_splits,
        records_to_labels,
        save_split_metadata,
    )


PACKAGE_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT_DIR = PACKAGE_DIR / "artifacts"
SUPPORTED_MODELS = ("resnet18", "densenet121", "efficientnet_b0")
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


def train_cnn(
    zip_path: Path = DEFAULT_ZIP_PATH,
    model_name: str = "resnet18",
    epochs: int = 8,
    batch_size: int = 32,
    lr: float = 1e-4,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    seed: int = 42,
    device_name: str = "auto",
) -> dict[str, Any]:
    """Train a CNN baseline and write model/evaluation artifacts."""

    _set_seed(seed)
    device = resolve_device(device_name)
    records = list_clock_records(zip_path)
    if not records:
        raise ValueError(f"No score-folder images found in {zip_path}")

    splits = make_stratified_splits(records, seed=seed)
    output_dir.mkdir(parents=True, exist_ok=True)
    split_metadata_path = output_dir / f"{model_name}_split_metadata.json"
    save_split_metadata(
        split_metadata_path,
        records=records,
        splits=splits,
        seed=seed,
        validation_size=0.2,
        test_size=0.2,
        zip_path=zip_path,
    )

    train_loader = DataLoader(
        ClockZipImageDataset(zip_path, records, splits["train"], transform=build_transforms(train=True)),
        batch_size=batch_size,
        shuffle=True,
        num_workers=0,
    )
    validation_loader = DataLoader(
        ClockZipImageDataset(zip_path, records, splits["validation"], transform=build_transforms(train=False)),
        batch_size=batch_size,
        shuffle=False,
        num_workers=0,
    )
    test_loader = DataLoader(
        ClockZipImageDataset(zip_path, records, splits["test"], transform=build_transforms(train=False)),
        batch_size=batch_size,
        shuffle=False,
        num_workers=0,
    )

    model, weights_status = build_model(model_name, num_classes=len(CLASS_NAMES), pretrained=True)
    model = model.to(device)
    criterion = nn.CrossEntropyLoss(weight=_class_weights(records_to_labels(records, splits["train"])).to(device))
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)

    best_state: dict[str, torch.Tensor] | None = None
    best_validation_macro_f1 = -1.0
    history: list[dict[str, Any]] = []
    for epoch in range(1, epochs + 1):
        train_loss = _train_one_epoch(model, train_loader, criterion, optimizer, device)
        validation_report = evaluate_loader(model, validation_loader, device)
        history.append(
            {
                "epoch": epoch,
                "train_loss": round(train_loss, 6),
                "validation": validation_report["metrics"],
            }
        )
        validation_macro_f1 = validation_report["metrics"]["macro_f1"]
        if validation_macro_f1 > best_validation_macro_f1:
            best_validation_macro_f1 = validation_macro_f1
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}

        print(
            json.dumps(
                {
                    "epoch": epoch,
                    "train_loss": round(train_loss, 6),
                    "validation_macro_f1": validation_macro_f1,
                }
            )
        )

    if best_state is not None:
        model.load_state_dict(best_state)

    validation_report = evaluate_loader(model, validation_loader, device)
    test_report = evaluate_loader(model, test_loader, device)

    model_path = output_dir / f"{model_name}_clock_cnn.pt"
    model_info_path = output_dir / f"{model_name}_model_info.json"
    evaluation_path = output_dir / f"{model_name}_evaluation_report.json"
    confusion_matrix_path = output_dir / f"{model_name}_confusion_matrix.csv"

    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "model_name": model_name,
            "classes": list(CLASS_NAMES),
            "image_size": IMAGE_SIZE,
            "normalization": {"mean": list(IMAGENET_MEAN), "std": list(IMAGENET_STD)},
            "label_type": "clock_signal",
            "scoring_mode": "experimental_cnn_baseline",
            "weights_status": weights_status,
        },
        model_path,
    )

    model_info = {
        "model_name": model_name,
        "model_type": f"{model_name} transfer-learning CNN",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "dataset_source": str(zip_path),
        "classes": list(CLASS_NAMES),
        "image_size": IMAGE_SIZE,
        "epochs": epochs,
        "batch_size": batch_size,
        "lr": lr,
        "seed": seed,
        "device": str(device),
        "weights_status": weights_status,
        "split_metadata_path": str(split_metadata_path),
        "history": history,
        "intended_output": "Visual clock drawing signal only.",
        "scope_note": "This experimental CNN scores general clock drawing quality and does not validate prompt-specific hand time correctness.",
    }
    evaluation_report = {
        "model_path": str(model_path),
        "model_info_path": str(model_info_path),
        "split_metadata_path": str(split_metadata_path),
        "validation": validation_report,
        "test": test_report,
        "classes": list(CLASS_NAMES),
    }

    _write_json(model_info_path, model_info)
    _write_json(evaluation_path, evaluation_report)
    _write_confusion_matrix_csv(confusion_matrix_path, test_report["confusion_matrix"])

    return {
        "model_path": str(model_path),
        "model_info_path": str(model_info_path),
        "evaluation_report_path": str(evaluation_path),
        "confusion_matrix_path": str(confusion_matrix_path),
        "split_metadata_path": str(split_metadata_path),
        "validation": validation_report["metrics"],
        "test": test_report["metrics"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train an experimental clock drawing CNN baseline.")
    parser.add_argument("--zip", type=Path, default=DEFAULT_ZIP_PATH, help="Path to clock_shulman.zip.")
    parser.add_argument("--model", choices=SUPPORTED_MODELS, default="resnet18")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", choices=("cuda", "mps", "cpu", "auto"), default="auto")
    args = parser.parse_args()

    result = train_cnn(
        zip_path=args.zip,
        model_name=args.model,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        output_dir=args.output_dir,
        seed=args.seed,
        device_name=args.device,
    )
    print(json.dumps(result, indent=2, sort_keys=True))


def build_model(model_name: str, num_classes: int, pretrained: bool = True) -> tuple[nn.Module, dict[str, Any]]:
    """Build a supported torchvision model and replace its classifier head."""

    weights = _resolve_weights(model_name, pretrained)
    weights_status = {
        "pretrained_requested": pretrained,
        "pretrained_loaded": weights is not None,
        "weights": str(weights) if weights is not None else None,
    }

    try:
        return _build_model_with_head(model_name, num_classes, weights), weights_status
    except Exception as exc:
        if weights is None:
            raise
        weights_status = {
            **weights_status,
            "pretrained_loaded": False,
            "weights": None,
            "fallback_reason": str(exc),
        }
        return _build_model_with_head(model_name, num_classes, None), weights_status


def _build_model_with_head(model_name: str, num_classes: int, weights: Any | None) -> nn.Module:
    if model_name == "resnet18":
        model = models.resnet18(weights=weights)
        model.fc = nn.Linear(model.fc.in_features, num_classes)
        return model
    if model_name == "densenet121":
        model = models.densenet121(weights=weights)
        model.classifier = nn.Linear(model.classifier.in_features, num_classes)
        return model
    if model_name == "efficientnet_b0":
        model = models.efficientnet_b0(weights=weights)
        model.classifier[-1] = nn.Linear(model.classifier[-1].in_features, num_classes)
        return model

    raise ValueError(f"Unsupported model: {model_name}")


def build_transforms(train: bool) -> Any:
    if train:
        return transforms.Compose(
            [
                transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
                transforms.RandomRotation(degrees=8, fill=255),
                transforms.RandomAffine(degrees=0, translate=(0.04, 0.04), scale=(0.95, 1.05), fill=255),
                transforms.ColorJitter(brightness=0.12, contrast=0.18),
                transforms.RandomApply([transforms.GaussianBlur(kernel_size=3, sigma=(0.1, 0.8))], p=0.2),
                transforms.ToTensor(),
                transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
            ]
        )

    return transforms.Compose(
        [
            transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ]
    )


def resolve_device(device_name: str) -> torch.device:
    if device_name == "auto":
        if torch.cuda.is_available():
            return torch.device("cuda")
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return torch.device("mps")
        return torch.device("cpu")
    if device_name == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA was requested but is not available.")
    if device_name == "mps" and not (hasattr(torch.backends, "mps") and torch.backends.mps.is_available()):
        raise ValueError("MPS was requested but is not available.")
    return torch.device(device_name)


def evaluate_loader(model: nn.Module, loader: DataLoader, device: torch.device) -> dict[str, Any]:
    model.eval()
    y_true: list[int] = []
    y_pred: list[int] = []
    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            logits = model(images)
            predictions = torch.argmax(logits, dim=1).cpu().tolist()
            y_pred.extend(int(item) for item in predictions)
            y_true.extend(int(item) for item in labels.tolist())

    return metrics_from_predictions(y_true, y_pred)


def metrics_from_predictions(y_true: list[int], y_pred: list[int]) -> dict[str, Any]:
    labels = list(range(len(CLASS_NAMES)))
    matrix = confusion_matrix(y_true, y_pred, labels=labels)
    return {
        "metrics": {
            "accuracy": round(float(accuracy_score(y_true, y_pred)), 6),
            "balanced_accuracy": round(float(balanced_accuracy_score(y_true, y_pred)), 6),
            "macro_f1": round(float(f1_score(y_true, y_pred, labels=labels, average="macro", zero_division=0)), 6),
        },
        "classification_report": classification_report(
            y_true,
            y_pred,
            labels=labels,
            target_names=list(CLASS_NAMES),
            output_dict=True,
            zero_division=0,
        ),
        "confusion_matrix": matrix.astype(int).tolist(),
    }


def _train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
) -> float:
    model.train()
    running_loss = 0.0
    sample_count = 0
    for images, labels in loader:
        images = images.to(device)
        labels = labels.to(device)
        optimizer.zero_grad(set_to_none=True)
        logits = model(images)
        loss = criterion(logits, labels)
        loss.backward()
        optimizer.step()
        running_loss += float(loss.item()) * int(labels.size(0))
        sample_count += int(labels.size(0))
    return running_loss / sample_count if sample_count else 0.0


def _class_weights(labels: list[int]) -> torch.Tensor:
    counts = np.bincount(np.array(labels), minlength=len(CLASS_NAMES)).astype(np.float32)
    counts[counts == 0] = 1.0
    weights = counts.sum() / (len(CLASS_NAMES) * counts)
    return torch.tensor(weights, dtype=torch.float32)


def _resolve_weights(model_name: str, pretrained: bool) -> Any | None:
    if not pretrained:
        return None
    weight_map = {
        "resnet18": models.ResNet18_Weights.DEFAULT,
        "densenet121": models.DenseNet121_Weights.DEFAULT,
        "efficientnet_b0": models.EfficientNet_B0_Weights.DEFAULT,
    }
    return weight_map[model_name]


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


def _set_seed(seed: int) -> None:
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


if __name__ == "__main__":
    main()
