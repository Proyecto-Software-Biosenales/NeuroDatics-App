# Performance & quality campaign — the plan

**Audience:** an agent starting cold. Everything needed to work a step is in this file or in
`FINDINGS.md` next to it. Do not re-derive the audit.

**Scope:** the analytics read path, executive reports, repositories and the frontend.
**Out of scope:** the upload / ingestion pipeline — see *Another agent owns the upload pipeline*.

**Ordering principle:** unblock, then index, then cap, then narrow, then restructure. Every step
is independently revertible and verifiable on its own. Nothing that changes numeric output is
attempted before the step that makes the change observable.

| # | Step | Risk | Effort | Outcome |
|---|---|---|---|---|
| 1 | Unblock the event loop | none | 15m | 2 lines; concurrency stops collapsing |
| 2 | Index the project-scoping foreign keys | low | 30m | 1 migration, 6 indexes |
| 3 | Move the image 304 check above the disk read | low | 20m | conditional GETs stop reading bytes |
| 4 | Cap the four uncapped timeseries endpoints | low | 1–1.5h | 33.6 MB → ~560 KB responses |
| 5 | Narrow `scope_to_scenario` and `find_gaze_at` | medium | 1.5–2h | 39 ms → 8 ms; 110 ms → ~1 ms |
| 6 | Persist the transform token so the cache can short-circuit | medium | 2–3h | 11 endpoints stop loading Parquet on a hit |
| 7 | Collapse the analytics route boilerplate | high | 2–3h | 1 536 lines → roughly half |
| 8 | Frontend: hook factory, then the shared tab | medium | 1.5–2h | 22 hooks → a table; cancellation by default |

Steps 1–4 are mechanical and can go in any order. **Step 7 must come after step 6** — the helper
should encode the corrected cache ordering so the pattern is right everywhere by construction.
Step 8's second half depends on its first half. Stopping after step 6 is a legitimate outcome.

**Revised 2026-09-12** against the advanced upload-hardening work. Steps 1, 4, 5, 6, 7 and 8b are
**unaffected** — every file they touch is untouched and every line number was re-verified. Steps
2, 3 and 8a needed line-number or scope corrections, applied in place. Step 8c is **largely
obsolete**; read its note before doing anything.

---

## Before you touch anything

### The baseline is green

Re-verified 2026-09-12, after the upload-hardening work advanced:

```
672 passed, 24 snapshots passed, ~21s
ruff: All checks passed        vulture: exit 0        deptry: no issues
tsc: exit 0                    eslint: 0 errors / 6 warnings
```

An earlier revision of this plan documented a red baseline with 14 upload-pipeline failures.
**That is resolved** — the work that caused it landed in the working tree and the suite went from
586 collected to 672. If you find red, it is new, and the first thing to check is `git status`
(see below) before assuming you caused it.

### Another agent owns the upload pipeline

A large body of uncommitted upload-hardening work sits in the tree — as of this revision, **31
modified files and 17 untracked ones**, all still on `a6962cc`. **Leave every one of them alone**,
and never run a blanket `git add -A`, `git stash`, `git checkout .` or `git reset --hard`.

Rather than pin a list that goes stale within hours, derive it:

```powershell
git status --short | Select-String -NotMatch 'docs/perf'
```

Everything that prints is someone else's. The concentrations are
`modules/projects/` (api, application, infrastructure, domain),
`frontend/features/projects/`, `frontend/lib/api/apiFetch.ts` and `docs/UPLOAD_*.md`.

Three steps brush against that territory:

- **Step 2** adds a migration. The highest existing number is `022_create_upload_attempts.py`,
  still untracked and another agent's, so **number yours `023_`** and chain `down_revision` to
  `022`'s revision id. Read that file first.
- **Step 2** also touches `projects/domain/entities.py`, which is modified. Add your `index=True`
  arguments to the existing lines; do not reformat, and stage with `git add -p`, taking only your
  hunks.
- **Step 8** touches `frontend/lib/api/apiFetch.ts` and the project dialogs, all modified. Re-read
  each before editing — 8a and 8c have already been partly overtaken (noted in place).

### Goldens are protected

From `CLAUDE.md`, and it is the rule that matters most here:

> Never regenerate existing snapshots to make a failing test pass. Pinned syrupy 4.6.1 has no
> `--snapshot-update-new-only` flag. Never use update flags in verification.

A snapshot going red in steps 4, 5 or 6 means **you changed the numbers**. That is the net doing
its job. Fix your change; do not touch the `.ambr`.

### Use the root venv

`backend/.venv` is incomplete and has no pytest. Always `../.venv/Scripts/python.exe`.

---

## The gate

`./verify.ps1` is your gate again — every check it runs was verified passing at this revision.
Run it before your first edit to confirm you inherited a clean tree, and after every commit.

```powershell
.\verify.ps1        # must print ALL GREEN
```

If the Playwright browser is missing, install it once with
`cd frontend; npx playwright install chromium`.

For a faster inner loop between commits, the individual gates — **all verified green at 672
passed / 24 snapshots**:

```powershell
cd backend; ..\.venv\Scripts\python.exe -m pytest -q --disable-warnings   # 672 passed
cd backend; ..\.venv\Scripts\python.exe -m ruff check src                 # must stay clean
cd frontend; npx --no-install tsc --noEmit                                 # exit 0, no output
cd frontend; npx --no-install eslint .                     # 0 errors, 6 warnings — never more
cd frontend; npm run test:hooks                                            # step 8 only
```

Because the tree carries someone else's uncommitted work, a red gate is not automatically yours.
Check `git status` and the failing test's subject before you start debugging.

### The net you are working over

These two suites pin the behaviour steps 4–7 could break. Know they exist before you start:

- `tests/characterization/test_analytics_http_contracts.py` — 23 analytics routes pinned over
  HTTP, snapshotted in `__snapshots__/test_analytics_http_contracts.ambr`.
- `tests/characterization/test_numeric_characterization.py` — numeric goldens over the analytics
  services, snapshotted in `__snapshots__/test_numeric_characterization.ambr`.

Plus targeted units: `tests/unit/test_gaze_at_scenario.py`,
`tests/unit/test_scenario_identity.py`, `tests/unit/test_stimulus_coordinate_analytics.py`,
`tests/unit/test_eeg_analytics_service.py`.

### Commit notation

Match the convention already in `git log`:

| Prefix | Meaning |
|---|---|
| `r ` | provable refactor — behaviour-preserving |
| `R ` | risky refactor — hand-edited restructuring |
| `F ` | behaviour change |
| `p ` | performance change with a measured before/after in the body |

Put the measurement in the commit **body**: the benchmark command, the before number, the after
number. One step per commit. Never mix a performance change with a restructuring.

### Proving a performance step

`docs/perf/bench/` holds three standalone scripts. They build synthetic frames matched to the
production schema, so they need no real data and no database:

```powershell
cd backend
..\.venv\Scripts\python.exe ..\docs\perf\bench\bench_scenario_scope.py
..\.venv\Scripts\python.exe ..\docs\perf\bench\bench_gaze_at.py
..\.venv\Scripts\python.exe ..\docs\perf\bench\bench_timeseries_payload.py
```

Run the relevant one **before** your edit and **after**. Paste both into the commit body. A
performance commit without a before/after number is not reviewable.

---

## Step 1 — Unblock the event loop

**Risk:** none. **Effort:** 15 minutes. **Do this first** — step 6 and the report fixes assume it.

`ParquetReaderService.read` is `async`, and the routes carefully wrap every pandas computation in
`anyio.to_thread.run_sync`. The read itself was missed: it reaches `pd.read_parquet` with nothing
between it and the event loop, so one request stalls every other request for the duration of the
read — ~31 ms on a warm ~71 MB file, far worse cold.

**File:** `backend/src/neurodatics/modules/analytics/application/services/parquet_reader_service.py`

1. Line **142** — `cached = self._cache.read_dataframe(project_id, participant_code, generation)`
   → wrap in `await anyio.to_thread.run_sync(...)`.
2. Line **166** — `return pd.read_parquet(path)` → wrap the same way.
3. Line **177**, in `read_from_cache_only` — same call, same fix.
4. `anyio` is currently imported *inside* `read` at line 148. Lift it to a module-level import
   and drop the local one.

**Verify:** the gate. No numeric output changes, so no snapshot should move. If one does, stop —
you changed something else.

**Commit:** `p run Parquet reads off the event loop`

---

## Step 2 — Index the project-scoping foreign keys

**Risk:** low. **Effort:** 30 minutes.

PostgreSQL does not index a foreign key just because it is a foreign key. Only four indexes exist
across the whole schema, so every project-scoped query is a sequential scan — including
`_load_user_parquet_candidates`, which runs on every Parquet resolution.

**Read `022_create_upload_attempts.py` first** (untracked, another agent's, and still the highest
number present). Number yours `023_` and chain `down_revision` to `022`'s revision id.

Add:

| Table | Columns | Why |
|---|---|---|
| `project_files` | `(project_id, kind)` composite | exactly what `_load_user_parquet_candidates` filters on |
| `projects` | `owner_id` | every project list |
| `participants` | `project_id` | |
| `scenaries` | `project_id` | |
| `scenaries` | `file_id` | per-scenario lookups in reports |
| `aois` | `scenaries_id` | |

Mirror each with `index=True` on the ORM column so the model and the database agree. Those live in
`projects/domain/entities.py` (**modified by another agent — stage with `git add -p`**),
`participants/domain/entities.py` and `scenaries/domain/entities.py`. The latter two are
**untouched**, so their line numbers are as the audit found them.

Two things the upload work changed here, both verified at this revision:

- `upload_attempts.project_id` (`entities.py:106`) **already carries `index=True`**. Leave it.
- A new table appeared — `drive_cleanup_tasks` (`entities.py:95`), with a `project_id` that is
  `nullable=False`, has no foreign key and **no index**. It is not on the analytics read path, so
  it is out of this step's scope. Mention it to whoever owns the upload work rather than adding an
  index to a table whose access pattern you have not read.

**Verify:** the gate, plus `alembic upgrade head` against a scratch database and
`alembic downgrade -1` to confirm the migration reverses.

**Commit:** `r index the project-scoping foreign keys`

---

## Step 3 — Move the image 304 check above the disk read

**Risk:** low. **Effort:** 20 minutes.

**File:** `backend/src/neurodatics/modules/projects/api/routes.py`, `_serve_project_file_image`

> **Line numbers re-verified at this revision.** `projects/api/routes.py` was modified by the
> upload work and everything here shifted by +7. The structure is unchanged and the finding
> stands; the numbers below are current.

The ETag is built at line **455** from `id:external_id:updated_at` — no file content is involved.
But the `if-none-match` comparison does not happen until line **470**, after a full `read_bytes()`
of the cached image at line 463 and a write into the in-memory cache. The browser revalidates on
every stimulus render, so the 304 path is the common case and it currently pays for bytes it will
never send.

Move the check to immediately after the `response_headers` dict at line **457**:

```python
    response_headers = { ... }

    if request.headers.get("if-none-match") == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=response_headers)
```

The three later comparisons at lines 481, 496 and 530 then become unreachable for the matching
case and should be simplified — but read each one first: 481 and 496 compare against
`cached_etag`, not `etag`, and that distinction may be load-bearing for an entry cached under an
older `updated_at`. If you cannot convince yourself, leave them and take only the early return.

The heatmap route at `analytics/api/routes.py:1298` already does this correctly. Use it as the
reference.

**Verify:** the gate. Add a unit test asserting that a request carrying a matching
`if-none-match` returns 304 without the disk cache being touched — patch `_read_disk_cache` and
assert it was not called.

**Commit:** `p answer image conditional GETs before reading the file`

---

## Step 4 — Cap the four uncapped timeseries endpoints

**Risk:** low, but it changes response *shape*, so the HTTP contract snapshots are in play.
**Effort:** 1–1.5 hours.

`compute_timeseries` builds six full-length float arrays and returns all of them. There is no
`max_points` on the route and no decimation in the service. Measured: **33.6 MB** of JSON for one
participant at 300 000 rows, 6.7 MB at 60 000. That payload is also written to Redis by
`set_json`, which has no size guard, and Redis runs `--appendonly yes` with no `maxmemory` — so it
is fsynced to an append-only file too.

**Services to change**

| File | Method |
|---|---|
| `pupil_analytics_service.py:25` | `compute_timeseries` |
| `pupil_analytics_service.py:416` | `compute_gaze_timeseries` |
| `pupil_analytics_service.py:511` | `compute_distance_timeseries` |
| `gsr_analytics_service.py:52` | `compute_timeseries` |

**Routes to change**

`analytics/api/routes.py` lines **351** `pupil_timeseries`, **565** `gaze_timeseries`,
**659** `distance_timeseries`, **751** `gsr_timeseries`.

Copy the EEG signature exactly — `max_points: int = Query(default=5000, ge=1, le=100000)` — and
the EEG decimation, which is already correct at `eeg_analytics_service.py:189`:

```python
        if max_points > 0 and time_arr.size > max_points:
            indices = np.linspace(0, time_arr.size - 1, int(max_points), dtype=int)
        else:
            indices = np.arange(time_arr.size, dtype=int)
```

Apply one index set to every array the method returns, so the series stay aligned. Decimate
**after** smoothing, never before — `_moving_average` needs the full-rate signal or the smoothed
trace changes shape.

**`max_points` must enter the Redis cache key.** Follow the EEG pattern at routes.py:866, which
already embeds it. Omitting it will serve a 5 000-point response to a request that asked for
100 000.

Then add a size guard to `AnalyticsRedisCache.set_json`
(`analytics/infrastructure/redis_cache.py:110`): skip the write and log a warning above a
threshold, the way `_set_cached_image` already does for images.

**Verify:** the gate. The HTTP contract snapshots *will* move, because the responses now carry a
new field and fewer points at the default. That is a real contract change, so:
1. Check the diff by eye and confirm every moved value is explained by decimation.
2. Regenerate **only** in an isolated directory per `CLAUDE.md`, review, and commit the snapshot
   update as its **own** commit, separate from the code.

Also update the frontend caller in `features/analytics/api/analyticsApi.ts` if you want the
smaller default to apply there, and re-run `npx --no-install tsc --noEmit`.

**Commit:** `F cap the pupil, gaze, distance and GSR timeseries responses`
then `r update analytics HTTP contract snapshots for timeseries caps`

---

## Step 5 — Narrow `scope_to_scenario` and `find_gaze_at`

**Risk:** medium — both are shared, and `scope_to_scenario` has 18 call sites.
**Effort:** 1.5–2 hours. **Bench before and after.**

### 5a — `scope_to_scenario`

**File:** `analytics/application/services/numeric_helpers.py:70`

Two full-column Python string passes run over the same data: `resolve_scenario_in_frame` does
`pd.unique(df["scenario"].dropna().astype(str))`, then `scope_to_scenario` does
`df["scenario"].astype(str).str.strip()`. Measured 39.1 ms where the selection alone is 8.0 ms.

Strip once and reuse the result for both the `unique` and the mask. When the column is already
string dtype and the importer has pre-stripped the values, compare against the raw column.

**Do not convert the column to `category`.** It was measured and it is *worse* — 72.8 ms — because
`astype(str)` forces materialization. The win is removing the string passes, not changing dtype.

### 5b — `find_gaze_at`

**File:** `pupil_analytics_service.py:188`, serving `GET /analytics/gaze-at` — the timeline
scrubber, so it fires on every tick. Measured **110 ms** to return one row.

Current order: `df.copy()` (29 ms) → full-column `astype(str).str.strip()` → `sort_values("time")`
over all 26 columns (35 ms) → whole-frame coordinate transform → two `idxmin` scans (0.8 ms).

Reorder to narrow first:
1. Apply the scenario mask.
2. `np.searchsorted` the time column for the nearest index — **0.003 ms** measured.
3. Run `_gaze_in_output_space` on that single row.

The Parquet is written in time order, so the sort is redundant to begin with — but **verify that
against a real file before relying on it**, and keep a guarded sort if the assumption does not
hold. The `raw_scenario` resolution at lines 221–229 exists to stop interpolation across a
scenario boundary; preserve that behaviour exactly.

**Verify:** the gate, and `tests/unit/test_gaze_at_scenario.py` specifically. The numeric goldens
cover both functions — **if a snapshot moves, you changed the answer, not just the speed.** Revert
and narrow further.

**Commit:** `p narrow the scenario filter to one string pass` and
`p find the nearest gaze sample without copying or sorting the frame`

---

## Step 6 — Persist the transform token so the cache can short-circuit

**Risk:** medium. **Effort:** 2–3 hours. This is the structural change that pays for itself.

Eleven of the twenty-one Parquet-reading endpoints call `reader.read()` *before*
`_redis.get_json(cache_key)`, because the key embeds `transform_cache_token(df)` — a hash of the
transform provenance carried in the frame. A cache hit therefore still pays the full disk read and
deserialization; only the pandas compute is saved.

Affected: `comparison_charts`, `gaze_at`, `gaze_timeseries`, `gaze_statistics`, `scanpath`,
`fixation_data`, `heatmap_overlay`, `fixation_duration_sensitivity`, `fixation_histogram`,
`aoi_metrics`. `comparison_charts` (routes.py:313) additionally has **no Redis caching at all**.

The transform provenance is fixed at ingestion and cannot change without a re-ingestion, which
already bumps `ingestion_generation`. So:

1. At ingestion, compute `transform_cache_token(df)` once and persist it —
   `Project.ingestion_generation` is the precedent, and `ProjectFile.file_metadata` already
   carries per-file transform data. **`upload_experiment_zip.py` is owned by another agent**, so
   either coordinate, or write the token lazily on first read and cache it on the row.
2. Read it from the project row that `_verify_ownership` already loaded — no extra query.
3. Build the cache key from that, check Redis, and only then construct the reader.
4. Give `comparison_charts` the same treatment so it gets a cache at all.

Keep `transform_cache_token(df)` as the fallback for rows written before the column existed, and
assert in a test that both paths produce the same token for the same frame. Without that
assertion a stale token silently serves the wrong participant's transform.

**Verify:** the gate, and the HTTP contract snapshots must **not** move — this step changes when
work happens, never what is returned. If a snapshot moves, the fallback and the persisted token
disagree.

**Commit:** `R resolve the transform cache token without loading the Parquet`

---

## Step 7 — Collapse the analytics route boilerplate

**Risk:** high — it touches every analytics endpoint at once. **Effort:** 2–3 hours.
**Do not start before step 6 is committed and green.**

`analytics/api/routes.py` is 1 536 lines of the same sequence twenty-one times: verify ownership →
read generation → validate window → build key → check Redis → read Parquet → run the service in a
thread → write Redis. The identical six-line `ValueError` / `FileNotFoundError` / `RuntimeError`
translation appears **21 times verbatim**.

That repetition is the *cause* of the step 6 bug, not a cosmetic issue: with no single place where
the ordering is decided, eleven endpoints drifted and ten did not.

1. A FastAPI dependency that yields a configured `ParquetReaderService` and localizes the
   exception translation into one `except` block.
2. A `cached_frame_endpoint(...)` helper taking the service callable, the cache-key parts and the
   response model, encoding the **corrected** ordering from step 6.
3. Migrate endpoints in small batches — three or four per commit, gate between each. Do not
   convert all twenty-one in one commit; a mixed failure is unrevertible in practice.

Leave the genuinely different ones alone: `gaze_at` (complexity 14), `heatmap_overlay` (streams
PNG bytes with its own ETag) and `list_participants` / `list_scenarios` (no Parquet). Forcing them
through the helper will cost more than it saves.

**Verify:** the gate after every batch. The HTTP contract snapshots and
`tests/fixtures/route_inventory.json` pin the surface — **neither may move**. A changed route
inventory means you dropped or renamed an operation.

**Commit:** `R route analytics reads through one cached-frame helper (N of M)`

---

## Step 8 — Frontend: hook factory, then the shared tab

**Risk:** medium. **Effort:** 2–3 hours. The two halves are ordered; the third is independent.

### 8a — Hook factory and request cancellation

`features/analytics/hooks/useAnalyticsData.ts` is 634 lines of 22 near-identical hooks: a
`useCallback` closing over the API arguments, passed to `useAnalyticsRequest`.

Only `useGazeAt` (line 138) creates an `AbortController`. The other 21 set a local `cancelled`
flag and let the request run, so switching participant or scenario leaves the backend computing a
multi-megabyte response nobody will read.

> **Partly overtaken — and in your favour.** The upload work rewrote `fetchWithTimeout`
> (`lib/api/apiFetch.ts:77-90`) to **compose a caller-supplied signal** with the timeout
> controller, and `ApiRequestInit` extends `RequestInit`, so `apiFetch` already accepts a
> `signal` today. Point 2 below was the hard half and it is done. Verified at this revision.
> `useAnalyticsData.ts` is **unchanged at 634 lines**, so the hook side is untouched.

1. `makeAnalyticsHook(apiMethod, errorMessage)` collapses the 22 to a table.
2. Thread a `signal` from `useAnalyticsRequest`'s cleanup into the `apiFetch` call. The transport
   already honours it — you are only supplying one. Replace the `cancelled` flag with an
   `AbortController` per request, the way `useGazeAt` already does.
3. While there: `apiFetch` still has in-flight de-duplication and a TTL cache on the **blob** path
   only (`inflightBlobRequests`, `blobCache`, `lib/api/apiFetch.ts:16-17`) — re-verified at this
   revision. Extending the same treatment to the JSON path removes duplicate analytics requests
   across sibling components. Optional, and worth its own commit.

`apiFetch.ts` is modified by another agent. Re-read it before editing and stage with `git add -p`.

**Verify:** `npx --no-install tsc --noEmit`, `npm run test:hooks` (real Chromium), and
`npx --no-install eslint .` at **0 errors / 6 warnings** — the ratchet must never rise.

### 8b — The shared single-signal tab

`GsrTab.tsx` (522), `DeviceDistanceTab.tsx` (696) and `PupilDilationTab.tsx` (941) are the same
composition: three `Card`s, a timeseries hook and a statistics hook, `TimeWindowControls`, a
Recharts line with a `ReferenceLine`, a `StatisticsTable`. Only the signal name, unit and axis
domain differ.

Extract `SingleSignalTab` taking `{ label, unit, useTimeseries, useStatistics, domain }`.
`AnalyticsChartShell` already exists for the chart frame — reuse it rather than adding a second
abstraction. `PupilDilationTab` carries extra state (12 `useState`) and may not fit cleanly; if it
resists, convert the two that do and record why in `FINDINGS.md`.

### 8c — The duplicated upload progress hook — **MOSTLY DONE, do not redo**

> **Superseded by the upload work. Re-verified at this revision.**

The audit found ~70 duplicated lines differing in 5. That is no longer true. The other agent
extracted `create-project/useZipUploadAttempt.ts` (124 lines — attempt UUID, `AbortController`,
polling timer, cancellation) and **both** `EditProjectDialog.tsx` and `useCreateProjectWizard.ts`
now import it. Separately, the client-side speed and ETA computation was deleted outright: the
backend now returns `speed_mbps` and `eta_seconds` and both call sites just destructure them.

Measured now: both files shrank (1 164 → **1 089**, 947 → **836**), and the remaining common
region is ~28 lines of which ~10 differ — mostly the progress-message sink, which is a genuine
difference between the two surfaces (`setSaveProgressMessage` vs `updateProgress` + a
`toast.loading`).

**What is left is not worth a refactor.** The thirteen `useState` fields are still declared in
both, but they now feed different UI and the logic behind them is shared. Extracting them would
trade ~20 lines of duplication for an indirection across two dialogs that are still being actively
changed.

**Do this instead, if anything:** `EditProjectDialog` still runs 20 `useState` with **zero**
`useMemo`/`useCallback`, so every progress tick re-renders the whole 1 089-line tree. That is a
real cost and it is independent of the duplication. Memoize the callback props before considering
any extraction — and coordinate first, because the file is being edited.

**Commit:** `R build the analytics hooks from one factory`, `R share one single-signal tab`,
`R extract the zip upload progress hook`

---

## When to stop

Stop and report rather than pressing on when:

- The scoped gate is red before your first edit — someone else's work landed; re-read this file's
  baseline section and re-pin the allowlist.
- A protected snapshot moves on a step that claims to preserve behaviour (1, 2, 3, 6, 7, 8).
- A step needs a change inside the upload pipeline files listed above.
- ESLint warnings rise above 6.

Steps 1–4 delivered and green is a good outcome on its own. They are most of the measured win for
a fraction of the risk.
