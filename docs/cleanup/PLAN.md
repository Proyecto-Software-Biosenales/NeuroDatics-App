# The plan — 9 sessions

**Ordering principle:** make diffs reviewable, then build the net, then delete what is provable,
then fix what is broken, then restructure. Nothing is deleted before the thing that would catch
the mistake exists.

Sessions 0-6 are the campaign. **Sessions 7-8 are optional** — after 6, re-read `LEDGER.md` and
decide whether the remaining value justifies the risk. Stopping at 6 is a legitimate outcome.

| # | Session | Risk | Effort | Outcome |
|---|---|---|---|---|
| 0 | Reviewable diffs + safety net | none | 2-3h | `verify.ps1`, baselines, route inventory |
| 1 | Tier A deletion (provable) | low | 1-2h | ~760 LOC, 34 files, 1 dep |
| 2 | Mechanical lint sweep | low | 1.5-2h | unused imports/vars; 25 lint errors → 0 |
| 3 | Golden corpus + characterization | none | 2-3h | net over the 4 big numeric services |
| 4 | Broken logic | medium | 2-3h | 16 React bugs, config drift, swallowed errors |
| 5 | Break the circular dependency | high | 2-3h | the structural blocker |
| 6 | Tombstone the ambiguous surfaces | low | 1.5h | + a harvest 2-4 weeks later |
| 7 | *(optional)* Split `analytics_service.py` | high | 3h | 3,405 LOC → 10 files |
| 8 | *(optional)* Frontend god components | high | 3h | `EegTab.tsx` 2,381 LOC |

---

## Rules that apply to every session

### The deletion tiers

Never delete on one signal. Classify every candidate, and route it:

- **Tier A — delete now.** Static tools agree, `git grep` across `backend/ frontend/ docs/ delivery/`
  and `docker-compose*.yml` returns only the definition, and it is not reachable by a framework
  convention. *(Session 1.)*
- **Tier B — needs runtime evidence.** Looks dead, but the surface is dynamic or externally
  reachable. Tombstone it and wait. *(Session 6.)*
- **Tier C — needs a human product decision.** Reachable but unfinished. Park it in `LEDGER.md`
  as a question. Do not let an agent decide.

### The two-commit rule

Split every removal into **"make unused"** then **"delete"**:

1. Commit 1 removes call sites, exports and re-exports → verify green.
2. Commit 2 removes the definition → verify green.

Reverting commit 2 restores behaviour without unwinding commit 1. This is what makes a bad
deletion cheap.

### Commit notation

Prefix every commit subject so `git log --oneline` is a risk map:

| Prefix | Meaning |
|---|---|
| `r ` | provable refactor — tool/compiler-verified, behaviour-preserving |
| `R ` | risky refactor — hand-edited restructuring |
| `d ` | deletion with evidence |
| `F ` | behaviour change |

**Never mix structural and behavioural changes in one commit.** In a repo with no CI, a mixed
commit is unrevertible in practice.

Put the evidence in the commit **body**: the tier, the exact grep run, which tools agreed, and
the literal `git revert <sha>` command.

### Commit sizing

~200-400 changed lines, one module directory. A whole-file deletion counts as **one** decision,
not 900 — but never mix a file deletion with edits to five other files.

### Session discipline

Cap each session at **6 commits**. End on green with `LEDGER.md` updated. An unfinished session
that ends green is a success; a finished session that ends red is not.

---

## Session 0 — Reviewable diffs + safety net

**Goal:** make later diffs readable and later deletions verifiable. **Delete no logic.**

**Why first:** two things block everything else. Diffs are currently unreadable because of
CRLF/LF churn, and there is no single command that says "still working".

**Steps**

1. **Normalise line endings, in its own commit, with nothing else in it.** This must be the
   first commit of the campaign — the repo has **no `.gitattributes`** today, and until it does,
   every deletion diff is noise.
   ```bash
   git switch -c cleanup/00-safety-net
   printf '* text=auto\n*.py text eol=lf\n*.ts text eol=lf\n*.tsx text eol=lf\n*.json text eol=lf\n*.md text eol=lf\n' > .gitattributes
   git add --renormalize .
   git commit -m "r normalise line endings via .gitattributes"
   ```
   Record the SHA in `LEDGER.md` so future history-mining skips it.
2. **Tag the pre-cleanup state:** `git tag safety-net-baseline`. Every later session diffs
   against this tag.
3. **Write `verify.ps1` at the repo root — this is your CI.** One command, run after every
   deletion batch:
   ```powershell
   $ErrorActionPreference = 'Stop'
   Push-Location backend; $env:PYTHONPATH='src'
   ..\.venv\Scripts\python.exe -m pytest -q; if ($LASTEXITCODE) { throw "pytest failed" }
   ..\.venv\Scripts\python.exe -c "from neurodatics.main import app; print(len(app.routes))"
   Pop-Location
   Push-Location frontend
   npx --no-install tsc --noEmit;  if ($LASTEXITCODE) { throw "tsc failed" }
   npm run test:comparison-click;  if ($LASTEXITCODE) { throw "node tests failed" }
   npx --no-install eslint .       # ratchet — report, do not throw
   Pop-Location
   Write-Host "ALL GREEN" -ForegroundColor Green
   ```
4. **Kill the `PYTHONPATH` dance.** Add to `backend/pyproject.toml`:
   ```toml
   [tool.pytest.ini_options]
   pythonpath = ["src"]
   ```
   Then plain `python -m pytest` works, and an agent can no longer misinvoke it.
5. **Add the OpenAPI route-inventory test** (15 minutes, high value). Dump all 51 routes to a
   committed snapshot and assert against it. Any deletion that removes an endpoint now fails
   loudly instead of silently.
   > Caveat: this pins **paths and methods only**. Deleting a field from a Pydantic response
   > model keeps the route present, passes this test, passes `tsc`, and breaks the UI at
   > runtime. Session 3 covers that gap.
6. **Generate candidate baselines into `docs/cleanup/baselines/`. Report only — change nothing.**
   ```bash
   ./.venv/Scripts/python.exe -m pip install ruff vulture deptry
   cd backend
   ../.venv/Scripts/ruff.exe check src --select F401,F811,F841,ERA001,ARG --statistics > ../docs/cleanup/baselines/ruff.txt
   ../.venv/Scripts/vulture.exe src tests --min-confidence 100 --sort-by-size > ../docs/cleanup/baselines/vulture.txt
   ../.venv/Scripts/deptry.exe . > ../docs/cleanup/baselines/deptry.txt
   ```
   **Start vulture at `--min-confidence 100`, not 80,** and scan `src` *and* `tests` together.
   At its default of 60 on a FastAPI + Pydantic codebase the output is mostly false positives,
   and an agent acting on it will delete route handlers and schemas. Generate a whitelist rather
   than triaging the same noise every session.
7. **Frontend baseline — run knip with NO config first:**
   ```bash
   cd frontend && npx knip@latest --reporter markdown > ../docs/cleanup/baselines/knip.md
   ```
   ⚠️ **Do not hand-write a `knip.json` `entry` array.** Overriding `entry` *replaces* the
   Next.js plugin defaults rather than merging with them, and knip will then report all 8
   `page.tsx` files as unused — the fastest possible way to delete the whole application. Add
   config only to fix a *specific* observed misfire. Expect `shadcn` and `tw-animate-css` to be
   flagged; they are consumed from CSS (DO-NOT-TOUCH #2) and need `ignoreDependencies`.
   Also run `npx knip --production` and keep **both** lists — they disagree by design, and
   "used only by tests" is a different, easier decision than "used by nothing".
8. **Free wins**, each its own commit:
   - Wire the orphaned test in: change `test:comparison-click` to
     `node --test "features/**/*.test.mjs"` so `stimulusPlacement.test.mjs` (4 passing tests)
     runs. Expect 34 → 38.
   - `rm -rf "backend/poetry.lock;C" "backend/pyproject.toml;C"` — empty shell-redirect junk.
9. **Write `CLAUDE.md`** with *only* the non-obvious: `verify.ps1`, the root-venv trap,
   `--ignore-cr-at-eol`, the goldens-are-protected rule, and a pointer to `docs/cleanup/`. Keep
   it short — an over-stuffed `CLAUDE.md` gets ignored.
10. **Create `docs/cleanup/mikado.md`** — an empty Mikado graph. When a later session attempts
    something that needs >30 minutes or >3 files, it reverts (`git checkout .`, do **not** stash,
    do **not** fix forward) and writes what blocked it here as new leaves.

**Exit criteria**
- `.\verify.ps1` prints ALL GREEN.
- `git tag` shows `safety-net-baseline`.
- `docs/cleanup/baselines/` has ruff, vulture, deptry, knip, knip-production.
- Frontend tests report **38**, not 34.
- Route-inventory test passes with 51 routes.

**Rollback:** additive only — delete the branch. *(The `.gitattributes` commit is worth keeping
regardless.)*

---

## Session 1 — Tier A deletion

**Goal:** remove the ~760 LOC that is provably dead, and prove the delete-and-verify loop works
on material that cannot break anything.

**Targets:** `FINDINGS.md` D1-D6.

**Steps** — two commits per item (`make unused`, then `delete`); `.\verify.ps1` between each.

1. **`modules/processing/` + `modules/uploads/`** — 20 files, 60 LOC. Re-verify first, and
   **include `delivery/`** in the grep:
   ```bash
   git grep -n "modules\.processing\|modules\.uploads" -- backend frontend docs docker-compose*.yml
   grep -rn "processing\|uploads" delivery/NeuroDatics-App/docker-compose.yml
   ```
2. **The 12 orphan frontend files** (679 LOC, D2 table). Cross-check against **both** knip lists
   from Session 0 plus a `git grep` for the bare name. Use `tsc` as the oracle: delete an export,
   run `npx --no-install tsc --noEmit`, and the error list *is* the dependency tree. First
   confirm the four `features/*/select-*/use*.ts` hooks are the abandoned predecessor of
   `useCreateProjectWizard.ts`; record that conclusion in `FINDINGS.md`.
3. **`pyjwt`** — remove from `pyproject.toml`. **Add the undeclared `google-auth-httplib2`**
   (imported at `gdrive_client.py:8`, currently surviving only as a transitive dep). Relock.
4. **`gdrive_refresh_token`** setting + its `.env.example` entry. Grep the attribute *and* the
   `getattr` form.
5. **The 7 placeholder worker files** (D6). Leave `entrypoint.py` and
   `process_experiment_zip.py` — Session 6 decides those.

**Delete subgraphs, not symbols.** If you remove an endpoint, remove its schema, its service
method and its frontend caller in the same change — otherwise you manufacture the next
generation of orphans.

**Exit criteria**
- `.\verify.ps1` ALL GREEN, 494 tests still passing.
- `git diff --stat --ignore-cr-at-eol safety-net-baseline...HEAD` ≈ 34 files deleted, ~760 LOC.
- Every commit body carries its evidence tuple.

---

## Session 2 — Mechanical lint sweep

**Goal:** clear the automated, behaviour-preserving layer so later diffs stay readable.

**Steps**

1. Backend, one rule family per commit, `.\verify.ps1` after **each** — not at the end:
   ```bash
   cd backend
   ../.venv/Scripts/ruff.exe check src --select F401 --fix    # unused imports
   ../.venv/Scripts/ruff.exe check src --select F841 --fix    # unused locals
   ../.venv/Scripts/ruff.exe check src --select F811          # redefinitions — by hand
   ../.venv/Scripts/ruff.exe check src --select ERA001        # commented-out code — by hand
   ```
   `F401` can remove an import kept for its side effect. If the suite goes red, that is what
   happened — revert that hunk, don't chase it.
2. Add a `[tool.ruff]` section pinning the rule set, so the pattern cannot come back.
3. Frontend: `npx --no-install eslint . --fix`, then the remainder by hand. The 16
   `react-hooks/set-state-in-effect` errors are **real bugs** — do not suppress them and do not
   batch them with mechanical fixes. If they exceed 30 minutes, push them to Session 4.
4. **Do not run `black`, `isort` or `prettier`.** Reformatting now buries every later diff and
   destroys the git-history signal. If the user wants formatting, it is one commit, alone, after
   the campaign, with its SHA recorded.

**Exit criteria:** ruff clean on the four families; ESLint **0 errors**; `.\verify.ps1` green.

---

## Session 3 — Golden corpus + characterization

**Goal:** build the net over the numeric core. Add tests only; change no production code.

**Why now:** only **1 of 494** tests goes through HTTP, 18 of 23 analytics endpoints are never
invoked, and — critically — **the existing Playwright spec mocks the entire backend** (14
`page.route` interceptors). A green `npm run test:e2e` after a backend deletion proves nothing.

**Steps**

1. **Build one golden corpus and reuse it everywhere:** a single real experiment ZIP with all
   three modalities (EyeTracker, GSR, EEG), ≥2 scenarios and ≥2 participants, committed to
   `backend/tests/fixtures/golden/`. This one artifact drives every characterization test.
2. **Find the seam before writing the test** (Feathers). If pinning a service needs more than
   ~30 lines of setup, that setup pain *is* the finding: pass a DataFrame or a path in rather
   than letting the service reach for Redis/Postgres/Drive. Introduce the seam first, as an
   `[S]` commit.
3. **Pin the big services with the right tool per output shape.** Use `pytest-regressions`
   (`dataframe_regression` / `num_regression`) for anything numeric — it is tolerance-aware.
   Reserve `syrupy` for dicts, JSON and schemas.
   - ⚠️ **Never snapshot matplotlib PNGs or heatmap images.** They are not byte-stable across
     matplotlib versions, DPI, fonts or backends. Pin the numeric substrate instead — bin
     counts, extents, array shape, min/max/mean.
   - ⚠️ Add `*.ambr text eol=lf` and the pytest-regressions data extensions to `.gitattributes`
     **before** generating goldens, or CRLF churn will make them appear changed every run.
4. **Add HTTP-level contract tests** for all 23 analytics routes using `TestClient` (the pattern
   exists at `test_upload_pipeline_hardening.py:5,18`). Assert status + response shape, not
   numeric values.
5. **Add auth tests** — token round-trip, expiry, `get_current_user` rejection.
   `auth/api/routes.py` (217 LOC), `user_store.py` (107) and `config/security.py` (104) have
   zero coverage and are reachable from every endpoint.
6. **Validate the net — the step everyone skips.** Deliberately introduce a bug (flip a `>` to
   `>=` in the dispersion threshold, or off-by-one a window size), run the suite, confirm it
   goes **red**, then revert. A net you have not tested is not a net.
7. **Protect the goldens.** The failure mode that destroys this campaign is an agent hitting a
   red characterization test and "fixing" it with `--snapshot-update`. Put the rule in
   `CLAUDE.md`, use `--snapshot-update-new-only`, and commit goldens in their own commit.

**Exit criteria**
- All 23 analytics routes exercised over HTTP; `grep -c TestClient backend/tests` > 1.
- The deliberate-bug check went red and was reverted (record it in `LEDGER.md`).
- `git diff --stat` touches only `backend/tests/`.

---

## Session 4 — Broken logic

**Goal:** fix the defects the user actually cares about, now that a net exists.

**Targets:** `FINDINGS.md` B1, B3, B4, B5, B8. All `F ` (behavioural) commits.

**Steps**

1. **The 16 `react-hooks/set-state-in-effect` errors** (B1). Each is a potential render loop or
   stale-state bug — the highest-value defects in the audit. One component per commit.
2. **The 9 `getattr(settings, ...)` call sites** (B5) → plain `settings.x`. **Do this before any
   other config work** — while the `getattr` form is in place, renaming a settings field fails
   silently.
3. **Regenerate `backend/.env.example` from the Settings model** (B4): 26 fields are missing.
   Determine whether `JOB_TIMEOUT` / `JOB_RESULT_TTL` are read from raw `os.environ` by the RQ
   worker — if yes they belong in `Settings`; if no they are dead. Drop the 3 unused proxy keys.
4. **The 5 swallowed exceptions** (B3) — log at `warning` with context at minimum.
   `gdrive_client.py:214` is probably correct to swallow; `executive_report_service.py:634,856`
   probably are not.
5. **The 7 `any` escape hatches** (B8).
6. **Numeric review** of `fixation_detection_service.py` and `csv_processing_service.py`:
   division guards, NaN handling that silently drops rows, magic constants, px/mm/degree unit
   confusion. **Fix only what the Session 3 goldens cover. Anything you cannot test, write into
   `FINDINGS.md` rather than changing it.**

**Exit criteria:** ESLint 0 errors; `grep -rn "getattr(settings" backend/src` empty;
`.env.example` field count == Settings field count; `.\verify.ps1` green.

---

## Session 5 — Break the circular dependency

**Goal:** eliminate the `analytics ↔ projects` cycle (B2). **Highest-risk session — give it a
full session and nothing else.**

**Preconditions:** Session 3 complete. Do not attempt this without the characterization net.

**Steps**

1. Map every symbol crossing the boundary, both directions. Known edges:
   `analytics_service.py:10` and `analytics/api/routes.py:16` → projects'
   `fixation_detection_service`; `csv_processing_service.py:15` and
   `fixation_detection_service.py:20` → analytics' `domain/scenario_identity`.
2. **Move, do not rewrite.** Extract the shared pieces — `scenario_identity`, cache-generation
   helpers, fixation primitives — into a neutral module neither side owns. `[S]` commit,
   `git mv`-shaped.
3. Repoint both modules. Separate `[S]` commit.
4. Remove the lazy-import workaround at `projects/api/routes.py:540-547`. Its existence is the
   proof the cycle is real; its removal is the proof the fix worked.
5. **Prevent backsliding:** add an `import-linter` contract encoding the layering and wire it
   into `verify.ps1` as a fifth gate.

**Exit criteria:** import-linter passes; no function-local imports in `projects/api/routes.py`;
app boots (`python -c "from neurodatics.main import app"`); `.\verify.ps1` green.

**Rollback:** delete the branch. Do **not** attempt a partial revert — a half-broken cycle is
worse than the original.

---

## Session 6 — Tombstone the ambiguous surfaces

**Goal:** get runtime evidence on the Tier B candidates. **Instrument now; delete in a later
harvest.**

**Why tombstones and not deletion:** the two remaining candidates cannot be cleared statically.

### The `delivery/` problem — read this before touching any endpoint

`delivery/NeuroDatics-App/` is a **frozen shipped release**: docker image tarballs
(`neurodatics-frontend.tar.gz`), a real `.env`, start/stop scripts, and deployment docs. It
references `google-drive` in its `.env`, `docker-compose.yml` and `NETWORK_DEPLOYMENT.md`.

**An endpoint unused by today's frontend source may still be called by the build the user has
already deployed** — and that frontend is a tarball you cannot grep. This is why the 9 Drive
routes are Tier B, not Tier A.

**Steps**

1. **Add a tombstone helper** (~20 lines) to `backend/src/neurodatics/config/logging.py`: log at
   `WARNING` with a stable prefix, the caller `file:line`, deduped per process. **Log and
   continue in production — never raise.**
2. **Label every site** with date + author + name:
   `TOMBSTONE 2026-09-05 jacob gdrive.sync_folder_scheduled`.
3. **Tombstone the 9 Google Drive route handlers** — *the handlers only*. Re-read DO-NOT-TOUCH
   #1: the module behind them is load-bearing for analytics parquet loading, project deletion,
   upload and executive reports. **The module stays regardless of the outcome.**
4. **Tombstone `workers/entrypoint.py`** (B6). Nothing enqueues today, but Redis is live and
   backs `AnalyticsRedisCache` — keep `infra/queue/redis_connection.py` whatever you decide.
5. **Fire one deliberately and confirm it appears in the logs of both the api and worker
   containers.** The classic failure is concluding "no hits" when the truth was "no logging".
6. **Make the window active, not passive.** A lab tool has bursty usage, so combine a calendar
   window with a deliberate sweep: run the pipelines on a real experiment ZIP, and click every
   screen in the deployed build.

**Exit criteria:** tombstones deployed and verified firing; a harvest date written into
`LEDGER.md`; `.\verify.ps1` green.

### The harvest (2-4 weeks later — a separate short session)

Aggregate the logs by label. Anything with **zero hits across the whole window, including the
active sweep**, becomes Tier A and is deleted under the two-commit rule. Anything with hits is
promoted to "keep" and recorded in `FINDINGS.md` with its hit count.

---

## Session 7 — *(optional)* Split `analytics_service.py`

**Stop and reconsider first.** 3,405 LOC in one file is ugly, but all 10 classes are live and it
works. This buys maintainability, not correctness.

**Preconditions:** Sessions 3 and 5 complete.

1. Split one class per file along the existing seams — already clean, each independently
   consumed (9-36 external refs). Sizes in `FINDINGS.md`.
2. Keep `analytics_service.py` as a **re-export shim** so the ~200 external references keep
   resolving. This makes the change reviewable as a pure move.
3. Migrate importers in a **later, separate** session.
4. `r `-prefixed, `git mv`-shaped commits. No logic edits in a move commit.

**Exit:** no file in `analytics/application/services/` over ~800 LOC; `git diff -M --stat` shows
moves, not rewrites; `.\verify.ps1` green.

---

## Session 8 — *(optional)* Frontend god components

**Preconditions:** Session 4 complete. The frontend has **2.6% coverage** and its e2e spec mocks
the backend — `tsc` and ESLint are the only real signals. Restrict this session to type-guided,
mechanical changes.

1. `EegTab.tsx` (2,381 LOC): extract sub-components and pure helpers, and put each extracted
   helper under `node --test`. This is how frontend coverage grows.
2. Centralize the hand-built blob URLs — 7 components and 1 hook build stimulus image/preview
   URLs inline. Add `getStimulusImageUrl` / `getStimulusPreviewUrl` to `features/*/api/` and
   route all 8 sites through them. *(JSON fetching is already well-centralized; only binary
   media bypasses the layer.)*
3. **The UI library question — strangle, don't swap.** `@base-ui/react` is imported exactly once
   (`components/ui/combobox.tsx:4`). Migrate that one component to `radix-ui`, verify with a
   clean `npm ci` in a scratch copy, then drop the dependency **last**. Add an ESLint
   `no-restricted-imports` rule so the loser cannot return. Do not attempt a bulk swap —
   `shadcn` generates components against a specific primitive library and removing the wrong one
   breaks the whole UI layer in a way `npm run build` may not catch.

**Exit:** `tsc --noEmit` 0; ESLint 0 errors; every extracted helper has a test.

---

## When to stop

Write the exit criteria down in Session 0 and stop when they are met. Suggested:

> Zero knip "unused file" findings in `features/analytics`; `vulture --min-confidence 100`
> clean; `analytics_service.py` under 1,500 LOC; backend suite still 494+ green; ledger closed.

Three brakes:

- **Rule of three.** Two similar analytics tabs do *not* justify inventing a shared abstraction
  mid-campaign; three do. Inventing abstractions during a deletion campaign adds risk while
  claiming to remove weight.
- **Cost of proof.** If clearing a candidate needs a tombstone plus three weeks, or needs the
  876-LOC e2e spec modified, or needs understanding an unfinished feature — park it.
- **Diminishing returns arrive fast.** After the mechanical sweep and the Tier A deletions, most
  of the remaining "weight" is working code that is merely large. Sessions 7 and 8 are cosmetics
  — worth doing only if you are about to build significantly on those files.
