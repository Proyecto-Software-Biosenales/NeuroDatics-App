# Analytics service decomposition — 2026-09-04

Scope: Session 7, authorized by the request to finish Cleanup. The coordinator
verified the 593-test baseline on `codex/cleanup-campaign` before these edits.
Reference implementation: commit `1357069`,
`backend/src/neurodatics/modules/analytics/application/services/analytics_service.py`.
The previous Session 3 snapshots remain protected and unchanged.

## Implementation ownership

| File in analytics/application/services | Responsibility | Lines |
|---|---|---:|
| `analytics_service.py` | Historical exports only | 74 |
| `numeric_helpers.py` | Sampling, smoothing, baseline and scenario/window selection | 102 |
| `pupil_analytics_service.py` | Pupil, gaze and distance analytics | 585 |
| `gsr_analytics_service.py` | GSR analytics | 138 |
| `eeg_analytics_service.py` | EEG time, spectral and topography analytics | 609 |
| `fixation_analytics_service.py` | Persisted duration variants and canonical event service | 608 |
| `fixation_event_reconstruction.py` | Legacy/v2 row reconstruction and event support | 396 |
| `fixation_summaries.py` | Fixation data and histogram summaries | 123 |
| `scanpath_analytics_service.py` | Scanpath analytics | 271 |
| `aoi_analytics_service.py` | AOI geometry and metrics | 507 |
| `heatmap_analytics_service.py` | Heatmap density and overlay rendering | 155 |

The pre-existing comparison, correlation and parquet-reader services remain
unchanged and are also below 800 lines. Implementation modules import their
dependencies directly; none imports the historical `analytics_service` facade.
External importers remain on the facade for a separate future migration.

## The fixation prerequisite

`FixationDurationVariantService.compute_sensitivity` calls the event builder;
the event builder also needs variant selection/metadata. Those two live classes
therefore stay together. Splitting them into separate mutually importing files
would recreate an avoidable cycle.

To keep their file bounded, three existing methods move to the reconstruction
module: `_event_from_run`, `_from_v2`, and `_legacy_events`. Their explicit `cls`
argument, signature and entire function body stay identical. The public class
binds each original function with `classmethod(...)`. Calls to other methods and
constants still resolve on the receiving class, preserving subclass overrides
and monkeypatches rather than binding a private replacement class.

Two focused tests were added and passed against the original monolith before
the move: a patch to the legacy class reaches data, scanpath and histogram
consumers; overriding support duration in a subclass reaches reconstruction.
Both continue to pass after the split.

## Equivalence and diagnostic compatibility

An AST comparison against `1357069` confirms all ten complete class definitions
and six helper functions are identical. The comparison restores only the three
relocated method nodes and their `@classmethod` decorators before comparing the
event class. It does not remove statements, numeric literals, strings, defaults,
annotations or function bodies. Source reads and Git output are decoded as
UTF-8 explicitly to preserve Spanish text and mathematical symbols on Windows.

The facade re-exports the same implementation class objects, numerical helper
functions, constants and historical imported names. Application/test patches
to public class methods continue to affect all consumers.

The campaign's deliberate-mutation diagnostic was the only consumer assigning
to the private `analytics_service._moving_average` name. It now patches the
actual `numeric_helpers._moving_average` before importing the services. The
off-by-one mutation, selected golden test, expected single numerical failure,
restoration and failure checks remain identical. Running the standalone script
still ends with `MUTATION CAUGHT`; no runtime override bridge was added solely
to support the diagnostic, and no golden was regenerated.

## Verification

- Group A: 135 focused tests, all 24 snapshots, and the deliberate mutation check.
- Fixation extraction: 50 focused tests covering variant selection, v2/legacy
  events, numerical characterization and the two compatibility boundaries.
- Combined split: 226 focused tests, all 24 snapshots, including HTTP contracts,
  EEG, event reconstruction, transformed coordinates, heatmap geometry and
  scanpath duration/radius behavior.
- Follow-up heatmap/compatibility validation: 21 tests passed after preserving
  the original function-local SciPy import during import cleanup.
- Ruff passes for the entire services directory; import-linter reports three
  contracts kept and zero broken.

The coordinator owns the final integrated verification and commit/revert ledger.
This session changes no ingestion unit conversion, mathematical policy, route,
response schema, Redis/Drive behavior, or stored numerical snapshot.
