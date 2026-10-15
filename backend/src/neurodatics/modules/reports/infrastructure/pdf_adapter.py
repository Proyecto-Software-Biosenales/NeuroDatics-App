"""Typst rendering for report documents.

Compilation is sandboxed to a temporary project directory that holds only the
template, the document JSON and its assets. System fonts are ignored so a report
lays out identically on a developer machine and in the container, and the
template never fetches packages.
"""

from __future__ import annotations

import json
import logging
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, List, Mapping, Optional, Union

import typst

logger = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"
FONT_DIR = Path(__file__).resolve().parents[1] / "application" / "assets" / "fonts"


class PDFAdapter:
    def __init__(self, template: str = "sensor_report.typ") -> None:
        self._template = TEMPLATE_DIR / template

    def render(
        self,
        document: Mapping[str, Any],
        assets: Mapping[str, bytes],
        timestamp: Optional[datetime] = None,
        output_format: str = "pdf",
        ppi: Optional[float] = None,
    ) -> Union[bytes, List[bytes]]:
        payload = json.dumps(document, ensure_ascii=False, allow_nan=False)
        with tempfile.TemporaryDirectory(prefix="neurodatics-report-") as directory:
            root = Path(directory).resolve()
            entry = root / "report.typ"
            entry.write_bytes(self._template.read_bytes())
            (root / "report.json").write_text(payload, encoding="utf-8")
            for relative_path, content in assets.items():
                target = (root / relative_path).resolve()
                if root not in target.parents:
                    raise ValueError(f"Report asset escapes the document root: {relative_path}")
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
            result, warnings = typst.compile_with_warnings(
                str(entry),
                root=str(root),
                font_paths=[str(FONT_DIR)],
                ignore_system_fonts=True,
                format=output_format,
                ppi=ppi,
                # Typst accepts whole seconds only.
                timestamp=timestamp.replace(microsecond=0) if timestamp is not None else None,
            )
        for warning in warnings:
            logger.info("Report layout warning: %s", warning.message)
        return result
