"""One canonical identity for a scenario name.

The same stimulus is spelled three different ways in this system: the media file
that was uploaded (``Crem helado.jpeg``), the ``scenario`` column the CSV
importer wrote into the Parquet (``Crem Helado``), and the ``scenaries`` row the
UI lists. Every consumer used to re-derive its own comparison key with an inline
``Path(...).stem.lower().replace(" ", "")``, so the three spellings drifted apart
and a chart could come back empty for a scenario that plainly exists.

Everything that has to answer "do these two strings name the same scenario?"
goes through :func:`scenario_key`, and everything that has to turn a requested
name into the spelling a data source actually stores goes through
:func:`resolve_scenario`.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional

# The sentinel the API accepts for "do not scope to a scenario".
ALL_SCENARIOS = "all"

# Only extensions this product actually ingests are dropped. Cutting whatever
# follows the last dot - what ``Path(...).stem`` does - would fold "Spot v1.2"
# and "Spot v1.5" onto a single key and make them ambiguous with each other.
MEDIA_EXTENSIONS = frozenset(
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".bmp",
        ".webp",
        ".tif",
        ".tiff",
        ".svg",
        ".mp4",
        ".avi",
        ".mov",
        ".mkv",
        ".webm",
        ".m4v",
    }
)

_WHITESPACE_RE = re.compile(r"\s+")

# Values pandas stringifies for a missing cell. A Parquet whose scenario column
# has holes must not contribute a "nan" scenario to the candidate set.
_NULL_TEXTS = frozenset({"", "nan", "none", "null", "<na>", "nat"})


class ScenarioAmbiguityError(ValueError):
    """Two different stored scenario names share one normalized key.

    Raised instead of silently taking the first match: picking one would show
    the caller another scenario's data under the name they asked for.
    """


def _strip_media_extension(text: str) -> str:
    lowered = text.casefold()
    for extension in MEDIA_EXTENSIONS:
        # ``len(text) > len(extension)`` keeps a scenario literally named
        # ".png" from normalizing to the empty key.
        if lowered.endswith(extension) and len(text) > len(extension):
            return text[: -len(extension)]
    return text


def scenario_key(value: object) -> str:
    """Fold one spelling of a scenario name onto its comparison key.

    Unicode-equivalent spellings (a precomposed ``e`` with acute and an ``e``
    followed by a combining acute), surrounding quotes and whitespace, a
    trailing media extension and letter case are all differences this ignores.
    Accents themselves are kept: "Bebe" and "Bebe" with an acute stay distinct
    scenarios.
    """

    if value is None:
        return ""
    # NFKC folds the compatibility spellings together: a combining accent onto
    # its precomposed form, a non-breaking space onto a plain one.
    text = unicodedata.normalize("NFKC", str(value))
    text = text.strip().strip('"').strip("'").strip()
    text = _strip_media_extension(text)
    # Spaces are removed rather than collapsed: the acquisition folders and the
    # CSV headers spell the same stimulus "Scenario 1" and "Scenario1"
    # interchangeably, and the per-call helpers this replaces already folded
    # them.
    text = _WHITESPACE_RE.sub("", text)
    # ``casefold`` can decompose what NFKC composed (U+1E9E -> "ss"), so the
    # result is re-normalized to keep the key stable.
    return unicodedata.normalize("NFKC", text.casefold())


def is_all_scenarios(value: object) -> bool:
    """True when the caller asked for every scenario rather than one of them."""

    if value is None:
        return True
    return scenario_key(value) in {"", ALL_SCENARIOS}


def _display(value: object) -> str:
    return str(value) if value is not None else ""


def _is_null_text(text: str) -> bool:
    return text.strip().casefold() in _NULL_TEXTS


@dataclass(frozen=True)
class ScenarioResolution:
    """Which stored spelling a requested scenario name refers to."""

    # The spelling the source being filtered actually holds. Filters compare
    # against this; the caller keeps its own string for display.
    value: str
    key: str
    # True when the request already matched the stored spelling character for
    # character, so no normalization was needed.
    exact: bool


def resolve_scenario(
    requested: object,
    available: Iterable[object],
) -> Optional[ScenarioResolution]:
    """Map a requested scenario name onto the spelling a source stores.

    ``available`` is every spelling the source being filtered holds: the
    distinct values of a Parquet's ``scenario`` column, or a project's
    ``scenaries`` rows. An exact match always wins, so projects whose scenarios
    differ only by case or extension keep resolving the way they always did.
    Otherwise the normalized key decides.

    Returns ``None`` when nothing matches. Raises :class:`ScenarioAmbiguityError`
    when the key matches two different stored spellings.
    """

    requested_key = scenario_key(requested)
    if not requested_key:
        return None

    stored: List[str] = []
    for item in available:
        text = _display(item)
        if _is_null_text(text):
            continue
        stored.append(text)

    exact_target = _display(requested).strip()
    for text in stored:
        if text.strip() == exact_target:
            return ScenarioResolution(value=text, key=requested_key, exact=True)

    by_key: Dict[str, List[str]] = {}
    for text in stored:
        key = scenario_key(text)
        if not key:
            continue
        bucket = by_key.setdefault(key, [])
        # Spellings differing only in surrounding whitespace are one scenario:
        # the filters strip before comparing.
        if all(text.strip() != seen.strip() for seen in bucket):
            bucket.append(text)

    matches = by_key.get(requested_key, [])
    if not matches:
        return None
    if len(matches) > 1:
        collisions = ", ".join(repr(text) for text in sorted(matches))
        raise ScenarioAmbiguityError(
            f"Scenario '{_display(requested)}' matches {len(matches)} different "
            f"stored scenarios ({collisions}) once names are normalized, so the "
            "one meant here cannot be identified. Rename them so they differ by "
            "more than case, spacing or file extension."
        )
    return ScenarioResolution(value=matches[0], key=requested_key, exact=False)
