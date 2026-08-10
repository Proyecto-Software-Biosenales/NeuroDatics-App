"""The scenario name a caller sends and the one the Parquet stores rarely match.

These cover the single normalizer every consumer now shares, and then the
endpoints' compute layers, to prove one seam decides scenario identity for all
of them instead of each re-deriving its own key.
"""

import unicodedata

import pandas as pd
import pytest

from neurodatics.modules.analytics.application.services.analytics_service import (
    AoiAnalyticsService,
    EegAnalyticsService,
    FixationDataService,
    FixationHistogramService,
    GsrAnalyticsService,
    HeatmapAnalyticsService,
    PupilAnalyticsService,
    ScanpathAnalyticsService,
    resolve_scenario_in_frame,
    scope_to_scenario,
)
from neurodatics.modules.analytics.application.services.correlation_service import (
    CorrelationAnalyticsService,
)
from neurodatics.modules.analytics.domain.scenario_identity import (
    ScenarioAmbiguityError,
    is_all_scenarios,
    resolve_scenario,
    scenario_key,
)


# "Crem helado.jpeg" is the uploaded media file; "Crem Helado" is what the CSV
# importer wrote into the scenario column.
MEDIA_NAME = "Crem helado.jpeg"
STORED_NAME = "Crem Helado"


class TestScenarioKey:
    def test_media_file_name_and_stored_csv_value_share_one_key(self):
        assert scenario_key(MEDIA_NAME) == scenario_key(STORED_NAME)

    def test_unicode_equivalent_spellings_share_one_key(self):
        composed = unicodedata.normalize("NFC", "Bebé feliz.png")
        decomposed = unicodedata.normalize("NFD", "bebé feliz")

        assert composed != decomposed
        assert scenario_key(composed) == scenario_key(decomposed)

    def test_accents_still_separate_two_scenarios(self):
        assert scenario_key("Bebé") != scenario_key("Bebe")

    def test_surrounding_whitespace_quotes_and_case_are_ignored(self):
        assert scenario_key('  "Escena 1"  ') == scenario_key("escena1")

    def test_non_breaking_space_matches_a_plain_one(self):
        non_breaking = "Escena 1"

        assert non_breaking != "Escena 1"
        assert scenario_key(non_breaking) == scenario_key("Escena 1")

    def test_only_media_extensions_are_dropped(self):
        # Path(...).stem would cut ".2" and ".5" and fold these onto one key.
        assert scenario_key("Spot v1.2") != scenario_key("Spot v1.5")
        assert scenario_key("Spot v1.2.mp4") == scenario_key("Spot v1.2")

    def test_a_name_that_is_only_an_extension_keeps_a_key(self):
        assert scenario_key(".png") != ""

    def test_missing_values_have_no_key(self):
        assert scenario_key(None) == ""
        assert scenario_key("   ") == ""

    @pytest.mark.parametrize("value", [None, "all", "ALL", " All ", ""])
    def test_all_scenarios_sentinel_is_recognized_however_it_is_typed(self, value):
        assert is_all_scenarios(value)

    def test_a_real_scenario_is_not_the_sentinel(self):
        assert not is_all_scenarios(STORED_NAME)


class TestResolveScenario:
    def test_media_name_resolves_to_the_stored_spelling(self):
        resolution = resolve_scenario(MEDIA_NAME, [STORED_NAME, "Otra escena"])

        assert resolution is not None
        assert resolution.value == STORED_NAME
        assert not resolution.exact

    def test_exact_match_wins_over_a_normalized_twin_listed_first(self):
        resolution = resolve_scenario("Escena 1", ["escena1.png", "Escena 1"])

        assert resolution.value == "Escena 1"
        assert resolution.exact

    def test_two_names_sharing_a_key_are_ambiguous_rather_than_first_wins(self):
        with pytest.raises(ScenarioAmbiguityError) as exc_info:
            resolve_scenario(MEDIA_NAME, [STORED_NAME, "crem helado.png"])

        message = str(exc_info.value)
        assert STORED_NAME in message and "crem helado.png" in message

    def test_a_key_collision_among_other_scenarios_does_not_block_a_match(self):
        resolution = resolve_scenario(
            "Otra escena",
            [STORED_NAME, "crem helado.png", "Otra escena"],
        )

        assert resolution.value == "Otra escena"

    def test_the_same_spelling_listed_twice_is_one_scenario(self):
        # An image and a video of one stimulus both yield the same label.
        resolution = resolve_scenario("crem helado", [STORED_NAME, STORED_NAME])

        assert resolution.value == STORED_NAME

    def test_unknown_name_resolves_to_nothing(self):
        assert resolve_scenario("Missing", [STORED_NAME]) is None

    def test_missing_scenario_values_are_not_candidates(self):
        assert resolve_scenario("nan", [STORED_NAME, None, "nan", ""]) is None


def _signal_frame() -> pd.DataFrame:
    """Two scenarios, spelled the way the CSV importer wrote them."""

    return pd.DataFrame(
        {
            "time": [0.0, 0.1, 0.2, 1.0, 1.1, 1.2],
            "scenario": [STORED_NAME] * 3 + ["Otra escena"] * 3,
            "lx_pupil": [3.0, 3.1, 3.2, 9.0, 9.1, 9.2],
            "rx_pupil": [3.0, 3.1, 3.2, 9.0, 9.1, 9.2],
            "gx": [10.0, 11.0, 12.0, 80.0, 81.0, 82.0],
            "gy": [20.0, 21.0, 22.0, 60.0, 61.0, 62.0],
            "distance": [500.0, 501.0, 502.0, 700.0, 701.0, 702.0],
            "gsr": [1.0, 1.1, 1.2, 5.0, 5.1, 5.2],
            "le": [0.1, 0.2, 0.3, 0.7, 0.8, 0.9],
        }
    )


class TestScopeToScenario:
    def test_a_media_name_selects_the_rows_stored_under_the_csv_spelling(self):
        scoped = scope_to_scenario(_signal_frame(), MEDIA_NAME)

        assert list(scoped["scenario"].unique()) == [STORED_NAME]
        assert len(scoped) == 3

    def test_the_all_sentinel_keeps_every_row(self):
        assert len(scope_to_scenario(_signal_frame(), "all")) == 6

    def test_an_unknown_name_selects_no_rows(self):
        assert scope_to_scenario(_signal_frame(), "Missing").empty

    def test_a_frame_without_a_scenario_column_is_left_whole(self):
        frame = _signal_frame().drop(columns=["scenario"])

        assert len(scope_to_scenario(frame, MEDIA_NAME)) == 6

    def test_colliding_stored_values_are_reported_not_guessed(self):
        frame = _signal_frame()
        frame.loc[0, "scenario"] = "crem helado"

        with pytest.raises(ScenarioAmbiguityError):
            scope_to_scenario(frame, MEDIA_NAME)

    def test_resolution_reports_the_stored_spelling_for_display_decisions(self):
        resolution = resolve_scenario_in_frame(_signal_frame(), MEDIA_NAME)

        assert resolution.value == STORED_NAME
        assert not resolution.exact


class TestSignalEndpointsShareTheMatching:
    """Every signal service scopes through the same seam."""

    @pytest.mark.parametrize("requested", [STORED_NAME, MEDIA_NAME, "  crem  helado "])
    def test_pupil_timeseries_matches_all_spellings_of_one_scenario(self, requested):
        result = PupilAnalyticsService.compute_timeseries(_signal_frame(), requested)

        assert result["left"] == [3.0, 3.1, 3.2]

    def test_gaze_gsr_distance_and_eeg_scope_to_the_same_rows(self):
        frame = _signal_frame()

        gaze = PupilAnalyticsService.compute_gaze_timeseries(frame, MEDIA_NAME)
        distance = PupilAnalyticsService.compute_distance_timeseries(frame, MEDIA_NAME)
        gsr = GsrAnalyticsService.compute_timeseries(frame, MEDIA_NAME)
        eeg = EegAnalyticsService.compute_timeseries(frame, scenario=MEDIA_NAME)

        assert len(gaze["time"]) == 3
        assert distance["distance_cm"] == [50.0, 50.1, 50.2]
        assert len(gsr["time"]) == 3
        assert len(eeg["time"]) == 3

    def test_gaze_at_scopes_to_the_scenario_the_media_name_refers_to(self):
        frame = pd.DataFrame(
            {
                "time": [0.5, 0.5],
                "scenario": [STORED_NAME, "Otra escena"],
                "gx": [10.0, 90.0],
                "gy": [20.0, 80.0],
            }
        )

        result = PupilAnalyticsService.find_gaze_at(frame, 0.5, scenario=MEDIA_NAME)

        assert result["scenario"] == STORED_NAME
        assert result["gx"] == 10.0

    def test_scenario_relative_time_is_measured_from_the_matched_scenario(self):
        relative = PupilAnalyticsService.compute_scenario_relative_time(
            _signal_frame(),
            MEDIA_NAME,
            0.2,
        )

        assert relative == 0.2

    def test_correlations_scope_to_the_matched_scenario(self):
        frame = CorrelationAnalyticsService._scenario_frame(_signal_frame(), MEDIA_NAME)

        assert list(frame["scenario"].unique()) == [STORED_NAME]

    def test_an_unknown_scenario_still_yields_nothing(self):
        result = PupilAnalyticsService.compute_timeseries(_signal_frame(), "Missing")

        assert result["left"] == []


def _fixation_frame() -> pd.DataFrame:
    """A v2 fixation frame holding one scenario under its CSV spelling."""

    return pd.DataFrame(
        {
            "time": [0.00, 0.01, 0.02, 0.50, 0.51, 0.52],
            "fix_x": [10.0, 10.0, 10.0, 40.0, 40.0, 40.0],
            "fix_y": [20.0, 20.0, 20.0, 50.0, 50.0, 50.0],
            "fixation_id": [1, 1, 1, 2, 2, 2],
            "fixation_segment_id": ["segment-a"] * 6,
            "fixation_method": ["idt"] * 6,
            "fixation_detector_version": ["fixation-v2.0"] * 6,
            "fixation_detector_sample_count": [3, 3, 3, 3, 3, 3],
            "scenario": [STORED_NAME] * 6,
            "gx": [10.0, 10.0, 10.0, 40.0, 40.0, 40.0],
            "gy": [20.0, 20.0, 20.0, 50.0, 50.0, 50.0],
        }
    )


class _Aoi:
    def __init__(self):
        self.id = "aoi-1"
        self.name = "Logo"
        self.color = "#3B82F6"
        self.shape_type = "rect"
        self.shape = {"x": 0.0, "y": 0.0, "width": 100.0, "height": 100.0}


class TestSpatialEndpointsShareTheMatching:
    """Scanpath, fixation, heatmap and AOI all resolve through the same seam."""

    def test_fixation_data_matches_the_media_name(self):
        result = FixationDataService.compute_fixation_data(_fixation_frame(), MEDIA_NAME)

        assert result["stats"]["n_fixations"] == 2

    def test_scanpath_matches_the_media_name(self):
        result = ScanpathAnalyticsService.compute_scanpath(_fixation_frame(), MEDIA_NAME)

        assert result["n_objectives"] == 2

    def test_histogram_matches_the_media_name(self):
        result = FixationHistogramService.compute_histogram(_fixation_frame(), MEDIA_NAME)

        assert result["n_fixations"] == 2

    def test_heatmap_is_scoped_and_yields_nothing_for_an_unknown_scenario(self):
        # Renders no image, so this covers heatmap scoping without Pillow.
        png_bytes, _ = HeatmapAnalyticsService.compute_heatmap_overlay_with_metadata(
            _fixation_frame(),
            "Missing",
        )

        assert png_bytes is None

    def test_heatmap_matches_the_media_name(self):
        pytest.importorskip("PIL", reason="heatmap rendering needs Pillow")

        png_bytes, _ = HeatmapAnalyticsService.compute_heatmap_overlay_with_metadata(
            _fixation_frame(),
            MEDIA_NAME,
        )

        assert png_bytes

    def test_aoi_metrics_match_the_media_name(self):
        result = AoiAnalyticsService.compute_metrics(
            _fixation_frame(),
            MEDIA_NAME,
            [_Aoi()],
        )

        assert result["total_fixations"] == 2

    def test_a_colliding_stored_value_is_reported_by_the_spatial_path_too(self):
        frame = _fixation_frame()
        frame.loc[0, "scenario"] = "crem helado"

        with pytest.raises(ScenarioAmbiguityError):
            ScanpathAnalyticsService.compute_scanpath(frame, MEDIA_NAME)
