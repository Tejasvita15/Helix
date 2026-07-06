from pathlib import Path
from PIL import Image
import argparse
import numpy as np
import joblib

from skimage.feature import hog


def image_to_hog_features(image_path: str, image_size: int):
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

    return features.reshape(1, -1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="clock_hog_svm.joblib")
    parser.add_argument("--image", required=True)
    args = parser.parse_args()

    payload = joblib.load(args.model)

    model = payload["model"]
    image_size = payload["image_size"]

    X = image_to_hog_features(args.image, image_size)
    prediction = model.predict(X)[0]

    print("\nPrediction:", prediction)

    if prediction == "low_signal":
        print("App text: No strong visuospatial signal detected.")
    elif prediction == "medium_signal":
        print("App text: Possible visuospatial / planning signal. Repeat recommended.")
    else:
        print("App text: Possible visuospatial / planning signal. Consider follow-up if this is new or affecting daily life.")


if __name__ == "__main__":
    main()