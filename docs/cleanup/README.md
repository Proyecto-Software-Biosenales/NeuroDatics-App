# NeuroDatics cleanup campaign

The app works. This campaign removes dead code, unused weight and broken logic **without
breaking it**, across a series of short, independently revertible sessions.

## The five files

| File | What it is | Who writes it |
|---|---|---|
| `README.md` (this) | The rules. Read first, every session. | Rarely changes |
| `PLAN.md` | The sessions, in order, with exact commands. | Changes only when re-planning |
| `FINDINGS.md` | Evidence base + the **DO-NOT-TOUCH** list. Append-only. | Every session appends |
| `LEDGER.md` | One row per candidate + the session log with SHAs. | Every session updates |
| `mikado.md` | What blocked you, as a prerequisite tree. | Only when something resists |

Keep them separate. Mixing decisions into the checklist is what makes a ledger rot — the
checklist answers *what is left*, `FINDINGS.md` answers *why we concluded that*.

## Starting a session

1. Read `README.md`, then `PLAN.md` for your session number, then the **DO-NOT-TOUCH** list in
   `FINDINGS.md`. Nothing else — do not re-derive the audit.
2. `git switch -c cleanup/NN-short-name` off `dashboard`.
3. Run the four gates and confirm they match the baseline below. **If a gate is already red
   before you touch anything, stop and report it.** You cannot verify a deletion against a
   broken baseline.
4. Work the checklist. Commit after each checkbox, not at the end.
5. Before finishing: run all four gates, update `LEDGER.md` with SHAs, append anything you
   learned to `FINDINGS.md`.

## The verification gate

From Session 0 onward there is **one** command. With no CI in this repo, `verify.ps1` *is* the
CI, and it is the single most important artifact of the campaign:

```powershell
.\verify.ps1        # must print ALL GREEN before and after every session
```

Run it after **every deletion batch**, not just at session end.

Until Session 0 creates it, run the four gates by hand:

```bash
# 1. Backend suite — baseline: 494 passed, ~18-31s
cd backend && PYTHONPATH=src ../.venv/Scripts/python.exe -m pytest -q

# 2. Frontend typecheck — baseline: exit 0, no output
cd frontend && npx --no-install tsc --noEmit

# 3. Frontend unit tests — baseline: 34 pass, ~224ms
cd frontend && npm run test:comparison-click

# 4. Frontend lint — baseline: 40 problems (25 errors, 15 warnings)
cd frontend && npx --no-install eslint .
```

Gate 4 is a **ratchet, not a pass/fail**: the number must never go up. It goes to zero in
Session 2.

### Two environment traps

- **Use the ROOT `.venv`, not `backend/.venv`.** `backend/.venv` holds ~22 packages and has no
  pytest, pandas, numpy or scipy. Running it gives `No module named pytest`, which looks like a
  broken suite but is just the wrong interpreter.
- **Diff with `--ignore-cr-at-eol`.** The repo has CRLF/LF churn; a plain `git diff` overstates
  backend changes and will make a small deletion look enormous.

## Hard rules

1. **Evidence before deletion — an intersection, never one tool.** A static tool saying
   "unused" is a *candidate*. Confirm with `git grep` for the bare symbol name across
   `backend/`, `frontend/`, `docs/`, `docker-compose*.yml` **and `delivery/`** — string
   references, config keys, RQ job names and route paths do not look like imports. See the
   deletion tiers in `PLAN.md`.
2. **Never weaken a test to make it pass.** If a test breaks, either the deletion was wrong or
   the test documented real behaviour. Both mean: revert and record it in `FINDINGS.md`. The one
   legitimate test change is deleting a test in the *same commit* as the code it exclusively
   covered — and the commit body must say so.
3. **Never regenerate a golden to make it pass.** `--snapshot-update` on a red characterization
   test converts the safety net into a rubber stamp while leaving everything green. This is the
   single failure mode most likely to destroy this campaign.
4. **One category per commit**, and split every removal into "make unused" then "delete".
5. **Delete, don't comment out.** Git is the archive; put the retrieval command
   (`git show <sha>:path`) in the ledger row.
6. **Structural and behavioural changes never share a commit.** Prefix subjects `r `/`R `/`d `/`F `
   (see `PLAN.md`).
7. **Cap each session at 6 commits and end on green.** An unfinished session that ends green is
   a success. A finished session that ends red is not.
8. **When something resists — >30 minutes or >3 files — revert and record.** `git checkout .`,
   do *not* stash, do *not* fix forward. Write what blocked you into `mikado.md` as new leaves
   and do a leaf instead.

## Rollback

Every session is one branch. If it goes wrong:

```bash
git switch dashboard && git branch -D cleanup/NN-short-name
```

Nothing else in the campaign depends on an abandoned session except where `PLAN.md` says so
explicitly.
