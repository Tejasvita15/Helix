"""Image loading and HOG feature extraction for the clock drawing baseline."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from io import BytesIO
from pathlib import Path, PurePosixPath
import re
import zipfile

import numpy as np
from PIL import Image, UnidentifiedImageError
from skimage.feature import hog

try:
    from .labels import infer_shulman_score_from_folder, shulman_score_to_signal
except ImportError:  # pragma: no cover - supports direct script execution.
    from labels import infer_shulman_score_from_folder, shulman_score_to_signal


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}
IMAGE_SIZE = 128
HOG_CONFIG = {
    "orientations": 9,
    "pixels_per_cell": (8, 8),
    "cells_per_block": (2, 2),
    "block_norm": "L2-Hys",
}


@dataclass(frozen=True)
class ClockImageRecord:
    """One labelled image entry inside the source zip."""

    member_name: str
    source_folder: str
    shulman_score: int
    signal_label: str

    def to_dict(self) -> dict[str, str | int]:
        return asdict(self)


def iter_clock_image_records(zip_path: Path) -> list[ClockImageRecord]:
    """List labelled image records from a Shulman-folder zip archive."""

    records: list[ClockImageRecord] = []
    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.infolist():
            if member.is_dir() or member.filename.startswith("__MACOSX/"):
                continue

            path = PurePosixPath(member.filename)
            if path.suffix.lower() not in IMAGE_EXTENSIONS:
                continue

            score, source_folder = _infer_score_from_member(path)
            records.append(
                ClockImageRecord(
                    member_name=member.filename,
                    source_folder=source_folder,
                    shulman_score=score,
                    signal_label=shulman_score_to_signal(score),
                )
            )

    return sorted(records, key=lambda record: record.member_name)


def extract_hog_features_from_zip(zip_path: Path, record: ClockImageRecord) -> np.ndarray:
    """Load one zip image as grayscale and return its HOG feature vector."""

    with zipfile.ZipFile(zip_path) as archive:
        image_bytes = archive.read(record.member_name)
    return extract_hog_features_from_bytes(image_bytes)


def extract_hog_features_from_path(image_path: Path, image_size: int = IMAGE_SIZE) -> np.ndarray:
    """Load one image path as grayscale and return its HOG feature vector."""

    return extract_hog_features_from_bytes(image_path.read_bytes(), image_size=image_size)


def extract_hog_features_from_bytes(image_bytes: bytes, image_size: int = IMAGE_SIZE) -> np.ndarray:
    """Convert image bytes to grayscale 128x128 HOG features."""

    array = image_bytes_to_grayscale_array(image_bytes, image_size=image_size)
    return hog(array, **HOG_CONFIG)


def image_bytes_to_grayscale_array(image_bytes: bytes, image_size: int = IMAGE_SIZE) -> np.ndarray:
    """Convert image bytes to a normalized grayscale array."""

    try:
        with Image.open(BytesIO(image_bytes)) as image:
            grayscale = image.convert("L")
            resized = grayscale.resize((image_size, image_size), Image.Resampling.LANCZOS)
            return np.asarray(resized, dtype=np.float32) / 255.0
    except UnidentifiedImageError as exc:
        raise ValueError("Could not read image bytes as a supported image file.") from exc


def _infer_score_from_member(path: PurePosixPath) -> tuple[int, str]:
    for parent in path.parents:
        if parent.name in ("", "."):
            continue
        try:
            return infer_shulman_score_from_folder(parent.name), parent.name
        except ValueError:
            continue

    filename_match = re.search(r"_(?P<score>[0-5])$", path.stem)
    if filename_match:
        return int(filename_match.group("score")), path.name

    raise ValueError(f"Could not infer Shulman score from zip member: {path}")
