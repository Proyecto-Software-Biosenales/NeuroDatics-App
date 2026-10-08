"""The display envelope keeps real extremes and gaps inside the point budget.

``linspace`` selection keeps one sample in every ``size / max_points`` and can
skip a short excursion entirely. The envelope must keep, for every displayed
series, each bucket's minimum, maximum and first missing sample, never exceed
the budget, and only ever return real sample indices.
"""

import numpy as np
import pandas as pd
import pytest

from neurodatics.modules.analytics.application.services.gsr_analytics_service import (
    GsrAnalyticsService,
)
from neurodatics.modules.analytics.application.services.numeric_helpers import (
    _decimation_indices,
    _envelope_display_indices,
)
from neurodatics.modules.analytics.application.services.pupil_analytics_service import (
    PupilAnalyticsService,
)
from neurodatics.modules.analytics.application.services.scenario_timing_service import (
    ScenarioTimingService,
)

ROWS = 6000


def test_one_sample_peak_survives_the_envelope_but_not_linspace():
    values = np.zeros(ROWS)
    values[1234] = 9.0
    values[4321] = -7.0
    linspace = _decimation_indices(ROWS, 200)
    envelope = _envelope_display_indices(ROWS, [values], 200)

    assert 1234 not in linspace and 4321 not in linspace
    assert 1234 in envelope and 4321 in envelope
    assert len(envelope) <= 200
    assert values[envelope].max() == 9.0 and values[envelope].min() == -7.0


def test_every_series_keeps_its_own_extremes_on_a_shared_axis():
    rng = np.random.default_rng(3)
    first = rng.normal(size=ROWS)
    second = rng.normal(size=ROWS)
    indices = _envelope_display_indices(ROWS, [first, second], 300)

    assert len(indices) <= 300
    assert np.all(np.diff(indices) > 0)
    assert indices[0] == 0 and indices[-1] == ROWS - 1
    for values in (first, second):
        assert int(np.argmax(values)) in indices
        assert int(np.argmin(values)) in indices


def test_a_missing_run_keeps_a_missing_sample_so_the_line_breaks():
    values = np.sin(np.arange(ROWS) / 50.0)
    values[3000:3004] = np.nan
    indices = _envelope_display_indices(ROWS, [values], 150)

    assert len(indices) <= 150
    assert np.isnan(values[indices]).any()
    # The finite extremes are still the real ones.
    assert np.nanmax(values[indices]) == pytest.approx(np.nanmax(values))


def test_budget_above_sample_count_keeps_every_sample():
    values = np.arange(50, dtype=float)
    assert _envelope_display_indices(50, [values], 100).tolist() == list(range(50))
    assert _envelope_display_indices(0, [values[:0]], 100).tolist() == []


def _frame(rows: int = ROWS) -> pd.DataFrame:
    time = 100.0 + np.arange(rows) / 60.0
    pupil = np.full(rows, 3.0)
    pupil[2500] = 8.0  # a blink artefact only one sample long
    gsr = np.full(rows, 2.0)
    gsr[4100:4104] = 6.0
    return pd.DataFrame(
        {
            "time": time,
            "lx_pupil": pupil,
            "rx_pupil": pupil,
            "distance": np.linspace(600, 650, rows),
            "gsr": gsr,
            "scenario": ["A"] * (rows // 2) + ["B"] * (rows - rows // 2),
        }
    )


def test_pupil_envelope_keeps_the_smoothed_peak_that_linspace_misses():
    frame = _frame()
    full = PupilAnalyticsService.compute_timeseries(frame, "all")
    envelope = PupilAnalyticsService.compute_timeseries(
        frame, "all", max_points=100, decimation="minmax_envelope"
    )
    linspace = PupilAnalyticsService.compute_timeseries(frame, "all", max_points=100)

    assert len(envelope["time"]) <= 100
    assert max(envelope["smooth_left"]) == pytest.approx(max(full["smooth_left"]))
    assert max(linspace["smooth_left"]) < max(full["smooth_left"])
    # Every returned row is a full-rate row, not an interpolated one.
    lookup = dict(zip(full["time"], full["smooth_left"]))
    assert all(lookup[t] == v for t, v in zip(envelope["time"], envelope["smooth_left"]))


def test_gsr_envelope_and_default_selection_share_the_contract():
    frame = _frame()
    default = GsrAnalyticsService.compute_timeseries(frame, "B", max_points=300)
    envelope = GsrAnalyticsService.compute_timeseries(
        frame, "B", max_points=300, decimation="minmax_envelope"
    )
    full = GsrAnalyticsService.compute_timeseries(frame, "B")

    assert set(default) == set(envelope) == {"time", "gsr", "gsr_smooth"}
    assert len(envelope["time"]) <= 300
    assert max(envelope["gsr"]) == pytest.approx(max(full["gsr"]))
    # The default path is unchanged: plain linspace over the full-rate rows.
    indices = np.linspace(0, len(full["time"]) - 1, 300, dtype=int)
    assert default["gsr"] == [full["gsr"][i] for i in indices]


def test_scenario_timing_uses_the_first_labelled_row_not_the_first_valid_sample():
    frame = _frame()
    # Scenario B starts at row 3000, but GSR only becomes valid 120 rows later.
    frame.loc[3000:3119, "gsr"] = np.nan
    timing = ScenarioTimingService.compute(frame, "B")

    assert timing["time_basis"] == "scenario_onset"
    assert timing["onset_s"] == pytest.approx(100.0 + 3000 / 60.0)
    assert timing["end_s"] == pytest.approx(100.0 + (ROWS - 1) / 60.0)
    assert timing["gsr_origin_s"] == pytest.approx(100.0 + 3120 / 60.0)
    relative = GsrAnalyticsService.compute_timeseries(frame, "B")
    assert relative["time"][0] == 0.0  # the relative GSR axis counts from gsr_origin_s


def test_scenario_timing_for_all_describes_the_recording_only():
    timing = ScenarioTimingService.compute(_frame(), "all")
    assert timing["time_basis"] == "recording"
    assert timing["onset_s"] == pytest.approx(100.0)


def test_scenario_timing_of_an_unknown_scenario_is_empty():
    timing = ScenarioTimingService.compute(_frame(), "missing")
    assert timing["onset_s"] is None and timing["gsr_origin_s"] is None
