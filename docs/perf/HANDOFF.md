# Performance campaign completion handoff

Updated 2026-09-15. The user requested reviewing recent commits for performance effects
and finishing the remaining `docs/perf` plan, superseding the previous safe-exit stop.

## Implementation

- Steps **1–6 and 8a** were already integrated and remain intact after `e5634d5`,
  `9ddd2af` and `61a0bf0`. The upload work is committed now; the previous warning about
  its uncommitted baseline no longer describes this checkout.
- **7** is complete in five commits: `ed8401d`, `a46d701`, `05d646d`, `380d8de`,
  `65afb61`. Nineteen JSON routes use `cached_frame_endpoint` and the lazy reader
  dependency. Ownership/validation, cache keys/caps/TTLs, AOI edits, error mappings and
  fixation generation fields are preserved. Gaze-at and PNG heatmaps remain specialized.
- **8b** is integrated in `0a625db`: GSR and distance share `SingleSignalTab` and
  `useSingleSignalData`, reusing `AnalyticsChartShell`. Specialized scientific series,
  gaze/stimulus behavior, units and controls remain in their tabs. Production code across
  both tabs and the shared files shrank from 1,198 to 1,109 lines.
- **Pupil remains separate**, as step 8b permits: its two-eye selection, local validity/
  baseline statistics and stimulus/video state do not fit the single-signal controller.
- **8c** is superseded by shared upload polling/progress work. Optional JSON request
  deduplication was not added.

Recent commits affect resource use: uploads move more work off the event loop but add
integrity/recovery work and lock connections; dashboard now starts the first project's
analytics automatically. No prior performance optimization was reverted. New UI bundle/
render latency effects were not measured. Details are in [FINDINGS.md](FINDINGS.md).

## Verification

- Baseline: `verify.ps1` **ALL GREEN**, 730 backend tests, 24 snapshots, 48 frontend
  unit tests, 36 Chromium regressions, ESLint 0 errors / 6 warnings.
  Evidence: `output/perf-resume-baseline.log`.
- Step 7: scoped HTTP/numeric contracts passed between batches. Its full gate passed
  749 backend tests and 24 snapshots, plus all frontend/static checks; the subsequent
  nonzero-generation cache regression passed in the 20-test targeted suite.
  Evidence: `output/perf-step7-batch*.log`, `output/perf-step7-final-gate.log`.
- Frontend browser verification: 5 tests passed for the two shared tabs, EEG state
  persistence and dashboard navigation/empty state.
- Final integrated `verify.ps1`: **ALL GREEN** — **750 backend tests, 24 snapshots,
  48 frontend unit tests, 36 Chromium regressions**, TypeScript, Ruff, Vulture,
  deptry, app boot/import boundaries, and ESLint **0 errors / 6 warnings**.
  Production `npm run build` passed. Evidence: `output/perf-completion-gate.log`
  and `output/perf-completion-build.log`.
- Protected snapshots and `tests/fixtures/route_inventory.json` were not changed.

## Database deployment

Native PostgreSQL 18.3 scratch verification now passes for **023/024**: upgrade,
downgrade and re-upgrade; six indexes and nullable token column; existing project
preservation; real concurrent token merging; stale-generation rejection; unchanged
project timestamp; malformed token-state recovery. All scratch servers were stopped.

Reproduce from the root:

```powershell
.venv/Scripts/python.exe docs/perf/bench/check_postgres_migrations.py
# Optional: --postgres-bin "C:/Program Files/PostgreSQL/18/bin"
```

The harness disables dotenv and uses only a new loopback scratch cluster. Evidence:
`output/perf-postgres/reproducible-smoke.log`.

**Limits and next deployment action:** this starts from an explicit predecessor-022
schema fixture, not a verified fresh migration chain. Pre-existing migration 004 fails
on PostgreSQL 18 because its CHECK-constraint loop also tries to drop a primary-key
NOT NULL constraint. Fix that separately before a fresh PostgreSQL 18 rollout.
`output/perf-postgres/full-chain-pg18-failure.log` records the failure.

No live database was accessed or migrated. The earlier configured Supabase connections
failed with tenant/user-not-found, and live revision remains unknown. Restore working
configuration before applying pending migrations; verify revision 024, the token column
and indexes before running the upgraded backend.

## Preserved worktrees and scope

Earlier `NeuroDatics-App-perf-step5`, `-perf-step67`, `-perf-step8` and upload worktrees
remain for recovery; do not re-merge their inherited baseline. The new
`NeuroDatics-App-perf-finish-ui` worktree holds the integrated step 8b commit. Do not
delete unrelated worktrees or dependency targets as part of this task.

Report loading, video timing, repository upserts, the EEG service preamble and Redis
deployment policy remain findings outside these remaining numbered implementation
steps. They are not silently marked complete. Keep existing model settings; high effort
is appropriate for either Claude or Codex if a separate follow-up is requested.
