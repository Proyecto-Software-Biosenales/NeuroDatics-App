"""Time references of one scenario inside one participant's recording."""

from typing import Optional

import numpy as np
import pandas as pd

from neurodatics.shared.scenario_identity import is_all_scenarios

from .gsr_analytics_service import GsrAnalyticsService
from .numeric_helpers import scope_to_scenario


class ScenarioTimingService:
    """Where a scenario starts and ends in a recording, in recording seconds.

    The onset is the first row the recording labels with the scenario, whatever
    sensor produced it, which is the same reference ``gaze-at`` already uses for
    ``scenario_time_s``. It is deliberately not the first valid sample of a
    signal: a sensor that starts late must not shift its own time axis.

    ``gsr_origin_s`` is the instant the relative GSR endpoints count from, so a
    client can map that axis back to recording time. For ``all`` the values
    describe the whole recording; they are not an equivalence between
    recordings of different participants.
    """

    @staticmethod
    def compute(df: pd.DataFrame, scenario: Optional[str]) -> dict:
        all_scenarios = is_all_scenarios(scenario)
        result = {
            "scenario": str(scenario or "all"),
            "time_basis": "recording" if all_scenarios else "scenario_onset",
            "onset_s": None,
            "end_s": None,
            "gsr_origin_s": None,
        }
        if "time" not in df.columns or df.empty:
            return result
        scoped = df if all_scenarios else scope_to_scenario(df, scenario)
        times = pd.to_numeric(scoped["time"], errors="coerce").to_numpy(dtype=float)
        times = times[np.isfinite(times)]
        if times.size == 0:
            return result
        result["onset_s"] = round(float(times.min()), 6)
        result["end_s"] = round(float(times.max()), 6)
        origin = GsrAnalyticsService.time_origin(df, None if all_scenarios else scenario)
        result["gsr_origin_s"] = round(origin, 6) if origin is not None else None
        return result


class StimulusSequenceService:
    """The scenarios of one recording in the order they were shown.

    Each segment is a run of consecutive rows (in time order) labelled with the
    same scenario, in recording seconds. Unlabelled rows - what the recording
    holds before the first stimulus and in the pauses between stimuli - belong
    to no segment and do not split one. The group modes line participants up
    on these segments with «Todos los escenarios», so the same second is the
    same moment of the same stimulus for everybody.
    """

    @staticmethod
    def compute(df: pd.DataFrame) -> dict:
        if "time" not in df.columns or "scenario" not in df.columns or df.empty:
            return {"segments": []}
        times = pd.to_numeric(df["time"], errors="coerce").to_numpy(dtype=float)
        labels = df["scenario"].to_numpy(dtype=object)
        keep = np.isfinite(times) & pd.notna(labels)
        times = times[keep]
        labels = np.array([str(label).strip() for label in labels[keep]], dtype=object)
        named = labels != ""
        times, labels = times[named], labels[named]
        if times.size == 0:
            return {"segments": []}
        order = np.argsort(times, kind="stable")
        times, labels = times[order], labels[order]
        starts = np.flatnonzero(np.r_[True, labels[1:] != labels[:-1]])
        ends = np.r_[starts[1:], labels.size] - 1
        return {
            "segments": [
                {
                    "scenario": str(labels[start]),
                    "onset_s": round(float(times[start]), 6),
                    "end_s": round(float(times[end]), 6),
                }
                for start, end in zip(starts, ends)
            ]
        }
