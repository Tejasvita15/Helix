from pathlib import Path
from PIL import Image
import argparse
import json
import re
import numpy as np
import pandas as pd
import joblib

from skimage.feature import hog
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import LinearSVC
from sklearn.metrics import classification_report, confusion_matrix

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}


def collect_images(data_dir: Path):
    rows = []

    class_dirs = [p for p in data_dir.iterdir() if p.is_dir()]

    for class_dir in sorted(class_dirs):
        image_paths = [
            p for p in class_dir.rglob("*")
            if p.suffix.lower() in IMAGE_EXTS
        ]

        for img_path in image_paths:
            rows.append({
                "path": str(img_path),
                "label": class_dir.name
            })

    return pd.DataFrame(rows)


def extract_score(label: str):
    """
    Converts labels like '0', 'score_0', 'shulman_5' into numeric score.
    """
    nums = re.findall(r"\d+", label)
    if not nums:
        raise ValueError(f"Could not extract numeric score from label: {label}")
    return int(nums[-1])


def score_to_signal_group(score: int):
    """
    Safer hackathon grouping.

    4-5: low signal
    3: medium signal
    0-2: higher signal

    This is NOT diagnosis.
    """
    if score >= 4:
        return "low_signal"
    elif score == 3:
        return "medium_signal"
    else:
        return "higher_signal"


def image_to_hog_features(image_path: str, image_size: int = 128):
    img = Image.open(image_path).convert("L")
    img = img.resize((image_size, image_size))

    arr = np.array(img).astype("float32") / 255.0

    features = hog(
        arr,
        orientations=9,
        pixels_per_cell=(8, 8),
        cells_per_block=(2, 2),
        block_norm="L2-Hys"
    )

    return features


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data_dir",
        default="clock_shulman",
        help="Path to unzipped clock_shulman folder"
    )
    parser.add_argument(
        "--output_model",
        default="clock_hog_svm.joblib",
        help="Output model path"
    )
    args = parser.parse_args()

    data_dir = Path(args.data_dir)

    if not data_dir.exists():
        print(f"Could not find dataset folder: {data_dir}")
        return

    df = collect_images(data_dir)

    if df.empty:
        print("No images found.")
        return

    df["score"] = df["label"].apply(extract_score)
    df["signal_group"] = df["score"].apply(score_to_signal_group)

    print("\nTotal images:", len(df))
    print("\nOriginal score distribution:")
    print(df["score"].value_counts().sort_index())

    print("\nSignal group distribution:")
    print(df["signal_group"].value_counts())

    print("\nExtracting HOG features...")
    X = np.vstack([
        image_to_hog_features(path)
        for path in df["path"].tolist()
    ])

    y = df["signal_group"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y
    )

    model = make_pipeline(
        StandardScaler(),
        LinearSVC(class_weight="balanced", max_iter=10000)
    )

    print("\nTraining model...")
    model.fit(X_train, y_train)

    print("\nEvaluating model...")
    y_pred = model.predict(X_test)

    print("\nClassification report:")
    print(classification_report(y_test, y_pred))

    print("\nConfusion matrix:")
    print(confusion_matrix(y_test, y_pred, labels=sorted(set(y))))

    payload = {
        "model": model,
        "image_size": 128,
        "label_type": "signal_group",
        "classes": sorted(set(y))
    }

    joblib.dump(payload, args.output_model)

    with open("clock_model_info.json", "w") as f:
        json.dump(
            {
                "image_size": 128,
                "label_type": "signal_group",
                "classes": sorted(set(y)),
                "mapping": {
                    "scores_4_5": "low_signal",
                    "score_3": "medium_signal",
                    "scores_0_1_2": "higher_signal"
                }
            },
            f,
            indent=2
        )

    print(f"\nSaved model to: {args.output_model}")
    print("Saved model info to: clock_model_info.json")


if __name__ == "__main__":
    main()