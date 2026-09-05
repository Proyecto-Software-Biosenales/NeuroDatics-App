# 3. Fixation detection (Fixation V2)

The core algorithm of the product.
[fixation_detection_service.py](../../backend/src/neurodatics/modules/projects/application/services/fixation_detection_service.py),
≈2 500 lines. Version string: `fixation-v2`.

---

## 3.0 The problem, in one paragraph

The eye does two things: it **fixates** (holds still on a point, ~200–400 ms,
this is when visual information is actually taken in) and it **saccades**
(jumps, 20–80 ms, effectively blind during the jump). Attention research is
built on fixations — where, how long, in what order. The eye tracker gives you
raw gaze coordinates at some rate; turning that stream into a list of fixation
events is a classification problem with two classic solutions:

- **I-DT** (Identification by **D**ispersion **T**hreshold): a fixation is a
  window of samples whose spatial spread stays below a threshold.
- **I-VT** (Identification by **V**elocity **T**hreshold): a sample belongs to a
  fixation when the eye's angular speed is below a threshold.

NeuroDatics implements both, picks automatically, and adds the accounting
machinery that makes the resulting numbers defensible.

---

## 3.1 Mode selection

```
screen geometry available (width_px, height_px, width_mm, height_mm,
                           viewing_distance_mm — all finite and positive)?
   ├── yes → adaptive-ivt-angular      (velocity in degrees of visual angle/second)
   └── no  → i-dt-normalized           (dispersion in screen fractions)
```

Angular mode is better when it is available, because degrees of visual angle are
the physiologically meaningful unit: 2° of eye movement is 2° whether the screen
is a 13" laptop at 40 cm or a 27" monitor at 70 cm. Normalised mode's threshold
is a fraction of *screen*, which is device-dependent — accepted as a deliberate
trade-off when calibration data is missing.

**Asking for angular mode without complete geometry is an error, not a
downgrade.** `_validate_contract` raises. Silently falling back would mean the
caller believes they got angular results when they did not.

In practice most uploads run **i-dt-normalized**, because labs rarely supply
physical screen millimetres and viewing distance.

---

## 3.2 Units: declared beats inferred

If units are not declared, `_resolve_gaze_units` looks at the observed maxima of
valid samples:

| Observed max (x and y) | Inferred | Reasoning |
| --- | --- | --- |
| ≤ 1.25 | `normalized` | values live in [0, 1] |
| ≤ 100.5 | `percent` | values live in [0, 100] |
| ≤ screen width/height × 1.01 (geometry required) | `pixels` | |
| anything larger | `percent` **+ ambiguity warning** | |

The last row is the interesting decision. When the data is ambiguous the code
picks the option that makes suspicious values **fail** rather than pass:
assuming `percent`, a value of 1400 becomes 14.0 in normalised space, out of
`[0, 1]`, therefore invalid and discarded. Assuming `pixels` would scale it
neatly onto the screen and it would silently become a real-looking fixation.

Time units follow the same shape (`_resolve_time_unit`): with a reference rate
available, the unit whose median Δt best matches `1/rate` in log space wins;
without one, `Δt ≤ 0.5` → seconds, `≤ 500` → milliseconds, else microseconds.
Every inference emits `time_unit_inferred:<unit>` into the warnings.

---

## 3.3 The validity mask

Computed by `_gaze_validity`, one reason per row, first match wins:

| Order | `gaze_invalid_reason` | Condition |
| --- | --- | --- |
| 1 | `signal_missing` | `gx` or `gy` non-finite, **or** the exact pair `(0, 0)` |
| 2 | `time_invalid` | timestamp non-finite or `t[i] <= t[i-1]` |
| 3 | `outside_screen` | normalised x or y outside `[0, 1]` |
| 4 | `outside_viewport` | (transform applied) outside the visible viewport |
| 5 | `outside_stimulus` | (transform applied) on screen but off the stimulus |
| — | `None` → **valid** | passed everything |

Exposed as the boolean column `is_valid_gaze` plus the reason string.

**Why `(0, 0)` is invalid.** Tobii-family trackers emit `(0, 0)` when they lose
the eye — a blink, a head turn, a lost corneal reflection. Taken literally it is
a look at the exact top-left pixel. A one-hour session can contain thousands of
these, and they would all pile onto the same corner of the heatmap. Controlled
by `zero_pair_is_invalid`, default `True`.

**Why reject instead of clip.** Clipping `x = 1.4` to `x = 1.0` invents a look at
the right edge of the stimulus. That fabricated point then wins AOI hits and
carries heatmap weight. Discarding it loses one sample; clipping it corrupts the
result. The same rule is applied again in the analytics layer and in the legacy
adapter.

---

## 3.4 Multi-rate handling and resampling

Recap from [1.4](01-pipeline-overview.md#14-a-worked-example--one-300hz-file-60hz-eye-tracker):

```python
effective_rate = min(eye_rate, grid_rate)     # both known
                 or whichever one is known
                 or 1 / median(Δt)            # last resort, warns
resampled = grid_rate > eye_rate * (1 + 0.05)  # 5 % tolerance
```

When `resampled` is true, `_build_analysis_block` builds a **detection view**
that exists only in memory:

```python
bins = floor((t - t0) * effective_rate + 0.5)          # nearest-bin assignment
for each bin:
    analysis_x[bin] = median(x of the VALID rows in that bin)
    analysis_y[bin] = median(y of the VALID rows in that bin)
    original_valid[bin] = (the bin contains at least one valid row)
    source_positions[bin] = [original row indices]     # the map home
```

Four properties worth stating out loud:

1. **Median, not mean.** One outlier in a bin cannot drag the bin's position.
2. **Only valid rows feed a bin.** A bin of nothing but blackout rows stays
   invalid.
3. **`source_positions` is the map back.** After detection, every event is
   projected onto the original rows through this map, so the persisted table
   keeps its original length and stays aligned with EEG and GSR.
4. **Only gaze is resampled.** EEG, GSR, pupil, distance and unknown sensors are
   never touched. This is the crucial constraint: a 300 Hz EEG channel must not
   be down-sampled to 60 Hz just because the eye tracker is slower.

---

## 3.5 Segmentation — the walls events cannot cross

`_segment_ids` assigns a segment ID per row. A **new segment** starts when any
of these happens:

| Boundary | Why |
| --- | --- |
| Scenario changes | A fixation cannot span two different stimuli |
| Time non-monotonic (`Δt ≤ 0`) | Clock reset or restart |
| Gap longer than 75 ms of *missing* time | Too much signal lost to claim continuity |
| Row is `outside_screen` / `outside_viewport` / `outside_stimulus` | Hard spatial boundary |

The gap test measures **missing** time, not elapsed time:

```python
missing = max(0, Δt - period)          # period = 1 / effective_rate
discontinuity = missing * 1000 > max_bridge_gap_ms   # 75 ms
```

At 60 Hz the normal `Δt` is 16.7 ms, so `missing = 0`. Only a genuine hole
counts. This makes the rule independent of the sampling rate — the same 75 ms
threshold behaves identically at 30 Hz and at 1000 Hz.

Hard-invalid rows are stronger than a gap: they reset the predecessor entirely,
so the next valid row **must** start a new segment. That is what prevents the
short-gap bridge (next section) from stitching a fixation across the moment the
participant looked off the stimulus.

Detection then runs **inside each segment independently**. No event, no
transition and no scanpath edge ever crosses a segment boundary.

---

## 3.6 Bridging short gaps

`_bridge_short_gaps`. Real eye data loses a sample or two constantly — a lash, a
partial blink, a tracking hiccup. Treating each as a fixation boundary would
shred one 400 ms fixation into five 80 ms fragments, none of which reaches the
200 ms minimum, and the fixation would vanish from the results.

A gap is bridged only when **both** conditions hold:

1. **Short enough** — `gap_ms ≤ 75 ms`, where the gap is
   `max(missing_by_samples, missing_by_clock)` (the more pessimistic of the two).
2. **Spatially compatible endpoints** —
   - normalised mode: `|Δx| + |Δy| ≤ 0.03` (the dispersion threshold)
   - angular mode: `hypot(Δx, Δy) / Δt ≤ velocity_threshold`

If both pass, the missing positions are linearly interpolated **in the detection
view only** and marked with a bridge ID.

Then the crucial part — what the bridge does **not** do:

| | |
| --- | --- |
| Interpolated values written to Parquet? | **No.** Those rows keep `(-100, -100)`. |
| Bridged rows get a `fixation_id`? | **No.** They stay null. |
| Bridged time counts as duration? | **No.** `duration_ms` uses valid support only. |
| Bridged time counts anywhere? | Only in `wall_duration_ms`, reported separately. |
| Can a bridge push an event over the minimum duration? | **No** — the minimum is checked against valid support. |

So bridging can only ever answer "are these two stretches the same fixation?" It
can never add attention that was not measured. Both `duration_ms` (valid support)
and `wall_duration_ms` (start-to-end wall clock) are stored, so the difference is
visible.

---

## 3.7 Algorithm A — I-DT normalised

`_idt_run`. The default path.

```
start at the first classifiable sample of the run
1. GROW  the window forward until its VALID SUPPORT ≥ min_duration (200 ms)
   (if the run ends first → stop; no more events here)
2. MEASURE dispersion = (max x − min x) + (max y − min y)
3. IF dispersion > 0.03  →  slide the start forward by 1 and go to 1
4. ELSE                  →  this is a fixation. EXTEND it one sample at a time
                            while dispersion stays ≤ 0.03
5. RECHECK valid support of the final window; if it still meets the minimum,
   emit the event
6. CONTINUE from the sample after the event
```

**Dispersion** is the classic Salvucci & Goldberg formulation: the sum of the x
range and the y range of the window (a cheap L1 proxy for a bounding box). With
threshold `0.03` in normalised coordinates, a fixation may wander up to 3 % of
the screen in x plus 3 % in y — roughly 58 px horizontally on a 1920 px display.
That covers normal fixational micro-movement (tremor, drift, microsaccades)
without merging two genuinely separate targets.

**Growing by valid support, not by row count**, is what keeps it rate-agnostic.
The window opens on 200 ms of *measured* gaze whether that is 12 samples at
60 Hz or 60 samples at 300 Hz — and if 40 % of the rows in that span are
blackout, the window keeps growing until it really has 200 ms.

**Worked example** — 60 Hz, threshold 0.03, minimum 200 ms (12 samples):

```
samples  x: 0.500 0.502 0.499 0.501 0.503 0.500 0.498 0.502 0.501 0.500 0.499 0.502
         y: 0.400 0.401 0.399 0.402 0.400 0.401 0.400 0.399 0.401 0.400 0.402 0.400
window of 12 → support = 12/60 = 200 ms ✓
dispersion = (0.503−0.498) + (0.402−0.399) = 0.005 + 0.003 = 0.008 ≤ 0.03  ✓ FIXATION
extend: sample 13 at (0.501, 0.401) → dispersion still 0.008 ✓ include
        sample 14 at (0.560, 0.480) → dispersion = 0.062 + 0.081 = 0.143 ✗ stop
event = samples 1..13, centroid = median of the window, duration = 13/60 = 217 ms
```

---

## 3.8 Algorithm B — adaptive angular I-VT

Used when full screen geometry is present. Four stages.

### 3.8.1 Screen fraction → visual angle

```python
x_mm = (x_norm − 0.5) * screen_width_mm         # offset from screen centre
y_mm = (y_norm − 0.5) * screen_height_mm
x_deg = degrees(arctan2(x_mm, distance_mm))
y_deg = degrees(arctan2(y_mm, distance_mm))
```

`distance_mm` is **per sample** when the CSV has a `distance` column (the tracker
measures eye-to-screen distance continuously); rows with an unusable distance
fall back to the calibrated `viewing_distance_mm`. Using the real per-sample
distance matters — a participant leaning in changes how many degrees a given
pixel offset represents.

### 3.8.2 Central-difference velocity

```python
velocity[i] = hypot(x_deg[i+1] − x_deg[i−1], y_deg[i+1] − y_deg[i−1]) / (t[i+1] − t[i−1])
```

Central difference (not forward difference) because it is symmetric and does not
shift event boundaries by half a sample. **Real timestamps** are used rather than
an assumed period, so jitter in the grid does not become fake velocity.

### 3.8.3 Adaptive threshold — the Mould-inspired gap statistic

A fixed 30 °/s threshold is the textbook default, but the right value depends on
the participant, the tracker and the noise level of that particular recording.
`_adaptive_velocity_threshold` estimates it **per segment**:

```
1. collect all LOCAL MAXIMA of the velocity trace
     (v[i] >= v[i−1] and v[i] > v[i+1], with 0 < v ≤ 1000 °/s)
2. need at least 11 of them, otherwise → fallback 30 °/s
3. sort them; compute
       empirical_cdf[k] = (k+1)/n
       uniform_cdf[k]   = (v[k] − v_min) / (v_max − v_min)
       gap[k]           = empirical_cdf[k] − uniform_cdf[k]
4. the threshold is the value at argmax(gap), excluding the last point
5. accept it only if:
       gap strength ≥ 0.10
       there is a cluster above it
       the next value is > 1.05 × the candidate   (a real separation)
       0 < candidate < 1000 °/s
   otherwise → fallback 30 °/s
```

**The intuition.** A recording's local speed maxima are bimodal: a dense cluster
of low values (fixational noise) and a sparse spread of high values (saccades).
If the distribution were a single uniform spread, the empirical CDF would track
the uniform CDF closely. Where the empirical CDF races *ahead* of the uniform
one, many points are packed into a narrow range — that is the noise cluster, and
its upper edge is where saccades begin. `argmax(gap)` finds that edge without
assuming a distribution shape or fitting any model.

Every fallback is recorded: the warning
`adaptive_velocity_threshold_fallback:segment:N` plus a per-segment
`segment_thresholds` entry, so you can always see which segments were adaptive
and which used the default.

### 3.8.4 Hysteresis

```python
high = threshold * 1.25
enter saccade  when speed > high
leave saccade  when speed ≤ threshold        (the low threshold)
non-finite speed → treated as saccade
```

A single threshold makes samples hovering near it flicker in and out of the
fixation state, shattering one event into many. The Schmitt-trigger pattern —
easy to leave, hard to re-enter — is the standard fix. A run must decisively
exceed 1.25× the threshold to become a saccade, and drop back to the threshold
to become a fixation again.

Finally, `_duration_filtered_runs` keeps only runs whose **valid support** meets
the minimum duration.

---

## 3.9 Duration accounting

`_valid_support_seconds` — the function that makes the numbers honest.

```python
for each RUN of consecutive valid samples in the event:
    for each interval between two consecutive valid samples:
        total += min(Δt, period)          # capped at one detector period
    total += median(capped intervals)     # terminal sample's own support
                                          # (or one period if it is alone)
```

Two rules:

- **`min(Δt, period)`** — an interval longer than one period means samples were
  missing in between. The event is credited with one period, not the whole gap.
  Without this cap, a 500 ms dropout inside a fixation would be counted as
  500 ms of attention.
- **The terminal sample gets support too.** A sample is not an instant; it
  represents the period it covers. Without this, an event of *n* samples would be
  credited `(n−1)` intervals — a systematic ~8 % underestimate for a 12-sample
  event.

On a regular grid this reduces exactly to
`detector_sample_count / effective_rate_hz`, which is the identity the analytics
layer uses to rebuild durations without re-measuring.

Each event stores:

| Field | Meaning |
| --- | --- |
| `duration_ms` | Valid support. **The number every analytic uses.** |
| `wall_duration_ms` | First-to-last timestamp + one period. Includes bridged gaps. |
| `fixation_detector_sample_count` | Detector samples the event used (12) |
| `fixation_source_row_count` | Original CSV rows it covers (60) |
| `fixation_effective_rate_hz` | Rate used (60.0) |
| `bridged_gap_count` | How many gaps were bridged |

Reporting `duration_ms` and `wall_duration_ms` separately is what lets a reviewer
see, per event, exactly how much time was interpolated over.

---

## 3.10 The five duration variants

Where you draw the "minimum fixation duration" line changes results
substantially, and there is no universally correct value — 100 ms is common in
reading research, 200–300 ms in scene viewing and marketing. Rather than baking
one in, ingestion computes **all five**: 100, 150, 200, 250, 300 ms. The UI
exposes a selector; the API takes `min_fixation_duration_ms`.

**200 ms is canonical.** Its columns keep the historical unsuffixed names
(`fix_x`, `fixation_id`, …); the other four use a deterministic suffix
(`fix_x__100ms`, `fixation_id__150ms`, …).

The two modes compute the variants differently, and the difference is
interesting:

| Mode | How | Why |
| --- | --- | --- |
| **I-DT** | Reruns the **full classification** for each duration | The minimum sets the size of the *opening window*, which changes where events start, which changes centroids and boundaries. A 100 ms result cannot be filtered into a 200 ms one. |
| **I-VT** | Classifies **once** at 100 ms, then filters and renumbers | Velocity classification does not depend on the minimum at all — the duration is a pure post-filter. Rerunning would produce identical work. |

Only five compact columns per variant are persisted, not five copies of a
40-column table. Everything shared (`time`, `scenario`, segment, rate, method,
provenance, raw gaze) is stored once. Every variant preserves the same index,
order and row count.

`FixationDurationVariantService` in the analytics layer presents any requested
variant through the canonical column names, so downstream analytics have one
implementation rather than five. A legacy Parquet with no variant columns
**disables** the selector and returns an error for a non-canonical request,
rather than labelling the same events with a threshold that was never computed.

---

## 3.11 The output contract

### Per sample (persisted to Parquet)

Row-aligned with the input. Every non-fixation row carries the exact pair
`fix_x = -100.0`, `fix_y = -100.0` — never a partial sentinel, never a leftover
coordinate.

### Per event (the canonical table the API serves)

| Field | Meaning |
| --- | --- |
| `id` | Stable ID from segment + fixation; defensive splits append `#spanN` |
| `x_norm`, `y_norm` | Centroid, normalised `[0, 1]` |
| `time_s`, `t_end_s` | Start and end |
| `duration_s` | Valid support only — no gaps |
| `detector_sample_count` | Detector samples |
| `source_row_count` | Original rows |
| `segment_id` | The wall that prevents joining across scenarios/discontinuities |

The centroid is the **median** of the event's valid samples (in both axes),
converted to percent for storage. Median, not mean, so one stray sample at the
edge of the dispersion window cannot pull the reported fixation point.

### Provenance, on every fixation-derived response

```json
{
  "algorithm_version": "fixation-v2",
  "method": "i-dt-normalized",
  "source": "raw_gaze",
  "estimated": false,
  "effective_sampling_rate_hz": 60.1125,
  "min_fixation_duration_ms": 200,
  "available_min_fixation_durations_ms": [100, 150, 200, 250, 300],
  "warnings": []
}
```

`estimated: false` **only** when the events came from a V2 detector export. The
heatmap endpoint returns the same information in headers
(`X-Fixation-Algorithm-Version`, `X-Fixation-Method`, `X-Fixation-Source`,
`X-Fixation-Estimated`, `X-Fixation-Effective-Rate-Hz`, `X-Fixation-Warnings`)
because a PNG body has nowhere to put it.

---

## 3.12 The legacy adapter

Parquets processed before V2 have `fix_x` / `fix_y` but no detector labels.
`FixationEventService._legacy_events` rebuilds approximate events from them by
proximity and continuity, under three deliberately conservative rules:

1. **Everything is marked as an estimate** — `estimated: true`,
   `algorithm_version: "legacy-adapter-v1"`, plus a warning saying the events and
   durations were reconstructed from stored samples and are not detector output.
2. **Outliers are rejected, not clipped** — a coordinate outside `[0, 1]`
   invalidates its row and cuts the event; the rejected count goes into
   `warnings`.
3. **Minimum two consecutive rows** — one isolated valid row between invalid rows
   is a transition sample or the survivor of a rejected stretch. It never becomes
   an event, a scanpath node or an AOI hit.

Containment rules that protect new data:

- A V2 Parquet with **zero** events returns zero events. It never falls back to
  the legacy path to produce something to display.
- `vendor_fix_x` / `vendor_fix_y` never feed either path.
- Historical Parquets are never silently rewritten. Re-processing is a user
  action.

---

## 3.13 Honest limitations

Worth saying yourself before a reviewer says it:

- **Static stimuli only.** Scroll, zoom, video motion and viewport changes are
  not represented; the transform contract explicitly rejects
  `geometry_stability: time_varying`.
- **Angular mode is only as good as its calibration.** Wrong millimetres or
  viewing distance produce wrong degrees, deterministically.
- **The thresholds (200 ms, 75 ms, 0.03, 30 °/s) are operational defaults, not
  physiological constants.** Different populations, tasks and devices may need
  different values — which is exactly why they are configuration and why five
  duration variants ship.
- **No human validation yet.** The detector avoids visible interpolation and
  inflated counts, but it has not been benchmarked against human-annotated
  ground truth. Stated openly in `FIXATION_V2.md`.
