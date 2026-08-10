# Batch 5A: screen-to-stimulus coordinate contract

Status: **proposed; approval required before Batch 5B**  
Contract version: `screen-stimulus-v1`  
Scope: design only; this document changes no production behavior.

## Decision summary

1. A stimulus placement is distinct from the existing physical `ScreenGeometry` used for angular fixation detection.
2. The v1 placement is static for one scenario within one project/upload and is shared by that project's recordings. A constant viewport and constant scroll offset are supported. Time-varying scroll, zoom, moving stimuli, or participant-specific placements are not represented by v1 and must not be treated as transformed.
3. All transform operands use one continuous, top-left-origin screen-pixel space: positive X points right and positive Y points down.
4. The resolved displayed stimulus rectangle is authoritative. `display_mode` records and validates how that rectangle was produced; it never selects a different transform equation.
5. The required transform is:

   ```text
   x_stimulus = (x_screen - stimulus_left) / stimulus_width
   y_stimulus = (y_screen - stimulus_top) / stimulus_height
   ```

6. The transform and stimulus/viewport eligibility mask are resolved before fixation detection. Detection keeps a dual-space representation: physiological classification uses screen-space coordinates, while fixation centroids and every spatial analytic use stimulus-local coordinates.
7. A coordinate outside `[0,1]`, or outside the visible viewport, is invalid for stimulus analytics. It is never clipped. Off-stimulus intervals are hard, non-bridgeable boundaries.
8. When placement metadata is absent, existing screen-normalized behavior remains numerically unchanged, but provenance reports a warned legacy passthrough. Missing metadata is never interpreted or persisted as fullscreen.
9. Original parsed `gx` and `gy` values remain unchanged in persisted Parquet data for auditability. Derived screen-pixel and stimulus-local columns are additive.

## Repository fit

- `Scenaries.width` and `Scenaries.height` are intrinsic media dimensions, not acquisition display dimensions (`modules/scenaries/domain/entities.py`). They remain unchanged.
- The current `ScreenGeometry` contains pixel dimensions, physical millimetres, and viewing distance for angular detection (`projects/application/services/fixation_detection_service.py`). It remains a separate calibration model.
- Gaze and fixation samples are stored in processed Parquets, while SQL stores project, scenario, and `ProjectFile.file_metadata` records. There is no SQL fixation-event table.
- CSV processing currently runs before scenario objects are constructed. Batch 5B must resolve/probe selected stimulus files and their placement map before calling `CsvProcessingService.process`, or otherwise supply the complete map to that call.
- AOIs, scanpaths, fixation responses, and heatmaps already converge on the canonical fixation-event table. Raw-gaze AOI metrics and gaze-at/timeseries paths are separate consumers and must also select stimulus-local columns when a transform was applied.

## 1. Acquisition-time data contract

### 1.1 Transport shape

Each selected stimulus is keyed by its unique archive `source_entry_path`, not by its display name or file stem.

```json
{
  "source_entry_path": "Images/centered-square.png",
  "placement": {
    "geometry_stability": "static",
    "contract_version": "screen-stimulus-v1",
    "screen_width_px": 1920,
    "screen_height_px": 1080,
    "stimulus_left_px": 420.0,
    "stimulus_top_px": 0.0,
    "stimulus_width_px": 1080.0,
    "stimulus_height_px": 1080.0,
    "display_mode": "contain",
    "viewport": {
      "left_px": 0.0,
      "top_px": 0.0,
      "width_px": 1920.0,
      "height_px": 1080.0,
      "scroll_x_px": 0.0,
      "scroll_y_px": 0.0
    }
  }
}
```

### 1.2 Field definitions

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `geometry_stability` | enum | yes | Placement declaration: `static` is accepted by v1; `time_varying` is rejected before processing with `dynamic_stimulus_geometry_not_supported`. |
| `contract_version` | literal string | yes | Must equal `screen-stimulus-v1`. |
| `screen_width_px` | positive integer | yes | Width of the coordinate space used by the eye-tracker gaze pair. |
| `screen_height_px` | positive integer | yes | Height of the coordinate space used by the eye-tracker gaze pair. |
| `stimulus_left_px` | finite number | yes | Effective X position of the full rendered stimulus's top-left corner in screen coordinates. May be negative. |
| `stimulus_top_px` | finite number | yes | Effective Y position of the full rendered stimulus's top-left corner in screen coordinates. May be negative. |
| `stimulus_width_px` | positive finite number | yes | Full displayed width before viewport clipping; this is `stimulus_width` in the required equation. |
| `stimulus_height_px` | positive finite number | yes | Full displayed height before viewport clipping; this is `stimulus_height` in the required equation. |
| `display_mode` | enum | yes | `contain`, `cover`, `crop`, or `fullscreen`. |
| `viewport` | object or null | conditional | Screen-space clipping rectangle and constant scroll snapshot. Omission means the screen rectangle is the visibility clip. |
| `viewport.left_px`, `top_px` | finite number | with viewport | Top-left of the visible clipping rectangle in screen coordinates. |
| `viewport.width_px`, `height_px` | positive finite number | with viewport | Size of the visible clipping rectangle. |
| `viewport.scroll_x_px`, `scroll_y_px` | non-negative finite number | optional pair with viewport | Constant acquisition scroll in displayed-pixel units. The pair may be omitted together, in which case both values resolve to zero; supplying only one is invalid. |
| `source` | enum | persisted only | `user_config` or `acquisition_metadata`. The backend assigns it; ordinary clients cannot claim acquisition provenance. |

`stimulus_left_px` and `stimulus_top_px` are already the effective post-scroll origin. Scroll is retained for provenance and must not be added a second time. In the general case:

```text
stimulus_left_px = unscrolled_stimulus_left_px - scroll_x_px
stimulus_top_px  = unscrolled_stimulus_top_px  - scroll_y_px
```

The unscrolled origin is not persisted in v1 because it is not an operand of the required transform. When an unscrolled stimulus is aligned to the viewport, it happens to equal the viewport origin.

The raw eye-tracker unit is block metadata, not part of placement. Before applying the contract, ingestion must resolve it explicitly as `pixels`, `percent`, or `normalized` and persist that decision. Auto-inference may be retained only as warned compatibility behavior; declared units take precedence.

### 1.3 Mode semantics and validation

The stored rectangle is always the value used by the equation.

| Mode | Contract meaning | Validation |
| --- | --- | --- |
| `contain` | The entire stimulus is visible inside the viewport/screen; letterbox or pillarbox may remain. | The displayed rectangle must lie inside the clip. Intrinsic dimensions are required and their aspect ratio must be preserved within the defined tolerance below. Centering is common but not required because an explicit offset is valid. |
| `cover` | The aspect-preserved stimulus covers the viewport, with excess content clipped. | A viewport and intrinsic dimensions are required; the displayed rectangle must cover it and preserve intrinsic aspect ratio within the defined tolerance below. Negative origin is valid. |
| `crop` | An explicit portion of a rendered stimulus is visible through a clipping viewport. | A viewport is required and must have positive intersection with the displayed rectangle. The full displayed rectangle, not merely the visible crop, must be stored. |
| `fullscreen` | The stimulus content itself occupies the complete screen rectangle. This does not mean merely that the browser or presentation app was fullscreen. | Must be explicitly selected and resolve to `(left, top, width, height) = (0, 0, screen_width, screen_height)` with zero scroll. Its viewport must be absent or exactly the full screen. Never inferred. |

Common validation rules:

- Required placement fields are atomic: a partial placement is a request error, not a legacy fallback.
- Every number must be finite. Screen and displayed sizes must be positive.
- The four viewport rectangle fields are all-or-none, have positive size, and lie within the screen. Within a viewport, the scroll pair is either omitted/default-zero or supplied in full.
- The displayed rectangle must intersect the screen and, when present, the viewport.
- For `contain` and `cover`, probed intrinsic width and height must be available and positive. If probing produces no size, reject the entry with `422 intrinsic_dimensions_required_for_display_mode`; do not accept an unverified aspect-preserving claim. The aspect ratio is preserved when `abs((display_width / display_height) / (intrinsic_width / intrinsic_height) - 1) <= 1e-4`. A larger relative error is rejected rather than silently relabelled. `crop` and `fullscreen` remain valid without intrinsic dimensions because their v1 invariants are defined entirely by the resolved rectangles.
- If the separate physical `ScreenGeometry` is also supplied, its pixel width and height must exactly match the placement screen dimensions. Placement-only metadata does not enable angular detection; physical width, physical height, and viewing distance are still required for that.
- Duplicate `source_entry_path` entries, paths outside the selected media set, unsupported versions, and ambiguous scenario-to-media matches are rejected before processing.

### 1.4 Canonical fingerprint

`contract_fingerprint` is reproducible across services:

1. Validate the placement and materialize semantic defaults: an omitted viewport becomes the full screen, and an omitted scroll pair becomes `(0,0)`.
2. Serialize the resolved placement object, including `geometry_stability`, `contract_version`, screen, stimulus rectangle, `display_mode`, resolved viewport/scroll, and backend-assigned `source`, using RFC 8785 JSON Canonicalization Scheme. `source_entry_path` is an envelope identity and is not included.
3. Hash its UTF-8 bytes with SHA-256 and encode lowercase hexadecimal.

Object key order, equivalent omitted/default values, and equivalent JSON numbers such as `420` and `420.0` therefore do not change the fingerprint; any changed resolved operand, mode, version, or provenance source does. The backend is the sole fingerprint authority; clients treat it as opaque and never submit it.

### 1.5 Static-v1 boundary

One persisted v1 placement applies for the full scenario. This is valid for static images, videos that do not move their presentation box, and pages captured at one constant scroll offset. An accepted entry must declare `geometry_stability=static`.

If placement, viewport, scroll, zoom, or stimulus position changes during a recording, the v1 contract is insufficient. A request declaring `geometry_stability=time_varying`, or a trusted acquisition parser detecting multiple placement states for one scenario across or within recordings or any geometry-change event, is rejected before CSV processing with `422 dynamic_stimulus_geometry_not_supported`; it must not fall through to missing-metadata legacy behavior. Batch 5B must not collapse such telemetry to one average/static rectangle or claim `status=applied`. Supporting it requires time-ranged placement records keyed to participant/recording, per-sample resolution, and an explicit policy for fixations spanning geometry changes. That extension requires a new contract version and approval.

## 2. Equations and validity

### 2.1 Canonicalize raw gaze to screen pixels

Let the untouched source values be `gx` and `gy`.

```text
pixels:     x_screen = gx
            y_screen = gy

percent:    x_screen = (gx / 100) * screen_width_px
            y_screen = (gy / 100) * screen_height_px

normalized: x_screen = gx * screen_width_px
            y_screen = gy * screen_height_px
```

The existing `(0,0)` tracker-loss heuristic is evaluated against the raw acquisition pair before the stimulus transform. A legitimate screen point at `(stimulus_left, stimulus_top)` maps to stimulus `(0,0)` and must not be rejected merely because the transformed pair is zero.

### 2.2 Required screen-to-stimulus transform

```text
x_stimulus = (x_screen - stimulus_left_px) / stimulus_width_px
y_stimulus = (y_screen - stimulus_top_px) / stimulus_height_px
```

The result is a top-left-origin fraction of the full stimulus. `0` and `1` are valid boundaries.

### 2.3 Visibility and analytic validity

With no viewport, use the screen rectangle as the clip. With a viewport:

```text
in_viewport =
    viewport_left_px <= x_screen <= viewport_left_px + viewport_width_px
    and
    viewport_top_px <= y_screen <= viewport_top_px + viewport_height_px
```

```text
in_stimulus =
    0 <= x_stimulus <= 1
    and
    0 <= y_stimulus <= 1
```

```text
valid_for_stimulus =
    raw_pair_is_valid
    and time_is_valid
    and point_is_inside_screen
    and in_viewport
    and in_stimulus
```

Rules:

- Values outside `[0,1]` may be persisted in derived audit columns, but are invalid for every analytic.
- No transform, cleaning, fixation, AOI, scanpath, heatmap, report, or frontend renderer may clip an invalid coordinate onto an edge.
- A point can be within `[0,1]` yet outside the viewport; it is still invalid because that content was not visible.
- `NaN`, infinity, an incomplete gaze pair, or a non-positive transform denominator is invalid. Non-positive denominators are rejected at contract validation time.
- Persist one primary invalid reason rather than conflating all cases. Precedence is deterministic: `signal_missing` (including the configured raw zero-pair heuristic), then `time_invalid`, `outside_screen`, `outside_viewport`, and finally `outside_stimulus`.

For a scenario/time-scoped response, `rejected_outside_count` is the number of unique source rows whose raw pair and time were otherwise valid but whose primary reason is `outside_screen`, `outside_viewport`, or `outside_stimulus`. `rejected_outside_by_reason` contains the three disjoint primary-reason counts, so their sum equals the total. Both values are `null` when placement metadata is missing because stimulus rejection was not measurable.

## 3. Position relative to fixation detection

The approved processing boundary is dual-space:

```text
raw gx/gy (unchanged)
  -> resolve input units
  -> canonical screen pixels
  -> stimulus transform + viewport/stimulus validity
  -> fixation eligibility/segmentation
  -> fixation classification in screen space
  -> event centroid in stimulus-local space
  -> AOI / scanpath / heatmap / report
```

Detailed behavior:

1. Resolve raw units and preserve both raw and canonical screen coordinates.
2. Transform every sample and establish `valid_for_stimulus` before detector resampling or classification. This prevents letterbox and cropped-out gaze from becoming fixation support.
3. Treat `outside_screen`, `outside_viewport`, and `outside_stimulus` as hard, non-bridgeable boundaries. Only eligible tracker-loss gaps may use the detector's bounded internal bridge, and bridged source rows remain invalid as today.
4. Use screen-normalized coordinates for normalized I-DT classification and screen physical geometry for angular I-VT classification. Scaling a 1080-pixel stimulus to `[0,1]` must not change the physiological threshold relative to the same gaze motion on a 1920-pixel screen.
5. Compute each accepted event's median centroid from its valid stimulus-local samples. Persist/API `fix_x`, `fix_y`, `x_norm`, and `y_norm` therefore refer to stimulus space.
6. A fixation event cannot cross an off-stimulus interval or scenario boundary. Off-stimulus rows receive no `fixation_id`, AOI hit, scanpath node, dwell contribution, or heatmap weight.

This preserves the current detector's screen/visual-angle meaning while ensuring all spatial outputs share the AOI/stimulus coordinate system.

Batch 5B therefore makes the detector input split explicit:

- `ScreenPixelSize(width_px, height_px)` is sufficient to canonicalize pixel/percent/normalized screen gaze and comes from the placement contract.
- The existing physical calibration becomes a separate optional `PhysicalScreenGeometry(width_px, height_px, width_mm, height_mm, viewing_distance_mm)` used only by angular classification.
- `FixationDetectionMetadata` accepts both concepts independently and validates matching pixel dimensions when both exist.
- Declared pixel gaze no longer requires physical millimetres or viewing distance. Supplying placement pixels alone continues to use normalized screen-space classification and must not silently enable angular mode.

## 4. Persisted data model

### 4.1 SQL model

Add a one-to-one `stimulus_placements` table rather than repurposing intrinsic scenario fields or adding a partially nullable tuple directly to `scenaries`.

| Column | Proposed SQL type | Rules |
| --- | --- | --- |
| `id` | UUID PK | Standard generated ID. |
| `scenaries_id` | UUID FK, unique | References `scenaries.id`, `ON DELETE CASCADE`. Row absence means placement unavailable. |
| `contract_version` | varchar(40) | `screen-stimulus-v1`. |
| `geometry_stability` | varchar(20) | Must be `static`; time-varying geometry is rejected before persistence in v1. |
| `screen_width_px`, `screen_height_px` | integer | Positive. |
| `stimulus_left_px`, `stimulus_top_px` | double precision | Finite; negative allowed. |
| `stimulus_width_px`, `stimulus_height_px` | double precision | Finite and positive. |
| `display_mode` | varchar(20) | Check in `contain`, `cover`, `crop`, `fullscreen`. |
| `viewport_left_px`, `viewport_top_px` | double precision nullable | All viewport fields null or all present. |
| `viewport_width_px`, `viewport_height_px` | double precision nullable | Positive when present. |
| `scroll_x_px`, `scroll_y_px` | double precision nullable | Non-negative; null without viewport, zero by default with viewport. |
| `source` | varchar(32) | `user_config` or `acquisition_metadata`. |
| `contract_fingerprint` | char(64) | SHA-256 of canonical contract JSON for artifact provenance and cache keys. |
| `created_at`, `updated_at` | timestamptz | Standard model timestamps. |

Application validation enforces mode-specific geometric invariants that are awkward to express with floating-point SQL checks. Database checks enforce legal enums, positive sizes, and viewport all-or-none integrity.

The existing `Scenaries.width`/`height` remain the stimulus's intrinsic dimensions. The existing physical screen calibration remains separate. Do not permit a geometry-only update after Parquets have been generated; a correction must reprocess from raw gaze and invalidate spatial caches atomically. Reprocessing is available only when the archived original ZIP/raw CSV still exists or the user uploads the source ZIP again; there is no geometry-only reconstruction from a processed Parquet.

### 4.2 Parquet and processed-file snapshot

Processed artifacts are the authoritative transform record. When angular classification is used, its separate physical calibration must also be snapshotted in processed-file/block metadata so the detector run remains reproducible. Add these row columns while keeping source row order and count unchanged:

| Column | Meaning |
| --- | --- |
| `gx`, `gy` | Existing parsed raw values; unchanged. |
| `gaze_input_unit_resolved` | `pixels`, `percent`, or `normalized`. |
| `gaze_x_screen_px`, `gaze_y_screen_px` | Canonical screen-pixel derivatives. |
| `gaze_x_stimulus_norm`, `gaze_y_stimulus_norm` | Unclipped results of the required equation. May be outside `[0,1]` for audit. |
| `is_in_viewport`, `is_in_stimulus` | Spatial masks. |
| `gaze_invalid_reason` | Null for valid rows; otherwise an explicit reason code. |
| `is_valid_gaze` | Combined detector/analytic eligibility mask. |
| `stimulus_transform_status` | `applied` or `legacy_passthrough_missing`. |
| `stimulus_transform_version` | `screen-stimulus-v1` when applied, otherwise null. |
| `stimulus_transform_fingerprint` | Contract hash when applied. |
| `screen_width_px`, `screen_height_px` | Resolved acquisition screen size used for screen normalization. |
| `stimulus_display_width_px`, `stimulus_display_height_px` | Resolved displayed size used by acquisition-pixel distance metrics; null on the legacy-missing path. |
| `fix_x`, `fix_y` | Existing fixation output in percent, now explicitly stimulus-local when status is `applied`. Invalid rows retain the paired `(-100,-100)` sentinel. |
| `fixation_coordinate_space` | `stimulus_percent` or `legacy_screen_percent`. |

Store full contracts once rather than repeating JSON on every high-rate row:

- The multi-scenario user Parquet and its `ProjectFile.file_metadata` contain `stimulus_placements_by_scenario`, keyed by the canonical stored scenario value and carrying each resolved contract/fingerprint.
- Each scenario Parquet and its `ProjectFile.file_metadata` contain one singular `stimulus_placement` snapshot.
- The same structures are written to Parquet key-value metadata for a self-contained artifact. Row-level status/version/fingerprint selects the applicable entry without repeating the JSON payload.
- When supplied, `physical_screen_geometry` is stored alongside block processing metadata but remains distinct from placement.

This prevents a later mutable SQL row from silently changing the interpretation of an already-processed file.

## 5. API changes

### 5.1 Upload/configuration

Add one multipart field to `POST /projects/{project_id}/files/experiment-zip`:

```text
stimulus_placements_json = JSON array of {source_entry_path, placement}
```

Do not reuse the existing top-level `screen_width_px` and `screen_height_px`; those currently participate in the all-or-none five-field physical angular calibration. A user may know placement pixels without knowing physical millimetres or viewing distance.

Placement must be present in the request before CSV processing. The backend resolves each media path to its scenario identity, rejects canonical-name ambiguity, and passes a scenario-keyed placement map into CSV processing. Missing entries are allowed only through the explicit legacy policy below; malformed or partially supplied entries are `422` errors.

Ordinary request entries omit `source`; the backend assigns `user_config`. Only a trusted acquisition/archive parser may assign `acquisition_metadata`. The backend also computes the fingerprint after validation/default resolution.

Add a typed nested `stimulus_placement` to scenario/project-detail responses and matching frontend TypeScript types. Project/scenario repository reads must eagerly load the one-to-one placement relationship before manually building async responses.

Extend each `ScenariesRequest` item with a tri-state `stimulus_placement` field using the same placement object as the upload envelope, without `source_entry_path` (already present on the scenario item), backend-only `source`, or client fingerprint:

```json
{
  "name": "centered-square",
  "source_entry_path": "Images/centered-square.png",
  "stimulus_placement": {
    "geometry_stability": "static",
    "contract_version": "screen-stimulus-v1",
    "screen_width_px": 1920,
    "screen_height_px": 1080,
    "stimulus_left_px": 420,
    "stimulus_top_px": 0,
    "stimulus_width_px": 1080,
    "stimulus_height_px": 1080,
    "display_mode": "contain"
  }
}
```

The backend distinguishes omission from explicit `null`. For an unprocessed project: omission preserves placement only when `file_id` and `source_entry_path` still identify the same media; an object validates and creates/replaces it; explicit `null` clears it. If media identity changes and placement is omitted, the old placement is deleted and the scenario becomes warned legacy-missing. Once processed Parquets exist, direct scenario upsert rejects any media-identity or placement mutation with `409 stimulus_placement_requires_reprocessing`; replacement/clearing is accepted only as part of the atomic full-upload/reprocess flow with available raw source. The current bulk upsert's overwrite-with-null behavior must not accidentally erase valid geometry or retain geometry for replacement media.

The initial Batch 5B UI captures placement after folder/media selection but before upload processing. Editing placement for an already processed project is disabled unless the operation triggers full reprocessing from the original raw CSV.

### 5.2 Spatial analytic provenance

Add the same additive object to fixation, scanpath, fixation-histogram, AOI, gaze-at, gaze-timeseries, and gaze-statistics JSON responses:

```json
{
  "coordinate_transform": {
    "status": "applied",
    "applied": true,
    "contract_version": "screen-stimulus-v1",
    "source_space": "screen_px",
    "output_space": "stimulus_normalized",
    "contract_fingerprint": "<sha256>",
    "rejected_outside_count": 3,
    "rejected_outside_by_reason": {
      "outside_screen": 0,
      "outside_viewport": 1,
      "outside_stimulus": 2
    },
    "warning_codes": []
  }
}
```

Existing top-level `warnings` arrays on fixation-derived responses remain and include transform warnings. Add the same additive `warnings` field to gaze-at, gaze-timeseries, and gaze-statistics responses, which do not currently expose one.

Fixations, scanpath, heatmap, and AOI endpoints require one concrete scenario; Batch 5B aligns scanpath with the concrete-scenario rule already used by fixation/heatmap/AOI. An unscoped gaze-at response uses the contract for the scenario of its selected source row.

Fixation histogram and gaze timeseries/statistics may retain `scenario=all`. If the scoped rows contain more than one fingerprint/status, provenance is explicit rather than collapsed:

```json
{
  "coordinate_transform": {
    "status": "mixed",
    "applied": null,
    "contract_version": null,
    "source_space": "mixed",
    "output_space": "mixed",
    "contract_fingerprint": null,
    "rejected_outside_count": null,
    "rejected_outside_by_reason": null,
    "warning_codes": ["mixed_stimulus_coordinate_transforms"],
    "scenario_transforms": [
      {"scenario": "A", "status": "applied", "contract_fingerprint": "<sha256-a>"},
      {"scenario": "B", "status": "legacy_passthrough_missing", "contract_fingerprint": null}
    ]
  }
}
```

The per-scenario entries carry the full concrete provenance shape. Aggregate rejection counts are reported only when every scoped scenario has measurable placement; otherwise they are `null`.

For heatmap PNG responses, add:

- `X-Stimulus-Transform-Status`
- `X-Stimulus-Coordinate-Space`
- `X-Stimulus-Transform-Version`
- `X-Stimulus-Transform-Fingerprint`
- `X-Stimulus-Transform-Warnings` when applicable

Cached and uncached responses must have identical provenance. Frontend blob fetching must retain these headers instead of discarding them.

### 5.3 Consumer rule

When `status=applied`, all stimulus-facing consumers use `gaze_*_stimulus_norm` or canonical local fixation events. Raw `gx`/`gy` are audit-only. This includes:

- fixation event coordinates;
- scanpath nodes and distance calculations;
- AOI fixation metrics, sample-level pupil/distance metrics, and AOI key events;
- heatmap density and executive-report spatial assets;
- gaze-at and gaze-point overlays.

For a concrete static placement, scanpath `total_distance_px` means acquisition screen-pixel travel and is computed within each detector segment:

```text
segment_distance_px = sum sqrt(
    ((cx[i] - cx[i-1]) * stimulus_width_px)^2
  + ((cy[i] - cy[i-1]) * stimulus_height_px)^2
)
```

No distance is added across scenario or detector-segment boundaries. Warned legacy passthrough preserves the existing `1920 x 1080` reference calculation for backward compatibility and labels that assumption in provenance; it is not presented as measured acquisition geometry.

## 6. Backward compatibility and migration

### 6.1 Missing placement

For an existing Parquet or a new upload with no placement entry for a scenario:

```json
{
  "coordinate_transform": {
    "status": "legacy_passthrough_missing",
    "applied": false,
    "contract_version": null,
    "source_space": "legacy_screen",
    "output_space": "legacy_screen_normalized",
    "contract_fingerprint": null,
    "rejected_outside_count": null,
    "rejected_outside_by_reason": null,
    "warning_codes": ["stimulus_placement_missing"]
  }
}
```

- Preserve the current numeric screen-normalized path.
- Do not set `display_mode` and do not label the record fullscreen.
- Do not change fixation `estimated`; transform provenance is orthogonal to detector provenance.
- Emit `stimulus_placement_missing; legacy screen-normalized coordinates used` through every spatial JSON response and the heatmap headers.
- Do not rewrite historical Parquets automatically and do not re-transform them on read using geometry configured later. Historical data can become stimulus-local only by explicit reprocessing from its raw source.

An entirely absent tuple uses this compatibility path. A partial, invalid, conflicting, or unsupported tuple is an error and is never silently downgraded.

### 6.2 Migration plan

1. Add Alembic revision `020` after current head `019`; create `stimulus_placements` and its constraints.
2. Do not backfill any row. Absence is meaningful and invokes warned legacy passthrough.
3. Add readers/provenance handling before or with the first writer so mixed old/new projects remain readable.
4. Bump every affected Redis/frontend cache namespace at deployment so responses cached before Batch 5B cannot bypass new provenance fields. Include the transform fingerprint, legacy-status token, or an ingestion revision in every subsequent spatial cache key.
5. On successful re-ingestion/reprocessing, invalidate the project/participant Parquet disk cache and all spatial Redis/blob cache entries.
6. Downgrade drops only the new table/constraints. It cannot undo Parquet artifacts already produced under v1; application rollback therefore requires coordinated writer rollback.

## 7. Numerical examples

### 7.1 Centered square with side letterboxes

```text
screen              = 1920 x 1080
stimulus rectangle  = left 420, top 0, width 1080, height 1080
mode                = contain
point               = (480, 540)

x_stimulus = (480 - 420) / 1080 = 0.0555556
y_stimulus = (540 -   0) / 1080 = 0.5
```

This satisfies the acceptance value `(0.0556, 0.5)` approximately.

Letterbox point `(300,540)`:

```text
x_stimulus = (300 - 420) / 1080 = -0.111111
y_stimulus = 0.5
```

It is invalid and remains `-0.111111` in the derived audit column; it is never clipped to zero.

### 7.2 Cropped stimulus through an offset viewport

```text
screen              = 1920 x 1080
full stimulus       = left 0, top 0, width 1920, height 1080
viewport            = left 420, top 0, width 1080, height 1080
mode                = crop
```

At the left visible edge `(420,540)`:

```text
x_stimulus = (420 - 0) / 1920 = 0.21875
y_stimulus = (540 - 0) / 1080 = 0.5
```

At the visible center `(960,540)`, the result is `(0.5,0.5)`. Point `(200,540)` maps to `(0.1041667,0.5)`, which is inside the full stimulus but outside the viewport, so it is invalid.

### 7.3 Cover with a negative origin

A `1600 x 1200` stimulus covers a `1920 x 1080` screen at scale `1.2`:

```text
viewport           = left 0, top 0, width 1920, height 1080
stimulus rectangle = left 0, top -180, width 1920, height 1440
mode               = cover
```

```text
(960, 0)    -> (0.5, 0.125)
(960, 540)  -> (0.5, 0.5)
(960, 1080) -> (0.5, 0.875)
```

The top and bottom portions outside the viewport are cropped, but the coordinates still refer to the full stimulus.

### 7.4 Offset stimulus

```text
screen              = 1920 x 1080
stimulus rectangle  = left 160, top 90, width 1280, height 720
point               = (800, 450)

x_stimulus = (800 - 160) / 1280 = 0.5
y_stimulus = (450 -  90) /  720 = 0.5
```

Point `(100,450)` maps to `(-0.046875,0.5)` and is invalid without clipping.

### 7.5 Constant scroll with an offset origin

```text
screen                       = 1440 x 900
viewport                     = left 200, top 100, width 1000, height 700
unscrolled stimulus origin   = (250, 100)
scroll                       = (0, 300)
stored effective origin      = (250, -200)
full displayed stimulus size = 1000 x 2000
point                        = (750, 150)

x_stimulus = (750 -  250) / 1000 = 0.5
y_stimulus = (150 - -200) / 2000 = 0.175
```

The stored effective origin already contains the scroll translation. Subtracting `scroll_y_px` again would incorrectly produce `0.325` and is forbidden.

## 8. Test matrix for Batch 5B

| Area | Fixture/case | Expected result |
| --- | --- | --- |
| Contract | Complete centered `contain` tuple | Accepted and round-trips exactly. |
| Contract | Missing one required core field | `422`; no processing or fallback. |
| Contract | Zero/negative/NaN/infinite screen, origin, displayed, viewport, or scroll value where disallowed | Rejected. |
| Contract | Negative origin in `cover`/`crop` | Accepted. |
| Contract | Viewport omitted | Resolves to the screen clip for fingerprint/math. |
| Contract | Viewport rectangle partial | Rejected. |
| Contract | Scroll pair omitted inside a viewport | Resolves to `(0,0)`. |
| Contract | Only one scroll axis supplied | Rejected. |
| Contract | Viewport extends outside screen | Rejected. |
| Contract | Unknown mode/version or client-supplied provenance source | Rejected. |
| Contract | Duplicate or unknown `source_entry_path` | `422` before processing/storage. |
| Contract | Explicit fullscreen exact rectangle | Accepted. |
| Contract | Full-screen-sized rectangle without `display_mode=fullscreen` | Not inferred or labelled fullscreen. |
| Contract | Fullscreen with a smaller clipping viewport | Rejected. |
| Contract | Contain aspect mismatch over `1e-4` | Rejected. |
| Contract | `contain`/`cover` with unavailable intrinsic dimensions | `422 intrinsic_dimensions_required_for_display_mode`; no processing. |
| Contract | Cover rectangle does not cover viewport | Rejected. |
| Contract | Crop has no positive intersection with viewport | Rejected. |
| Contract | `geometry_stability=time_varying` or trusted telemetry contains a geometry change | `422 dynamic_stimulus_geometry_not_supported`; no legacy fallback or processing. |
| Contract | Placement screen differs from physical calibration pixels | Rejected before CSV processing. |
| Fingerprint | Reordered keys, `420` vs `420.0`, omitted vs default viewport/scroll | Identical backend-generated fingerprint. |
| Fingerprint | Change one resolved operand, mode, version, or source | Different fingerprint and cache key. |
| Units | Equivalent pixel, percent, and normalized inputs | Produce identical screen pixels and stimulus-local values. |
| Units | Declared small pixel point such as `(50,50)` | Treated as pixels, not inferred as 50 percent. |
| Units | Pixel placement with no physical mm/distance | Accepted; normalized screen classification, not angular mode. |
| Transform | Centered acceptance point `(480,540)` | Approximately `(0.0555556,0.5)`. |
| Transform | Centered letterbox point | Derived value remains out of range; invalid; never clipped. |
| Transform | Cropped viewport fixture | Correct local value; inside-stimulus/outside-viewport point is invalid. |
| Transform | Cover negative-origin fixture | Correct values at top, center, and bottom viewport edges. |
| Transform | Offset fixture | Correct center and invalid outside point. |
| Transform | Constant-scroll fixture | Produces `(0.5,0.175)` and does not subtract scroll twice. |
| Transform | Exact local boundaries | `0` and `1` are valid. Values immediately beyond are invalid. |
| Raw audit | Process a transformed block | `gx`/`gy`, row count, row order, and vendor fixation columns are unchanged. |
| Raw audit | Outside-stimulus row | Unclipped local derivative and explicit invalid reason persist. |
| Raw audit | Row fails several conditions | Primary reason follows signal/time/screen/viewport/stimulus precedence; rejection total counts the row once. |
| Zero-pair | Raw tracker `(0,0)` sentinel | Invalid according to configured raw heuristic. |
| Zero-pair | Nonzero screen point mapping to local `(0,0)` | Valid boundary; not mistaken for tracker loss. |
| Detector | Letterbox interval between stable gaze runs | No support/ID on outside rows; interval is not bridged; events do not cross it. |
| Detector | Same screen-space trace under two display sizes | Same screen-space fixation classification; different correct local centroids. |
| Detector | Angular mode with placement | Angular velocity uses physical screen coordinates; centroid uses local coordinates. |
| Detector | Scenario transition with different placements | Correct mapping per scenario; no cross-scenario event. |
| Identity | Unique normalized CSV/media scenario match | Correct placement selected via shared scenario identity rules. |
| Identity | Canonical scenario collision | Explicit failure; never select the first geometry. |
| Persistence | Alembic `020` upgrade on legacy rows | No placement rows added; old scenarios remain legacy. |
| Persistence | SQL constraint cases | Atomic tuple, positive dimensions, enum, and viewport constraints enforced. |
| Persistence | SQL/API/Parquet round-trip | Contract and fingerprint agree in SQL, API, scenario/user file metadata, and Parquet metadata. |
| Persistence | Multi-scenario user Parquet | Metadata contains a map; each row fingerprint selects its scenario contract. |
| Persistence | Angular processing | Separate physical calibration snapshot is retained. |
| Persistence | Unprocessed scenario upsert with placement object, explicit null, or omission | Object replaces, null clears, and omission preserves only for unchanged media identity. |
| Persistence | Scenario update omits placement and media identity is unchanged | Existing placement survives. |
| Persistence | Scenario media identity changes without replacement placement | Old placement is removed/marked missing, never retained for new media. |
| Persistence | Processed scenario direct-upsert changes media or placement | `409 stimulus_placement_requires_reprocessing`; artifacts and placement remain unchanged. |
| Persistence | Geometry-only correction without archived/re-uploaded raw source | Rejected; no metadata/data drift. |
| Compatibility | Old V2/legacy Parquet without transform columns | Same numeric output as before plus warned legacy provenance; no fullscreen claim. |
| Compatibility | New upload missing one scenario placement | That scenario alone uses warned legacy passthrough; transformed scenarios remain applied. |
| Compatibility | Partial/corrupt supplied placement | Error; no silent passthrough. |
| Fixations | Canonical fixation response | `x_norm/y_norm` are stimulus-local and provenance is present. |
| Scanpath | Centered/crop/offset fixtures | Nodes align with fixation events; outside points produce no node. |
| Scanpath | Pixel distance | Uses displayed acquisition width/height, resets at segment boundaries, and matches the documented equation. |
| AOI | Local fixation inside AOI while raw screen point differs | Correct AOI hit/dwell/transition. |
| AOI | Letterbox point adjacent to edge AOI | Zero hit and zero dwell; no edge clipping. |
| AOI samples | Pupil/distance/key-event location | Uses valid local gaze rather than raw screen `gx_clean/gy_clean`. |
| Heatmap | One local fixation | Hotspot aligns with scanpath/AOI on intrinsic stimulus image. |
| Heatmap | Letterbox/outside point | No heatmap weight at an image edge. |
| Reports | Centered/crop/offset fixtures | Report heatmap, scanpath, and AOI assets align. |
| Provenance | Fixation/scanpath/histogram/AOI/gaze JSON | Same transform status/version/fingerprint/warnings. |
| Provenance | `scenario=all` mixes applied and legacy scenarios | `status=mixed`, null aggregate fingerprint/counts, and complete per-scenario provenance. |
| Provenance | Heatmap cache hit and miss | Identical transform headers. |
| Cache | First Batch 5B request after deployment | Namespace bump prevents a pre-Batch-5B response without provenance from being served. |
| Cache | Reprocess with changed geometry but same project/scenario/image size | Old Parquet, Redis, and frontend blob results are not served. |
| Frontend | Serialize all modes and viewport combinations | Exact nested JSON; no collision with physical screen fields. |
| Frontend | Create/upload timing | Placement is included before backend CSV processing starts. |
| Frontend | Resume legacy project | Shows missing-placement warning and never displays fullscreen by default. |
| Frontend | Resume/edit applied project | Hydrates the persisted placement instead of resetting it. |

Suggested new core suite: `backend/tests/unit/test_stimulus_coordinate_transform.py`, with extensions to fixation detection, V2 pipeline, upload metadata, scenario identity, fixation analytics, heatmap/report geometry, route provenance, and cache tests. Frontend pure serialization/mapping tests should follow the repository's existing `.test.mjs` pattern; use Playwright only for the full wizard request/UI round trip.

## Approval gate

Batch 5B must implement only this approved contract. In particular, it must not silently reinterpret missing placement as fullscreen, overwrite raw `gx`/`gy`, clip out-of-bounds gaze, run angular kinematics in stimulus-stretched coordinates, or claim support for time-varying scroll under the static v1 model.

No Batch 5B implementation has been performed.
