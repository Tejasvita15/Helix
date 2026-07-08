# API Contract

Base URL for local development:

```text
http://localhost:8000
```

## GET /health

Returns backend status.

Response:

```json
{
  "status": "ok"
}
```

## POST /session/start

Creates a new assessment session.

Request:

```json
{
  "age_band": "65-74",
  "preferred_language": "English",
  "education_band": "Secondary",
  "caregiver_assisted": true
}
```

Response:

```json
{
  "session_id": "demo-session-001"
}
```

## POST /caregiver-checklist

Stores caregiver observations.

Request:

```json
{
  "session_id": "demo-session-001",
  "repeated_questions": true,
  "missed_medication": true,
  "missed_appointments": false,
  "getting_lost": false,
  "money_or_bills_difficulty": false,
  "mood_or_personality_change": "unsure",
  "family_concerned": true
}
```

Response:

```json
{
  "saved": true
}
```

## POST /task/voice

Stores voice task metadata or uploaded audio path.

MVP request with metadata:

```json
{
  "session_id": "demo-session-001",
  "duration_sec": 42,
  "pause_count": 7,
  "long_pause_count": 3,
  "estimated_word_count": 55,
  "transcript": "The family is sitting at a hawker centre..."
}
```

Response:

```json
{
  "saved": true,
  "voice_signal": {
    "domain": "language",
    "band": "amber",
    "score": 62
  }
}
```

## POST /task/drawing

Stores drawing stroke data.

Request:

```json
{
  "session_id": "demo-session-001",
  "task_type": "clock_draw",
  "completion_time_sec": 78,
  "clear_count": 1,
  "strokes": [
    [{ "x": 120, "y": 240, "t": 0.2 }, { "x": 124, "y": 242, "t": 0.3 }]
  ]
}
```

Response:

```json
{
  "saved": true,
  "drawing_signal": {
    "domain": "visuospatial_planning",
    "band": "amber",
    "score": 58
  }
}
```

## POST /task/drawing/score

Scores a Clock Drawing stroke payload using the MindTrail-owned drawing signal
adapter. This endpoint is product-facing and accepts the mobile stroke JSON
shape.

Backend scorer configuration is controlled by environment variables:

- `CLOCK_SCORER_BACKEND`: `hog` by default. Set to `cnn` to use the experimental DenseNet121 CNN scorer.
- `CLOCK_SIGNAL_MODEL_PATH`: optional path for the HOG/logistic `.joblib` artifact.
- `CLOCK_CNN_MODEL_PATH`: optional path for the DenseNet121 CNN `.pt` artifact. Defaults to `ml/drawing/clock_signal/experiments/cnn_baseline/artifacts/densenet121_clock_cnn.pt`.
- `CLOCK_CNN_MODEL_INFO_PATH`: optional path for the DenseNet121 CNN model-info JSON. Defaults to `ml/drawing/clock_signal/experiments/cnn_baseline/artifacts/densenet121_model_info.json`.
- `CLOCK_SIGNAL_THRESHOLD`: optional confidence threshold. Defaults to `0.60`.

The default backend remains HOG/logistic. The CNN backend is experimental and
must be enabled explicitly.

Request:

```json
{
  "task_id": "clock_drawing",
  "instruction": "Draw a clock showing 10 past 11.",
  "canvas": {
    "width": 320,
    "height": 320
  },
  "strokes": [
    {
      "points": [
        { "x": 100, "y": 120, "t": 0 },
        { "x": 101, "y": 121, "t": 16 }
      ]
    }
  ],
  "metadata": {
    "completion_time_ms": 42000,
    "clear_count": 1,
    "undo_count": 0,
    "device": "mobile"
  }
}
```

Response:

```json
{
  "task": "clock_drawing",
  "task_completed": true,
  "signal_band": "uncertain",
  "confidence": 0.0,
  "domains": ["visuospatial", "planning"],
  "explanation": "The clock task could not be scored reliably. This is not a diagnosis.",
  "report_summary": "Clock drawing task result is uncertain. Consider retrying or reviewing with a caregiver or GP if concerns persist.",
  "model_version": "clock_signal_baseline_v0",
  "scoring_mode": "image_baseline_v0"
}
```

If the canvas or stroke data is incomplete, or the model cannot be loaded, the
endpoint returns `task_completed: false` and `signal_band: "uncertain"` rather
than exposing backend error details.

If `CLOCK_SCORER_BACKEND=cnn` is set but the CNN artifacts are unavailable, the
endpoint returns a safe uncertain result with `reason: "cnn_model_unavailable"`
and `scoring_mode: "cnn_densenet121_experimental"`.

Incomplete drawing payloads are not sent to the model. The current completion
thresholds are:

- Canvas width and height must be greater than `0`.
- At least `20` valid in-canvas points.
- At least one stroke with `2` or more valid in-canvas points.
- At least `80` pixels of total ink length in original canvas coordinates.

Incomplete response example:

```json
{
  "task": "clock_drawing",
  "task_completed": false,
  "signal_band": "uncertain",
  "confidence": 0.0,
  "domains": ["visuospatial", "planning"],
  "explanation": "The drawing was too incomplete to score reliably. Please try the task again.",
  "report_summary": "Clock drawing task was incomplete or could not be scored reliably.",
  "model_version": "clock_signal_baseline_v0",
  "scoring_mode": "image_baseline_v0",
  "reason": "too_few_points"
}
```

## POST /score

Combines all available signals.

Request:

```json
{
  "session_id": "demo-session-001"
}
```

Response:

```json
{
  "session_id": "demo-session-001",
  "overall_band": "amber",
  "domain_signals": {
    "language": {
      "band": "amber",
      "score": 62,
      "reason": "Speech task showed longer pauses and lower estimated fluency."
    },
    "visuospatial_planning": {
      "band": "amber",
      "score": 58,
      "reason": "Drawing task showed longer completion time and one restart."
    },
    "caregiver_concern": {
      "band": "red",
      "score": 45,
      "reason": "Caregiver reported repeated questions and missed medication."
    }
  },
  "recommendations": [
    "Discuss new or worsening concerns with a GP.",
    "Bring this report to the next appointment.",
    "Repeat the check in 4–6 weeks to track change."
  ],
  "disclaimer": "This is not a diagnosis."
}
```

## GET /report/{session_id}

Returns report as HTML first. PDF export can be added later.
