# AGENTS.md — MindTrail SG repo instructions

This file gives repository guidance to Codex / coding agents.

## Project summary

MindTrail SG is a hackathon MVP for cognitive-risk case-finding. It uses a React Native mobile app and Python FastAPI backend. The MVP has two mini-tasks:

1. Picture Story / Voice Task.
2. Clock / Pattern Draw Task.

The app must not claim to diagnose dementia. It should output domain-level risk signals and a GP/caregiver-ready report.

## Architecture

Expected repo layout:

```text
apps/mobile/      React Native / Expo app
services/api/     FastAPI backend
ml/               ML experiments and feature extraction scripts
docs/             planning, API contract, scoring, team split
```

## Engineering rules

- Keep changes small and PR-ready.
- Prefer simple, working MVP code over complex abstractions.
- Use TypeScript for React Native where possible.
- Use Python type hints in the FastAPI backend.
- Do not commit real patient data, API keys, secrets, audio recordings, or restricted dataset files.
- Do not store DementiaBank raw data in the repository.
- Use mock/demo data for local testing.
- Keep all medical language safe: risk signals, not diagnosis.
- Add clear TODOs where clinical validation is needed.

## Required safety language

All user-facing outputs must include or imply:

> This is not a diagnosis. Please discuss new or worsening concerns with a healthcare professional.

## Backend expectations

FastAPI should expose at minimum:

```text
GET  /health
POST /session/start
POST /caregiver-checklist
POST /task/voice
POST /task/drawing
POST /score
GET  /report/{session_id}
```

## Frontend expectations

React Native screens should support:

```text
Welcome
Consent
Profile
Caregiver Checklist
Voice Task
Clock / Pattern Draw Task
Results
Report Summary
```

## Done means

A task is done only when:

- It runs locally.
- It has clear setup instructions.
- It does not break the app flow.
- It uses safe medical language.
- It includes basic error handling.
- It has at least one mock/demo path that works without restricted datasets.

## Review guidelines

When reviewing PRs, focus on:

- Broken app flow.
- Unsafe medical claims.
- PII or sensitive data leakage.
- Unclear API contracts.
- Changes that make the MVP harder to demo.
- Missing setup or run instructions.
