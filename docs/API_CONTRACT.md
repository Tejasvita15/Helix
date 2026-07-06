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
