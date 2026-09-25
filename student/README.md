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
| `run-frozen.ps1` | Assembles the package folder, then runs the gates below against it. |
| `package.ps1` | Adds the guide and notices, zips the assembled package to `<Work>/release/`, writes `SHA256.txt` and `package-report.json`, and starts the app from the extracted zip (accented path, empty profile). |
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
gate (`docs/student/m1-spike/vm/CHECKLIST.md`), which needs a machine this one is not.

## Package and test on a laptop (M4)

```powershell
student\package.ps1 -Work output\student -Version 0.1        # after build.ps1 and run-frozen.ps1 -Assemble
student\run-frozen.ps1 -Work output\student -Pkg "<release-check\...\NeuroDatics Estudiantes>" -Only serve   # optional: the full gate on the extracted zip
```

`package.ps1` also lays the delivery out in `delivery\NeuroDatics-Estudiantes\` (git-ignored, next to the teacher
edition's `delivery\NeuroDatics-App`): the ready-to-run `NeuroDatics Estudiantes` folder, the zip, `SHA256.txt`,
`laptop-test.ps1`, `package-report.json` and `LAPTOP-TEST.md` (`-NoDelivery` skips it). The release folder
(`<Work>\release`) holds the zip, `SHA256.txt`, `laptop-test.ps1` and `package-report.json`, whose
`release_blockers` lists what no script can settle (ffmpeg licence, governance, the real-laptop run). The by-hand
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
