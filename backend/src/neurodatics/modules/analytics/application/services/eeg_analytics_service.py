"""EEG estimates on contiguous valid windows. See docs/eeg-audit/METHODS.md."""

from typing import Iterable, Optional
import numpy as np
import pandas as pd
from scipy.ndimage import gaussian_filter
from scipy.signal import spectrogram, welch
from .eeg_signal import prepare_eeg, descriptive_statistics, finite_list
from .numeric_helpers import _decimation_indices, _envelope_bucket_edges
from scipy.integrate import trapezoid
from .numeric_helpers import _moving_average


EEG_CHANNELS = ("le", "f4", "c4", "p4", "p3", "c3", "f3")


EEG_TOPOGRAPHY_CHANNELS = ("f3", "f4", "c3", "c4", "p3", "p4")


EEG_TOPOGRAPHY_LAYOUT = {
    "f3": (-0.5, 0.6),
    "f4": (0.5, 0.6),
    "c3": (-0.6, 0.0),
    "c4": (0.6, 0.0),
    "p3": (-0.5, -0.6),
    "p4": (0.5, -0.6),
}


class EegAnalyticsService:
    """Stateless computation helpers for EEG channel traces."""

    @staticmethod
    def _empty_spectrogram(
        available_channels: Optional[list] = None,
        use_db: bool = True,
        normalize: str = "none",
    ) -> dict:
        unit = "dB" if use_db else "uV^2/Hz"
        if normalize == "freq_demean":
            unit = "dB centrado" if use_db else "uV^2/Hz centrado"
        elif normalize == "freq_zscore":
            unit = "z-score"

        return {
            "time": [],
            "frequency": [],
            "channels": [],
            "available_channels": available_channels or [],
            "sampling_rate_hz": 0.0,
            "use_db": bool(use_db),
            "normalize": normalize,
            "unit": unit,
            "power": {},
            "color_domain": {"min": 0.0, "max": 0.0},
        }

    @staticmethod
    def _empty_topography(
        available_channels: Optional[list] = None,
        window_s: float = 2.0,
        overlap_ratio: float = 0.5,
        remove_dc: bool = True,
    ) -> dict:
        return {
            "time": [],
            "channels": [],
            "available_channels": available_channels or [],
            "sampling_rate_hz": 0.0,
            "unit": "uV^2",
            "positions": {},
            "power": {},
            "color_domain": {"min": 0.0, "max": 0.0},
            "window_s": round(float(window_s), 4),
            "overlap_ratio": round(float(overlap_ratio), 4),
            "remove_dc": bool(remove_dc),
        }

    @staticmethod
    def _parse_channels(
        channels: Optional[Iterable[str]], available_channels: list
    ) -> list:
        if channels is None:
            return available_channels.copy()

        parsed = []
        for channel in channels:
            token = str(channel).strip().lower()
            if token and token not in parsed:
                parsed.append(token)

        return [channel for channel in parsed if channel in available_channels]

    @classmethod
    def _prepare(
        cls,
        df,
        scenario,
        channels,
        topography=False,
        start=None,
        end=None,
        reference="as_exported",
        bandpass_hz=None,
        notch_hz=None,
    ):
        available = [
            c
            for c in (EEG_TOPOGRAPHY_CHANNELS if topography else EEG_CHANNELS)
            if c in df
        ]
        selected = cls._parse_channels(channels, available)
        signal = prepare_eeg(
            df,
            scenario,
            selected,
            start,
            end,
            reference=reference,
            bandpass_hz=bandpass_hz,
            notch_hz=notch_hz,
        )
        return available, selected, signal

    @staticmethod
    def _base(available, selected, signal):
        return {
            "channels": selected,
            "available_channels": available,
            "sampling_rate_hz": round(signal.fs, 8),
            "metadata": signal.metadata,
        }

    @classmethod
    def compute_timeseries(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        channels: Optional[Iterable[str]] = None,
        smooth_window_s=0.0,
        max_points=5000,
        start_time_s=None,
        end_time_s=None,
        decimation="linspace",
        reference="as_exported",
        bandpass_hz=None,
        notch_hz=None,
    ):
        """Channel traces reduced for display, with statistics at full rate.

        ``decimation`` selects how the reduction spends its point budget.
        ``"linspace"`` keeps evenly spaced samples, the historical behaviour.
        ``"minmax_envelope"`` keeps each bucket's minimum and maximum instead,
        which is what preserves a one-sample peak; see ``_envelope``.
        Either way ``statistics`` is computed before any reduction.
        """

        available, selected, signal = cls._prepare(
            df,
            scenario,
            channels,
            start=start_time_s,
            end=end_time_s,
            reference=reference,
            bandpass_hz=bandpass_hz,
            notch_hz=notch_hz,
        )
        output = {
            **cls._base(available, selected, signal),
            "time": [],
            "raw": {},
            "smooth": {},
            "statistics": {"raw": {}, "smooth": {}},
        }
        if not selected or not signal.time.size:
            output["channels"] = []
            return output
        valid_time = np.flatnonzero(np.isfinite(signal.time))
        edges = (
            _envelope_bucket_edges(len(valid_time), max_points)
            if decimation == "minmax_envelope"
            else None
        )
        if edges is None:
            indices = valid_time[_decimation_indices(len(valid_time), max_points)]
            reduction = "sample_selection_only"
            if len(indices) < len(valid_time):
                signal.metadata["warnings"].append(
                    "El gráfico muestra una selección de muestras; ampliar la ventana para inspeccionar ritmos. Las estadísticas usan toda la señal válida."
                )
        else:
            # Two real sample times per bucket: its first and its last.
            indices = valid_time[np.stack([edges[:-1], edges[1:] - 1], axis=1).ravel()]
            reduction = "min_max_envelope_per_bucket"
            signal.metadata["warnings"].append(
                "El gráfico muestra la envolvente (mínimo y máximo) de cada tramo: conserva los extremos reales de cada canal, y el instante mostrado puede desplazarse hasta un tramo. Las estadísticas usan toda la señal válida."
            )
        output["time"] = finite_list(signal.time[indices])

        win = max(1, round(signal.fs * max(0.0, smooth_window_s)))
        signal.metadata.update(
            {
                "smooth_window_samples": win,
                "smooth_window_s": smooth_window_s,
                "display_reduction": reduction,
                "display_points": len(indices),
                "display_source_samples": len(valid_time),
                "statistics_basis": "all_finite_samples_before_display_reduction",
            }
        )
        for channel in selected:
            raw = signal.values[channel]
            smooth = np.full(raw.shape, np.nan)
            for start, end in signal.valid_runs(channel):
                smooth[start:end] = _moving_average(
                    raw[start:end], min(win, end - start)
                )
            for mode, values in (("raw", raw), ("smooth", smooth)):
                output["statistics"][mode][channel] = descriptive_statistics(
                    values[np.isfinite(signal.time)]
                )
                # Break a display line when reduction hides missing rows/boundaries.
                invalid = ~np.isfinite(values) | signal.boundaries
                if edges is not None:
                    display = cls._envelope(values, valid_time, edges, invalid)
                else:
                    display = values[indices].copy()
                    cumulative = np.r_[0, np.cumsum(invalid)]
                    if indices.size > 1:
                        crosses = (
                            cumulative[indices[1:] + 1]
                            - cumulative[indices[:-1] + 1] > 0
                        )
                        display[1:][crosses] = np.nan
                output[mode][channel] = finite_list(display)
        return output

    @staticmethod
    def _envelope(values, valid_time, edges, invalid):
        """Two points per bucket: its minimum, then its maximum.

        Both x positions are real sample times - the bucket's first and last -
        so a displayed value can sit up to one bucket away from the instant it
        was recorded. That is the deliberate trade: evenly spaced selection
        dropped one-sample peaks outright, while this keeps every channel's
        extreme, for all channels at once, on one shared time axis.

        A bucket that hides a missing sample or a condition boundary reports its
        largest excursion and then breaks the line, rather than drawing across.
        """

        ordered = values[valid_time]
        starts = edges[:-1]
        # fmin/fmax ignore missing samples; an all-missing bucket stays missing.
        low = np.fmin.reduceat(ordered, starts)
        high = np.fmax.reduceat(ordered, starts)
        broken = invalid[valid_time].astype(int)
        # boundaries[0] marks where the recording starts, not a break inside it,
        # which is also why the evenly spaced path never counts that first flag.
        broken[0] = 0
        crossed = np.add.reduceat(broken, starts) > 0
        peak = np.where(np.abs(low) > np.abs(high), low, high)
        return np.stack(
            [np.where(crossed, peak, low), np.where(crossed, np.nan, high)], axis=1
        ).ravel()

    @classmethod
    def compute_psd(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        channels: Optional[Iterable[str]] = None,
        max_freq_hz=None,
        use_db=True,
        max_points=5000,
        start_time_s=None,
        end_time_s=None,
        exclude_artifact_windows=False,
        reference="as_exported",
        bandpass_hz=None,
        notch_hz=None,
    ):
        """Welch power spectral density, with contaminated windows counted.

        A window is *flagged* when it **overlaps** any artifact span of its own
        channel, half-open: one artifact sample is enough. That definition
        matters because Welch overlaps its windows by 50 %, so a single sample
        lands in two of them, and a criterion of "contains the whole span"
        would report fewer windows than are actually affected.

        Flagged windows stay in the estimate unless ``exclude_artifact_windows``
        asks otherwise. The default number is therefore the contaminated one:
        this project reports contamination, it does not clean it in silence.
        ``metadata`` records the counts and whether the exclusion was applied.
        """

        available, selected, signal = cls._prepare(
            df,
            scenario,
            channels,
            start=start_time_s,
            end=end_time_s,
            reference=reference,
            bandpass_hz=bandpass_hz,
            notch_hz=notch_hz,
        )
        output = {
            **cls._base(available, [], signal),
            "frequency": [],
            "power": {},
            "use_db": bool(use_db),
            "unit": "dB" if use_db else "uV^2/Hz",
            "band_power": {},
            "total_power": {},
        }
        if not signal.fs or not signal.metadata["chronology_valid"]:
            return output
        channel_runs = {c: signal.valid_runs(c) for c in selected}
        longest = {
            c: int(max((b - a for a, b in intervals), default=0))
            for c, intervals in channel_runs.items()
        }
        # One frequency grid serves every channel: ``frequency`` is a single
        # shared array in the response, and band power is only comparable
        # between channels at one resolution. So the longest valid run sets the
        # window, and a channel that cannot fill it is reported as incomplete
        # rather than shortening the window for the other six. Measured on SAIO:
        # letting one short channel set nperseg moved the other channels' total
        # power by -9.6 % to -47.4 % with their own data untouched.
        size = int(min(1024, max(longest.values(), default=0)))
        if size < 8:
            return output
        hop = size - size // 2
        usable = [c for c in selected if longest[c] >= size]
        incomplete = [c for c in selected if longest[c] < size]
        bands = {
            "delta": (0.5, 4),
            "theta": (4, 8),
            "alpha": (8, 13),
            "beta": (13, 30),
            "gamma": (30, 45),
        }
        signal.metadata.update(
            {
                "method": "Welch",
                "window": "periodic_hann",
                "nperseg": size,
                "noverlap": size // 2,
                "detrend": "segment_mean",
                "frequency_resolution_hz": signal.fs / size,
                "db_reference": "1 uV^2/Hz",
                "db_floor_linear": 1e-12,
                "valid_windows": {},
                "band_unit": "uV^2",
                "band_limits_hz": bands,
                "nperseg_by_channel": {c: size for c in usable},
                "frequency_resolution_hz_by_channel": {
                    c: signal.fs / size for c in usable
                },
                "longest_valid_run_samples": longest,
                "incomplete_channels": incomplete,
                "channel_unavailable_reason": {
                    c: (
                        f"tramo válido más largo de {longest[c]} muestras; "
                        f"la ventana de análisis necesita {size}"
                    )
                    for c in incomplete
                },
                "windows_total": {},
                "windows_flagged": {},
                "artifact_window_criterion": "overlaps_any_artifact_span_of_the_channel",
                "artifact_windows_excluded": bool(exclude_artifact_windows),
            }
        )
        if incomplete:
            signal.metadata["warnings"].append(
                "Canales sin un tramo válido suficiente para la ventana de análisis: "
                + ", ".join(c.upper() for c in incomplete)
                + ". Se informan como incompletos en vez de acortar la ventana de los demás."
            )
        reported = []
        for channel in usable:
            offsets = [
                offset
                for start, end in channel_runs[channel]
                for offset in range(start, end - size + 1, hop)
            ]
            mask = (signal.artifact_mask or {}).get(channel)
            flagged = {
                offset
                for offset in offsets
                if mask is not None and mask[offset : offset + size].any()
            }
            signal.metadata["windows_total"][channel] = len(offsets)
            signal.metadata["windows_flagged"][channel] = len(flagged)
            if exclude_artifact_windows:
                kept = [offset for offset in offsets if offset not in flagged]
                if not kept:
                    signal.metadata["channel_unavailable_reason"][channel] = (
                        "todas las ventanas solapan un artefacto y la exclusión está activa"
                    )
                    continue
                frequency, power = cls._welch_windows(
                    signal.values[channel], signal.fs, size, kept
                )
                signal.metadata["valid_windows"][channel] = len(kept)
            else:
                estimates, weights = [], []
                for start, end in channel_runs[channel]:
                    if end - start < size:
                        continue
                    frequency, power = welch(
                        signal.values[channel][start:end],
                        fs=signal.fs,
                        window="hann",
                        nperseg=size,
                        noverlap=size // 2,
                        detrend="constant",
                        scaling="density",
                        average="mean",
                    )
                    estimates.append(power)
                    weights.append(int(1 + (end - start - size) // hop))
                power = np.average(estimates, axis=0, weights=weights)
                signal.metadata["valid_windows"][channel] = sum(weights)
            reported.append(channel)
            output["band_power"][channel] = {}
            for band, (low, high) in bands.items():
                value = None
                if high <= frequency[-1] and high - low >= signal.fs / size:
                    inside = (frequency > low) & (frequency < high)
                    x = np.r_[low, frequency[inside], high]
                    y = np.r_[
                        np.interp(low, frequency, power),
                        power[inside],
                        np.interp(high, frequency, power),
                    ]
                    value = float(trapezoid(y, x))
                output["band_power"][channel][band] = value
            # One-sided Fourier bin sum preserves windowed mean square (Parseval).
            output["total_power"][channel] = float(power.sum() * signal.fs / size)
            mask = (
                frequency <= max_freq_hz
                if max_freq_hz is not None
                else np.ones(len(frequency), dtype=bool)
            )
            indices = np.flatnonzero(mask)[
                _decimation_indices(int(mask.sum()), max_points)
            ]
            output["frequency"] = finite_list(frequency[indices])
            values = (
                10 * np.log10(np.maximum(power[indices], 1e-12))
                if use_db
                else power[indices]
            )
            output["power"][channel] = finite_list(values)
        output["channels"] = reported if output["frequency"] else []
        return output

    @staticmethod
    def _welch_windows(values, fs, size, offsets):
        """One periodogram per window; their plain mean is what Welch averages.

        Verified bit-identical to the per-run ``welch`` call on SAIO block 5 F3.
        Only the opt-in exclusion needs it, because dropping individual windows
        is not expressible through a single call over a whole run.
        """

        frequency, estimates = None, []
        for offset in offsets:
            frequency, power = welch(
                values[offset : offset + size],
                fs=fs,
                window="hann",
                nperseg=size,
                noverlap=size // 2,
                detrend="constant",
                scaling="density",
                average="mean",
            )
            estimates.append(power)
        return frequency, np.mean(estimates, axis=0)

    @staticmethod
    def _color_domain(power, low=2.0, high=98.0):
        values = np.asarray(power).ravel()
        values = values[np.isfinite(values)]
        if not values.size:
            return {"min": 0.0, "max": 0.0}
        low = float(np.clip(low, 0, 100))
        bounds = np.percentile(values, [low, np.clip(high, low, 100)])
        return {"min": float(bounds[0]), "max": float(bounds[1])}

    @classmethod
    def compute_spectrogram(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        channels: Optional[Iterable[str]] = None,
        max_freq_hz=25.0,
        use_db=True,
        normalize="none",
        window_s=1.5,
        overlap_ratio=0.75,
        smooth_sigma=0.0,
        clip_low_percentile=2.0,
        clip_high_percentile=98.0,
        max_time_bins=600,
        max_frequency_bins=256,
        start_time_s=None,
        end_time_s=None,
        reference="as_exported",
        bandpass_hz=None,
        notch_hz=None,
        per_channel_color_domain=False,
    ):
        available, selected, signal = cls._prepare(
            df,
            scenario,
            channels,
            start=start_time_s,
            end=end_time_s,
            reference=reference,
            bandpass_hz=bandpass_hz,
            notch_hz=notch_hz,
        )
        normalize = (
            normalize if normalize in {"none", "freq_demean", "freq_zscore"} else "none"
        )
        output = {
            **cls._empty_spectrogram(available, use_db, normalize),
            **cls._base(available, [], signal),
        }
        if not signal.fs or not selected or not signal.metadata["chronology_valid"]:
            return output
        size = max(8, round(max(window_s, 0.1) * signal.fs))
        overlap = min(size - 1, round(np.clip(overlap_ratio, 0, 0.95) * size))
        hop = size - overlap
        starts = list(signal.windows(size, hop))
        if not starts:
            return output
        frequency = np.fft.rfftfreq(size, d=1 / signal.fs)
        mask = (
            frequency <= max_freq_hz
            if max_freq_hz is not None
            else np.ones(len(frequency), dtype=bool)
        )
        frequency = frequency[mask]
        if not frequency.size:
            return output
        matrices = {}
        for channel in selected:
            power = np.full((frequency.size, len(starts)), np.nan)
            for i, start in enumerate(starts):
                values = signal.values[channel][start : start + size]
                if not np.isfinite(values).all():
                    continue
                _, _, density = spectrogram(
                    values,
                    fs=signal.fs,
                    window="hann",
                    nperseg=size,
                    noverlap=0,
                    detrend="constant",
                    scaling="density",
                    mode="psd",
                )
                values = density[mask, 0]
                power[:, i] = (
                    10 * np.log10(np.maximum(values, 1e-12)) if use_db else values
                )
            valid = np.isfinite(power).all(axis=0)
            if not valid.any():
                continue
            if normalize == "freq_demean":
                power[:, valid] -= np.median(power[:, valid], axis=1, keepdims=True)
            elif normalize == "freq_zscore":
                values = power[:, valid]
                sd = values.std(axis=1, keepdims=True)
                power[:, valid] = (
                    values - values.mean(axis=1, keepdims=True)
                ) / np.where(sd > 0, sd, 1)
            if smooth_sigma > 0:
                # Optional display smoothing within uninterrupted valid frame runs.
                begin = None
                for i in range(len(starts) + 1):
                    contiguous = (
                        i < len(starts)
                        and valid[i]
                        and (begin is None or starts[i] - starts[i - 1] == hop)
                    )
                    if begin is not None and not contiguous:
                        power[:, begin:i] = gaussian_filter(
                            power[:, begin:i], sigma=smooth_sigma
                        )
                        begin = None
                    if i < len(starts) and valid[i] and begin is None:
                        begin = i
            matrices[channel] = power
        if not matrices:
            return output
        times = np.array(
            [signal.time[start] + size / (2 * signal.fs) for start in starts]
        )
        fi = _decimation_indices(len(frequency), max_frequency_bins)
        ti = _decimation_indices(len(times), max_time_bins)
        displayed = {}
        frame_breaks = np.r_[False, np.diff(starts) != hop]
        for channel, matrix in matrices.items():
            sampled = matrix[np.ix_(fi, ti)].copy()
            invalid = ~np.isfinite(matrix).all(axis=0) | frame_breaks
            cumulative = np.r_[0, np.cumsum(invalid)]
            if len(ti) > 1:
                crosses = cumulative[ti[1:] + 1] - cumulative[ti[:-1] + 1] > 0
                crosses &= np.diff(ti) > 1
                sampled[:, np.flatnonzero(crosses) + 1] = np.nan
            displayed[channel] = sampled
        output.update(
            {
                "time": finite_list(times[ti]),
                "frequency": finite_list(frequency[fi]),
                "channels": list(matrices),
                "power": {
                    c: [finite_list(row) for row in p]
                    for c, p in displayed.items()
                },
                "color_domain": cls._color_domain(
                    np.concatenate([p.ravel() for p in matrices.values()]),
                    clip_low_percentile,
                    clip_high_percentile,
                ),
                # One channel 25 dB above its neighbours compresses all of them
                # onto the same colour ramp; per-channel limits are opt-in
                # because they also stop channels being comparable by eye.
                "channel_color_domain": {
                    channel: cls._color_domain(
                        matrix.ravel(), clip_low_percentile, clip_high_percentile
                    )
                    for channel, matrix in matrices.items()
                }
                if per_channel_color_domain
                else {},
            }
        )
        signal.metadata.update(
            {
                "window": "periodic_hann",
                "nperseg": size,
                "noverlap": overlap,
                "hop_s": hop / signal.fs,
                "display_hop_s": float(np.median(np.diff(times[ti])))
                if len(ti) > 1
                else hop / signal.fs,
                "window_s": size / signal.fs,
                "frequency_resolution_hz": signal.fs / size,
                "db_reference": "1 uV^2/Hz",
                "db_floor_linear": 1e-12,
                "normalization_basis": "within_channel_all_valid_frames",
                "smooth_sigma_bins": smooth_sigma,
                "color_limits_only": True,
                "color_domain_basis": "per_channel"
                if per_channel_color_domain
                else "all_selected_channels",
            }
        )
        return output

    @classmethod
    def compute_topography(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        channels: Optional[Iterable[str]] = None,
        window_s=2.0,
        overlap_ratio=0.5,
        remove_dc=True,
        max_frames=600,
        start_time_s=None,
        end_time_s=None,
        reference="as_exported",
        bandpass_hz=None,
        notch_hz=None,
    ):
        available, selected, signal = cls._prepare(
            df,
            scenario,
            channels,
            topography=True,
            start=start_time_s,
            end=end_time_s,
            reference=reference,
            bandpass_hz=bandpass_hz,
            notch_hz=notch_hz,
        )
        overlap_ratio = float(np.clip(overlap_ratio, 0, 0.95))
        window_s = max(window_s, 0.1)
        output = {
            **cls._empty_topography(available, window_s, overlap_ratio, remove_dc),
            **cls._base(available, [], signal),
        }
        if (
            len(selected) < 3
            or not signal.fs
            or not signal.metadata["chronology_valid"]
        ):
            return output
        size = max(8, int(np.floor(window_s * signal.fs + 1e-9)))
        hop = max(1, int(np.floor(size * (1 - overlap_ratio))))
        starts = list(signal.windows(size, hop))
        if not starts:
            return output
        window = np.hanning(size)
        energy = np.sum(window**2)
        power = np.full((len(selected), len(starts)), np.nan)
        for i, start in enumerate(starts):
            for j, channel in enumerate(selected):
                values = signal.values[channel][start : start + size].copy()
                if not np.isfinite(values).all():
                    continue
                if remove_dc:
                    values -= values.mean()
                power[j, i] = np.sum((values * window) ** 2) / energy
        valid = np.flatnonzero(np.isfinite(power).sum(axis=0) >= 3)
        indices = valid[_decimation_indices(len(valid), max_frames)]
        if not len(indices):
            return output
        usable = [
            c for j, c in enumerate(selected) if np.isfinite(power[j, indices]).any()
        ]
        # Fixed scale independent of selection, preserving electrode positions.
        scale = 0.85 / max(np.hypot(*xy) for xy in EEG_TOPOGRAPHY_LAYOUT.values())
        output.update(
            {
                "channels": usable,
                "time": finite_list(
                    np.array(
                        [
                            signal.time[starts[i]] + (size // 2) / signal.fs
                            for i in indices
                        ]
                    )
                ),
                "power": {
                    c: finite_list(power[selected.index(c), indices]) for c in usable
                },
                "positions": {
                    c: finite_list(np.array(EEG_TOPOGRAPHY_LAYOUT[c]) * scale)
                    for c in usable
                },
                "color_domain": cls._color_domain(power[:, indices], 5, 95),
            }
        )
        signal.metadata.update(
            {
                "method": "Hann_energy_normalized_mean_square",
                "window": "symmetric_hann",
                "dc_removal": "per_window_mean" if remove_dc else "none",
                "hop_s": hop / signal.fs,
                "window_samples": size,
                "montage": "schematic_six_sensor_layout",
                "interpretation": "sensor_power_not_source_localization",
            }
        )
        return output
