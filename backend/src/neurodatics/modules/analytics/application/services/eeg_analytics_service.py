"""Eeg analytics service extracted without changing computations."""

from typing import Iterable, Optional
import numpy as np
import pandas as pd
from scipy.ndimage import gaussian_filter
from scipy.signal import spectrogram, welch
from .numeric_helpers import _infer_fs
from .numeric_helpers import _moving_average
from .numeric_helpers import scope_to_scenario


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
    def _empty(available_channels: Optional[list] = None) -> dict:
        return {
            "time": [],
            "channels": [],
            "available_channels": available_channels or [],
            "sampling_rate_hz": 0.0,
            "raw": {},
            "smooth": {},
        }

    @staticmethod
    def _empty_psd(available_channels: Optional[list] = None, use_db: bool = True) -> dict:
        return {
            "frequency": [],
            "channels": [],
            "available_channels": available_channels or [],
            "sampling_rate_hz": 0.0,
            "use_db": bool(use_db),
            "unit": "dB" if use_db else "uV^2/Hz",
            "power": {},
        }

    @staticmethod
    def _empty_spectrogram(
        available_channels: Optional[list] = None,
        use_db: bool = True,
        normalize: str = "freq_demean",
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
    def _parse_channels(channels: Optional[Iterable[str]], available_channels: list) -> list:
        if channels is None:
            return available_channels.copy()

        parsed = []
        for channel in channels:
            token = str(channel).strip().lower()
            if token and token not in parsed:
                parsed.append(token)

        return [channel for channel in parsed if channel in available_channels]

    @staticmethod
    def _safe_list(values: np.ndarray) -> list:
        return [
            0.0 if not np.isfinite(float(value)) else round(float(value), 4)
            for value in values
        ]

    @classmethod
    def _safe_matrix(cls, values: np.ndarray) -> list:
        return [cls._safe_list(row) for row in values]

    @staticmethod
    def _filter_time_window(
        df: pd.DataFrame,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
    ) -> pd.DataFrame:
        if "time" not in df.columns or (start_time_s is None and end_time_s is None):
            return df

        time_values = pd.to_numeric(df["time"], errors="coerce")
        mask = time_values.notna()
        if start_time_s is not None:
            mask &= time_values >= float(start_time_s)
        if end_time_s is not None:
            mask &= time_values <= float(end_time_s)

        return df.loc[mask]

    @classmethod
    def compute_timeseries(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        channels: Optional[Iterable[str]] = None,
        smooth_window_s: float = 0.2,
        max_points: int = 5000,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
    ) -> dict:
        """Compute raw and smoothed EEG channel traces, aligned to the original time axis."""
        available_channels = [channel for channel in EEG_CHANNELS if channel in df.columns]
        selected_channels = cls._parse_channels(channels, available_channels)

        if not selected_channels:
            return cls._empty(available_channels)

        df = scope_to_scenario(df, scenario)

        if "time" not in df.columns:
            return cls._empty(available_channels)

        df = cls._filter_time_window(df, start_time_s, end_time_s)

        clean = df[["time"] + selected_channels].copy()
        clean["time"] = pd.to_numeric(clean["time"], errors="coerce")
        for channel in selected_channels:
            clean[channel] = pd.to_numeric(clean[channel], errors="coerce")

        clean = clean.dropna(subset=["time"]).sort_values("time").reset_index(drop=True)
        if clean.empty:
            return cls._empty(available_channels)

        time_arr = clean["time"].to_numpy(dtype=float)
        fs = _infer_fs(time_arr)
        win = max(1, int(round(fs * max(float(smooth_window_s), 0.0))))

        raw_values = {}
        smooth_values = {}
        for channel in selected_channels:
            raw = clean[channel].to_numpy(dtype=float)
            raw_values[channel] = raw
            smooth_values[channel] = _moving_average(raw, win)

        if max_points > 0 and time_arr.size > max_points:
            indices = np.linspace(0, time_arr.size - 1, int(max_points), dtype=int)
        else:
            indices = np.arange(time_arr.size, dtype=int)

        return {
            "time": cls._safe_list(time_arr[indices]),
            "channels": selected_channels,
            "available_channels": available_channels,
            "sampling_rate_hz": round(float(fs), 4) if np.isfinite(fs) else 0.0,
            "raw": {
                channel: cls._safe_list(values[indices])
                for channel, values in raw_values.items()
            },
            "smooth": {
                channel: cls._safe_list(values[indices])
                for channel, values in smooth_values.items()
            },
        }

    @classmethod
    def compute_psd(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        channels: Optional[Iterable[str]] = None,
        max_freq_hz: Optional[float] = None,
        use_db: bool = True,
        max_points: int = 5000,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
    ) -> dict:
        """Compute EEG power spectral density per channel using Welch's method."""
        available_channels = [channel for channel in EEG_CHANNELS if channel in df.columns]
        selected_channels = cls._parse_channels(channels, available_channels)

        if not selected_channels:
            return cls._empty_psd(available_channels, use_db)

        df = scope_to_scenario(df, scenario)

        if "time" not in df.columns:
            return cls._empty_psd(available_channels, use_db)

        df = cls._filter_time_window(df, start_time_s, end_time_s)

        clean = df[["time"] + selected_channels].copy()
        clean["time"] = pd.to_numeric(clean["time"], errors="coerce")
        for channel in selected_channels:
            clean[channel] = pd.to_numeric(clean[channel], errors="coerce")

        clean = clean.dropna(subset=["time"]).sort_values("time").reset_index(drop=True)
        if clean.empty:
            return cls._empty_psd(available_channels, use_db)

        time_arr = clean["time"].to_numpy(dtype=float)
        fs = _infer_fs(time_arr)

        channel_values = {}
        for channel in selected_channels:
            values = clean[channel].to_numpy(dtype=float)
            values = values[np.isfinite(values)]
            if values.size >= 8:
                channel_values[channel] = values

        if not channel_values:
            return cls._empty_psd(available_channels, use_db)

        nperseg = min(1024, min(values.size for values in channel_values.values()))
        frequency = None
        power_values = {}
        for channel, values in channel_values.items():
            freqs, psd = welch(
                values,
                fs=fs,
                nperseg=nperseg,
                noverlap=None,
                detrend="constant",
                scaling="density",
            )

            if max_freq_hz is not None:
                mask = freqs <= float(max_freq_hz)
                freqs = freqs[mask]
                psd = psd[mask]

            if use_db:
                psd = 10.0 * np.log10(psd + 1e-12)

            if frequency is None:
                frequency = freqs
            power_values[channel] = psd

        if frequency is None or frequency.size == 0:
            return cls._empty_psd(available_channels, use_db)

        if max_points > 0 and frequency.size > max_points:
            indices = np.linspace(0, frequency.size - 1, int(max_points), dtype=int)
        else:
            indices = np.arange(frequency.size, dtype=int)

        return {
            "frequency": cls._safe_list(frequency[indices]),
            "channels": list(power_values.keys()),
            "available_channels": available_channels,
            "sampling_rate_hz": round(float(fs), 4) if np.isfinite(fs) else 0.0,
            "use_db": bool(use_db),
            "unit": "dB" if use_db else "uV^2/Hz",
            "power": {
                channel: cls._safe_list(values[indices])
                for channel, values in power_values.items()
            },
        }

    @classmethod
    def compute_spectrogram(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        channels: Optional[Iterable[str]] = None,
        max_freq_hz: Optional[float] = 25.0,
        use_db: bool = True,
        normalize: str = "freq_demean",
        window_s: float = 1.5,
        overlap_ratio: float = 0.75,
        smooth_sigma: float = 0.8,
        clip_low_percentile: float = 2.0,
        clip_high_percentile: float = 98.0,
        max_time_bins: int = 600,
        max_frequency_bins: int = 256,
    ) -> dict:
        """Compute a multi-channel EEG spectrogram using SciPy's PSD mode."""
        available_channels = [channel for channel in EEG_CHANNELS if channel in df.columns]
        selected_channels = cls._parse_channels(channels, available_channels)
        normalize = normalize if normalize in {"none", "freq_demean", "freq_zscore"} else "freq_demean"

        if not selected_channels:
            return cls._empty_spectrogram(available_channels, use_db, normalize)

        df = scope_to_scenario(df, scenario)

        if "time" not in df.columns:
            return cls._empty_spectrogram(available_channels, use_db, normalize)

        clean = df[["time"] + selected_channels].copy()
        clean["time"] = pd.to_numeric(clean["time"], errors="coerce")
        for channel in selected_channels:
            clean[channel] = pd.to_numeric(clean[channel], errors="coerce")

        clean = (
            clean.dropna(subset=["time"] + selected_channels)
            .sort_values("time")
            .reset_index(drop=True)
        )
        if clean.empty:
            return cls._empty_spectrogram(available_channels, use_db, normalize)

        time_arr = clean["time"].to_numpy(dtype=float)
        fs = _infer_fs(time_arr)
        nperseg = max(64, int(round(max(float(window_s), 0.1) * fs)))
        noverlap = min(nperseg - 1, int(round(max(0.0, min(float(overlap_ratio), 0.95)) * nperseg)))

        spec_data = {}
        frequency = None
        segment_time = None
        for channel in selected_channels:
            values = clean[channel].to_numpy(dtype=float)
            values = values[np.isfinite(values)]
            if values.size < 2 * nperseg:
                continue

            freqs, times, power = spectrogram(
                values,
                fs=fs,
                window="hann",
                nperseg=nperseg,
                noverlap=noverlap,
                detrend="constant",
                scaling="density",
                mode="psd",
            )

            if max_freq_hz is not None:
                mask = freqs <= float(max_freq_hz)
                freqs = freqs[mask]
                power = power[mask, :]

            if freqs.size == 0 or times.size == 0:
                continue

            if use_db:
                power = 10.0 * np.log10(power + 1e-12)

            if normalize == "freq_demean":
                power = power - np.median(power, axis=1, keepdims=True)
            elif normalize == "freq_zscore":
                mu = np.mean(power, axis=1, keepdims=True)
                sd = np.std(power, axis=1, keepdims=True) + 1e-12
                power = (power - mu) / sd

            if smooth_sigma > 0:
                power = gaussian_filter(power, sigma=(float(smooth_sigma), float(smooth_sigma)))

            if frequency is None:
                frequency = freqs
                segment_time = times + float(time_arr[0])

            spec_data[channel] = power

        if frequency is None or segment_time is None or not spec_data:
            return cls._empty_spectrogram(available_channels, use_db, normalize)

        if max_frequency_bins > 0 and frequency.size > max_frequency_bins:
            freq_indices = np.linspace(0, frequency.size - 1, int(max_frequency_bins), dtype=int)
        else:
            freq_indices = np.arange(frequency.size, dtype=int)

        if max_time_bins > 0 and segment_time.size > max_time_bins:
            time_indices = np.linspace(0, segment_time.size - 1, int(max_time_bins), dtype=int)
        else:
            time_indices = np.arange(segment_time.size, dtype=int)

        downsampled_power = {
            channel: values[np.ix_(freq_indices, time_indices)]
            for channel, values in spec_data.items()
        }

        all_values = np.concatenate([values.ravel() for values in downsampled_power.values()])
        all_values = all_values[np.isfinite(all_values)]
        if all_values.size:
            low = max(0.0, min(float(clip_low_percentile), 100.0))
            high = max(low, min(float(clip_high_percentile), 100.0))
            vmin, vmax = np.percentile(all_values, [low, high])
        else:
            vmin, vmax = 0.0, 0.0

        unit = "dB" if use_db else "uV^2/Hz"
        if normalize == "freq_demean":
            unit = "dB centrado" if use_db else "uV^2/Hz centrado"
        elif normalize == "freq_zscore":
            unit = "z-score"

        return {
            "time": cls._safe_list(segment_time[time_indices]),
            "frequency": cls._safe_list(frequency[freq_indices]),
            "channels": list(downsampled_power.keys()),
            "available_channels": available_channels,
            "sampling_rate_hz": round(float(fs), 4) if np.isfinite(fs) else 0.0,
            "use_db": bool(use_db),
            "normalize": normalize,
            "unit": unit,
            "power": {
                channel: cls._safe_matrix(values)
                for channel, values in downsampled_power.items()
            },
            "color_domain": {
                "min": round(float(vmin), 4) if np.isfinite(vmin) else 0.0,
                "max": round(float(vmax), 4) if np.isfinite(vmax) else 0.0,
            },
        }

    @classmethod
    def compute_topography(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        channels: Optional[Iterable[str]] = None,
        window_s: float = 2.0,
        overlap_ratio: float = 0.5,
        remove_dc: bool = True,
        max_frames: int = 600,
    ) -> dict:
        """Compute broadband EEG power topography over time windows."""
        available_channels = [
            channel for channel in EEG_TOPOGRAPHY_CHANNELS if channel in df.columns
        ]
        selected_channels = cls._parse_channels(channels, available_channels)
        overlap_ratio = max(0.0, min(float(overlap_ratio), 0.95))
        window_s = max(float(window_s), 0.1)

        if len(selected_channels) < 3:
            return cls._empty_topography(
                available_channels,
                window_s=window_s,
                overlap_ratio=overlap_ratio,
                remove_dc=remove_dc,
            )

        df = scope_to_scenario(df, scenario)

        if "time" not in df.columns:
            return cls._empty_topography(
                available_channels,
                window_s=window_s,
                overlap_ratio=overlap_ratio,
                remove_dc=remove_dc,
            )

        clean = df[["time"] + selected_channels].copy()
        clean["time"] = pd.to_numeric(clean["time"], errors="coerce")
        for channel in selected_channels:
            clean[channel] = pd.to_numeric(clean[channel], errors="coerce")

        clean = clean.dropna(subset=["time"]).sort_values("time").reset_index(drop=True)
        if clean.empty:
            return cls._empty_topography(
                available_channels,
                window_s=window_s,
                overlap_ratio=overlap_ratio,
                remove_dc=remove_dc,
            )

        time_arr = clean["time"].to_numpy(dtype=float)
        fs = _infer_fs(time_arr)
        sample_index = np.arange(time_arr.size, dtype=float)

        usable_channels = []
        signal_rows = []
        for channel in selected_channels:
            values = clean[channel].to_numpy(dtype=float)
            finite_mask = np.isfinite(values)
            if finite_mask.sum() < 2:
                continue

            values = np.interp(
                sample_index,
                sample_index[finite_mask],
                values[finite_mask],
            )
            if remove_dc:
                values = values - np.mean(values)

            usable_channels.append(channel)
            signal_rows.append(values)

        if len(usable_channels) < 3 or not signal_rows:
            return cls._empty_topography(
                available_channels,
                window_s=window_s,
                overlap_ratio=overlap_ratio,
                remove_dc=remove_dc,
            )

        signals = np.vstack(signal_rows)
        _, sample_count = signals.shape
        window_size = int(max(8, np.floor(window_s * fs)))
        hop_size = int(max(1, np.floor(window_size * (1.0 - overlap_ratio))))
        if window_size > sample_count:
            return cls._empty_topography(
                available_channels,
                window_s=window_s,
                overlap_ratio=overlap_ratio,
                remove_dc=remove_dc,
            )

        frame_count = 1 + (sample_count - window_size) // hop_size
        if frame_count <= 0:
            return cls._empty_topography(
                available_channels,
                window_s=window_s,
                overlap_ratio=overlap_ratio,
                remove_dc=remove_dc,
            )

        window = np.hanning(window_size)
        window_energy = float((window**2).mean()) or 1.0

        power = np.empty((len(usable_channels), frame_count), dtype=float)
        frame_time = np.empty(frame_count, dtype=float)
        for frame_index in range(frame_count):
            start = frame_index * hop_size
            segment = signals[:, start : start + window_size] * window
            power[:, frame_index] = (segment**2).mean(axis=1) / window_energy
            center_index = start + (window_size // 2)
            frame_time[frame_index] = time_arr[0] + (center_index / fs)

        if max_frames > 0 and frame_count > max_frames:
            frame_indices = np.linspace(0, frame_count - 1, int(max_frames), dtype=int)
        else:
            frame_indices = np.arange(frame_count, dtype=int)

        downsampled_power = power[:, frame_indices]
        downsampled_time = frame_time[frame_indices]
        finite_power = downsampled_power[np.isfinite(downsampled_power)]
        if finite_power.size:
            vmin, vmax = np.percentile(finite_power, [5.0, 95.0])
            if np.isclose(vmin, vmax):
                vmin = float(np.min(finite_power))
                vmax = float(np.max(finite_power))
        else:
            vmin, vmax = 0.0, 0.0

        layout_points = np.array(
            [EEG_TOPOGRAPHY_LAYOUT[channel] for channel in usable_channels],
            dtype=float,
        )
        radii = np.sqrt(np.sum(layout_points**2, axis=1))
        scale = 0.85 / float(radii.max()) if radii.size and radii.max() > 0 else 1.0
        layout_points = layout_points * scale

        return {
            "time": cls._safe_list(downsampled_time),
            "channels": usable_channels,
            "available_channels": available_channels,
            "sampling_rate_hz": round(float(fs), 4) if np.isfinite(fs) else 0.0,
            "unit": "uV^2",
            "positions": {
                channel: cls._safe_list(layout_points[index])
                for index, channel in enumerate(usable_channels)
            },
            "power": {
                channel: cls._safe_list(downsampled_power[index])
                for index, channel in enumerate(usable_channels)
            },
            "color_domain": {
                "min": round(float(vmin), 4) if np.isfinite(vmin) else 0.0,
                "max": round(float(vmax), 4) if np.isfinite(vmax) else 0.0,
            },
            "window_s": round(float(window_s), 4),
            "overlap_ratio": round(float(overlap_ratio), 4),
            "remove_dc": bool(remove_dc),
        }
