from sqlalchemy import (
    CheckConstraint,
    CHAR,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from typing import TYPE_CHECKING, Optional
from ....infra.db.base import BaseModel

if TYPE_CHECKING:
    from .stimulus_placement import StimulusPlacementContract, StimulusViewport


class Scenaries(BaseModel):
    """scenaries entity"""

    __tablename__ = "scenaries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)  # 'image', 'video', etc.
    file_id = Column(UUID(as_uuid=True), ForeignKey("project_files.id"), nullable=True)
    source_entry_path = Column(String(1024), nullable=True)
    width = Column(Integer)
    height = Column(Integer)
    fps = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)

    # Relationships
    project = relationship("Project", back_populates="scenaries")
    file = relationship("ProjectFile")
    aois = relationship("AOI", back_populates="scenaries", cascade="all, delete-orphan")
    stimulus_placement = relationship(
        "StimulusPlacement",
        back_populates="scenaries",
        cascade="all, delete-orphan",
        single_parent=True,
        uselist=False,
    )


class StimulusPlacement(BaseModel):
    """Static acquisition-time screen placement for one scenario stimulus."""

    __tablename__ = "stimulus_placements"
    __table_args__ = (
        UniqueConstraint("scenaries_id", name="uq_stimulus_placements_scenaries_id"),
        CheckConstraint(
            "contract_version = 'screen-stimulus-v1'",
            name="ck_stimulus_placements_contract_version",
        ),
        CheckConstraint(
            "geometry_stability = 'static'",
            name="ck_stimulus_placements_geometry_stability",
        ),
        CheckConstraint(
            "screen_width_px > 0 AND screen_height_px > 0",
            name="ck_stimulus_placements_screen_size_positive",
        ),
        CheckConstraint(
            "stimulus_left_px BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308 "
            "AND stimulus_top_px BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308",
            name="ck_stimulus_placements_origin_finite",
        ),
        CheckConstraint(
            "stimulus_width_px > 0 AND stimulus_width_px <= 1.7976931348623157e308 "
            "AND stimulus_height_px > 0 AND stimulus_height_px <= 1.7976931348623157e308",
            name="ck_stimulus_placements_display_size_positive_finite",
        ),
        CheckConstraint(
            "display_mode IN ('contain', 'cover', 'crop', 'fullscreen')",
            name="ck_stimulus_placements_display_mode",
        ),
        CheckConstraint(
            "((viewport_left_px IS NULL AND viewport_top_px IS NULL "
            "AND viewport_width_px IS NULL AND viewport_height_px IS NULL "
            "AND scroll_x_px IS NULL AND scroll_y_px IS NULL) "
            "OR (viewport_left_px IS NOT NULL AND viewport_top_px IS NOT NULL "
            "AND viewport_width_px IS NOT NULL AND viewport_height_px IS NOT NULL "
            "AND scroll_x_px IS NOT NULL AND scroll_y_px IS NOT NULL))",
            name="ck_stimulus_placements_viewport_atomic",
        ),
        CheckConstraint(
            "viewport_left_px IS NULL OR ("
            "viewport_left_px >= 0 AND viewport_top_px >= 0 "
            "AND viewport_width_px > 0 AND viewport_height_px > 0 "
            "AND viewport_left_px + viewport_width_px <= screen_width_px "
            "AND viewport_top_px + viewport_height_px <= screen_height_px "
            "AND scroll_x_px >= 0 AND scroll_x_px <= 1.7976931348623157e308 "
            "AND scroll_y_px >= 0 AND scroll_y_px <= 1.7976931348623157e308)",
            name="ck_stimulus_placements_viewport_bounds",
        ),
        CheckConstraint(
            "source IN ('user_config', 'acquisition_metadata')",
            name="ck_stimulus_placements_source",
        ),
        CheckConstraint(
            "contract_fingerprint ~ '^[0-9a-f]{64}$'",
            name="ck_stimulus_placements_fingerprint",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scenaries_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scenaries.id", ondelete="CASCADE"),
        nullable=False,
    )
    contract_version = Column(String(40), nullable=False)
    geometry_stability = Column(String(20), nullable=False)
    screen_width_px = Column(Integer, nullable=False)
    screen_height_px = Column(Integer, nullable=False)
    stimulus_left_px = Column(Float(precision=53), nullable=False)
    stimulus_top_px = Column(Float(precision=53), nullable=False)
    stimulus_width_px = Column(Float(precision=53), nullable=False)
    stimulus_height_px = Column(Float(precision=53), nullable=False)
    display_mode = Column(String(20), nullable=False)
    viewport_left_px = Column(Float(precision=53), nullable=True)
    viewport_top_px = Column(Float(precision=53), nullable=True)
    viewport_width_px = Column(Float(precision=53), nullable=True)
    viewport_height_px = Column(Float(precision=53), nullable=True)
    scroll_x_px = Column(Float(precision=53), nullable=True)
    scroll_y_px = Column(Float(precision=53), nullable=True)
    source = Column(String(32), nullable=False)
    contract_fingerprint = Column(CHAR(64), nullable=False)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    scenaries = relationship("Scenaries", back_populates="stimulus_placement")

    @property
    def viewport(self) -> Optional["StimulusViewport"]:
        """Return the nested viewport shape expected by API/domain callers."""

        if self.viewport_left_px is None:
            return None
        from .stimulus_placement import StimulusViewport

        return StimulusViewport(
            left_px=self.viewport_left_px,
            top_px=self.viewport_top_px,
            width_px=self.viewport_width_px,
            height_px=self.viewport_height_px,
            scroll_x_px=self.scroll_x_px,
            scroll_y_px=self.scroll_y_px,
        )

    @classmethod
    def from_contract(
        cls, contract: "StimulusPlacementContract"
    ) -> "StimulusPlacement":
        """Build an ORM child that can be attached to ``Scenaries``."""

        return cls(**contract.to_orm_values())

    def apply_contract(self, contract: "StimulusPlacementContract") -> None:
        """Replace all placement values while preserving row identity/audit dates."""

        for field, value in contract.to_orm_values().items():
            setattr(self, field, value)

    def to_contract(self) -> "StimulusPlacementContract":
        """Rehydrate the dependency-light domain contract from this ORM row."""

        from .stimulus_placement import StimulusPlacementContract

        return StimulusPlacementContract(
            geometry_stability=self.geometry_stability,
            contract_version=self.contract_version,
            screen_width_px=self.screen_width_px,
            screen_height_px=self.screen_height_px,
            stimulus_left_px=self.stimulus_left_px,
            stimulus_top_px=self.stimulus_top_px,
            stimulus_width_px=self.stimulus_width_px,
            stimulus_height_px=self.stimulus_height_px,
            display_mode=self.display_mode,
            viewport=self.viewport,
            source=self.source,
        )


class AOI(BaseModel):
    """Area of Interest entity"""

    __tablename__ = "aois"
    __table_args__ = (
        CheckConstraint(
            "shape_type IN ('rect', 'circle', 'polygon')",
            name="aoi_shape_allowed",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scenaries_id = Column(
        UUID(as_uuid=True), ForeignKey("scenaries.id"), nullable=False
    )
    name = Column(String(255), nullable=False)
    color = Column(String(7), nullable=False)  # Hex color
    shape_type = Column(String(20), nullable=False)  # 'rect', 'circle', 'polygon'
    shape = Column(JSON, nullable=False)  # Shape coordinates/properties

    # Relationships
    scenaries = relationship("Scenaries", back_populates="aois")
