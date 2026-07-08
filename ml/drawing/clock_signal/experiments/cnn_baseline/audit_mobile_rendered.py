"""Compare experimental CNN and stable HOG scoring on mobile-rendered images."""

from __future__ import annotations

import argparse
from collections import Counter
import csv
import json
from pathlib import Path
from typing import Any


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}
EMPTY_AUDIT_MESSAGE = "No rendered images found. Generate mobile debug renders later and rerun this audit."


def audit_mobile_rendered_images(
    images_dir: Path,
    cnn_model_path: Path,
    cnn_model_info: Path | None,
    hog_model_path: Path,
    output_dir: Path,
    threshold: float = 0.60,
    device: str = "auto",
) -> dict[str, Any]:
    """Run CNN and HOG scorers on rendered mobile images and write audit artifacts."""

    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / "mobile_rendered_audit.csv"
    summary_path = output_dir / "mobile_rendered_audit_summary.json"
    image_paths = _list_images(images_dir)

    if not image_paths:
        summary = _build_summary(
            rows=[],
            threshold=threshold,
            cnn_model_path=cnn_model_path,
            hog_model_path=hog_model_path,
        )
        _write_csv(csv_path, [])
        _write_json(summary_path, summary)
        print(EMPTY_AUDIT_MESSAGE)
        return summary

    try:
        from ml.drawing.clock_signal.scorer import score_image as score_hog_image
    except Exception as exc:
        score_hog_image = None
        hog_import_error = _format_error(exc)
    else:
        hog_import_error = None

    try:
        from .cnn_scorer import score_cnn_image
    except Exception as exc:
        if __package__:
            score_cnn_image = None
            cnn_import_error = _format_error(exc)
        else:  # pragma: no cover - supports direct script execution.
            try:
                from cnn_scorer import score_cnn_image
            except Exception as fallback_exc:
                score_cnn_image = None
                cnn_import_error = _format_error(fallback_exc)
            else:
                cnn_import_error = None
    else:
        cnn_import_error = None

    rows: list[dict[str, Any]] = []
    for image_path in image_paths:
        if score_cnn_image is None:
            cnn_result = _error_result(cnn_import_error or "cnn_import_failed")
            cnn_error = cnn_result["error"]
        else:
            try:
                cnn_result = score_cnn_image(
                    image_path_or_pil=image_path,
                    model_path=cnn_model_path,
                    model_info_path=cnn_model_info,
                    threshold=threshold,
                    device=device,
                )
                cnn_error = ""
            except Exception as exc:
                cnn_result = _error_result(_format_error(exc))
                cnn_error = cnn_result["error"]

        if score_hog_image is None:
            hog_result = _error_result(hog_import_error or "hog_import_failed")
            hog_error = hog_result["error"]
        else:
            try:
                hog_result = score_hog_image(
                    image_or_path=image_path,
                    model_path=hog_model_path,
                    threshold=threshold,
                )
                hog_error = ""
            except Exception as exc:
                hog_result = _error_result(_format_error(exc))
                hog_error = hog_result["error"]

        rows.append(
            {
                "filename": str(image_path.name),
                "hog_signal": hog_result.get("signal_band"),
                "hog_confidence": hog_result.get("confidence"),
                "cnn_signal": cnn_result.get("signal_band"),
                "cnn_confidence": cnn_result.get("confidence"),
                "agreement": bool(hog_result.get("signal_band") == cnn_result.get("signal_band")),
                "cnn_scoring_mode": cnn_result.get("scoring_mode"),
                "hog_scoring_mode": hog_result.get("scoring_mode"),
                "cnn_error": cnn_error,
                "hog_error": hog_error,
            }
        )

    summary = _build_summary(
        rows=rows,
        threshold=threshold,
        cnn_model_path=cnn_model_path,
        hog_model_path=hog_model_path,
    )
    _write_csv(csv_path, rows)
    _write_json(summary_path, summary)
    _print_summary(summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit mobile-rendered clock images with CNN and HOG scorers.")
    parser.add_argument("--images-dir", type=Path, required=True, help="Directory containing PNG/JPG/JPEG renders.")
    parser.add_argument("--cnn-model-path", type=Path, required=True, help="Path to experimental CNN checkpoint.")
    parser.add_argument("--cnn-model-info", type=Path, default=None, help="Optional CNN model_info JSON.")
    parser.add_argument("--hog-model-path", type=Path, required=True, help="Path to stable HOG/logistic model artifact.")
    parser.add_argument("--output-dir", type=Path, required=True, help="Directory for audit CSV/JSON outputs.")
    parser.add_argument("--threshold", type=float, default=0.60)
    parser.add_argument("--device", choices=("cuda", "mps", "cpu", "auto"), default="auto")
    args = parser.parse_args()

    audit_mobile_rendered_images(
        images_dir=args.images_dir,
        cnn_model_path=args.cnn_model_path,
        cnn_model_info=args.cnn_model_info,
        hog_model_path=args.hog_model_path,
        output_dir=args.output_dir,
        threshold=args.threshold,
        device=args.device,
    )


def _list_images(images_dir: Path) -> list[Path]:
    if not images_dir.exists() or not images_dir.is_dir():
        return []
    return sorted(
        path
        for path in images_dir.iterdir()
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )


def _build_summary(
    rows: list[dict[str, Any]],
    threshold: float,
    cnn_model_path: Path,
    hog_model_path: Path,
) -> dict[str, Any]:
    total_images = len(rows)
    cnn_counts = Counter(str(row.get("cnn_signal")) for row in rows)
    hog_counts = Counter(str(row.get("hog_signal")) for row in rows)
    agreement_count = sum(1 for row in rows if row.get("agreement"))
    return {
        "total_images": total_images,
        "cnn_prediction_counts": dict(sorted(cnn_counts.items())),
        "hog_prediction_counts": dict(sorted(hog_counts.items())),
        "agreement_rate": round(agreement_count / total_images, 6) if total_images else None,
        "cnn_uncertain_count": int(cnn_counts.get("uncertain", 0)),
        "hog_uncertain_count": int(hog_counts.get("uncertain", 0)),
        "threshold": threshold,
        "cnn_model_path": str(cnn_model_path),
        "hog_model_path": str(hog_model_path),
    }


def _write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fieldnames = [
        "filename",
        "hog_signal",
        "hog_confidence",
        "cnn_signal",
        "cnn_confidence",
        "agreement",
        "cnn_scoring_mode",
        "hog_scoring_mode",
        "cnn_error",
        "hog_error",
    ]
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2, sort_keys=True)
        file.write("\n")


def _print_summary(summary: dict[str, Any]) -> None:
    print(
        json.dumps(
            {
                "total_images": summary["total_images"],
                "cnn_prediction_counts": summary["cnn_prediction_counts"],
                "hog_prediction_counts": summary["hog_prediction_counts"],
                "agreement_rate": summary["agreement_rate"],
            },
            indent=2,
            sort_keys=True,
        )
    )


def _error_result(error: str) -> dict[str, Any]:
    return {
        "signal_band": "error",
        "confidence": None,
        "scoring_mode": "unavailable",
        "error": error,
    }


def _format_error(exc: Exception) -> str:
    return f"{type(exc).__name__}: {exc}"


if __name__ == "__main__":
    main()
