# Scoring Specification

## Product rule

MindTrail SG outputs domain-level risk signals, not disease labels.

Do not output:

- Dementia detected.
- Alzheimer’s likely.
- MCI confirmed.

Output:

- Possible language signal.
- Possible visuospatial/planning signal.
- Caregiver concern present.
- Discuss with GP if new or worsening.

## Bands

| Band | Meaning | User-facing wording |
|---|---|---|
| Green | No strong signal in this session | No strong signal in this task today |
| Amber | Monitor / repeat later | Some signals worth monitoring |
| Red | GP follow-up recommended | Discuss with GP, especially if new or worsening |

## Voice task scoring

MVP features:

- `duration_sec`
- `pause_count`
- `long_pause_count`
- `estimated_word_count`
- `speech_rate_words_per_min`
- `vocabulary_diversity` if transcript is available

Initial MVP scoring can be rule-based:

```text
language_score = 100
- pause_penalty
- low_word_count_penalty
- low_speech_rate_penalty
- short_response_penalty
```

Band thresholds:

```text
score >= 75: green
score 50–74: amber
score < 50: red
```

## Drawing task scoring

MVP features:

- `completion_time_sec`
- `clear_count`
- `stroke_count`
- `pause_count`
- `clock_number_placement_score` if implemented
- `clock_hand_placement_score` if implemented

The production MVP path should score mobile-captured stroke JSON. Any copied
image-classifier experiments are research references only until reviewed and
adapted into MindTrail-owned scoring code.

Initial MVP scoring can be rule-based:

```text
visuospatial_planning_score = 100
- completion_time_penalty
- clear_count_penalty
- pause_penalty
- placement_penalty
```

## Hawker Memory scoring

MVP features:

- `correct_count`
- `incorrect_count`
- `accuracy`
- `avg_response_time_ms` if available
- missed person-item associations

Initial MVP scoring is rule-based:

```text
1 point per correct recall answer
accuracy = correct_count / total_questions
```

Gentle task flags:

- `low_accuracy`
- `very_fast_responses`
- `many_missed_associations`

User-facing wording should describe this as a memory recall game, recall
accuracy, or an associative memory pattern. It must not describe a diagnosis.

## Caregiver concern scoring

High-signal concerns:

- Missed medication.
- Getting lost in familiar places.
- Money/bill difficulty.
- Repeated questions.
- Family concern.

Rule:

```text
0–1 concerns: green
2 concerns: amber
3+ concerns or safety concern: red
```

## Overall scoring

For MVP:

```text
If any domain is red → overall amber/red depending on caregiver concern.
If caregiver concern is red + any task amber/red → overall red.
If all green → overall green.
Otherwise → overall amber.
```

Always show disclaimer.
