# MindTrail SG — Minimal Project Roadmap

## One-line concept

MindTrail SG is a caregiver-linked mobile brain-health check that uses voice and drawing mini-tasks to flag possible cognitive-domain risk signals and generate a GP-ready report.

## MVP scope

Build only this flow first:

```text
Welcome → Consent → Profile → Caregiver checklist → Voice task → Clock/drawing task → Results → GP-ready report
```

## Mini-tasks selected for MVP

### 1. Picture Story / Voice Task

User sees a picture and speaks for 30–45 seconds.

Captures:

- Audio duration.
- Speech rate.
- Pause count/duration.
- Word count if transcription is available.
- Vocabulary diversity if transcription is available.

Primary domain:

- Language.

Secondary domains:

- Attention.
- Memory.

Dataset connection:

- DementiaBank / ADReSS.

### 2. Clock / Pattern Draw Task

User draws a clock or copies a pattern on the mobile screen.

Captures:

- Stroke coordinates.
- Completion time.
- Pause count.
- Corrections/restarts.
- Placement and spacing features.

Primary domain:

- Visuospatial ability.

Secondary domains:

- Executive function.
- Planning.

## Later task

### 3. Hawker Memory

Add only after the core voice + drawing flow works.

Primary domain:

- Memory.

## Checkpoints

### Checkpoint 1 — Repo foundation

Done when:

- Repo has documented structure.
- Mobile and API folders exist.
- README and AGENTS.md exist.
- Health endpoint works.

### Checkpoint 2 — App skeleton

Done when:

- React Native navigation works.
- All screens exist with dummy data.
- User can reach the results screen.

### Checkpoint 3 — Voice task

Done when:

- App records audio.
- Audio can be uploaded or mocked.
- Backend stores metadata.
- Backend returns a mock or real language signal.

### Checkpoint 4 — Clock/drawing task

Done when:

- App captures drawing strokes.
- Backend receives stroke JSON.
- Backend returns a mock or real visuospatial/planning signal.

### Checkpoint 5 — Scoring + results

Done when:

- Backend combines caregiver + voice + drawing signals.
- Results screen shows Green/Amber/Red bands.
- Language avoids diagnosis claims.

### Checkpoint 6 — GP report

Done when:

- Backend generates one-page report.
- Report includes task summary, domain signals, caregiver concerns, next steps, and disclaimer.

## MVP success criteria

The demo is successful if a judge can understand:

1. What problem we solve.
2. What data we capture.
3. How task data maps to cognitive domains.
4. Why output is safe and useful.
5. How the report helps GP/caregiver follow-up.
