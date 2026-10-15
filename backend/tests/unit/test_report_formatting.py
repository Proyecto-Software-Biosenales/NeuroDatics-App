"""Shared report values: formatting and the dashboard's statistic definitions."""

import numpy as np
import pytest

from neurodatics.modules.reports.application.sensor_reports import formatting as fmt
from neurodatics.modules.reports.application.sensor_reports.statistics import (
    describe,
    from_service,
    mean_and_sd,
)


@pytest.mark.parametrize(
    "value,decimals,unit,expected",
    [
        pytest.param(3.14159, 2, "mm", "3.14 mm", id="unit"),
        pytest.param(-0.004, 2, "", "0.00", id="no-negative-zero"),
        pytest.param(-2.5, 1, "", "−2.5", id="true-minus"),
        pytest.param(1356.4, 0, "ms", "1356 ms", id="four-digits-ungrouped"),
        pytest.param(123456.0, 0, "", "123 456", id="grouped"),
        pytest.param(None, 2, "µS", fmt.MISSING, id="missing-drops-unit"),
        pytest.param(float("nan"), 2, "", fmt.MISSING, id="nan"),
        pytest.param(True, 2, "", fmt.MISSING, id="bool-is-not-a-number"),
    ],
)
def test_number_formatting(value, decimals, unit, expected):
    assert fmt.number(value, decimals, unit) == expected


def test_signed_percent_and_significant_digits():
    assert fmt.percent(12.34, 1, signed=True) == "+12.3 %"
    assert fmt.significant(0.012345, 3) == "0.0123"
    assert fmt.significant(682.34, 3) == "682"
    assert fmt.mean_sd(3.0, None, 1, "s") == "3.0 s"
    assert fmt.mean_sd(3.0, 0.25, 2, "s") == "3.00 ± 0.25 s"


def test_describe_matches_the_dashboard_definitions():
    values = np.array([4.0, 4.2, np.nan, 4.6, 5.0, 4.4, 4.1, 4.3, 4.8, 4.5, 4.9])
    times = np.arange(values.size) * 0.1

    stats = describe(values, times)

    finite = values[np.isfinite(values)]
    low, high = np.percentile(finite, [5, 20])
    baseline = finite[(finite >= low) & (finite <= high)].mean()
    assert stats.count == 10
    assert stats.sd == pytest.approx(np.std(finite, ddof=1))
    assert stats.baseline == pytest.approx(baseline)
    assert stats.peak_percent == pytest.approx((5.0 - baseline) / baseline * 100)
    assert (stats.min_time, stats.max_time) == pytest.approx((0.0, 0.4))
    assert describe([np.nan, np.nan]) is None


def test_service_payloads_keep_dashboard_numbers():
    payload = {"gx_mean": 45.5, "gx_std": 12.0, "gx_median": 44.0, "gx_min": 1.0, "gx_max": 90.0, "gx_baseline": 20.0}

    stats = from_service(payload, 100, "gx_")

    assert (stats.count, stats.mean, stats.sd, stats.minimum, stats.maximum) == (100, 45.5, 12.0, 1.0, 90.0)
    assert from_service(payload, 0, "gx_") is None
    assert from_service({}, 10) is None


def test_group_mean_and_sd_ignore_missing_participants():
    assert mean_and_sd([2.0, None, 4.0, float("nan")]) == (3.0, pytest.approx(np.sqrt(2.0)), 2)
    assert mean_and_sd([5.0]) == (5.0, None, 1)
    assert mean_and_sd([]) == (None, None, 0)
