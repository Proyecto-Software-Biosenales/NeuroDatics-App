# Findings — evidence base

Why `PLAN.md` says what it says. Append-only. `PLAN.md` answers *what is left*; this file answers
*why we concluded that*, so the plan does not have to carry its own justification and rot.

Audited 2026-09-12 against branch `dashboard` at `a6962cc`.

**Re-verified later the same day** against the advanced upload-hardening work in the tree. The
analytics module, `parquet_reader_service.py` and the analytics tab components are **untouched**,
so M1–M4, S1, D1, D3, D4 and D5 hold exactly as written. Findings that moved are marked inline.

**Scope:** analytics read path, executive reports, repositories, frontend.
**Excluded by request:** the upload / ingestion pipeline.

---

## How the numbers were produced

Synthetic frames matched to the production schema — 300 000 rows × 26 columns, a ~71 MB Parquet —
run against the repository `.venv`. No real experiment data, no database, no network.

Reproduce with the scripts in `bench/`:

```powershell
cd backend
..\.venv\Scripts\python.exe ..\docs\perf\bench\bench_scenario_scope.py
..\.venv\Scripts\python.exe ..\docs\perf\bench\bench_gaze_at.py
..\.venv\Scripts\python.exe ..\docs\perf\bench\bench_timeseries_payload.py
```

Timings vary a few ms between runs; the payload sizes are exact. The figures below are from the
audit run, so expect your own numbers to differ slightly — what matters is the ratio between the
lines, which is stable.

Caveat worth carrying: these are **warm-cache, single-process** numbers on synthetic data. Real
cold reads, larger sessions and concurrent requests will be worse, not better. Treat every figure
below as a floor.

---

## Measured

### M1 — Timeseries endpoints return every sample

`pupil_analytics_service.py:25` `compute_timeseries` builds six full-length float arrays — `time`,
`left`, `right`, `average`, `smooth_left`, `smooth_right` — and returns all of them. No
`max_points` on the route, no decimation in the service.

```
rows=  60000   compute=  10 ms   JSON payload =  6.7 MB
rows= 300000   compute=  47 ms   JSON payload = 33.6 MB
```

The same shape applies to `compute_gaze_timeseries` (:416), `compute_distance_timeseries` (:511)
and `gsr_analytics_service.py:52`. Only `comparison_charts`, `eeg_timeseries` and `eeg_psd` accept
a cap.

Compounding factors:
- The result is written to Redis by `redis_cache.py:110` `set_json`, which has **no size guard**.
- `docker-compose.yml:64` runs Redis with `--appendonly yes` and **no `maxmemory` or eviction
  policy**, so a 33 MB analytics response is fsynced to an append-only file and nothing ever
  evicts it.

`eeg_analytics_service.py:189` already implements the correct decimation. It is the reference.

### M2 — `find_gaze_at` copies and sorts the whole frame to read one row

`pupil_analytics_service.py:188`, serving `GET /analytics/gaze-at` — the timeline scrubber, so it
fires on every tick.

```
find_gaze_at (one scrub tick)   110 ms
  df.copy()                      29 ms
  sort_values('time')            35 ms
  idxmin scan                     0.8 ms
  searchsorted on sorted time     0.003 ms
```

The three expensive operations are applied to the entire frame; the lookup the endpoint exists to
perform is the 0.003 ms line. The Parquet is written in time order, so the sort appears redundant
— **this was not verified against a real file** and must be before the sort is removed.

The `raw_scenario` resolution at lines 221–229 is load-bearing: it stops interpolation across a
scenario boundary when two scenarios hold overlapping times. Preserve it.

### M3 — `scope_to_scenario` makes two redundant Python string passes

`numeric_helpers.py:70`, called from 18 sites across 8 services.

```
scope_to_scenario (as written)        39.1 ms
  astype(str).str.strip() alone         17.5 ms
  pd.unique(dropna().astype(str))       14.9 ms
  mask + .loc only                       8.0 ms
scope_to_scenario (category dtype)     72.8 ms   ← worse
```

`resolve_scenario_in_frame` runs `pd.unique(df["scenario"].dropna().astype(str))`, then
`scope_to_scenario` runs `df["scenario"].astype(str).str.strip()` over the same column. Both are
per-row Python string operations.

**The `category` result is the important one.** Converting the column to `category` is the obvious
fix and it makes things nearly twice as slow, because `astype(str)` forces materialization. The
win is removing the string passes, not changing the dtype. Recorded here so nobody re-derives it.

### M4 — Parquet reads run on the event loop

`parquet_reader_service.py:133` `read` is `async`, and the routes correctly wrap every pandas
computation in `anyio.to_thread.run_sync`. The read itself was missed:

- `:142` `cached = self._cache.read_dataframe(...)` → `parquet_cache.py:107` → `pd.read_parquet`
- `:166` `return pd.read_parquet(path)` after the Drive download
- `:177` same call in `read_from_cache_only`

```
pd.read_parquet, ~71 MB file, warm OS cache   31 ms
pd.read_parquet, columns=["time","scenario"]   11 ms
```

31 ms during which **every other request is stalled**. A cold read is far worse. This is the
cheapest fix in the audit and a prerequisite for the report fixes (S3 below).

---

## Structural

### S1 — The Redis cache key depends on the data it is meant to avoid loading

11 of the 21 Parquet-reading endpoints call `reader.read()` *before* `_redis.get_json(cache_key)`,
because the key embeds `transform_cache_token(df)` (`coordinate_transform.py:289`) — a hash of
transform provenance carried in the frame.

```
reads Parquet before checking cache:
  comparison_charts, gaze_at, gaze_timeseries, gaze_statistics,
  scanpath, fixation_data, heatmap_overlay, fixation_duration_sensitivity,
  fixation_histogram, aoi_metrics                      11 of 21
```

So a cache hit still pays the full disk read and deserialization; only the pandas compute is
saved.

Two additional observations:
- `comparison_charts` (`routes.py:313`) has **no Redis caching at all**.
- `heatmap_overlay` checks its ETag in the right place (`routes.py:1298`) but the ETag derives
  from the same data-dependent token, so a 304 still costs a full load.

The provenance is fixed at ingestion and cannot change without a re-ingestion, which already bumps
`ingestion_generation`. It is persistable.

### S2 — No indexes on any project-scoping foreign key

PostgreSQL does not index a foreign key just because it is a foreign key — unlike MySQL. Across
the whole schema only four indexes exist: `project_sensors.project_id` (migration 002),
`processing_jobs` (016), `app_users.email` (017), `upload_attempts.project_id` (022, untracked).

> **Re-verified.** Still true for all six columns below. Two notes from the upload work: a new
> `drive_cleanup_tasks` table (`entities.py:95`) adds a seventh unindexed `project_id` — out of
> scope here, since it is not on the read path — and `entities.py` line numbers shifted, though
> `participants/` and `scenaries/domain/entities.py` are untouched.

```
unindexed, and queried on the request path:
  project_files.project_id   every Parquet resolution
  projects.owner_id          every project list
  participants.project_id
  scenaries.project_id
  scenaries.file_id
  aois.scenaries_id
```

`_load_user_parquet_candidates` filters on `(project_id, kind, deleted_at)`, so a composite on
`(project_id, kind)` is the highest-value single index.

### S3 — Executive reports load sequentially and concatenate eagerly

`executive_report_service.py`:

- `:644` `_concat_frames` deep-copies every participant's DataFrame and concatenates the lot. Its
  **only** consumer is `build_spatial_assets` at `:1771`, which runs only when
  `"EyeTracker" in selected_sensors`. A GSR-only or EEG-only report builds the whole combined
  frame and never touches it. At ~70 MB per participant a 20-participant project moves well over
  a gigabyte through memory for nothing.
- `:1765` `scenario_combined = combined_df` is a dead alias from an earlier shape of the loop.
- `:1898` `_read_participant_frames` awaits `reader.read()` once per participant in sequence —
  and because of M4 that read is synchronous inside, so the whole server stalls for the duration.
  **M4 must be fixed first.**
- `:1921` `_load_scenario_images` downloads one Drive file per scenario sequentially, with a
  `_load_project_file` query per scenario on top.

### S4 — A video seek loads the entire participant Parquet

`projects/api/routes.py:530` `_compute_video_frame_time_s` loads the whole frame and calls
`compute_scenario_relative_time`, which needs only the minimum `time` within one scenario. On a
miss it reads twice: `read_from_cache_only`, then `read`, which re-checks the same cache before
downloading.

`pd.read_parquet(path, columns=["time", "scenario"])` measured 11 ms against 31 ms. Better still,
store per-scenario start times on `Scenaries` at ingestion and skip the Parquet entirely.

*Not in `PLAN.md` as its own step — fold it into step 6, which touches the same seam.*

### S5 — A conditional GET on a stimulus image still reads the file

`projects/api/routes.py:427` `_serve_project_file_image`. The ETag is built at `:448` from
`id:external_id:updated_at` — no content involved. The `if-none-match` comparison is at `:463`,
after a full `read_bytes()` at `:456` and a write into the in-memory cache.

The browser revalidates on every stimulus render, so 304 is the common case. The heatmap route at
`analytics/api/routes.py:1298` gets the ordering right and is the reference.

### S6 — Repository N+1s

- `scenaries/infrastructure/repository_impl.py:205` `upsert_aois` issues one `SELECT` per incoming
  AOI, then twenty lines further down runs a single query loading **every** AOI in the project —
  the exact rows the loop was fetching one at a time. The bulk result is already there.
- `participants/infrastructure/repository_impl.py:15` `upsert_participants` costs three round
  trips per participant: a `SELECT` to check existence, a `flush()` per new row, and a `refresh()`
  per participant in a second loop after `commit()`. ~90 sequential round trips for 30
  participants where 2 would do.

*Not in `PLAN.md` as their own step — both are upsert paths reached from ingestion, which is out
of scope. Recorded for when that work resumes.*

---

## Duplication

### D1 — 21 copy-pasted endpoint bodies

`analytics/api/routes.py`, 1 536 lines. Verify ownership → read generation → validate window →
build key → check Redis → read Parquet → run service in a thread → write Redis. Twenty-one times,
differing only in the service method, the cache prefix and the response model. The identical
six-line exception translation appears **21 times verbatim**.

This is the *cause* of S1, not a cosmetic issue: with no single place where the ordering is
decided, eleven endpoints drifted and ten did not.

### D2 — `EditProjectDialog` re-implements the create wizard's upload state machine

> **SUPERSEDED — mostly fixed by the upload-hardening work. Do not act on the original finding.**

**As audited:** `EditProjectDialog.tsx` (1 164 lines) and `useCreateProjectWizard.ts` (947 lines)
held the same thirteen state fields, and their Drive polling blocks diffed at **5 differing lines
of 70** — the rest character-identical.

**As re-verified:** two changes landed independently.

1. `create-project/useZipUploadAttempt.ts` (124 lines) was extracted — attempt UUID,
   `AbortController`, polling timer, cancellation — and **both** files now import it.
2. The client-side speed/ETA computation was deleted. The backend now returns `speed_mbps` and
   `eta_seconds`; both call sites destructure them.

Both files shrank (1 164 → 1 089, 947 → 836) and the remaining common region is ~28 lines of
which ~10 differ, mostly the progress-message sink — a real difference between the surfaces.

**What survives:** the thirteen `useState` fields are still declared in both, and
`EditProjectDialog` still runs 20 `useState` with **zero** `useMemo`/`useCallback`, so every
progress tick re-renders the whole 1 089-line tree. The re-render cost is real and independent of
the duplication; the duplication itself is no longer worth a refactor.

### D3 — 22 identical hooks, one of which cancels

`features/analytics/hooks/useAnalyticsData.ts`, 634 lines. Each hook is the same twenty lines.
Only `useGazeAt` (`:138`) creates an `AbortController`; the other 21 set a local `cancelled` flag
and let the request run — so switching participant or scenario leaves the backend computing a
multi-megabyte response nobody will read.

`apiFetch` already has in-flight de-duplication and a TTL cache, but only on the **blob** path
(`inflightBlobRequests`, `blobCache`, `lib/api/apiFetch.ts:16-17`). The JSON path — every
expensive analytics call — has neither. **Re-verified: still true.**

> **Partly overtaken, in your favour.** The upload work rewrote `fetchWithTimeout`
> (`lib/api/apiFetch.ts:77-90`) to compose a caller-supplied signal with the timeout controller,
> and `ApiRequestInit` extends `RequestInit` — so `apiFetch` accepts a `signal` today. The
> transport half of the cancellation fix is done; only the hooks need to supply one.
> `useAnalyticsData.ts` is unchanged at 634 lines.

### D4 — The same single-signal tab, three times

`GsrTab.tsx` (522), `DeviceDistanceTab.tsx` (696), `PupilDilationTab.tsx` (941). Same
composition: three `Card`s, a timeseries hook and a statistics hook, `TimeWindowControls`, a
Recharts line with a `ReferenceLine`, a `StatisticsTable`. Signal name, unit and axis domain
differ.

`AnalyticsChartShell` (50 lines) exists and is used for the chart frame, but the surrounding
loading, error and empty states are hand-written in each of ten tab components.

### D5 — Four EEG methods repeat the same twelve-line preamble

`eeg_analytics_service.py` — `compute_timeseries`, `compute_psd`, `compute_spectrogram`,
`compute_topography`. Resolve channels, bail if empty, `scope_to_scenario`, check for `time`,
filter the window, `df[["time"] + channels].copy()`, `to_numeric` each column, drop and sort.
Identical in all four.

`EegTab.tsx` calls all four endpoints in parallel on mount, so the preamble — and the Parquet load
behind it — runs four times over the same data for one tab render.

*Not in `PLAN.md` as its own step; it falls out of step 7.*

### D6 — One 1 961-line report module holds four unrelated jobs

`reports/application/services/executive_report_service.py` — sensor and scenario resolution,
metric aggregation, PIL image compositing (`_draw_heatmap`, `_draw_scanpath`, `_draw_aois`) and
matplotlib PDF layout (~30 `_add_*` / `_draw_*` helpers), with no seam between them. The page
layout cannot be tested without the data pipeline, or the aggregation without matplotlib.

A split along the existing joins — `report_data.py`, `report_imaging.py`, `report_layout.py` —
changes no logic and keeps the golden snapshots valid.

*Not in `PLAN.md`. Lower value than steps 1–8 and best done after them.*

---

## Complexity ratchet

Ruff 0.16.6 (the pinned version), run `--isolated` so no project configuration was modified:

```powershell
cd backend
..\.venv\Scripts\python.exe -m ruff check src --select C901 --no-cache --isolated `
  --config "lint.mccabe.max-complexity = 10" --output-format concise
```

Ingestion-pipeline functions are excluded from this table by scope; the largest of them scores 47.

| Function | Module | Complexity |
|---|---|---|
| `compute_spectrogram` | eeg_analytics_service.py:303 | 20 |
| `from_dict` | scenaries/domain/stimulus_placement.py:264 | 19 |
| `build_executive_report_pdf` | executive_report_service.py:1581 | 17 |
| `_from_v2` | fixation_event_reconstruction.py:101 | 17 |
| `prune_media_cache_dir` | projects/infrastructure/media_cache_janitor.py:58 | 16 |
| `_legacy_events` | fixation_event_reconstruction.py:272 | 16 |
| `compute_topography` | eeg_analytics_service.py:450 | 15 |
| `compute_psd` | eeg_analytics_service.py:209 | 14 |
| `compute_metrics` | aoi_analytics_service.py:355 | 14 |
| `gaze_at` | analytics/api/routes.py:443 | 14 |
| `upsert_scenaries` | scenaries/infrastructure/repository_impl.py:23 | 13 |
| `_serve_project_file_image` | projects/api/routes.py:428 | 12 |
| `_build_chart` | comparison_chart_config.py:119 | 12 |
| `resolve_scenario` | shared/scenario_identity.py:130 | 11 |
| `_draw_eeg_matrix` | executive_report_service.py:1320 | 11 |

Three of the top ten are the EEG methods that share the duplicated preamble (D5). Removing it
takes each down by roughly 4.

---

## What is already good

Recorded so nobody "fixes" it:

- **The frontend is essentially lint-clean** — one rule, six instances of
  `@next/next/no-img-element`, matching the ratchet `verify.ps1` enforces. Nothing in this audit is
  lint-visible; it is all structural.
- **The routes thread their pandas work correctly.** Every service call goes through
  `anyio.to_thread.run_sync`. Only the Parquet read itself was missed (M4).
- **The cache-generation design is sound.** `ingestion_generation` scoping, the atomic
  temp-file-plus-rename in `parquet_cache.py:87`, the redirected-path refusal in `_is_redirected`,
  and the `keep_previous` retention window are all carefully reasoned. Do not simplify them.
- **The characterization suites are a real net** — 23 analytics routes pinned over HTTP plus
  numeric goldens. They are what makes steps 4–7 safe to attempt.
- **`_escape_key_part` in `redis_cache.py:19`** correctly prevents cache-key collisions between
  participants and scenarios. Leave it alone.

---

## Open questions for a human

1. **Is the Parquet guaranteed to be written in time order?** Step 5b's removal of
   `sort_values("time")` depends on it. Not verified — no real Parquet was available in the
   checkout.
2. **What is a reasonable `max_points` default for the four uncapped endpoints?** The plan assumes
   5 000 to match EEG, which takes a 33.6 MB response to roughly 560 KB. If the pupil chart needs
   finer resolution at default zoom, that number should change before step 4 is written.
3. **Should Redis get a `maxmemory` and an eviction policy?** Analytics responses are a cache, not
   durable state, so `--appendonly yes` persisting them is arguably wrong regardless of size. That
   is a deployment decision, not a code one.
