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
- [ ] **S2** — Mechanical lint sweep
  - [x] ruff F401 / F841 / F811 / ERA001
  - [x] `[tool.ruff]` section added
  - [ ] ESLint → 0 errors
- [ ] **S3** — Golden corpus + characterization
  - [x] Synthetic golden ZIP committed (2 participants, 2 scenarios, 3 modalities)
  - [ ] Real approved experiment acceptance: corpus unavailable
  - [x] 23 analytics routes pinned over HTTP
  - [x] Auth round-trip tests
  - [x] Numeric goldens (pytest-regressions)
  - [x] **Net validated** — deliberate bug went red, then reverted
- [ ] **S4** — Broken logic
  - [x] 16 `set-state-in-effect` errors: 1 removed with orphan, 15 fixed; 6 browser regressions pass
  - [x] 10 actual `getattr(settings, ...)` call sites replaced
  - [x] `.env.example` regenerated: 52 keys and exact model parity tested
  - [ ] 5 swallowed exceptions
  - [ ] 7 `any` escape hatches
- [ ] **S5** — Break the circular dependency
  - [ ] Shared symbols extracted to a neutral module
  - [ ] Lazy imports at `projects/api/routes.py:540-547` removed
  - [ ] import-linter contract in `verify.ps1`
- [ ] **S6** — Tombstones
  - [x] Tombstone helper and local API/worker log tests
  - [ ] Deployed API/worker log verification: Docker engine stopped
  - [x] 9 Drive route handlers labelled
  - [x] `workers/entrypoint.py` labelled
  - [ ] Harvest date: deployment + 14–28 days, not started
- [ ] **Harvest** (2-4 weeks after S6)
- [ ] **S7** *(optional, deferred)* — class split requires resolving a real mutual class dependency; see Mikado
- [ ] **S8** *(optional)* — frontend god components

## Candidate register

| Candidate | Tier | Evidence | Decision | SHA | Revert | Date |
|---|---|---|---|---|---|---|
| `modules/processing/` | A | 0 external refs; not mounted; `NameError` on import | delete | | | |
| `modules/uploads/` | A | as above | delete | | | |
| 12 orphan frontend files | A | 0 importers (verified by grep + knip) | delete | | | |
| `pyjwt` | A | 0 imports; only `python-jose` used | delete | | | |
| `gdrive_refresh_token` | A | 0 refs incl. `getattr` form | delete | | | |
| 7 placeholder worker files | A | 3-LOC stubs | delete | | | |
| 9 Google Drive routes | **B** | 0 frontend callers, **but** `delivery/` is a shipped build | tombstone | | | |
| `workers/entrypoint.py` | **B** | nothing enqueues; Redis itself is live | tombstone | | | |
| RQ pipeline as a feature | **C** | needs a product decision: finish or drop | ask user | | | |
| `@base-ui/react` | **C** | 1 import; consolidation, not deletion | S8 | | | |

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
- Protected baselines, corpus `3e661d0`, and tests `b38b5ab`: 64 additional tests, 24 shape snapshots and 18 tolerance-aware numerical CSVs. 23 analytics routes execute 92 successful requests over the four participant/scenario pairs; 21 missing-participant cases are checked.
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
