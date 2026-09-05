# 2. CSV parsing and normalisation

Everything in this file lives in
[csv_processing_service.py](../../backend/src/neurodatics/modules/projects/application/services/csv_processing_service.py)
(≈1 250 lines). It runs once per CSV, inside `asyncio.to_thread` so it does not
block the event loop.

**Design stance:** this stage is *strict*. It refuses ambiguous or malformed
input with a message naming the offending line, instead of silently repairing
it. Repair is what produces plausible, wrong science. A CSV that raises
`CsvProcessingError` is skipped, counted in `csv_summary.failed`, and the rest of
the ingestion continues.

---

## 2.1 Decoding

Lab exports arrive in whatever encoding the acquisition software chose. The
service sniffs the byte-order mark first, then falls back:

```python
if raw.startswith((b"\xff\xfe", b"\xfe\xff")):   candidates = ["utf-16"]
elif raw.startswith(b"\xef\xbb\xbf"):            candidates = ["utf-8-sig"]
else:                                            candidates = ["utf-8", "latin-1"]
```

Ordering matters. `latin-1` can decode *any* byte sequence without raising, so it
must always be tried last — otherwise a UTF-8 file with `Electroencefalografía`
would silently become `ElectroencefalografÃ­a` and no alias would match. The
chosen encoding is reported back in the response.

---

## 2.2 Splitting into recording blocks

One CSV holds several participants. Two markers define the structure:

- a **recording marker** — any line whose normalised text starts with
  `grabación` or `grabacion`;
- a **header line** — any line containing a cell that normalises to `time`.

`_find_block_specs` walks the file and pairs them:

```
line 1    Grabación: 1001014126        ← block 1 starts
line 2-9  Nombre: … / Frecuencia: …    ← metadata for block 1
line 10   Time;EEG…;GSR…               ← header for block 1
line 11-9000  data rows
line 9001 Grabación: 1001014127        ← block 1 ends, block 2 starts
```

Three hard rules, each producing an error with a line number:

| Rule | Error |
| --- | --- |
| Every recording block must contain a header with `Time` | `Bloque de grabación en línea N no contiene encabezado con Time` |
| A block may contain **exactly one** such header | `… contiene varios encabezados Time` |
| No `Time` header may exist outside a block | `Se encontraron encabezados Time fuera de un bloque Grabación: N` |

**Backwards compatibility:** a file with *no* `Grabación` markers at all is
still accepted — consecutive `Time` headers then delimit the blocks. This keeps
older exports readable.

**Participant code** is pulled from the metadata lines with
`grabaci[oó]n\s*:\s*([^|;\r\n]+)`. Failing that, blocks are named
`participante_1`, `participante_2`, … Getting a real code matters: it is what
later maps a participant to their Parquet file (see
[06](06-tech-stack.md#65-reading-data-back)).

---

## 2.3 Column normalisation and aliases

`_canonical_text` is applied to every header cell before anything else:

```python
NFKC normalise → replace NBSP with space → strip whitespace and quotes
→ normalise spacing around "/"  →  collapse runs of whitespace  →  casefold
```

So `"  Bandwidth /X "`, `Bandwidth / X` and `BANDWIDTH  /  X` all become
`bandwidth / x`, which the alias table maps to `gx`.

| Canonical | Recognised spellings (examples) |
| --- | --- |
| `time` | `time`, `timestamp`, `tiempo`, `time (s)` |
| `gx` / `gy` | `bandwidth / x`, `gaze / x`, `gaze x`, `eye tracker / x` |
| `lx_pupil` / `rx_pupil` | `bandwidth / lefteyepupildiameter`, `left eye pupil diameter` |
| `distance` | `bandwidth / distance`, `eye tracker / distance`, `distance` |
| `gsr` | `gsr / gsr`, `gsr`, `galvanic skin response` |
| `f3`, `f4`, `c3`, `c4`, `p3`, `p4`, `le`, `trg` | `electroencefalografía (eeg) / f3`, `electroencefalografia (eeg) / f3`, `eeg / f3` |
| `vendor_fix_x` / `vendor_fix_y` | `fixations / x`, `fixation x` — **renamed on purpose** |
| `scenario` | `scenario`, `scenario 1`, `scenario / scenario 1` |

Both accented and unaccented EEG spellings are listed explicitly, because a file
that lost its accents in a bad round-trip is common and should still work.

**Unknown columns are kept, not dropped.** Anything not in the table keeps its
canonical (lower-cased) name and is recorded in `extra_columns`. It is evidence
that a sensor exists; discarding it would lose data the lab may care about.

### Why vendor fixations are renamed

`Fixations / X` maps to `fix_x`, and then `_canonical_column` prefixes it:
`fix_x` → `vendor_fix_x`. That frees the name `fix_x` for the detector's own
output. It is a one-line rule with a large consequence — the vendor's already
filtered, interpolated fixation stream can never be mistaken for, or fall back
into, our result. See [1.6](01-pipeline-overview.md#16-priority-rules--what-wins-when-sources-disagree).

### Duplicate columns

Two headers can normalise to the same canonical name. They are grouped and
coalesced row by row:

- both empty → `None`
- one has a value → that value
- both have values, **equivalent** (numerically close within 1e-12, or equal as
  text) → merged, with a `coalesced duplicate column` warning
- both have values and they **conflict** → `CsvProcessingError` naming the
  column and the exact line

Silently keeping the first column would mean quietly discarding a sensor
disagreement.

---

## 2.4 Delimiter detection

```python
candidates = [";", "\t", ","]
delimiter  = max(candidates, key=lambda d: header_line.count(d))
```

Counted on the **header line only**. A header like
`Time;EEG / F3;GSR / GSR` contains 2 semicolons and 0 commas, so `;` wins even
though the data rows are full of decimal commas. Choosing on a data row would
pick `,` and shatter the file.

---

## 2.5 Numeric parsing and hard validation

`_parse_localized_float` handles both European and Anglo number formats by
looking at which separator appears **last**:

| Input | Reasoning | Result |
| --- | --- | --- |
| `0,003` | comma only → decimal comma | `0.003` |
| `1.234,56` | comma after dot → dot is thousands | `1234.56` |
| `1,234.56` | dot after comma → comma is thousands | `1234.56` |
| `3.41` | dot only | `3.41` |
| `1 234,5` | spaces stripped first | `1234.5` |
| `inf`, `nan` | not finite | raises |

Known numeric columns (`time`, `gsr`, all EEG, all eye columns) are parsed
strictly: a value that will not parse is an error with its line number, not a
`NaN`. Unknown columns go through `_convert_numeric_columns`, which converts a
column to numeric **only if 100 % of its non-empty values parse**. A column with
one text value stays text — a partially converted column would look numeric
while silently hiding data.

`arousal` is deliberately excluded from the strict set: exports use both
`Low/Med/High` labels and numbers for it.

### The five rejections

| Condition | Message |
| --- | --- |
| Row has a different field count from the header | `Fila malformada en línea N: se esperaban X campos y llegaron Y` |
| A `time` cell is empty | `Timestamp vacío en línea N` |
| A `time` cell will not parse | `Timestamp inválido en línea N` |
| **`t[i] <= t[i-1]`** | `Timestamps no crecientes en línea N` |
| A known numeric cell will not parse | `Valor numérico inválido en columna 'x', línea N` |

The strictly-increasing timestamp rule is the strongest one. Every downstream
duration calculation assumes it: without it, a clock that jumps backwards would
produce negative intervals and nonsensical dwell times.

### Trailing empty columns

Many exports end every line with a stray delimiter. If the last column has a
blank header **and** every value in it is null, it is dropped — repeatedly, from
the right. A blank header with real data in it is kept as `unnamed_12`.

### `_clean_dataframe` — dead code, know about it

The class contains `_clean_dataframe`, which blanks gaze-blackout rows and
propagates `-100` sentinels to neighbours. **It is not called from `process`** —
only from a unit test. It is a leftover from the pre-V2 pipeline, when cleaning
happened here; the fixation detector now owns validity handling
([03](03-fixation-detection.md#33-the-validity-mask)). Mentioned because
`UPLOAD_PIPELINE.md` still documents it as active.

---

## 2.6 The three sampling rates

This is the most distinctive part of the parser, and the reason the fixation
numbers are trustworthy.

| Rate | Source | Meaning |
| --- | --- | --- |
| `declared_file_rate_hz` | metadata line `Frecuencia del archivo` | the exported row grid |
| `observed_grid_rate_hz` | `1 / median(positive Δt)` | what the timestamps actually show |
| `declared_gaze_rate_hz` | `Frecuencia` on the `gx` / `gy` channels | the eye tracker's true update rate |

Rates are kept as `float`. `300.313802515981 Hz` stays exactly that — it is never
rounded to a "known" rate like 300 Hz, because a 0.1 % rounding error over a
10-minute recording is seconds of drift.

**Cross-checks that emit warnings (never failures):**

- max interval deviation > 2 % of the median → `irregular timestamp grid`
- declared file rate differs from observed by > 1 % → `declared file rate differs
  from observed grid rate`
- `gx` and `gy` declare different rates:
  - within 2 % → use their mean
  - more than 2 % apart → **use the lower** and warn
- only one gaze axis has a rate → use it and warn
- gaze rate differs from the observed grid by > 2 % → warn that values may be
  resampled

Warnings are collected per block, persisted into the Parquet as a JSON list, and
surfaced in the API and in `X-Fixation-Warnings` response headers. Nothing is
swallowed.

**Worked example.** `Frecuencia del archivo: 300,313802515981`,
`gx`/`gy` both `Frecuencia: 60`, observed Δt median = 0.00333 s.

```
declared_file_rate  = 300.313802515981
observed_grid_rate  = 300.30030…          (within 1 % → no warning)
declared_gaze_rate  = 60.0                (both axes agree → mean = 60.0)
→ effective_rate    = min(60.0, 300.30) = 60.0
→ resampled         = 300.30 > 60 × 1.05 → True
→ warnings          += "gaze channel rate differs from observed file grid…"
```

---

## 2.7 Sensor and unit detection

**Sensors** are derived from the canonical column set:

| Sensor | Trigger |
| --- | --- |
| `EEG` | any of `le, f4, c4, p4, p3, c3, f3, trg` |
| `GSR` | `gsr` |
| `EyeTracker` | any of `distance, lx_pupil, rx_pupil, gx, gy, fix_x, fix_y, vendor_fix_*` |

The result pre-fills the sensor checkboxes in the upload wizard, so the user
confirms rather than types.

**Units** come from the `Unidad Tobii` metadata line per channel:

- gaze: `%` → `percent`; `px` → `pixels`; `normalized`/`0-1` → `normalized`;
  otherwise `auto` (the detector infers — see
  [3.2](03-fixation-detection.md#32-units-declared-beats-inferred))
- distance: `mm`, `cm`, `m`, otherwise `auto`

A **declared** unit always beats inference. Inference exists for files that
declare nothing, and it always emits a warning saying what it assumed.

---

## 2.8 Parquet output

After detection, `_write_parquets` produces:

```
<temp>/user1/user1.parquet
<temp>/user1/escenarios/Scenario_1.parquet
<temp>/user1/escenarios/Scenario_2.parquet
```

Scenario file names go through `_clean_scenario_name`: slashes and whitespace →
`_`, runs collapsed, edges trimmed, empty → `scenario`. So `Scenario 1` becomes
`Scenario_1.parquet`. The **original** scenario string is preserved inside the
`scenario` column — only the file name is sanitised, so nothing is lost.

Written with **PyArrow, snappy compression**, plus JSON metadata embedded in the
Parquet schema:

```python
table = pa.Table.from_pandas(df, preserve_index=False)
schema_metadata["stimulus_placements_by_scenario"] = json.dumps(..., sort_keys=True)
pq.write_table(table, path, compression="snappy")
```

`sort_keys=True` and fixed separators make the serialisation deterministic — the
same input always yields the same bytes, which is what lets the coordinate
contract be fingerprinted ([04](04-coordinate-transform.md)).

### Why Parquet at all

| | CSV | Parquet |
| --- | --- | --- |
| Layout | row-oriented | **column-oriented** |
| Reading 2 of 40 columns | reads the whole file | reads 2 column chunks |
| Types | text, re-parsed every time | typed once, stored |
| Size | baseline | ~5–10× smaller (snappy) |
| Metadata | none | arbitrary JSON in the schema |

An EEG PSD request needs `time` plus one channel out of ~40 columns. Columnar
storage makes that a fraction of the I/O, and it is the reason an analytics
request over a multi-hundred-MB recording answers in well under a second.

---

## 2.9 What the stage returns

```python
ProcessingResult(
    detected_sensors            = ["EEG", "GSR", "EyeTracker"],
    participants                = [ParticipantInfo("1001014126", 1), ...],
    user_parquet_paths          = [(1, "/tmp/.../user1.parquet"), ...],
    scenario_parquet_paths      = [(1, "Scenario 1", "/tmp/.../Scenario_1.parquet"), ...],
    encoding                    = "utf-16",
    block_metadata              = [BlockMetadata(...), ...],   # ~25 fields per block
    stimulus_placements_by_scenario = {...},
    physical_screen_geometry    = {...} | None,
    warnings                    = ["block 1: gaze_units_inferred:percent", ...],
)
```

`BlockMetadata` is the audit record for one participant: source line numbers,
delimiter, original and normalised column names, extra columns, all three
sampling rates, effective rate, whether resampling occurred, sample count, time
span, detector method and version, transform status and fingerprint, per-channel
metadata, and warnings. It is serialised into `project_files.file_metadata` in
PostgreSQL, so any stored Parquet can be traced back to the exact lines of the
CSV that produced it.
