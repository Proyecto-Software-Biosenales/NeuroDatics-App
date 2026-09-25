# Laptop test (M4 proof gate, and the M1 clean-machine gate with it)

Prepared 2026-09-21. This is the one thing left that only a real laptop can settle: SmartScreen, Smart App
Control, antivirus, a machine without developer tools, and student-class RAM. One run covers both the M1
"clean Windows profile, networking off" gate and the M4 "fresh laptop, Drive download to a visible dashboard" gate.

## What to bring

Everything is in `delivery\NeuroDatics-Estudiantes\` (git-ignored; made by `student\package.ps1`, see
[../../student/README.md](../../student/README.md)). The `NeuroDatics Estudiantes` folder there is the ready-to-run
app; the zip holds the same folder and is what goes on Drive:

| File | Use |
| --- | --- |
| `NeuroDatics-Estudiantes-<version>-win64.zip` | The package. Upload it to Drive and download it **from Drive on the laptop**, so the real "Mark of the Web" and any Drive or Edge warnings are part of the test. |
| `SHA256.txt` | Compare after download: `Get-FileHash <zip>` must print the same hash. |
| `laptop-test.ps1` | The automatic part (below). Copy it to the laptop separately (USB or Drive). |
| a raw experiment ZIP | Private data, never committed. The same kind students will upload. |

Best laptop: a Windows 11 machine that has never had developer tools, ideally 8 GB RAM or less, on the
default Windows Security settings. A second run on a 4 GB machine or a Smart App Control **On** machine answers
the open items in [PLAN.md](PLAN.md).

## By hand (about 30 minutes). Write down what you see, especially anything unexpected

1. **Download** the zip from Drive. Note any Drive "can't scan for viruses" page and any Edge/Chrome
   "not commonly downloaded" warning, and what you had to click.
2. **Hash.** `Get-FileHash` against `SHA256.txt`.
3. **Extract** with Explorer: right click, "Extract all". Time it (about 5,000 files) and note whether Defender slows it.
4. **Read `LEEME.txt`** in the extracted folder. Is every step true on this machine? Note each place it is not.
5. **Cut the network:** airplane mode, then check a browser cannot open any site.
6. **Double-click `neurodatics-estudiantes.exe`.** This is the SmartScreen moment. Record the exact wording,
   the buttons offered, and whether "Ejecutar de todas formas" exists. If Smart App Control blocks it with no
   way through, stop and record that; it is the plan's biggest open risk. Then note: the black console window,
   the seconds until the browser opens, which browser, any antivirus pop-up or scan delay.
7. **Use it:** home page, Proyectos, "Crear nuevo proyecto", upload the raw ZIP, wait for processing (time it),
   open the Dashboard (EyeTracker, GSR, EEG), a report, a stimulus image and the video preview. Watch Task Manager
   for memory and any freeze.
8. **Second launch:** with the app open, double-click the exe again. It should open the running app, not a second copy.
9. **Close the console window.** Within about 10 seconds Task Manager must show no `postgres.exe` or `neurodatics-estudiantes.exe`.
10. **Open the exe again.** The project from step 7 must still be there.
11. **Crash:** open the exe, then in Task Manager end `neurodatics-estudiantes.exe` (End task). Open the exe again. It
    should start normally. (This proves PostgreSQL recovers on a real machine.)
12. **Elevated:** right click the exe, "Run as administrator". It must say it cannot run as administrator and wait for
    Enter; it must not leave anything running.
13. **Failure screen:** with the app closed, rename `pgsql` inside the folder to `pgsql-x`, double-click the exe.
    It should print a message in Spanish, name a log file, and wait for Enter instead of vanishing. Rename it back.

## Automatic part (about 5 minutes)

Close the app first, then in a normal (not administrator) PowerShell in the folder that holds `laptop-test.ps1`:

```powershell
powershell -ExecutionPolicy Bypass -File .\laptop-test.ps1 -Package "<the extracted NeuroDatics Estudiantes folder>" -RawZip "<raw experiment.zip>"
```

It records the machine (Windows build, RAM, free disk, Smart App Control state, antivirus, C++ runtime, whether the
package sits in OneDrive, whether the exe carries the Mark of the Web, whether the machine was online), starts the app on a
temporary data folder, runs the whole flow over HTTP with your ZIP, samples peak memory and any connection that leaves the
machine, stops the app, and writes `resultados\prueba-<pc>-<time>.zip`. Send that zip back. It ends with
`AUTOMATIC CHECKS: PASSED` or `FAILED`.

## Pass criteria

- Steps 6 to 11 work with the network off, and the automatic checks pass.
- SmartScreen only needs "Más información" then "Ejecutar de todas formas", as `LEEME.txt` says. If wording or buttons
  differ, the guide is edited to match (it cannot be written from here: no fresh Windows machine was available).
- No connection leaves the machine; nothing is left running after step 9.

A failure is a result: record it and send the report. Do not retry until it passes and report only that.

## After the run

Send me the result zip and your notes from the by-hand steps. I will then:

- record the run in [M1-SPIKE.md](M1-SPIKE.md), the [ledger](LEDGER.md) and the M1 and M4 rows of [PLAN.md](PLAN.md);
- correct `LEEME.txt` where the laptop disagreed (the RAM and disk figures in it are provisional until a real run measures them);
- update the open items that the run settles: Smart App Control, student RAM, antivirus behaviour, real ZIP size.

Still needs a decision from you before a real release, because no test can make it: whether the GPL ffmpeg build is
acceptable (or to switch to an LGPL build), and that governance of raw participant data is handled. `student\package.ps1`
lists them as release blockers in `package-report.json` until they are closed.
