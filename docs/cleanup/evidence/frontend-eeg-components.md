# S8 EEG component decomposition — 2026-09-04

The continuation finishes the component extraction deferred by the first S8 pass.
`EegTab.tsx` now has 590 lines, down from 2,195 after the pure-helper extraction
(2,381 before the campaign). Its hooks, selected channels, signal mode, selected
time/frame, independent time-window state, derived data and event handlers remain
in the same component so switching views preserves their existing lifetime.

## Seams and sizes

All new files live under `frontend/features/analytics/components/eeg/`:

| Module | Responsibility | Lines |
|---|---|---:|
| `EegCanvasPanels.tsx` | Spectrogram canvas, topography canvas and stimulus scene | 477 |
| `EegStatsTables.tsx` | Existing three statistics tables | 178 |
| `EegTooltips.tsx` | Existing timeseries and PSD tooltips | 68 |
| `eegViewShared.ts` | Existing channel constants and shared types | 55 |
| `EegTimeseriesView.tsx` | Timeseries controls, chart, stimulus and statistics JSX | 434 |
| `EegPsdView.tsx` | PSD controls, chart and statistics JSX | 249 |
| `EegSpectrogramView.tsx` | Spectrogram controls, canvases, stimulus and statistics JSX | 240 |
| `EegTopographyView.tsx` | Topography controls, scene, slider and electrode values JSX | 236 |

No shared UI abstraction was introduced. The four view components are stateless
presentation boundaries with explicit compiler-derived props. Existing conditionals,
element order, class names, event bindings, fetch arguments and canvas calculations
are preserved. The previously extracted pure helpers are unchanged.

## Equivalence and verification

A one-off TypeScript AST comparison against `af23322^` (before this decomposition)
confirmed:

- All 47 statements before EegTab's return are byte-equivalent after line-ending
  normalization: state, fetch hooks, derived calculations and handlers.
- All 23 moved existing declarations match their originals except `export`.
- All 10 original conditional JSX branches match their extracted counterparts.
- Every one of the 81 view props maps to the same-named original variable.

Each extraction leaf passed TypeScript and scoped ESLint. The existing six comparison
browser tests passed. The new `frontend/tests/e2e/eeg-dashboard.spec.ts` passes against
the actual dashboard and real UI with controlled API responses; it exercises all four
EEG views, channel deselection, raw signal mode, independent timeseries/PSD windows,
spectrogram selection and topography frame changes, then checks state persistence and
absence of browser exceptions. Its initial setup failure was a mock mismatch for the
existing `/api/projects/` trailing slash; fixing that mock required no production edits.

The numerical service outputs are not validated by this mocked-API browser test;
backend characterization remains a separate gate. No production behavior change or
golden regeneration was needed for this extraction.
