# Cleanup verification

- Run `./verify.ps1` from the repository root after every deletion batch.
- Use the root `.venv/Scripts/python.exe`; `backend/.venv` is incomplete.
- Backend pytest config supplies `src`: `cd backend; ../.venv/Scripts/python.exe -m pytest`.
- `verify.ps1` also runs the pinned Ruff/Vulture tools and real React hook regressions in Chromium. Install the existing Playwright browser once with `cd frontend; npx playwright install chromium`.
- Inspect historical diffs with `--ignore-cr-at-eol`; the normalization commit is `d35ca73` (tag `safety-net-baseline`).
- Goldens are protected. Never regenerate existing snapshots to make a failing test pass. Pinned syrupy 4.6.1 has no `--snapshot-update-new-only` flag: generate new snapshots only in an isolated directory with no existing baselines, review them, then commit separately. Never use update flags in verification.
- Before deleting code, read "Rules that outlived the campaigns" in `docs/CHANGELOG.md`, and add finished work to that change log.
- Multiple agents share this checkout: stage only your assigned files; never blanket-reset another agent's changes.
