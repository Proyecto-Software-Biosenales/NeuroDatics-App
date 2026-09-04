# Real reference experiment acceptance — 2026-09-04

The user supplied two approved local experiment folders under
`docs/RefererenceExperiments/`. That path is ignored to prevent participant
recordings and media from entering Git. The committed validation script reads
them locally, creates temporary ZIP/parquet artifacts only under ignored
`output/reference-validation/`, and emits aggregate results without participant
identifiers. Temporary artifacts are removed after each recording.

Run from the repository root:

```powershell
.venv/Scripts/python.exe backend/scripts/validate_reference_experiments.py `
  docs/RefererenceExperiments `
  --report output/cleanup-reference-results.json
```

The run passed against both inputs:

| Input SHA-256 | Participants | Scenarios | Rows | Sensors | Events | Service calls |
|---|---:|---:|---:|---|---:|---:|
| `58a3cf6aeb1063b784ea7f71e0904b8ae3f708e1e160b75cef50fcd2c674c481` | 8 | 7 | 28,999 | EyeTracker | 715 | 36 |
| `92d9847d6fcd3fe13b50afc5a37b5e6a2df1298ba8dad03a28dfba6e77d24f0a` | 6 | 9 | 232,195 | EEG, EyeTracker, GSR | 793 | 60 |

The ZIP validator saw one CSV and the available images/video in each folder.
CSV ingestion generated 110 scenario parquet files across 14 participants.
Each participant had at least two scenarios, increasing timestamps, canonical
fixation events and finite JSON analytics. Two participants—one per input—used
metres for eye distance; the test independently confirms their newly persisted
values are millimetres and analytics reports centimetres. Source/storage unit
metadata was present on user and scenario parquet files.

All numerical services were exercised on four sustained participant/scenario
pairs per input (96 total calls including heatmap rendering). Short pre-roll
segments are excluded from spectral acceptance because fewer than 1,024 usable
samples correctly produce an empty spectrogram. Every participant is still
covered by ingestion, unit, persistence, event and distance assertions.

This acceptance does not commit raw participant data or replace the deterministic
synthetic goldens. It adds a repeatable real-data gate whose report can be matched
to the exact local inputs by SHA-256.
