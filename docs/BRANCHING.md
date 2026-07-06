# Branching Plan

## Main rule

Keep `main` stable. All work goes through feature branches and PRs.

## Initial setup branch

```bash
git checkout -b setup/repo-foundation
```

Purpose:

- Create repo structure.
- Add AGENTS.md.
- Add docs.
- Scaffold React Native app.
- Scaffold FastAPI backend.
- Add basic run commands.

After merge, each person creates their own branch.

## Feature branches

```text
feature/mobile-voice-task
feature/backend-voice-scoring
feature/mobile-clock-draw
feature/backend-drawing-report
```

## PR rules

Each PR should include:

- What changed.
- How to run/test.
- Screenshots or sample API output if relevant.
- Any known TODOs.
- Confirmation that no sensitive data is committed.

## Merge order

1. `setup/repo-foundation`
2. `feature/mobile-voice-task`
3. `feature/backend-voice-scoring`
4. `feature/mobile-clock-draw`
5. `feature/backend-drawing-report`
6. Integration fixes
