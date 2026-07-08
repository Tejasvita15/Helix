"""Reusable inference adapter for experimental clock drawing CNN checkpoints."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
from typing import Any

from PIL import Image
import torch
from torch import nn
from torchvision import models, transforms

try:
    from ...labels import HIGHER_SIGNAL, LOW_SIGNAL, MEDIUM_SIGNAL, UNCERTAIN_SIGNAL
    from .dataset import IMAGE_SIZE
    from .train_cnn import IMAGENET_MEAN, IMAGENET_STD, SUPPORTED_MODELS, resolve_device
except ImportError:  # pragma: no cover - supports direct script execution.
    from ml.drawing.clock_signal.labels import HIGHER_SIGNAL, LOW_SIGNAL, MEDIUM_SIGNAL, UNCERTAIN_SIGNAL
    from dataset import IMAGE_SIZE
    from train_cnn import IMAGENET_MEAN, IMAGENET_STD, SUPPORTED_MODELS, resolve_device


DEFAULT_CLASS_ORDER = [LOW_SIGNAL, MEDIUM_SIGNAL, HIGHER_SIGNAL]
DOMAINS = ["visuospatial", "planning"]
DEFAULT_THRESHOLD = 0.60


@dataclass(frozen=True)
class LoadedCnnModel:
    """Loaded experimental CNN plus metadata needed for inference."""

    model: nn.Module
    classes: list[str]
    device: torch.device
    model_name: str
    image_size: int
    mean: tuple[float, float, float]
    std: tuple[float, float, float]
    model_version: str
    scoring_mode: str


def load_cnn_model(
    model_path: Path | str,
    model_info_path: Path | str | None = None,
    device: str = "auto",
) -> LoadedCnnModel:
    """Load a CNN checkpoint saved as a state dict or checkpoint dictionary."""

    checkpoint_path = Path(model_path)
    if not checkpoint_path.exists():
        raise FileNotFoundError(f"CNN model artifact not found: {checkpoint_path}")

    model_info = _load_model_info(model_info_path)
    checkpoint = torch.load(checkpoint_path, map_location="cpu")
    state_dict = _extract_state_dict(checkpoint)
    model_name = _resolve_model_name(checkpoint_path, checkpoint, model_info)
    classes = _resolve_classes(checkpoint, model_info)
    image_size = int(model_info.get("image_size") or _checkpoint_get(checkpoint, "image_size") or IMAGE_SIZE)
    mean, std = _resolve_normalization(checkpoint, model_info)

    model = _build_inference_model(model_name=model_name, num_classes=len(classes))
    cleaned_state_dict = _strip_state_dict_prefixes(state_dict)
    try:
        model.load_state_dict(cleaned_state_dict)
    except RuntimeError as exc:
        raise RuntimeError(
            f"Could not load {checkpoint_path} as {model_name} with {len(classes)} classes. "
            "Check model_info class order and architecture."
        ) from exc

    selected_device = resolve_device(device)
    model = model.to(selected_device)
    model.eval()

    return LoadedCnnModel(
        model=model,
        classes=classes,
        device=selected_device,
        model_name=model_name,
        image_size=image_size,
        mean=mean,
        std=std,
        model_version=str(model_info.get("model_version") or f"{model_name}_clock_cnn_v0"),
        scoring_mode=str(model_info.get("scoring_mode") or f"cnn_{model_name}_experimental"),
    )


def score_cnn_image(
    image_path_or_pil: Image.Image | Path | str,
    model_path: Path | str,
    model_info_path: Path | str | None = None,
    threshold: float = DEFAULT_THRESHOLD,
    device: str = "auto",
) -> dict[str, Any]:
    """Score a clock image with the experimental CNN and return product-shaped JSON."""

    if not 0 <= threshold <= 1:
        raise ValueError("threshold must be between 0 and 1.")

    loaded = load_cnn_model(model_path=model_path, model_info_path=model_info_path, device=device)
    tensor = _image_to_tensor(image_path_or_pil, loaded).unsqueeze(0).to(loaded.device)

    with torch.no_grad():
        probabilities = torch.softmax(loaded.model(tensor), dim=1).cpu()[0]

    best_index = int(torch.argmax(probabilities).item())
    confidence = float(probabilities[best_index].item())
    predicted_signal = loaded.classes[best_index]
    signal_band = UNCERTAIN_SIGNAL if confidence < threshold else predicted_signal
    class_probabilities = {
        loaded.classes[index]: round(float(probability.item()), 6)
        for index, probability in enumerate(probabilities)
    }

    return _build_safe_result(
        signal_band=signal_band,
        confidence=confidence,
        model_version=loaded.model_version,
        scoring_mode=loaded.scoring_mode,
        class_probabilities=class_probabilities,
    )


def _build_inference_model(model_name: str, num_classes: int) -> nn.Module:
    if model_name == "resnet18":
        model = models.resnet18(weights=None)
        model.fc = nn.Linear(model.fc.in_features, num_classes)
        return model
    if model_name == "densenet121":
        model = models.densenet121(weights=None)
        model.classifier = nn.Linear(model.classifier.in_features, num_classes)
        return model
    if model_name == "efficientnet_b0":
        model = models.efficientnet_b0(weights=None)
        model.classifier[-1] = nn.Linear(model.classifier[-1].in_features, num_classes)
        return model
    raise ValueError(f"Unsupported CNN architecture: {model_name}")


def _load_model_info(model_info_path: Path | str | None) -> dict[str, Any]:
    if model_info_path is None:
        return {}
    info_path = Path(model_info_path)
    if not info_path.exists():
        raise FileNotFoundError(f"CNN model info file not found: {info_path}")
    with info_path.open("r", encoding="utf-8") as file:
        payload = json.load(file)
    if not isinstance(payload, dict):
        raise ValueError(f"CNN model info must be a JSON object: {info_path}")
    return payload


def _extract_state_dict(checkpoint: Any) -> dict[str, torch.Tensor]:
    if isinstance(checkpoint, dict):
        for key in ("model_state_dict", "state_dict"):
            value = checkpoint.get(key)
            if isinstance(value, dict):
                return value
        if checkpoint and all(torch.is_tensor(value) for value in checkpoint.values()):
            return checkpoint
    raise ValueError("CNN checkpoint must be a raw state_dict or include model_state_dict/state_dict.")


def _resolve_model_name(model_path: Path, checkpoint: Any, model_info: dict[str, Any]) -> str:
    candidates = [
        model_info.get("model_name"),
        _checkpoint_get(checkpoint, "model_name"),
        *_model_name_candidates_from_path(model_path),
    ]
    for candidate in candidates:
        if isinstance(candidate, str) and candidate in SUPPORTED_MODELS:
            return candidate
    raise ValueError(
        "Could not infer CNN architecture. Provide model_info with model_name "
        f"one of: {', '.join(SUPPORTED_MODELS)}."
    )


def _model_name_candidates_from_path(path: Path) -> list[str]:
    path_text = path.name.lower()
    return [model_name for model_name in SUPPORTED_MODELS if model_name in path_text]


def _resolve_classes(checkpoint: Any, model_info: dict[str, Any]) -> list[str]:
    raw_classes = model_info.get("classes") or _checkpoint_get(checkpoint, "classes") or DEFAULT_CLASS_ORDER
    classes = [str(label) for label in raw_classes]
    if not classes:
        raise ValueError("CNN class order cannot be empty.")
    return classes


def _resolve_normalization(checkpoint: Any, model_info: dict[str, Any]) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    normalization = model_info.get("normalization") or _checkpoint_get(checkpoint, "normalization") or {}
    mean = tuple(float(value) for value in normalization.get("mean", IMAGENET_MEAN))
    std = tuple(float(value) for value in normalization.get("std", IMAGENET_STD))
    if len(mean) != 3 or len(std) != 3:
        raise ValueError("CNN normalization mean/std must contain three values each.")
    return mean, std


def _strip_state_dict_prefixes(state_dict: dict[str, torch.Tensor]) -> dict[str, torch.Tensor]:
    cleaned: dict[str, torch.Tensor] = {}
    for key, value in state_dict.items():
        cleaned_key = key
        for prefix in ("module.", "model."):
            if cleaned_key.startswith(prefix):
                cleaned_key = cleaned_key[len(prefix) :]
        cleaned[cleaned_key] = value
    return cleaned


def _image_to_tensor(image_path_or_pil: Image.Image | Path | str, loaded: LoadedCnnModel) -> torch.Tensor:
    transform = transforms.Compose(
        [
            transforms.Resize((loaded.image_size, loaded.image_size)),
            transforms.ToTensor(),
            transforms.Normalize(loaded.mean, loaded.std),
        ]
    )
    if isinstance(image_path_or_pil, Image.Image):
        return transform(image_path_or_pil.convert("RGB"))
    with Image.open(Path(image_path_or_pil)) as image:
        return transform(image.convert("RGB"))


def _checkpoint_get(checkpoint: Any, key: str) -> Any:
    if isinstance(checkpoint, dict):
        return checkpoint.get(key)
    return None


def _build_safe_result(
    signal_band: str,
    confidence: float,
    model_version: str,
    scoring_mode: str,
    class_probabilities: dict[str, float] | None = None,
) -> dict[str, Any]:
    safe_signal = signal_band if signal_band in (*DEFAULT_CLASS_ORDER, UNCERTAIN_SIGNAL) else UNCERTAIN_SIGNAL
    return {
        "task": "clock_drawing",
        "task_completed": True,
        "signal_band": safe_signal,
        "confidence": round(float(confidence), 6),
        "domains": DOMAINS,
        "explanation": _explanation_for_signal(safe_signal),
        "report_summary": _report_summary_for_signal(safe_signal),
        "model_version": model_version,
        "scoring_mode": scoring_mode,
        "class_probabilities": class_probabilities or {},
    }


def _explanation_for_signal(signal_band: str) -> str:
    if signal_band == LOW_SIGNAL:
        return "No strong visuospatial/planning signal was detected in this clock image. This is not a diagnosis."
    if signal_band == MEDIUM_SIGNAL:
        return "A possible visuospatial/planning signal was detected in this clock image. This is not a diagnosis."
    if signal_band == HIGHER_SIGNAL:
        return "A stronger possible visuospatial/planning signal was detected in this clock image. This is not a diagnosis."
    return "The drawing could not be scored confidently by the experimental CNN. This is not a diagnosis."


def _report_summary_for_signal(signal_band: str) -> str:
    if signal_band == LOW_SIGNAL:
        return "Experimental CNN review found no strong visuospatial/planning signal in this clock image."
    if signal_band == MEDIUM_SIGNAL:
        return "Experimental CNN review found a possible visuospatial/planning signal worth monitoring."
    if signal_band == HIGHER_SIGNAL:
        return "Experimental CNN review found a stronger possible visuospatial/planning signal. Consider follow-up if concerns are new, persistent, or affecting daily life."
    return "Experimental CNN review was uncertain. Consider retrying with a complete clock drawing."
