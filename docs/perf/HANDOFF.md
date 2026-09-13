# Performance campaign safe-exit handoff

The user requested fixes 5–8, then requested finishing the current step and a safe exit.
Stop here; do not automatically continue the remaining work.

## Completed in the shared `dashboard` checkout

- **5a** `91cbdc0`: scenario scoping resolves distinct labels once, preserving raw string comparisons and legacy coercion. Benchmark: 42.1 → 14.8 ms on 300,000 rows.
- **5b** `cef502e`: nearest gaze lookup uses guarded binary search and transforms only the selected applied row. Unsorted/duplicate times retain historical ordering; legacy samples retain full scenario interpolation and smoothing. Legacy benchmark: 101 → 46 ms; applied-transform frame: 122.7 → 5.8 ms. A real recording's ordering was not assumed.
- **6** `38006cf`: lazily persist transform tokens on the project, keyed by participant and ingestion generation. Atomic PostgreSQL JSON merging prevents concurrent participants from overwriting each other; a generation predicate prevents old readers from publishing after re-ingestion. Cache hits and heatmap 304s skip reader construction. Comparison and AOI metrics now cache; current AOI geometry/presentation fields participate in their key.
- **8a** `a779f99` and `6eb5af5`: hook factory and request cancellation, including comparison/gaze callers. Signal-bearing blob requests do not share an in-flight fetch, preventing a cancelled sibling or StrictMode cleanup from cancelling a surviving caller. Completed blob caching remains intact. Optional JSON deduplication was not added.

Concurrent work independently landed steps 1–4. Integration retained its decimation helper, point caps, cache-key arguments, indexes and image conditional-GET behavior. No snapshots were regenerated.

## Verification and deployment

- Step 6 in isolation: `verify.ps1` **ALL GREEN**, 696 backend tests, 24 snapshots, frontend typecheck/browser tests, ESLint 0 errors / 6 existing warnings.
- Final integrated gate: `verify.ps1` **ALL GREEN** — **730 backend tests, 24 snapshots, 48 frontend unit tests, 32 browser regressions**, TypeScript, Ruff, Vulture, deptry, import boundaries, and ESLint **0 errors / 6 warnings**. Evidence: `output/perf-safe-exit-gate.log`. The only later change is this handoff document.
- Migration **024** adds nullable `projects.analytics_transform_tokens`, chained to the concurrently added **023**. Apply the pending migrations before running the upgraded backend. No live database was modified.
- Migration upgrade/downgrade passed on a scratch SQLite database; PostgreSQL-specific merge SQL was compiled and checked. Live PostgreSQL validation was unavailable because the Docker daemon was stopped. A PostgreSQL migration/concurrency smoke test remains a deployment check.
- Existing migration **022** and the upload-hardening edits remain the other workstream's uncommitted changes. Do not stage, discard, or overwrite them.

## Remaining work

1. **Step 7 has not started.** Introduce the cached-frame helper and reader dependency, then migrate routes in small verified batches. Preserve the new cache-before-read ordering, 404/503 read errors versus 422 computation errors, mutable AOI key material, and step 4's point caps. Keep gaze-at and heatmap specialized.
2. **Step 8b has not started.** Extract `SingleSignalTab` for GSR and device distance using `AnalyticsChartShell`; assess pupil separately as allowed in the plan.
3. **Step 8c is superseded** by upload-hardening work; do not repeat that extraction.

Resume with the current model selection; high effort is appropriate for either Claude or Codex. Run scoped HTTP/numeric contracts between route batches and the full repository gate at integration boundaries. Protect all golden snapshots and route inventory.

## Preserved worktrees

The sibling `NeuroDatics-App-perf-step5`, `NeuroDatics-App-perf-step67`, and `NeuroDatics-App-perf-step8` worktrees remain for recovery. Completed changes were integrated into `dashboard`. They also contain copies of the inherited uncommitted baseline; these are not new work to merge. Do not force-delete them or their dependency junctions as part of unrelated cleanup.
