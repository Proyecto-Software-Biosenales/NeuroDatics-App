# Cleanup verification

- Run `./verify.ps1` from the repository root after every deletion batch.
- Use the root `.venv/Scripts/python.exe`; `backend/.venv` is incomplete.
- Backend pytest config supplies `src`: `cd backend; ../.venv/Scripts/python.exe -m pytest`.
- Inspect historical diffs with `--ignore-cr-at-eol`; normalization commit is recorded in `docs/cleanup/LEDGER.md`.
- Goldens are protected. Never regenerate existing snapshots to make a failing test pass. New syrupy snapshots may use `--snapshot-update-new-only`; numeric baselines need explicit initial generation and review.
- Read `docs/cleanup/README.md`, `PLAN.md`, and the DO-NOT-TOUCH list in `FINDINGS.md` before cleanup work.
- Multiple agents share this checkout: stage only your assigned files; never blanket-reset another agent's changes.
