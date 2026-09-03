# Frontend Tier A evidence — 2026-09-03

Both S0 Knip reports (`../baselines/knip.md` and `knip-production.md`) identify the
same 13 unused files. No App Router entry overrides were configured. The following
subgraphs have no incoming references from live code, framework entrypoints, tests,
deployment text or configuration. This records the already-unused stage before deletion.

| Files under `frontend/` | Reference evidence | Decision |
|---|---|---|
| `features/reports/select-report-content/useReportContent.ts` | Bare exported symbol and folder path: definition only | Delete |
| `features/reports/select-sensors/useSelectedSensors.ts` | Bare exported symbol and folder path: definition only | Delete |
| `features/reports/select-report-type/useReportType.ts` | Bare exported symbol and folder path: definition only | Delete |
| `features/projects/select-project/useSelectedProject.ts` | Bare exported symbol and folder path: definition only | Delete |
| `features/projects/hooks/useProjectApi.ts` | Actual export is `useProjectsApi` (plural); definition only | Delete |
| `features/reports/components/ReportContentCard.tsx` | Bare exported symbol and path: definition only | Delete |
| `components/ui/SelectTrigger.tsx` | Bare exported symbol and path: definition only | Delete |
| `components/ui/SelectOption.tsx` | Bare exported symbol and path: definition only | Delete |
| `features/analytics/components/PupilStatsSection.tsx`, `components/ui/MetricCard.tsx`, `components/ui/PeaksTable.tsx` | Only the orphan PupilStatsSection imports MetricCard and PeaksTable; no references enter this subgraph | Delete together |
| `components/ui/item.tsx`, `components/ui/separator.tsx` | Only orphan item imports this Separator; other `Item`/`Separator` hits are members of Radix/Base UI primitives, not these exports | Delete together |

## Commands and inspected results

For every exported symbol and module basename, including `useProjectsApi` and every
`Item*` export:

```powershell
git grep -n -w <symbol> -- backend frontend docs 'docker-compose*.yml' delivery
git grep -n -E <module-path-or-folder> -- backend frontend docs 'docker-compose*.yml' delivery
rg -l --hidden --no-ignore -i <symbols-and-module-paths> delivery --glob '!*.tar.gz'
```

The deployment tree is ignored by Git, so the last command is necessary. It scans
hidden text including `.env` but prints filenames only, never secret values. It
returned no matches. Frozen image archives cannot establish source imports and
remain untouched; none of these deletions removes a backend route or API contract.

`MetricCard`, `PeaksTable` and `Separator` are the three additions beyond the original
D2 list. Both static reports and the manually verified subgraph agree on their removal.

## Corrections to original D2 findings

- **Keep `features/home/index.ts`.** `app/page.tsx:11` imports the barrel.
- **Keep `features/projects/create-project/index.ts`.** `app/proyectos/page.tsx:13`
  and `features/projects/components/ProjectsEmptyContainer.tsx:2` import the barrel.
- The four `select-*` hooks represent the old **reports selection flow**, not an
  earlier project-creation wizard. `app/reportes/page.tsx` owns the current selected
  project, report mode, participant and sensor state directly. The wizard manages
  upload, participants and scenario configuration and was not their replacement.

No exports/call sites need removal from live files: these 13 files are already an
unreachable subgraph. Preserve all runtime dependencies and all remaining exports.

## Verification before deletion

- S0 `verify.ps1`: ALL GREEN (root coordinator).
- Frontend baseline: TypeScript exit 0; 38 tests (34 before S0 script repair).
- ESLint baseline: 25 errors, 15 warnings. Deleting the orphan useProjectsApi should
  remove one `react-hooks/set-state-in-effect` error.

After the deletion commit, retrieve any removed file with
`git show <deletion-commit>^:frontend/<path>`; revert the deletion commit to restore
the complete subgraph.
