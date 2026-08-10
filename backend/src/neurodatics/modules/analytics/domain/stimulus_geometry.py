"""The one coordinate convention every spatial overlay renders against.

Fixations reach the analytics layer as ``x_norm``/``y_norm`` in ``[0, 1]`` with
the **origin at the top-left of the stimulus**: ``y_norm = 0`` is the top edge
and ``y_norm = 1`` is the bottom edge. That is what the eye tracker exports,
what the AOI shapes are drawn against (their percentages are measured from the
top-left corner too), and what the scanpath overlay already consumed.

The heatmap renderer used to flip Y on its way to pixels, so a fixation at
``y_norm = 0.2`` landed 20% from the top in scanpath and AOI overlays but 20%
from the *bottom* in the heatmap. Nothing downstream undid that flip, so the
three overlays disagreed on the same data. The flip is gone; this module is
where the convention is stated once so a future renderer does not reinvent it.

It also owns the output-size policy: a heatmap is rendered at the stimulus'
own intrinsic dimensions, so overlaying it needs no rescaling and no aspect
correction, with a ceiling so a huge stimulus cannot make the renderer
allocate an unbounded RGBA buffer.
"""

from __future__ import annotations

from typing import Optional, Tuple

# Fallback stimulus size for scenarios ingested before intrinsic dimensions
# were captured, and for stimuli whose dimensions could not be probed. It is
# the screen resolution the legacy pipeline assumed for every stimulus.
REFERENCE_SIZE: Tuple[int, int] = (1920, 1080)

# Ceilings for a rendered overlay. 8 MP of RGBA is ~32 MB while the renderer
# holds it, which is the most we are willing to spend on one request; the edge
# cap keeps a pathological panorama (e.g. 30000x800) from producing a strip no
# viewer can decode. Both preserve aspect ratio, so a clamped overlay still
# lines up with its stimulus.
MAX_OUTPUT_PIXELS: int = 8_000_000
MAX_OUTPUT_EDGE: int = 4096


def _positive_int(value) -> Optional[int]:
    """Return ``value`` as a positive int, or ``None`` if it is not usable."""

    if value is None or isinstance(value, bool):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def resolve_output_size(
    width: Optional[int],
    height: Optional[int],
    *,
    max_pixels: int = MAX_OUTPUT_PIXELS,
    max_edge: int = MAX_OUTPUT_EDGE,
) -> Tuple[int, int]:
    """Pick the pixel size an overlay for this stimulus should be rendered at.

    Returns the stimulus' own dimensions when they are known and within the
    ceilings, a proportionally shrunk version when they are not, and the
    reference size when the stimulus never reported any.
    """

    resolved_width = _positive_int(width)
    resolved_height = _positive_int(height)
    if resolved_width is None or resolved_height is None:
        resolved_width, resolved_height = REFERENCE_SIZE

    scale = 1.0
    if max_edge > 0:
        scale = min(scale, max_edge / max(resolved_width, resolved_height))
    if max_pixels > 0:
        pixels = resolved_width * resolved_height
        if pixels > max_pixels:
            scale = min(scale, (max_pixels / pixels) ** 0.5)

    if scale >= 1.0:
        return resolved_width, resolved_height

    return (
        max(1, int(resolved_width * scale)),
        max(1, int(resolved_height * scale)),
    )
