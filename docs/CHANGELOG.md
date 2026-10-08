# NeuroDatics — Change log

What changed in the app on branch `dashboard` from **2026-09-03** to **2026-09-19**, grouped by
campaign. Each entry says what changed, why it matters and how it was checked. This file
replaces the finished campaign notes: `docs/cleanup/`, `docs/perf/*.md` and
`docs/eeg-audit/HANDOFF.md`. The cleanup and perf notes are still in Git:
`git show 7c21bc8:docs/cleanup/LEDGER.md` (or any other path). The EEG handoff was never
committed, so this page is now its only record.

Add new entries at the top of *Unreleased*.

## At a glance

| | Before (2026-09-03) | Now |
|---|---|---|
| Backend tests | 494 | **919** passed, 24 protected snapshots |
| Frontend unit tests | 34 (some never ran) | **69** (measured 2026-09-24) |
| Real-browser (Chromium) tests | 0 | **42** hook/component regressions + 7 e2e |
| ESLint | 25 errors / 15 warnings | **0 errors / 6 warnings** (enforced) |
| HTTP operations | 51 + 2 health | **44 + 2 health** (retired surfaces removed on purpose) |
| Verification | four manual commands | one `./verify.ps1` gate (**ALL GREEN**) |

---

## Unreleased

### 2026-10-03 — G12 gate cerrado documentalmente
- Registrado el gate global completado por root: item 14 `COMPLETED`, exit 0, `ALLGREEN`, `VERIFY_EXIT=0` y ESLint con 0 errores/6 warnings. La captura parcial histórica de `verify-final.log` se conserva como limitación de Tee, no como fallo del gate.
- Documentadas las correcciones aprobadas G04/G07 (cinco fuentes) y la corrección G10 limitada a anotaciones/importación de contrato del fixture E2E. G12 queda completo, pendiente únicamente de revisión/aprobación root; deploy, distribución y equivalencias externas siguen fuera de alcance.

### 2026-10-03 — Performance campaign integrated; historical gate diagnosis superseded
- Replayed the preserved G00 backend, browser, FFmpeg and Typst matrix on the current code with the same synthetic corpora/runtime and warmup plus five samples. The full field-level comparison lives in `docs/perf/ejecucion/RESULTADOS.md`; representative large-fixture changes include report collect −60.8%, AOI HTTP miss −42.9%, GSR HTTP miss −79.0%, and return-to-project EEG traffic from 6 requests/70,743 fixture bytes to 1/424.
- An integrated synthetic concurrency probe overlapped current analytics response/Parquet helpers with real report I/O admission. It observed maxima of 4 response workers, 4 physical downloads, 2 report workers plus 4 waiting, 6 Parquet decodes and 4 response computations; cancellation retained active slots until physical settlement and authorization rejected before cache/Drive. These are one-process fake-adapter observations, not a global RAM or deployment bound.
- The isolated production build, 11 selected dashboard/comparison/EEG E2E tests, local-mode export and browser smoke passed. G12 made no product change and did not build a frozen distribution.
- Historical note: the initial complete run stopped in backend pytest with 1,163 passed, 20 failed and 25 snapshots passed; the approved sequential corrector later resolved those fixture/template issues. The current green gate and closure status are recorded above. PostgreSQL, Redis, Drive, cloud and frozen-package validation remain outside scope.

### 2026-10-03 — Topography optimization evaluated and not adopted
- Chromium profiling across 320/640/960 CSS px and DPR 1/2/3 found inverse-distance interpolation dominates large topography frames: the complete seven-channel fixture measured 1.00 ms at a 320² backing raster, 14.30 ms at 1280² and 83.20 ms at 2880² (warmup + five measured frames).
- A bounded per-panel candidate cached separable Float64 distances and head spans. Across stable masks its median change was only −1.80%, with 12 regressions and a worst +19.29%; finite/NaN mask changes and cold frames were slower. The candidate was removed, leaving the canvas and presentation sources byte-identical to the received version.
- The largest tested raster requires at least 63.28 MiB for live ImageData plus an RGBA canvas backing; browser/GPU overhead and RSS were not observable. These synthetic harness results are not a claim about other montages, devices or deployments.

### 2026-10-03 — Comparativas carries statistics with its charts
- The versioned comparison response now carries summaries from the exact display samples previously fetched through five separate temporal endpoints. Median, sample deviation, baseline, peak, finite-value handling, labels and units retain the former table contract; chart decimation remains independent and explicit.
- Selecting all five temporal views now uses one comparison request instead of six. Each signal is transformed once, a failed signal is isolated, and the existing analytics loader/session/generation/AOI invalidation rules remain in force.
- On the golden synthetic participant, direct compact-JSON estimates fell from 529,071 to 286,459 bytes (small) and 3,379,386 to 1,832,079 bytes (the 64-block G00 large corpus). The fixed service-call topology is 10 to 5; instrumented in-process HTTP contracts observed Parquet reads 6 to 1 and transform-token calls 2 to 1. Python 3.14/3.12 contracts, protected snapshots, frontend checks, an isolated production build, seven prior comparison E2E tests and the targeted partial/empty closure passed. These are fixture/harness results, not measured network bytes or a whole-application/PostgreSQL/Redis claim.

### 2026-09-29 — Fixation detection 5.8× faster, output unchanged
- **Why:** with the worker pool in place, fixation detection was still 30 s of the 41 s serial SAIO ingestion.
  The I-DT window in `_idt_run` grew one sample at a time and recomputed the whole window's valid support at
  each step. That came to 1.8 M `_valid_support_seconds` calls, each with a median and several diffs, repeated
  for all five minimum durations.
- **Hopeless windows are skipped** (`_min_supporting_valid_samples`). Support is not monotone in window length,
  because a short final interval lowers the median term, so it cannot be bisected. It is bounded, though: each
  valid sample adds at most one period. A window with fewer valid samples than the bound allows cannot reach
  the minimum, even after rounding (1e-6 margin). The search jumps to the first window with enough valid
  samples and then evaluates every window as before. The skip is off when the period does not cap intervals
  (rate 0, ∞ or NaN).
- **Support read from intervals prepared once per run** (`_RunSupport`). Windows read contiguous slices of those
  intervals, so `sum` sees the same values in the same order and rounds as before. numpy sums pairwise; a
  running Python total differs from 8 terms on. The median is the middle of the sorted values, or
  `(lower + upper) / 2` for an even count, which is what `np.median` computes.
- **Not changed:** `_valid_support_seconds`, which still gives each event its stored `duration_ms`; the
  dispersion test and event growth; `FIXATION_DETECTOR_VERSION` (`fixation-v2`); no golden was touched. The
  incremental support update was not needed and was not attempted.
- **Checked (SAIO, serial, Ryzen 7 9700X):** original code 41.2–41.8 s for the CSV, of which 30.4–30.5 s
  was the detector. New code 16.5 s, of which 5.3 s is the detector (two alternating runs each). All 60
  Parquets were byte-identical to a baseline taken before the edit, and the `ProcessingResult` was equal, in all
  three runs. The file's 1,700 real `_idt_run` calls were replayed against a copy of the original code. Events
  were identical, time fell from 26.3 s to 0.97 s, and support evaluations from 1.8 M to 135 k.
- **Checked (tests):** `test_fixation_idt_equivalence.py` has 20 tests (~11 s) and keeps the original search
  verbatim as its reference. It uses random series at 60, 120 and 300 Hz with jitter, gaps, repeated, backward
  and NaN stamps, invalid samples and estimated rates. It covers all five durations and degenerate rates. It
  checks that `_RunSupport` is bit-identical to `_valid_support_seconds` on 36,000 random windows and that the
  skip bound holds. Each of five deliberate bugs failed it: upper middle as even median, running sum, one
  window skipped too many, bound without margin, dropped intervals read as kept. A wider scratch soak (1,200
  cases, 6,553 events) found no mismatch.
- **Checked (repo):** `verify.ps1` passed the backend suite (989 tests, 25 snapshots), Ruff, Vulture, deptry,
  app boot, import contracts, tsc, 88 unit tests and the 44 Chromium hook tests. ESLint failed on the same single
  error in the untracked `frontend/tests/hooks/participant-comparison-entry.test.mjs` from another work stream.
- **Next:** the remaining detector time is outside the window search. It goes to `_write_event_to_samples` (one
  pandas `.loc` write per event and duration), `_build_analysis_block` and `_placements_for_scenarios`. Not
  rebuilt: the student package.

### 2026-09-29 — Ingestion uses half the CPU cores in the student edition
- **Why:** on weaker laptops a project took minutes to ingest while Task Manager showed one busy core. The CSV
  step was the whole cost and ran in one thread: 51 s for the SAIO export on a Ryzen 7 9700X. Fixation
  detection took 33 s, cell parsing 9.5 s and the header scan 6.4 s.
- **Participant blocks run in worker processes:** `CsvProcessingService.process(max_workers=N)` sends each block
  to a `spawn` process pool once a CSV reaches 10,000 lines. It merges results in file order, so the Parquets,
  metadata and first error match a serial run. New setting `INGESTION_BLOCK_WORKERS`: the default 0 means half
  the logical CPUs in local mode and 1 on the server, where uploads and memory limits stay as before. If the
  pool cannot start or loses a worker (antivirus, memory), the blocks run in-process. The frozen entry point
  already calls `multiprocessing.freeze_support()` first, so a worker never starts a second app.
- **Header and marker scan shortcut:** an ASCII line holding none of the Time words (`time`, `timestamp`,
  `tiempo`), or not holding `grabacion`, is not canonicalized cell by cell. This is exact because
  canonicalizing an ASCII line never splits or joins those words. The block scan dropped from 6.4 s to 0.17 s.
- **Not changed:** the fixation detector. Its I-DT window recomputes support from scratch on every step, which
  is slow, but it is pinned by protected goldens. Rewriting it for speed is a separate job.
- **Checked (dev, idle machine):** the SAIO CSV (6 blocks, 232,759 lines) took 51.4 s before. It now takes
  41.4 s serial, 23.0 s with 2 workers, 15.6 s with 4 and 9.7 s with 8. At every worker count all 60 Parquets
  were byte-identical and the `ProcessingResult` equal; each worker peaked at about 240 MiB.
  `test_csv_block_workers.py` (26) covers byte-identical real pools, the error block, both fallbacks, the
  small-CSV path, the shortcuts against full canonicalization, and the worker count.
- **Checked (frozen):** rebuilt in `output/student-m1` (the `delivery/` package was not repackaged). `selftest`
  passed; it calls the service serially. The `serve` gate uploads the SAIO ZIP through the real route in local
  mode, so it uses the pool: upload 60.5 s (2026-09-28 build) became 17.0 s. All HTTP stages passed, the
  browser spec passed 3/3 and no non-loopback connections appeared. Stray profile files stayed at 2, and the
  app process's private-memory peak fell from 762–803 MB to 640 MB.
- **Checked (repo):** `verify.ps1` passed the backend suite (959 tests, 25 snapshots), Ruff, Vulture, deptry,
  import contracts, tsc and the 44 Chromium hook tests. ESLint failed on one error in
  `frontend/tests/hooks/participant-comparison-entry.test.mjs`, an untracked file from another work stream.
- **Sized to the machine (same day, second pass):** `INGESTION_BLOCK_WORKERS=0` no longer means "1 on the
  server". Both editions use `shared/machine_resources.py`: half the usable CPUs, capped so that each ingestion
  that may run at once gets 1 GiB plus 256 MiB per worker from its share of the memory. Usable CPUs honour the
  cgroup quota, and usable memory is the container limit, or half the RAM without one. The server's defaults
  (2 GiB, 4 concurrent uploads) still give 1 worker. With `UPLOAD_MAX_CONCURRENT_GLOBAL=1`, 2 GiB gives 4
  workers; so does 4 GiB with 2 concurrent uploads. `docker-compose.yml` now forwards `INGESTION_BLOCK_WORKERS`.
  On a first install, the Windows installer (`deployment/scripts/comun.ps1`) sets `BACKEND_MEM_LIMIT` to a
  quarter of the RAM, between 2 and 8 GB. An existing or supplied `.env` keeps its value. Checked:
  `test_csv_block_workers.py` (8 sizing cases, simulated cgroup v2, probes on this machine), backend 969 passed
  with 25 snapshots, Ruff, Vulture, import contracts and deptry. `instalador.Tests.ps1` passed 58 checks,
  3 of them new. Not rebuilt: the student package (this machine still resolves to 8 workers) and the Docker image.
- **Trap:** `%TEMP%\ndtest\pg-template` had been emptied to bare folders at 00:10, probably by Windows temp
  cleanup, so a fresh `serve` could not create its cluster. A good copy is now in `output/student-m1/pg-template`;
  pass that as `-TemplateSource`.

### 2026-09-28 — "Comparar participantes": the pinned line appears on every card
- **Pin shared on the recording axis too:** a click on a card's time chart now draws the dashed line on every
  card, as in *Comparativas*. Before, only an axis aligned on the stimulus onset shared it; with «Todos los
  escenarios» (axis «Tiempo de la grabación») the line stayed on the clicked card. Cards whose recording does
  not contain that second draw no line. The side panel says which second the line marks.
- **Header close is the X alone:** the «Cerrar» label next to the X was dropped; `aria-label` and a
  `title` tooltip keep the name.
- **Checked:** `tsc`, ESLint, `participant-comparison.spec.ts` 8/8 (new case: unaligned pin reaches another
  card). Student package rebuilt: zip SHA-256 `C8FE25EA…F4BED4EB`; selftest, serve (browser 3/3), race and
  package smoke green. The first `pg` run failed once (crash recovery took over the 30 s start timeout);
  a re-run of `pg` + `pg-adopt` passed with nothing changed.

### 2026-09-28 — Student package rebuilt from today's tree and trimmed
- **Rebuilt** `delivery/NeuroDatics-Estudiantes` (it was the 2026-09-21 build, missing every analytics, report
  and dashboard change since). New zip `NeuroDatics-Estudiantes-0.1-win64.zip`, SHA-256 `ACF5AC18…AAC7`;
  the superseded `0.1-prueba` zip was deleted.
- **Trimmed, 700 → 631 MiB (zip 270 → 251 MiB, 5155 → 4078 files):** `run-frozen.ps1 -Assemble` now drops
  pyarrow's tests, C headers, Cython sources and `.lib` files, matplotlib's sample data, and from PostgreSQL
  the StackBuilder GUI (wx*, libcurl), regression-test and ecpg programs, link libraries and every message
  catalog but `es` (pgsql 124 → 65 MiB). A PE import scan confirmed no removed DLL is loaded by postgres,
  pg_ctl, pg_isready, pg_controldata, psql or any `lib\` extension. `build.ps1` excludes `alembic.testing`
  and `sqlalchemy.testing` (pulled in by `--collect-submodules alembic`, never imported at run time).
- **Offline spec follows the new sidebar order:** the dashboard opens on Eye Tracker (the first sensor in
  `projectSensors.ts`), so `student-offline.spec.ts` now expects that and then visits EEG and GSR.
- **Checked:** selftest, pg, pg-adopt, serve (HTTP + browser 3/3, 0 non-loopback connections) and race gates
  on the trimmed folder; `package.ps1` smoke from the extracted zip on an accented path. Note: the serve gate
  reports `browser exit=1` but still exits 0, so read its log rather than the exit code. The three
  release blockers (ffmpeg licence, laptop run, data governance) are unchanged.

### 2026-09-28 — Spectrogram of a short scenario no longer drawn as ~10 blocks
- **Why:** a ~5 s scenario gave 10 windows (1.5 s, hop 0.375 s), so each panel showed ten wide columns of
  noisy stripes ("38 x 10") while longer scenarios looked continuous.
- `compute_spectrogram(min_time_bins=None)` and the matching optional query parameter (1–600, in the cache
  key): when fewer windows exist, the hop shrinks until about that many fit. The window, frequency bins,
  resolution and each window's values are unchanged; `metadata.hop_s`/`noverlap` report the hop used. The
  frontend always sends `min(120, max_time_bins)`. Default `None`, so reports, snapshots and other callers keep
  75 % overlap. `METHODS.md` updated.
- Validation: new `test_short_spectrogram_denser_hop_keeps_the_window`; backend 933 passed, 25 snapshots
  unchanged; Ruff and `tsc` clean. `./verify.ps1` stopped at ESLint on another agent's untracked
  `tests/hooks/participant-comparison-entry.test.mjs`. Not yet checked in the browser against a real recording.

### 2026-09-28 — AOI comparison: findings, attention sequence and one metrics table
- **Why:** after *Distribución temporal por áreas de interés* the tab was hard to draw conclusions from. Eight
  signal extremes sat in three unbalanced columns under counters that mixed event types ("3/8", "Precio (2)").
  The 7-column table printed TTFF on the recording clock (128311 ms for a first fixation 2.9 s into the
  scenario). The transition matrix ranked nothing. The per-AOI pupil and distance means the API already returns
  were never shown.
- **New order after the distribution chart** (`AoiComparisonTab.tsx`, cards in `components/aoi/`):
  *Hallazgos clave* (first AOI to catch the gaze, longest fixations, most revisited, largest pupil response,
  busiest connection, AOIs without fixations; each only when the data supports the comparison) →
  *Secuencia de atención* (discovery order; one lane per AOI plus "Fuera de AOIs", one block per fixation;
  pupil and distance extremes as marks with tooltips; hover readout) → *Métricas por AOI* (Atención /
  Descubrimiento / Respuesta: time in AOI, fixations and hit rate, mean duration, TTFF and fixation number,
  visits, pupil Δ% and distance vs. baseline, plus a "Fuera de AOIs" row) → *Transiciones entre AOIs* (top 3
  connections with both directions, then the matrix without never-fixated AOIs, with Entradas/Salidas) beside
  *Picos de señal* (one min/max table with the AOI at each extreme). KPIs, stimulus and chart are unchanged
  apart from accents.
- **Time basis:** the tab measures from the scenario onset, taken as the first sample of the pupil, gaze and
  distance series, as the PDF report does. A chip gives that onset on the recording clock the other tabs use.
  `docs/REPORTS.md` updated.
- **Frontend only**, no API or snapshot change. One more request (`/analytics/fixations`, same threshold as
  `/aois`) builds the sequence; fixations get the backend's first-match AOI, so the lanes agree with the matrix.
  Visits end at a fixation outside the AOI or at a segment break. Derivations are in
  `features/analytics/aoiInsights.ts` (JSX-free, type-only imports). The key-event fallback for older APIs moved
  there and now skips the gaze series' (0, 0) lost samples and zero pupil values.
- **Removed:** the three event counters, per-event gaze positions, the "Max N" chip, "Hit rate" and "Hasta
  objetivo" (now "% del total" and "fijación nº N").
- **Found on the way:** Chromium tinted the anti-aliased corners of translucent oklch borders yellow on the violet
  marker chips; they use solid border colours.
- **Validation:** `tsc` clean for these files (two errors remain in `features/analytics/participantComparison/`,
  another agent's work in progress); ESLint 0 errors / 6 warnings; 86 unit tests and 42 hook/component tests
  pass. A temporary mocked-API Playwright harness (deleted) rendered the tab at 1366×768, 1536×730 and
  1920×950, light and dark: no horizontal overflow, no new console errors. It also covered a failed
  `/fixations`, an API without `events`, no time series and a single AOI. Not checked against real recordings.
- **Follow-up:** the uncommitted `GET /analytics/scenario-timing` (another agent) returns `onset_s`; once it lands,
  `scenarioOnsetS` can use it instead of the series' first sample.

### 2026-09-28 — EEG opens smoothed; quality warnings only at the end
- **Smoothed is the default again** on *EEG por canal* (`EegTab.tsx`, `useState<SignalMode>("smooth")`), at the
  owner's request. This reverses the audit's raw default (`eeg-audit/FINDINGS.md` §3, `METHODS.md`): the 0.2 s
  mean has zeros at multiples of 5 Hz, including 10 Hz. The "Suavizado 0.2 s" chip, shown whenever smoothing is
  on, still says so. Cruda and Ambas are one click away.
- **No "N avisos de calidad" chip on any chart** (time series, PSD, spectrogram, topography). Warnings and unit
  caveats appear only in the "Calidad y alcance de EEG" card that closes the tab. `eegQualityLines` was removed.
  Chips about the chart itself remain: clipped axis, marked events, envelope, lane scale, PSD flagged windows,
  "Sin PSD", black bands, per-panel limits, schematic montage.
- Validation: `npm run typecheck`, eslint on the changed files, 74 feature unit tests, 42 hook/component tests,
  `eeg-dashboard.spec.ts` (now expects Suavizada pressed and no quality chip; its mock gained smooth statistics).

### 2026-09-27 — Scanpath tab drawn like the Python plot, scaled to the image
- **Why:** the owner found the web scanpath harder to follow than the Python plot of the same recording.
  Translucent nodes showed the lines and circles underneath. Thick white rings stacked up in clusters. The
  12 px minimum radius made short fixations nearly as large as long ones.
- **New `frontend/features/analytics/scanpathStyle.ts`** with two presets for the main *Mapa de recorridos*
  tab. `python` (active) uses nodes at 0.9 opacity, a 1 px outline and a 1.5 px line. Its white digits get a
  solid black outline (3 px stroke under the fill, round joins), as in the Colab plot. `legacy` keeps the
  previous values exactly.
- **Node sizes unchanged:** both presets use the original fixed 12→40 px radii and 9–16 px labels. A first
  version used 6→28 px radii scaled with the displayed stimulus (×max(w/1024, h/576), clamped to 0.6–2). The
  owner found the nodes too small, so `python` now has `scaleWithImage: false`. The scaling code remains
  available per preset and keeps the absolute area encoding (`absolute-area-v1`, 2 s cap).
- **Rollback:** set `ACTIVE_SCANPATH_STYLE = "legacy"` in `scanpathStyle.ts`.
- **Not changed:** comparison panel (`SpatialPanels.tsx`), PDF renderer, backend fixation data. The 16-vs-15
  fixation difference against the Python plot is still unexplained.
- Validation: `npm run typecheck`, eslint on both files (one existing `<img>` warning), 74 feature unit tests.
  A Chromium preview drew both presets using the real modules. The legacy preset reproduced the old radii,
  strokes and font sizes. Not checked in the running dashboard with real data.

### 2026-09-27 — Document EEG scales per recording and verify mixed-unit ingestion

- Added `docs/eeg-audit/ESCALAS-POR-GRABACION.md`: SAIO F3 declares `kilo` only in block 5; other blocks retain blank-unit assumptions. Describes channel-local conversion, persisted provenance, precision limits and re-ingestion of old processed files. Linked from audit findings and methods.
- Added a full-ingestion regression with four recordings alternating `kilo`, missing unit, `uV`, and `kilo`, while F4 remains in `uV`. Covers an empty or absent unit line, participant/scenario storage, source metadata, warning isolation, expected spectral power, repeated analytics without double scaling, and untouched source bytes.
- Validation: six focused EEG scale tests passed; Ruff passed for the modified test. No production conversion changes, data migration, or project re-ingestion. Existing frontend work preserved.

### 2026-09-24 — EEG caveats become chips; quality notes close the tab
- **Why:** the owner found the EEG tab congested after the audit fixes: two notice boxes above the first
  chart, two sentences under it, and an 18-button list of artifact spans. They asked for the notices at the end,
  for the chart messages as tooltips, and for a compact span list. General pieces are shared; EEG pieces stay in
  EEG files.
- **General — `InfoChip`** (`features/analytics/components/InfoChip.tsx`): a `Button` outline `xs` with a
  `Tooltip`. With `onClick` it acts; without one, a click or tap opens the explanation, since Radix tooltips
  never open on touch. **`AnalyticsChartShell` `notes`** puts chips on the legend row, so a caveat costs no
  extra line. Also used outside EEG: the correlation matrix's "which signals take part" paragraph and the
  fixation-duration notice, whose reason lived in a `title` no keyboard could open.
- **Quality notes close the tab** (reverses `PLAN.md` T0, at the owner's request). Warnings and unit caveats are
  one neutral card, "Calidad y alcance de EEG", last on every view, with "Volver a ingerir". Each view's chart
  carries an "N avisos de calidad" chip that previews the first three lines and jumps there, moving focus. Backend
  warnings that repeat a structured element are not listed twice: unit caveats, the PSD "Sin PSD" chip and the
  envelope chip (`qualityCardWarnings`, matched by prefix, so drift only lets a duplicate back in).
- **Chart messages are chips:** clipped axis, detector events, smoothing (only when shown), min/max envelope,
  montage scale; PSD flagged windows per channel ("C4 2/63 · F3 12/63") and channels without a PSD (one reason
  per channel); spectrogram per-panel limits; topography's schematic-montage caveat. Header checkboxes are one
  line again (the spectrogram's had wrapped into a 7-line column at 1536 px; it now sits by its colour bar). The
  legend lists each channel once; "Ambas" adds two line-style keys instead of 14 entries.
- **General chart fixes found on the way:** the six line charts kept 28 px under their tick labels for an axis
  title that is HTML below the SVG; one `LINE_CHART_MARGIN` (bottom 6) now serves them all, and the EEG chart
  height drops by the same 22 px so its plot keeps its size. In dark mode the selected-time marker and the grid
  were fixed light greys; CSS overrides fix every chart.
- **The clipped-axis note no longer fires on every recording.** Percentiles 0.5–99.5 always left ~1 % of samples
  outside, so a clean record said "Eje recortado". `robustDomain` now draws every sample within 25 % of the band's
  height beyond either edge and clips only what lies further out: 5,000 noisy samples plus one 9,640 uV spike
  report exactly 1 clipped. `eegPresentation.test.mjs` changes on purpose: the ramp's low tail is drawn
  (`clippedLow` 1 → 0), and ordinary noise now asserts nothing clipped.
- **Artifact spans are events:** `clusterArtifactSpans` joins a channel's runs that overlap or sit within 0.5 s.
  SAIO b5 F3 goes from 17 rows to 2 chips. The card is one line of channel groups; each chip jumps to the chart
  and focuses it; the per-run table is one click away. The chart shades one band per event, at least a few
  pixels wide (a one-sample run drew nothing), only in its own lane in the montage, and more strongly in dark mode.
- **Tests:** `eeg-dashboard.spec.ts` no longer fails on the strict `F3` locator of 2026-09-22 (now scoped to the
  channel selector) and checks the quality chip's jump. New unit tests for clustering, the axis reach and the
  warning filter; the Chromium quality-surface test covers chip names, the detail table and click-to-open.
- **Measured** with a mocked SAIO-like API in Chromium: at 1536×730 the chip row ends at 725 px (was 747, below
  the fold), at 1920×950 at 934; legend and chips take one line in Cruda and Suavizada (Ambas: 2 at 1536, 1 at
  1920); no horizontal overflow; a clean participant shows no chip, band or quality card. `./verify.ps1` ALL GREEN;
  full Playwright suite 30/30.
- **Not changed, seen on the way:** montage lanes still take their pitch from the widest channel, so one large
  excursion flattens every lane; overlay y ticks land on raw data bounds (e.g. 1501, 846). Both predate this.
### 2026-09-22 — Dashboard fits laptop screens
- **Why:** a 1920×1080 laptop at 125% scaling is 1536×~730 CSS px. Width-only `2xl:` (≥1536 px) gave it the
  largest stat cards, and on *EEG por canal* only 32% of the chart was above the fold (0% at 1366×640).
- **`roomy:` variant** (`globals.css`): ≥1536 px wide **and** ≥900 px tall. Stat cards (`KpiCard`), the gaze
  position tiles, GSR "Punto seleccionado", card spacing and titles, the filters bar and tab strip are compact by
  default and take their old size only under `roomy:`. Screens ≥900 px tall and ≥1536 px wide look as before.
- **EEG por canal:** Muestras / Frecuencia / Canales moved from a second row of cards to one line beside
  "Estadísticas de:" ("puntos renderizados" kept, the student offline spec waits for it). Overlay y-axis ticks
  are rounded (they printed raw percentile bounds such as `2585.779241455`, clipped by the 80 px axis).
- **Heights:** ≤800 px tall screens get tighter stack spacing and a taller main chart (`44vh`, was `37vh`);
  the EEG topography panel follows the viewport (`100svh - 12rem`, same 560/600/620 px caps).
- **Measured** with a mocked API in Chromium at 1366×640, 1536×730, 1440×790 and 1920×950: EEG chart visible
  above the fold 0→65%, 32→100%, 48→100%, 79→100%; pupil/GSR charts 246→283 px at 1536×730; topography fits the
  scroll area once scrolled to; no horizontal overflow. `tsc`, unit and hook tests, ESLint 0/6: green.
  e2e: 12 of 13 pass; `eeg-dashboard.spec.ts` fails on a strict `F3` locator that also matches the
  "Estadísticas de:" focus chips, which predate this change. *(Fixed 2026-09-24.)*
- **Safepoint:** tag `safepoint/laptop-ux-before` snapshots the whole working tree before this change.
  The student package (`127.0.0.1:8765`) shows it only after `student/build.ps1` rebuilds it.

### 2026-09-21 — EEG audit plan: artifacts described, not hidden

Implements `docs/eeg-audit/PLAN.md` T0–T3 and T5–T14 (T4 with the owner's "mark them as
incomplete"). Every figure below is measured against `docs/RefererenceExperiments/`, not
estimated. No recording was uploaded, rewritten or committed.

- **The quality panel is at the top of the EEG tab, not under four views** (T0). For SAIO
  block 5 the kilo-rescale warning is now visible without scrolling. *(Reversed 2026-09-24.)*
- **Two more artifact detectors, and a ceiling on the old one** (T1,
  `eeg_signal.py`). `20 * 1.4826 * MAD(diff)` had no upper bound and reached 6,825 uV on
  block 4 P4, which let that block's documented 556.9 uV transient pass unmarked; it is now
  capped at **500 uV** (~150 mV/s at 300 Hz, an order of magnitude past any scalp gradient).
  Added a robust amplitude test at **k = 10** — measured, not chosen: the largest z among the
  42 clean SAIO channel/block pairs is 7.8, so the k = 8 originally proposed had no margin.
  Added a sliding 1 s peak-to-peak test at 1,000 uV for excursions that are gradual at every
  sample. Over the 42 pairs the amplitude test marks **exactly two** (block 5 F3 z=94.9,
  block 3 F4 z=12.2) and nothing else; the step test keeps block 3 C3 and now also catches
  block 4 P4. The three are complementary, and two regression tests pin that neither covers
  the other's case. New per-channel fields, all additive; `transient_candidates` is unchanged.
- **`metadata.artifact_spans` says where, not just how many** (T2): channel, start, end, peak
  and which detector found it, built from the existing `runs()` helper, capped at 200 spans
  with the total reported. The chart shades them and a list jumps to each one. Block 5 F3
  gives a span from 120.38 s peaking at 9,640.0 uV.
- **Contaminated Welch windows are counted** (T3). The criterion is written into the
  docstring and into `metadata`: a window is flagged when it **overlaps** an artifact span,
  because with 50 % Welch overlap one bad sample lands in two windows. Block 5 F3: 55 windows,
  4 flagged. Excluding them is opt-in and off by default — the default number stays the
  contaminated one (207,384.4 uV², 63x inflated) and the excluded one is 3,252.2 uV².
  *The plan predicted 3 flagged and 3,264.4 uV²; those reproduce exactly against the amplitude
  detector alone, and the fourth window comes from the peak-to-peak test T1 adds. The
  conclusion is unchanged.*
- **A short channel no longer shortens everyone's analysis window** (T4). The longest valid
  run sets `nperseg`; a channel that cannot fill it is reported **incomplete** with its reason
  instead of degrading the other six, which was measured at −9.6 % to −47.4 % of their total
  power with their own data untouched. One shared frequency grid, so `EegPsdResponse` and its
  protected HTTP snapshots are unchanged. `test_short_runs_do_not_become_a_long_recording`
  still holds. Per-channel `nperseg` and `frequency_resolution_hz` are reported either way.
- **A robust y axis and a clipping note** (T5): percentiles 0.5–99.5, how many points fall
  outside, and the recorded value still in the tooltip. Clipping the view never clips the data.
  *(2026-09-24: ordinary tails are drawn; the note is a chip.)*
- **Min/max envelope decimation** (T6, opt-in, requested by the EEG tab). Evenly spaced
  selection showed 806.3 uV for block 3 C3's real 916.5 uV and 966.0 for C4's 1,010.7; the
  envelope shows both exactly, within the same 5,000-point budget. Its two x positions are the
  bucket's own first and last sample times, so a value can sit up to one bucket from the
  instant it was recorded — recorded in `metadata.display_reduction`. `_decimation_indices`
  is untouched, so PSD, spectrogram and the archived `num_regression` golden are unaffected.
- **The three headline numbers name a channel** (T7). They averaged channels whose block 5
  medians run from −1,256.2 uV to +988.4 uV and moved whenever a chip was toggled.
- **Per-channel quality is finally rendered** (T8): quantization step, repeated-sample share,
  missing samples, offset, robust z and the detector counts. `quantization_step_uV` had to be
  added — the plan assumed it already existed. Block 5 F3 is 10.00 uV with 12.41 % repeated
  samples against 0.01 uV for its six neighbours; block 4 P4 is 0.04 uV.
- **Uncorrected units are flagged in the UI with a re-ingestion link** (T9), from the
  `source_units` / `assumed_uV_channels` the backend already reported.
- **The montage view** (T11): one lane per channel at one shared uV-per-lane scale, with the
  recorded value kept in the row so the tooltip and every statistic still read microvolts.
- **Spectrogram and topography accept the time window their plumbing already supported** (T12),
  so the colour scale follows what is visible; a client-side zoom rescales it too, with the
  same percentiles the backend clips at. Per-channel colour limits are opt-in, for the block 5
  case where F3 sits ~25 dB above its neighbours and flattens them.
- **An optional 1–45 Hz band-pass plus mains notch** (T13) and **an optional common average
  reference** (T14), both off by default, both recorded in `metadata`, both applied *after*
  detection so `metadata.channels` keeps describing the export. The filter is zero-phase and
  runs inside each contiguous valid run, never across a gap; a request that will not fit under
  Nyquist is refused with its reason rather than approximated. The average reference excludes
  channels that are excluded, constant or marked by any detector, and declines outright when
  fewer than two clean channels remain. `test_comparison_chart_preserves_a_ten_hz_raw_signal`
  still holds.
- **T10 was measured, and it argues for a change that is not in this batch.** SAIO block 5,
  scenario "Video instagram", 341 bins of 250 ms: the single 4.87 s artifact fills 21 bins
  (5.7 %), which reach **+37.3 dB** over the median bin, and it moves the Pearson coefficients
  by up to **0.19** — enough to turn `distance_cm` from −0.164 to +0.028 (a sign reversal) and
  to mask `gsr_smoothed_us` going from +0.043 to +0.220. The dB scale does not absorb it: a
  0.25 s bin is either contaminated or it is not. Reporting or excluding those bins changes the
  `/correlations` response, which is a **protected snapshot**, so it waits for the owner exactly
  as T4 did. The measurement is recorded in `correlation_service._eeg_signal`.
- **Verified:** `./verify.ps1` ALL GREEN. 919 backend tests (902 before), 24 protected snapshots
  unchanged, no golden regenerated and no update flag used. 71 frontend unit tests (62 before)
  and 40 real-browser regressions (36 before). One hand-written assertion in
  `chartZoom.test.mjs` was updated on purpose: it pinned the whole-block colour domain that
  T12 exists to replace.
- **Not done:** T4's information-only variant was not chosen (the owner asked for incomplete
  channels), the `/correlations` change T10 justifies, and the T0/T5/T11 acceptance was checked
  by test rather than by driving the app against ingested SAIO data. The chart component itself
  is not covered in Chromium: recharts ships ES modules and the bundling harness is CommonJS.

### 2026-09-21 — Device reports carry the NeuroDatics logo
- **The logo is now part of the brand lockup** on the report cover (top left) and in the running
  header of every page, beside the `NeuroDatics` wordmark. One `wordmark(size)` helper in
  `sensor_report.typ` draws both, so the mark and the word always scale together.
- **The asset ships with the backend package:** `reports/application/assets/brand/neurodatics-logo.svg`
  (the frontend's `NeuroDatics-logo.svg`, 4 KiB of paths, no text). It sits next to the report fonts,
  which the student build already copies wholesale (`docs/student/m1-spike/build.ps1`). `common.new_document`
  registers it for every report, with or without a cover, so `meta.logo` is never empty.
- **Header alignment changed from bottom to centred.** The mark hangs below the text baseline; bottom
  alignment gave the left cell extra depth and lifted the wordmark above the section name on the right.
- **Verified:** `./verify.ps1` ALL GREEN, 902 backend tests (901 before), 24 protected snapshots unchanged,
  no golden regenerated. The one new test asserts the logo ships with the package and reaches every
  document, cover or not — a packaged build that drops the asset fails there, not at render time.
  Cover and header inspected on a rendered GSR report.

### 2026-09-21 — Student edition M4: package and laptop kit (laptop run still open)
- **`student/package.ps1`** turns the assembled folder into `NeuroDatics-Estudiantes-<version>-win64.zip`
  (270 MiB; 5,155 files, 700 MiB extracted) with `SHA256.txt` and `package-report.json`, then extracts the zip to
  an accented path and starts the app from it in an empty profile under the offline guard.
- **Student guide and notices:** `student/LEEME.txt` (Spanish; SmartScreen path, console window, data location,
  what to send when it fails) and `student/make-notices.py` (`THIRD-PARTY-NOTICES.txt` from the real environment,
  ffmpeg GPL/LGPL text derived from the binary). SmartScreen wording and RAM/disk figures are provisional.
- **Launcher:** a launch with no arguments (a double-click) that fails prints the error, writes
  `logs/launcher-errors.log` in the data directory and waits for Enter; any argument never waits. Any unexpected
  exception is logged the same way (`launcher.report_failure`).
- **Laptop kit:** `student/laptop-test.ps1` (Windows PowerShell 5.1) plus `docs/student/LAPTOP-TEST.md`. Tested
  here, including a negative control; 5.1's missing exit code without a held process handle had made it report a
  passing run as failed.
- **Verified:** every frozen gate on the rebuilt package (selftest, PostgreSQL lifecycle and adoption, HTTP flow,
  3 of 3 offline Chromium specs, double launch); `./verify.ps1` ALL GREEN, 901 backend tests (898 before), 24 protected
  snapshots unchanged, no golden regenerated.
- **Not done:** the laptop run (also the M1 proof gate), the ffmpeg licence decision (bundled build is GPLv3 with no
  licence text beside it), governance of raw participant data.

### 2026-09-21 — Student edition M3: local frontend
- **Static export in local mode.** `NEXT_PUBLIC_APP_MODE=local` makes `frontend/next.config.mjs` emit a
  static site (`.next-local`, git-ignored); every other build gets the config it always had. The
  backend serves it from its own origin in local mode only (`local/static_frontend.py`, mounted
  last in `main.py`); the launcher passes `LOCAL_FRONTEND_DIR` when `frontend/index.html` exists.
  Two things the site in front of the router broke, both mapped and tested: `GET /api/projects`
  without its slash (Next's rewrite covers it in the server edition) and Next's page-data prefetch,
  which a Windows export writes to a nested folder.
- **No account in the browser.** `lib/appMode.ts`, `lib/auth/localAuth.ts`: the provider fetches the
  fixed session at load and `apiFetch` mints it again when the token ran out. The navigation drops
  Configuración and Salir; `/login` and `/configuracion` redirect; an unreachable backend shows a
  retry screen instead of the Google button. Server mode is byte-for-byte the old behaviour.
- **Fonts self-hosted in both editions** (`frontend/public/fonts`, Poppins 400-700 Latin, OFL); the
  Google Fonts import is gone. **Drive thumbnails:** the three copies of the fallback are one function
  that returns nothing in local mode; save/delete/progress messages that named Google Drive say
  "en este equipo" locally (`features/projects/storageCopy.ts`).
- **Build and proof.** `student/build.ps1` builds the export and fails on any `frontend/.env*` value or
  remote font/script reference in it. The `serve` gate also runs `frontend/tests/local/student-offline.spec.ts`
  (config `playwright.local.config.ts`) against the frozen package in Chromium with name resolution
  off for everything but loopback: 3 of 3 pass: no account, Drive or Google anywhere; the session is minted again when it ran out; and the whole flow (wizard upload of the extracted experiment folder, demographics, stimulus images, EEG, GSR and eye-tracker analytics, delete) with 0 requests leaving the machine.
- **Launcher hardening:** the first-launch rename of the copied database folder retries for up to 20 s when
  a scanner or indexer holds a file (`Access is denied`); it had failed the double-launch gate once.
- **Verified:** `./verify.ps1` ALL GREEN, 898 backend tests (884 before), 24 protected
  snapshots unchanged, no golden regenerated. All frozen gates pass on the 700 MiB package.
- **Not done:** packaging and the clean-laptop run (M4) and the M1 proof gate (clean machine, network
  off) are still open; the browser check ran on this machine, which has a network and the VC++ runtime.

### 2026-09-21 — Student edition M2: local mode
- **New: `APP_MODE=local`.** The same backend runs as the offline student edition; the default
  (`server`) is untouched: `./verify.ps1` ALL GREEN, 884 backend tests (812 before, +72 new), the 24
  protected snapshots unchanged, no golden regenerated, `backend/tests/fixtures/` not touched.
- **Identity.** `get_current_user_id` returns one fixed user in local mode, so no route needs a
  token; `POST /api/auth/local-session` hands the browser the same session shape Google sign-in
  returns. Google sign-in and the Drive integration routes are not mounted in local mode. Because
  nothing checks a login there, a Host/Origin guard refuses requests that are not same-origin
  loopback (blocks other web pages driving the app through DNS rebinding or cross-site requests).
- **Storage.** `modules/integrations/storage_provider.py` is the one place that picks the object
  store. Server mode is the Drive client exactly as before; local mode is `LocalStorageClient`
  (`infra/storage/local_client.py`), same methods and return shapes, files on disk under the data
  directory. Call sites only had their imports changed (`gdrive_client` keeps its name because
  tests patch it). A test compares the two classes' signatures so they cannot drift apart.
  `projects.storage_provider` records `local` there.
- **Cache and readiness.** `get_redis_client()` returns an in-process, bounded, expiring cache in
  local mode (`infra/cache/memory_cache.py`); `/health/ready` no longer waits for Redis there.
  Cache directories default under the data directory. Logs go to `logs/app.log`, warnings to the
  console.
- **Launcher** (`backend/src/neurodatics/local/`), carrying every M1 trap: cluster template copied
  atomically (never `initdb`), loopback-only server with a generated scram password set in
  single-user mode before the first start, stale pid file, own-`bin` pid check, UTC, orphan
  adoption, port retry, no piped `pg_ctl`. New: a single-instance mutex (a second launch opens the
  running app), a stable preferred port with a pre-bound socket, clean shutdown when the console
  window closes, refusal to run elevated. Data lives in `%LOCALAPPDATA%/NeuroDatics Estudiantes`,
  not beside the program, because OneDrive syncs Downloads/Desktop and would corrupt a live database.
- **Google's libraries are out of the freeze:** a fresh process in local mode imports none of them
  (tested), and the package is 698 MiB extracted, 93 MiB smaller than the M1 spike.
- **Build gates** in `student/` (`build.ps1`, `run-frozen.ps1`, `check-pins.py`), all passing on the
  frozen package: selftest (now fails on null media dimensions, no video, or empty analytics; a
  broken ffprobe was shown to turn it red), PostgreSQL lifecycle, real HTTP flow (session, ZIP
  upload through the route into the local store, analytics, image, video frame, heatmap, PDF report,
  delete leaves no files), simultaneous double launch, and the served app under a connection
  sampler and an offline guard that now covers asyncio.
- **Decision on dependencies:** the student package ships the dev-venv resolution, which is what
  the tests run on, and `check-pins.py` fails the build if any pinned package drifts. Side finding,
  not fixed: `backend/poetry.lock` (the teacher Docker image) resolves older numeric packages
  (numpy 2.0.2, scipy 1.13.1, pyarrow 16.1.0) than the venv the goldens are checked against.
- **Not done:** the frontend (M3), packaging and the clean-laptop run (M4), and the M1 proof gate
  (clean machine, network off) are still open. Console-close shutdown and the elevated-launch
  refusal are implemented but were not exercised on a real console / elevated token.

### 2026-09-20 — Student edition: plan approved, M1 feasibility spike, and its review
- No application code changed. The work is planning and a throwaway packaging spike;
  `backend/` and `frontend/` were not touched, and the evidence lives in the git-ignored
  `output/student-m1/`.
- `docs/student/` now tracks the approved plan, the decision ledger and the M1 report. It had
  been sitting untracked on a shared checkout. Committed first exactly as it ran, so the scripts
  there match the recorded results, with the review fixes in the commit after it.
- **M1 result:** a frozen Windows x64 runtime ingests a real 278 MiB raw experiment ZIP, computes
  the analytics, renders the three Typst reports, runs ffmpeg/ffprobe and serves the real FastAPI
  app on an embedded PostgreSQL 16 — 791 MiB extracted, 284 MiB zipped, results identical to the
  unfrozen app (9 analytics digests, video probe, all three PDF lengths). Embedded PostgreSQL is
  confirmed: all 26 migrations, `pg_try_advisory_xact_lock` and the JSONB token merge run
  unchanged, with clean stop, crash recovery and orphan adoption tested.
- **Still open:** the plan's proof gate (clean Windows profile, networking off) needs a VM or a
  fresh laptop; SmartScreen and Smart App Control are untested; the bundled ffmpeg is GPLv3.
- **Review of the spike** (it had been run on a weaker model than the plan called for) checked
  every headline number against the saved JSON and every harness call against current app
  signatures; all matched. It found four gaps, now recorded in `docs/student/M1-SPIKE.md` and
  carried into the M2 entry conditions in `docs/student/PLAN.md`: the selftest can go green
  without doing the work, concurrent launch is untested, the offline tripwire is blind to asyncio
  on Windows, and the freeze inherited the dev venv rather than `backend/poetry.lock`.
- `run-frozen.ps1` no longer hardcodes this machine's paths, names any missing input, and writes
  `offline-evidence.json` so the clean-machine run has something to be compared against.

### 2026-09-19 — Database connection and PostgreSQL 18 bootstrap
- Synchronized the private `backend/.env` database URL with the working root
  configuration. The backend had a different password, transaction-pooler port,
  and no explicit TLS setting. No credentials are recorded here.
- Read-only checks of the configured Supabase database confirmed PostgreSQL 17.6,
  Alembic **025**, nullable JSON `analytics_transform_tokens`, `source_folder_name`,
  and all six migration 023 indexes, valid and ready. No live migrations were run.
- Fixed migration 004 to replace only real, single-column `sex` CHECK constraints
  using `pg_constraint`; primary-key NOT NULLs and unrelated checks are preserved.
- Replaced the performance smoke's stamped predecessor fixture with an actual
  fresh migration chain through 025. PostgreSQL 18 passed the constraint regression,
  token concurrency checks, downgrade to 022 and re-upgrade with data preserved.
  Evidence: `output/postgres-migration-fix.log`.
- Next deployment action: confirm that the configured Supabase project is the
  intended production target; update any separate deployment configuration if needed.
  Existing packaged images were not rebuilt. Connection instructions:
  [database-deployment.md](database-deployment.md).

### 2026-09-18 — Windows installer package in Spanish (`delivery/`)
Full evidence: [delivery-handoff.md](delivery-handoff.md), which the packaging script cites.
- `deployment/` holds the versioned sources. The generated private package is
  `delivery/NeuroDatics-App/`, started with `INSTALAR.bat` / `INICIAR.bat`.
- The installer checks PowerShell 5.1, SHA-256 of every file, Windows x64, RAM, disk,
  virtualization, WSL ≥ 2.1.5 and Docker Compose ≥ 2.20. It installs Docker Desktop for the
  signed-in user after checking the Authenticode signature. After a reboot it resumes through
  RunOnce without overwriting other startup entries.
- It generates random local credentials when there is no `.env` and keeps an existing one.
  It pins exact linux/amd64 image IDs and runs four services, without the retired worker.
- New `/configuracion` page shows the Google Drive connection state and asks for confirmation
  before reconnecting a shared account. The OAuth callback now shows a Spanish success page to
  browsers and still returns JSON to API clients.
- **Verified:** 55 installer checks; `verify.ps1` ALL GREEN (810 backend tests); 7 Chromium e2e;
  an end-to-end smoke install on an empty PostgreSQL database with migration 025, idempotent
  second run, stop and start with data preserved.
- **Release build:** manifest `2026-09-19T00:32:12Z`. Source fingerprint `cc867094…dfadee`.
  Backend image `sha256:10112ec5…277266`, frontend image `sha256:5d1c13f7…581f1d`.
  Four images, 25 checked files.
- **Not yet tested:** installing on a clean Windows VM, and the real Google consent screen.
  Do both before distributing widely.

### 2026-09-17 — One PDF report per device
- The single matplotlib "informe ejecutivo" was replaced by Typst reports, one per device,
  for one participant or for the group. Comparative mode returns one PDF per device in a ZIP.
  Details: [REPORTS.md](REPORTS.md).

### 2026-09-15/16 — EEG scientific audit and corrections
Full evidence: [eeg-audit/FINDINGS.md](eeg-audit/FINDINGS.md), [eeg-audit/METHODS.md](eeg-audit/METHODS.md).
- **Scale bug fixed:** SAIO exports mark F3 with a `kilo` multiplier. Ignoring it made amplitude
  1,000× too small and power 60 dB too low. Ingestion now applies the multiplier and records
  where it came from.
- **Missing samples are no longer faked:** PSD, spectrogram, topography and JSON
  serialization used to drop, interpolate or zero-fill gaps. They now keep missing values
  and compute only on contiguous valid windows.
- **Default display no longer hides EEG rhythms:** a 0.2 s boxcar filter cancelled 10 Hz, so the
  default and comparison charts now show raw values. Smoothing is optional and labelled.
- Import validates units and clocks. Correlation covers the whole montage. Report band metrics
  were revised. The UI shows data quality and removes the fake baseline metrics.
- **Verified:** 770 backend tests, all 8 reference CSVs (76 EEG block/scenario combinations),
  EEG browser e2e.
- **Operator action:** existing projects must be **re-ingested** to get corrected scaling.

### 2026-09-12 → 09-15 — Performance campaign
- Parquet reads run off the event loop. Project-scoping foreign keys are indexed (migrations
  023/024). An image `304 Not Modified` response is sent before the file is read from disk.
- Pupil, gaze, distance and GSR timeseries are capped. They used to return every sample:
  33.6 MB of JSON for a 300k-row session.
- Faster scenario filtering and nearest-gaze lookup: no frame copy, no sort.
- The transform cache token is stored so the cache can answer without loading the Parquet.
- 19 analytics JSON routes now share one cached-frame helper instead of copy-pasted bodies.
- Frontend: one factory builds the analytics hooks, with request cancellation. GSR and
  distance share a single `SingleSignalTab`. Sibling heatmap requests cancel independently.
- **Verified:** `verify.ps1` ALL GREEN, 750 backend tests, production build. PostgreSQL 18
  upgrade, downgrade and re-upgrade of 023/024 on a scratch cluster.
- **Open items:**
  - Migration 004 and the unknown live database revision were resolved on
    2026-09-19; see the database entry above.
  - Report loading, video seek and repository N+1s remain unoptimized.
  - To reproduce the PostgreSQL check:
    `.venv/Scripts/python.exe docs/perf/bench/check_postgres_migrations.py`.

### 2026-09-12 — Upload pipeline hardening
- Each upload builds a new generation in its own Drive root and becomes visible in one database
  transaction. A failure keeps the previous data. Admission and size limits run before the
  multipart body is parsed. A per-project lock and a cleanup journal cover partial failures.
  Details: [UPLOAD_HARDENING.md](UPLOAD_HARDENING.md), [UPLOAD_PIPELINE.md](UPLOAD_PIPELINE.md).

### 2026-09-13/14 — Frontend refactor
- UI primitives moved to a dedicated folder, and imports were updated to match (`9ddd2af`,
  `61a0bf0`, `e5634d5`).

### 2026-09-03 → 09-04 — Cleanup campaign (dead code, safety net, broken logic)
**Safety net first**
- `verify.ps1` is the single gate. It runs pytest, Ruff, Vulture, deptry, app boot, three
  import-linter contracts, TypeScript, frontend unit tests, Chromium hook/component tests and
  an ESLint ratchet.
- Line endings were normalized in `d35ca73`; tag `safety-net-baseline` points there. Read
  older diffs with `--ignore-cr-at-eol`.
- The route inventory, a synthetic multimodal golden corpus, 24 protected snapshots and
  tolerance-aware numeric goldens are pinned. A deliberately injected bug turned the suite red.
- Two real reference experiments were accepted: 14 participants, 16 scenarios, 261k sensor
  rows and 110 Parquets. The recordings were not committed.

**Removed (all revertible, commit in brackets)**
- 20 unmounted `processing`/`uploads` stubs (`14844e3`) and 7 worker stubs (`d319473`).
- 13 orphan frontend files (`aaf1b52`) and `input-group.tsx` (`92c9292`).
- The direct PyJWT declaration (`b5fae4d`), the unused `gdrive_refresh_token` setting and the
  retired RQ worker (`e89a975`, `5b9b450`).
- Seven unused Google Drive operations (`bd6b2cd`). OAuth authorize/callback stay.
- The Base UI dependency, after four selectors moved to Radix (`85cfb27`, `c71d926`).
- In total, over 40 files and about 1k lines of source.

**Fixed**
- Analytics hooks reset stale data, errors and loading state when the selection changes
  (`0d016b8`).
- The Edit Project dialog ignores stale loads (`c1a9f2d`).
- Imports now normalize declared units to seconds and millimetres before detection and
  persistence (`dd01a58`). Parquets written before this change are not rewritten; re-import
  any whose source used metres or centimetres.
- Silent fallbacks now log a warning (`c2f783b`). Seven `any` types were replaced with
  validated values (`a3d0280`). Settings are read directly instead of through `getattr`
  defaults (`882a99c`). `.env.example` matches Settings exactly (`31a6d5c`).

**Restructured**
- The processing↔analytics import cycle was broken, and three import contracts now enforce
  that (`1aa864c`, `48fb298`, `f292487`).
- The analytics service was split into ten modules behind a 74-line compatibility facade
  (`c36a62c`, `e92cd56`).
- `EegTab` shrank to 590 lines. Stimulus URL construction lives in one place (`5310e10`).

---

## Rules that outlived the campaigns

These still apply to any future cleanup. They came from the old DO-NOT-TOUCH list.

- **An orphan endpoint is not a dead module.** `modules/integrations/google_drive/` is how
  analytics, uploads, deletes and reports reach Drive. `modules/integrations/storage_provider.py`
  is the only place they import the store from (local mode swaps it there).
- **`shadcn` is a runtime dependency.** `globals.css` imports its CSS.
- **No third-party font or script in the web app.** Poppins is served from `frontend/public/fonts`; the
  student edition runs with no network and `student/build.ps1` fails on a remote font reference or a
  `frontend/.env*` value in its export. Local-only behaviour is gated on `IS_LOCAL_MODE`
  (`lib/appMode.ts`), never on the URL.
- **`jszip` is loaded with `await import()`**, so it has no static import.
- **Search for both forms of every setting:** `settings.x` and `getattr(settings, "x")`.
  FastAPI decorators span several lines, so parse routes as multi-line.
- **Search `delivery/` before removing any API surface.** It is a shipped build whose frontend
  is a tarball.
- **Mocked Playwright e2e only protects rendering, not the backend.** Framework-bound code is
  never dead by reference count: handlers, Pydantic schemas, SQLAlchemy models, Next.js App
  Router files, `__init__` re-exports.
- **Never regenerate a golden to turn a test green.** See the project `AGENTS.md`.
