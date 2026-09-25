"""Value formatting shared by every device report.

Reports are read outside the app, so every value carries its unit and keeps the
dashboard's decimal point. Poppins has no narrow no-break space, so thousands
are grouped with a regular no-break space, and only from five digits on.
"""

from __future__ import annotations

import math
from typing import Any, Optional

MISSING = "—"
NBSP = " "
MINUS = "−"


def finite(value: Any) -> Optional[float]:
    """Return ``value`` as a finite float, or ``None`` when it is not one."""

    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def with_unit(text: str, unit: str = "") -> str:
    return f"{text}{NBSP}{unit}" if unit and text != MISSING else text


def number(value: Any, decimals: int = 2, unit: str = "", signed: bool = False) -> str:
    numeric = finite(value)
    if numeric is None:
        return MISSING
    decimals = max(0, int(decimals))
    if abs(numeric) < 0.5 * 10 ** -decimals:
        numeric = 0.0
    magnitude = f"{abs(numeric):.{decimals}f}"
    if abs(numeric) >= 10_000:
        magnitude = f"{abs(numeric):,.{decimals}f}".replace(",", NBSP)
    sign = MINUS if numeric < 0 else ("+" if signed and numeric > 0 else "")
    return with_unit(f"{sign}{magnitude}", unit)


def significant(value: Any, digits: int = 3, unit: str = "") -> str:
    """Format quantities that span orders of magnitude, such as band power."""

    numeric = finite(value)
    if numeric is None:
        return MISSING
    if numeric == 0:
        return with_unit("0", unit)
    exponent = math.floor(math.log10(abs(numeric)))
    return number(numeric, max(0, digits - 1 - exponent), unit)


def integer(value: Any, unit: str = "") -> str:
    return number(value, 0, unit)


def percent(value: Any, decimals: int = 1, signed: bool = False) -> str:
    return number(value, decimals, "%", signed)


def mean_sd(mean: Any, sd: Any, decimals: int = 2, unit: str = "") -> str:
    """``mean ± sd unit``; the deviation is omitted when it is unavailable."""

    if finite(mean) is None:
        return MISSING
    if finite(sd) is None:
        return number(mean, decimals, unit)
    return with_unit(f"{number(mean, decimals)} ± {number(sd, decimals)}", unit)


def count_of(part: int, total: int) -> str:
    return f"{int(part)}/{int(total)}"
