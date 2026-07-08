# Clock Signal Baseline Model Card

## Intended Use

This baseline is a MindTrail-owned research/MVP pipeline for Clock Drawing Test
image scoring. It converts a clock image into one of four non-diagnostic output
signals:

- `low_signal`
- `medium_signal`
- `higher_signal`
- `uncertain`

This is not a diagnosis. Please discuss new or worsening concerns with a
healthcare professional.

## Training Data

The trainer reads images directly from:

```text
research/drawing/cdt-api-network/clock_shulman.zip
```

Images are labelled from source folder names such as:

- `5_perfect_clock`
- `4_minor_VIS_errors`
- `3_hands_vis_errors`
- `2_mod_vis_xhands`
- `1_severe_vis`
- `0_no_clock`

The source score is mapped to MindTrail signal labels:

| Source score | Output signal |
| --- | --- |
| 5 | `low_signal` |
| 4 | `medium_signal` |
| 0, 1, 2, 3 | `higher_signal` |

## Pipeline

1. Read each image from the zip archive.
2. Convert to grayscale.
3. Resize to `128x128`.
4. Extract HOG features.
5. Train `LogisticRegression(class_weight="balanced")`.
6. Evaluate with stratified train/validation/test splits.

The prediction CLI returns `uncertain` when the highest class probability is
below the configured threshold.

## Artifacts

Training writes:

- `artifacts/clock_signal_baseline.joblib`
- `artifacts/clock_signal_model_info.json`
- `artifacts/evaluation_report.json`
- `artifacts/confusion_matrix.csv`

## Metrics Summary

Held-out test metrics from the saved `evaluation_report.json`:

| Metric | Value |
| --- | ---: |
| Accuracy | 0.669342 |
| Balanced accuracy | 0.663231 |
| Macro F1 | 0.658051 |

These metrics are for baseline engineering review only. They are not evidence
for care decisions.

## Example Commands

Train:

```bash
python -m ml.drawing.clock_signal.train_baseline
```

Predict:

```bash
python -m ml.drawing.clock_signal.predict \
  --image path/to/clock.png \
  --model ml/drawing/clock_signal/artifacts/clock_signal_baseline.joblib \
  --threshold 0.55
```

Evaluate a saved model on all labelled zip images:

```bash
python -m ml.drawing.clock_signal.evaluate
```

## Limitations

- This baseline is not validated for care use.
- It is an image classifier, while the production drawing flow in MindTrail is
  expected to use mobile-captured stroke data.
- It may learn dataset-specific visual patterns that do not generalize to phone
  photos, stylus input, or scanned forms.
- It should not be used for automated care decisions.
- Validation, fairness checks, and a reviewed data-governance workflow are TODOs
  before any real-world use.
