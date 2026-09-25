# 5. Analytics algorithms

Everything served from the Parquets.
[analytics_service.py](../../backend/src/neurodatics/modules/analytics/application/services/analytics_service.py)
(≈3 400 lines) and
[correlation_service.py](../../backend/src/neurodatics/modules/analytics/application/services/correlation_service.py).

All services are **stateless class methods**: DataFrame in, JSON-safe dict out.
No instance state, no hidden caching inside the algorithm — which makes every one
of them trivially unit-testable and safe to call concurrently.

---

## 5.0 Two shared helpers

Used by nearly every service, so worth knowing by name.

**`_infer_fs(t)` — sampling frequency**

```python
dt = diff(t); dt = dt[dt > 0 & finite]
fs = 1 / median(dt)          # default 60.0 if nothing usable
```

Median, not mean: a single 2-second gap in the middle of a recording would drag
a mean badly, while the median ignores it.

**`_robust_baseline(x)` — the resting level of a signal**

```python
lo, hi = percentile(x, [5, 20])
baseline = mean(x[lo <= x <= hi])
```

Not the minimum (that is one noise sample) and not the mean (that is dragged up
by the responses you are trying to measure against it). The 5th–20th percentile
band is the "low but not extreme" region — the signal's resting state. Used for
pupil, GSR, gaze and distance baselines, and to compute AOI deltas.

---

## 5.1 Gaze cleaning

`PupilAnalyticsService._clean_gaze` — a five-step pipeline ported from the
research team's original notebook, applied to the **raw** gaze trace (this is
independent of the fixation detector, which does its own validity handling).

```
1. NORMALISE     if max|value| ≤ 1 → multiply by 100 (work in percent)
2. INVALIDATE    out of range:  gx or gy outside [0, 100]
                 blinks:        pupil diameter is NaN or ≤ 0
                 impossible:    speed > 1500 %/s
3. INTERPOLATE   gaps up to 150 ms (linear, both directions)
4. SMOOTH        rolling median 60 ms  →  rolling mean 40 ms
5. OUTPUT        gx_clean, gy_clean
```

Notes on each choice:

- **Pupil as a blink detector.** A closed eye reports no pupil. Blinks corrupt
  the gaze samples immediately around them, so pupil validity gates gaze
  validity.
- **1500 %/s.** A full screen crossed in 67 ms — faster than any real saccade
  that still lands on a measurable point. Anything faster is tracker noise.
- **Median then mean.** The median kills impulse spikes without rounding corners;
  the mean afterwards removes the residual jitter the median leaves. Mean alone
  would smear spikes into their neighbours instead of deleting them.
- **150 ms interpolation limit.** Long enough for a blink, short enough that a
  real look-away is never bridged.

When the stimulus transform is `applied`, `_gaze_in_output_space` bypasses this
path for those rows and uses the authoritative `gaze_x_stimulus_norm` /
`gaze_y_stimulus_norm` columns instead — rows outside the stimulus stay
**absent**, and are never turned into zero-valued points or interpolated back
into the trace. In an all-scenario response, legacy cleaning is applied **per
scenario group** so smoothing never runs across a scenario boundary.

---

## 5.2 Pupil

Pupil diameter is the classic arousal / cognitive-load proxy.

- Timeseries: raw left, raw right, per-sample average, plus smoothed left and
  right with a **0.25 s** moving-average window (`win = round(fs × 0.25)`).
- Where only one eye is valid, the average uses that eye rather than producing
  `NaN`.
- Statistics are computed on the **smoothed** signal, so the number under the
  chart matches the line in the chart. Raw statistics are returned in parallel
  (`raw_mean`, `raw_std`, …) and shown as a hover tooltip — the honest
  before/after comparison.
- `std` uses `ddof=1` (sample standard deviation) when n > 1.

`distance` (eye-to-screen, mm in the CSV) follows the same shape, divided by 10
to report centimetres.

---

## 5.3 GSR

Galvanic skin response — sympathetic arousal. Slow signal, so:

- Smoothing window is **1.0 s** (vs 0.25 s for pupil). GSR phasic responses last
  1–5 s; smoothing faster than that would leave sensor noise in.
- Time is rebased to zero at the start of the scenario unless `absolute_time` is
  requested.
- Same smoothed-vs-raw statistics pattern as pupil.

---

## 5.4 EEG

The scientific contract was revised in September 2026 after auditing eight
reference CSVs and local acquisition files. See [EEG methods](../eeg-audit/METHODS.md)
and [recording findings](../eeg-audit/FINDINGS.md) for equations, evidence,
source limitations and validation.

- Raw EEG is the initial display; the optional 0.2 s moving mean is a trend
  display and can suppress EEG rhythms.
- Missing values remain missing. All spectral windows require contiguous finite
  data and retain the actual time axis; conditions and gaps are never joined.
- Welch uses periodic Hann, 50% overlap and segment-mean removal. Constant
  detrending removes DC, not arbitrary drift or other artifacts.
- Band powers are integrated from the complete linear PSD. Means of dB bins or
  normalized image pixels are not integrated physical powers.
- Spectrogram defaults are 1.5 s, 75% overlap, no normalization or smoothing.
  The 25 Hz display limit is a viewing choice, not an artifact classification.
- Topography uses local mean removal and Hann-energy-normalized mean squares.
  Its sparse schematic sensor map is an interpolation, not source localization.
- Explicit voltage units and the verified vendor kilo scale are normalized at
  ingestion. Older parquet must be re-ingested to receive this correction.

---

## 5.5 Cross-signal correlations

`CorrelationAnalyticsService` — a 6 × 6 zero-lag Pearson matrix over a curated,
fixed signal set.

**The problem it solves:** EEG at 300 Hz, gaze at 60 Hz, GSR at 10 Hz. You cannot
correlate arrays of different lengths, and interpolating the slow signals up to
the fast rate manufactures samples that were never measured.

**The solution: a shared 250 ms bin grid.**

```python
bin = floor((t − t_scenario_start) / 0.25)
```

Every signal is aggregated into those bins, so all six become vectors of the same
length on a common, scenario-relative time base.

| Signal | Unit | Aggregation | Preparation |
| --- | --- | --- | --- |
| `pupil_avg_mm` | mm | median | non-positive → NaN, 0.25 s smoothing, both eyes averaged |
| `gaze_x_pct`, `gaze_y_pct` | % | median | full `_clean_gaze` pipeline |
| `distance_cm` | cm | median | mm ÷ 10 |
| `gsr_smoothed_us` | µS | median | 1 s smoothing |
| `eeg_broadband_power_db` | dB | **mean** | per channel: bin mean removed, squared and averaged; fixed scalp channel set, complete samples and ≥80% coverage (minimum 8 samples); `10·log10` |

**Median for measurements, mean for power.** The median resists outliers in a
measured quantity. Power is an energy, and energy averages — a median of squared
values would not represent the bin's actual power.

Guards on every cell:

| Status | Condition |
| --- | --- |
| `unavailable` | the signal's source column does not exist |
| `insufficient_overlap` | fewer than **10** paired finite bins |
| `constant_signal` | one side has no variance (Pearson is undefined) |
| `ok` | coefficient returned, clipped to `[−1, 1]`, `−0.0` normalised to `0.0` |

Every cell also carries `n_samples` and `coverage`, so a correlation computed
from 11 bins is visibly weaker evidence than one from 400. Each signal's
metadata says whether it was available and, if not, exactly why — in Spanish, for
the UI.

**Caveat to state before anyone asks:** zero-lag Pearson only. GSR responds
1–5 s after a stimulus, so a real pupil↔GSR relationship will show up weakly
here. Lagged cross-correlation is the obvious next step.

---

## 5.6 Scanpath

The ordered path of fixations — where the participant looked, in what order, for
how long.

Built from the canonical event table ([3.11](03-fixation-detection.md#311-the-output-contract)),
so nothing is re-derived. Each event becomes one objective.

**Radius encoding — `absolute-area-v1`:**

```python
radius_norm = sqrt(clamp(duration_s / 2.0, 0, 1))
```

Three deliberate properties:

1. **Area-proportional.** Area ∝ r², so `r = sqrt(fraction)` makes the circle's
   *area* proportional to duration. Human perception judges circles by area, not
   radius; encoding on the radius directly would make a 2× longer fixation look
   4× bigger.
2. **Absolute, not relative.** The scale is fixed at a 2 000 ms cap rather than
   normalised to the participant's own maximum. Two participants' scanpaths are
   therefore directly comparable — under a per-participant scale, the biggest
   circle would mean "this person's longest fixation", which is not comparable
   across people.
3. **Capped, not clipped.** A fixation of 3 s reports `duration_s = 3.0` exactly
   and `radius_norm = 1.0`. The visual saturates; the data does not.

The metadata block `{"version": "absolute-area-v1", "encoding": "area",
"cap_ms": 2000}` ships with every response so a renderer can apply its own
minimum/maximum pixel radius while preserving area proportionality.

**Distance** is summed only **within a segment** — consecutive events in
different segments contribute no line, so a rejected off-stimulus interval cannot
draw a stroke across the image. Pixel distances use the probed stimulus size when
available, and fall back to 1920 × 1080 **with a warning** when it is not.

`total_duration_s` sums valid fixation dwell only: no saccades, no invalid-gaze
gaps, no time off the stimulus.

---

## 5.7 Heatmap

Server-rendered RGBA PNG, sized to the stimulus's own pixel dimensions so the
browser can overlay it 1:1.

```
1. WEIGHT      each fixation by duration_s
               (fixations with no usable duration get the median duration)
2. PROJECT     x_px = x_norm * out_w,  y_px = y_norm * out_h
               (no Y inversion — y_norm already grows downward)
3. REJECT      points outside the image bounds — never clipped to an edge
4. HISTOGRAM   2-D weighted histogram on a square-celled grid (longest edge 900)
5. BLUR        Gaussian, sigma = 0.105 × short edge (scaled into grid units)
6. NORMALISE   divide by max
7. GAMMA       H^0.7
8. THRESHOLD   H < 0.10 → 0, then renormalise
9. COLOUR      jet colormap; alpha = 0.75 where H > 0, else fully transparent
10. RESIZE     LANCZOS up to the exact stimulus dimensions
```

Why each step:

- **Duration weighting** — a heatmap should show *attention*, not *event count*.
  One 800 ms fixation deserves more weight than two 100 ms ones.
- **Square grid cells** — the grid is scaled from the output size so cells stay
  square whatever the aspect ratio. A circular Gaussian kernel on non-square
  cells becomes an ellipse, which would stretch every hotspot horizontally on a
  wide stimulus.
- **Sigma as a fraction of the short edge (10.5 %)** — resolution-independent.
  It reproduces the legacy renderer's look (21 cells of a 200-cell grid ≈ 113 px
  on a 1080 px edge) while keeping the kernel isotropic.
- **Gamma 0.7 < 1** — brightens mid-range values, so secondary areas of interest
  are visible rather than being drowned by the single hottest spot.
- **Threshold 0.10** — cuts the low-density haze so the stimulus stays readable
  under the overlay.
- **LANCZOS** — high-quality resampling; the density grid is coarse by design,
  and nearest-neighbour would show blocky artefacts.

---

## 5.8 AOI metrics

Areas of Interest: regions the analyst draws on the stimulus (rectangle, ellipse,
polygon). All hit-testing uses stimulus-normalised coordinates.

**Containment.** Bounding box first (cheap rejection), then per shape:

- **rect** — the bounding box is the answer.
- **circle/ellipse** — `((x−cx)²/rx²) + ((y−cy)²/ry²) ≤ 1`. Handled as an
  ellipse, so it stays correct on a non-square AOI.
- **polygon** — ray casting (even-odd rule): count how many edges a horizontal
  ray from the point crosses; odd = inside. `(previous_y − current_y) or eps`
  guards the horizontal-edge division by zero.

**Metrics per AOI:**

| Metric | Definition |
| --- | --- |
| `fixation_count` | Events whose centroid is inside |
| `total_dwell_time_ms` | Σ `duration_s` × 1000 of those events |
| `total_dwell_time_percent` | Share of all dwell in the scenario |
| `avg_fixation_duration_ms` | dwell ÷ count |
| `ttff_ms` | **Time to first fixation** — earliest `time_s` inside. The classic attention-capture measure. |
| `fixations_to_target` | 1-based index of the first fixation that landed inside — how many looks it took to find it |
| `hit_rate_percent` | Share of all fixations that landed inside |
| `avg_pupil_mm` + delta vs baseline | Sample-level pupil while gaze was inside |
| `avg_distance_cm` + delta vs baseline | Sample-level distance while inside |

Two dwell totals are reported, and the distinction matters:

- `total_dwell_time_ms` — all fixations in the scenario.
- `observed_aoi_dwell_time_ms` — dwell inside **at least one** AOI, counted once.
  Summing the per-AOI dwells would double-count overlapping AOIs; this one does
  not.

**Transitions** — an N × N matrix of AOI → AOI movements, used to describe
scanning strategy. Two rules:

- The previous AOI is **reset at every segment boundary**, so a "transition" can
  never be manufactured across a scenario change or a long discontinuity.
- Self-transitions are not counted (`previous != current`).

**Key events** — for each of pupil / gaze X / gaze Y / distance, the minimum and
maximum sample in the scenario, each tagged with its timestamp and the AOI it
fell in. This is what lets the UI say "peak pupil dilation at 12.4 s, inside
*Logo*".

---

## 5.9 Fixation duration histogram

Distribution of fixation durations. Bin count by **Sturges' rule**:

```python
k = ceil(log2(n) + 1)
edges = linspace(0, max_duration + 1e-9, k + 1)
```

Sturges scales the bin count with the log of the sample size — 20 fixations get
6 bins, 500 get 10. A fixed bin count would look empty for a short recording and
over-smoothed for a long one. The last bin is closed on both sides
(`>= lo & <= hi`) so the maximum value is never dropped; the others are
half-open.

Each bin returns count, percentage and mean duration (field names are Spanish:
`conteo`, `porcentaje`, `promedio_ms`).

---

## 5.10 Where the durations come from

Every spatial analytic above — fixations, scanpath, heatmap weight, AOI dwell,
histogram — consumes the **same** `duration_s` from the **same** canonical event
table. `FixationEventService` rebuilds it with a two-path rule, first path wins:

**Path 1 — detector support (preferred):**

```
duration_s = fixation_detector_sample_count / fixation_effective_rate_hz
```

Accepted only if all three consistency checks pass:

1. The declared rate does not exceed the file's observed grid rate — a V2 export
   can never detect faster than its own grid.
2. The stored count does not exceed the rows the event actually retains — every
   detector sample comes from at least one row.
3. The resulting support fits inside the time the event actually spans.

**Path 2 — row support (fallback, warns):** measure the intervals, each capped at
one cadence period, each run closing with one period for its final row.

An ID that had to be split into defensive spans never uses path 1: the stored
count describes the whole ID and cannot be divided between its spans.

The consequence is the thing to say out loud: **a 300 ms fixation measures 300 ms
in the fixation list, in the histogram, in the AOI dwell, in the scanpath radius
and in the heatmap weight — regardless of the rate its rows were exported at.**
