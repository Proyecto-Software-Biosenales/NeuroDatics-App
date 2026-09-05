# NeuroDatics — Presentation Study Pack

Written to be read the night before a demo. Every claim here was checked against
the code on branch `dashboard`, and each section links to the file that
implements it.

## Reading order

| # | File | Time | What you get |
| --- | --- | --- | --- |
| 1 | [01-pipeline-overview.md](01-pipeline-overview.md) | 10 min | The whole journey of one CSV, one diagram, one worked example. **Read this first.** |
| 2 | [02-csv-parsing.md](02-csv-parsing.md) | 20 min | How a messy multi-recording CSV becomes a clean table. Encodings, blocks, aliases, sampling rates. |
| 3 | [03-fixation-detection.md](03-fixation-detection.md) | 30 min | The heart of the product: I-DT and adaptive I-VT, validity masks, gap bridging, duration accounting. |
| 4 | [04-coordinate-transform.md](04-coordinate-transform.md) | 10 min | Screen pixels → stimulus-local coordinates, and why it matters for AOIs and heatmaps. |
| 5 | [05-analytics-algorithms.md](05-analytics-algorithms.md) | 25 min | Pupil, GSR, EEG (Welch, spectrogram, topography), correlations, scanpath, heatmap, AOI, histogram. |
| 6 | [06-tech-stack.md](06-tech-stack.md) | 15 min | Stack, why each piece, upload pipeline, auth, storage, caching, deployment. Broad, not deep. |
| 7 | [07-cheatsheet.md](07-cheatsheet.md) | 5 min | Every constant in one table + likely questions with short answers. **Read this last, right before you present.** |

If you only have 30 minutes: read **01**, then **07**, then skim **03**.

## The one-paragraph version

NeuroDatics ingests a folder from a neuromarketing lab (one multi-participant
CSV of synchronised EEG / GSR / eye-tracker samples, plus the stimulus images
and videos), validates and converts it into columnar Parquet files, mirrors
everything to Google Drive, and then serves interactive analytics — fixation
maps, heatmaps, scanpaths, AOI metrics, EEG spectra and cross-signal
correlations — from those Parquets. The technically distinctive part is that it
**recomputes fixations from raw gaze** with a deterministic detector instead of
trusting the eye-tracker vendor's own fixation columns, and it accounts for
sampling-rate mismatches, signal loss and stimulus placement so that a reported
"300 ms fixation" really means 300 ms of valid gaze on that stimulus.

## The three things that make this project defensible

1. **Nothing is invented.** Missing gaze stays missing (`-100, -100` sentinel).
   Out-of-range coordinates are rejected, never clipped to the screen edge.
   A gap is never charged as dwell time.
2. **Provenance travels with every number.** Every analytics response says which
   algorithm produced it, which version, whether it is a detector result or an
   estimate, the effective sampling rate, and any warnings.
3. **Determinism.** Same file + same config → same fixation IDs, same events,
   byte-for-byte. No randomness, no model weights, no hidden state.

## Vocabulary (the code mixes Spanish and English)

| Spanish (CSV / UI / code) | English | Meaning |
| --- | --- | --- |
| `Grabación` | Recording | Marks the start of one participant's data block |
| `Frecuencia del archivo` | File frequency | Sampling rate of the exported row grid |
| `Escenario` / `Scenario 1` | Scenario / stimulus | Which image or video the participant was looking at |
| `escenarios/` | scenarios/ | Folder of per-scenario Parquet files |
| Fijación | Fixation | A period of stable gaze on one point |
| Sacada | Saccade | The fast jump between two fixations |
| Mirada | Gaze | Raw eye position samples (`gx`, `gy`) |
| Dispersión | Dispersion | Spatial spread of a candidate fixation window |
| Umbral | Threshold | Cut-off value in a classifier |
| Muestra | Sample | One row of the CSV |
| Participante / Sujeto | Participant / subject | One person recorded |

## Existing engineering docs (deeper, denser, mostly Spanish)

These are the source-of-truth internal docs. The study pack summarises and
explains them; they contain more edge cases.

- [../FIXATION_V2.md](../FIXATION_V2.md) — full fixation-detector contract (Spanish)
- [../SCREEN_TO_STIMULUS_TRANSFORM.md](../SCREEN_TO_STIMULUS_TRANSFORM.md) — coordinate contract spec
- [../UPLOAD_PIPELINE.md](../UPLOAD_PIPELINE.md) — upload audit incl. security findings
- [../NETWORK_DEPLOYMENT.md](../NETWORK_DEPLOYMENT.md) — deployment behind a proxy

> One correction to be aware of: `UPLOAD_PIPELINE.md` §"Stage 8 — CSV → Parquet"
> describes an older CSV implementation (`pd.read_csv`, 80 % numeric coercion,
> blackout blanking). The current code is the V2 pipeline described in
> [02-csv-parsing.md](02-csv-parsing.md). If someone quotes that section at you,
> the code is the authority.
