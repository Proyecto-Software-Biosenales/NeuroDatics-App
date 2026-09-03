# Analytics request state — 2026-09-03

## Reproduction before the change

The harness runs the real hooks, React and ReactDOM in installed Playwright Chromium;
only AnalyticsApi responses are controlled. No production server or new dependency
is needed. Three tests failed deterministically in 1.4 seconds on the S2 source:

1. Clearing a project left its previous participants in the selection list.
2. Selecting participant P02 left P01's loaded series visible while P02 loaded.
3. Clearing the participant during a pending request left `loading: true` forever.

Ranked explanations were state not associated with selection, cancelled completion
skipping loading resets, and late network responses overwriting current data. The
first two reproduced; the existing cancellation guard already protected the third
and remains covered by a passing regression test.

## Change

Twenty JSON loaders share a private request-state hook. Its request identity is the
memoized loader callback with every original API argument in its dependencies.
Changing or disabling a request resets data, error and loading during render before
children can display values for the old selection. Effects only request data and
publish asynchronous completion; their cleanup guards ignore superseded responses.
The heatmap uses the same state boundary and retains explicit object-URL cleanup
and the required ingestion-generation guard. Empty participant/scenario arrays have
stable references. Public hook names, parameters and return shapes are preserved.

This follows React's documented guarded adjustment when props change:
https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes

## Verification

- The three failing reproductions now pass.
- `npm run test:hooks`: 6 passed, including late responses, unchanged request
  identity, clearing errors, reselecting a request, heatmap generation and blob
  revocation. Chromium is required; absence fails instead of silently skipping.
- `npm run test:e2e:comparison`: existing 6 browser tests passed. This validates
  frontend behavior only; it does not validate the backend's numeric services.
- `npx --no-install tsc --noEmit`: exit 0.
- ESLint: 22 errors / 8 warnings before, 7 errors / 8 warnings after. All 15
  remaining set-state-in-effect errors are resolved without suppression. The 7
  remaining errors are the separately planned `any` fixes.
- `useAnalyticsData.ts` shrank from 1,132 to approximately 636 lines.

The previously orphaned useProjectsApi hook supplied the sixteenth original
set-state-in-effect error and was removed with the S1 evidence-backed subgraph.
