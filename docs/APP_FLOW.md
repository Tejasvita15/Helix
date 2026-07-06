# App Flow

## User flow

```text
1. Welcome
2. Consent + disclaimer
3. Basic profile
4. Caregiver checklist
5. Picture Story / Voice Task
6. Clock / Pattern Draw Task
7. Results
8. GP-ready report
```

## Screens

### 1. Welcome

Purpose: Explain app in one sentence.

Text:

> A 10-minute brain-health check for older adults and caregivers.

CTA:

> Start check

### 2. Consent

Purpose: Safe positioning.

Required text:

> MindTrail SG does not diagnose dementia. It helps identify possible cognitive-risk signals that may be worth discussing with a GP.

CTA:

> I understand

### 3. Profile

Fields:

- Age band.
- Preferred language.
- Education band.
- Caregiver helping? yes/no.

### 4. Caregiver checklist

Questions:

- Repeats questions more often?
- Missed medication recently?
- Missed appointments?
- Got lost in familiar places?
- New difficulty handling money/bills?
- Mood/personality change?
- Family is concerned?

### 5. Voice task

Prompt:

> Tell us what is happening in this picture.

Requirements:

- Show picture placeholder.
- Record 30–45 seconds of audio.
- Allow retry once.
- Send audio or mock metadata to backend.

### 6. Clock/drawing task

Prompt:

> Draw a clock showing 10 past 11.

Requirements:

- Canvas input.
- Capture x/y/t stroke data.
- Allow clear/retry.
- Send stroke JSON to backend.

### 7. Results

Show domain bands:

- Green: No strong signal in this session.
- Amber: Monitor / repeat later.
- Red: Discuss with GP if new or worsening.

Domains:

- Language.
- Visuospatial/planning.
- Caregiver concern.

### 8. GP-ready report

Show report summary and export/share placeholder.
