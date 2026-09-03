# Mikado graph

Cross-session memory for work that **resisted**.

## The loop

1. Attempt the goal naively.
2. If it needs more than ~30 minutes or touches more than ~3 files: **`git checkout .`**.
   Revert — do not stash, do not fix forward.
3. Write what blocked you below as new prerequisite leaves.
4. Do a *leaf* instead. Leaves are small by construction.
5. Repeat. The goal becomes reachable when its leaves are done.

Reverting is the point. The knowledge is the output of a failed attempt, not the diff.

**On the frontend, `tsc` generates the graph for you:** delete an export, run
`npx --no-install tsc --noEmit`, and the error list *is* the prerequisite tree. Revert, record
the errors as leaves, do the leaves. It never lies about static references — though it says
nothing about dynamic ones.

## Notation

- `[ ]` open leaf — ready to attempt
- `[~]` blocked — has its own children
- `[x]` done

---

## Goal: `analytics_service.py` under 1,500 LOC

- [~] Split the 10 service classes into one file each
  - [ ] Prerequisite: break the `analytics ↔ projects` cycle *(Session 5)*
  - [ ] Prerequisite: characterization goldens for the numeric services *(Session 3)*
  - [ ] Prerequisite: decide whether the re-export shim is permanent or temporary

## Goal: one UI primitive library

- [~] Drop `@base-ui/react`
  - [ ] Prerequisite: port `components/ui/combobox.tsx` to `radix-ui`
  - [ ] Prerequisite: confirm which library `shadcn` generated the rest of `components/ui/`
        against — removing the wrong one breaks the whole UI layer
  - [ ] Prerequisite: verify with a clean `npm ci` in a scratch copy, not in place

## Goal: delete the 9 Google Drive route handlers

- [~] Blocked on runtime evidence
  - [ ] Prerequisite: tombstones deployed and confirmed firing *(Session 6)*
  - [ ] Prerequisite: 2-4 week window elapsed, including an active sweep
  - [ ] Prerequisite: confirm the shipped `delivery/` frontend build does not call them

---

*(Add new goals as they arise. A leaf that turns out to have children becomes `[~]`.)*
