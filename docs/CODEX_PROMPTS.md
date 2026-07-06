# Codex Prompts

Use these prompts in Codex or any coding agent.

## Prompt 1 — Repo foundation

```text
You are working in the MindTrail SG GitHub repository. The repo currently has only a README.

Create the initial project foundation for a hackathon MVP.

Project summary:
MindTrail SG is a React Native + FastAPI prototype for cognitive-risk case-finding in older adults and caregivers. It has two mini-tasks first: Picture Story / Voice Task and Clock / Pattern Draw Task. It must not diagnose dementia. It should output domain-level risk signals and a GP-ready report.

Tech stack:
- Mobile: React Native with Expo and TypeScript.
- Backend: Python FastAPI.
- ML/scoring: Python rule-based scoring first, later DementiaBank speech features.
- Database: SQLite for MVP.

Create this repo structure:
apps/mobile/
services/api/
ml/speech/
ml/drawing/
docs/

Add or update:
- README.md with project overview, setup commands, architecture, safe language, and MVP scope.
- AGENTS.md with repo instructions for future coding agents.
- docs/PROJECT_ROADMAP.md
- docs/APP_FLOW.md
- docs/API_CONTRACT.md
- docs/SCORING_SPEC.md
- docs/TEAM_SPLIT.md
- docs/BRANCHING.md

Scaffold:
- A minimal Expo React Native app in apps/mobile if possible.
- A minimal FastAPI app in services/api with GET /health.
- requirements.txt for the backend.
- package.json for the mobile app.
- .gitignore suitable for Python, Node, Expo, Mac, and env files.

Do not implement the full cognitive tasks yet. This PR is only repo foundation.

After changes, print:
1. Files created.
2. Commands to run mobile and backend.
3. Next recommended branches.
```

## Prompt 2 — Mobile Voice Task

```text
Implement the Picture Story / Voice Task in apps/mobile.

Requirements:
- Add a VoiceTask screen.
- Show a placeholder picture card.
- Prompt: "Tell us what is happening in this picture."
- Add record, stop, retry, and submit controls.
- Show a 45-second timer.
- Capture audio if Expo audio dependencies are available. If not, create a clean mock recording path and document the TODO.
- Submit either audio metadata or mock metadata to POST /task/voice.
- Keep user-facing language non-diagnostic.

Do not touch backend scoring except for API type assumptions. Add any API types used.

Done when the screen can be reached from the app flow and submit a payload.
```

## Prompt 3 — Backend Voice Scoring

```text
Implement backend support for the Picture Story / Voice Task in services/api.

Requirements:
- Add POST /task/voice.
- Accept session_id, duration_sec, pause_count, long_pause_count, estimated_word_count, optional transcript.
- Store the task data in SQLite or in-memory storage if the database is not ready.
- Return a language signal with score and green/amber/red band.
- Use a simple rule-based scoring function first.
- Add a placeholder script/notebook area under ml/speech for future DementiaBank/ADReSS feature extraction.
- Do not commit any DementiaBank data.
- Add basic tests or a curl example.

User-facing output must say this is not a diagnosis.
```

## Prompt 4 — Mobile Clock Draw Task

```text
Implement the Clock / Pattern Draw Task in apps/mobile.

Requirements:
- Add a DrawingTask screen.
- Prompt: "Draw a clock showing 10 past 11."
- Add a drawing canvas.
- Capture strokes as arrays of x/y/t points.
- Add clear, retry, and submit buttons.
- Submit stroke JSON to POST /task/drawing.
- Keep the screen simple and senior-friendly.

Done when a user can draw, clear, and submit stroke data to the backend or mock endpoint.
```

## Prompt 5 — Backend Drawing + Report

```text
Implement backend support for drawing scoring, combined scoring, and GP-ready report.

Requirements:
- Add POST /task/drawing.
- Accept session_id, task_type, completion_time_sec, clear_count, and strokes.
- Extract simple drawing features: stroke_count, completion_time, clear_count, approximate pause count if possible.
- Return a visuospatial_planning signal with score and green/amber/red band.
- Add POST /score to combine caregiver, voice, and drawing signals.
- Add GET /report/{session_id} returning an HTML report.
- Report must include: tasks completed, domain signals, caregiver concerns, recommendations, disclaimer.
- Use safe language: possible risk signal, not diagnosis.

Done when the frontend can show results and open a report URL.
```
