"""Column contracts for analytics; absent optional sensors retain legacy behavior."""

from dataclasses import dataclass
from typing import Iterable, Tuple


@dataclass(frozen=True)
class ParquetProjection:
    """Immutable selection, resolved in file order without synthesizing columns.

    Required columns are for consumers that cannot operate without them. Built-in
    sensor profiles use optional columns: existing services explicitly return
    empty results when a sensor/time is absent, including in legacy artifacts.
    Attributes and the pandas index are preserved by the reader independently.
    """

    name: str
    required: Tuple[str, ...] = ()
    optional: Tuple[str, ...] = ()

    def resolve(self, schema_columns: Iterable[str]) -> list[str]:
        available = list(schema_columns)
        missing = set(self.required).difference(available)
        if missing:
            raise ValueError(f"Projection {self.name!r} requires missing columns: {sorted(missing)}")
        selected = set(self.required) | set(self.optional)
        return [column for column in available if column in selected]


# Row identity and segment labels are retained even if a particular service does
# not use them yet. No signal types or time precision are changed.
_CONTEXT = ("time", "scenario", "participant_code", "user_index", "segment_id")
GSR_PROJECTION = ParquetProjection("gsr", optional=(*_CONTEXT, "gsr"))
PUPIL_PROJECTION = ParquetProjection("pupil", optional=(*_CONTEXT, "lx_pupil", "rx_pupil"))
DISTANCE_PROJECTION = ParquetProjection("distance", optional=(*_CONTEXT, "distance"))
TIMING_PROJECTION = ParquetProjection("timing", optional=(*_CONTEXT, "gsr"))
# All channels are needed for available_channels and for reference/quality
# selection. Acquisition/units/exclusions live in attrs and must survive reads.
EEG_PROJECTION = ParquetProjection(
    "eeg", optional=(*_CONTEXT, "le", "f4", "c4", "p4", "p3", "c3", "f3"),
)
