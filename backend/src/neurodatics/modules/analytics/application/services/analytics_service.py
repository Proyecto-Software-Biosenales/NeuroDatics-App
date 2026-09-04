"""Backward-compatible exports for the separated analytics services.

Implementation modules own computation; this module preserves historical imports
and shares the exact class objects used by the API, reports and existing tests.
"""

from copy import deepcopy as deepcopy
import json as json
from typing import Iterable as Iterable, Optional as Optional
from scipy.ndimage import gaussian_filter as gaussian_filter
from scipy.signal import spectrogram as spectrogram, welch as welch
from neurodatics.shared.fixation_contract import (
    CANONICAL_FIXATION_MIN_DURATION_MS as CANONICAL_FIXATION_MIN_DURATION_MS,
    DEFAULT_FIXATION_MIN_DURATION_MS as DEFAULT_FIXATION_MIN_DURATION_MS,
    FIXATION_DURATION_VARIANT_COLUMNS as FIXATION_DURATION_VARIANT_COLUMNS,
    FIXATION_MIN_DURATION_COLUMN as FIXATION_MIN_DURATION_COLUMN,
    SUPPORTED_FIXATION_MIN_DURATIONS_MS as SUPPORTED_FIXATION_MIN_DURATIONS_MS,
    fixation_duration_column as fixation_duration_column,
)
from ...domain.coordinate_transform import (
    APPLIED_STATUS as APPLIED_STATUS,
    LOCAL_X_COLUMN as LOCAL_X_COLUMN,
    LOCAL_Y_COLUMN as LOCAL_Y_COLUMN,
    applied_transform_mask as applied_transform_mask,
    attach_transform_provenance as attach_transform_provenance,
    displayed_stimulus_size as displayed_stimulus_size,
    hard_stimulus_boundary_mask as hard_stimulus_boundary_mask,
    valid_stimulus_gaze_mask as valid_stimulus_gaze_mask,
)
from neurodatics.shared.scenario_identity import (
    ScenarioResolution as ScenarioResolution,
    is_all_scenarios as is_all_scenarios,
    resolve_scenario as resolve_scenario,
)
from ...domain.stimulus_geometry import resolve_output_size as resolve_output_size
from .numeric_helpers import (
    np as np,
    pd as pd,
    _infer_fs as _infer_fs,
    _moving_average as _moving_average,
    _robust_baseline as _robust_baseline,
    resolve_scenario_in_frame as resolve_scenario_in_frame,
    scope_to_scenario as scope_to_scenario,
    _filter_time_window as _filter_time_window,
)
from .pupil_analytics_service import (
    PupilAnalyticsService as PupilAnalyticsService,
)
from .gsr_analytics_service import (
    GsrAnalyticsService as GsrAnalyticsService,
)
from .eeg_analytics_service import (
    EEG_CHANNELS as EEG_CHANNELS,
    EEG_TOPOGRAPHY_CHANNELS as EEG_TOPOGRAPHY_CHANNELS,
    EEG_TOPOGRAPHY_LAYOUT as EEG_TOPOGRAPHY_LAYOUT,
    EegAnalyticsService as EegAnalyticsService,
)
from .fixation_analytics_service import (
    FixationDurationVariantService as FixationDurationVariantService,
    FixationEventService as FixationEventService,
)
from .scanpath_analytics_service import (
    ScanpathAnalyticsService as ScanpathAnalyticsService,
)
from .fixation_summaries import (
    FixationDataService as FixationDataService,
    FixationHistogramService as FixationHistogramService,
)
from .aoi_analytics_service import (
    AoiAnalyticsService as AoiAnalyticsService,
)
from .heatmap_analytics_service import (
    HeatmapAnalyticsService as HeatmapAnalyticsService,
)
