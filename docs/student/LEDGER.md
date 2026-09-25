# Student edition — M0 decision and evidence ledger

2026-09-19, updated 2026-09-21. Status: **M0 closed (plan v2 approved 2026-09-20); M1 spike done except its clean-machine proof gate; M2 (local mode) and M3 (local frontend) done 2026-09-21; M4 prepared 2026-09-21, laptop run open**.
Plan: [PLAN.md](PLAN.md). Withdrawn drafts (signed `.ndpkg` proposal and its spec):
[superseded/](superseded/). The decision register D01–D15 below belongs to that
withdrawn proposal; treat it as background, not decisions.

## Owner clarification — current direction

The owner requested important questions first and described a very simple app:
no account, no backend verifications, local upload/opening and visualization of
already-processed projects. This overrides the previous decision register and
approval target wherever they conflict. Mandatory signatures/trust management and
export-certification gates are withdrawn; technical findings remain evidence, not
automatically requirements.

Do not treat the unanswered options from the earlier, more complex proposal as
accepted defaults. Revise the plan and format only after clarifying the simple workflow.

### Owner answers, 2026-09-20 (verbatim in quotes)

| Question | Answer | Consequence |
| --- | --- | --- |
| What is opened? | "The app will be the exact same but just a visualizer, it can load projects or upload projects but no account related functionality." | Student app = current app minus accounts. Format of the opened artifact is **still open**: the current app's "upload" is a raw experiment ZIP that gets processed (create project → ZIP → processing → finalize), which conflicts with the earlier "already processed" wording. |
| Visualization scope? | "The current app functionality." | Full interactive dashboard (EyeTracker, GSR, EEG, comparisons). Live local computation is required; saved-results-only and subset options are rejected. Whether reports, stimulus media and AOI editing count as "current functionality" is **open**. |
| Offline? | Asked for options. Plan: students download a package from Google Drive, run it, and the app is running. Open to better options. | Download is online, so the real requirement is "no internet after download, including first launch". Delivery form depends on student computers (open). |
| What does "upload" mean? | "the current exact app functionality, all the same. Just no account related functionality so the app is lighter and works offline" | Upload is today's raw experiment ZIP → processing → finalize, run locally. No new package format; the signed package spec is withdrawn. |
| Which features must stay? | "All that is possible, but flag if one feature in particular would give a lot of problems" | Nothing dropped up front. Problem areas are infrastructure, listed below, not features. |
| Student computers? | "Own Windows laptops" | Windows x64 only. Locked-down lab PCs, Macs and Chromebooks are out. |
| Do students always start from a raw ZIP? | "Yes, raw ZIP only" | No export step and no package format. The teacher's AOIs, placements and sensor setup do not travel; students configure their own. |
| Download size ceiling? | "A few GB is fine" | Size does not force the lighter database. Embedded PostgreSQL keeps SQL, migrations, locks and goldens unchanged; M1 confirmed it works, so the SQLite fallback is not needed. |
| Unsigned app acceptable? | "Yes, with a guide" | No code-signing certificate. Package ships a one-page SmartScreen guide. |

Working reading: "load" means reopening a project already in the local app, so the
library persists between launches. Not yet asked: data size on student laptops (to be
measured in M1) and governance of raw participant data handed to students. Pending:
owner approval of [PLAN.md](PLAN.md), the M0 exit gate.

### Local-mode coupling evidence (read-only, 2026-09-20)

Backend paths are under `backend/src/neurodatics/`. Counts are file-level greps, not proofs.

| Area | Evidence | Reading |
| --- | --- | --- |
| Storage | `infra/storage/gdrive_client.py`, `gdrive_file_service.py`; imported directly, with no interface, by `modules/projects/application/use_cases/upload_experiment_zip.py:17` and `modules/analytics/application/services/parquet_reader_service.py:11-13,359`; Drive references in 15 backend files including `delete_project.py`, `recover_uploads.py`, `executive_report_service.py`, projects routes. `infra/storage/r2_client.py` also exists (not inspected). | Local mode needs a new storage seam. The largest change. |
| Database | `modules/projects/infrastructure/mutation_lock.py:45` uses `pg_try_advisory_xact_lock`; `modules/analytics/infrastructure/transform_token_store.py:4,28-36` uses PostgreSQL `JSONB` and `\|\|`; 10 of 26 migrations mention PostgreSQL/JSONB/UUID; `psycopg` 3 is a dependency. | SQLite needs a rewrite and re-verification; embedded PostgreSQL keeps SQL unchanged. |
| Redis | `modules/analytics/infrastructure/redis_cache.py` catches exceptions and returns `None`; `infra/health/readiness.py:37` reports Redis errors; `upload_throttle.py:9` says the throttle is in-process. | Cache likely degrades cleanly; readiness and `upload_experiment_zip.py` (3 references) still need review. |
| Video | `modules/projects/application/services/stimulus_probe_service.py:179` uses `shutil.which("ffprobe")` with a fallback; ffmpeg/ffprobe referenced 11 times in projects routes. | Binaries must ship with the package. |
| Reports | `backend/pyproject.toml`: `typst ^0.15.0`, `matplotlib`, `Pillow` (pip wheels). | Bundles without a separate binary. |
| Frontend | Drive/Google references only in `app/configuracion/page.tsx`, `lib/auth/googleAuth.ts` and `app/globals.css` (fonts). Thumbnails per the earlier inspection. | Small surface, plus the auth-context and session dependencies already recorded. |
| Not tested at M0 | Frozen executable, install size, antivirus/SmartScreen behaviour, clean-laptop run, processing on student-class RAM. | Frozen executable and size measured in M1 (below). Still untested: clean-laptop run with networking off, SmartScreen and Smart App Control, student-class RAM. |

### M1 spike result (2026-09-20)

Full report: [M1-SPIKE.md](M1-SPIKE.md); scripts: [m1-spike/](m1-spike/).

- **Feasible.** A frozen Windows x64 runtime ingested a real 278 MiB raw ZIP, ran analytics and
  Typst reports, ran ffmpeg/ffprobe, and served the real FastAPI app on embedded PostgreSQL 16.
  Analytics digests, video probe and PDF sizes are identical to the unfrozen app.
- **Decision: embedded PostgreSQL 16 confirmed** (real advisory lock, JSONB merge, 26 migrations,
  clean stop, crash recovery, orphan adoption). SQLite fallback not needed.
- **Sizes:** 791 MiB extracted, 283.6 MiB as a deflate zip (runtime 165, ffmpeg 70, PostgreSQL 43
  plus a 4.5 template, zipped). `googleapiclient` alone is 92 MiB and is Drive-only.
- **Not met:** the plan's proof gate (clean Windows profile, networking off). Windows Sandbox is not
  installed and the network cannot be cut without ending the session. Substitute evidence: accented
  path with spaces, PATH limited to System32, fresh empty profile, socket tripwire (0 blocked),
  connection sampling (0 non-loopback).
- **Found and fixed in the prototype launcher:** `initdb` fails on non-ASCII install paths (ship a
  cluster template), `pg_ctl` hangs a piped parent, `pg_ctl start -w` succeeds too early after a
  crash (stale pid file), missing Visual C++ runtime for the PostgreSQL binaries (ship it app-local),
  builder timezone baked into the template, orphaned server after a closed console.
- **Reviewed 2026-09-20** (the spike had been run on a weaker model than the plan called for). Every
  headline number was re-checked against the saved JSON in `output/student-m1/` and every harness
  call against current app signatures; all matched, and no `backend/` or `frontend/` file was
  modified during the spike, so the result stands and was not re-run. Four gaps were found and are
  recorded in [M1-SPIKE.md](M1-SPIKE.md) ("Gaps found reviewing the spike") and carried into the M2
  entry conditions in [PLAN.md](PLAN.md). The one that changes a claim above: the offline tripwire
  is blind to asyncio on Windows, so "0 non-loopback" is strong for the batch path and weak for the
  served app.
- **Owner asks:** a clean machine or VM for the proof gate; classroom dataset sizes; ffmpeg GPL versus
  LGPL; governance of raw participant data (still unconfirmed). See PLAN.md open items.

### M2 result (2026-09-21)

Full account: "M2 result" in [PLAN.md](PLAN.md); how to build and run the gates: [../../student/README.md](../../student/README.md).

- **Done:** `APP_MODE=local` (fixed user, local file store, in-process cache, no Google), the
  launcher for embedded PostgreSQL with every M1 trap carried, and the frozen-package gates
  (selftest, PostgreSQL lifecycle, real HTTP upload-to-report flow, double launch, served-app
  offline evidence). All four M1 review gaps are closed. `./verify.ps1` ALL GREEN, 884 backend
  tests, goldens untouched.
- **Owner decisions taken on their behalf, open to veto:** data in `%LOCALAPPDATA%` rather than
  beside the program, a random loopback database password, a Host/Origin guard in place of a
  login, refusal to run elevated, and shipping the dev-venv dependency resolution.
- **Not covered by any owner answer above:** the student data outliving the deleted folder (see the
  governance question in PLAN.md).

### M3 result (2026-09-21)

Full account: "M3 result" in [PLAN.md](PLAN.md); how to build and run the gates: [../../student/README.md](../../student/README.md).

- **Done:** the web app builds as a static export in local mode and the backend serves it from its own
  origin; one fixed session instead of sign-in; no Drive or Google screens, thumbnails or fonts; the
  frozen package's `serve` gate now drives it in real Chromium with name resolution off
  (3 of 3 pass: no account, Drive or Google anywhere; the session is minted again when it ran out; and the whole flow (wizard upload of the extracted experiment folder, demographics, stimulus images, EEG, GSR and eye-tracker analytics, delete) with 0 requests leaving the machine). `./verify.ps1` ALL GREEN, 898 backend tests, goldens untouched.
- **Owner decisions taken on their behalf, open to veto:** Poppins is self-hosted in both editions;
  the local user is called "Estudiante"; the app opens on the home page.
- **Still the owner's:** the clean-machine, network-off proof gate, Smart App Control, ffmpeg licence,
  classroom data size, governance of raw participant data.

### M4 preparation (2026-09-21)

Full account: "M4 result" in [PLAN.md](PLAN.md); the laptop procedure: [LAPTOP-TEST.md](LAPTOP-TEST.md).

- **Done:** `student/package.ps1` (guide, notices, zip, SHA-256, extracted-zip start from an accented path),
  `student/LEEME.txt` (student guide, Spanish), `student/make-notices.py`, `student/laptop-test.ps1` (the laptop kit,
  run here in Windows PowerShell 5.1 with a passing run and a failing negative control), and a launcher that
  logs a failed double-click and waits for Enter. The 270 MiB zip extracts to 5,155 files and 700 MiB; every frozen
  gate passes on the rebuilt package.
- **Not done, and only the owner can:** the laptop run (this also closes the M1 proof gate), the ffmpeg licence
  decision (the bundled build is GPLv3 and has no licence file beside it), and governance of raw participant data.
  The guide's SmartScreen wording and its RAM and disk figures are provisional until that run.

## Baseline and working scope

- Inspected branch `dashboard`, HEAD `7c21bc8a45f3765f5b1a0929ecec2b90f583e392`.
- Working tree had 157 status entries, including current EEG, reports, authentication
  and delivery work. Inspection used working files, not only HEAD. Their integration
  status is not inferred from a historical green test result.
- Read `CLAUDE.md` and the user-provided AGENTS instructions. Existing goldens are
  protected; no regeneration or broad staging/reset is permitted.
- `docs/CHANGELOG.md` explains that deleted cleanup/performance campaign notes were
  consolidated. Their absence is not evidence that the cleanup is missing.
- Source manifest: 479 existing tracked/untracked backend/frontend/build-input files;
  SHA-256 `7476d32bde9ab5dddb78208c62aafdfce57f71805b5eb2aaadd1602d8f8c4466`.
  Local evidence: `output/student-m0-source-manifest.json`. This identifies the read
  baseline and is not a Git commit or a release dependency lock.
- Work performed: independent read-only backend/frontend roast reviews, targeted
  source inspection, isolated static-export build, environment inventory, and these
  planning documents. No application/deployment edits, real-data export, private key
  creation, dependency installation, broad tests, or installer distribution.
- No local `roastsession` skill was found in searched project/personal skill locations.
  The request was handled as an adversarial planning review, not as an invoked skill.

## Decision register

| ID | Decision | Proposed disposition | State |
| --- | --- | --- | --- |
| D01 | User outcome | Install, import, explore equivalent analyses and reopen offline on Windows x64. | Owner review. |
| D02 | Screens | Full current dashboard plus library/import; reports deferred. | Asked; unanswered. |
| D03 | Data/media | Pseudonymised processed data; selected stimulus images/videos; no raw source files or personal metadata. | Asked; unanswered. |
| D04 | Package trust | Trusted Ed25519 issuers; explicit operator/key lifecycle. | Asked; unanswered. |
| D05 | Delivery | Native onedir + local browser; Docker variant deferred. | Provisional; S2 remains open. |
| D06 | Read-only meaning | Imported content immutable; local library/cache/preferences may change; analytics computation remains. | Proposed clarification. |
| D07 | Interfaces | Catalog, Parquet, media, cache, token access and separate composition; neutral DTOs. | Source-supported proposal. |
| D08 | Compatibility | Reject unsupported formats/contracts, not all older producer versions. | Proposed correction to T1 gate. |
| D09 | Export eligibility | READY plus scientific provenance, identity/media completeness and coherent snapshot. | Source-supported proposal. |
| D10 | Equivalence | Define now; exact structure/metadata plus established numerical tolerances and explicit identity mapping. | Proposed release contract. |
| D11 | Dependency order | T3 independent of T1; T2 consumes T3 DTOs; S2 early; first equivalence slice during T4. | Proposed correction to sketch. |
| D12 | Baseline integration | Integrate/handoff dirty work before implementation worktrees and run `verify.ps1` there. | Open implementation entry condition. |
| D13 | Reference workload | 8 GB RAM/4 logical cores/SSD, <=500 MiB declared fixture; budgets in plan. | Proposed, unmeasured. |
| D14 | Clean Windows proof | Exact native artifact on clean VM with external networking disabled. | Required for release; access not established. |
| D15 | Installer signing | Separate from data-package signatures; choose operator/certificate or explicit unsigned distribution policy. | Open delivery decision; no credential provisioned. |

Draft defaults are not user answers. M0 closes only after the owner approves or amends
the spec and explicitly disposes of the remaining feasibility spikes.

## Source evidence from the roast

| Claim | Source locations at inspection | Implication |
| --- | --- | --- |
| READY is publication state, with metadata saved separately. | `docs/UPLOAD_PIPELINE.md:21,208`; project routes near `:1439`. | Add completeness/snapshot preflight. |
| Participant codes may contain document IDs. | `backend/src/neurodatics/modules/participants/domain/entities.py:21`. | Code renaming must include metadata and paths. |
| Reader resolves whole-user Parquet identity from metadata. | `.../analytics/application/services/parquet_reader_service.py:92,182,324`. | Explicit package mapping; reject ambiguous legacy resolution. |
| Ingestion persists extra scientific metadata. | `.../projects/application/services/csv_processing_service.py:1000,1076`. | Preserve units, rates, attrs, fixation and transform evidence. |
| GET analytics writes transform tokens through PostgreSQL JSONB. | `.../analytics/api/routes.py:194`; `.../analytics/infrastructure/transform_token_store.py:22,42`. | SQLite substitution alone is insufficient. |
| Analytics owns SQL/auth/cache dependencies today. | `.../analytics/api/routes.py:70,124,273`. | Extract neutral read services and inject policies. |
| Read/media handlers share the upload/Drive module. | `.../projects/api/routes.py:26,35,46,704,817,870,900`. | Student must not import this module as-is. |
| AOIs have a separate cache identity. | `.../analytics/api/routes.py:258`. | Ingestion generation alone cannot freeze export metadata. |
| No-session API requests redirect; comparisons require auth context. | `frontend/lib/api/apiFetch.ts:104,113`; `frontend/lib/auth/sessionStore.ts:75`; `frontend/features/analytics/comparison/ComparisonTab.tsx:188`. | Separate transport/preference identity. |
| Dashboard orchestration is in an app route. | `frontend/app/dashboard/page.tsx:80,231`. | Extract shared body rather than copy the whole page. |
| Current CSS loads Google Fonts. | `frontend/app/globals.css:1`. | Bundle local fonts; test network behavior. |
| Current project views use Drive thumbnails. | `frontend/features/projects/components/ViewProjectDialog.tsx:87`. | Student library uses local-media views. |
| Video preview invokes native tools. | `.../projects/api/routes.py:611,641`; `backend/Dockerfile:8`. | Bundle/test Windows FFmpeg/FFprobe or narrow media scope. |
| Report generation is a POST with further dependencies. | `frontend/features/reports/api/reportsApi.ts:8`; `.../reports/application/services/executive_report_service.py:279,323`. | Reports are an explicit expansion. |
| Existing HTTP goldens mock storage and mainly pin response shape. | `backend/tests/characterization/conftest.py:88`; `test_analytics_http_contracts.py:20,41`; `backend/tests/fixtures/golden/README.md`. | Real package/SQLite round trip and numeric comparisons required. |
| Existing browser E2E launches Next dev and seeds auth. | `frontend/playwright.config.ts:29`; `frontend/tests/e2e/eeg-dashboard.spec.ts:6`. | Add production static/native integration coverage. |
| Existing delivery has no clean-Windows proof. | `docs/delivery-handoff.md`, limits section. | Do not inherit that release gate for student-native delivery. |

Paths beginning `.../` above are relative to `backend/src/neurodatics/modules/`.
Line numbers describe the inspected working tree and may move during implementation.

## Experiments and open spikes

### S0 — current frontend static compilation: PASSED (bounded conclusion)

Built a copy of current `app`, `components`, `features`, `lib`, `public` and build
configuration in ignored scratch directory
`output/student-m0-static-20260919-125231/`. Reused installed `node_modules` via a
junction. No teacher `.env` files were copied and no teacher source/config was edited.

The scratch `next.config.mjs` was:

```js
export default {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};
```

Ran installed Next's `build --webpack`, telemetry disabled. Next **16.1.6** compiled
successfully (compiler reported 7.4 s), TypeScript passed, static pages generated,
exit code **0**. `/`, `/authorize`, `/configuracion`, `/dashboard`, `/login`,
`/proyectos`, `/reportes` and the not-found page were emitted. Local full log:
`output/student-m0-static-20260919-125231/build.log`.

This proves static compilation of the present frontend under the tested config.
It does **not** prove student scope, no-session requests, offline fonts, media, static
FastAPI routing, browser behavior, or a PyInstaller build. Removing server rewrites
and default image optimization follows Next's supported static-export constraints:
[official static export guide](https://nextjs.org/docs/app/guides/static-exports).

### Environment inventory: observed, not approved release pins

| Component | Installed version |
| --- | --- |
| Python | 3.14.3 |
| NumPy | 2.4.4 |
| pandas | 2.3.3 |
| PyArrow | 25.0.0 |
| SciPy | 1.17.1 |
| Matplotlib | 3.10.9 |
| cryptography | 41.0.7 |
| FastAPI | 0.104.1 |
| PyInstaller | Not installed in the root venv. |

`backend/pyproject.toml` declares NumPy `<3.0` but PyArrow `^16.0.0`; PyArrow 25 does
not match that declared range. Python is declared `^3.9`. Resolve and freeze a tested
teacher/student dependency profile; do not claim that copying the current venv is
a reproducible build. NumPy is within the declared range; its exact release still
needs pinning for equivalence.

### Open bounded spikes

| Spike | Output required | Current status / next action |
| --- | --- | --- |
| S1 no-session/offline runtime | Student-shaped shared view + static FastAPI serving + blocked external requests and route refresh. | Not run; do after scope choice. |
| S2 native dependency closure | Minimal Windows onedir executable reads Parquet, computes EEG/heatmap and included video preview; pins, module list, size and startup evidence. | Not run; use isolated build environment, not changes to shared venv. |
| S3 metadata preservation | Current synthetic processed Parquet and transformed fixture survive projection with dtypes/nulls/attrs/geometry preserved; identify acceptable EEG provenance markers. | Static inventory completed; executable projection probe remains open. |
| S4 coherent export snapshot | Identify every relevant writer; prove lock/revision covers AOI edits and re-ingestion; test missing media and legacy identity failure. | Risks inspected; protocol in spec; implementation proof belongs to T2. |
| S5 trust operations | Owner selects trust policy and, if signed, names issuer/key operator and update mechanism. | Question pending. |
| S6 clean-machine access | Named test host/VM, supported Windows baseline and offline procedure. | Not established. Final test requires T7 artifact. |

PyInstaller produces bundles for the build OS/Python architecture and can include the
interpreter and dependencies; native feasibility here still needs a local build and
clean-machine check. [Official PyInstaller operating model](https://pyinstaller.org/en/stable/operating-mode.html).

## Verification and handoff

- Static-export spike and its TypeScript check passed. No `verify.ps1` run was needed
  for planning-only changes; no claim is made that today's dirty teacher tree is green.
- Planning checks passed: local document links/code fences/whitespace; all 23 analytics
  GET suffixes matched against the source AST. All 479 captured source files remained
  byte-identical after drafting. Independent draft review caught and corrected a
  circular content-revision definition; local revision now derives from the manifest
  outside the signed catalog payload.
- Prior `verify.ps1`/installer results in `docs/CHANGELOG.md` are historical evidence,
  not fresh validation of a student build.
- No benchmarks or clean-VM results exist for the student edition. T8 must replace
  proposed budgets with measured rows including artifact hash and hardware/workload.
- (Superseded by the M1 result above.) Next owner action: provide a clean machine or VM for the
  M1 proof gate and answer the open items in PLAN.md. Next technical action: start M2 from the
  M1 findings, keeping the frozen selftest as a gate.
- Approval record: on 2026-09-20 the owner approved [PLAN.md](PLAN.md) as written, in
  reply to "M0 isn't closed... how do you want to proceed with M1?" (answer: "Approve as
  written, run M1"). This closes M0. Not covered by that answer and still open: confirmation
  that governance of raw participant data is handled, and the data-size question (M1 measures
  it). The T1–T8 lanes belong to the withdrawn proposal and were never started.
