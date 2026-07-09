# MindTrail SG

MindTrail SG is a hackathon prototype for cognitive-risk case-finding support. It combines a React Native / Expo mobile app with a FastAPI backend to guide an older adult or caregiver through short check-ins, cognitive-domain mini-tasks, and a GP/caregiver-ready summary.

The app produces domain-level cognitive-risk signals only. It does not diagnose dementia or any other condition.

> This is not a diagnosis. Please discuss new or worsening concerns with a healthcare professional.

## Problem Statement

Early cognitive changes are often noticed by family members through everyday events such as repeated questions, missed appointments, difficulty with errands, or changes in speech and planning. MindTrail SG turns those observations into a short, structured demo flow that can support a follow-up conversation with a GP or caregiver without making diagnostic claims.

## Proposed Solution

The prototype collects:

- Basic profile and caregiver checklist inputs.
- Picture Story / Voice Task data from real audio upload or demo metadata.
- Hawker Memory recall task responses.
- Clock Drawing stroke data captured on a mobile canvas.

The backend stores demo sessions in memory, returns low/medium/higher domain signal bands, combines available signals, and serves an HTML report summary. All scoring language is framed as a possible cognitive-domain signal, not a diagnosis.

## Tech Stack

| Layer | Repository evidence |
| --- | --- |
| Mobile / frontend | Expo React Native app in `apps/mobile/`, TypeScript, Expo SDK 51, React Native 0.74.5 |
| Backend | FastAPI app in `services/api/`, Uvicorn, Pydantic models, in-memory demo sessions |
| Drawing scoring | HOG image features, scikit-learn logistic regression baseline, joblib artifact |
| Voice/audio | Rule-based metadata scoring, optional local Auralis wrapper, optional faster-whisper transcription |
| Data/storage | Demo in-memory session store; no production database is configured |

## Main Demo Flow

Current mobile flow:

```text
Welcome
-> Choose role
-> Basic profile
-> Link care circle
-> Consent
-> Patient home / caregiver journey
-> Short check-in
-> Hawker Memory study
-> Picture Story / Voice Task
-> Hawker Memory recall
-> Clock Drawing Task
-> Results
-> Report Summary
-> Completion
```

The caregiver path includes a caregiver journey and report summary view. The patient path runs the task sequence and posts results to the local FastAPI backend.

## Repository Structure

```text
apps/mobile/                         Expo React Native app
  App.tsx                            Main app flow, API calls, voice/drawing UI
  src/hawkerMemory.ts                Hawker Memory task generation and local scoring
  src/ui/                            Shared mobile UI components and theme
  src/visuals/                       MindTrail visual components
  assets/picture-story/              Local picture-story prompt images
  assets/hawker/                     Local Hawker Memory food images

services/api/                        FastAPI backend
  app/main.py                        API endpoints, in-memory sessions, scoring aggregation
  app/services/drawing_score_service.py
                                      Product-facing clock drawing scoring adapter
  app/auralis_model.py               Local Auralis speech classification wrapper
  app/whisper_service.py             faster-whisper transcription wrapper
  app/check_drawing_score_endpoint.py
                                      Drawing endpoint smoke checks
  requirements.txt                   Backend dependencies

ml/drawing/clock_signal/             MindTrail-owned clock drawing scoring code
  artifacts/clock_signal_baseline.joblib
                                      HOG + logistic regression baseline artifact
  artifacts/*.json, *.csv            Model info, evaluation, thresholds, audits
  model_card.md                      Baseline model card and safety notes
  experiments/cnn_baseline/          Experimental CNN scripts and metadata

ml/speech/                           Speech experiment placeholder and safety notes
research/drawing/                    Research-only clock drawing references/data
docs/                                API contract, app flow, scoring spec, roadmap, team split
validation_clock_renders_final*/     Clock-render validation artifacts
```

Generated folders such as `node_modules/`, `.venv/`, `.expo/`, and `__pycache__/` are not part of the source structure.

## Setup and Installation

Dependency files currently present:

- `apps/mobile/package.json`
- `apps/mobile/package-lock.json`
- `services/api/requirements.txt`

There is no root `package.json`, `pyproject.toml`, Poetry lock file, or uv lock file in the repository.

### Backend

```bash
cd services/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Mobile / Frontend

The mobile package requires Node `>=20 <23`; `apps/mobile/.nvmrc` currently contains `22`.

```bash
cd apps/mobile
nvm use 22
npm ci
```

If `nvm` is not installed, use Node 20 LTS or Node 22 LTS before running Expo.

## Run the Backend

```bash
cd services/api
source .venv/bin/activate
uvicorn app.main:app --reload
```

Health check:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok"}
```

FastAPI docs are available while the server is running at:

```text
http://localhost:8000/docs
```

Optional drawing endpoint smoke check:

```bash
cd services/api
source .venv/bin/activate
python app/check_drawing_score_endpoint.py
```

## Run the Mobile / Frontend App

```bash
cd apps/mobile
npm run start
```

Then open the app with Expo Go, an emulator/simulator, or the Expo terminal options.

For a browser preview:

```bash
npm run web
```

On web, the app calls `http://localhost:8000`. On native development builds, `App.tsx` attempts to infer the host machine from Expo's script URL and falls back to Android emulator `http://10.0.2.2:8000` or iOS/local `http://127.0.0.1:8000`. For physical-device demos, confirm that the phone can reach the backend host and port.

## API Endpoints

Base URL for local development:

```text
http://localhost:8000
```

Endpoints currently defined in `services/api/app/main.py`:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Backend health check. |
| POST | `/session/start` | Starts an in-memory demo session and returns a drawing prompt. |
| POST | `/caregiver-checklist` | Saves caregiver observations for a session. |
| POST | `/task/voice` | Scores voice-task metadata with a rule-based demo pipeline. |
| POST | `/task/voice/audio` | Uploads audio, runs Auralis classification and Whisper transcription if available. |
| POST | `/transcribe/whisper` | Transcribes uploaded audio with faster-whisper if available. |
| GET | `/model/auralis/status` | Reports whether the local Auralis model can load. |
| GET | `/model/whisper/status` | Reports whether the Whisper transcriber can load. |
| POST | `/task/drawing` | Legacy/demo drawing scoring path using heuristics or an older image model path. |
| POST | `/task/drawing/score` | Product-facing clock drawing stroke scoring endpoint. |
| POST | `/task/memory/score` | Scores Hawker Memory recall responses. |
| POST | `/score` | Combines available domain signals for a session. |
| GET | `/report/{session_id}` | Returns an HTML GP-ready report summary. |

### `POST /task/drawing/score`

This is the main clock drawing endpoint used by the mobile app.

Request shape:

```json
{
  "task_id": "clock_drawing",
  "session_id": "demo-session-id",
  "instruction": "Draw a clock showing 10 past 11.",
  "canvas": { "width": 320, "height": 320 },
  "strokes": [
    {
      "points": [
        { "x": 160, "y": 40, "t": 0 },
        { "x": 220, "y": 58, "t": 16 }
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

Response includes:

- `task`
- `task_completed`
- `signal_band`: `low_signal`, `medium_signal`, `higher_signal`, or `uncertain`
- `confidence`
- `domains`
- `explanation`
- `report_summary`
- `model_version`
- `scoring_mode`
- optional `class_probabilities`
- optional `reason`

Incomplete drawings are not sent to the model. The endpoint returns a safe `uncertain` result when the canvas is invalid, there are no strokes, there are fewer than 20 valid points, there is no complete stroke, total ink length is under 80 pixels, the model is missing, or scoring fails.

## AI Models, APIs, and Datasets Used

- **Voice metadata scoring:** Rule-based backend scoring in `services/api/app/main.py` using duration, pause counts, estimated word count, and speech rate.
- **Voice audio model:** `Auralis/NatHACKS_Auralis` wrapper in `services/api/app/auralis_model.py`, loaded with Hugging Face Transformers using `local_files_only=True`.
- **Transcription:** `faster-whisper` with model size `tiny` in `services/api/app/whisper_service.py`.
- **Default clock drawing endpoint scorer:** Mobile stroke JSON is rendered and scored through the product-facing adapter in `services/api/app/services/drawing_score_service.py`.
- **Clock drawing baseline:** HOG features plus `LogisticRegression(class_weight="balanced")`, saved as `ml/drawing/clock_signal/artifacts/clock_signal_baseline.joblib`.
- **Clock drawing training data reference:** `research/drawing/cdt-api-network/clock_shulman.zip`, with source Shulman score folders mapped to `low_signal`, `medium_signal`, and `higher_signal` as documented in `ml/drawing/clock_signal/model_card.md`.
- **Experimental drawing CNN:** Scripts and metadata exist under `ml/drawing/clock_signal/experiments/cnn_baseline/`; this is not the default backend scorer.
- **Speech datasets:** `ml/speech/README.md` notes future DementiaBank/ADReSS speech work, but raw DementiaBank files are not present in the repository.
- **Mobile demo assets:** Local picture-story images and hawker food images under `apps/mobile/assets/`.

No clinical validation, deployment status, or medical accuracy claim is made by the repository.

## Team Members

- Swarangi Satpute
- Tejasvita Jain
- Sourabh Sooraj
- Siddharth Paliwal

## Declarations

- This is a hackathon prototype.
- This is not a medical device.
- This project does not provide diagnosis, treatment advice, or automated care decisions.
- User-facing output must preserve the safety message: "This is not a diagnosis. Please discuss new or worsening concerns with a healthcare professional."
- AI tools used: Codex/ChatGPT were used to assist with this README/documentation drafting. `docs/CODEX_PROMPTS.md` also contains prompts intended for Codex/coding agents.
- No real patient data or PHI should be added to this repository. The demo app uses mock/demo sessions and local visual assets. The repository does contain research-only clock drawing data/artifacts under `research/drawing/`; data rights, privacy status, and whether those files should be included in a public submission should be reviewed before release.
- Do not commit DementiaBank raw data, audio recordings, API keys, secrets, or restricted clinical files.

## Known Limitations

- Sessions are stored in memory and reset when the FastAPI server restarts.
- There is no authentication, database persistence, or production deployment configuration.
- The clock drawing baseline is an MVP/research signal and is not clinically validated.
- The drawing model scores rendered stroke images and does not verify prompt-specific clock time correctness.
- Voice audio scoring depends on local model availability; the app can fall back to demo metadata.
- The caregiver report path includes mock caregiver summary content.
- Physical-device mobile demos may need API host configuration.
- Dataset licensing, privacy review, fairness checks, and clinical safety review are TODOs before any real-world use.

## Future Work

- Add reviewed data governance and remove or replace any research data that should not be public.
- Add persistent storage for sessions and reports.
- Improve speech-language feature extraction and multilingual support.
- Improve drawing features from stroke timing, placement, spacing, and corrections.
- Add PDF export for the report.
- Run usability testing with older adults, caregivers, and clinicians.
- Perform clinical validation and fairness evaluation before any care use.
