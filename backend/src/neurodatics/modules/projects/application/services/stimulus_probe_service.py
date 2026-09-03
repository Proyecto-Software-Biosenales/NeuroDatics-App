"""Reads a stimulus file's intrinsic dimensions while it is still on disk.

Every spatial overlay is rendered at the stimulus' own pixel size, so those
dimensions have to be recorded once, at ingestion, when the bytes are local and
cheap to read. Without them the analytics layer falls back to a 1920x1080
reference, which silently distorts any stimulus that is not 16:9.

Probing never fails an upload: an unreadable or exotic file simply yields no
dimensions and the scenario keeps the reference fallback. For video the probe
prefers ``ffprobe`` when it is on PATH (it understands every container this
product accepts) and otherwise parses the ISO base media container directly,
which covers ``.mp4``, ``.mov`` and ``.m4v``. AVI, MKV and WebM without
``ffprobe`` installed are the cases that come back empty.
"""

from __future__ import annotations

import json
import logging
import re
import shutil
import struct
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Optional, Tuple

logger = logging.getLogger(__name__)

# EXIF orientations that transpose the image. A browser applies these when it
# decodes the file, so ``naturalWidth``/``naturalHeight`` - and therefore the
# box an overlay has to line up with - are the swapped pair.
_EXIF_ORIENTATION_TAG = 0x0112
_EXIF_TRANSPOSED_ORIENTATIONS = frozenset({5, 6, 7, 8})

_SVG_HEADER_BYTES = 8192
_SVG_TAG_RE = re.compile(rb"<svg\b[^>]*>", re.IGNORECASE | re.DOTALL)
_SVG_ATTR_RE = re.compile(
    rb"""\b(width|height|viewBox)\s*=\s*(?:"([^"]*)"|'([^']*)')""",
    re.IGNORECASE,
)
_SVG_LENGTH_RE = re.compile(r"^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$", re.IGNORECASE)

_FFPROBE_TIMEOUT_SECONDS = 20

# Boxes that only hold other boxes; anything else is payload we either parse or
# skip. Bounding the walk this way keeps a malformed file from turning into an
# unbounded recursion.
_ISO_CONTAINER_BOXES = frozenset({b"moov", b"trak", b"mdia", b"minf", b"stbl"})
_ISO_MAX_DEPTH = 6


@dataclass(frozen=True)
class StimulusDimensions:
    """What a stimulus file reports about itself. Any field may be unknown."""

    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[int] = None
    duration_ms: Optional[int] = None

    @property
    def has_size(self) -> bool:
        return bool(self.width and self.height)


def probe_stimulus(local_path: str, kind: str) -> StimulusDimensions:
    """Read intrinsic dimensions for an ingested stimulus. Never raises."""

    try:
        if kind == "scenario_image":
            return _probe_image(Path(local_path))
        if kind == "scenario_video":
            return _probe_video(Path(local_path))
    except Exception as exc:  # pragma: no cover - defensive, ingestion must go on
        logger.info("Could not probe stimulus %s (%s): %s", local_path, kind, exc)
    return StimulusDimensions()


# --------------------------------------------------------------------------- #
# Images
# --------------------------------------------------------------------------- #


def _probe_image(path: Path) -> StimulusDimensions:
    try:
        from PIL import Image
    except ImportError:  # pragma: no cover - Pillow is a hard dependency
        logger.info("Pillow unavailable; skipping image dimension probe for %s", path)
        return _probe_svg(path)

    try:
        with Image.open(path) as image:
            width, height = image.size
            orientation = _exif_orientation(image)
    except Exception as exc:
        # SVG is in the accepted extension list but is not a raster format.
        svg = _probe_svg(path)
        if svg.has_size:
            return svg
        logger.info("Could not read image dimensions for %s: %s", path, exc)
        return StimulusDimensions()

    if orientation in _EXIF_TRANSPOSED_ORIENTATIONS:
        width, height = height, width
    return StimulusDimensions(width=_positive(width), height=_positive(height))


def _exif_orientation(image) -> Optional[int]:
    try:
        exif = image.getexif()
    except Exception:
        return None
    if not exif:
        return None
    try:
        return int(exif.get(_EXIF_ORIENTATION_TAG))
    except (TypeError, ValueError):
        return None


def _probe_svg(path: Path) -> StimulusDimensions:
    """Take an SVG's declared size, or the size implied by its viewBox."""

    try:
        with path.open("rb") as handle:
            header = handle.read(_SVG_HEADER_BYTES)
    except OSError:
        return StimulusDimensions()

    tag_match = _SVG_TAG_RE.search(header)
    if not tag_match:
        return StimulusDimensions()

    attributes = {}
    for name, double_quoted, single_quoted in _SVG_ATTR_RE.findall(tag_match.group(0)):
        raw = double_quoted or single_quoted
        attributes[name.decode("ascii", "ignore").lower()] = raw.decode("utf-8", "ignore")

    width = _svg_length(attributes.get("width"))
    height = _svg_length(attributes.get("height"))
    if width and height:
        return StimulusDimensions(width=width, height=height)

    view_box = (attributes.get("viewbox") or "").replace(",", " ").split()
    if len(view_box) == 4:
        width = _svg_length(view_box[2])
        height = _svg_length(view_box[3])
        if width and height:
            return StimulusDimensions(width=width, height=height)
    return StimulusDimensions()


def _svg_length(value: Optional[str]) -> Optional[int]:
    """Only absolute pixel lengths are usable; ``%`` and ``em`` are not sizes."""

    if not value:
        return None
    match = _SVG_LENGTH_RE.match(value)
    if not match:
        return None
    return _positive(round(float(match.group(1))))


# --------------------------------------------------------------------------- #
# Video
# --------------------------------------------------------------------------- #


def _probe_video(path: Path) -> StimulusDimensions:
    probed = _probe_video_with_ffprobe(path)
    if probed.has_size:
        return probed
    return _probe_video_iso_bmff(path)


def _probe_video_with_ffprobe(path: Path) -> StimulusDimensions:
    executable = shutil.which("ffprobe")
    if not executable:
        return StimulusDimensions()

    command = [
        executable,
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries",
        "stream=width,height,r_frame_rate,avg_frame_rate,duration,side_data_list:"
        "stream_tags=rotate:format=duration",
        "-of", "json",
        str(path),
    ]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            timeout=_FFPROBE_TIMEOUT_SECONDS,
            check=False,
        )
        payload = json.loads(completed.stdout or b"{}")
    except Exception as exc:
        logger.info("ffprobe could not read %s: %s", path, exc)
        return StimulusDimensions()

    streams = payload.get("streams") or []
    if not streams:
        return StimulusDimensions()
    stream = streams[0]

    width = _positive(_as_int(stream.get("width")))
    height = _positive(_as_int(stream.get("height")))
    if width and height and _ffprobe_is_transposed(stream):
        width, height = height, width

    duration_s = _as_float(stream.get("duration"))
    if duration_s is None:
        duration_s = _as_float((payload.get("format") or {}).get("duration"))

    return StimulusDimensions(
        width=width,
        height=height,
        fps=_round_fps(
            _parse_frame_rate(stream.get("avg_frame_rate"))
            or _parse_frame_rate(stream.get("r_frame_rate"))
        ),
        duration_ms=_positive(round(duration_s * 1000)) if duration_s else None,
    )


def _ffprobe_is_transposed(stream: dict) -> bool:
    """A quarter-turn display rotation swaps the dimensions a player shows."""

    rotations = []
    tag = ((stream.get("tags") or {}).get("rotate"))
    if tag is not None:
        rotations.append(_as_float(tag))
    for side_data in stream.get("side_data_list") or []:
        if "rotation" in side_data:
            rotations.append(_as_float(side_data.get("rotation")))
    return any(
        rotation is not None and round(abs(rotation) / 90.0) % 2 == 1
        for rotation in rotations
    )


def _parse_frame_rate(value) -> Optional[float]:
    if not value:
        return None
    text = str(value).strip()
    if "/" in text:
        numerator, _, denominator = text.partition("/")
        num = _as_float(numerator)
        den = _as_float(denominator)
        if num is None or not den:
            return None
        return num / den
    return _as_float(text)


def _probe_video_iso_bmff(path: Path) -> StimulusDimensions:
    """Parse an MP4/MOV/M4V container for its visual track's presentation size."""

    try:
        with path.open("rb") as handle:
            handle.seek(0, 2)
            file_size = handle.tell()
            handle.seek(0)
            state = _IsoTrackState()
            _walk_iso_boxes(handle, 0, file_size, state, depth=0)
    except (OSError, struct.error) as exc:
        logger.info("Could not parse container dimensions for %s: %s", path, exc)
        return StimulusDimensions()

    return state.to_dimensions()


class _IsoTrackState:
    """The pieces of one visual track, gathered as the box walk finds them."""

    def __init__(self) -> None:
        self.movie_duration_ms: Optional[int] = None
        self.width: Optional[int] = None
        self.height: Optional[int] = None
        self.transposed = False
        self.is_video_track = False
        self.media_duration_s: Optional[float] = None
        self.sample_count: Optional[int] = None
        self._track_committed = False

        self._pending_width: Optional[int] = None
        self._pending_height: Optional[int] = None
        self._pending_transposed = False
        self._pending_is_video = False
        self._pending_media_duration_s: Optional[float] = None
        self._pending_sample_count: Optional[int] = None

    def start_track(self) -> None:
        self._pending_width = None
        self._pending_height = None
        self._pending_transposed = False
        self._pending_is_video = False
        self._pending_media_duration_s = None
        self._pending_sample_count = None

    def finish_track(self) -> None:
        """Keep the first video track; a file's audio tracks carry no size."""

        if self._track_committed or not self._pending_is_video:
            return
        if not (self._pending_width and self._pending_height):
            return
        self.width = self._pending_width
        self.height = self._pending_height
        self.transposed = self._pending_transposed
        self.media_duration_s = self._pending_media_duration_s
        self.sample_count = self._pending_sample_count
        self.is_video_track = True
        self._track_committed = True

    def to_dimensions(self) -> StimulusDimensions:
        width, height = self.width, self.height
        if width and height and self.transposed:
            width, height = height, width

        fps = None
        if self.sample_count and self.media_duration_s and self.media_duration_s > 0:
            fps = _round_fps(self.sample_count / self.media_duration_s)

        duration_ms = self.movie_duration_ms
        if duration_ms is None and self.media_duration_s:
            duration_ms = _positive(round(self.media_duration_s * 1000))

        return StimulusDimensions(
            width=_positive(width),
            height=_positive(height),
            fps=fps,
            duration_ms=duration_ms,
        )


def _walk_iso_boxes(
    handle: BinaryIO,
    start: int,
    end: int,
    state: _IsoTrackState,
    depth: int,
) -> None:
    if depth > _ISO_MAX_DEPTH:
        return

    offset = start
    while offset + 8 <= end:
        handle.seek(offset)
        header = handle.read(8)
        if len(header) < 8:
            return
        size = struct.unpack(">I", header[:4])[0]
        box_type = header[4:8]
        payload_start = offset + 8

        if size == 1:
            largesize = handle.read(8)
            if len(largesize) < 8:
                return
            size = struct.unpack(">Q", largesize)[0]
            payload_start = offset + 16
        elif size == 0:
            size = end - offset

        box_end = offset + size
        if size < 8 or box_end > end:
            return

        if box_type in _ISO_CONTAINER_BOXES:
            if box_type == b"trak":
                state.start_track()
            _walk_iso_boxes(handle, payload_start, box_end, state, depth + 1)
            if box_type == b"trak":
                state.finish_track()
        else:
            _read_iso_leaf(handle, box_type, payload_start, box_end, state)

        offset = box_end


def _read_iso_leaf(
    handle: BinaryIO,
    box_type: bytes,
    payload_start: int,
    box_end: int,
    state: _IsoTrackState,
) -> None:
    length = box_end - payload_start
    if length <= 0:
        return
    reader = {
        b"mvhd": _read_mvhd,
        b"tkhd": _read_tkhd,
        b"hdlr": _read_hdlr,
        b"mdhd": _read_mdhd,
        b"stts": _read_stts,
    }.get(box_type)
    if reader is None:
        return
    handle.seek(payload_start)
    reader(handle.read(min(length, 4096)), state)


def _read_mvhd(payload: bytes, state: _IsoTrackState) -> None:
    if len(payload) < 4:
        return
    version = payload[0]
    if version == 1:
        if len(payload) < 32:
            return
        timescale, duration = struct.unpack(">IQ", payload[20:32])
    else:
        if len(payload) < 20:
            return
        timescale, duration = struct.unpack(">II", payload[12:20])
    if timescale:
        state.movie_duration_ms = _positive(round(duration * 1000 / timescale))


def _read_tkhd(payload: bytes, state: _IsoTrackState) -> None:
    if len(payload) < 4:
        return
    version = payload[0]
    # Skip version/flags (4 bytes), times and IDs (20 or 32), then two 8-byte fields.
    matrix_start = 4 + (32 if version == 1 else 20) + 8 + 8
    size_start = matrix_start + 36
    if len(payload) < size_start + 8:
        return

    matrix = struct.unpack(">9i", payload[matrix_start:size_start])
    # A quarter turn zeroes the diagonal and fills the anti-diagonal.
    state._pending_transposed = (
        matrix[0] == 0 and matrix[4] == 0 and matrix[1] != 0 and matrix[3] != 0
    )

    width_fixed, height_fixed = struct.unpack(">II", payload[size_start:size_start + 8])
    state._pending_width = _positive(round(width_fixed / 65536))
    state._pending_height = _positive(round(height_fixed / 65536))


def _read_hdlr(payload: bytes, state: _IsoTrackState) -> None:
    # version/flags(4) + pre_defined(4), then the four-character handler type.
    if len(payload) >= 12 and payload[8:12] == b"vide":
        state._pending_is_video = True


def _read_mdhd(payload: bytes, state: _IsoTrackState) -> None:
    if len(payload) < 4:
        return
    version = payload[0]
    if version == 1:
        if len(payload) < 32:
            return
        timescale, duration = struct.unpack(">IQ", payload[20:32])
    else:
        if len(payload) < 20:
            return
        timescale, duration = struct.unpack(">II", payload[12:20])
    if timescale:
        state._pending_media_duration_s = duration / timescale


def _read_stts(payload: bytes, state: _IsoTrackState) -> None:
    if len(payload) < 8:
        return
    entry_count = struct.unpack(">I", payload[4:8])[0]
    available = (len(payload) - 8) // 8
    total = 0
    for index in range(min(entry_count, available)):
        start = 8 + index * 8
        total += struct.unpack(">I", payload[start:start + 4])[0]
    if total:
        state._pending_sample_count = total


# --------------------------------------------------------------------------- #
# Shared helpers
# --------------------------------------------------------------------------- #


def _positive(value: Optional[int]) -> Optional[int]:
    if value is None:
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _as_int(value) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _as_float(value) -> Optional[float]:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None  # reject NaN


def _round_fps(value: Optional[float]) -> Optional[int]:
    """``Scenaries.fps`` is an integer column, so a 29.97 stream stores as 30."""

    if value is None or value <= 0 or value > 1000:
        return None
    return _positive(round(value))


def probe_dimensions_for_kind(local_path: str, kind: str) -> Tuple[Optional[int], Optional[int]]:
    """Convenience for callers that only need the pixel size."""

    probed = probe_stimulus(local_path, kind)
    return probed.width, probed.height
