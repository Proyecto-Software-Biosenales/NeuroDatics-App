# S5 shared contracts and import boundaries

Verified 2026-09-03. This change removes the dependency cycle between numerical
analytics and project processing services. It does not claim complete independence
between the projects and analytics feature modules.

## Contract extraction

Commit `1aa864c` moved these implementations to `neurodatics.shared`:

- `scenario_identity`: normalization, resolution, ambiguity exception and constants.
- `cache_generation`: normalization, generation tokens and project generation access.
- `fixation_contract`: seven persisted version/sentinel/duration/column constants,
  `validate_fixation_min_duration_ms` and `fixation_duration_column`.

The former analytics domain modules remain public compatibility re-exports.
`fixation_detection_service.py` still exposes its previous public names and retains
the entire detector implementation. The new contracts have no feature-module imports.

An AST comparison against the preceding HEAD confirmed identical scenario/cache
implementations and identical detector class/helper bodies. Focused verification
passed 187 tests, including all numerical goldens and HTTP snapshots.

## Repointed consumers

Commit `48fb298` changed imports in 11 files: main, both processing services, the
upload use case, analytics routes/services/reader/caches, reports and project routes.
An AST comparison after removing import nodes found no other code differences.

Project routes now import scenario resolution, pupil analytics and parquet reading
at module scope. Two redundant local `Path` imports were also removed; the existing
module-level `Path` import supplies them. An AST scan found no remaining function-local
imports in `projects/api/routes.py`.

Three fresh Python processes successfully imported project routes, analytics routes,
or CSV processing first and then booted the application. Each exposed 53 HTTP
operations (57 total route objects when framework documentation routes are included).
The complete backend suite passed: 593 tests and all 24 snapshots.

## Enforced boundaries

`backend/.importlinter` enforces three forbidden-import contracts, including indirect
imports and with no ignored edges:

| Importing code | Forbidden dependency |
|---|---|
| `neurodatics.modules.analytics` | `neurodatics.modules.projects.application` |
| `neurodatics.modules.projects.application.services` | `neurodatics.modules.analytics` |
| `neurodatics.shared` | `neurodatics.modules` |

The same provisional contracts were exercised before repointing. They reported
two broken contracts and identified exactly four direct imports: analytics routes
and analytics services imported the detector, while CSV processing and the detector
imported analytics scenario identity. After repointing: **3 kept, 0 broken**.
The graph contained 154 files and 183 dependencies. This is a tested negative-to-positive
check of the boundary, not just an unused lint configuration.

`verify.ps1` invokes `lint-imports --no-cache` after the backend boot check and fails
if a contract breaks. Existing backend, frontend and hook gates remain in place.

## Intentional remaining dependencies

- Analytics routes and `ParquetReaderService` still consume `projects.domain.entities`
  (`Project` and/or `ProjectFile`) to resolve ownership and persisted artifacts.
- Project API video preview consumes `PupilAnalyticsService` and `ParquetReaderService`.
- The project upload use case consumes analytics parquet/Redis caches for cache lifecycle.
- Reports consume analytics services and project entities.

Those are reachable integration surfaces, not dead code or accidental imports.
Separating their ownership would be a larger architectural change and is outside S5.
Legacy public import paths remain available through the compatibility modules.

## Remaining validation limits

The synthetic characterization corpus validated this structural move without changing
numeric outputs. The cleanup requirement for an approved real experiment remains
pending; no field or deployed-container validation is claimed.

S7 remains optional and was not implemented here. A preliminary class dependency
scan found a mutual dependency between `FixationDurationVariantService` and
`FixationEventService`. Splitting those two into independent files therefore needs
an explicit prerequisite decision, rather than treating every class as an isolated move.
