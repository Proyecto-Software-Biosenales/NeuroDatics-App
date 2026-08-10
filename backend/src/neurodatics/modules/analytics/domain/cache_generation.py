"""One counter that tells a cached analytics answer which ingestion it came from.

Re-ingesting a project used to leave every cache entry keyed exactly as before,
so a Parquet on disk and a JSON response in Redis kept answering with the
previous upload's numbers until their TTL ran out. Deleting those entries on
every upload is the wrong cure: the delete races with in-flight requests and,
if it ever resolves the wrong directory, takes another project's cache with it.

Instead the project carries an ``ingestion_generation`` that the swap bumps, and
every cache key embeds it. A stale entry is then unreachable rather than wrong,
and the old generations are swept later, bounded and off the request path.

The token is a short ``g<n>`` because it has to be legal both as a path segment
and inside a colon-separated Redis key.
"""

from __future__ import annotations

import re

CACHE_GENERATION_PREFIX = "g"

# ASCII-only: a directory named with non-ASCII digits would otherwise read as a
# generation token, and the bounded sweep would take it for one of ours.
_GENERATION_TOKEN_RE = re.compile(rf"{CACHE_GENERATION_PREFIX}\d+", re.ASCII)


def normalize_generation(value: object) -> int:
    """Coerce anything into a usable, non-negative generation number.

    Generations come from a database column, a query string and a directory
    name, so ``None``, an empty string and a value whose ``int()`` raises all
    have to end up somewhere rather than propagate. They end up at 0, the
    generation a project that never re-ingested already uses, which at worst
    costs a cache miss. A negative is treated the same way: it can only be
    corrupt, and it must never produce a token that sorts below the real ones.
    """

    if value is None:
        return 0
    try:
        generation = int(value)
    except Exception:
        # Deliberately broad: a cache key is built on every request and cannot
        # be allowed to raise because of one odd value.
        return 0
    return generation if generation > 0 else 0


def generation_token(value: object) -> str:
    """Render a generation as the token used in paths and cache keys."""

    return f"{CACHE_GENERATION_PREFIX}{normalize_generation(value)}"


def project_cache_generation(project: object) -> int:
    """Read a project's current generation, tolerating a row that predates it."""

    return normalize_generation(getattr(project, "ingestion_generation", 0))


def is_generation_token(value: str) -> bool:
    """True only for a token this module produced.

    The bounded sweeps use this to decide what belongs to them, so anything
    else - a participant file, a key written before generation scoping - has to
    fail the check rather than be guessed at.
    """

    if not isinstance(value, str):
        return False
    return _GENERATION_TOKEN_RE.fullmatch(value) is not None
