"""Report document model: layout-neutral blocks plus the files they reference.

Builders decide *what* a report says and hand the template display-ready
strings; the Typst template decides how it looks. Every value in the document
is plain data, never markup, so names typed by users cannot inject layout.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

Block = Dict[str, Any]


def _slug(value: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text).strip("-").lower()
    return slug[:40] or "item"


@dataclass
class ReportDocument:
    meta: Dict[str, Any]
    summary: List[Block] = field(default_factory=list)
    sections: List[Dict[str, Any]] = field(default_factory=list)
    appendix: List[Block] = field(default_factory=list)
    assets: Dict[str, bytes] = field(default_factory=dict)

    def add_asset(self, name: str, content: bytes, extension: str) -> str:
        path = f"assets/{len(self.assets) + 1:03d}-{_slug(name)}.{extension}"
        self.assets[path] = content
        return path

    def add_section(
        self,
        title: str,
        blocks: Sequence[Block],
        eyebrow: str = "",
        subtitle: str = "",
    ) -> None:
        self.sections.append(
            {"title": title, "eyebrow": eyebrow, "subtitle": subtitle, "blocks": list(blocks)}
        )

    def as_json(self) -> Dict[str, Any]:
        return {
            "meta": self.meta,
            "summary": self.summary,
            "sections": self.sections,
            "appendix": self.appendix,
        }


def heading(text: str) -> Block:
    """A subsection title; it appears in the table of contents."""

    return {"type": "heading", "text": text}


def paragraph(text: str, muted: bool = False) -> Block:
    return {"type": "paragraph", "text": text, "muted": muted}


def kpis(items: Sequence[Tuple[str, str, str]]) -> Block:
    """Stat tiles as ``(label, value, hint)``."""

    return {
        "type": "kpis",
        "items": [{"label": label, "value": value, "hint": hint} for label, value, hint in items],
    }


def facts(items: Sequence[Tuple[str, str]], columns: int = 2) -> Block:
    return {
        "type": "facts",
        "columns": columns,
        "items": [{"label": label, "value": value} for label, value in items],
    }


def figure(src: str, title: str = "", description: str = "") -> Block:
    return {"type": "figure", "src": src, "title": title, "description": description}


def image(
    src: str,
    aspect: float,
    title: str = "",
    caption: str = "",
    key: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """An image cell; ``aspect`` (width / height) lets the layout size it before loading.

    ``key`` draws reference circles whose radii are fractions of the printed image height.
    """

    return {
        "src": src,
        "aspect": float(aspect) if aspect and aspect > 0 else 1.0,
        "title": title,
        "caption": caption,
        "key": key,
    }


def image_grid(
    items: Sequence[Dict[str, Any]],
    columns: int,
    max_height_mm: float,
    title: str = "",
    description: str = "",
) -> Block:
    return {
        "type": "images",
        "items": list(items),
        "columns": max(1, int(columns)),
        "max_height_mm": float(max_height_mm),
        "title": title,
        "description": description,
    }


def column(label: str, align: str = "right", width: str = "auto") -> Dict[str, str]:
    return {"label": label, "align": align, "width": width}


def row(cells: Sequence[str], swatch: Optional[str] = None, emphasis: bool = False) -> Dict[str, Any]:
    return {"cells": [str(cell) for cell in cells], "swatch": swatch, "emphasis": emphasis}


def table(
    columns: Sequence[Dict[str, str]],
    rows: Sequence[Dict[str, Any]],
    title: str = "",
    description: str = "",
    note: str = "",
) -> Block:
    return {
        "type": "table",
        "columns": list(columns),
        "rows": list(rows),
        "title": title,
        "description": description,
        "note": note,
    }


def callout(title: str, items: Sequence[str], tone: str = "info") -> Block:
    return {"type": "callout", "title": title, "items": list(items), "tone": tone}


def columns(*blocks: Sequence[Block], widths: Sequence[str] = ()) -> Block:
    """Side-by-side block stacks; ``widths`` are Typst fractions such as ``"3fr"``."""

    return {
        "type": "columns",
        "widths": list(widths) or ["1fr"] * len(blocks),
        "columns": [list(stack) for stack in blocks],
    }


def keep_together(blocks: Sequence[Block]) -> Block:
    return {"type": "group", "blocks": list(blocks)}
