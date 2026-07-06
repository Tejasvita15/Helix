from pathlib import Path
from PIL import Image
import pandas as pd
import matplotlib.pyplot as plt
import argparse

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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data_dir",
        default="clock_shulman",
        help="Path to unzipped clock_shulman folder"
    )
    args = parser.parse_args()

    data_dir = Path(args.data_dir)

    if not data_dir.exists():
        print(f"Could not find folder: {data_dir}")
        print("\nCurrent folder contains:")
        for p in Path(".").iterdir():
            print(" -", p)
        return

    df = collect_images(data_dir)

    if df.empty:
        print("No images found.")
        print("Check if your images are inside folders like 0, 1, 2, 3, 4, 5.")
        return

    print("\nTotal images:", len(df))

    print("\nClass counts:")
    print(df["label"].value_counts().sort_index())

    print("\nFirst few image paths:")
    print(df.head())

    labels = sorted(df["label"].unique())

    max_samples_per_label = 3

    fig, axes = plt.subplots(
        len(labels),
        max_samples_per_label,
        figsize=(max_samples_per_label * 3, len(labels) * 3),
        squeeze=False
    )

    for row_idx, label in enumerate(labels):
        label_df = df[df["label"] == label]

        sample_df = label_df.sample(
            n=min(max_samples_per_label, len(label_df)),
            random_state=42
        )

        for col_idx in range(max_samples_per_label):
            ax = axes[row_idx, col_idx]
            ax.axis("off")

            if col_idx >= len(sample_df):
                continue

            item = sample_df.iloc[col_idx]

            try:
                img = Image.open(item["path"]).convert("L")
                ax.imshow(img, cmap="gray")
                ax.set_title(f"Label: {label}")
            except Exception as e:
                ax.set_title("Error")
                print(f"Could not open image: {item['path']}")
                print(e)

    plt.tight_layout()
    output_file = "clock_dataset_samples.png"
    plt.savefig(output_file, dpi=150)

    print(f"\nSaved sample preview to: {output_file}")


if __name__ == "__main__":
    main()