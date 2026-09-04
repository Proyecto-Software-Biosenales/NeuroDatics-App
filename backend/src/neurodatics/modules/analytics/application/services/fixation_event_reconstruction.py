"""Row-to-event reconstruction functions bound to the public event service.

The explicit cls argument preserves subclass and monkeypatch dispatch through
FixationEventService when these functions are installed as classmethods.
"""

from typing import Optional
import numpy as np
import pandas as pd
from ...domain.coordinate_transform import hard_stimulus_boundary_mask, valid_stimulus_gaze_mask
from .pupil_analytics_service import PupilAnalyticsService as PupilAnalyticsService


def _event_from_run(
    cls,
    run: list[int],
    *,
    event_id: str,
    segment_id: Optional[str],
    x_norm: np.ndarray,
    y_norm: np.ndarray,
    times: np.ndarray,
    cadence_s: float,
    detector_counts: Optional[np.ndarray] = None,
    gap_limit_s: Optional[float] = None,
    detector_rate_hz: Optional[float] = None,
    warnings: Optional[list[str]] = None,
) -> dict:
    positions = np.asarray(run, dtype=int)
    start = float(times[positions[0]])
    last = float(times[positions[-1]])
    cadence = max(0.0, float(cadence_s))
    end = max(start, last + cadence)
    source_count = int(positions.size)

    runs = cls._support_runs(positions, times, gap_limit_s)
    row_support_s = cls._row_support_seconds(positions, times, runs, cadence)
    span_s = max(0.0, last - start)

    detector_count = source_count
    counted_by_detector = False
    if detector_counts is not None:
        candidates = detector_counts[positions]
        candidates = candidates[np.isfinite(candidates) & (candidates >= 0)]
        if candidates.size:
            stored_count = int(round(float(np.max(candidates))))
            # Every detector sample is fed by at least one source row, so a
            # stored count above the rows this event actually kept describes
            # something wider than the event and is clamped to what is here.
            detector_count = min(stored_count, source_count)
            counted_by_detector = True
            if warnings is not None and stored_count > source_count:
                warnings.append(
                    f"fixation {event_id}: stored detector sample count "
                    f"({stored_count}) exceeds its {source_count} exported row(s) "
                    "and was clamped"
                )

    duration = row_support_s
    # Without a stored count the rows are all there is; reading the row
    # count as a detector count would multiply a resampled event's dwell.
    if detector_rate_hz and counted_by_detector and detector_count > 0:
        # The detector reports valid support as a sample count on its own
        # grid; count / rate is that same support, not a new heuristic.
        detector_period = 1.0 / float(detector_rate_hz)
        detector_support_s = float(detector_count) * detector_period
        # The event's rows span ``span_s`` and its last detector sample
        # supports one detection period past them, which on a resampled
        # export is longer than the one exported row the grid cadence buys.
        detector_wall_s = span_s + max(cadence, detector_period)
        if np.isfinite(detector_support_s) and (
            0.0 < detector_support_s <= detector_wall_s + 1e-9
        ):
            duration = detector_support_s
            tolerance = max(cadence, detector_period)
            if warnings is not None and abs(detector_support_s - row_support_s) > tolerance:
                warnings.append(
                    f"fixation {event_id}: detector support "
                    f"({detector_support_s * 1000.0:.1f} ms) and exported row support "
                    f"({row_support_s * 1000.0:.1f} ms) disagree; the detector value was kept"
                )
        elif warnings is not None:
            warnings.append(
                f"fixation {event_id}: stored detector metadata does not fit its "
                "timestamps; duration was measured from the exported rows"
            )

    return {
        "id": event_id,
        "x_norm": round(float(np.median(x_norm[positions])), 6),
        "y_norm": round(float(np.median(y_norm[positions])), 6),
        "time_s": round(start, 6),
        "t_end_s": round(end, 6),
        "duration_s": round(duration, 6),
        "detector_sample_count": detector_count,
        "source_row_count": source_count,
        "segment_id": segment_id,
    }


def _from_v2(cls, df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    metadata = cls._metadata(df, is_v2=True)
    if df.empty:
        return cls.empty_events(), metadata

    x_norm, y_norm, valid_coordinates, off_screen = cls._normalised_coordinates(
        df, "fix_x", "fix_y"
    )
    if off_screen:
        metadata["warnings"].append(
            f"{off_screen} fixation row(s) fell outside the screen and were rejected"
        )
    times = pd.to_numeric(df["time"], errors="coerce").to_numpy(dtype=float)
    fixation_ids = [cls._normalise_identifier(value) for value in df["fixation_id"]]
    raw_segment_ids = [
        cls._normalise_identifier(value) for value in df["fixation_segment_id"]
    ]
    participant_ids = (
        [cls._normalise_identifier(value) for value in df["_participant_code"]]
        if "_participant_code" in df.columns
        else [None] * len(df)
    )
    segment_ids = [
        (
            f"{participant_id}:{segment_id}"
            if participant_id is not None and segment_id is not None
            else participant_id or segment_id
        )
        for participant_id, segment_id in zip(participant_ids, raw_segment_ids)
    ]
    valid = valid_coordinates & np.isfinite(times) & np.asarray(
        [value is not None for value in fixation_ids], dtype=bool
    )
    # The ingestion mask is authoritative for an applied transform.  In
    # particular, a labelled fixation row in a letterbox/cropped region is
    # not allowed to survive merely because its stored fixation coordinate
    # looks finite.
    valid &= valid_stimulus_gaze_mask(df).to_numpy(dtype=bool)
    hard_boundaries = hard_stimulus_boundary_mask(df)
    stimulus_epochs = np.cumsum(hard_boundaries.astype(int))

    detector_counts = None
    for name in ("fixation_detector_sample_count", "detector_sample_count"):
        if name in df.columns:
            detector_counts = pd.to_numeric(df[name], errors="coerce").to_numpy(dtype=float)
            break

    effective_rate = metadata.get("effective_sampling_rate_hz")
    cadence = cls._cadence_by_segment(times, segment_ids, effective_rate)
    positive_diffs = np.diff(times[np.isfinite(times)])
    positive_diffs = positive_diffs[(positive_diffs > 0) & np.isfinite(positive_diffs)]
    median_dt = float(np.median(positive_diffs)) if positive_diffs.size else 0.0
    configured_bridge_ms = cls._as_positive_float(
        cls._metadata_value(
            df,
            ("fixation_bridge_gap_ms", "max_bridge_gap_ms", "fixation_max_gap_ms"),
        )
    )
    bridge_floor = (
        configured_bridge_ms / 1000.0
        if configured_bridge_ms is not None
        else cls._DEFAULT_BRIDGE_GAP_S
    )
    bridge_gap_limit = max(bridge_floor, cls._GAP_MULTIPLIER * median_dt)

    # Only a rate the export actually declared can stand in for the
    # detector's own valid support.  A rate inferred from this frame's
    # timestamps describes the row grid, which for a resampled export is
    # several times faster than the eye clock the detector ran on.
    declared_rate, rate_inferred = cls._effective_rate(df)
    observed_grid_rate = 1.0 / median_dt if median_dt > 0 else None
    detector_rate: Optional[float] = None
    if declared_rate is not None and not rate_inferred:
        if observed_grid_rate is None or declared_rate <= observed_grid_rate * (
            1.0 + cls._RATE_CONSISTENCY_TOLERANCE
        ):
            detector_rate = float(declared_rate)
        else:
            metadata["warnings"].append(
                "declared effective sampling rate exceeds the exported row grid; "
                "fixation durations were measured from the exported rows"
            )

    grouped_positions: dict[tuple[Optional[str], int, str], list[int]] = {}
    for position in range(len(df)):
        if not valid[position] or fixation_ids[position] is None:
            continue
        key = (
            segment_ids[position],
            int(stimulus_epochs[position]),
            fixation_ids[position],
        )
        grouped_positions.setdefault(key, []).append(position)

    events: list[dict] = []
    for (raw_segment_id, stimulus_epoch, fixation_id), positions in grouped_positions.items():
        segment_id = (
            raw_segment_id
            if stimulus_epoch == 0
            else f"{raw_segment_id or 'segment'}:stimulus-span-{stimulus_epoch}"
        )
        canonical_id = f"{segment_id}:{fixation_id}" if segment_id is not None else fixation_id
        event_spans: list[list[int]] = []
        for position in positions:
            if not event_spans:
                event_spans.append([position])
                continue
            previous = event_spans[-1][-1]
            dt = times[position] - times[previous]
            another_event_between = bool(valid[previous + 1 : position].any())
            off_stimulus_between = bool(
                hard_boundaries[previous + 1 : position].any()
            )
            # A repeated timestamp is an export-grid artefact, not a second
            # visit: splitting on it would turn one event into one event per
            # exported row.  Only a backwards clock is a real break.
            long_discontinuity = (
                not np.isfinite(dt) or dt < 0 or dt > bridge_gap_limit
            )
            if another_event_between or off_stimulus_between or long_discontinuity:
                event_spans.append([position])
            else:
                event_spans[-1].append(position)

        if len(event_spans) > 1:
            metadata["warnings"].append(
                f"fixation {canonical_id} reappeared after a long discontinuity and was split into {len(event_spans)} events"
            )

        for span_number, span_positions in enumerate(event_spans, start=1):
            event_id = canonical_id if span_number == 1 else f"{canonical_id}#span{span_number}"
            span_segment_id = (
                segment_id
                if len(event_spans) == 1
                else f"{segment_id or 'segment'}:span{span_number}"
            )
            short_gaps = sum(
                current != previous + 1
                for previous, current in zip(span_positions, span_positions[1:])
            )
            if short_gaps:
                metadata["warnings"].append(
                    f"fixation {event_id} contains {short_gaps} bridged gap(s); gaps were excluded from duration"
                )
            events.append(
                cls._event_from_run(
                    span_positions,
                    event_id=event_id,
                    segment_id=span_segment_id,
                    x_norm=x_norm,
                    y_norm=y_norm,
                    times=times,
                    cadence_s=cadence.get(raw_segment_id, 0.0),
                    detector_counts=detector_counts,
                    gap_limit_s=bridge_gap_limit,
                    # A stored count describes the whole identifier, so it
                    # cannot be spread over the spans a defensive split made.
                    detector_rate_hz=(
                        detector_rate if len(event_spans) == 1 else None
                    ),
                    warnings=metadata["warnings"],
                )
            )

    metadata["warnings"] = list(dict.fromkeys(metadata["warnings"]))
    event_frame = pd.DataFrame(events, columns=cls.EVENT_COLUMNS)
    if not event_frame.empty:
        event_frame = event_frame.sort_values(["time_s", "id"], kind="stable").reset_index(drop=True)
    return event_frame, metadata


def _legacy_events(
    cls,
    df: pd.DataFrame,
    proximity_threshold: float,
) -> tuple[pd.DataFrame, dict]:
    if df.empty or "time" not in df.columns:
        return cls.empty_events(), cls._metadata(
            df, is_v2=False, fallback_source="legacy_fixation_columns"
        )

    source = "legacy_fixation_columns"
    working = df.copy()
    off_screen = 0
    if {"fix_x", "fix_y"}.issubset(working.columns):
        x_norm, y_norm, valid, off_screen = cls._normalised_coordinates(
            working, "fix_x", "fix_y"
        )
    else:
        valid = np.zeros(len(working), dtype=bool)
        x_norm = np.full(len(working), np.nan, dtype=float)
        y_norm = np.full(len(working), np.nan, dtype=float)

    if not valid.any() and {"gx", "gy"}.issubset(working.columns):
        source = "legacy_gaze_fallback"
        working, _ = PupilAnalyticsService._gaze_in_output_space(working)
        x_norm = pd.to_numeric(working["gx_clean"], errors="coerce").to_numpy(dtype=float) / 100.0
        y_norm = pd.to_numeric(working["gy_clean"], errors="coerce").to_numpy(dtype=float) / 100.0
        valid = (
            np.isfinite(x_norm)
            & np.isfinite(y_norm)
            & (x_norm >= 0.0)
            & (x_norm <= 1.0)
            & (y_norm >= 0.0)
            & (y_norm <= 1.0)
        )
        valid &= valid_stimulus_gaze_mask(working).to_numpy(dtype=bool)

    metadata = cls._metadata(working, is_v2=False, fallback_source=source)
    if source == "legacy_gaze_fallback":
        metadata["method"] = "legacy_gaze_proximity"
        metadata["warnings"].append(
            "fixation events inferred from cleaned gaze because labelled fixation columns were unavailable"
        )
    if off_screen:
        metadata["warnings"].append(
            f"{off_screen} legacy fixation row(s) fell outside the screen and were "
            "rejected instead of being pulled onto the border"
        )

    times = pd.to_numeric(working["time"], errors="coerce").to_numpy(dtype=float)
    valid &= np.isfinite(times)
    effective_rate = metadata.get("effective_sampling_rate_hz")
    cadence = 1.0 / effective_rate if effective_rate and effective_rate > 0 else 0.0
    positive_diffs = np.diff(times[np.isfinite(times)])
    positive_diffs = positive_diffs[(positive_diffs > 0) & np.isfinite(positive_diffs)]
    median_dt = float(np.median(positive_diffs)) if positive_diffs.size else cadence
    cadence = median_dt if median_dt > 0 else cadence
    gap_limit = max(cls._GAP_FLOOR_S, cls._GAP_MULTIPLIER * median_dt)

    events: list[dict] = []
    run: list[int] = []
    segment_number = 0
    event_number = 0
    isolated_rows = 0
    cx = cy = 0.0

    def flush() -> None:
        nonlocal run, event_number, isolated_rows, cx, cy
        if not run:
            return
        # A run this short is a transition sample between two fixations, or
        # the single survivor of a rejected stretch.  Legacy data carries no
        # detector labels to tell those apart, so it never becomes an event.
        if len(run) < cls._LEGACY_MIN_SOURCE_ROWS:
            isolated_rows += 1
            run = []
            cx = cy = 0.0
            return
        event_number += 1
        events.append(
            cls._event_from_run(
                run,
                event_id=f"legacy-{event_number}",
                segment_id=f"legacy-segment-{segment_number}",
                x_norm=x_norm,
                y_norm=y_norm,
                times=times,
                cadence_s=cadence,
                gap_limit_s=gap_limit,
            )
        )
        run = []
        cx = cy = 0.0

    for position in range(len(working)):
        if not valid[position]:
            if run:
                flush()
            segment_number += 1
            continue

        if run:
            dt = times[position] - times[run[-1]]
            distance_sq = (float(x_norm[position]) - cx) ** 2 + (float(y_norm[position]) - cy) ** 2
            if not np.isfinite(dt) or dt <= 0 or dt > gap_limit or distance_sq > proximity_threshold ** 2:
                flush()
                segment_number += 1

        if not run:
            segment_number += 1
            cx = float(x_norm[position])
            cy = float(y_norm[position])
        run.append(position)
        count = len(run)
        cx += (float(x_norm[position]) - cx) / count
        cy += (float(y_norm[position]) - cy) / count
    flush()

    if isolated_rows:
        metadata["warnings"].append(
            f"{isolated_rows} isolated legacy row(s) were discarded: an event needs at "
            f"least {cls._LEGACY_MIN_SOURCE_ROWS} consecutive rows"
        )
    metadata["warnings"] = list(dict.fromkeys(metadata["warnings"]))
    return pd.DataFrame(events, columns=cls.EVENT_COLUMNS), metadata
