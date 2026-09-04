# Ledger

Append-only. One row per candidate; one block per session. This is what stops Session 5 from
re-litigating what Session 1 already investigated.

## Progress

- [x] **S0** — Reviewable diffs + safety net
  - [x] `.gitattributes` + `--renormalize`, in its own commit
  - [x] `git tag safety-net-baseline`
  - [x] `verify.ps1` written and printing ALL GREEN
  - [x] `[tool.pytest.ini_options] pythonpath = ["src"]`
  - [x] OpenAPI route-inventory test (53 operations pinned: 51 application + 2 health)
  - [x] Baselines: ruff, vulture (`--min-confidence 100`), deptry, knip, knip `--production`
  - [x] `test:comparison-click` globbed → 38 tests, not 34
  - [x] `poetry.lock;C` / `pyproject.toml;C` removed
  - [x] `CLAUDE.md` written
  - [x] Exit criteria for the whole campaign written down (see `PLAN.md` → *When to stop*)
- [x] **S1** — Eligible Tier A deletions complete; D4 retained after evidence correction
  - [x] `modules/processing/` + `modules/uploads/` (20 files, 60 LOC)
  - [x] 13 proven frontend orphans removed; 2 live barrels preserved (audit correction)
  - [x] Direct `pyjwt` declaration removed; 4 direct imports declared; PyJWT stays as Redis transitive
  - [ ] `gdrive_refresh_token` retained: forwarded by shipped delivery configuration (D4 deferred)
  - [x] 7 placeholder worker files
- [x] **S2** — Mechanical lint sweep (behavioral lint cases completed in S4)
  - [x] ruff F401 / F841 / F811 / ERA001
  - [x] `[tool.ruff]` section added
  - [x] ESLint → 0 errors, 6 warnings (enforced ratchet)
- [x] **S3** — Golden corpus + characterization
  - [x] Synthetic golden ZIP committed (2 participants, 2 scenarios, 3 modalities)
  - [x] Real approved experiment acceptance: 2 local experiments, 14 participants, 16 scenarios
  - [x] 23 analytics routes pinned over HTTP
  - [x] Auth round-trip tests
  - [x] Numeric goldens (pytest-regressions)
  - [x] **Net validated** — deliberate bug went red, then reverted
- [x] **S4** — Covered broken logic fixed; uncovered unit cases recorded
  - [x] 16 `set-state-in-effect` errors: 1 removed with orphan, 15 fixed; 6 browser regressions pass
  - [x] 10 actual `getattr(settings, ...)` call sites replaced
  - [x] `.env.example` regenerated: 52 keys and exact model parity tested
  - [x] 5 swallowed exceptions now warn without changing fallback behavior
  - [x] 7 reported `any` escape hatches removed without new suppressions
- [x] **S5** — Break the processing/analytics service dependency cycle
  - [x] Shared symbols extracted to a neutral module
  - [x] Lazy imports at `projects/api/routes.py:540-547` removed
  - [x] import-linter contract in `verify.ps1`
- [x] **S6** — Tombstones superseded by explicit product retirement
  - [x] Tombstone helper and local API/worker log tests
  - [x] Product decision replaced runtime observation: retire RQ and 7 unused Drive operations
  - [x] OAuth authorize/callback retained; seven other Drive operations removed
  - [x] Unenqueued RQ worker removed; synchronous ingestion and Redis cache retained
  - [x] No harvest window required after deliberate retirement decision
- [x] **Harvest** — superseded by explicit retirement; no observation claim made
- [x] **S7** — analytics service split complete; compatibility facade is 74 lines, largest service 609
- [x] **S8** — EEG component split and UI-library consolidation complete
  - [x] `EegTab` reduced to 590 lines; Base UI removed after real browser coverage

## Candidate register

| Candidate | Tier | Evidence | Decision | SHA | Revert | Date |
|---|---|---|---|---|---|---|
| `modules/processing/` | A | Rechecked imports, registration and ignored delivery | deleted | `14844e3` | `git revert 14844e3` | 2026-09-03 |
| `modules/uploads/` | A | As above | deleted | `14844e3` | `git revert 14844e3` | 2026-09-03 |
| 13 proven frontend orphans; 2 live barrels retained | A | Knip both modes + symbol/path + ignored delivery searches | deleted | `aaf1b52` | `git revert aaf1b52` | 2026-09-03 |
| Direct `pyjwt` declaration | A | No direct imports; Redis still requires it transitively | direct declaration removed; transitive retained | `b5fae4d` | `git revert b5fae4d` | 2026-09-03 |
| `gdrive_refresh_token` | B/configuration | No runtime reader; only Compose forwarding | deleted from current source/config | `5b9b450` | `git revert 5b9b450` | 2026-09-04 |
| 7 placeholder worker files | A | Stubs, no enqueue/import/config references | deleted | `d319473` | `git revert d319473` | 2026-09-03 |
| 9 Google Drive routes | B | OAuth callback is sole connection writer; other seven have no current callers | keep authorize/callback; delete seven by user decision | `bd6b2cd`, `5b9b450` | revert deletion then unmount commits | 2026-09-04 |
| RQ worker surface | B→C | No enqueue caller; task was a logging stub; Redis independently live | deliberately retired | `e89a975`, `5b9b450` | revert deletion then disconnection commits | 2026-09-04 |
| RQ pipeline as a feature | C | User chose future robust upload as a separate phase | drop current stub; keep synchronous upload | `5b9b450` | `git revert 5b9b450` | 2026-09-04 |
| `@base-ui/react` | C | Four consumers need only single select; 7 real browser contracts | migrated to Radix and removed | `85cfb27`, `c71d926` | revert dependency then migration commits | 2026-09-04 |
| `components/ui/input-group.tsx` | A | Knip both modes + exact symbol/path and deployment searches | deleted | `92c9292` | `git revert 92c9292` | 2026-09-04 |

## Baseline numbers (fill in during S0)

| Gate | Baseline | After S1 | After S2 | After S4 | After S6 |
|---|---|---|---|---|---|
| pytest | 494 | | | | |
| tsc | exit 0 | | | | |
| node tests | 38 (was 34) | | | | |
| eslint problems | 40 (25e/15w) | | | | |
| backend LOC | 23,909 | | | | |
| frontend LOC | 30,319 | | | | |
| routes | 51 | | | | |

## Session log

*(One block per session: date, branch, commits with SHAs, what went green, what got parked.)*

## 2026-09-03 — S0, codex/cleanup-campaign

- Starting state: dashboard `c68b76e`; tracked files clean; pre-existing untracked docs/cleanup and docs/presentation. Presentation files left outside campaign.
- Normalization: `d35ca73` (skip in history mining); tag `safety-net-baseline` points here. No logic changes. Retrieve pre-cleanup files with `git show safety-net-baseline:path`.
- Test discovery: `5b66710` activates all 38 frontend helper tests.
- Safety net: `2875241` adds root verify, pytest src configuration, protected-golden guidance, and all 53 mounted HTTP operations (51 business routes plus 2 health routes).
- Root verify: ALL GREEN; **495 pytest**, TypeScript exit 0, **38 node**, lint **25 errors / 15 warnings**. Lint counts are enforced ratchets, not ignored exit codes.
- Baselines saved unmodified for ruff, vulture 100% confidence, deptry, knip default, knip production. Initial knip runs have no custom entry configuration.
- Two empty shell-redirect directories removed with an empty-directory-only operation; no versioned content existed.
- Campaign acceptance: 494+ backend tests, all mounted routes unchanged, 0 ESLint errors, clean selected Ruff rules, no newly unproved deletions; numerical/HTTP coverage and documented runtime-only/product gates. Optional structural work is judged after the mandatory stages, rather than treating an arbitrary LOC target as permission to rewrite.
- Sequential phase groups share this branch so completed gates accumulate. Only the coordinating agent commits; each subagent owns disjoint paths. Sessions larger than six commits are split into continuation sessions.

### Evidence corrections before deletion

- Two alleged orphan barrels are live: `features/home/index.ts` and `features/projects/create-project/index.ts`; preserve them.
- Mounted operation count includes `/health` and `/health/ready`, which the original 51-route audit excluded.
- No real experiment corpus is available in this workspace or sibling Bioseñales project folders. Synthetic coverage can be built; real-data acceptance remains explicitly pending.


## 2026-09-03 — S1a/S1b, proven removals

All work accumulates on `codex/cleanup-campaign`; phase continuation groups keep changes reviewable. The already-unused stage was documented in `76543dc` (backend) and `594f792` (frontend) rather than manufacturing a caller removal.

| Completed decision | Commit | Exact rollback |
|---|---|---|
| Remove 20 unmounted processing/upload stubs | `14844e3` | `git revert 14844e3` |
| Remove 7 worker stubs | `d319473` | `git revert d319473` |
| Remove 13 unreachable frontend files | `aaf1b52` | `git revert aaf1b52` |
| Remove direct PyJWT declaration; declare 4 direct runtime imports + compatible tooling | `b5fae4d` | `git revert b5fae4d` |

Total: **40 files / 972 source lines removed**. All 53 HTTP operations unchanged. Post-delete verify: 518 backend tests (includes 23 new auth tests), 38 node, TypeScript clean, lint 24e/15w. Lock update changed no existing package versions. PyJWT remains required transitively by Redis. D4 is retained because both source and shipped Compose forward it. Retrieval: `git show safety-net-baseline:path`.

## 2026-09-03 — S2, mechanical cleanup

- `97da1b8`: frontend unused bindings/prefer-const only.
- `d813dbb`: 10 unused imports removed, with full verify green.
- `75131c8`: 3 unused bindings removed while preserving awaited validation; ERA001 technical comment clarified; Ruff rules pinned.
- `00214e8`: generated Vulture whitelist for positional signal/context-manager protocol arguments, with rationale.
- Ruff selected rules and Vulture 100% (with whitelist) pass. Frontend behavioral errors continue separately in S4. No bulk formatter ran.

## 2026-09-03 — S3, local characterization complete; real-data acceptance open

- `2ade40f`, `097e01c`: 23 auth tests cover token round-trip/rejection, file-store identity persistence, Google HTTP contracts, database identity mapping and network failures without external services.
- Protected baselines `2e56bc6`, corpus `3e661d0`, and tests `b38b5ab`: 64 additional tests, 24 shape snapshots and 18 tolerance-aware numerical CSVs. 23 analytics routes execute 92 successful requests over the four participant/scenario pairs; 21 missing-participant cases are checked.
- Real ZIP validation, CSV processing, fixation detection and parquet output drive the corpus. Only infrastructure is replaced at HTTP boundaries. Heatmaps pin histogram data and response contracts, never PNG snapshots.
- Verified with pytest-regressions **2.8.3**, syrupy **4.6.1**, pytest **7.4.4**. Initial isolated generation is documented; subsequent runs use no update flags.
- `check_mutation.py` increases the smoothing window by one sample in its own process: exactly one numerical regression fails, helper reports MUTATION CAUGHT and exits successfully. Production and baselines remain unchanged.
- Synthetic data is explicit. A real approved recording remains unavailable. This blocks field-validation claims, not the narrowly verified import-only work in S5.

## 2026-09-03 — S4, fixes in progress

- `0d016b8`: 20 hooks share selection-aware request state. Three browser repros failed before the fix; six regression cases and six existing dashboard e2e tests pass afterward. Reset stale data/errors/loading and release obsolete heatmap URLs. API signatures retained.
- `882a99c`: 10 Settings fallback reads now fail clearly if a field disappears; 73 focused cache tests pass.
- `31a6d5c`: 52-field example, isolated parse and field-parity tests. Library proxy configuration remains documented; unused RQ environment names do not become invented Settings.
- `34926d9`: numeric review reproduces distance/time/mixed-axis unit gaps outside golden coverage. Calculations unchanged; follow-up requires explicit unit-contract tests and compatibility decisions.
- `15eba62`: verify now enforces Ruff, Vulture and real Chromium hook tests as well as existing gates; lint ratchet lowered to 7e/8w pending B8.

## 2026-09-03 — S6, instrumentation prepared; deployment/harvest open

- `c4ddb5b`: all 9 Drive handlers and real worker entrypoint log stable warning labels once per process; concurrent calls and API/worker behavior tested.
- `cf6f908`: deployment and active-sweep instructions in `evidence/tombstone-rollout.md`.
- Docker client is present, engine unavailable. No deployed containers or frozen release changed. No observation window has started, so no honest harvest date/hit count exists yet. Runtime collection, 14–28 days and an active sweep remain mandatory before deletion.


## 2026-09-03 — S4/S5/S8 final integration

- S4 completed: `a3d0280` removes the seven reported `any` cases while preserving legacy string sensor compatibility; `c2f783b` logs all five fallback failures with operation/type only. Five tests verify fallback outcomes and no sensitive exception payloads. `3d58c7e` requires ESLint zero errors.
- S5 completed: `1aa864c` extracts the shared implementations; `48fb298` repoints imports without other AST changes; `f292487` adds three enforced contracts and accurate HTTP operation count. Public import shims remain. Independent review agrees that all calculations are unchanged. See `evidence/architecture-boundary.md` for intentional API/entity/cache dependencies.
- S8 bounded work: `54d2981` extracts 15 EEG helpers, three types and two constants without changing their bodies or JSX. `5310e10` introduces tested URL helpers; `a196110`, `56ee57f` and `67701d3` migrate all nine consumers in three groups. Independent review confirms query order, Unicode encoding, omission versus zero time, cancellation and resource cleanup are preserved.
- S7 remains deferred: its class split is not a pure move because two live classes call each other. Remaining EegTab JSX/state and UI primitive replacement are not forced through that uncertainty.

### Final verification (source through `67701d3`)

| Check | Result |
|---|---|
| `./verify.ps1` | **ALL GREEN**, exit 0 |
| Backend pytest | **593 passed**, **24 snapshots passed** (494 before campaign) |
| TypeScript | exit 0 |
| Frontend helper tests | **48 passed** (34 before discovery fix; 38 after S0) |
| Real React hook browser regressions | **6 passed** |
| Existing comparison dashboard e2e | **6 passed**, 30.2 seconds; still infrastructure-mocked |
| ESLint | **0 errors / 8 warnings** (25 / 15 before campaign) |
| Ruff F401/F841/F811/ERA001 | clean |
| Vulture 100% + documented protocol whitelist | clean |
| Import boundaries | **3 kept / 0 broken** |
| Mounted HTTP operations | **53 unchanged**: 51 business + 2 health |
| Poetry manifest/lock validation; installed dependency check | pass (legacy metadata deprecation warnings only) |
| Existing protected goldens | unchanged since initial reviewed baseline |
| Knip 6.34.0 default and production | **0 unused files**, including analytics; residual export/dependency candidates are report-only |

Final static reports are in `results/`, with residual-tool limitations in its README. Raw local execution logs are `output/cleanup-final-verify.txt` and `output/cleanup-final-e2e.txt` (ignored, reproducible from the committed commands).

### Open gates at that checkpoint

Four items were open through `67701d3` in the preceding checkpoint record. They were
resolved in the continuation session below.

## 2026-09-04 — S3/S4/S6/S7/S8 completion and merge candidate

- Real-data acceptance (`3b5d8bd`) processes the two ignored reference experiments:
  14 participants, 16 scenarios, 261,194 sensor rows, 1,508 events, 96 numerical
  service calls and 110 scenario Parquets. EEG, GSR and EyeTracker are represented.
- New import unit normalization (`dd01a58`) converts declared time to seconds and
  distance to millimetres before detection, analytics and Parquet persistence; mixed
  gaze axes and unsupported explicit units fail clearly. Existing Parquet reads remain
  compatible and values are not rewritten. Eleven regression tests pass.
- S7 (`c36a62c`, `e92cd56`) leaves a 74-line compatibility facade and ten focused
  service modules; the largest is 609 lines. S8 (`af23322`, `0226b2f`, `647473d`,
  `5c8d978`) reduces `EegTab` to 590 lines with one dedicated EEG e2e contract.
- Four current single selectors moved from Base UI to Radix (`85cfb27`); seven real
  browser contracts protect their interaction. Base UI was removed after a clean
  scratch install (`c71d926`). The Edit Project request race was reproduced and fixed
  with four browser contracts (`c1a9f2d`).
- The user deliberately retired RQ and seven old Drive operations. Compose disconnection
  is `e89a975`; route removal is `bd6b2cd`; source/config/dependency deletion is
  `5b9b450`. OAuth `authorize`/`callback`, synchronous upload, Redis cache, migrations
  and existing data stay. The route inventory is 46 operations (44 business + 2 health).
- Dependency cleanup removed the unused frontend declarations (`c30be96`) and made
  deptry a passing verification gate (`21d6ed6`). A final Knip sweep removed one later
  orphaned UI file (`92c9292`) and corrected its hook-harness false positive (`790f857`).
  The navigation logo's public path and optimization were fixed in `c63f951`.

### Final verification

| Check | Result |
|---|---|
| `./verify.ps1` | **ALL GREEN**, exit 0 |
| Backend pytest | **586 passed**, **24 protected snapshots passed** |
| TypeScript / Ruff / Vulture / deptry | clean |
| Import boundaries | **3 kept / 0 broken** |
| Frontend helper tests | **48 passed** |
| Real Chromium component/hook tests | **17 passed** |
| Comparison + EEG dashboard e2e | **7 passed** |
| Next.js production build | pass, 9 static routes generated |
| ESLint | **0 errors / 6 warnings**, ratchet tightened to 6 |
| Knip default / production | **0 unused files, 0 dependency findings**; exports/types remain report-only |
| Compose default / delivery | config validation pass |
| Protected goldens | unchanged |

The frozen delivery release, real environment files and pre-existing untracked
`docs/presentation/` remain untouched. No deployment or remote push was performed.
