# S8 UI primitive consolidation

## Scope and evidence

The app has four live selectors in three consumers: project selection,
analytics scenario/participant filters, and report participant selection.
They use only `Combobox`, `ComboboxTrigger`, `ComboboxValue`, `ComboboxContent`,
`ComboboxList` and `ComboboxItem`, with string values and single selection.

`git grep` across backend, frontend, docs, delivery and compose files found no
consumer of the wrapper's editable input, chips, multiple-selection controls,
groups, collection, empty state, separator or anchor hook. TypeScript also passed
after those unused exports were removed. No live text filtering or multi-select
feature is replaced by a single selector.

The installed `radix-ui` already supplies `Select`. Its documented capabilities
include controlled values, keyboard navigation, typeahead, managed focus,
placeholders and portaled positioning. See the [official Radix Select documentation](https://www.radix-ui.com/primitives/docs/components/select).
Radix's single selector is sufficient for these actual consumers; this change does
not claim a general replacement for Base UI's editable/multiple combobox API.

## Make-unused stage

The wrapper now delegates to Radix Select and retains the six consumed names,
data-slot selectors, menu appearance and bottom/start positioning with a six-pixel
offset. `null` maps to Radix's empty value. Participant trigger text still displays
the original participant code; project triggers still display the project name,
with sensor badges preserved inside the option menu. Project options have explicit
text values so typeahead searches names rather than internal project IDs.

Two intended accessibility behaviors were absent from the previous markup in the
initial browser harness: typing a project name did not select it, and report
`value=''` showed an empty trigger instead of its supplied placeholder. Both
expectations pass after migration. Existing successful selection, cancellation,
disabled-state and focus behavior remains covered.

An ESLint `no-restricted-imports` rule prevents new Base UI imports. The dependency
and lockfile remain installed during this stage so it can be committed and reviewed
before removing package entries.

## Verification

`tests/components/combobox.test.mjs` runs in standalone Chromium with the real
React, Radix packages and three real consuming components. It does not mock
primitives or replace their focus/keyboard handling. The seven tests cover:

- Placeholder, rich option content, controlled value, selected state and focus return.
- Combobox/listbox roles, `aria-controls`, expanded state and portal placement.
- Arrow opening, Home/End selection, Enter, Escape cancellation and Tab progression.
- Typeahead by project name.
- Scenario `all` and null participant semantics.
- Empty/loading analytics selectors and report loading state.
- Report selection nested inside the existing radio label.

The existing `test:hooks` gate now includes these component tests: **13 passed**
(six existing hook tests plus seven selector tests). TypeScript and targeted ESLint
passed. Keyboard checks explicitly wait for the primitive's asynchronous focus
movement before sending the next key; final selection assertions remain strict.

The final deletion stage requires a clean `npm ci` and tests in an isolated scratch
copy. Current workspace `node_modules` must remain untouched during parallel work.
