# MindTrail UI Branch Instructions

## Project
The app name is MindTrail.

## Current branch
This work is for the `feat/ui` branch.

## Main goal
Build and polish the UI/UX for MindTrail without changing the current game logic.

## Hard constraints
- Do not modify game mechanics, scoring, timers, progression, or answer validation.
- Do not rewrite the three existing games.
- Do not change game data structures unless required for UI integration, and explain any required change before applying it.
- Prefer wrapping existing game components in new layout/theme containers instead of editing game internals.
- Keep existing game routes and exports working.
- Do not remove existing functionality.
- Do not introduce medication alerts, emergency calling, or caregiver-created reminders in this branch unless explicitly asked.

## Allowed work
- Add shared design tokens/theme.
- Add reusable UI components.
- Add patient and caregiver screens.
- Add role-based routing.
- Improve spacing, typography, contrast, and button sizing.
- Add mock data where backend integration is missing.
- Add wrappers around game screens so they visually match MindTrail.

## MVP flow
Welcome
→ Choose Role: Patient / Caregiver
→ Login + Profile
→ 6-digit code linking
→ Consent
→ Role-based screens

Patient:
- Check-ins
- Games

Caregiver:
- Patient Journey
- Report

## UX priorities
- Accessible for older adults and people experiencing cognitive decline.
- Large readable text.
- Large buttons.
- Calm visual design.
- Minimal cognitive load.
- One main action per screen where possible.
- Icons must have labels.
- Avoid cluttered dashboards on patient screens.

## Testing expectations
After changes:
- Run the app.
- Confirm patient flow works.
- Confirm caregiver flow works.
- Confirm existing games still launch.
- Confirm no game logic was changed unless explicitly documented.