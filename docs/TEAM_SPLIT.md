# Team Split — 4 People

The team is split into two mini-task pairs first. Integration happens after both tasks work independently.

## Pair A — Voice Task

### Person 1: Mobile Voice UI

Owns:

- Voice task screen.
- Picture prompt placeholder.
- Audio record button.
- Timer.
- Retry flow.
- Send audio/metadata to backend.

Checkpoint:

- User can record a 30–45 sec voice answer in the app.

Branch:

```text
feature/mobile-voice-task
```

### Person 2: Backend Speech + DementiaBank Pipeline

Owns:

- `/task/voice` endpoint.
- Speech metadata schema.
- Mock speech scoring first.
- DementiaBank/ADReSS feature extraction notebook/script.
- Voice band output: green/amber/red.

Checkpoint:

- Backend returns a language signal from mock or extracted features.

Branch:

```text
feature/backend-voice-scoring
```

## Pair B — Clock / Pattern Draw Task

### Person 3: Mobile Drawing UI

Owns:

- Drawing task screen.
- Canvas input.
- Stroke capture: x/y/t.
- Clear/retry button.
- Submit drawing to backend.

Checkpoint:

- App captures stroke JSON and sends it to backend.

Branch:

```text
feature/mobile-clock-draw
```

### Person 4: Backend Drawing + Results/Report Integration

Owns:

- `/task/drawing` endpoint.
- Drawing feature extraction.
- `/score` endpoint.
- `/report/{session_id}` endpoint.
- GP report template.
- Safe language review.

Checkpoint:

- Backend combines caregiver + voice + drawing into results/report.

Branch:

```text
feature/backend-drawing-report
```

## Shared setup branch

Before feature branches, run a repo-foundation task.

Branch:

```text
setup/repo-foundation
```

This branch should add:

- Repo structure.
- README.
- AGENTS.md.
- Docs.
- Basic mobile app scaffold.
- Basic FastAPI scaffold.
- Health endpoint.
