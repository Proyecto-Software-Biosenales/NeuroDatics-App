"""Intrinsic stimulus dimensions have to be captured while the bytes are local.

Analytics renders every spatial overlay at the stimulus' own pixel size, and
extraction is the only moment the file is on disk. What matters here is that the
probe reports the size a *viewer* will show - so EXIF-rotated photos and
quarter-turn videos report their transposed dimensions - and that an unreadable
file degrades to "unknown" instead of failing the upload.
"""

import struct

import pytest

from neurodatics.modules.projects.application.services.stimulus_probe_service import (
    StimulusDimensions,
    probe_stimulus,
)

Image = pytest.importorskip("PIL.Image", reason="image probing needs Pillow")


def _write_image(path, width: int, height: int, fmt: str = "PNG", **save_kwargs) -> str:
    Image.new("RGB", (width, height), (128, 128, 128)).save(path, format=fmt, **save_kwargs)
    return str(path)


class TestImages:
    @pytest.mark.parametrize(
        "width,height",
        [(800, 800), (1920, 1080), (3440, 1440), (1080, 1920)],
    )
    def test_reports_the_pixel_dimensions(self, tmp_path, width, height):
        path = _write_image(tmp_path / "stimulus.png", width, height)

        probed = probe_stimulus(path, "scenario_image")

        assert (probed.width, probed.height) == (width, height)
        assert probed.has_size

    def test_a_quarter_turn_exif_orientation_reports_the_displayed_size(self, tmp_path):
        """A browser applies orientation on decode, so naturalWidth is swapped."""

        path = tmp_path / "rotated.jpg"
        image = Image.new("RGB", (1600, 1200), (128, 128, 128))
        exif = image.getexif()
        exif[0x0112] = 6  # rotate 90 CW on display
        image.save(path, format="JPEG", exif=exif)

        probed = probe_stimulus(str(path), "scenario_image")

        assert (probed.width, probed.height) == (1200, 1600)

    def test_an_upright_exif_orientation_is_left_alone(self, tmp_path):
        path = tmp_path / "upright.jpg"
        image = Image.new("RGB", (1600, 1200), (128, 128, 128))
        exif = image.getexif()
        exif[0x0112] = 1
        image.save(path, format="JPEG", exif=exif)

        probed = probe_stimulus(str(path), "scenario_image")

        assert (probed.width, probed.height) == (1600, 1200)

    def test_an_svg_reports_its_declared_size(self, tmp_path):
        path = tmp_path / "stimulus.svg"
        path.write_text(
            '<?xml version="1.0"?>\n'
            '<svg xmlns="http://www.w3.org/2000/svg" width="1280px" height="720px"></svg>',
            encoding="utf-8",
        )

        probed = probe_stimulus(str(path), "scenario_image")

        assert (probed.width, probed.height) == (1280, 720)

    def test_an_svg_sized_only_in_percent_falls_back_to_its_view_box(self, tmp_path):
        path = tmp_path / "responsive.svg"
        path.write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" '
            'viewBox="0 0 3440 1440"></svg>',
            encoding="utf-8",
        )

        probed = probe_stimulus(str(path), "scenario_image")

        assert (probed.width, probed.height) == (3440, 1440)

    def test_an_unreadable_file_reports_nothing_rather_than_raising(self, tmp_path):
        path = tmp_path / "broken.png"
        path.write_bytes(b"this is not an image")

        probed = probe_stimulus(str(path), "scenario_image")

        assert probed == StimulusDimensions()
        assert not probed.has_size

    def test_a_missing_file_reports_nothing(self, tmp_path):
        probed = probe_stimulus(str(tmp_path / "absent.png"), "scenario_image")

        assert not probed.has_size


# --------------------------------------------------------------------------- #
# Minimal ISO base media (MP4) fixtures - enough boxes for the parser to walk.
# --------------------------------------------------------------------------- #

_IDENTITY_MATRIX = (0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000)
_ROTATE_90_MATRIX = (0, 0x10000, 0, -0x10000, 0, 0, 0, 0, 0x40000000)


def _box(box_type: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload) + 8) + box_type + payload


def _mvhd(timescale: int, duration: int) -> bytes:
    return _box(
        b"mvhd",
        struct.pack(">I", 0) + struct.pack(">IIII", 0, 0, timescale, duration) + b"\x00" * 80,
    )


def _tkhd(width: int, height: int, matrix=_IDENTITY_MATRIX) -> bytes:
    payload = (
        struct.pack(">I", 0)
        + struct.pack(">IIIII", 0, 0, 1, 0, 0)
        + b"\x00" * 8
        + b"\x00" * 8
        + struct.pack(">9i", *matrix)
        + struct.pack(">II", width << 16, height << 16)
    )
    return _box(b"tkhd", payload)


def _hdlr(handler: bytes) -> bytes:
    return _box(b"hdlr", struct.pack(">I", 0) + b"\x00" * 4 + handler + b"\x00" * 12)


def _mdhd(timescale: int, duration: int) -> bytes:
    return _box(
        b"mdhd",
        struct.pack(">I", 0) + struct.pack(">IIII", 0, 0, timescale, duration) + b"\x00" * 4,
    )


def _stts(sample_count: int, sample_delta: int) -> bytes:
    return _box(
        b"stts",
        struct.pack(">I", 0) + struct.pack(">I", 1) + struct.pack(">II", sample_count, sample_delta),
    )


def _mp4_bytes(
    width: int,
    height: int,
    *,
    matrix=_IDENTITY_MATRIX,
    timescale: int = 600,
    frames: int = 150,
    fps: int = 25,
) -> bytes:
    duration = int(frames * timescale / fps)
    trak = _box(
        b"trak",
        _tkhd(width, height, matrix)
        + _box(
            b"mdia",
            _mdhd(timescale, duration)
            + _hdlr(b"vide")
            + _box(b"minf", _box(b"stbl", _stts(frames, int(timescale / fps)))),
        ),
    )
    audio_trak = _box(
        b"trak",
        _tkhd(0, 0) + _box(b"mdia", _mdhd(timescale, duration) + _hdlr(b"soun")),
    )
    return (
        _box(b"ftyp", b"isom" + b"\x00" * 4 + b"isom")
        + _box(b"moov", _mvhd(timescale, duration) + audio_trak + trak)
        + _box(b"mdat", b"\x00" * 16)
    )


class TestVideos:
    @pytest.fixture(autouse=True)
    def _without_ffprobe(self, monkeypatch):
        """Exercise the built-in container parser, not whatever is on this PATH."""

        monkeypatch.setattr(
            "neurodatics.modules.projects.application.services.stimulus_probe_service.shutil.which",
            lambda _name: None,
        )

    @pytest.mark.parametrize(
        "width,height",
        [(1920, 1080), (1080, 1080), (3440, 1440)],
    )
    def test_reports_the_visual_track_dimensions(self, tmp_path, width, height):
        path = tmp_path / "clip.mp4"
        path.write_bytes(_mp4_bytes(width, height))

        probed = probe_stimulus(str(path), "scenario_video")

        assert (probed.width, probed.height) == (width, height)

    def test_reports_frame_rate_and_duration(self, tmp_path):
        path = tmp_path / "clip.mp4"
        path.write_bytes(_mp4_bytes(1920, 1080, frames=150, fps=25))

        probed = probe_stimulus(str(path), "scenario_video")

        assert probed.fps == 25
        assert probed.duration_ms == pytest.approx(6000, abs=50)

    def test_a_quarter_turn_display_matrix_swaps_the_dimensions(self, tmp_path):
        path = tmp_path / "portrait.mp4"
        path.write_bytes(_mp4_bytes(1920, 1080, matrix=_ROTATE_90_MATRIX))

        probed = probe_stimulus(str(path), "scenario_video")

        assert (probed.width, probed.height) == (1080, 1920)

    def test_a_container_it_cannot_parse_reports_nothing(self, tmp_path):
        path = tmp_path / "clip.mkv"
        path.write_bytes(b"\x1a\x45\xdf\xa3" + b"\x00" * 512)

        probed = probe_stimulus(str(path), "scenario_video")

        assert not probed.has_size

    def test_a_truncated_container_does_not_raise(self, tmp_path):
        path = tmp_path / "truncated.mp4"
        path.write_bytes(_mp4_bytes(1920, 1080)[:40])

        probed = probe_stimulus(str(path), "scenario_video")

        assert not probed.has_size


def test_a_non_stimulus_kind_is_never_probed(tmp_path):
    path = _write_image(tmp_path / "not-a-stimulus.png", 640, 480)

    assert probe_stimulus(path, "raw_csv") == StimulusDimensions()
