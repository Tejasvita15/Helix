# Experimental Clock CNN Baseline

This folder contains an experimental transfer-learning CNN baseline for Clock
Drawing Test visual signal scoring.

It is separate from the stable demo scorer in `ml/drawing/clock_signal/` and is
not wired into `services/api` or `apps/mobile`.

## Scope

The model predicts general clock drawing quality signals only:

- `low_signal`
- `medium_signal`
- `higher_signal`
- `uncertain`

It does not validate dynamic prompt-specific hand time correctness. For example,
it should not be treated as proof that a drawing correctly shows "10 past 11."

## Data Source

Training reads images directly from:

```text
research/drawing/cdt-api-network/clock_shulman.zip
```

No raw images are extracted into the repository.

Folder score mapping:

| Source score folder | Signal |
| --- | --- |
| `5_perfect_clock` | `low_signal` |
| `4_minor_VIS_errors` | `medium_signal` |
| `3_hands_vis_errors` | `higher_signal` |
| `2_mod_vis_xhands` | `higher_signal` |
| `1_severe_vis` | `higher_signal` |
| `0_no_clock` | `higher_signal` |

## Install Notes

This experiment requires PyTorch and torchvision in addition to the existing ML
dependencies. Keep those dependencies out of the production backend unless this
experiment is intentionally promoted later.

## Train

```bash
python -m ml.drawing.clock_signal.experiments.cnn_baseline.train_cnn \
  --zip research/drawing/cdt-api-network/clock_shulman.zip \
  --model resnet18 \
  --epochs 8 \
  --batch-size 32 \
  --lr 0.0001 \
  --output-dir ml/drawing/clock_signal/experiments/cnn_baseline/artifacts \
  --seed 42 \
  --device auto
```

Supported models:

- `resnet18`
- `densenet121`
- `efficientnet_b0`

Training writes:

- `artifacts/<model_name>_clock_cnn.pt`
- `artifacts/<model_name>_model_info.json`
- `artifacts/<model_name>_evaluation_report.json`
- `artifacts/<model_name>_confusion_matrix.csv`
- `artifacts/<model_name>_split_metadata.json`

The split metadata stores member names for train/validation/test so other
baselines can reuse the same split for fair comparison.

## Evaluate

```bash
python -m ml.drawing.clock_signal.experiments.cnn_baseline.evaluate_cnn \
  --zip research/drawing/cdt-api-network/clock_shulman.zip \
  --model-path ml/drawing/clock_signal/experiments/cnn_baseline/artifacts/resnet18_clock_cnn.pt \
  --split-metadata ml/drawing/clock_signal/experiments/cnn_baseline/artifacts/resnet18_split_metadata.json \
  --split test \
  --device auto
```

## Predict

```bash
python -m ml.drawing.clock_signal.experiments.cnn_baseline.predict_cnn \
  --image path/to/clock.png \
  --model-path ml/drawing/clock_signal/experiments/cnn_baseline/artifacts/resnet18_clock_cnn.pt \
  --threshold 0.60
```

The prediction output is JSON-compatible and remains limited to drawing-task
signals. It is for experimental review only and should not be used for care
decisions.

## Limitations

- Experimental only; not connected to the backend or mobile app.
- Not a replacement for the current HOG/logistic backend baseline.
- Not clinical validation.
- May learn dataset-specific visual artifacts that do not transfer to mobile
  stroke renderings.
- Does not validate prompt-specific hand time correctness.
