# Clean-machine test: closes the M1 proof gate

Written 2026-09-20. The scripts in this folder were syntax-checked but **not run**: Hyper-V was not
installed on the machine they were written on. Expect small fixes on first use.

## Once

1. Elevated PowerShell: `.\setup-host.ps1`. Restart Windows, sign out and in, restart VS Code
   (so new sessions, including Claude Code, carry the "Hyper-V Administrators" group).
2. Get a Windows 11 ISO (Enterprise evaluation, or the normal ISO left unactivated). Do **not** use
   Hyper-V's "Windows 11 dev environment": it ships Visual Studio and runtimes and hides the VC++ gap.
3. `.\new-vm.ps1 -Iso <path>`, then `Start-VM nd-student; vmconnect localhost nd-student`; press a key
   to boot the DVD.
4. Install Windows 11 with the offline or local-account route. First account `Nuñez` (administrator, like a
   student's laptop) with a throwaway password, so the profile path contains `ñ`. Install nothing
   else. If the accent breaks PowerShell Direct, add an ASCII administrator `ndtest` and use that one.
5. `. .\vm-lib.ps1; Save-NdGuestCredential` (the guest account and password, stored encrypted for your
   Windows user only). At the desktop: `Wait-NdGuest; New-NdClean`.

## Who drives what

- **Claude can** (PowerShell Direct, no guest network): copy files in, extract, run the exe's
  `selftest`, `pg-lifecycle`, `pg-adopt`, `serve`, read the result JSON, cut and restore the network,
  checkpoint and restore, read processes and event logs in the guest.
- **Claude cannot** see or click the guest screen: SmartScreen, Smart App Control, Explorer's extract
  and the browser are yours to watch. Tell me what appeared, or ask me to add a screenshot helper
  through the Hyper-V thumbnail API once the VM exists.

## Package and inputs (on the host)

- Package: `tar -a -cf C:\ndvm\package.zip -C "output\student-m1\Estudiantes ñandú" "NeuroDatics Estudiantes"`
  (about 284 MiB). Or upload it to Drive and download it in the guest for the real Mark of the Web.
- Raw ZIP to process: `output\student-m1\data\saio-raw.zip`.
- Copy both with `Copy-ToNdGuest`. Mark the package like a browser download before extracting:
  `Set-Content -Path <zip> -Stream Zone.Identifier -Value "[ZoneTransfer]`r`nZoneId=3"`.
  `Expand-Archive` and `tar` do not pass the mark on; **Explorer's extract does**, so extract by hand
  when the SmartScreen behaviour matters.

## Runs (each starts with `Restore-NdClean`)

| # | RAM | Change | Expected |
| --- | --- | --- | --- |
| 1 | 4 GB | none | `selftest` passes. `pg-lifecycle` and `serve` **fail at the PostgreSQL start** with a missing `VCRUNTIME140.dll`. That confirms finding 4. |
| 2 | 4 GB | copy `_internal\VCRUNTIME140.dll` and `VCRUNTIME140_1.dll` into `pgsql\bin` | all three commands exit 0 with `all_ok: true` |
| 3 | 8 GB | as run 2 (`new-vm.ps1 -MemoryGB 8 -Name nd-student-8gb`, then change `$global:NdVm`) | as run 2; compare times |

In every run: `Set-NdNetwork Offline` **before the first launch of the exe**, and confirm in the guest
that `Test-Connection 1.1.1.1 -Count 1` fails. Then, inside `Invoke-NdGuest { ... }`:

```powershell
$pkg = "$env:USERPROFILE\Downloads\NeuroDatics Estudiantes"; $out = "$env:LOCALAPPDATA\nd"
& "$pkg\neurodatics-m1.exe" selftest --zip "$env:USERPROFILE\Downloads\saio-raw.zip" --workdir "$out\work" --out "$out\selftest.json"
& "$pkg\neurodatics-m1.exe" pg-lifecycle --data-root "$out\data" --out "$out\pg.json" --leave-running
& "$pkg\neurodatics-m1.exe" pg-adopt --data-root "$out\data" --out "$out\adopt.json"
```

**Pass:** exit 0 and `all_ok: true` in each JSON; `network_attempts_blocked` empty; no `postgres.exe`
left; the analytics digests equal those in `output\student-m1\results-unfrozen.json`.

## Then, if you want them

- Switch Smart App Control to On in Windows Security (a clean install starts in evaluation mode) and
  repeat run 2. Write down whether the exe or its children are blocked.
- Launch the exe elevated ("Run as administrator") and run `pg-lifecycle`. PostgreSQL refuses an
  administrator token; record whether `pg_ctl` drops privileges as expected.
- Add a standard (non-admin) user and repeat run 2 as that user.

## Record

Put wall times, peak memory and every failure in [../../M1-SPIKE.md](../../M1-SPIKE.md), move the
proof gate from "Not proven" to a result, and update the plan's M1 row and the ledger.
