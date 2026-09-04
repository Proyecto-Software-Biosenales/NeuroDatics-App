# S8 bounded frontend extraction — 2026-09-03

## EEG presentation helpers

The TypeScript AST extracted 15 pure functions, three types and the two Viridis
constants from `EegTab.tsx` into `features/analytics/eegPresentation.ts`. Their bodies
are unchanged; only `export` and the component's imports were added. The component
shrunk from 2,381 to 2,195 lines. No JSX or component state was rewritten.

Five tests first passed against the extracted original bodies and then against the
committed helper. They pin finite sample filtering, sample standard deviation,
median without mutation, the existing 5–20% baseline window, peak calculation,
formatting, color interpolation, topography interpolation/rotation, and click-time
extraction. Independent review confirmed exact declaration equivalence.

## Stimulus URLs

`features/projects/api/stimulusUrls.ts` owns the image and preview path builders.
Nine consumer files were migrated in three groups of three: the projects API plus
seven analytics components and the comparison hook. Only URL construction changed.
Fetch, error handling, cancellation, object-URL lifetime and response parsing remain
in their existing call sites.

Five tests pin the original paths, query order, Unicode/space/plus encoding, empty
options and the distinction between omitted time and explicit `time_s=0`:

- The projects API retains its positive-time-only preview behavior.
- Analytics retains explicit timestamps including zero and optional participant
  and scenario parameters in their existing order.
- Heatmap ingestion-generation and transform-fingerprint behavior belongs to its
  separate analytics endpoint and was not changed by these stimulus helpers.

Every group passed TypeScript, focused unit tests and ESLint with no new warnings.
The unit suite grows from 38 to 48 tests across these two extractions. The root
coordinator runs the complete verification and browser e2e gates after integration.

## Deliberately deferred

The remaining JSX/state in EegTab is live and lacks component-level characterization;
further extraction is optional. `@base-ui/react` stays: replacing the UI primitive
library requires a product decision and was not authorized as an automatic swap.
