"""Zip-backed dataset utilities for experimental clock drawing CNN baselines."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from io import BytesIO
import json
from pathlib import Path, PurePosixPath
from typing import Any
import zipfile

from PIL import Image
from sklearn.model_selection import train_test_split

try:
    from ....labels import SIGNAL_CLASSES, infer_shulman_score_from_folder, shulman_score_to_signal
except ImportError:  # pragma: no cover - supports direct script execution.
    from ml.drawing.clock_signal.labels import SIGNAL_CLASSES, infer_shulman_score_from_folder, shulman_score_to_signal


PACKAGE_DIR = Path(__file__).resolve().parent
REPO_ROOT = Path(__file__).resolve().parents[5]
DEFAULT_ZIP_PATH = REPO_ROOT / "research" / "drawing" / "cdt-api-network" / "clock_shulman.zip"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}
IMAGE_SIZE = 224
CLASS_NAMES = tuple(SIGNAL_CLASSES)
CLASS_TO_INDEX = {label: index for index, label in enumerate(CLASS_NAMES)}
ORIGINAL_SHULMAN_FOLDERS = (
    "5_perfect_clock",
    "4_minor_VIS_errors",
    "3_hands_vis_errors",
    "2_mod_vis_xhands",
    "1_severe_vis",
    "0_no_clock",
)


@dataclass(frozen=True)
class ClockCnnRecord:
    member_name: str
    source_folder: str
    shulman_score: int
    signal_label: str
    class_index: int

    def to_dict(self) -> dict[str, str | int]:
        return asdict(self)


def list_clock_records(zip_path: Path = DEFAULT_ZIP_PATH) -> list[ClockCnnRecord]:
    """List labelled image records from the original Shulman score folders."""

    records: list[ClockCnnRecord] = []
    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.infolist():
            if member.is_dir() or member.filename.startswith("__MACOSX/"):
                continue

            path = PurePosixPath(member.filename)
            if path.suffix.lower() not in IMAGE_EXTENSIONS:
                continue

            source_folder = _find_original_score_folder(path)
            if source_folder is None:
                continue

            shulman_score = infer_shulman_score_from_folder(source_folder)
            signal_label = shulman_score_to_signal(shulman_score)
            records.append(
                ClockCnnRecord(
                    member_name=member.filename,
                    source_folder=source_folder,
                    shulman_score=shulman_score,
                    signal_label=signal_label,
                    class_index=CLASS_TO_INDEX[signal_label],
                )
            )

    return sorted(records, key=lambda record: record.member_name)


def make_stratified_splits(
    records: list[ClockCnnRecord],
    seed: int,
    validation_size: float = 0.2,
    test_size: float = 0.2,
) -> dict[str, list[int]]:
    """Create stratified train/validation/test index splits."""

    if validation_size <= 0 or test_size <= 0 or validation_size + test_size >= 1:
        raise ValueError("validation_size and test_size must be positive and sum to less than 1.")
    if not records:
        raise ValueError("No records were provided for splitting.")

    indices = list(range(len(records)))
    labels = [record.signal_label for record in records]
    train_validation_idx, test_idx = train_test_split(
        indices,
        test_size=test_size,
        random_state=seed,
        stratify=labels,
    )
    relative_validation_size = validation_size / (1.0 - test_size)
    train_idx, validation_idx = train_test_split(
        train_validation_idx,
        test_size=relative_validation_size,
        random_state=seed,
        stratify=[labels[index] for index in train_validation_idx],
    )
    return {
        "train": sorted(int(index) for index in train_idx),
        "validation": sorted(int(index) for index in validation_idx),
        "test": sorted(int(index) for index in test_idx),
    }


def save_split_metadata(
    path: Path,
    records: list[ClockCnnRecord],
    splits: dict[str, list[int]],
    seed: int,
    validation_size: float,
    test_size: float,
    zip_path: Path,
) -> None:
    """Save split metadata so other baselines can reuse the same member lists."""

    payload = {
        "dataset_source": str(zip_path),
        "seed": seed,
        "validation_size": validation_size,
        "test_size": test_size,
        "classes": list(CLASS_NAMES),
        "label_mapping": {
            "shulman_5": "low_signal",
            "shulman_4": "medium_signal",
            "shulman_0_1_2_3": "higher_signal",
        },
        "record_count": len(records),
        "source_folder_counts": _count_values(record.source_folder for record in records),
        "signal_counts": _count_values(record.signal_label for record in records),
        "splits": {
            split_name: {
                "count": len(split_indices),
                "member_names": [records[index].member_name for index in split_indices],
                "signal_counts": _count_values(records[index].signal_label for index in split_indices),
            }
            for split_name, split_indices in splits.items()
        },
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2, sort_keys=True)
        file.write("\n")


def load_split_metadata(path: Path, records: list[ClockCnnRecord]) -> dict[str, list[int]]:
    """Load split member lists and convert them to indices for the current records."""

    with path.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    index_by_member = {record.member_name: index for index, record in enumerate(records)}
    splits: dict[str, list[int]] = {}
    for split_name in ("train", "validation", "test"):
        member_names = payload["splits"][split_name]["member_names"]
        splits[split_name] = [index_by_member[member_name] for member_name in member_names if member_name in index_by_member]
    return splits


def load_rgb_image_from_zip(zip_path: Path, member_name: str) -> Image.Image:
    """Read one image directly from the zip archive as RGB."""

    with zipfile.ZipFile(zip_path) as archive:
        image_bytes = archive.read(member_name)
    with Image.open(BytesIO(image_bytes)) as image:
        return image.convert("RGB")


class ClockZipImageDataset:
    """Torch-compatible dataset that reads images from the source zip on demand."""

    def __init__(
        self,
        zip_path: Path,
        records: list[ClockCnnRecord],
        indices: list[int],
        transform: Any | None = None,
    ) -> None:
        self.zip_path = zip_path
        self.records = records
        self.indices = indices
        self.transform = transform

    def __len__(self) -> int:
        return len(self.indices)

    def __getitem__(self, item: int) -> tuple[Any, int]:
        record = self.records[self.indices[item]]
        image = load_rgb_image_from_zip(self.zip_path, record.member_name)
        if self.transform is not None:
            image = self.transform(image)
        return image, record.class_index


def records_to_labels(records: list[ClockCnnRecord], indices: list[int]) -> list[int]:
    return [records[index].class_index for index in indices]


def _find_original_score_folder(path: PurePosixPath) -> str | None:
    for parent in path.parents:
        if parent.name in ORIGINAL_SHULMAN_FOLDERS:
            return parent.name
    return None


def _count_values(values: Any) -> dict[str, int]:
    counts: dict[str, int] = {}
    for value in values:
        key = str(value)
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items()))
