"""Predict a safe clock drawing signal from one image using an experimental CNN."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from PIL import Image
import torch

try:
    from ....labels import UNCERTAIN_SIGNAL
    from .dataset import CLASS_NAMES
    from .train_cnn import build_model, build_transforms, resolve_device
except ImportError:  # pragma: no cover - supports direct script execution.
    from ml.drawing.clock_signal.labels import UNCERTAIN_SIGNAL
    from dataset import CLASS_NAMES
    from train_cnn import build_model, build_transforms, resolve_device


CNN_SIGNAL_TEXT = {
    "low_signal": {
        "title": "Low signal",
        "summary": "No strong visuospatial/planning signal in this clock image.",
    },
    "medium_signal": {
        "title": "Medium signal",
        "summary": "Some visuospatial/planning signals are worth monitoring.",
    },
    "higher_signal": {
        "title": "Higher signal",
        "summary": "Stronger visuospatial/planning signals may warrant follow-up if new or worsening.",
    },
    "uncertain": {
        "title": "Uncertain",
        "summary": "The model confidence was too low to score this image reliably.",
    },
}


def predict_image(
    image_path: Path,
    model_path: Path,
    threshold: float = 0.60,
    device_name: str = "auto",
) -> dict[str, Any]:
    """Return a JSON-compatible signal prediction for one clock image."""

    if not 0 <= threshold <= 1:
        raise ValueError("threshold must be between 0 and 1.")

    checkpoint = torch.load(model_path, map_location="cpu")
    model_name = checkpoint["model_name"]
    model, _ = build_model(model_name, num_classes=len(CLASS_NAMES), pretrained=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    device = resolve_device(device_name)
    model = model.to(device)
    model.eval()

    transform = build_transforms(train=False)
    with Image.open(image_path) as image:
        tensor = transform(image.convert("RGB")).unsqueeze(0).to(device)

    with torch.no_grad():
        probabilities = torch.softmax(model(tensor), dim=1).cpu().numpy()[0]

    best_index = int(probabilities.argmax())
    best_label = CLASS_NAMES[best_index]
    confidence = float(probabilities[best_index])
    output_signal = UNCERTAIN_SIGNAL if confidence < threshold else best_label

    return {
        "image": str(image_path),
        "model_path": str(model_path),
        "model_name": model_name,
        "signal": output_signal,
        "confidence": round(confidence, 6),
        "threshold": threshold,
        "probabilities": {
            label: round(float(probability), 6)
            for label, probability in zip(CLASS_NAMES, probabilities)
        },
        "user_facing": CNN_SIGNAL_TEXT[output_signal],
        "safe_note": (
            "Experimental drawing-task signal only. Please discuss new or worsening "
            "concerns with a healthcare professional."
        ),
        "scoring_scope": "General clock drawing quality; prompt-specific hand time correctness is not validated.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Predict an experimental clock drawing CNN signal.")
    parser.add_argument("--image", type=Path, required=True, help="Path to a clock drawing image.")
    parser.add_argument("--model-path", type=Path, required=True, help="Path to a *_clock_cnn.pt checkpoint.")
    parser.add_argument("--threshold", type=float, default=0.60)
    parser.add_argument("--device", choices=("cuda", "mps", "cpu", "auto"), default="auto")
    args = parser.parse_args()

    print(
        json.dumps(
            predict_image(
                image_path=args.image,
                model_path=args.model_path,
                threshold=args.threshold,
                device_name=args.device,
            ),
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
