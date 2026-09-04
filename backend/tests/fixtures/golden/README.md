# Synthetic cleanup characterization corpus

`synthetic-experiment.zip` is generated test data, **not a real experiment**.
It contains no human participant information, measured biosignals, or external media.
The cleanup plan's separate requirement for a real, approved experiment remains pending.

## Contents and provenance

- Created by `build_synthetic_corpus.py` using deterministic arithmetic; no randomness.
- Two explicitly synthetic participant codes: `SYN-01`, `SYN-02`.
- Two scenarios: `stimulus-a`, `stimulus-b`, each eight seconds at 100 Hz.
- CSV recording blocks cover EyeTracker, GSR and seven EEG channels.
- Eye traces contain stable fixations, transitions, an invalid-gaze gap and missing right-pupil samples.
- EEG channels contain different sinusoids; GSR and pupils have smooth variation and participant differences.
- Two generated SVG rectangles identify the stimuli, with 1280 × 720 dimensions.
- ZIP timestamps and permissions are fixed. CSV precision is nine decimal places.
- ZIP SHA-256: `2dac7ab109e8a3578c40670be84706b750389f0e4bdd1b947f4dfe5d2821c168`.

The fixture validates the ZIP with the real `ZipValidationService`, then processes
the CSV through the real `CsvProcessingService`, including
fixation detection, then reads the actual written parquet files. It does not fabricate
the detector's output. No Redis, Postgres or Google Drive instance is needed.
The HTTP layer replaces only the database, parquet reader and cache; authentication,
request validation, route handlers, analytics calculations and response serialization run normally.

## Protected baselines

Numerical CSV baselines live beside `test_numeric_characterization.py`, generated with
`pytest-regressions`; `atol=1e-8`, `rtol=1e-6` allow numerical implementation noise.
Full numeric vectors and matrix dimensions are pinned. Numeric detector event columns,
duration variants, AOI metrics, report summaries and the heatmap histogram substrate are covered.
HTTP snapshots pin recursive serialized keys and types independently of the response models.
PNG bytes are never snapshotted.

The initial baseline used pytest-regressions 2.11.0 and syrupy 4.6.1.
The committed baselines were also verified unchanged with the Python 3.9-compatible
dependency pins pytest-regressions 2.8.3 and syrupy 4.6.1: 64 tests and 24 snapshots
passed; the isolated mutation was detected again.
Syrupy 4.6.1 has no `--snapshot-update-new-only` option. Its one initial
`--snapshot-update` invocation was guarded by absence of all `.ambr` files in the isolated
new test directory. Subsequent verification uses no update flags.
Never regenerate an existing golden to make a failing test pass.

Run from `backend` with the root virtual environment:

```powershell
..\.venv\Scripts\python.exe -m pytest tests/characterization -q
```

`check_mutation.py` changes the smoothing window by one sample in its own process,
runs one characterization case without any update flag, and succeeds only if that case fails.
It first runs the suite's offline environment setup, so no local `.env` is required.
The script never modifies production files or goldens.

Verification on 2026-09-03: 64 tests and all 24 snapshots passed without update
flags. The mutation produced the expected failing numerical regression, including
pupil/EEG/GSR smoothing differences, and was removed when its process ended.

## Limits

This corpus exercises deterministic numerical and HTTP contracts, not scientific
validation, real device export diversity, deployed container integration, database
query semantics, external storage availability or field use. It currently follows
the supported legacy coordinate path without physical screen metadata. Existing
focused tests cover the explicit stimulus-placement transforms.
