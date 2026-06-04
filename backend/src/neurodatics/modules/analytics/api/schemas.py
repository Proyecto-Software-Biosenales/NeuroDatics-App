from typing import Dict, List, Optional

from pydantic import BaseModel


class ParticipantItem(BaseModel):
    participant_code: str
    user_index: int


class ScenarioItem(BaseModel):
    name: str
    type: str
    file_id: Optional[str] = None


class PupilTimeseriesResponse(BaseModel):
    time: List[float]
    left: List[float]
    right: List[float]
    average: List[float]
    smooth_left: List[float]
    smooth_right: List[float]


class PupilStatisticsResponse(BaseModel):
    mean: float
    min: float
    max: float
    std: float
    median: float
    baseline: float
    # Raw (unsmoothed) counterparts - shown as tooltips on the frontend
    raw_mean: Optional[float] = None
    raw_min: Optional[float] = None
    raw_max: Optional[float] = None
    raw_std: Optional[float] = None
    raw_median: Optional[float] = None
    raw_baseline: Optional[float] = None


class GazeAtResponse(BaseModel):
    requested_time_s: float
    nearest_time_s: float
    scenario: Optional[str] = None
    gx: Optional[float] = None
    gy: Optional[float] = None
    scenario_file_id: Optional[str] = None
    scenario_type: Optional[str] = None
    scenario_time_s: Optional[float] = None


class GazeTimeseriesResponse(BaseModel):
    time: List[float]
    gx_clean: List[float]
    gy_clean: List[float]


class GazeStatisticsResponse(BaseModel):
    gx_mean: float
    gx_min: float
    gx_max: float
    gx_std: float
    gx_median: float
    gx_baseline: float
    gy_mean: float
    gy_min: float
    gy_max: float
    gy_std: float
    gy_median: float
    gy_baseline: float


class DistanceTimeseriesResponse(BaseModel):
    time: List[float]
    distance_cm: List[float]


class DistanceStatisticsResponse(BaseModel):
    mean: float
    min: float
    max: float
    std: float
    median: float
    baseline: float


class GsrTimeseriesResponse(BaseModel):
    time: List[float]
    gsr: List[float]
    gsr_smooth: List[float]


class GsrStatisticsResponse(BaseModel):
    mean: float
    min: float
    max: float
    std: float
    median: float
    baseline: float
    raw_mean: Optional[float] = None
    raw_min: Optional[float] = None
    raw_max: Optional[float] = None
    raw_std: Optional[float] = None
    raw_median: Optional[float] = None
    raw_baseline: Optional[float] = None


class EegTimeseriesResponse(BaseModel):
    time: List[float]
    channels: List[str]
    available_channels: List[str]
    sampling_rate_hz: float
    raw: Dict[str, List[float]]
    smooth: Dict[str, List[float]]


class EegPsdResponse(BaseModel):
    frequency: List[float]
    channels: List[str]
    available_channels: List[str]
    sampling_rate_hz: float
    use_db: bool
    unit: str
    power: Dict[str, List[float]]


class ColorDomain(BaseModel):
    min: float
    max: float


class EegSpectrogramResponse(BaseModel):
    time: List[float]
    frequency: List[float]
    channels: List[str]
    available_channels: List[str]
    sampling_rate_hz: float
    use_db: bool
    normalize: str
    unit: str
    power: Dict[str, List[List[float]]]
    color_domain: ColorDomain


class EegTopographyResponse(BaseModel):
    time: List[float]
    channels: List[str]
    available_channels: List[str]
    sampling_rate_hz: float
    unit: str
    positions: Dict[str, List[float]]
    power: Dict[str, List[float]]
    color_domain: ColorDomain
    window_s: float
    overlap_ratio: float
    remove_dc: bool


class ScanpathObjective(BaseModel):
    id: int
    cx: float
    cy: float
    duration_s: float
    radius_norm: float
    t_start: float
    t_end: float
    n_points: int


class ScanpathResponse(BaseModel):
    objectives: List[ScanpathObjective]
    n_objectives: int
    total_distance_px: float
    avg_duration_s: float
    scenario_file_id: Optional[str] = None


class FixationPoint(BaseModel):
    x_norm: float
    y_norm: float
    time_s: float
    duration_s: float


class FixationStats(BaseModel):
    n_fixations: int
    max_duration_s: float
    avg_duration_s: float


class FixationDataResponse(BaseModel):
    fixations: List[FixationPoint]
    stats: FixationStats
    scenario_file_id: Optional[str] = None


class FixationHistogramBin(BaseModel):
    rango_min: int
    rango_max: int
    label: str
    conteo: int
    porcentaje: float
    promedio_ms: float


class FixationHistogramResponse(BaseModel):
    bins: List[FixationHistogramBin]
    n_fixations: int
    total_duration_ms: float
    mean_duration_ms: float
    min_duration_ms: float
    max_duration_ms: float


class AoiMetricItem(BaseModel):
    id: str
    name: str
    color: str
    shape_type: str
    shape: Dict[str, float]
    fixation_count: int
    total_dwell_time_ms: float
    total_dwell_time_percent: float
    avg_fixation_duration_ms: float
    ttff_ms: Optional[float] = None
    hit_rate_percent: float
    fixations_to_target: Optional[int] = None
    pupil_sample_count: int = 0
    avg_pupil_mm: Optional[float] = None
    pupil_delta_from_baseline_mm: Optional[float] = None
    pupil_delta_percent: Optional[float] = None
    distance_sample_count: int = 0
    avg_distance_cm: Optional[float] = None
    distance_delta_from_baseline_cm: Optional[float] = None
    distance_delta_percent: Optional[float] = None


class AoiTransitionRow(BaseModel):
    from_aoi: str
    counts: Dict[str, int]
    total: int


class AoiEventItem(BaseModel):
    id: str
    label: str
    metric: str
    kind: str
    value: float
    unit: str
    time_s: Optional[float] = None
    gx: Optional[float] = None
    gy: Optional[float] = None
    aoi_id: Optional[str] = None
    aoi_name: Optional[str] = None
    aoi_color: Optional[str] = None


class AoiMetricsResponse(BaseModel):
    scenario: str
    scenario_file_id: Optional[str] = None
    aois: List[AoiMetricItem]
    transitions: List[AoiTransitionRow]
    events: List[AoiEventItem] = []
    total_fixations: int
    total_dwell_time_ms: float
    observed_aoi_dwell_time_ms: float
    observed_aoi_dwell_time_percent: float
