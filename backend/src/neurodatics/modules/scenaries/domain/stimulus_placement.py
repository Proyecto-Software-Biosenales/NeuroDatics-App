"""Validated acquisition-time placement for a scenario stimulus.

This module deliberately has no SQLAlchemy, FastAPI, or pandas dependency so
upload processing, fixation detection, persistence, and API adapters can share
one interpretation of the approved ``screen-stimulus-v1`` contract.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
from typing import Any, Dict, Mapping, Optional


CONTRACT_VERSION = "screen-stimulus-v1"
GEOMETRY_STATIC = "static"
GEOMETRY_TIME_VARYING = "time_varying"
DISPLAY_MODES = frozenset({"contain", "cover", "crop", "fullscreen"})
PLACEMENT_SOURCES = frozenset({"user_config", "acquisition_metadata"})
ASPECT_RATIO_TOLERANCE = 1e-4


class StimulusPlacementValidationError(ValueError):
    """A placement cannot be accepted under the v1 contract."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class StimulusPlacementRequiresReprocessing(RuntimeError):
    """A direct scenario update would desynchronise processed artifacts."""

    code = "stimulus_placement_requires_reprocessing"


def _error(code: str, message: str) -> StimulusPlacementValidationError:
    return StimulusPlacementValidationError(code, message)


def _finite_number(value: Any, field: str, *, positive: bool = False) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _error("invalid_stimulus_placement", f"{field} must be a number")
    try:
        number = float(value)
    except (OverflowError, ValueError):
        raise _error("invalid_stimulus_placement", f"{field} must be finite") from None
    if not math.isfinite(number):
        raise _error("invalid_stimulus_placement", f"{field} must be finite")
    if positive and number <= 0:
        raise _error("invalid_stimulus_placement", f"{field} must be positive")
    return number


def _positive_integer(value: Any, field: str) -> int:
    number = _finite_number(value, field, positive=True)
    if not number.is_integer():
        raise _error("invalid_stimulus_placement", f"{field} must be an integer")
    return int(number)


def _require_keys(
    payload: Mapping[str, Any], required: frozenset[str], label: str
) -> None:
    missing = sorted(required.difference(payload))
    if missing:
        raise _error(
            "invalid_stimulus_placement",
            f"{label} is missing required field(s): {', '.join(missing)}",
        )


def _reject_unknown_keys(
    payload: Mapping[str, Any], allowed: frozenset[str], label: str
) -> None:
    unknown = sorted(set(payload).difference(allowed))
    if unknown:
        raise _error(
            "invalid_stimulus_placement",
            f"{label} contains unsupported field(s): {', '.join(unknown)}",
        )


def _normalise_number(value: float) -> Any:
    """Use one JSON number representation for equivalent integral values."""

    number = float(value)
    return int(number) if number.is_integer() else number


def _ecmascript_number(value: float) -> str:
    """Render a finite float with the RFC 8785/ECMAScript thresholds."""

    if value == 0:
        return "0"
    if not math.isfinite(value):
        raise ValueError("canonical JSON does not support non-finite numbers")

    negative = value < 0
    rendered = repr(abs(value)).lower()
    if "e" in rendered:
        mantissa, exponent_text = rendered.split("e", 1)
        exponent = int(exponent_text)
        whole, _, fraction = mantissa.partition(".")
        digits = whole + fraction
        decimal_position = 1 + exponent
    else:
        whole, _, fraction = rendered.partition(".")
        digits = whole + fraction
        decimal_position = len(whole)

    leading_zeroes = len(digits) - len(digits.lstrip("0"))
    digits = digits.lstrip("0")
    decimal_position -= leading_zeroes
    digits = digits.rstrip("0") or "0"
    adjusted_exponent = decimal_position - 1

    if adjusted_exponent >= 21 or adjusted_exponent <= -7:
        number = digits[0]
        if len(digits) > 1:
            number += "." + digits[1:]
        exponent_sign = "+" if adjusted_exponent >= 0 else ""
        number += f"e{exponent_sign}{adjusted_exponent}"
    elif decimal_position <= 0:
        number = "0." + ("0" * -decimal_position) + digits
    elif decimal_position >= len(digits):
        number = digits + ("0" * (decimal_position - len(digits)))
    else:
        number = digits[:decimal_position] + "." + digits[decimal_position:]

    return "-" + number if negative else number


def _canonical_json(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, int):
        return _ecmascript_number(float(value))
    if isinstance(value, float):
        return _ecmascript_number(value)
    if isinstance(value, Mapping):
        return (
            "{"
            + ",".join(
                f"{_canonical_json(key)}:{_canonical_json(value[key])}"
                for key in sorted(value)
            )
            + "}"
        )
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(_canonical_json(item) for item in value) + "]"
    raise TypeError(f"unsupported canonical JSON value: {type(value).__name__}")


def _canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
    """Serialize this contract's fixed ASCII-keyed domain per RFC 8785.

    Contract validation excludes non-finite numbers, and the fixed key
    vocabulary means RFC 8785's UTF-16 property-sort edge cases cannot arise.
    """

    return _canonical_json(value).encode("utf-8")


@dataclass(frozen=True)
class StimulusViewport:
    left_px: float
    top_px: float
    width_px: float
    height_px: float
    scroll_x_px: float = 0.0
    scroll_y_px: float = 0.0

    _REQUIRED_KEYS = frozenset({"left_px", "top_px", "width_px", "height_px"})
    _ALLOWED_KEYS = _REQUIRED_KEYS | frozenset({"scroll_x_px", "scroll_y_px"})

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "StimulusViewport":
        if not isinstance(payload, Mapping):
            raise _error(
                "invalid_stimulus_placement", "viewport must be an object or null"
            )
        _require_keys(payload, cls._REQUIRED_KEYS, "viewport")
        _reject_unknown_keys(payload, cls._ALLOWED_KEYS, "viewport")

        has_scroll_x = "scroll_x_px" in payload
        has_scroll_y = "scroll_y_px" in payload
        if has_scroll_x != has_scroll_y:
            raise _error(
                "invalid_stimulus_placement",
                "viewport scroll_x_px and scroll_y_px must be supplied together",
            )

        scroll_x = _finite_number(payload.get("scroll_x_px", 0), "viewport.scroll_x_px")
        scroll_y = _finite_number(payload.get("scroll_y_px", 0), "viewport.scroll_y_px")
        if scroll_x < 0 or scroll_y < 0:
            raise _error(
                "invalid_stimulus_placement",
                "viewport scroll offsets must be non-negative",
            )

        return cls(
            left_px=_finite_number(payload["left_px"], "viewport.left_px"),
            top_px=_finite_number(payload["top_px"], "viewport.top_px"),
            width_px=_finite_number(
                payload["width_px"], "viewport.width_px", positive=True
            ),
            height_px=_finite_number(
                payload["height_px"], "viewport.height_px", positive=True
            ),
            scroll_x_px=scroll_x,
            scroll_y_px=scroll_y,
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "left_px": _normalise_number(self.left_px),
            "top_px": _normalise_number(self.top_px),
            "width_px": _normalise_number(self.width_px),
            "height_px": _normalise_number(self.height_px),
            "scroll_x_px": _normalise_number(self.scroll_x_px),
            "scroll_y_px": _normalise_number(self.scroll_y_px),
        }


@dataclass(frozen=True)
class StimulusPlacementContract:
    geometry_stability: str
    contract_version: str
    screen_width_px: int
    screen_height_px: int
    stimulus_left_px: float
    stimulus_top_px: float
    stimulus_width_px: float
    stimulus_height_px: float
    display_mode: str
    viewport: Optional[StimulusViewport]
    source: str = "user_config"

    _REQUIRED_KEYS = frozenset(
        {
            "geometry_stability",
            "contract_version",
            "screen_width_px",
            "screen_height_px",
            "stimulus_left_px",
            "stimulus_top_px",
            "stimulus_width_px",
            "stimulus_height_px",
            "display_mode",
        }
    )
    _ALLOWED_KEYS = _REQUIRED_KEYS | frozenset({"viewport", "source"})

    @classmethod
    def from_dict(
        cls,
        payload: Mapping[str, Any],
        *,
        intrinsic_width: Optional[int] = None,
        intrinsic_height: Optional[int] = None,
        source: str = "user_config",
    ) -> "StimulusPlacementContract":
        """Validate an input object and return an immutable v1 contract.

        ``intrinsic_width`` and ``intrinsic_height`` are required for the
        aspect-preserving ``contain`` and ``cover`` modes. ``source`` is
        backend assigned; API request schemas reject that field from clients.
        """

        if not isinstance(payload, Mapping):
            raise _error("invalid_stimulus_placement", "placement must be an object")

        _require_keys(payload, cls._REQUIRED_KEYS, "placement")
        _reject_unknown_keys(payload, cls._ALLOWED_KEYS, "placement")

        stability = payload["geometry_stability"]
        if stability == GEOMETRY_TIME_VARYING:
            raise _error(
                "dynamic_stimulus_geometry_not_supported",
                "screen-stimulus-v1 supports only static placement geometry",
            )
        if stability != GEOMETRY_STATIC:
            raise _error(
                "invalid_stimulus_placement",
                "geometry_stability must be static or time_varying",
            )

        version = payload["contract_version"]
        if version != CONTRACT_VERSION:
            raise _error(
                "unsupported_stimulus_placement_version",
                f"contract_version must be {CONTRACT_VERSION}",
            )

        mode = payload["display_mode"]
        if not isinstance(mode, str) or mode not in DISPLAY_MODES:
            raise _error(
                "invalid_stimulus_placement",
                f"display_mode must be one of {', '.join(sorted(DISPLAY_MODES))}",
            )

        payload_source = payload.get("source", source)
        if payload_source != source:
            raise _error(
                "invalid_stimulus_placement_source",
                "placement source must be assigned by the backend",
            )
        if not isinstance(source, str) or source not in PLACEMENT_SOURCES:
            raise _error(
                "invalid_stimulus_placement_source",
                f"source must be one of {', '.join(sorted(PLACEMENT_SOURCES))}",
            )

        screen_width = _positive_integer(payload["screen_width_px"], "screen_width_px")
        screen_height = _positive_integer(
            payload["screen_height_px"], "screen_height_px"
        )
        left = _finite_number(payload["stimulus_left_px"], "stimulus_left_px")
        top = _finite_number(payload["stimulus_top_px"], "stimulus_top_px")
        width = _finite_number(
            payload["stimulus_width_px"], "stimulus_width_px", positive=True
        )
        height = _finite_number(
            payload["stimulus_height_px"], "stimulus_height_px", positive=True
        )

        viewport_payload = payload.get("viewport")
        viewport = (
            StimulusViewport.from_dict(viewport_payload)
            if viewport_payload is not None
            else None
        )
        clip = viewport or StimulusViewport(
            left_px=0.0,
            top_px=0.0,
            width_px=float(screen_width),
            height_px=float(screen_height),
        )

        cls._validate_viewport_inside_screen(clip, screen_width, screen_height)
        cls._validate_positive_intersection(
            left,
            top,
            width,
            height,
            0.0,
            0.0,
            float(screen_width),
            float(screen_height),
            "displayed stimulus must intersect the screen",
        )
        cls._validate_positive_intersection(
            left,
            top,
            width,
            height,
            clip.left_px,
            clip.top_px,
            clip.width_px,
            clip.height_px,
            "displayed stimulus must intersect the viewport",
        )

        if mode in {"contain", "cover"}:
            cls._validate_intrinsic_aspect(
                width,
                height,
                intrinsic_width=intrinsic_width,
                intrinsic_height=intrinsic_height,
            )

        if mode == "contain":
            if not cls._rect_contains(
                clip.left_px,
                clip.top_px,
                clip.width_px,
                clip.height_px,
                left,
                top,
                width,
                height,
            ):
                raise _error(
                    "invalid_stimulus_placement",
                    "contain stimulus rectangle must lie inside the viewport",
                )
        elif mode == "cover":
            if viewport is None:
                raise _error(
                    "invalid_stimulus_placement", "cover mode requires a viewport"
                )
            if not cls._rect_contains(
                left,
                top,
                width,
                height,
                clip.left_px,
                clip.top_px,
                clip.width_px,
                clip.height_px,
            ):
                raise _error(
                    "invalid_stimulus_placement",
                    "cover stimulus rectangle must cover the viewport",
                )
        elif mode == "crop":
            if viewport is None:
                raise _error(
                    "invalid_stimulus_placement", "crop mode requires a viewport"
                )
        elif mode == "fullscreen":
            expected_rectangle = (0.0, 0.0, float(screen_width), float(screen_height))
            if (left, top, width, height) != expected_rectangle:
                raise _error(
                    "invalid_stimulus_placement",
                    "fullscreen must exactly match the complete screen rectangle",
                )
            if (
                clip.to_dict()
                != StimulusViewport(
                    0.0,
                    0.0,
                    float(screen_width),
                    float(screen_height),
                ).to_dict()
            ):
                raise _error(
                    "invalid_stimulus_placement",
                    "fullscreen viewport must be absent or exactly the full screen "
                    "with zero scroll",
                )

        return cls(
            geometry_stability=stability,
            contract_version=version,
            screen_width_px=screen_width,
            screen_height_px=screen_height,
            stimulus_left_px=left,
            stimulus_top_px=top,
            stimulus_width_px=width,
            stimulus_height_px=height,
            display_mode=mode,
            viewport=viewport,
            source=source,
        )

    @staticmethod
    def _validate_viewport_inside_screen(
        viewport: StimulusViewport,
        screen_width: int,
        screen_height: int,
    ) -> None:
        if (
            viewport.left_px < 0
            or viewport.top_px < 0
            or viewport.left_px + viewport.width_px > screen_width
            or viewport.top_px + viewport.height_px > screen_height
        ):
            raise _error(
                "invalid_stimulus_placement",
                "viewport must lie within the screen rectangle",
            )

    @staticmethod
    def _validate_positive_intersection(
        left_a: float,
        top_a: float,
        width_a: float,
        height_a: float,
        left_b: float,
        top_b: float,
        width_b: float,
        height_b: float,
        message: str,
    ) -> None:
        intersection_width = min(left_a + width_a, left_b + width_b) - max(
            left_a, left_b
        )
        intersection_height = min(top_a + height_a, top_b + height_b) - max(
            top_a, top_b
        )
        if intersection_width <= 0 or intersection_height <= 0:
            raise _error("invalid_stimulus_placement", message)

    @staticmethod
    def _rect_contains(
        outer_left: float,
        outer_top: float,
        outer_width: float,
        outer_height: float,
        inner_left: float,
        inner_top: float,
        inner_width: float,
        inner_height: float,
    ) -> bool:
        return (
            outer_left <= inner_left
            and outer_top <= inner_top
            and outer_left + outer_width >= inner_left + inner_width
            and outer_top + outer_height >= inner_top + inner_height
        )

    @staticmethod
    def _validate_intrinsic_aspect(
        display_width: float,
        display_height: float,
        *,
        intrinsic_width: Optional[int],
        intrinsic_height: Optional[int],
    ) -> None:
        if (
            isinstance(intrinsic_width, bool)
            or isinstance(intrinsic_height, bool)
            or not isinstance(intrinsic_width, (int, float))
            or not isinstance(intrinsic_height, (int, float))
            or not math.isfinite(float(intrinsic_width))
            or not math.isfinite(float(intrinsic_height))
            or intrinsic_width <= 0
            or intrinsic_height <= 0
        ):
            raise _error(
                "intrinsic_dimensions_required_for_display_mode",
                "contain and cover require positive probed intrinsic dimensions",
            )

        display_ratio = display_width / display_height
        intrinsic_ratio = float(intrinsic_width) / float(intrinsic_height)
        relative_error = abs((display_ratio / intrinsic_ratio) - 1.0)
        if relative_error > ASPECT_RATIO_TOLERANCE:
            raise _error(
                "invalid_stimulus_placement",
                "displayed rectangle does not preserve the intrinsic aspect ratio",
            )

    @property
    def resolved_viewport(self) -> StimulusViewport:
        return self.viewport or StimulusViewport(
            left_px=0.0,
            top_px=0.0,
            width_px=float(self.screen_width_px),
            height_px=float(self.screen_height_px),
        )

    def to_dict(self, *, resolved: bool = True) -> Dict[str, Any]:
        """Return the canonical contract object, excluding its fingerprint."""

        viewport = self.resolved_viewport if resolved else self.viewport
        return {
            "geometry_stability": self.geometry_stability,
            "contract_version": self.contract_version,
            "screen_width_px": self.screen_width_px,
            "screen_height_px": self.screen_height_px,
            "stimulus_left_px": _normalise_number(self.stimulus_left_px),
            "stimulus_top_px": _normalise_number(self.stimulus_top_px),
            "stimulus_width_px": _normalise_number(self.stimulus_width_px),
            "stimulus_height_px": _normalise_number(self.stimulus_height_px),
            "display_mode": self.display_mode,
            "viewport": viewport.to_dict() if viewport is not None else None,
            "source": self.source,
        }

    @property
    def fingerprint(self) -> str:
        """SHA-256 fingerprint of the resolved canonical contract."""

        return hashlib.sha256(
            _canonical_json_bytes(self.to_dict(resolved=True))
        ).hexdigest()

    def to_snapshot(self) -> Dict[str, Any]:
        """Return the resolved contract plus its backend-generated fingerprint."""

        return {**self.to_dict(resolved=True), "contract_fingerprint": self.fingerprint}

    def to_orm_values(self) -> Dict[str, Any]:
        """Flatten the contract into the approved ``stimulus_placements`` columns."""

        viewport = self.viewport
        return {
            "geometry_stability": self.geometry_stability,
            "contract_version": self.contract_version,
            "screen_width_px": self.screen_width_px,
            "screen_height_px": self.screen_height_px,
            "stimulus_left_px": self.stimulus_left_px,
            "stimulus_top_px": self.stimulus_top_px,
            "stimulus_width_px": self.stimulus_width_px,
            "stimulus_height_px": self.stimulus_height_px,
            "display_mode": self.display_mode,
            "viewport_left_px": viewport.left_px if viewport else None,
            "viewport_top_px": viewport.top_px if viewport else None,
            "viewport_width_px": viewport.width_px if viewport else None,
            "viewport_height_px": viewport.height_px if viewport else None,
            "scroll_x_px": viewport.scroll_x_px if viewport else None,
            "scroll_y_px": viewport.scroll_y_px if viewport else None,
            "source": self.source,
            "contract_fingerprint": self.fingerprint,
        }
