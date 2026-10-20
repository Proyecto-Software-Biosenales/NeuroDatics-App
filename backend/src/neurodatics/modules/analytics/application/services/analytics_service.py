"""Backward-compatible exports for the separated analytics services.

Implementation modules own computation; this module preserves historical imports
and shares the exact class objects used by the API, reports and existing tests.
Only names that something imports from here are re-exported.
"""

from .numeric_helpers import (
    _infer_fs as _infer_fs,
    _moving_average as _moving_average,
    resolve_scenario_in_frame as resolve_scenario_in_frame,
    scope_to_scenario as scope_to_scenario,
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
