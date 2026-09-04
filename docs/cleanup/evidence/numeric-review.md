# S4 numerical guard review (2026-09-03)

Read-only review of `fixation_detection_service.py`, `csv_processing_service.py`
and the downstream distance conversion. No production calculations or existing
goldens were changed. Findings below were reproduced with generated `SYN-PROBE`
CSV blocks, not participant recordings.

## Resolution — 2026-09-04

Commit `dd01a58` closes the unit-contract gaps for new imports. Explicit time units
(`seconds`, `milliseconds`, `microseconds` and accepted aliases) are converted to
seconds before observed-rate derivation, fixation detection and Parquet persistence.
Explicit distance units (`mm`, `cm`, `m` and accepted aliases) are converted to
millimetres. Unsupported explicit units and incompatible X/Y gaze axes now fail with
`CsvProcessingError` instead of silently choosing an interpretation. Eleven focused
tests cover conversion, rejection, detector input and stored schema metadata.

Every newly written participant/scenario Parquet records `recording_units` metadata
with source and canonical units. Existing Parquet readers deliberately remain
compatible and do not reinterpret or rewrite historical values. Re-import the source
CSV to correct a historical Parquet created from centimetre/metre or subsecond-time
metadata. Protected numeric goldens were not regenerated.

## Confirmed unit-contract gaps

| Case | Observed result | Consequence and follow-up |
|---|---|---|
| Distance metadata declares `cm`; samples contain `60` | Ingested parquet preserves `distance=60`; `compute_distance_timeseries` returns `distance_cm=6` | Detector supports declared distance units, but analytics always assumes the stored column is millimetres. Define a canonical persisted distance column or consume stored unit metadata, with compatibility for existing parquet. |
| Distance metadata declares `m`; samples contain `0.6` | Analytics returns `distance_cm=0.06` | Same mismatch; a metre recording is displayed 1000 times too small. The control (`600`, unit `mm`) correctly returns `60` cm. |
| Time metadata declares `milliseconds`; samples advance `0,10,...,990`, with file and eye rates `100 Hz` | CSV processing reports observed/effective rate `0.1 Hz`, preserves final time `990`, and detector warns `time_unit_inferred:seconds` | `_derive_observed_rate` assumes raw time is seconds. That derived rate is passed as the detector's reference, reinforcing the wrong unit. The parsed time-channel unit is not passed to the detector. Decide whether such exports should be normalized or explicitly rejected. |
| X declares `%`, Y declares `px`; samples are `(20,216)` | Processing accepts the file; all 100 gaze samples become invalid, with no warning identifying mixed axis units | `_gaze_units` selects percent if either axis declares percent. Incompatible explicit units should be rejected or normalized separately after calibration, rather than silently choosing one axis's unit for both. |

These cases were pre-existing gaps when reviewed and were repaired later in the cleanup
for new imports as described above.
The synthetic campaign golden follows the existing seconds/percent legacy path;
it does not establish correct behavior for these alternative unit declarations.
Do not update its goldens as a substitute for explicit regression tests and a
separate behavior-change decision.

## Reproduction

Create one UTF-8 recording block with these metadata lines:

```text
Grabacion : SYN-PROBE | Rec 1
Nombre : Time
Unidad Tobii : seconds
Nombre : Bandwidth / X
Unidad Tobii : %
Frecuencia : 100 Hz
Nombre : Bandwidth / Y
Unidad Tobii : %
Frecuencia : 100 Hz
Nombre : Bandwidth / Distance
Unidad Tobii : mm
Frecuencia del archivo : 100 Hz
Time;Bandwidth / X;Bandwidth / Y;Bandwidth / Distance;Scenario 1
```

Append 100 rows `i/100;20;30;600;a`, with `i=0..99`. Process with
`CsvProcessingService.process(csv_path, output_dir)`, read the first
`user_parquet_paths` file with pandas, and call
`PupilAnalyticsService.compute_distance_timeseries(frame)`.
Change only the units/value pairs indicated in the table. For the milliseconds
case use `i*10` timestamps. For mixed axes use `Y=216` and its `px` declaration.
All five inputs were accepted. Temporary files were removed by `TemporaryDirectory`.
Raw probe output from this session is in `output/cleanup_s3/numeric-probes.txt`.

Relevant implementation locations at review time:

- CSV `_parse_metadata`, `_derive_observed_rate`, `_gaze_units`, `_distance_unit`
  and the `FixationDetectionMetadata` construction in `process`.
- Detector `_resolve_time_unit`, `_distance_mm` and `_gaze_validity`.
- Analytics `PupilAnalyticsService.compute_distance_timeseries` and
  `compute_distance_statistics`, which divide the raw distance by ten.

## Guards that were verified

- CSV numeric parsing rejects `inf`, `-inf` and overflow literal `1e999` with
  `CsvProcessingError`. `nan` is accepted as a missing sensor sample.
- Required timestamps reject missing or invalid values and non-increasing order.
- Detector rates, geometry dimensions and dispersion/velocity thresholds use
  explicit finite/positive checks. Bridge-gap and resampling tolerance require
  finite, non-negative values.
- Gaze validity masks non-finite samples/timestamps and separates outside-screen,
  outside-viewport and outside-stimulus cases.
- Unit auto-inference is heuristic but reports its chosen time/gaze/distance unit.
  An inferred value is not evidence that acquisition metadata was correct.

Existing tests cover malformed timestamps, coordinate bounds, missing-gaze gaps,
screen geometry, explicit pixel units and millimetre distance in the detector.
A targeted search found no concrete ingestion-to-analytics tests for the three
alternative-unit cases above. The review does not claim exhaustive numerical
correctness or replace a real-experiment corpus.
