# 4. The screen → stimulus coordinate transform

Contract version `screen-stimulus-v1`. Spec:
[../SCREEN_TO_STIMULUS_TRANSFORM.md](../SCREEN_TO_STIMULUS_TRANSFORM.md).
Applied at ingestion by the detector; read back by
[coordinate_transform.py](../../backend/src/neurodatics/modules/analytics/domain/coordinate_transform.py).

---

## 4.1 The problem

The eye tracker reports gaze **on the screen**. Analysis is about gaze **on the
stimulus**. Those are the same thing only when the stimulus fills the screen
exactly — which it usually does not.

```
┌─────────────────── 1920 × 1080 screen ───────────────────┐
│              ┌──────────────────────┐                    │
│   grey bar   │   1080 × 1080 image  │      grey bar      │
│  (420 px)    │                      │      (420 px)      │
│              └──────────────────────┘                    │
└──────────────────────────────────────────────────────────┘
```

A gaze at screen x = 50 % (pixel 960) is at the **horizontal centre of the
screen**, but also at the horizontal centre of the image — coincidence, because
this image is centred. A gaze at screen x = 25 % (pixel 480) is at 5.6 % of the
image, not 25 %. Without the transform, every AOI drawn on the image, every
heatmap pixel and every scanpath node is displaced. On a non-centred or
non-16:9 stimulus the error is large and systematic.

---

## 4.2 The equation

```
x_stimulus = (x_screen_px − stimulus_left_px) / stimulus_width_px
y_stimulus = (y_screen_px − stimulus_top_px)  / stimulus_height_px
```

Two subtractions and two divisions. All the engineering is in getting the
operands right and in deciding what to do with the results that fall outside
`[0, 1]`.

Worked through the diagram above (`left = 420`, `width = 1080`):

| Screen | Pixel | Stimulus-local | Meaning |
| --- | --- | --- | --- |
| 50 % | 960 | `(960−420)/1080 = 0.50` | dead centre of the image |
| 25 % | 480 | `(480−420)/1080 = 0.056` | just inside the left edge |
| 10 % | 192 | `(192−420)/1080 = −0.211` | **on the grey bar → rejected** |
| 90 % | 1728 | `(1728−420)/1080 = 1.211` | **on the grey bar → rejected** |

Note the third and fourth rows: without the transform, those samples would be
mapped to 10 % and 90 % *of the image* and counted as looks at the image's edges.

---

## 4.3 Conventions

- One continuous **top-left-origin** screen-pixel space: +X right, +Y down.
  Chosen because it matches HTML/canvas and image raster coordinates, so no axis
  inversion is needed anywhere between the detector and the browser overlay.
- The **resolved displayed rectangle is authoritative**. `display_mode`
  (`contain` / `cover` / `crop` / `fullscreen`) records *how* that rectangle was
  produced and drives validation — it never selects a different equation.
- `stimulus_left/top` are already post-scroll. Scroll is stored for provenance
  and must not be applied twice.
- **`fullscreen` is never inferred.** It must be explicitly declared and must
  resolve to `(0, 0, screen_width, screen_height)` with zero scroll. Guessing
  fullscreen when metadata is missing would silently produce plausible, wrong
  coordinates for every letterboxed stimulus.

---

## 4.4 Dual-space detection

The detector keeps **two** coordinate spaces at once, and this is the subtle
design point:

| Space | Used for | Why |
| --- | --- | --- |
| **Screen** | Velocity, dispersion, physiological classification | Eye movement is a property of the eye and the screen, not of what happens to be displayed. A 2° saccade is 2° regardless of where the image sits. |
| **Stimulus-local** | Centroids, AOIs, heatmaps, scanpaths | Every spatial analytic is about the content. |

Classifying in stimulus space would be wrong: a small image would make every
movement look proportionally larger and inflate the saccade count.

---

## 4.5 Eligibility and the hard boundary

A row is eligible for stimulus analytics only when its local pair lies in
`[0, 1]` on both axes **and** the ingestion-time validity mask passed. Off-screen
/ off-viewport / off-stimulus rows are **hard boundaries**: they end the segment,
so no event can bridge across the moment the participant looked away.

Without that rule, a participant who glanced at the desk for 200 ms and returned
to the same point would produce one continuous fixation spanning the whole
absence.

Rejections are counted, not silently dropped:

```json
"rejected_outside_count": 412,
"rejected_outside_by_reason": {
  "outside_screen": 0,
  "outside_viewport": 15,
  "outside_stimulus": 397
}
```

---

## 4.6 Provenance and the three statuses

Analytics deliberately **does not recompute** geometry from SQL rows — those are
mutable, and recomputing would make a stored result change meaning when someone
edits a scenario. It reads the additive Parquet columns and reports which
persisted contract produced them.

| Status | Meaning | Behaviour |
| --- | --- | --- |
| `applied` | The transform ran; local coordinates are authoritative | Full stimulus analytics |
| `legacy_passthrough_missing` | Old Parquet, no placement metadata | Historical screen-normalised behaviour, **numerically unchanged**, plus a warning |
| `mixed` | Different statuses or fingerprints inside one response scope | Refuses to collapse to whichever row came first; reports `mixed` and warns |

`mixed` is the one that shows engineering maturity: when a project contains both
old and new artefacts, the honest answer is "this scope is inconsistent", not a
number derived from whichever row `iloc[0]` happened to return.

Surfaced in JSON as `coordinate_transform`, and in headers as
`X-Stimulus-Transform-Status`, `X-Stimulus-Coordinate-Space`,
`X-Stimulus-Transform-Version`, `X-Stimulus-Transform-Fingerprint`.

---

## 4.7 The fingerprint

Each resolved placement is canonicalised (RFC 8785 JSON Canonicalization Scheme:
sorted keys, fixed separators, materialised defaults) and hashed. The result is
stored per row as `stimulus_transform_fingerprint`.

It buys three things:

1. **Cache identity** — `transform_cache_token` folds it into analytics cache
   keys, so a changed placement cannot serve cached results computed under the
   old geometry.
2. **Mixed detection** — two different fingerprints in one scope is exactly the
   `mixed` condition above.
3. **Reproducibility** — a stored result can be tied to the precise geometry that
   produced it, months later.

---

## 4.8 Intrinsic dimensions

At ingestion,
[stimulus_probe_service.py](../../backend/src/neurodatics/modules/projects/application/services/stimulus_probe_service.py)
reads each stimulus file's own pixel size while the bytes are still on local
disk:

- **Images** — Pillow, honouring EXIF orientation (tags 5–8 transpose width and
  height, exactly as a browser does when it decodes the file).
- **SVG** — parses `width` / `height` / `viewBox` out of the first 8 KB.
- **Video** — `ffprobe` when present; otherwise the ISO base-media container is
  parsed directly (covers `.mp4`, `.mov`, `.m4v`). AVI, MKV and WebM without
  `ffprobe` come back empty.

Probing **never fails an upload**. An unreadable file just yields no dimensions,
and that scenario falls back to a 1920 × 1080 reference — with a warning
attached to the responses that used it, so a distorted overlay on a non-16:9
stimulus is visible rather than silent.

These dimensions are what the heatmap is rendered at, so the PNG overlays the
image one-to-one, and they are the pixel basis for scanpath distances.
