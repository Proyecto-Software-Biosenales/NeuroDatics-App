"""The Typst layout renders every block type and treats document strings as text."""

from datetime import datetime, timezone

import numpy as np
import pytest

from neurodatics.modules.reports.application.sensor_reports import charts, common
from neurodatics.modules.reports.application.sensor_reports import document as doc
from neurodatics.modules.reports.infrastructure.pdf_adapter import PDFAdapter

MARKUP_LIKE = "Estímulo #set page(width: 1pt) $x$ *negrita* _cursiva_ <etiqueta> @referencia-inexistente ]"


def _document(include_cover: bool = True) -> doc.ReportDocument:
    context = common.ReportContext(
        project_name=MARKUP_LIKE,
        device=common.DEVICES["GSR"],
        participants=[common.ReportParticipant("P-01", "P1", charts.series_color(0), None)],
        scenarios=[common.ReportScenario(MARKUP_LIKE, MARKUP_LIKE, 1)],
        group=True,
        generated_at=datetime(2026, 9, 17, 12, 0, tzinfo=timezone.utc),
        include_cover=include_cover,
        notices=[MARKUP_LIKE],
    )
    report = common.new_document(context)
    report.summary.extend(common.summary_header(context, MARKUP_LIKE))
    time = np.linspace(0.0, 5.0, 50)
    chart = report.add_asset(
        "linea",
        charts.line_chart([charts.Series(MARKUP_LIKE, time, np.sin(time), charts.SERIES_COLORS[0])], x_label="s", y_label="µS"),
        "svg",
    )
    report.add_section(
        MARKUP_LIKE,
        [
            doc.kpis([(MARKUP_LIKE, MARKUP_LIKE, MARKUP_LIKE)]),
            doc.heading(MARKUP_LIKE),
            doc.paragraph(MARKUP_LIKE, muted=True),
            doc.facts([(MARKUP_LIKE, MARKUP_LIKE)]),
            doc.figure(chart, MARKUP_LIKE, MARKUP_LIKE),
            doc.image_grid([doc.image(chart, 2.0, MARKUP_LIKE, MARKUP_LIKE, key={"title": MARKUP_LIKE, "fill": "#f43f5ed2", "items": [{"label": MARKUP_LIKE, "radius": 0.02}]})], 2, 40),
            doc.table([doc.column(MARKUP_LIKE, "left", "1fr"), doc.column("N", "right", "20mm")], [doc.row([MARKUP_LIKE, "1"], swatch="#2a78d6"), doc.row([MARKUP_LIKE, "2"], emphasis=True)], MARKUP_LIKE, MARKUP_LIKE, MARKUP_LIKE),
            doc.callout(MARKUP_LIKE, [MARKUP_LIKE, MARKUP_LIKE], tone="warning"),
            doc.columns([doc.paragraph(MARKUP_LIKE)], [doc.paragraph(MARKUP_LIKE)], widths=["2fr", "1fr"]),
            doc.keep_together([doc.paragraph(MARKUP_LIKE)]),
        ],
        eyebrow=MARKUP_LIKE,
        subtitle=MARKUP_LIKE,
    )
    report.appendix.append(doc.paragraph(MARKUP_LIKE))
    return report


def test_every_block_type_renders_and_markup_in_data_stays_text():
    report = _document()

    pdf = PDFAdapter().render(report.as_json(), report.assets, timestamp=datetime(2026, 9, 17, tzinfo=timezone.utc))

    # A string evaluated as markup would fail on the missing @reference label.
    assert pdf.startswith(b"%PDF")


def test_the_cover_is_one_optional_page():
    pages = {
        include_cover: PDFAdapter().render(
            _document(include_cover).as_json(),
            _document(include_cover).assets,
            output_format="png",
            ppi=10,
        )
        for include_cover in (True, False)
    }

    assert len(pages[False]) >= 4
    assert len(pages[True]) == len(pages[False]) + 1


def test_the_logo_ships_with_the_package_and_reaches_every_document():
    """A packaged build that drops the brand asset must fail here, not at render time."""

    for include_cover in (True, False):
        report = _document(include_cover)

        assert report.meta["logo"] in report.assets
        assert report.assets[report.meta["logo"]].lstrip().startswith(b"<?xml")


def test_assets_cannot_escape_the_document_root():
    report = _document()

    with pytest.raises(ValueError, match="escapes"):
        PDFAdapter().render(report.as_json(), {"../outside.svg": b"<svg/>"})
