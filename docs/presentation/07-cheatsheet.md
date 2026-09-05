# 7. Cheatsheet — numbers and likely questions

Read this last, right before you present.

---

## 7.1 Every constant that matters

### Fixation detection

| Constant | Value | Meaning |
| --- | --- | --- |
| `normalized_dispersion_threshold` | **0.03** | I-DT: max (x-range + y-range) of a fixation, in screen fractions |
| `min_fixation_duration_ms` | **200** (canonical) | Minimum valid support; variants 100/150/200/250/300 |
| `max_bridge_gap_ms` | **75** | Longest signal loss that can be bridged inside one event |
| `velocity_fallback_threshold_deg_s` | **30** | I-VT saccade threshold when adaptation fails |
| `velocity_hysteresis_ratio` | **1.25** | Enter saccade above `t × 1.25`, leave at `t` |
| `adaptive_min_local_maxima` | **11** | Fewer local speed maxima → use the fallback |
| `velocity_max_for_adaptation_deg_s` | **1000** | Upper bound on candidates for adaptation |
| gap-statistic minimum strength | **0.10** | Weaker separation → fallback |
| cluster separation ratio | **1.05** | Next value must exceed the candidate by 5 % |
| `resample_rate_tolerance` | **0.05** | Resample when grid > eye rate × 1.05 |
| `zero_pair_is_invalid` | **True** | `(0, 0)` is signal loss, not a corner look |
| `NO_FIXATION_VALUE` | **−100.0** | Sentinel written to non-fixation rows |
| `FIXATION_DETECTOR_VERSION` | `fixation-v2` | |

### Signal processing

| Constant | Value | Where |
| --- | --- | --- |
| Pupil smoothing window | **0.25 s** | pupil timeseries + statistics |
| GSR smoothing window | **1.0 s** | GSR timeseries + statistics |
| EEG timeseries smoothing | **0.2 s** | default `smooth_window_s` |
| Robust baseline band | **5th–20th percentile** | all baselines |
| Gaze speed rejection | **1500 %/s** | `_clean_gaze` |
| Gaze interpolation limit | **150 ms** | `_clean_gaze` |
| Gaze smoothing | **median 60 ms → mean 40 ms** | `_clean_gaze` |
| Welch `nperseg` | **min(1024, shortest channel)** | PSD |
| Spectrogram window / overlap | **1.5 s / 75 %** | Hann |
| Spectrogram max frequency | **25 Hz** | above this is mostly muscle artefact |
| Spectrogram smoothing sigma | **0.8** | 2-D Gaussian |
| Spectrogram colour clip | **2nd–98th percentile** | |
| Topography window / overlap | **2.0 s / 50 %** | Hann, DC removed |
| Topography colour clip | **5th–95th percentile** | |
| Correlation bin | **250 ms** | shared scenario-relative grid |
| Correlation minimum pairs | **10** | below → `insufficient_overlap` |
| Scanpath radius cap | **2000 ms** | `radius_norm = sqrt(d/2)` |
| Heatmap grid longest edge | **900 cells** | square cells |
| Heatmap sigma | **0.105 × short edge** | |
| Heatmap gamma / threshold / alpha | **0.7 / 0.10 / 0.75** | |
| Histogram bins | **Sturges: ceil(log2 n + 1)** | |
| Max points per chart series | **5000** | uniform decimation |

### Infrastructure

| Constant | Value |
| --- | --- |
| ZIP max compressed / uncompressed | **500 MB / 2000 MB** |
| ZIP max entry / entries / ratio | **600 MB / 20 000 / 100:1** |
| Upload concurrency per user / global | **1 / 4** |
| Minimum seconds between uploads | **5** |
| Redis analytics TTL | **900 s (15 min)** |
| Parquet disk cache TTL | **4 h** |
| Image LRU cache | **300 s, 256 items, 64 MB** |
| Drive upload chunk / timeout / retries | **8 MB / 300 s / 5** |
| Job timeout | **3600 s** |
| Access token lifetime | **14 days** |
| Container memory limit | **2 GB** (backend and worker) |
| Next.js proxy body / timeout | **550 MB / 30 min** |

---

## 7.2 Thirty-second answers to likely questions

**"Why not just use the eye tracker's own fixation columns?"**
> They arrive already interpolated and smoothed by the acquisition software, with
> no documentation of what filter was applied. Presenting them would mean
> presenting somebody else's algorithm as our result. We keep them as
> `vendor_fix_x` / `vendor_fix_y` for auditing and comparison, and recompute from
> raw gaze so the method is documented, deterministic and reproducible.

**"How do you know a fixation is really 200 ms?"**
> Because we store what it was built from. `duration = detector_sample_count /
> effective_rate` — 12 samples at 60 Hz. We also store the original row count and
> the wall-clock duration separately, so you can see exactly how much time was
> bridged over. And the effective rate is `min(eye_rate, grid_rate)`, so we never
> claim more independent observations than the slowest clock provides.

**"Why two algorithms?"**
> I-VT in degrees of visual angle is physiologically correct, but it needs
> physical screen size and viewing distance, which most labs do not record. So
> I-DT normalised is the fallback: resolution-independent, but its threshold is a
> fraction of screen rather than degrees. The mode is chosen automatically from
> whether the calibration exists, and asking for angular mode without it is an
> error rather than a silent downgrade.

**"What happens with missing data?"**
> It stays missing. Invalid rows keep the exact `(-100, -100)` sentinel, get no
> fixation ID, and contribute no duration. A gap up to 75 ms can be bridged to
> decide *continuity* — is this one fixation or two — but the interpolated values
> exist only in memory and never reach the file, and bridged time never counts as
> dwell.

**"Why 200 ms / 0.03 / 30 °/s?"**
> They are literature-standard operational defaults, not physiological constants.
> That is exactly why five minimum durations ship with every upload and why the
> thresholds are configuration. Different populations, tasks and devices need
> different values, and we say so in the docs.

**"Why Parquet instead of a database table?"**
> The data is a wide, append-only numeric time series — tens of thousands of rows
> × 40 columns per participant — and every query reads a few columns of one
> participant's recording. Columnar storage makes that a fraction of the I/O, it
> compresses 5–10×, it preserves types, and it carries our contract metadata in
> its own schema. Postgres holds the relational metadata that actually needs
> transactions.

**"Is it fast?"**
> First request per participant: hundreds of milliseconds to a couple of seconds,
> because the Parquet may have to come down from Drive. After that it is a disk
> cache hit or a Redis hit — tens of milliseconds. Both caches are keyed by an
> ingestion generation, so a re-upload invalidates everything atomically.

**"What if two participants have the same code?"**
> It refuses to answer. Parquets carry their participant code in metadata, and if
> that does not resolve to exactly one file the API returns a descriptive error
> asking for a re-upload. Returning a plausible wrong participant's data would be
> far worse than an error.

**"How do you handle the two different sampling rates?"**
> We track three rates: the declared file rate, the observed grid rate from the
> timestamps, and the declared gaze rate from the channel metadata. Detection uses
> `min(eye, grid)`. When the grid is more than 5 % faster than the eye tracker,
> gaze is binned to the eye rate using the median of the valid rows in each bin —
> for detection only. EEG, GSR and pupil are never resampled and keep their own
> rows.

**"What is the biggest weakness?"**
> Ingestion runs synchronously inside the HTTP request. The queue infrastructure
> exists but the task is a stub, so a backend crash mid-upload strands a project
> in `PROCESSING` with no automatic recovery. It is documented with a severity
> and sits high in the recommended order of work.

**"Has this been validated against ground truth?"**
> Not yet, and we say so explicitly in the docs. The detector is designed to avoid
> visible interpolation and inflated counts, and it is deterministic and fully
> traceable, but benchmarking against human-annotated fixations is pending before
> the output should be read as ground truth.

**"Why is `(0, 0)` invalid — couldn't someone look at the corner?"**
> They could, but Tobii-family trackers emit `(0, 0)` on signal loss, and those
> vastly outnumber genuine corner looks. Treating them literally would pile
> thousands of blinks onto one corner of every heatmap. Losing a rare real corner
> fixation is a much smaller error, and the behaviour is configurable.

**"Why reject out-of-range coordinates instead of clipping them?"**
> Clipping `x = 1.4` to `x = 1.0` invents a look at the edge that never happened —
> and that fabricated point then wins AOI hits and carries heatmap weight.
> Rejecting loses one sample; clipping corrupts the result. The rejected count is
> reported, so nothing is hidden.

**"What is AI/ML in this project?"**
> Nothing, deliberately. Every algorithm here is deterministic signal processing:
> I-DT, I-VT, Welch, Pearson, Gaussian kernels. Same input, same config, same
> output, byte for byte — which is a requirement for scientific results, and it
> means every number can be traced back to the CSV line that produced it.

---

## 7.3 Numbers for the intro slide

- **~9 400 lines** of backend project code (upload + CSV + fixation detection)
- **~7 800 lines** of analytics code
- **2 500 lines** in the fixation detector alone
- **5 containers**, one command to start
- **~25 analytics endpoints**
- **5 fixation duration variants** computed at ingestion
- **6 signals** in the cross-correlation matrix
- **3 sampling rates** tracked per recording
- **0 random seeds** — fully deterministic

---

## 7.4 Demo running order

1. **Create a project** → pick a folder → show the wizard detecting CSVs, images
   and videos, and asking a clarification question if the structure is ambiguous.
2. **Upload** → point at the live progress bar and mention it is streamed in 1 MB
   chunks and cancellable, and that validation already ran with zero side effects.
3. **Dashboard** → pick a participant and a scenario.
4. **Heatmap** → duration-weighted, rendered at the stimulus's own pixel size so
   it overlays exactly.
5. **Scanpath** → circle *area* is proportional to duration, on an absolute scale
   so two participants are comparable.
6. **Change the minimum duration** 200 → 100 ms → more, shorter fixations appear.
   This is the moment to say all five variants were computed at ingestion, not
   recomputed now.
7. **AOIs** → draw one → TTFF, dwell, hit rate, transitions.
8. **EEG spectrogram** → mention `freq_demean`: without it you would see the `1/f`
   curve and nothing else.
9. **Correlations** → point at a cell with low `n_samples` and explain that
   coverage is reported so weak evidence is visible as weak.
10. **Executive PDF report** → same services as the dashboard, so the two cannot
    disagree.

If a demo step fails: the fallback is the Swagger UI at
`http://localhost:3000/docs`, where you can show the provenance fields
(`algorithm_version`, `estimated`, `effective_sampling_rate_hz`, `warnings`) in a
raw JSON response. That is arguably a stronger technical point anyway.

---

## 7.5 One-line summaries per algorithm

| Algorithm | One line |
| --- | --- |
| **Block splitting** | `Grabación` markers + `Time` headers cut one CSV into per-participant blocks; ambiguity is an error with a line number. |
| **Alias normalisation** | NFKC + casefold + accent-tolerant lookup maps `Bandwidth / X` to `gx`; unknown columns are kept as evidence. |
| **Locale-aware float parsing** | The separator that appears *last* is the decimal separator, so `1.234,56` and `1,234.56` both parse correctly. |
| **Rate resolution** | Three rates tracked; detection uses `min(eye, grid)`; disagreements warn instead of failing. |
| **Resampling** | Median-of-valid binning to the eye-tracker rate, for detection only; the map home preserves row alignment. |
| **Validity mask** | Six ordered reasons; `(0,0)` and out-of-range are invalid; rejection, never clipping. |
| **Segmentation** | Scenario change, clock reset, >75 ms of missing time or an off-stimulus row starts a new segment; events never cross one. |
| **Gap bridging** | Gaps ≤ 75 ms with spatially compatible endpoints answer "one fixation or two?" — and nothing else. |
| **I-DT** | Grow a window to the minimum *valid support*, accept it if x-range + y-range ≤ 0.03, extend while it holds. |
| **I-VT adaptive** | Screen → visual angle, central-difference velocity, per-segment threshold from a CDF gap statistic, 1.25× hysteresis. |
| **Duration accounting** | Sum intervals capped at one period, plus terminal support; on a regular grid this is exactly `count / rate`. |
| **Duration variants** | I-DT reruns per duration (the opening window moves boundaries); I-VT classifies once and filters. |
| **Coordinate transform** | `(screen − stimulus_origin) / stimulus_size`, fingerprinted, with `applied` / `legacy` / `mixed` provenance. |
| **Gaze cleaning** | Range + blink + speed rejection, ≤150 ms interpolation, median-then-mean smoothing. |
| **Robust baseline** | Mean of the 5th–20th percentile band — the resting level, not the minimum and not the mean. |
| **Welch PSD** | Average periodograms of overlapping Hann segments; variance falls as `1/n_segments`. |
| **Spectrogram** | Same, over time, minus each frequency's own median so the `1/f` curve does not hide everything. |
| **Topography** | Windowed mean-square power per electrode, DC removed, window-energy compensated, on a fixed 6-electrode layout. |
| **Correlations** | Six signals on a shared 250 ms grid, median-aggregated (mean for power), Pearson, with coverage and status per cell. |
| **Scanpath** | One node per event; circle area ∝ duration on an absolute 2 s scale; distance only within a segment. |
| **Heatmap** | Duration-weighted 2-D histogram on square cells → Gaussian → gamma 0.7 → threshold 0.10 → jet → LANCZOS to stimulus size. |
| **AOI** | Ray-cast/ellipse/rect containment on stimulus-local coordinates; TTFF, dwell, hit rate; transitions reset per segment. |
| **Histogram** | Sturges bins over event durations; the last bin is closed so the maximum is never dropped. |
