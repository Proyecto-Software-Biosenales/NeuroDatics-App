"""Confirm a deliberate off-by-one smoothing bug is caught, without file edits."""

from pathlib import Path
import runpy
import sys

import pytest


def main() -> int:
    backend = Path(__file__).resolve().parents[3]
    sys.path.insert(0, str(backend / "src"))
    runpy.run_path(str(backend / "tests/conftest.py"))
    from neurodatics.modules.analytics.application.services import analytics_service

    original = analytics_service._moving_average
    analytics_service._moving_average = lambda values, window: original(values, window + 1)
    test = backend / "tests/characterization/test_numeric_characterization.py"
    failures = []

    class Capture:
        def pytest_runtest_logreport(self, report):
            if report.failed:
                failures.append((report.when, str(report.longrepr)))

    try:
        result = pytest.main([
            str(test) + "::test_timeseries_and_statistics[SYN-01-stimulus-a]",
            "-q", "--disable-warnings",
        ], plugins=[Capture()])
    finally:
        analytics_service._moving_average = original
    if (result != pytest.ExitCode.TESTS_FAILED or len(failures) != 1
            or failures[0][0] != "call" or "num_regression.check" not in failures[0][1]):
        print(f"MUTATION NOT VALIDATED: expected a test failure, received {result}")
        return 1
    print("MUTATION CAUGHT: off-by-one smoothing window; production files untouched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
