from __future__ import annotations

import html
import os
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "manual" / "manual_usuario_neurodatics.md"
OUTPUT = ROOT / "output" / "pdf" / "manual_usuario_neurodatics.pdf"

FONT_DIR = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
pdfmetrics.registerFont(TTFont("UI-Regular", str(FONT_DIR / "segoeui.ttf")))
pdfmetrics.registerFont(TTFont("UI-Light", str(FONT_DIR / "segoeuisl.ttf")))
pdfmetrics.registerFont(TTFont("UI-Semibold", str(FONT_DIR / "segoeuib.ttf")))
pdfmetrics.registerFont(TTFont("UI-Bold", str(FONT_DIR / "segoeuib.ttf")))

PAGE_W, PAGE_H = A4
INK = colors.HexColor("#18221F")
MUTED = colors.HexColor("#69746F")
SOFT = colors.HexColor("#F6F8F7")
LINE = colors.HexColor("#DDE4E0")
GREEN = colors.HexColor("#2E796A")
ORANGE = colors.HexColor("#A87532")


def inline_markup(value: str) -> str:
    value = html.escape(value, quote=False)
    value = re.sub(r"`([^`]+)`", r'<font name="UI-Light" color="#40504A">\1</font>', value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", value)
    value = re.sub(r"\*([^*]+)\*", r"<i>\1</i>", value)
    return value


class ManualDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str, **kwargs):
        super().__init__(filename, **kwargs)
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="normal",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates([PageTemplate(id="manual", frames=frame, onPage=draw_page)])


def draw_page(canvas, doc):
    canvas.saveState()
    if doc.page == 1:
        canvas.setFillColor(colors.white)
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.65)
        canvas.line(20 * mm, PAGE_H - 22 * mm, PAGE_W - 20 * mm, PAGE_H - 22 * mm)
        canvas.setFillColor(GREEN)
        canvas.rect(20 * mm, PAGE_H - 25 * mm, 10 * mm, 1.8 * mm, fill=1, stroke=0)
        canvas.setStrokeColor(LINE)
        canvas.line(20 * mm, 22 * mm, PAGE_W - 20 * mm, 22 * mm)
    else:
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(doc.leftMargin, PAGE_H - 17 * mm, PAGE_W - doc.rightMargin, PAGE_H - 17 * mm)
        canvas.setFont("UI-Light", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(doc.leftMargin, PAGE_H - 12.5 * mm, "NEURODATICS  /  MANUAL DE USUARIO")
        canvas.drawRightString(PAGE_W - doc.rightMargin, 11 * mm, f"{doc.page - 1:02d}")
        canvas.setStrokeColor(LINE)
        canvas.line(doc.leftMargin, 15 * mm, PAGE_W - doc.rightMargin, 15 * mm)
    canvas.restoreState()


def styles():
    base = getSampleStyleSheet()
    return {
        "cover_kicker": ParagraphStyle("cover_kicker", parent=base["Normal"], fontName="UI-Semibold", fontSize=8, leading=11, textColor=GREEN, tracking=1.6, spaceAfter=12),
        "cover_title": ParagraphStyle("cover_title", parent=base["Title"], fontName="UI-Semibold", fontSize=28, leading=33, textColor=INK, spaceAfter=11),
        "cover_subtitle": ParagraphStyle("cover_subtitle", parent=base["Normal"], fontName="UI-Regular", fontSize=11, leading=17, textColor=MUTED, spaceAfter=20),
        "cover_meta": ParagraphStyle("cover_meta", parent=base["Normal"], fontName="UI-Regular", fontSize=8.2, leading=12, textColor=INK),
        "h1": ParagraphStyle("h1", parent=base["Heading1"], fontName="UI-Semibold", fontSize=17.5, leading=22, textColor=INK, spaceBefore=15, spaceAfter=7, keepWithNext=True),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="UI-Semibold", fontSize=11.7, leading=16, textColor=INK, spaceBefore=10, spaceAfter=4, keepWithNext=True),
        "body": ParagraphStyle("body", parent=base["BodyText"], fontName="UI-Regular", fontSize=9, leading=14.2, textColor=INK, spaceAfter=5),
        "small": ParagraphStyle("small", parent=base["BodyText"], fontName="UI-Regular", fontSize=7.2, leading=10.5, textColor=MUTED),
        "caption": ParagraphStyle("caption", parent=base["BodyText"], fontName="UI-Light", fontSize=7.2, leading=10, textColor=MUTED, alignment=TA_CENTER, spaceBefore=3, spaceAfter=8),
        "quote": ParagraphStyle("quote", parent=base["BodyText"], fontName="UI-Regular", fontSize=8.7, leading=13.2, textColor=INK, leftIndent=12, rightIndent=8, spaceBefore=5, spaceAfter=8),
        "toc_title": ParagraphStyle("toc_title", parent=base["Heading1"], fontName="UI-Semibold", fontSize=17, leading=22, textColor=INK, spaceAfter=10),
        "toc": ParagraphStyle("toc", parent=base["BodyText"], fontName="UI-Regular", fontSize=8.8, leading=15, textColor=INK),
        "table": ParagraphStyle("table", parent=base["BodyText"], fontName="UI-Regular", fontSize=6.8, leading=9.2, textColor=INK),
        "table_head": ParagraphStyle("table_head", parent=base["BodyText"], fontName="UI-Semibold", fontSize=6.9, leading=9.3, textColor=colors.white),
        "list": ParagraphStyle("list", parent=base["BodyText"], fontName="UI-Regular", fontSize=8.9, leading=13.5, textColor=INK, spaceAfter=2),
    }


def table_flow(rows: list[list[str]], st) -> Table:
    formatted = []
    for r, row in enumerate(rows):
        style = st["table_head"] if r == 0 else st["table"]
        formatted.append([Paragraph(inline_markup(cell.strip()), style) for cell in row])
    widths = [1.0 / len(rows[0])] * len(rows[0])
    if len(rows[0]) == 2:
        widths = [0.28, 0.72]
    elif len(rows[0]) == 3:
        widths = [0.22, 0.32, 0.46]
    elif len(rows[0]) == 4:
        widths = [0.20, 0.22, 0.33, 0.25]
    elif len(rows[0]) == 5:
        widths = [0.19, 0.18, 0.23, 0.22, 0.18]
    table = Table(formatted, colWidths=[(PAGE_W - 40 * mm) * x for x in widths], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SOFT]),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def parse_markdown(text: str, st):
    lines = text.splitlines()
    flow = []
    i = 0
    first_h1 = True
    skip_preamble = False
    toc_entries = [
        "01  Qué hace NeuroDatics",
        "02  Ediciones disponibles",
        "03  Roles y permisos reales",
        "04  Módulos de la plataforma",
        "05  Primer acceso",
        "06  Crear un proyecto con carpeta",
        "07  Estados del proyecto y de la ingesta",
        "08  Revisar un proyecto",
        "09  Analizar en Dashboard",
        "10  Pre-experimento y cuestionarios",
        "11  Conectar Google Drive en servidor",
        "12  Generar reportes",
        "13  Problemas frecuentes",
        "14  Antes de analizar o exportar",
        "15  Glosario breve",
        "16  Soporte",
        "Anexo A  Puesta en marcha para administración técnica",
    ]
    while i < len(lines):
        raw = lines[i].rstrip()
        if not raw:
            i += 1
            continue
        if skip_preamble:
            if raw.startswith("## 1. "):
                skip_preamble = False
            else:
                i += 1
                continue
        if raw.startswith("!["):
            match = re.match(r"!\[([^]]*)\]\(([^)]+)\)", raw)
            if match:
                alt, rel = match.groups()
                image_path = (SOURCE.parent / rel).resolve()
                if image_path.exists():
                    img = Image(str(image_path))
                    max_w, max_h = PAGE_W - 40 * mm, 105 * mm
                    scale = min(max_w / img.imageWidth, max_h / img.imageHeight)
                    img.drawWidth = img.imageWidth * scale
                    img.drawHeight = img.imageHeight * scale
                    flow.append(Spacer(1, 5))
                    flow.append(img)
                    flow.append(Paragraph(inline_markup(alt), st["caption"]))
                i += 1
                continue
        if raw.startswith("# "):
            title = raw[2:].strip()
            if first_h1:
                flow.extend([
                    Spacer(1, 48 * mm),
                    Paragraph("NEURODATICS  /  DOCUMENTACIÓN", st["cover_kicker"]),
                    Paragraph("Manual de usuario", st["cover_title"]),
                    Paragraph("Guía práctica para organizar, analizar y exportar experimentos de bioseñales.", st["cover_subtitle"]),
                    Spacer(1, 18 * mm),
                    Table([
                        [Paragraph("EDICIÓN", st["small"]), Paragraph("Servidor y local / estudiantes", st["cover_meta"]), Paragraph("VERSIÓN", st["small"]), Paragraph("2.1", st["cover_meta"])],
                        [Paragraph("AUDIENCIA", st["small"]), Paragraph("Investigadores, docentes y estudiantes", st["cover_meta"]), Paragraph("FECHA", st["small"]), Paragraph("14 OCT 2026", st["cover_meta"])],
                    ], colWidths=[22 * mm, 52 * mm, 22 * mm, 46 * mm], style=TableStyle([
                        ("LINEABOVE", (0, 0), (-1, 0), 0.55, LINE),
                        ("LINEBELOW", (0, -1), (-1, -1), 0.55, LINE),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("TOPPADDING", (0, 0), (-1, -1), 7),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ])),
                    Spacer(1, 72 * mm),
                    Paragraph("Revisión editorial basada en la implementación vigente.", st["small"]),
                    Paragraph("Capturas Playwright  /  datos sintéticos", st["small"]),
                    PageBreak(),
                    Paragraph("Contenido", st["toc_title"]),
                ])
                for entry in toc_entries:
                    flow.append(Paragraph(inline_markup(entry), st["toc"]))
                flow.append(Spacer(1, 14))
                flow.append(PageBreak())
                first_h1 = False
                skip_preamble = True
            i += 1
            continue
        if raw.startswith("## "):
            title = raw[3:].strip()
            flow.append(Paragraph(inline_markup(title), st["h1"]))
            if title != "Contenido":
                # Accent rule under each primary heading.
                flow.append(Table([[""]], colWidths=[12 * mm], rowHeights=[1.0], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), GREEN), ("LINEBELOW", (0, 0), (-1, -1), 0, GREEN)])))
            i += 1
            continue
        if raw.startswith("### "):
            flow.append(Paragraph(inline_markup(raw[4:].strip()), st["h2"]))
            i += 1
            continue
        if raw.startswith("> "):
            quote_lines = [raw[2:].strip()]
            i += 1
            while i < len(lines) and lines[i].startswith("> "):
                quote_lines.append(lines[i][2:].strip())
                i += 1
            quote_text = " ".join(quote_lines)
            box = Table([[Paragraph(inline_markup(quote_text), st["quote"])]], colWidths=[PAGE_W - 40 * mm], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#E8F6F1")), ("LINEBEFORE", (0, 0), (0, -1), 3, GREEN), ("BOX", (0, 0), (-1, -1), 0.35, colors.HexColor("#C6E8DD")), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
            flow.append(box)
            continue
        if raw.startswith("|"):
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                line = lines[i].strip()
                if not re.match(r"^\|?\s*:?-{3,}", line):
                    cells = [c.strip() for c in line.strip("|").split("|")]
                    table_lines.append(cells)
                i += 1
            if table_lines:
                flow.append(Spacer(1, 4))
                flow.append(table_flow(table_lines, st))
                flow.append(Spacer(1, 8))
            continue
        if re.match(r"^[-*] ", raw) or re.match(r"^\d+\. ", raw):
            ordered = bool(re.match(r"^\d+\. ", raw))
            items = []
            while i < len(lines):
                candidate = lines[i].strip()
                if ordered and not re.match(r"^\d+\. ", candidate):
                    break
                if not ordered and not re.match(r"^[-*] ", candidate):
                    break
                item = re.sub(r"^(?:[-*]|\d+\.)\s+", "", candidate)
                items.append(ListItem(Paragraph(inline_markup(item), st["list"]), leftIndent=4))
                i += 1
            flow.append(ListFlowable(items, bulletType="1" if ordered else "bullet", start="1" if ordered else None, leftIndent=14, bulletFontName="UI-Regular", bulletFontSize=8, bulletColor=GREEN, bulletOffsetY=1))
            flow.append(Spacer(1, 4))
            continue
        # Treat bold-only lines and regular paragraphs alike.
        para_lines = [raw]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#|>|\||[-*] |\d+\. |!)", lines[i].strip()):
            para_lines.append(lines[i].strip())
            i += 1
        flow.append(Paragraph(inline_markup(" ".join(para_lines)), st["body"]))
    return flow


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document = ManualDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=24 * mm,
        bottomMargin=23 * mm,
        title="NeuroDatics - Manual de usuario",
        author="Equipo de desarrollo de NeuroDatics",
        subject="Manual de usuario revisado contra la implementación vigente",
    )
    story = parse_markdown(SOURCE.read_text(encoding="utf-8"), styles())
    document.build(story)
    print(OUTPUT)


if __name__ == "__main__":
    build()
