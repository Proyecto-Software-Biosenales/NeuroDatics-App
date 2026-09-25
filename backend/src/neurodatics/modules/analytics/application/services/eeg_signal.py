"""EEG sampling and validity contract. See docs/eeg-audit/METHODS.md.

No sorting, sample deletion, interpolation, reference change or artifact removal
is implicit. Fourier windows must contain finite samples on a contiguous grid.
"""

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd
from scipy.signal import butter, iirnotch, sosfiltfilt, tf2sos

from .numeric_helpers import scope_to_scenario

VERSION = "eeg-v2"
INTERVAL_TOLERANCE = 0.05

# Artifact detection bounds. Scalp EEG lives inside roughly +-200 uV, so each of
# these sits an order of magnitude above the physiological band: only excursions
# that cannot be neural cross them. They describe a trace and never modify it.
#
# The step threshold adapts to the channel between these two bounds. Without a
# ceiling, 20 * 1.4826 * MAD(diff) reached 6825 uV on SAIO block 4 P4 and let
# that block's documented 556.9 uV transient pass unmarked. At ~300 Hz a 500 uV
# jump between adjacent samples is ~150 mV/s, far beyond any scalp gradient.
STEP_THRESHOLD_FLOOR_UV = 100.0
STEP_THRESHOLD_CEILING_UV = 500.0
# Robust amplitude z. k=8 measured too tight: clean SAIO channels reach 7.8.
AMPLITUDE_Z_THRESHOLD = 10.0
# Excursions that are gradual at every sample yet leave the band within a second.
PEAK_TO_PEAK_WINDOW_S = 1.0
PEAK_TO_PEAK_THRESHOLD_UV = 1000.0
# A response carries locations, not an unbounded transcript of every wobble.
MAX_REPORTED_ARTIFACT_SPANS = 200

# Optional, explicit processing. Every default below is the identity: this module
# reports what the recording contains and changes it only when asked in writing.
FILTER_ORDER = 4
FILTER_NOTCH_Q = 30.0


def finite_list(values):
    """JSON null means unavailable; retain floating-point precision."""
    return [float(value) if np.isfinite(value) else None for value in values]


def runs(mask):
    """Half-open intervals of true values, without joining across invalid rows."""
    edges = np.diff(np.r_[False, np.asarray(mask, dtype=bool), False].astype(int))
    return list(zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)))


def split_runs(valid, boundaries):
    """Valid runs, cut at recording breaks and condition changes."""
    result = []
    for start, end in runs(valid):
        cuts = np.flatnonzero(boundaries[start + 1 : end]) + start + 1
        points = np.r_[start, cuts, end]
        result.extend(zip(points[:-1], points[1:]))
    return result


def robust_scale(values):
    """1.4826 * MAD: the normal-consistent spread, 0.0 where it is undefined."""
    if not values.size:
        return 0.0
    return float(1.4826 * np.median(np.abs(values - np.median(values))))


def _peak(values):
    """The sample of largest magnitude, signed, so it reads as a real value."""
    finite = values[np.isfinite(values)]
    return float(finite[np.argmax(np.abs(finite))]) if finite.size else None


def _largest(values):
    finite = values[np.isfinite(values)]
    return float(np.max(finite)) if finite.size else None


def _filter_sections(fs, band, notch_hz):
    """Second-order sections for an optional band-pass and mains notch.

    Returns the sections and the descriptions to publish, or ``None`` when the
    request cannot be honoured at this sampling rate - in which case nothing is
    filtered and the reason is reported rather than silently approximated.
    """

    nyquist = fs / 2
    if nyquist <= 0:
        return None, "frecuencia de muestreo desconocida"
    sections, applied = [], {}
    if band is not None:
        low, high = float(band[0]), float(band[1])
        if not 0 < low < high < nyquist:
            return None, f"la banda {low:g}-{high:g} Hz no cabe bajo {nyquist:.2f} Hz"
        sections.append(
            butter(
                FILTER_ORDER, [low / nyquist, high / nyquist], btype="band", output="sos"
            )
        )
        applied["bandpass_hz"] = [low, high]
        applied["bandpass_order"] = FILTER_ORDER
    if notch_hz is not None:
        notch = float(notch_hz)
        if not 0 < notch < nyquist:
            return None, f"el notch de {notch:g} Hz no cabe bajo {nyquist:.2f} Hz"
        sections.append(tf2sos(*iirnotch(notch, FILTER_NOTCH_Q, fs=fs)))
        applied["notch_hz"] = notch
        applied["notch_quality_factor"] = FILTER_NOTCH_Q
    if not sections:
        return None, None
    return (np.vstack(sections), applied), None


def _filter_runs(raw, valid, boundaries, sections):
    """Zero-phase filtering inside each contiguous valid run, never across gaps.

    A run too short for the filter's own padding is left as exported and counted:
    inventing edge behaviour would be the same class of error as interpolating a
    missing sample.
    """

    minimum = 3 * (2 * len(sections) + 1)
    filtered = raw.copy()
    skipped = 0
    for start, end in split_runs(valid, boundaries):
        if end - start <= minimum:
            skipped += 1
            continue
        filtered[start:end] = sosfiltfilt(sections, raw[start:end])
    return filtered, skipped


def _smallest_step(steps):
    """The finest change the export can represent, ignoring repeated samples."""
    moving = np.abs(steps[steps != 0])
    return float(np.min(moving)) if moving.size else None


def _detect_artifacts(raw, valid, boundaries, fs, step_threshold):
    """Three complementary descriptions of one trace, measured on SAIO.

    ``step`` is the only one that sees a one-sample jump riding on an otherwise
    ordinary amplitude distribution (block 3 C3: z=3.7, step 713.2 uV).
    ``amplitude`` is the only one that sees a large excursion whose own steps
    stay small (block 5 F3: z=94.9, step 450.0 uV, under every ceiling).
    ``peak_to_peak`` covers drifts that are gradual at every sample yet leave
    the physiological band inside one second (block 4 C3: 1666.2 uV, z=3.9).
    Neither of the first two covers the other's case, and none removes a sample.
    """

    finite = raw[valid]
    scale = robust_scale(finite)
    z = np.full(raw.shape, np.nan)
    # A zero spread makes the ratio meaningless; ``constant`` and
    # ``repeated_adjacent_samples`` already describe that degeneracy.
    if scale > 0:
        z[valid] = np.abs(finite - np.median(finite)) / scale

    steps = np.diff(raw)
    crossed = np.isfinite(steps) & ~boundaries[1:] & (np.abs(steps) > step_threshold)
    step_mask = np.zeros(raw.shape, dtype=bool)
    # Both endpoints belong to the jump that one crossing describes.
    step_mask[:-1] |= crossed
    step_mask[1:] |= crossed

    peak_to_peak_mask = np.zeros(raw.shape, dtype=bool)
    window = max(2, int(round(fs * PEAK_TO_PEAK_WINDOW_S))) if fs > 0 else 0
    spread_max, excursions = None, 0
    for start, end in split_runs(valid, boundaries) if window else ():
        if end - start < window:
            continue
        values = pd.Series(raw[start:end], dtype=float)
        spread = (
            values.rolling(window).max() - values.rolling(window).min()
        ).to_numpy()
        observed = _largest(spread)
        if observed is not None:
            spread_max = observed if spread_max is None else max(spread_max, observed)
        over = np.isfinite(spread) & (spread > PEAK_TO_PEAK_THRESHOLD_UV)
        excursions += int(over.sum())
        # Rolling labels the window at its right edge; mark the samples it spans.
        peak_to_peak_mask[start:end] = (
            pd.Series(over[::-1].astype(float))
            .rolling(window, min_periods=1)
            .max()
            .to_numpy()[::-1]
            > 0
        )

    quality = {
        "amplitude_outlier_samples": int((np.isfinite(z) & (z > AMPLITUDE_Z_THRESHOLD)).sum()),
        "amplitude_z_max": _largest(z),
        "amplitude_z_threshold": AMPLITUDE_Z_THRESHOLD,
        "step_threshold_ceiling_uV_assumed": STEP_THRESHOLD_CEILING_UV,
        "peak_to_peak_window_s": PEAK_TO_PEAK_WINDOW_S,
        "peak_to_peak_max_uV": spread_max,
        "peak_to_peak_threshold_uV_assumed": PEAK_TO_PEAK_THRESHOLD_UV,
        "peak_to_peak_excursions": excursions,
    }
    masks = {
        "amplitude": np.isfinite(z) & (z > AMPLITUDE_Z_THRESHOLD),
        "step": step_mask,
        "peak_to_peak": peak_to_peak_mask,
    }
    return quality, masks, z


def _artifact_spans(channel, time, raw, masks, z):
    """Where each detector fired, so a reader can go and look at the signal."""

    placed = np.isfinite(time)
    spans = []
    for detector, mask in masks.items():
        for start, end in runs(mask & placed):
            spans.append(
                {
                    "channel": channel,
                    "start_s": float(time[start]),
                    "end_s": float(time[end - 1]),
                    "peak_uV": _peak(raw[start:end]),
                    "z": _largest(z[start:end]),
                    "detector": detector,
                }
            )
    return spans


@dataclass
class EegSignal:
    time: np.ndarray
    values: dict
    fs: float
    boundaries: np.ndarray
    metadata: dict
    # Per channel, the union of the three detectors, uncapped. ``metadata``
    # publishes a bounded list of spans; spectral code needs every sample.
    artifact_mask: Optional[dict] = None

    def valid_runs(self, channel: Optional[str] = None):
        valid = np.isfinite(self.time)
        if channel is not None:
            valid &= np.isfinite(self.values[channel])
        return split_runs(valid, self.boundaries)

    def windows(self, size, hop):
        for start, end in self.valid_runs():
            for offset in range(start, end - size + 1, hop):
                yield offset


def prepare_eeg(
    df,
    scenario,
    channels,
    start_time_s=None,
    end_time_s=None,
    reference="as_exported",
    bandpass_hz=None,
    notch_hz=None,
):
    """Sampling grid, per-channel traces and the quality record for a frame.

    ``reference`` and the two filter arguments are the only ways to change a
    sample, they are off by default, and what they did is written into
    ``metadata``. ``metadata["channels"]`` always describes the export as it
    arrived: a 1 Hz high-pass would make ``median_offset`` unreadable as the
    data-quality fact it is, so detection runs before any optional processing.
    """

    acquisition = df.attrs.get("eeg_acquisition", {})
    frame = scope_to_scenario(df, scenario)
    if "time" not in frame:
        frame = pd.DataFrame(columns=["time", *channels])
    time = pd.to_numeric(frame["time"], errors="coerce").to_numpy(dtype=float)
    selected = np.ones(len(time), dtype=bool)
    if start_time_s is not None:
        selected &= time >= start_time_s
    if end_time_s is not None:
        selected &= time <= end_time_s
    frame = frame.loc[selected]
    time = time[selected]
    dt = np.diff(time)
    positive = dt[np.isfinite(dt) & (dt > 0)]
    period = float(np.median(positive)) if positive.size else 0.0
    fs = 1.0 / period if period > 0 else 0.0
    bad_intervals = ~np.isfinite(dt) | (dt <= 0)
    if period:
        bad_intervals |= np.abs(dt - period) > INTERVAL_TOLERANCE * period
    # Even adjacent experimental conditions must not share analysis windows.
    boundaries = np.r_[True, bad_intervals] if time.size else np.array([], dtype=bool)
    if "scenario" in frame and len(frame) > 1:
        labels = frame["scenario"].fillna("").astype(str).to_numpy()
        boundaries[1:] |= labels[1:] != labels[:-1]
    # Reversals/duplicates have ambiguous chronology. Do not sort them into a
    # plausible recording. Spectral methods will return no estimates.
    chronology_valid = not bool((dt[np.isfinite(dt)] <= 0).any())
    warnings = []
    if not chronology_valid:
        warnings.append(
            "Timestamps duplicados o decrecientes: análisis espectral no disponible."
        )
    if bad_intervals.any():
        warnings.append(
            "Discontinuidades temporales: las ventanas no cruzan huecos ni cambios de escenario."
        )
    excluded = acquisition.get("excluded_channels", [])
    source_units = acquisition.get("source_units", {})
    assumed = [
        c
        for c in channels
        if c in acquisition.get("assumed_uV_channels", []) or not source_units.get(c)
    ]
    if assumed:
        warnings.append(
            "Unidad EEG no declarada: uV es una suposición heredada; confirmar calibración y referencia."
        )
    if any(c in excluded for c in channels):
        warnings.append(
            "Canales con unidad ambigua excluidos: "
            + ", ".join(c.upper() for c in channels if c in excluded)
        )
    if any(source_units.get(c) == "kilo" for c in channels):
        warnings.append(
            "Escala kilo corregida por 1000; el reescalado no recupera la precisión perdida. Confirmar unidad física."
        )
    values = {}
    quality = {}
    artifact_spans = []
    artifact_mask = {}
    for channel in channels:
        raw = (
            pd.to_numeric(frame[channel], errors="coerce").to_numpy(dtype=float).copy()
        )
        raw[~np.isfinite(raw)] = np.nan
        valid = np.isfinite(raw) & np.isfinite(time)
        finite = raw[valid]
        repeated = valid[1:] & valid[:-1] & (raw[1:] == raw[:-1]) & ~boundaries[1:]
        steps = np.diff(raw)
        steps = steps[np.isfinite(steps) & ~boundaries[1:]]
        step_mad = (
            float(np.median(np.abs(steps - np.median(steps)))) if steps.size else 0.0
        )
        threshold = min(
            STEP_THRESHOLD_CEILING_UV,
            max(STEP_THRESHOLD_FLOOR_UV, 20 * 1.4826 * step_mad),
        )
        transients = int((np.abs(steps) > threshold).sum())
        detected, masks, z = _detect_artifacts(raw, valid, boundaries, fs, threshold)
        artifact_spans.extend(_artifact_spans(channel, time, raw, masks, z))
        artifact_mask[channel] = np.logical_or.reduce(list(masks.values()))
        quality[channel] = {
            "transient_candidates": transients,
            "transient_step_threshold_uV_assumed": threshold,
            "max_absolute_step": float(np.max(np.abs(steps))) if steps.size else None,
            "median_offset": float(np.median(finite)) if finite.size else None,
            "valid_samples": int(valid.sum()),
            "missing_samples": int(len(raw) - valid.sum()),
            "repeated_adjacent_samples": int(repeated.sum()),
            # The export's own resolution: SAIO block 5 F3 moves in 10 uV steps
            # while its six neighbours move in 0.01 uV ones. Rescaling a coarse
            # channel by 1000 does not give back the precision it never had.
            "quantization_step_uV": _smallest_step(steps),
            "constant": bool(finite.size > 1 and np.ptp(finite) == 0),
            **detected,
        }
        if channel in excluded:
            raw[:] = np.nan
        values[channel] = raw
    if any(q["missing_samples"] for q in quality.values()):
        warnings.append(
            "Muestras EEG ausentes: se muestran como huecos y se excluyen las ventanas afectadas."
        )
    if any(q["transient_candidates"] for q in quality.values()):
        warnings.append(
            "Saltos de amplitud candidatos a artefacto: revisar la señal; no se han eliminado automáticamente."
        )
    if any(q["amplitude_outlier_samples"] for q in quality.values()):
        warnings.append(
            f"Amplitud fuera del rango fisiológico (z robusto > {AMPLITUDE_Z_THRESHOLD:g}): "
            "los tramos se señalan en el gráfico; la señal no se ha modificado."
        )
    if any(q["peak_to_peak_excursions"] for q in quality.values()):
        warnings.append(
            f"Excursiones de más de {PEAK_TO_PEAK_THRESHOLD_UV:g} uV pico a pico en "
            f"{PEAK_TO_PEAK_WINDOW_S:g} s: revisar contacto, deriva o movimiento; no se han eliminado."
        )
    if any(q["constant"] for q in quality.values()):
        warnings.append(
            "Hay canales constantes; revisar contacto, saturación o exportación."
        )

    # Optional processing, after detection, so quality still describes the export.
    # Re-referencing is linear and commutes with the filter; the montage choice
    # comes first because the filter should see the trace that will be analysed.
    applied_reference, reference_channels = "as_exported", []
    if reference == "common_average":
        reference_channels = [
            c
            for c in channels
            if c not in excluded
            and not quality[c]["constant"]
            and not quality[c]["amplitude_outlier_samples"]
            and not quality[c]["transient_candidates"]
            and not quality[c]["peak_to_peak_excursions"]
        ]
        if len(reference_channels) < 2:
            warnings.append(
                "Referencia promedio común no aplicada: no quedan al menos dos canales "
                "limpios que puedan formarla. Se mantiene la referencia del exportador."
            )
        else:
            average = np.nanmean(
                np.vstack([values[c] for c in reference_channels]), axis=0
            )
            for channel in channels:
                values[channel] = values[channel] - average
            applied_reference = "common_average"
            warnings.append(
                "Referencia promedio común aplicada sobre "
                + ", ".join(c.upper() for c in reference_channels)
                + "; los desplazamientos y la potencia absoluta dependen de esa elección."
            )

    filtering = {"status": "none"}
    if bandpass_hz is not None or notch_hz is not None:
        built, reason = _filter_sections(fs, bandpass_hz, notch_hz)
        if built is None:
            filtering = {"status": "not_applied", "reason": reason}
            warnings.append(f"Filtro no aplicado: {reason}. Se muestran valores crudos.")
        else:
            sections, described = built
            skipped = 0
            for channel in channels:
                valid = np.isfinite(values[channel]) & np.isfinite(time)
                values[channel], channel_skipped = _filter_runs(
                    values[channel], valid, boundaries, sections
                )
                skipped += channel_skipped
            filtering = {
                "status": "applied",
                "design": "butterworth_bandpass_and_iir_notch",
                "phase": "zero_phase_forward_backward",
                "scope": "within_each_contiguous_valid_run",
                "runs_left_unfiltered": skipped,
                **described,
            }
            warnings.append(
                "Filtro aplicado: "
                + ", ".join(
                    part
                    for part in (
                        f"paso banda {described['bandpass_hz'][0]:g}-{described['bandpass_hz'][1]:g} Hz"
                        if "bandpass_hz" in described
                        else "",
                        f"notch {described['notch_hz']:g} Hz"
                        if "notch_hz" in described
                        else "",
                    )
                    if part
                )
                + ". Las estadísticas y la calidad describen la señal sin filtrar."
            )
    declared = acquisition.get("declared_rates_hz", {})
    if any(
        rate and fs and abs(float(rate) - fs) / fs > 0.02 for rate in declared.values()
    ):
        warnings.append(
            "La tasa exportada difiere de la adquisición declarada; verificar el filtro antialias del exportador."
        )
    artifact_spans.sort(key=lambda span: -(span["z"] or 0.0))
    reported = artifact_spans[:MAX_REPORTED_ARTIFACT_SPANS]
    reported.sort(key=lambda span: (span["start_s"], span["channel"], span["detector"]))
    metadata = {
        "version": VERSION,
        "input_samples": len(time),
        "channels": quality,
        "timestamp_breaks": int(bad_intervals.sum()),
        "chronology_valid": chronology_valid,
        "sampling_basis": "median_export_interval",
        "interval_tolerance_fraction": INTERVAL_TOLERANCE,
        "nyquist_hz": fs / 2,
        "source_units": source_units,
        "assumed_uV_channels": assumed,
        "excluded_channels": excluded,
        "warnings": warnings,
        "artifact_correction": "none",
        "reference": applied_reference,
        "reference_channels": reference_channels,
        "reference_requested": reference,
        "filtering": filtering,
        "quality_basis": "as_exported_before_optional_processing",
        "artifact_spans": reported,
        "artifact_spans_total": len(artifact_spans),
        "artifact_detection": {
            "detectors": ["amplitude", "step", "peak_to_peak"],
            "step_threshold_floor_uV_assumed": STEP_THRESHOLD_FLOOR_UV,
            "step_threshold_ceiling_uV_assumed": STEP_THRESHOLD_CEILING_UV,
            "step_threshold_basis": "min(ceiling, max(floor, 20 * 1.4826 * MAD(diff)))",
            "amplitude_z_threshold": AMPLITUDE_Z_THRESHOLD,
            "amplitude_z_basis": "abs(x - median(x)) / (1.4826 * MAD(x))",
            "peak_to_peak_window_s": PEAK_TO_PEAK_WINDOW_S,
            "peak_to_peak_threshold_uV_assumed": PEAK_TO_PEAK_THRESHOLD_UV,
            "span_end_basis": "last_sample_of_the_run",
            "max_reported_spans": MAX_REPORTED_ARTIFACT_SPANS,
            "reported_span_order": "most_severe_kept_then_sorted_by_time",
        },
    }
    return EegSignal(time, values, fs, boundaries, metadata, artifact_mask)


def descriptive_statistics(values):
    values = np.asarray(values)
    values = values[np.isfinite(values)]
    if not values.size:
        return None
    return {
        "count": int(values.size),
        "mean": float(np.mean(values)),
        "std": float(np.std(values, ddof=1)) if values.size > 1 else 0.0,
        "median": float(np.median(values)),
        "min": float(np.min(values)),
        "max": float(np.max(values)),
        "rms": float(np.sqrt(np.mean(values**2))),
    }
