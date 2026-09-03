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
- [ ] **S1** — Tier A deletion
  - [ ] `modules/processing/` + `modules/uploads/` (20 files, 60 LOC)
  - [ ] 12 orphan frontend files (679 LOC)
  - [ ] `pyjwt` removed; `google-auth-httplib2` declared
  - [ ] `gdrive_refresh_token` removed
  - [ ] 7 placeholder worker files
- [ ] **S2** — Mechanical lint sweep
  - [ ] ruff F401 / F841 / F811 / ERA001
  - [ ] `[tool.ruff]` section added
  - [ ] ESLint → 0 errors
- [ ] **S3** — Golden corpus + characterization
  - [ ] Golden experiment ZIP committed
  - [ ] 23 analytics routes pinned over HTTP
  - [ ] Auth round-trip tests
  - [ ] Numeric goldens (pytest-regressions)
  - [ ] **Net validated** — deliberate bug went red, then reverted
- [ ] **S4** — Broken logic
  - [ ] 16 `set-state-in-effect` errors
  - [ ] 9 `getattr(settings, ...)` call sites
  - [ ] `.env.example` regenerated (26 missing fields)
  - [ ] 5 swallowed exceptions
  - [ ] 7 `any` escape hatches
- [ ] **S5** — Break the circular dependency
  - [ ] Shared symbols extracted to a neutral module
  - [ ] Lazy imports at `projects/api/routes.py:540-547` removed
  - [ ] import-linter contract in `verify.ps1`
- [ ] **S6** — Tombstones
  - [ ] Tombstone helper + verified firing in api *and* worker logs
  - [ ] 9 Drive route handlers labelled
  - [ ] `workers/entrypoint.py` labelled
  - [ ] Harvest date: `________`
- [ ] **Harvest** (2-4 weeks after S6)
- [ ] **S7** *(optional)* — split `analytics_service.py`
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
