"""Predict a safe clock drawing signal from one image using an experimental CNN."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

try:
    from .cnn_scorer import score_cnn_image
except ImportError:  # pragma: no cover - supports direct script execution.
    from cnn_scorer import score_cnn_image


def predict_image(
    image_path: Path,
    model_path: Path,
    model_info_path: Path | None = None,
    threshold: float = 0.60,
    device_name: str = "auto",
) -> dict[str, Any]:
    """Return a JSON-compatible signal prediction for one clock image."""

    return score_cnn_image(
        image_path_or_pil=image_path,
        model_path=model_path,
        model_info_path=model_info_path,
        threshold=threshold,
        device=device_name,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Predict an experimental clock drawing CNN signal.")
    parser.add_argument("--image", type=Path, required=True, help="Path to a clock drawing image.")
    parser.add_argument("--model-path", type=Path, required=True, help="Path to a *_clock_cnn.pt checkpoint.")
    parser.add_argument("--model-info", type=Path, default=None, help="Optional *_model_info.json for architecture metadata.")
    parser.add_argument("--threshold", type=float, default=0.60)
    parser.add_argument("--device", choices=("cuda", "mps", "cpu", "auto"), default="auto")
    args = parser.parse_args()

    print(
        json.dumps(
            predict_image(
                image_path=args.image,
                model_path=args.model_path,
                model_info_path=args.model_info,
                threshold=args.threshold,
                device_name=args.device,
            ),
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
