# Student edition — plan (v2, approved)

Status: **APPROVED as written by the owner, 2026-09-20 (M0 closed)**. **M1 done except its proof
gate** (clean Windows profile, networking off): feasible, embedded PostgreSQL confirmed. Results:
[M1-SPIKE.md](M1-SPIKE.md). Next: M2.
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
| Frontend | Static export compiled in an isolated copy | Served by the local backend; drop Google Fonts and Drive thumbnails | Low to medium |
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
| M2 | Local mode: identity, storage, database and cache adapters. Start from the M1 findings: template cluster, launcher hardening, Redis-free readiness, no Drive at startup, local cache paths | `./verify.ps1` green, backend pytest, goldens unchanged, frozen selftest still passing |
| M3 | Local frontend: static build served locally, fonts and Drive dependencies removed | Full flow with networking off |
| M4 | Package, clean-laptop test, student guide | Fresh Windows laptop from the Drive download to a visible dashboard |

### M2 entry conditions (from the M1 review, 2026-09-20)

M1's finding 9 promotes the frozen selftest to a gate, so the gate has to be trustworthy before M2
leans on it. Full detail in [M1-SPIKE.md](M1-SPIKE.md), "Gaps found reviewing the spike".

- **Make the selftest fail when it does no work.** Assert the probed media dimensions are real,
  fail when the fixture carries no video instead of skipping the ffmpeg branch, and assert each
  analytics result is non-empty. Today a missing ffprobe or an empty result set still shows green,
  and the frozen-versus-unfrozen digest comparison cannot see it.
- **Harden the launcher for a second simultaneous launch.** A student double-clicking the `.exe`
  twice currently races in `ensure_cluster` and `free_port`; PostgreSQL stops the second postmaster,
  but as a traceback. Take a single-instance lock, adopt or exit with a message.
- **Close the offline tripwire's asyncio blind spot before M3.** M3's proof is a full flow with
  networking off, and the served app is the async one; the current tripwire only sees synchronous
  connects. Guard `loop.sock_connect` as well, or wrap the served run in the TCP sampler.
- Carry the launcher traps M1 already fixed (template cluster, no piped `pg_ctl`, stale pid file,
  app-local VC++ runtime, UTC template) into product code rather than re-deriving them.
- Decide which dependency resolution the student package ships: the freeze inherited the dev venv
  (pyarrow 25.0.0), not `backend/poetry.lock` (16.1.0, constraint `^16.0.0`).

## Suggested execution settings

Recommendations only; they do not change a running session.

| Work | Claude | Codex | Verification |
| --- | --- | --- | --- |
| M1 spike | Opus 5, high; the risks are design and packaging | Strongest coding model, high | Clean-profile offline run |
| M2 adapters | Sonnet 5, high; mechanical once the interfaces exist | High | `./verify.ps1`, backend pytest, characterization suite untouched |
| M3, M4 | Sonnet 5, medium to high | Medium to high | Offline end-to-end run, clean laptop |
