# Drawing Scoring Placeholder

This folder is reserved for MindTrail-owned drawing feature extraction and
scoring code for the Clock / Pattern Draw Task.

The mobile app is expected to capture stroke data from a prompt such as:

> Draw a clock showing 10 past 11.

Expected MVP input shape:

```json
{
  "session_id": "demo-session-001",
  "task_type": "clock_draw",
  "completion_time_sec": 78,
  "clear_count": 1,
  "strokes": [
    [
      { "x": 120, "y": 240, "t": 0.2 },
      { "x": 124, "y": 242, "t": 0.3 }
    ]
  ]
}
```

Future backend scoring should derive simple, explainable features first:

- `completion_time_sec`
- `clear_count`
- `stroke_count`
- `pause_count`
- optional placement features for numbers and clock hands

The planned MVP output is a possible visuospatial/planning signal with a
green/amber/red band. This is not a diagnosis. Please discuss new or worsening
concerns with a healthcare professional.

Research-only image classifiers, copied notebooks, public dataset setup notes,
and baseline model artifacts belong under `research/external/`, not in this
production-facing scoring folder.

Do not commit restricted datasets, raw participant drawings, patient-identifying
data, or private clinical files. Use mock/demo stroke JSON until a safe data
workflow is defined.
