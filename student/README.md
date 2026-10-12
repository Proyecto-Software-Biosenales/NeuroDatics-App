# Student edition: build and gates

The offline student edition is the backend in `APP_MODE=local`, frozen with PyInstaller next to
an embedded PostgreSQL 16, ffmpeg and the web app as a static export (`frontend/`) that the backend serves. Plan and decisions: [`docs/student/PLAN.md`](../docs/student/PLAN.md).
Run-time code lives in the backend (`backend/src/neurodatics/local/`); this folder holds only what
builds and checks the package.

| File | What it is |
| --- | --- |
| `requirements.txt` | Direct dependencies, pinned to what the backend tests run on. No Google libraries. |
| `requirements-frozen.txt` | `pip freeze` of the build venv that produced the tested package. |
| `check-pins.py` | Fails when a pin differs from the tested environment (`.venv`) or from the build venv. |
| `build.ps1` | Builds the web app (`NEXT_PUBLIC_APP_MODE=local`, output in `frontend/.next-local`, copied to `<Work>/frontend`) and freezes `src/student_entry.py` into `<Work>/dist/neurodatics-estudiantes`. |
| `run-frozen.ps1` | Assembles the package folder (PostgreSQL, template, ffmpeg and web app inside `_internal`; dropping test suites, headers, link libraries and PostgreSQL's GUI and test programs), then runs the gates below against it. |
| `package.ps1` | Adds the guide (beside the exe) and the notices (in `_internal`), hides `_internal`, zips the package to `<Work>/release/`, writes `SHA256.txt` and `package-report.json`, starts the app from the extracted zip (accented path, empty profile) and lays out `delivery\`. |
| `LEEME.txt` | The student guide (Spanish), shipped inside the package. Edit it here, not in the package. |
| `make-notices.py` | Writes `THIRD-PARTY-NOTICES.txt` from the build venv, `frontend/package.json` and the ffmpeg actually in `tools\`. |
| `laptop-test.ps1` | Runs on the test laptop (Windows PowerShell 5.1): machine facts, a real experiment through the app, memory and connection sampling, a zip to send back. |
| `src/` | The frozen entry point and the checks it carries: `selftest`, `pg-check`, `pg-adopt`, `http-check`. |

## Build and check

The web build needs Node with the frontend's `node_modules` installed. The browser part of the `serve`
gate also needs Chromium once: `cd frontend; npx playwright install chromium`.

Inputs live in `<Work>` (default `output/student`, git-ignored): a `build-venv` made from
`requirements-frozen.txt`, `tools/` (`ffmpeg.exe`, `ffprobe.exe`), the `bin`/`lib`/`share` folders of the
EDB PostgreSQL 16 zip (`pgsql/`, or `-PgSource`), a cluster template (`%TEMP%\ndtest\pg-template`, made with
`initdb -A trust -U postgres -E UTF8 --locale=C` **from an ASCII path**), and `data/saio-raw.zip`, a raw
experiment ZIP with images and a video (private data, never committed).

```powershell
student\build.ps1 -Work output\student
student\run-frozen.ps1 -Work output\student -Assemble
student\run-frozen.ps1 -Work output\student            # all gates, or -Only selftest|pg|serve|race
```

Evidence is written to `<Work>/frozen-results/` (`selftest.json`, `pg-check.json`, `http-check.json`,
`browser.out.txt`, `serve-evidence.json`). The gates:

- **selftest**: real ingestion, analytics, reports and media in the frozen runtime. It fails on an empty
  result, null media dimensions, a fixture without a video or images, or any non-loopback connection
  attempt; the guard behind that last check is proven live inside the runtime first.
- **pg**: template copy, loopback password, migrations, advisory lock, JSONB merge, clean stop, crash
  recovery, adoption of a running server, an interrupted first copy.
- **serve**: the real app in a brand-new empty profile, under an offline guard and a TCP connection
  sampler, driven twice. First through its HTTP routes with a real ZIP (web app served from the same
  origin, session, upload, analytics, media, report, delete). Then in a real Chromium whose name
  resolution is off for everything but loopback (`frontend/tests/local/student-offline.spec.ts`): no
  account or Drive screens, the fonts, a wizard upload of the extracted experiment folder, its images,
  live analytics and deleting the project, failing on any request that leaves the machine.
- **race**: two launches started at the same instant on one data directory.

The paths deliberately contain accents and spaces. None of this is the clean-machine, network-off proof
gate ([`docs/student/LAPTOP-TEST.md`](../docs/student/LAPTOP-TEST.md)), which needs a machine this one is not.

## Package and test on a laptop (M4)

```powershell
student\package.ps1 -Work output\student -Version 0.1        # after build.ps1 and run-frozen.ps1 -Assemble
student\run-frozen.ps1 -Work output\student -Pkg "<release-check\...\NeuroDatics Estudiantes>" -Only serve   # optional: the full gate on the extracted zip
```

The package a student opens shows two files and nothing else:

```text
NeuroDatics Estudiantes\
    neurodatics-estudiantes.exe
    LEEME.txt
    _internal\          hidden: Python runtime, pgsql\, pg-template\, tools\, frontend\, THIRD-PARTY-NOTICES.txt
```

`run-frozen.ps1 -Assemble` puts the parts inside PyInstaller's `_internal` and the launcher finds them through
`sys._MEIPASS` (`neurodatics.local.launcher.package_dir`; a folder with `pgsql` beside the exe still works).
`package.ps1` marks `_internal` hidden in the folder and in the zip (Explorer's "Extract all" restores it), and the
launcher hides it again on start for extractors that drop the flag.

`package.ps1` makes `delivery\NeuroDatics-Estudiantes\` (git-ignored, next to the teacher edition's
`delivery\NeuroDatics-App`) that program folder itself, and puts the zip beside it as
`delivery\NeuroDatics-Estudiantes-<Version>-win64.zip`, removing older ones (`-NoDelivery` skips this). The
maintainer's files stay in `<Work>\release`: the zip, `SHA256.txt`, `laptop-test.ps1` and `package-report.json`,
whose `release_blockers` lists what no script can settle (ffmpeg licence, governance, the real-laptop run). The by-hand
procedure for the laptop is [`docs/student/LAPTOP-TEST.md`](../docs/student/LAPTOP-TEST.md). A double-clicked launch
(no arguments) that fails prints the error, writes `logs\launcher-errors.log` in the data directory and waits for
Enter; runs with arguments (every gate) never wait.

## The web app in local mode

`frontend/next.config.mjs` returns a static export config when `NEXT_PUBLIC_APP_MODE=local` (server
builds are untouched). `build.ps1` fails if the export contains a value from `frontend/.env*` or a
reference to a remote font or Google script. By hand:

```powershell
cd frontend
$env:NEXT_PUBLIC_APP_MODE = 'local'; npx next build      # writes frontend/.next-local
```

The same spec runs against any live local app, including one started from source:

```powershell
$env:STUDENT_BASE_URL = 'http://127.0.0.1:8765'
$env:STUDENT_RAW_FOLDER = '<extracted raw experiment folder>'   # private data; the full-flow test is skipped without it
npx playwright test -c playwright.local.config.ts
```

## Run the app from source (no freezing)

```powershell
cd backend
$env:PYTHONPATH = 'src'
..\.venv\Scripts\python.exe -m neurodatics.local --pkg <folder with pgsql, pg-template, tools, frontend> --data-dir <dir> --no-browser
```

`pg-adopt` continues the data root a previous `pg-check --leave-running` left behind. `--help` lists the options (`--port`, `--offline-guard`, `--exit-after`, `--stop-file`).

## Why it is built this way

Each decision below is in the code it describes (`backend/src/neurodatics/local/`, `student/*.ps1`),
and exists because a simpler option was tried or ruled out.

**The same PostgreSQL 16, embedded, instead of a lighter database.** The app's SQL is not portable:
the project mutation lock is a PostgreSQL advisory lock, the analytics transform tokens are merged
with the JSONB `||` operator, and a third of the migrations name PostgreSQL types. A different engine
would mean rewriting those and re-proving them against the goldens, so the student edition ships the
EDB build of the same server as a second process and the application code stays untouched. Migrations
run on every start, which is why a migration must not use an extension the EDB zip does not carry.

**The cluster is copied from a template, never created on the student's machine.** `initdb` fails from
a path with non-ASCII characters, and a student's user folder may well have one. `pg-template` is built
elsewhere with `initdb -A trust -U postgres -E UTF8 --locale=C` from an ASCII path and copied on first
launch. The copy is assembled under a `.building` name and renamed into place, so an interrupted first
launch leaves nothing that looks like a cluster; the rename waits and retries, because a virus scanner
or the search indexer can still hold the files it just copied. The cluster is secured before it ever
accepts a connection: a random password set with the server stopped, and a `pg_hba.conf` with nothing
but loopback and `scram-sha-256`. The server always starts in UTC, whatever timezone the template was
built in, and readiness is polled with `pg_isready` rather than trusted from `pg_ctl -w`, because a
stale `postmaster.pid` still reports success while crash recovery is starting.

**A running server is adopted, not fought.** A launcher that died leaves its postmaster running. The
next launch reads the pid file, accepts the pid only when it is a live `postgres.exe` from our own
`bin` (pids are reused and the machine may run other servers), takes the port from the file and
continues with that server. A second launch on the same data directory does not start a second server
either: the instance lock makes it open the running app and exit.

**Everything lives in the user's profile, not beside the program.** A folder extracted into Downloads
or Desktop is often synced by OneDrive, and syncing a live database directory corrupts it, so the data
root is `%LOCALAPPDATA%\NeuroDatics Estudiantes` (`--data-dir` overrides). The cost is deliberate and
documented in the guide: deleting the extracted program folder does not delete the student's projects.

**The web app is a static export served by the backend itself.** One origin means no CORS, no second
port and no proxy: the pages call `/api/...` on the address they were loaded from. The site is mounted
last so every API route wins over its catch-all, and two Windows-export details are mapped in front of
it: the collection route the app requests without a trailing slash, and Next's page-data prefetch,
which a Windows export writes into a nested folder.

**Everything listens on 127.0.0.1, and there is no login.** The app's port is bound to loopback before
the server starts, so no other program can take it in between, and PostgreSQL is started with
`listen_addresses=127.0.0.1`. Without accounts, the only thing keeping another web page from driving
the API is that a browser cannot name a loopback `Host` it does not own, nor send an `Origin` that
differs from the one it was served from: local mode refuses both. The offline guard is the other half
of the promise, and it is a check rather than a defence: it refuses and records every non-loopback
connection the process attempts, hooking the socket module and asyncio's `sock_connect` on both loop
classes, because the default Windows loop connects through `ConnectEx` and never calls
`socket.connect`. It cannot see ffmpeg, Typst or another process, so the gates also sample the
operating system's connection table. In local mode the Google routes are not even imported, the cache
is in-process (no Redis to be down) and files go through the local storage client, so there is nothing
left that wants the network.

**Frozen with PyInstaller as one directory, and everything travels inside `_internal`.** A student sees
`neurodatics-estudiantes.exe` and `LEEME.txt`; PostgreSQL, its template, ffmpeg, the web app and the
notices sit in the runtime's own folder, which the launcher finds through `sys._MEIPASS` and re-hides
on start for extractors that drop the hidden flag. ffmpeg travels because the stimulus probe looks for
`ffprobe` on `PATH`, which the launcher points at the bundled `tools`; the Visual C++ runtime travels
beside `pgsql\bin` because the PostgreSQL binaries need it and a student's machine may not have it.
The app also refuses to run elevated, with a message, because PostgreSQL will not run under an
administrator token.
