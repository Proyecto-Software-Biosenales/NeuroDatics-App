"""Edge cases protected while removing repeated scenario string passes."""

import numpy as np
import pandas as pd
import pytest

from neurodatics.modules.analytics.application.services.numeric_helpers import (
    resolve_scenario_in_frame,
    scope_to_scenario,
)
from neurodatics.shared.scenario_identity import ScenarioAmbiguityError


@pytest.mark.parametrize("dtype", [object, "string", "category"])
def test_scope_keeps_whitespace_variants_and_missing_values_separate(dtype):
    frame = pd.DataFrame({
        "scenario": pd.Series([" Spot A ", None, "Spot A", "\tSpot A\n", "Other", pd.NA], dtype=dtype),
        "sample": range(6),
    })
    original = frame.copy(deep=True)

    result = scope_to_scenario(frame, "spot a.png")

    assert result["sample"].tolist() == [0, 2, 3]
    assert resolve_scenario_in_frame(frame, "spot a.png").value == " Spot A "
    pd.testing.assert_frame_equal(frame, original)
    assert result["scenario"].dtype == frame["scenario"].dtype


@pytest.mark.parametrize("target, expected", [
    ("1", [0, 2]),
    ("1.0", [1, 3]),
    ("True", [4]),
    ("nan", []),
    ("none", []),
    ("<NA>", []),
])
def test_scope_preserves_mixed_object_stringification(target, expected):
    frame = pd.DataFrame({"scenario": pd.Series(
        [1, 1.0, "1", "1.0", True, None, np.nan, pd.NA], dtype=object
    )})

    assert scope_to_scenario(frame, target).index.tolist() == expected


def test_scope_exact_match_still_wins_and_normalized_collision_still_raises():
    frame = pd.DataFrame({"scenario": [" Spot A ", "spota.png", "Spot A"]})

    assert scope_to_scenario(frame, "Spot A").index.tolist() == [0, 2]
    with pytest.raises(ScenarioAmbiguityError, match="2 different stored scenarios"):
        scope_to_scenario(frame, "SPOT A")


@pytest.mark.parametrize("dtype", ["Int64", "float64"])
def test_scope_coerces_numeric_columns_without_matching_nulls(dtype):
    frame = pd.DataFrame({"scenario": pd.Series([1, None, 2], dtype=dtype)})
    target = "1" if dtype == "Int64" else "1.0"

    assert scope_to_scenario(frame, target).index.tolist() == [0]
