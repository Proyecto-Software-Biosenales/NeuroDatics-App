# Findings & evidence base

Audited 2026-09-01 against branch `dashboard` @ `c68b76e`. Every claim below was verified by
running the command shown. **Append new findings; do not rewrite history.**

---

## ⛔ DO-NOT-TOUCH — things that look dead and are not

Read this list before every deletion. Each one would have been deleted by a naive audit, and
each would have broken the app.

### 1. `modules/integrations/google_drive/` — routes are orphaned, the module is load-bearing

All 9 HTTP routes have **zero** frontend callers:

```bash
grep -rn "google-drive\|googleDrive\|gdrive" frontend/app frontend/components \
  frontend/features frontend/hooks frontend/lib --include=*.ts --include=*.tsx   # → 0 hits
```

But **seven non-Drive files import the module**, and analytics cannot read data without it:

| Importer | Uses |
|---|---|
| `analytics/.../parquet_reader_service.py:10-12` | `GoogleDriveClient`, `SystemIntegrationRepository` — **this is how analytics loads parquet data** |
| `projects/api/routes.py:24-27` | `configure_gdrive_client_with_oauth`, `SystemIntegrationRepository` |
| `projects/.../use_cases/upload_experiment_zip.py:15` | `configure_gdrive_client_with_oauth` |
| `projects/.../use_cases/delete_project.py:7` | `configure_gdrive_client_with_oauth` |
| `reports/.../executive_report_service.py:41` | `SystemIntegrationRepository` |
| `tests/unit/test_upload_pipeline_hardening.py:9` | the application service |

**Rule: an orphaned *endpoint* is not a dead *module*.** Session 6 may delete the 9 route
handlers. It must not delete the module.

### 2. `shadcn` is a real runtime dependency

It looks like a CLI that shouldn't be in `dependencies`, but it ships CSS that is imported:

```
frontend/app/globals.css:4:@import "shadcn/tailwind.css";
```

`depcheck`/`knip` will likely flag it. Do not remove it.

### 3. `jszip` is loaded dynamically

No static import exists. It is used via `await import("jszip")` in
`EditProjectDialog.tsx:516` and `useCreateProjectWizard.ts:348`. A grep for
`from "jszip"` finds nothing.

### 4. Nine settings are read through `getattr`, not attribute access

`media_cache_janitor.py:163-170` and others use
`getattr(settings, 'media_cache_max_bytes', 2*1024*1024*1024)` with the default duplicated at
the call site. A `grep "settings.media_cache_max_bytes"` returns nothing, so these look dead.
They are live. **Any config audit must grep for the `getattr` form too.**

### 5. FastAPI decorators span multiple lines

```python
@router.get(
    "/fixations/sensitivity",
```

A single-line regex over `@router.get("...")` finds 49 routes; the real count is **51**. The
frontend *does* call `/analytics/fixations/sensitivity`. Always parse multi-line.

### 6. `delivery/` is a shipped release — grep it before removing any API surface

`delivery/NeuroDatics-App/` is not a scratch copy. It contains docker image tarballs
(`neurodatics-frontend.tar.gz`, `neurodatics-backend.tar.gz`), `SHA256SUMS.txt`, a real `.env`,
start/stop scripts and deployment docs — **a frozen build the user has already deployed.** It
references `google-drive` in its `.env`, `docker-compose.yml` and `NETWORK_DEPLOYMENT.md`.

An endpoint unused by *today's* frontend source may still be called by *that* build — and its
frontend is a tarball you cannot grep. **Every deletion grep must include `delivery/`.** This is
why the Drive routes are Tier B (tombstone) and not Tier A (delete now).

### 7. The existing Playwright e2e is not a backend safety net

`frontend/tests/e2e/comparison-dashboard.spec.ts` (876 LOC) contains **14 `page.route`
interceptors** — it mocks the entire backend with fixture data. A green `npm run test:e2e` after
a backend deletion proves nothing about `analytics_service.py` or `fixation_detection_service.py`.
It protects frontend rendering only. A genuine golden-path e2e against a real stack has to be
recorded separately (Session 3).

### 8. Framework-referenced code generally

Never call these dead on a static-reference count alone: FastAPI handlers (decorator-bound),
Pydantic schemas, SQLAlchemy models (Alembic + relationship strings), Next.js App Router files
(`page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`, `error.tsx`, `middleware.ts`), and
`__init__.py` re-exports.

---

## ✅ Verified dead — safe to delete

| # | Item | Size | Evidence |
|---|---|---|---|
| D1 | `modules/processing/` + `modules/uploads/` | 20 files, 60 LOC | Every file is a 3-LOC stub. `grep -rn "modules.processing\|modules.uploads" backend/src backend/tests` → **0 external refs**. Neither router is mounted in `api/router.py`. `ProcessingRepositoryImpl` and `UploadRepositoryImpl` raise `NameError` on import — they have never been executed. |
| D2 | 12 frontend files with no importers | 679 LOC | See table below. |
| D3 | `pyjwt` dependency | — | `grep -rn "import jwt\|from jwt\|PyJWT" backend/{src,tests,scripts,migrations}` → 0 hits. Only `python-jose` is used, at `config/security.py:5`. |
| D4 | `gdrive_refresh_token` setting | 1 field | `settings.py:69`. Zero references outside its declaration, including the `getattr` form. Superseded by per-integration DB tokens (`parquet_reader_service.py:363`). |
| D5 | `backend/poetry.lock;C/` and `backend/pyproject.toml;C/` | 2 empty dirs | Empty directories created by a mangled shell redirect. |
| D6 | 7 placeholder worker files | ~21 LOC | `workers/tasks/{process_experiment_folder,generate_report_pdf,extract_metrics}.py` and `workers/pipelines/{validations,report_builder,feature_extraction,csv_to_parquet}.py` are all 3-LOC stubs. |

### D2 detail — frontend files with zero importers

Scanned 131 files across `app/ components/ features/ hooks/ lib/`, excluding App Router entry
points. Verified individually with `grep -rn`.

```
  197 LOC  components/ui/item.tsx
  191 LOC  features/analytics/components/PupilStatsSection.tsx
   86 LOC  features/reports/components/ReportContentCard.tsx
   36 LOC  components/ui/SelectTrigger.tsx
   31 LOC  components/ui/SelectOption.tsx
   29 LOC  features/reports/select-report-content/useReportContent.ts
   29 LOC  features/projects/hooks/useProjectApi.ts
   28 LOC  features/reports/select-sensors/useSelectedSensors.ts
   28 LOC  features/projects/select-project/useSelectedProject.ts
   15 LOC  features/reports/select-report-type/useReportType.ts
    6 LOC  features/home/index.ts
    3 LOC  features/projects/create-project/index.ts
```

Note the shape: four `features/*/select-*/use*.ts` hooks and two barrel `index.ts` files. This
looks like an abandoned state-management approach that was replaced by
`useCreateProjectWizard.ts`. Confirm that reading before deleting — if so, delete as one commit
with that rationale.

---

## ⚠️ Broken / incomplete logic

| # | Item | Evidence |
|---|---|---|
| B1 | **16 `react-hooks/set-state-in-effect` errors** | ESLint. These are genuine correctness bugs (render loops / stale state), not style. The largest single source of real defects found. |
| B2 | Circular dependency `analytics ↔ projects` | `analytics_service.py:10` imports projects' `fixation_detection_service`; `csv_processing_service.py:15` and `fixation_detection_service.py:20` import analytics' `scenario_identity`. **Already worked around** with function-local lazy imports at `projects/api/routes.py:540-547` — the classic circular-import band-aid. |
| B3 | 5 silently-swallowed exceptions | `network_preflight.py:62`, `gdrive_client.py:214`, `stimulus_probe_service.py:113`, `executive_report_service.py:634`, `executive_report_service.py:856`. Low count — error handling is otherwise clean. |
| B4 | `.env.example` drift | `Settings` declares 52 fields; `backend/.env.example` lists 31. **26 fields missing**; 5 keys in the file (`JOB_TIMEOUT`, `JOB_RESULT_TTL`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`) are not Settings fields at all. |
| B5 | 9 `getattr(settings, ...)` call-site defaults | Renaming or removing a settings field fails **silently** while this form is in place. Fix before any config cleanup. |
| B6 | RQ pipeline is dormant | `workers/entrypoint.py` (71 LOC) runs a real `rq.Worker`, but nothing anywhere enqueues. The only `q.enqueue(...)` in the repo is inside a docstring. `process_experiment_zip.py:33`: *"Not actively enqueued yet."* Redis itself **is** live — it backs `AnalyticsRedisCache`. |
| B7 | Orphaned passing test | `features/projects/create-project/stimulusPlacement.test.mjs` — 4 passing tests, wired into no npm script, never runs. |
| B8 | 7 `@typescript-eslint/no-explicit-any` | Escape hatches that may hide contract drift. |

Not found, despite expectation: **zero** bare `except:`, **zero** `console.log` in frontend
source, **zero** empty `catch {}`, and essentially zero TODO/FIXME markers. The 40 apparent
TODO hits in an early grep were the Spanish word *todos*. The incompleteness in this codebase is
structural, not annotated.

---

## 📊 Baselines (verified 2026-09-01)

| Metric | Value | Command |
|---|---|---|
| Backend tests | **494 passed, 0 failed**, ~18-31s | `cd backend && PYTHONPATH=src ../.venv/Scripts/python.exe -m pytest -q` |
| Backend source | 138 files, 23,909 LOC | `find backend/src -name "*.py" \| wc -l` |
| Backend test LOC | 10,241 (ratio 0.43:1) | — |
| Frontend typecheck | exit 0, clean | `npx --no-install tsc --noEmit` |
| Frontend tests | 34 pass, 224ms | `npm run test:comparison-click` |
| Frontend lint | **40 problems** (25 err, 15 warn) | `npx --no-install eslint .` |
| Frontend source | 134 files, 30,319 LOC | — |
| Frontend tested surface | 750 / 29,402 LOC = **2.6%** | 6 pure helper modules; zero component or hook tests |
| Backend routes | **51** (23 analytics, 13 projects, 9 drive, 2 auth, 2 scenaries, 1 participants, 1 reports) | multi-line-aware parse |
| HTTP-level tests | **1** in the entire suite | `grep -rn "TestClient" backend/tests` |
| Analytics handler coverage | **5 of 23** invoked by any test | — |
| Settings fields | 52 (9 via `getattr`, 1 dead, 26 undocumented) | — |
| Layering violations | 10 `api → infrastructure` direct imports | domain layer is **clean** — 0 outward imports |

### The god files

| File | LOC | Structure |
|---|---|---|
| `analytics/.../analytics_service.py` | 3,405 | 10 classes, **all live** (9-36 external refs each), 70 methods (48 private). Clean per-class seams: FixationEventService 744, EegAnalyticsService 583, PupilAnalyticsService 567, AoiAnalyticsService 490, ScanpathAnalyticsService 263, FixationDurationVariantService 224, HeatmapAnalyticsService 148, GsrAnalyticsService 128, FixationHistogramService 65, FixationDataService 49 |
| `projects/.../fixation_detection_service.py` | 2,512 | untested |
| `reports/.../executive_report_service.py` | 1,960 | untested |
| `analytics/api/routes.py` | 1,536 | 23 routes, 18 untested |
| `projects/api/routes.py` | 1,463 | contains the lazy-import workaround |
| `frontend/.../EegTab.tsx` | 2,381 | zero coverage |
| `frontend/.../EditProjectDialog.tsx` | 1,155 | zero coverage |
| `frontend/.../useAnalyticsData.ts` | 1,132 | zero coverage |

### Dependency status

**Frontend — all used.** `@base-ui/react` is used exactly once (`components/ui/combobox.tsx:4`)
— a whole package for one component, a consolidation candidate but not dead. `ogl` is used in
`components/LineWaves.tsx`. `lucide-react` in 48 files.

**Backend — one dead.** `pyjwt` (D3). Also note `google_auth_httplib2` is imported at
`gdrive_client.py:8` but **is not declared** in `pyproject.toml` — it works only as a transitive
dependency of `google-api-python-client`. Declare it. `cryptography` has no direct imports; it
is an extra of `python-jose` and should stay.

---

## 🔧 Tool traps

Each of these turns a cleanup tool into a way to break the app.

| Tool | Trap |
|---|---|
| **knip** | Hand-writing an `entry` array **replaces** the Next.js plugin defaults instead of merging. All 8 `page.tsx` files are then reported unused — the fastest possible way to delete the application. Run with **no config first**; add config only to fix a specific observed misfire. Also: the default run and `--production` disagree by design (the default counts the 6 `.mjs` tests as usage). Keep both lists. |
| **vulture** | At its default `--min-confidence 60` on FastAPI + Pydantic + SQLAlchemy the output is mostly false positives — route handlers, model fields, validators, declarative attributes, Alembic `upgrade`/`downgrade`, pytest fixtures. Start at **100**, scan `src` *and* `tests` together, and build a whitelist. |
| **ruff `F401`** | Removes imports kept for their side effects. Run it as its own commit and verify immediately. |
| **coverage.py** | Proves "executed at least once", **never** "safe to delete". Legitimately-uncovered-but-alive here: exception handlers, Alembic migrations, Drive failure paths, auth error branches, and any sensor modality missing from the fixture. Also: `--reload` forks a child coverage does not measure (you will conclude the whole backend is dead), and `--save-signal` is **not available on Windows**. |
| **pytest / venv** | `backend/.venv` has no pytest. Use the root `.venv`. |
| **snapshots** | Snapshotting floats with syrupy/approvaltests flakes on numpy/scipy/BLAS patch versions and `-0.0` vs `0.0`. Use `pytest-regressions`' tolerance-aware `dataframe_regression`/`num_regression` for numerics. **Never snapshot matplotlib PNGs** — not byte-stable across versions, DPI, fonts or backends. |
| **oasdiff** | There is no npx-based OpenAPI diff (Redocly has no `diff` command). Use Docker `tufin/oasdiff` — and copy the specs to a plain path like `C:\temp\oas` first, because the non-ASCII `Bioseñales` in this repo's path breaks Docker bind mounts on Windows. |
| **mutmut** | Requires `fork()`; Windows users must run inside WSL. Not worth the detour for this project — skip mutation testing. |

## Session log of decisions

*(Append here: things you investigated and concluded, especially "checked X, it IS used, do not
delete". Negative results are the most valuable thing in this file.)*


### 2026-09-03 — S0 revalidation

The original audit is a candidate list, not authority to remove code. Two D2 barrel files have live imports and stay. Runtime inventory is 53 HTTP operations (51 business operations and 2 health checks). Baseline remains 494 backend tests; the inventory test raises it to 495. Broad frontend test discovery now runs 38 tests. Cleanup tooling uses the root environment. Syrupy is pinned below 5 for the existing pytest 7 suite; installing its latest release would silently upgrade pytest and invalidate that environment.

No real experiment ZIP/CSV/parquet was found in the workspace or sibling project folders. Any generated corpus must be explicitly marked synthetic and must not close the real-experiment validation gate.


### 2026-09-03 — Completed local campaign decisions

- Tier A revalidation removed 40 files / 972 source lines and preserved the two live barrels. Thirteen frontend files, not the originally listed twelve, were proven unreachable when orphan subgraphs were considered together. The selection hooks belonged to the prior reports flow, not the creation wizard. Exact searches and restoration SHAs are in the evidence files and ledger.
- PyJWT's direct declaration was unused, but Redis requires the package transitively. It correctly remains locked and installed. Four directly imported dependencies are now explicit; no previously locked version changed.
- `GDRIVE_REFRESH_TOKEN` is forwarded by source and shipped Compose. It remains. The three proxy environment variables are consumed by HTTP libraries/network diagnostics and stay documented outside Settings. There were ten actual Settings fallback reads, not nine; all now use direct attributes.
- Numerical and HTTP characterization uses an explicitly synthetic corpus. All 23 analytics routes execute with real calculations; 24 serialized shape snapshots and 18 tolerant numerical CSVs are protected. An isolated off-by-one smoothing mutation fails the numeric check. No existing golden was regenerated to accept a change.
- Numerical review reproduced unsupported alternative-unit interactions and documented them in `evidence/numeric-review.md`; no uncovered calculation was changed.
- Three browser failures were reproduced before correcting selection-aware request state. API argument and callback dependency equivalence were independently reviewed. The unrelated imperative `useGazeAt.clear` loading behavior is pre-existing and was not changed in this scope.
- Shared scenario, cache-generation and fixation contracts were moved without calculation changes and with compatibility re-exports. Three import contracts were proved red before repointing and green afterward. Intentional API/entity/cache dependencies remain documented.
- All nine Drive handlers and the worker are instrumented, but Docker's engine was unavailable. No deployment observation window or harvest date can be claimed from local tests.
- S7's apparent class seams conceal a real mutual dependency between `FixationDurationVariantService` and `FixationEventService`; larger splitting is deferred. Bounded S8 helper/URL extraction is complete and independently reviewed. The live UI library is retained pending a product decision.
- Final verification: 593 backend tests, 24 snapshots, 48 frontend helper tests, 6 hook browser tests and 6 dashboard e2e tests pass; TypeScript/Ruff/Vulture/architecture gates pass; ESLint is 0 errors / 8 warnings. Knip reports no unused files in either mode. Residual export/dependency findings remain candidates, not automatic deletion authority.

### 2026-09-04 — Final decisions and real-data evidence

- The two supplied reference experiments are valid and complementary. Bugui contributes
  8 participants / 7 scenarios / EyeTracker; SAIO contributes 6 participants / 9
  scenarios / EEG, GSR and EyeTracker. Across both: 261,194 sensor rows, 1,508 events,
  96 numerical service calls and 110 scenario Parquets passed. Raw recordings remain
  ignored; hashes and aggregate results are in `evidence/reference-experiment-acceptance.md`.
- Each experiment contains one distance block declared in metres. This confirms the
  alternative-unit finding against real data. New imports now persist canonical seconds
  and millimetres plus schema metadata. Existing Parquets are read unchanged for backward
  compatibility; correcting a historical noncanonical file requires re-importing source.
- The analytics split is complete without changing public imports. The compatibility
  facade is 74 lines, the largest service module is 609, and AST/equivalence plus numeric
  protections pass. `EegTab` is 590 lines after separating spectral/timeseries views,
  panels, tables and tooltips; its dashboard contract runs in Playwright.
- The current combobox usage needs only single selection. Real browser contracts found
  and fixed placeholder/typeahead behavior during the Radix migration. Base UI is gone;
  a clean `npm ci`, TypeScript, browser tests and production build pass.
- An open Edit Project dialog could accept a stale response after switching project or
  reopening. Three failing browser reproductions preceded the cancellation/generation
  fix; a fourth case protects the existing save flow.
- RQ had no enqueue caller and its only task was a logging stub. It and its Compose,
  settings and dependency surface were deliberately removed. Redis remains live for
  analytics caching. Seven Drive operations had no current callers and were removed;
  OAuth `authorize`/`callback` stay because callback is the sole writer of the persisted
  connection used by current Drive functionality.
- The final static sweep removed `components/ui/input-group.tsx`, the only unused file.
  Deptry now passes as an executable gate. Knip reports no unused files or dependency
  findings; exported symbols/types in active modules remain candidates only.
- Final gate: 586 backend tests and 24 snapshots, 48 helpers, 17 real Chromium cases,
  seven dashboard e2e tests, production build, Ruff, Vulture, deptry, TypeScript,
  three import contracts and both Compose validations pass. ESLint is 0 errors / 6
  warnings. The warnings are intentional raw stimulus/blob image elements; the static
  navigation logo now uses `next/image` and an absolute public path.
