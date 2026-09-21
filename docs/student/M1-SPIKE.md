# Student edition — M1 feasibility spike

Run 2026-09-20 on branch `dashboard`. Plan: [PLAN.md](PLAN.md). Ledger: [LEDGER.md](LEDGER.md).
Scripts to reproduce: [m1-spike/](m1-spike/) (see "Reproduce" at the end).

## Outcome

- **Feasible.** A frozen Windows x64 runtime ingests a real 278 MiB raw experiment ZIP, computes the
  analytics, renders the Typst reports, runs ffmpeg/ffprobe, and serves the real FastAPI app on an
  embedded PostgreSQL 16. Results are numerically identical to the unfrozen app.
- **Database decision: embedded PostgreSQL 16, confirmed.** SQL, all 26 migrations, the advisory lock
  and the JSONB token merge run unchanged. The SQLite fallback is not needed.
- **Proof gate not fully met.** The plan asks for a clean Windows profile with networking off. That
  is not possible here (Windows Sandbox is not installed, the session is not elevated, and cutting
  the network would end this session). What was run instead is listed under "Offline evidence"; the
  literal proof still needs a clean machine or VM.

## What was run

The harness runs the same services the upload route and dashboard use (ZIP validation and extraction,
`CsvProcessingService`, EEG/GSR/pupil/heatmap analytics, the three device report builders and
`PDFAdapter`, `probe_stimulus`, ffmpeg frame extraction), minus Google Drive and auth, which are M2 work.
The HTTP upload route itself was not exercised because it is hardwired to Drive.

- Input: the private SAIO folder zipped like the browser does (STORE), 278.4 MiB: one 58 MiB CSV,
  7 images, a 120 MiB video, 7 acquisition recordings. Not committed; `output/` is git-ignored.
- Build: PyInstaller 6.22.3 onedir on Python 3.14.3, isolated venv, pins copied from the root venv
  ([requirements-frozen.txt](m1-spike/requirements-frozen.txt)). The teacher app was not modified.
- Run conditions: package extracted to a path with accents and spaces
  (`...\Estudiantes ñandú\NeuroDatics Estudiantes`), `PATH` reduced to System32, working directory
  elsewhere, so nothing came from the repo venv, Python or Chocolatey.
- Machine: Ryzen 7 9700X, 16 threads, 31.7 GB RAM, Windows 11 Pro. **Much stronger than a student laptop.**

## Results

### Size (MiB)

| Component | Uncompressed | In the zip |
| --- | --- | --- |
| Frozen runtime (`_internal` 415.8 + exe 26.8) | 442.5 | 164.8 |
| ffmpeg + ffprobe | 189.1 | 70.3 |
| PostgreSQL 16.13 server (`bin` 71.8, `lib` 25.3, `share` 23.1) | 120.2 | 42.8 |
| Initialised cluster template | 39.2 | 4.5 |
| **Package** | **791.1** | **283.6** (deflate 6, what Explorer can extract; includes zip headers) |

Largest runtime items: `googleapiclient` 92.2 (Drive only, removable in M2), `pyarrow` 78.9, `typst` 59.2,
`scipy` 49.4 + 19.3 libs, `numpy.libs` 20.0. A cluster after migrations is 47.6 MiB before any project data.

### Real work, frozen, on the strong machine

| Step | Result |
| --- | --- |
| ZIP validation + extraction | 0.1 s |
| CSV processing | 51.7 s for the 58 MiB CSV: 6 participants, 54 scenario Parquets, 26.6 MiB |
| 8 analytics computations (EEG x4, GSR x2, pupil, heatmap), 9 digests | 0.8 s |
| ffprobe + ffmpeg frame extract on the real video | 0.1 s (416x832, 60 fps, 84.9 s) |
| 3 Typst reports | GSR 1.2 s, EEG 2.5 s, Eye tracking 2.5 s |
| Peak working set, whole run | 677 MiB (unfrozen 638) |
| Same run pinned to 4 logical cores, empty profile | 59.6 s wall, so ingestion is single-threaded |
| App start to first `/health` | 5.7 s on first launch (cluster copy, PG start, migrations, import) |
| Idle memory | 7 postgres processes 23 MiB private; API process 269 MiB working set |

**Equivalence with the unfrozen app:** all 9 analytics digests identical, video probe identical, the
three PDFs the same byte length. All 43 OpenAPI paths import in the frozen app.

### Embedded PostgreSQL lifecycle (frozen launcher, accented path)

| Check | Result |
| --- | --- |
| First start from the template | 0.34 s to accepting connections, UTF8, `127.0.0.1` only, random free port |
| 26 migrations to head `025` | about 1 s, 13 tables; re-run 0.06 s |
| `pg_try_advisory_xact_lock` (real `project_mutation_lock`) | second holder refused, acquired after release |
| JSONB `\|\|` token merge (real `transform_token_update`) | P1 and P2 merged, stale generation ignored |
| Clean stop | 0.2 to 2.1 s (depends on the shutdown checkpoint), control state `shut down`, pid file removed |
| Killed server (`taskkill /F /T`) | restart in 7.2 s, "automatic recovery in progress" logged, 20,000 committed rows kept, uncommitted row absent |
| Second launch while running | adopts the running server; a raw second `pg_ctl start` is refused by PostgreSQL |
| Launcher dies, server left running | next launch adopts it, then stops it cleanly |
| After every run | no postgres process left behind |

### Offline evidence (substitute for the clean-profile, network-off proof)

- Python-level socket tripwire in every run: **0** non-loopback connects or DNS lookups.
- Fresh empty profile (`USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP` redirected), 4 cores: passes,
  and 64 samples of every TCP connection owned by any package process show **0** non-loopback ones.
- Limits: the tripwire does not cover native code (ffmpeg, Typst); sampling can miss a short
  connection; VC++ runtime, .NET and Defender are installed here.

## Findings that change M2 to M4

Each trap below was hit for real; the fix is in the launcher prototype
[m1_pg.py](m1-spike/src/m1_pg.py) and was re-tested.

1. **`initdb` fails when the install path has non-ASCII characters** (`invalid byte sequence for encoding
   "UTF8"`): the share path is embedded in SQL as ANSI bytes. Starting an existing cluster from the
   same path works, an accented data directory works, an 8.3 short path works. Spanish user folders
   make this realistic. Fix: ship a pre-initialised cluster template built by `initdb` in an ASCII
   path and copy it on first launch; never run `initdb` on the student's machine.
2. **`pg_ctl start` hangs a parent that reads its output.** The postmaster inherits the pipe. Start it
   with stdin, stdout and stderr on files or NUL.
3. **After a hard kill `pg_ctl start -w` reports success too early**: the stale `postmaster.pid` still
   says "ready", and the next connection gets "the database system is starting up". Fix: delete the
   pid file only if its pid is not a live `postgres.exe` from our own `bin` folder (pids are reused and
   an unrelated PostgreSQL server is also running on this machine), then poll `pg_isready`.
4. **The PostgreSQL binaries need the Visual C++ runtime, and the EDB zip does not ship it.** 44
   executables import `vcruntime140.dll`. It is installed system-wide here, so this machine cannot
   show the failure; a laptop without the redistributable would fail to start PG. Ship
   `vcruntime140.dll` and `vcruntime140_1.dll` beside `pgsql\bin` (the frozen runtime already carries
   copies) and verify on a clean machine. ffmpeg is static and needs no VC++.
5. **The template inherits the builder's timezone** (`America/Bogota`). Start with
   `-c timezone=UTC -c log_timezone=UTC`, which matches the Docker default.
6. **Closing the console or killing the launcher orphans the server.** Handled by adopting it through
   `postmaster.pid` (port is line 4); tested across separate launches.
7. **Loopback trust authentication.** Any local process or user can connect. M2 should set a random
   per-install password and use `scram-sha-256`; small, but not done in the spike.
8. **App assumptions found by running the real app frozen (M2 scope):**
   `/health/ready` returns 503 because Redis is absent (3 s timeout); `upload_recovery_loop` touches the
   Drive client at startup; cache directories default to Docker paths (`/data/...`); the `.env` and
   `auth_users.json` paths resolve next to the package.
9. **The freeze build can pass and still fail at run time.** matplotlib chooses `backend_svg` by name, so
   the first report failed with `ModuleNotFoundError` until it became a hidden import. The frozen
   selftest is the safety net; extend it whenever M2 adds a code path.
10. **ffmpeg licence.** The build used is Gyan "essentials" 8.0.1: `--enable-gpl --enable-version3`,
    99 MiB each for ffmpeg and ffprobe. Redistributing it carries GPL obligations. The app only reads
    dimensions and extracts one frame, so an LGPL build should be enough. Decide before M4.

## Not proven

- **Clean Windows profile with networking off.** See the outcome above. Needs a VM or a fresh laptop;
  the Hyper-V setup, helpers and test procedure are in [m1-spike/vm/CHECKLIST.md](m1-spike/vm/CHECKLIST.md)
  (written, not yet run).
- **SmartScreen, Smart App Control, antivirus.** Smart App Control is Off here. Defender real-time
  protection was on and did not interfere with any of about ten launches. A file from a Drive download
  carries Mark of the Web; on a fresh Windows 11 install with Smart App Control on, unsigned apps can be
  blocked with no "run anyway" option. Test on a fresh Windows 11 laptop before promising
  "unsigned, with a guide".
- **Elevated launch.** PostgreSQL refuses an administrator token; `pg_ctl` is meant to drop
  privileges. Not tested (session not elevated).
- **Student hardware and larger data.** One dataset shape (EEG, GSR, eye tracker; one 58 MiB CSV).
  No low-RAM run; peak was 677 MiB for that CSV, and how it scales was not measured. Other reference
  experiments (Bugui, Realidad Completo) were not run.
- The HTTP routes with local storage (they need M2).

## Reproduce

Copy [m1-spike/](m1-spike/) to `output/student-m1/` (git-ignored), then: create a venv there named
`build-venv` and `pip install -r requirements-frozen.txt`; place `ffmpeg.exe` and `ffprobe.exe` in
`tools/`; extract the `bin`, `lib` and `share` folders of the EDB PostgreSQL 16 Windows zip into a
`pgsql` folder and build the template with `initdb -A trust -E UTF8 --locale=C` from an ASCII path;
run `build.ps1`, then `run-frozen.ps1 -Assemble` and `run-frozen.ps1` (`-Only selftest|pg|serve|offline`).
[dll_audit.py](m1-spike/dll_audit.py) lists imported DLLs a clean Windows may lack, and
[pg-path-matrix.ps1](m1-spike/pg-path-matrix.ps1) reproduces the non-ASCII path failure.
Local evidence (not committed, contains private-dataset names): `output/student-m1/results-unfrozen.json`
and `output/student-m1/frozen-results/`.
