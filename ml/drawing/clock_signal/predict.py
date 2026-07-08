"""Predict a non-diagnostic clock drawing signal from one image."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import joblib

try:
    from .features import extract_hog_features_from_path
    from .labels import SAFETY_STATEMENT, SIGNAL_TEXT, UNCERTAIN_SIGNAL
    from .train_baseline import DEFAULT_ARTIFACT_DIR
except ImportError:  # pragma: no cover - supports direct script execution.
    from features import extract_hog_features_from_path
    from labels import SAFETY_STATEMENT, SIGNAL_TEXT, UNCERTAIN_SIGNAL
    from train_baseline import DEFAULT_ARTIFACT_DIR


DEFAULT_MODEL_PATH = DEFAULT_ARTIFACT_DIR / "clock_signal_baseline.joblib"
DEFAULT_THRESHOLD = 0.55


def predict_image(
    image_path: Path,
    model_path: Path = DEFAULT_MODEL_PATH,
    threshold: float = DEFAULT_THRESHOLD,
) -> dict[str, Any]:
    """Return a signal label, probabilities, and safe user-facing text."""

    if not 0 <= threshold <= 1:
        raise ValueError("threshold must be between 0 and 1.")

    payload = joblib.load(model_path)
    model = payload["model"]
    if not hasattr(model, "predict_proba"):
        raise ValueError("Saved model must support predict_proba for confidence-based uncertainty.")

    features = extract_hog_features_from_path(image_path).reshape(1, -1)
    probabilities = model.predict_proba(features)[0]
    classes = list(model.classes_)
    probability_by_class = {
        class_name: round(float(probability), 6)
        for class_name, probability in zip(classes, probabilities)
    }

    best_index = int(probabilities.argmax())
    best_label = classes[best_index]
    confidence = float(probabilities[best_index])
    output_signal = UNCERTAIN_SIGNAL if confidence < threshold else best_label

    return {
        "image": str(image_path),
        "model": str(model_path),
        "signal": output_signal,
        "confidence": round(confidence, 6),
        "threshold": threshold,
        "probabilities": probability_by_class,
        "user_facing": SIGNAL_TEXT[output_signal],
        "safety_statement": SAFETY_STATEMENT,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Predict a clock drawing signal from one image.")
    parser.add_argument("--image", type=Path, required=True, help="Path to a clock drawing image.")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL_PATH, help="Path to saved joblib model.")
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_THRESHOLD,
        help="Return uncertain when max class probability is below this value.",
    )
    args = parser.parse_args()

    print(json.dumps(predict_image(args.image, args.model, args.threshold), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
