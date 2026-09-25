# Student edition — plan (v2, approved)

Status: **APPROVED as written by the owner, 2026-09-20 (M0 closed)**. **M1 done except its proof
gate** (clean Windows profile, networking off): feasible, embedded PostgreSQL confirmed. Results:
[M1-SPIKE.md](M1-SPIKE.md). **M2 done 2026-09-21** (local mode, launcher and build gates, all
passing on the frozen package; see "M2 result"). **M3 done 2026-09-21** (local frontend served by the
backend, proven in a real offline browser; see "M3 result"). **M4 prepared 2026-09-21**: everything that
can be built and proven on this machine is (see "M4 result"); the laptop run itself is the owner's
([LAPTOP-TEST.md](LAPTOP-TEST.md)).
Owner answers and evidence: [LEDGER.md](LEDGER.md). The earlier signed-package
proposal is withdrawn; it is kept in [superseded/](superseded/) for reference only.

## Objective

A package students download from Google Drive, extract and run on their own Windows
laptop. It is the current NeuroDatics app for one local user: the same upload,
processing, analytics dashboard, reports and AOI/project editing. It needs no account,
no Google Drive, no server and no internet after the download, including on first
launch. Projects live on the student's disk and are still there next time.

## Owner decisions so far

- Same app minus account-related functionality (login, Google sign-in, Drive setup,
  multiple users). Its purpose is a lighter app that works offline.
- Full current functionality, computed live. No subset, no saved-results-only mode.
- Input is what the app takes today: a raw experiment ZIP, processed locally.
  There is no new package format.
- Students use their own Windows laptops, so Windows x64 only.
- Delivered as a Google Drive download. A few GB is fine, so size is not a constraint.
- Students always start from a raw ZIP and set up AOIs and sensors themselves. The
  teacher's configuration does not travel, so there is no export step.
- Unsigned is acceptable. Windows SmartScreen will warn, so the package ships a
  one-page "how to open it" guide.

## Proposed items (approved with the plan)

- **Form:** a zipped folder. Extract it, double-click one `.exe`; it starts the app
  locally and opens the browser. No installer, no admin rights.
- **Build:** the same codebase in a "local mode". Teacher-edition behaviour must not
  change (`./verify.ps1` green, goldens never regenerated).
- **Database (confirmed by M1):** embedded PostgreSQL 16. It leaves SQL, migrations, the
  project lock and goldens untouched, which is the lower-risk way to keep the app "exactly
  the same". M1 ran the real advisory lock, JSONB merge and all 26 migrations on it, and it
  started, stopped cleanly and recovered from a killed process. The SQLite fallback is not
  needed. The launcher traps M1 found are in [M1-SPIKE.md](M1-SPIKE.md).

## What "same app, offline" requires

Nothing user-facing has to be dropped. The work is three infrastructure assumptions
that sit under every feature. Evidence and file references are in the ledger.

| Layer | Today | Student edition | Difficulty |
| --- | --- | --- | --- |
| Identity | Login, Google sign-in, per-user scoping on every route | One fixed local user, no login | Medium |
| File storage | Google Drive is hardwired: upload and analytics reads import the Drive client directly, with no storage interface | Local folder behind a new storage adapter | **Hardest** (about 15 backend files) |
| Database | PostgreSQL only: advisory lock, JSONB token merge, 10 of 26 migrations | Embedded PostgreSQL 16, code unchanged (M1 confirmed): second process, +160 MiB uncompressed, +47 MiB zipped, about 1 s to start | **Medium**, launcher only |
| Cache | Redis; the analytics cache already tolerates Redis being absent | In-process cache | Low |
| Video previews | `ffmpeg`/`ffprobe` from PATH | Bundle the binaries | Medium: size and licence |
| Reports | `typst` pip wheel, matplotlib, Pillow | Bundle; executive report also reads Drive | Low once storage is done |
| Frontend | Static export compiled in an isolated copy | Served by the local backend; drop Google Fonts and Drive thumbnails (**done in M3**) | Low to medium |
| Packaging | numpy, scipy, pandas, pyarrow, matplotlib | Frozen onedir works (M1): 791 MiB extracted, 284 MiB zipped, results identical to the unfrozen app. Clean-laptop, SmartScreen and antivirus behaviour still untested | Low to medium |

Raw-ZIP upload and processing is the deepest path (Drive upload, job rows, project
lock, throttle) and runs on student hardware whose limits are unmeasured.

## Open items

Plan approved as written on 2026-09-20, which closed M0 (recorded in the ledger). Still open:

- **M1 proof gate:** a clean Windows machine or VM (or a fresh Windows 11 laptop) to run the
  frozen package with networking off. This machine could not do it; see M1-SPIKE.md.
- **Unsigned package risk:** Windows 11 Smart App Control, when on, can block unsigned apps with
  no "run anyway" choice, and it was Off on the test machine. Test on a fresh Windows 11 laptop
  before relying on "unsigned, with a guide".
- **Data size:** M1 measured one dataset (58 MiB CSV: 52 s, 677 MiB peak memory) on a 16-thread,
  32 GB machine. Tell me if classroom datasets are much larger or laptops much smaller.
- **ffmpeg licence:** the bundled build is GPLv3. Decide before M4 whether an LGPL build is
  acceptable (the app only reads dimensions and extracts one frame).
- **Governance** of raw participant data handed to students is outside the app; the owner has
  not yet confirmed it is handled.

## Milestones

| Milestone | Outcome | Proof |
| --- | --- | --- |
| M0 | Owner approves this page | Approval recorded in the ledger |
| M1 | Feasibility spike: frozen runtime with ingestion, analytics, typst and ffmpeg starts and processes a real ZIP offline. Measures size and confirms or replaces the embedded PostgreSQL lean (starts offline, shuts down cleanly, recovers after a killed process) | Run on a clean Windows profile with networking off; sizes recorded. **Result:** everything passes and sizes are recorded, but the clean-profile, network-off run is still open ([M1-SPIKE.md](M1-SPIKE.md)) |
| M2 | Local mode: identity, storage, database and cache adapters. Start from the M1 findings: template cluster, launcher hardening, Redis-free readiness, no Drive at startup, local cache paths | `./verify.ps1` green, backend pytest, goldens unchanged, frozen selftest still passing. **Result:** all met, plus a real HTTP upload-to-report flow on the frozen package (see "M2 result") |
| M3 | Local frontend: static build served locally, fonts and Drive dependencies removed | Full flow with networking off. **Result:** met in a real Chromium against the frozen package (see "M3 result") |
| M4 | Package, clean-laptop test, student guide | Fresh Windows laptop from the Drive download to a visible dashboard. **Result:** package, guide, notices, hash and laptop kit done and proven from the extracted zip here; the laptop run is still open (see "M4 result") |

### M2 entry conditions (from the M1 review, 2026-09-20) — all closed

| Condition | How it was closed |
| --- | --- |
| Selftest must fail when it does no work | `student/src/selftest.py` asserts real media dimensions, requires images and a video, and requires each analytics result to hold a minimum of finite numbers (counts recorded in the JSON). Negative control: with a broken ffprobe it fails at `media_probe_and_ffmpeg` (it used to pass green with null dimensions). A ZIP with no video is rejected at ingest. |
| Second simultaneous launch | Single-instance mutex per data directory; a second launch opens the running app. Frozen `race` gate: two launches started together, one PostgreSQL, the other exits 0 with a message, no traceback. The app's port is bound before the server starts, so `free_port` no longer races it; PostgreSQL's port is retried when taken. |
| asyncio blind spot in the offline tripwire | `neurodatics.local.offline_guard` also patches both event loops' `sock_connect`. Unit-tested on the selector and proactor loops, and shown live inside the frozen runtime by the selftest. The served app now runs under it (`--offline-guard`) and under the TCP sampler: 0 blocked, 0 non-loopback connections in 86 samples. |
| Carry the launcher traps | All in `backend/src/neurodatics/local/postgres.py` (template copy, no piped `pg_ctl`, stale pid, own-`bin` pid check, UTC) and `student/run-frozen.ps1` (app-local VC++ runtime copied beside `pgsql/bin`; only checkable on a machine without it). |
| Dependency resolution | Ship the dev-venv resolution, because it is what `./verify.ps1` (goldens included) runs on. `student/requirements.txt` pins the direct dependencies; `student/check-pins.py` fails the build if any differs from the tested environment or from the build venv. |

### M2 result (2026-09-21)

- **Local mode** (`APP_MODE=local`): one fixed user, files under the data directory, in-process
  cache, no Google, Drive routes not mounted. Server mode is unchanged (884 backend tests, 24
  protected snapshots, `./verify.ps1` ALL GREEN).
- **Frozen package:** 697.6 MiB extracted (M1: 791.1; Google's libraries are gone from the freeze
  and from the build venv). Every gate in `student/run-frozen.ps1` passes: selftest, PostgreSQL
  lifecycle (including the loopback password and an interrupted first copy), the real HTTP flow,
  the double launch, and the served-app offline evidence.
- **The HTTP flow M1 could not run:** create project, upload the 278 MiB raw ZIP through the real
  route into the local store (68 files in 16 folders, READY, 6 participants), analytics with real
  numbers, image, video frame, heatmap, a GSR PDF report, delete (storage back to empty), and the
  Host/Origin guard answering 403. About 54 s for the ingestion on the strong dev machine.

Decisions taken in M2 that the owner may veto:

- **Data lives in `%LOCALAPPDATA%/NeuroDatics Estudiantes`, not beside the program.** A folder
  extracted into Downloads or Desktop is often OneDrive-synced, and syncing a live PostgreSQL
  directory corrupts it. Cost: deleting the extracted folder does not delete the students' data
  (matters for raw participant data; see the governance open item). `--data-dir` overrides it.
- **A random password on loopback PostgreSQL** (M1 finding 7), set before the server ever starts.
- **A Host/Origin guard instead of a login.** Without it any web page the student visits could
  call the API on loopback.
- **Refuse to run elevated** with a message, because PostgreSQL will not.

Still open after M2 (owner items, unchanged; see also "M3 result" below): the M1 proof gate on a clean machine, Smart App
Control, ffmpeg licence, classroom data size, governance. Implemented but not exercised on the
real thing: shutdown on console close, and the elevated refusal.

### M3 result (2026-09-21)

- **The web app in local mode.** `NEXT_PUBLIC_APP_MODE=local` makes `frontend/next.config.mjs` return a
  static export (no rewrites, no Node server); server builds get the config they always had. The
  backend serves the export from its own origin (`local/static_frontend.py`, mounted last in
  `main.py`, local mode only), so the browser needs no CORS, second port or proxy. It
  is 2.8 MiB in the package.
- **No account.** The provider asks the local backend for the one fixed session at load, again if the
  token ran out or the browser forgot it (`lib/auth/localAuth.ts`). The navigation has no
  Configuración link and no Salir; `/login` and `/configuracion` hand the student on to their own
  screens; a backend that is not answering shows "NeuroDatics no está disponible" with a retry button
  instead of a Google button.
- **Fonts.** Poppins (weights 400 to 700, Latin subset, SIL OFL) is served from `frontend/public/fonts`
  in **both editions**, replacing the Google Fonts import. Same typeface; the teacher edition no longer
  asks a third party for it either.
- **Drive thumbnails.** The three copies of the Drive thumbnail fallback are one function
  (`features/projects/driveFallbackUrl.ts`) that returns nothing in local mode, so a failed local
  image read shows the usual unavailable state and never a request to Google. Save, delete and
  progress messages that said "Google Drive" say "en este equipo" in local mode
  (`features/projects/storageCopy.ts`); the server edition's strings are unchanged.
- **Two backend gaps the browser found.** The catch-all site would have answered 404 for
  `GET /api/projects` (the app asks without the slash; Next's rewrite adds it in the server
  edition), and Next's page-data prefetch on a Windows export (`<page>/__next.<page>.__PAGE__.txt`)
  is written to a nested folder. Both are mapped in front of the site and tested.
- **A launcher flake the gates exposed.** Renaming the freshly copied database folder into place can be
  refused ("Access is denied") while a virus scanner or the search indexer still holds a copied file; it
  failed the double-launch gate once. The rename now waits and retries for up to 20 s (tested); a student's
  first launch on a machine with real-time scanning would have hit the same thing.
- **Build.** `student/build.ps1` builds the export and fails if it contains a value from
  `frontend/.env*` (the teacher's `.env.local` holds Google client ids) or a reference to a remote font
  or Google script.
- **Proof.** The `serve` gate now also drives the running frozen package in real Chromium with name
  resolution turned off for everything but loopback (`frontend/tests/local/student-offline.spec.ts`):
  3 of 3 pass: no account, Drive or Google anywhere; the session is minted again when it ran out; and the whole flow (wizard upload of the extracted experiment folder, demographics, stimulus images, EEG, GSR and eye-tracker analytics, delete) with 0 requests leaving the machine. Together with the HTTP flow and the TCP sampler the app made
  0 non-loopback connections in 184 samples. `./verify.ps1` ALL GREEN,
  898 backend tests, goldens untouched.

Decisions taken in M3 that the owner may veto:

- **Poppins is self-hosted for the teacher edition too**, rather than kept on Google Fonts there. It
  removes a build fork; the cost is 32 KiB of font files in `public/fonts`.
- **The local user is shown as "Estudiante".**
- **The app opens on the home page**, not straight on the project list.

Not covered by M3: the clean-machine, network-off proof gate (still the owner's), and everything in M4.
The browser check ran on this machine, where the VC++ runtime and a real network exist.

### M4 result (2026-09-21): prepared, laptop run still open

Everything that can be built and proven on this machine is done. The milestone's own proof, a fresh Windows
laptop from the Drive download to a visible dashboard, is not: it is the owner's, with a kit ready
([LAPTOP-TEST.md](LAPTOP-TEST.md)).

- **The file students get.** `student/package.ps1` adds the guide and the third-party notices to the assembled
  folder, zips it (one top-level folder, so "Extract all" cannot scatter files), writes `SHA256.txt` and
  `package-report.json`, then extracts that zip into an accented, spaced path and starts the app from it in an
  empty profile under the offline guard. Measured: 5,155 files, 700 MiB extracted, **270 MiB zipped** (M1: 284),
  longest relative path 96 characters (well inside the 260 limit for a normal Downloads folder), ready in 4 to 21 s
  from the extracted copy, clean exit, no PostgreSQL left, 0 blocked connections.
- **Student guide.** `student/LEEME.txt` (Spanish, shipped in the package): extract first, the SmartScreen "Más
  información / Ejecutar de todas formas" path and the "Unblock" checkbox, the black console window and closing it,
  where data lives and how to delete it, and what to send the teacher if it fails. **Provisional and unverified:**
  the SmartScreen wording (no fresh Windows machine here) and the requirement figures (8 GB RAM, 5 GB disk). The
  laptop run confirms or corrects both.
- **Notices.** `student/make-notices.py` writes `THIRD-PARTY-NOTICES.txt` from what is actually installed (Python
  and web libraries with their declared licences) and from the ffmpeg in `tools\`, whose GPL-versus-LGPL text is
  derived from its build banner rather than assumed.
- **A failed double-click stays readable.** A launch with no arguments that fails now prints the error, writes
  `logs\launcher-errors.log` in the data directory and waits for Enter, instead of a console that flashes and
  vanishes. Any argument (every gate) never waits. Tested in unit tests and on the frozen exe with a broken package.
- **Laptop kit.** `student/laptop-test.ps1` runs on the laptop in Windows PowerShell 5.1: machine facts (Windows
  build, RAM, disk, Smart App Control state, antivirus, C++ runtime, OneDrive, Mark of the Web, online or not),
  a real experiment through the app on a temporary data folder, peak memory, any connection leaving the machine,
  and a zip to send back. It ran here against the extracted zip (63 s for the real 278 MiB experiment, 0 connections,
  clean exit, 890 MiB peak across the app's processes) and a negative control (a file that is not a ZIP) makes it
  FAIL. Testing it in 5.1 caught a real bug: 5.1 reports no exit code without a held process handle, so it had
  reported a passing run as failed.
- **Proof on this machine.** Rebuilt frozen package: every gate in `run-frozen.ps1` passes (selftest, PostgreSQL
  lifecycle and adoption, HTTP flow, 3 of 3 real-Chromium offline specs, 0 non-loopback connections in 185 samples,
  double launch). `./verify.ps1` ALL GREEN, 901 backend tests, goldens untouched.

**Release blockers no script can close** (listed in `package-report.json`; the package is not to be distributed
until the owner has decided them):

1. **ffmpeg licence.** The bundled build is GPLv3. Shipping it requires its licence text in `tools\` (the
   `LICENSE` file from the build's own zip; not present in our copy) and a source offer, which the notices already
   state. The alternative is an LGPL build; the app only reads video dimensions and extracts one frame, so
   the selftest (real dimensions, real frame) would prove a swap. Owner decision.
2. **The laptop run** itself: SmartScreen, Smart App Control, antivirus, a machine with no developer tools, student
   RAM, console close and crash recovery on a real machine.
3. **Governance** of raw participant data handed to students, and the fact that their data outlives the deleted
   program folder (M2 decision, now stated in `LEEME.txt`).


## Suggested execution settings

Recommendations only; they do not change a running session.

| Work | Claude | Codex | Verification |
| --- | --- | --- | --- |
| M1 spike | Opus 5, high; the risks are design and packaging | Strongest coding model, high | Clean-profile offline run |
| M2 adapters | Sonnet 5, high; mechanical once the interfaces exist | High | `./verify.ps1`, backend pytest, characterization suite untouched |
| M3, M4 | Sonnet 5, medium to high | Medium to high | Offline end-to-end run, clean laptop |
