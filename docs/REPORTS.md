# Device reports

Written for developers maintaining the report subsystem. It describes the
implementation checked in on **2026-09-17**, which replaced the single
matplotlib-drawn "informe ejecutivo" with one report per device.

## What a report is

A report answers one question — *what did this device measure, scenario by
scenario* — for one scope:

| Scope | Request | Content |
| --- | --- | --- |
| Individual | `scope.kind = "participant"` | Every chart and statistics table for that participant. |
| Group | `scope.kind = "all_participants"` | Aggregated maps, one row per participant in each table, and group mean / SD. |

`mode.kind = "sensor"` renders that device's PDF. `mode.kind = "comparative"`
renders **one PDF per device of the project** and returns them in a ZIP. Both
come from `POST /api/reports/executive`; the response media type and
`Content-Disposition` filename tell the browser which it got.

Every report has the same skeleton: cover (optional) → linked table of contents
→ **Resumen** (scope, participants, data notices, a cross-scenario table and
chart) → one section per image scenario → **Metodología y glosario**. Video
scenarios are excluded, as they were before.

## Pipeline

```
analytics services ──► sensor_reports/<device>.py ──► ReportDocument ──► PDFAdapter ──► PDF
   (numbers)             (what the report says)        (blocks + assets)    (Typst)     (layout)
```

| Module | Responsibility |
| --- | --- |
| `application/sensor_reports/eye_tracking.py`, `gsr.py`, `eeg.py` | Per device: collect one record per participant/scenario and turn it into blocks. |
| `application/sensor_reports/common.py` | `ReportContext` (project, device, participants, scenarios, scope), the document shell, the shared statistics table and the cover motif. |
| `application/sensor_reports/document.py` | The block model (`kpis`, `figure`, `table`, `images`, `callout`, `columns`, `group`…) and the asset store. |
| `application/sensor_reports/charts.py` | Matplotlib charts rendered as print-sized SVG. |
| `application/sensor_reports/stimulus.py` | Heatmap, scanpath and AOI figures over the stimulus. |
| `application/sensor_reports/statistics.py`, `formatting.py` | The dashboard's statistic definitions and value formatting. |
| `infrastructure/templates/sensor_report.typ` | Layout: pages, headings, tables, figures. |
| `infrastructure/pdf_adapter.py` | Compiles the document with Typst in a temporary project directory. |
| `application/services/executive_report_service.py` | Loads project, frames and stimulus images; builds the contexts; packages PDF or ZIP. |

Builders never emit markup: they hand the template display-ready strings, and
the template inserts them as text. A scenario called `#set page(width: 1pt)`
prints literally (`tests/unit/test_report_pdf_adapter.py` pins this).

## Numbers

Statistics keep the dashboard's definitions, so a value in a PDF matches the
value on screen: mean, standard deviation with `n - 1`, median, extremes, the
robust baseline (mean of the values between the 5th and 20th percentiles) and
`Pico %` = `(max - base) / |base| × 100`. Group rows add the mean and standard
deviation **between participants**.

Two deliberate differences from the dashboard:

- **Time is measured from the start of the scenario**, not from the start of the
  recording, in every chart and in TTFF. `AoiAnalyticsService` reports
  `ttff_ms` on the recording clock, so the report subtracts the scenario onset
  (`eye_tracking._relative_ttff_s`); the dashboard's AOI table still shows the
  recording-clock value.
- **EEG summaries report the standard deviation, not RMS**, because the exported
  channels carry large DC offsets that make RMS read as amplitude when it is not.

Reports also raise what silently looked like "no response" before: a constant or
resolution-limited GSR channel is flagged per scenario and in the summary, and
the EEG acquisition warnings (assumed µV, clock breaks, artifact candidates) are
shown as callouts.

## Layout and fonts

The template uses Poppins from `application/assets/fonts` and compiles with
`ignore_system_fonts=True`, so a report looks the same on a developer machine
and in the container. Poppins has no Greek letters (bands are spelled out:
Delta, Theta, Alfa, Beta, Gamma) and no narrow no-break space (thousands use a
regular no-break space).

Charts are generated at their final physical width (content width is 174 mm) and
placed at 100 %, so chart text is the size it claims to be. Series colours come
from a categorical palette validated for colour-vision deficiency on adjacent
pairs; each participant keeps the same colour across the whole report, and every
chart is paired with a table.

## Dependency

`typst = "^0.15.0"` (Python binding, abi3 wheels for Windows and manylinux). The
template is compiled from a temporary directory holding only the template, the
document JSON and its assets; nothing is fetched from the network and no Typst
packages are imported. Rebuilding the backend image is enough to deploy it.

## Working on a report

- **Preview with real data**: build a `ReportContext` from Parquet frames and
  call the device builder, then `PDFAdapter().render(..., output_format="png",
  ppi=70)` to get one PNG per page for review. Keep private recordings and their
  output out of the repository.
- **Add a block type**: extend `document.py` with a constructor, then handle the
  new `type` in `render-blocks` in the template. Keep the data JSON-serialisable.
- **Add a chart**: add a builder to `charts.py` that returns SVG bytes at a given
  width in millimetres, and pair it with a table in the device builder.
- **Tests**: `tests/characterization/test_sensor_reports.py` (every device and
  scope over the synthetic recording, plus the HTTP packaging),
  `tests/unit/test_report_pdf_adapter.py` (all block types, markup safety, asset
  sandbox), `tests/unit/test_report_formatting.py` (values and statistics) and
  `tests/unit/test_executive_report_heatmap_geometry.py` (stimulus geometry).
