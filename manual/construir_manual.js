// Construye el manual de uso en Word a partir de manual/fuentes/*.md.
// Uso (desde la raíz del repositorio):
//   node manual/construir_manual.js            -> output/manual/build/NeuroDatics-Manual-de-uso.docx
//   node manual/construir_manual.js --solo 03  -> solo las fuentes cuyo nombre empieza por 03 (prueba)
// Después: output/manual/toolchain/render.ps1 -Docx <docx> (Word actualiza índice y números de página).
//
// Markdown restringido (ver manual/README.md):
//   # Capítulo {#id}            Título 1 numerado; {#id .sin-numero} para no numerar
//   ## Sección {#id}            Título 2 numerado (3.1); ### Subsección: Título 3 sin número
//   1. paso / - viñeta          listas; una línea sangrada 3 espacios bajo un paso continúa ese paso
//   ::: nota|consejo|importante  ... :::   avisos
//   ![[fig:id|Pie de figura|w=6]]          figura (manual/figuras/<id>.png), ancho en pulgadas
//   [[ref:id]]  [[pag:id]]  [[fig:id]]      referencia a sección, número de página, «figura 3.2»
//   {servidor} {estudiantes}               etiqueta de edición
//   **negrita** *cursiva* `literal`        en línea
//   <!-- anchos: 30 70 -->                 anchos relativos de la tabla que sigue
//   \saltodepagina
"use strict"

const fs = require("node:fs")
const path = require("node:path")

const ROOT = path.resolve(__dirname, "..")
const docx = require(path.join(ROOT, "output", "manual", "toolchain", "node_modules", "docx"))
const {
  AlignmentType, BorderStyle, Bookmark, Document, Footer, Header, HeightRule, ImageRun, InternalHyperlink,
  LevelFormat, Packer, PageBreak, PageNumber, PageReference, Paragraph, ShadingType, Table, TableCell,
  TableLayoutType, TableOfContents, TableRow, TextRun, VerticalAlign, WidthType,
} = docx

const FUENTES = path.join(__dirname, "fuentes")
const FIGURAS = path.join(__dirname, "figuras")
const FONTS = path.join(__dirname, "estilo", "fuentes")
const OUT_DIR = path.join(ROOT, "output", "manual", "build")
const OUT = path.join(OUT_DIR, "NeuroDatics-Manual-de-uso.docx")

// --- Guía de estilo (mydocs-priv/manual/guia-de-estilo.md) ---------------------------------------
const C = {
  fondo: "FFF9ED", acento: "00A797", acentoTexto: "01857B", texto: "000000", gris: "5A5246",
  borde: "D9D2C3", avisoFondo: "E3F3F0", notaFondo: "F4EEE1", notaBorde: "B8AE9C",
  consejoFondo: "FBF0D6", consejoBorde: "D99A1E", consejoTexto: "8A5A00",
}
const SERIF = "PT Serif"
const DISPLAY = "Old Standard TT"
const PAGE = { w: 12240, h: 15840, top: 1152, bottom: 1152, left: 1440, right: 1440 }
const TEXT_W = PAGE.w - PAGE.left - PAGE.right // 9360 twips = 6,5 in
const FIG_W_DEFAULT = 5.3
const FIG_W_MAX = 6.5
const FIG_H_MAX = 5.0

const AVISOS = {
  nota: { etiqueta: "Nota", borde: C.notaBorde, fondo: C.notaFondo, color: C.gris },
  consejo: { etiqueta: "Consejo", borde: C.consejoBorde, fondo: C.consejoFondo, color: C.consejoTexto },
  importante: { etiqueta: "Importante", borde: C.acento, fondo: C.avisoFondo, color: C.acentoTexto },
}
const EDICIONES = { servidor: "SOLO EN SERVIDOR", estudiantes: "SOLO EN ESTUDIANTES" }

const warnings = []
const warn = (msg) => warnings.push(msg)

// --- Lectura de fuentes --------------------------------------------------------------------------
function listSources(filter) {
  return fs.readdirSync(FUENTES)
    .filter((name) => name.endsWith(".md") && (!filter || name.startsWith(filter)))
    .sort()
    .map((name) => ({ name, text: fs.readFileSync(path.join(FUENTES, name), "utf8").replace(/\r\n/g, "\n") }))
}

// Bloques: heading, para, list, callout, figure, table, pagebreak
function parseBlocks(text, file) {
  const lines = text.split("\n")
  const blocks = []
  let para = []
  let pendingWidths = null
  const flush = () => {
    if (para.length) blocks.push({ type: "para", text: para.join(" ").trim() })
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) { flush(); continue }
    const widths = trimmed.match(/^<!--\s*anchos:\s*([\d\s]+)-->$/)
    if (widths) { flush(); pendingWidths = widths[1].trim().split(/\s+/).map(Number); continue }
    if (trimmed.startsWith("<!--")) {
      flush()
      while (i < lines.length && !lines[i].includes("-->")) i++
      continue
    }
    if (trimmed === "\\saltodepagina") { flush(); blocks.push({ type: "pagebreak" }); continue }
    const h = line.match(/^(#{1,3})\s+(.*?)\s*(?:\{([^}]*)\})?\s*$/)
    if (h) {
      flush()
      const attrs = h[3] || ""
      const id = (attrs.match(/#([\w-]+)/) || [])[1]
      blocks.push({ type: "heading", level: h[1].length, text: h[2], id, numbered: !/\.sin-numero/.test(attrs), file })
      continue
    }
    const callout = trimmed.match(/^:::\s*(nota|consejo|importante)\s*$/)
    if (callout) {
      flush()
      const body = []
      i++
      while (i < lines.length && lines[i].trim() !== ":::") body.push(lines[i++])
      if (i >= lines.length) warn(`${file}: aviso «${callout[1]}» sin cerrar`)
      const paras = body.join("\n").split(/\n\s*\n/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean)
      blocks.push({ type: "callout", kind: callout[1], paras })
      continue
    }
    const fig = trimmed.match(/^!\[\[fig:([\w-]+)(?:\|([^|\]]*))?(?:\|w=([\d.]+))?\]\]$/)
    if (fig) {
      flush()
      blocks.push({ type: "figure", id: fig[1], caption: (fig[2] || "").trim(), width: fig[3] ? Number(fig[3]) : null, file })
      continue
    }
    if (trimmed.startsWith("|")) {
      flush()
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++].trim())
      i--
      const cells = (row) => row.replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"))
      const header = cells(rows[0])
      const body = rows.slice(2).map(cells)
      blocks.push({ type: "table", header, body, widths: pendingWidths, file })
      pendingWidths = null
      continue
    }
    const ol = line.match(/^(\d+)\.\s+(.*)$/)
    const ul = line.match(/^-\s+(.*)$/)
    if (ol || ul) {
      flush()
      const ordered = Boolean(ol)
      const items = []
      while (i < lines.length) {
        const l = lines[i]
        const o = l.match(/^(\d+)\.\s+(.*)$/)
        const u = l.match(/^-\s+(.*)$/)
        if (ordered ? o : u) { items.push({ text: (ordered ? o[2] : u[1]).trim(), children: [] }); i++; continue }
        const sub = l.match(/^\s{2,}-\s+(.*)$/)
        if (sub && items.length) { items[items.length - 1].children.push({ type: "bullet", text: sub[1].trim() }); i++; continue }
        const cont = l.match(/^\s{3,}(\S.*)$/)
        if (cont && items.length) {
          const last = items[items.length - 1]
          const prev = last.children[last.children.length - 1]
          if (prev && prev.type === "cont" && lines[i - 1].trim()) prev.text += " " + cont[1].trim()
          else if (!last.children.length && lines[i - 1].trim() && !lines[i - 1].match(/^\s{3,}/) && lines[i - 1] !== "") last.text += " " + cont[1].trim()
          else last.children.push({ type: "cont", text: cont[1].trim() })
          i++
          continue
        }
        if (!l.trim()) {
          // una línea en blanco solo sigue la lista si lo siguiente es otro elemento o una continuación sangrada
          const next = lines[i + 1] || ""
          if ((ordered ? /^\d+\.\s/ : /^-\s/).test(next) || /^\s{3,}\S/.test(next)) { i++; continue }
        }
        break
      }
      i--
      blocks.push({ type: "list", ordered, items })
      continue
    }
    para.push(trimmed)
  }
  flush()
  return blocks
}

// --- Numeración y referencias --------------------------------------------------------------------
function bookmarkName(id) {
  return ("s_" + id.replace(/[^A-Za-z0-9]/g, "_")).slice(0, 40)
}

function number(allBlocks) {
  const refs = new Map()
  const figs = new Map()
  let ch = 0
  let sec = 0
  let figInChapter = 0
  let figGlobal = 0
  let chapterNumbered = false
  for (const b of allBlocks) {
    if (b.type === "heading") {
      if (b.level === 1) {
        chapterNumbered = b.numbered
        if (b.numbered) { ch++; b.num = `${ch}` }
        sec = 0
        figInChapter = 0
      } else if (b.level === 2 && b.numbered && chapterNumbered) {
        sec++
        b.num = `${ch}.${sec}`
      }
      if (b.id) {
        if (refs.has(b.id)) warn(`${b.file}: id duplicado #${b.id}`)
        refs.set(b.id, { num: b.num, text: b.text, bookmark: bookmarkName(b.id), level: b.level })
      }
    } else if (b.type === "figure") {
      figGlobal++
      figInChapter++
      b.num = chapterNumbered ? `${ch}.${figInChapter}` : `${figGlobal}`
      b.bookmark = bookmarkName("fig_" + b.id)
      if (figs.has(b.id)) warn(`${b.file}: figura repetida ${b.id}`)
      figs.set(b.id, b)
    }
  }
  return { refs, figs }
}

// --- En línea ------------------------------------------------------------------------------------
function inline(text, ctx, base = {}) {
  const runs = []
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[\[(?:ref|pag|fig):[\w-]+\]\]|\{servidor\}|\{estudiantes\})/g
  let last = 0
  let m
  // «100 %» no se parte entre líneas
  const plain = (t, extra = {}) => { if (t) runs.push(new TextRun({ text: t.replace(/(\d) %/g, "$1 %"), ...base, ...extra })) }
  while ((m = re.exec(text))) {
    plain(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith("**")) {
      // la negrita puede contener cursiva o literales sencillos
      runs.push(...inline(tok.slice(2, -2), ctx, { ...base, bold: true }))
    } else if (tok.startsWith("`")) {
      plain(tok.slice(1, -1), { font: "Consolas", size: Math.round((base.size || 22) * 0.9) })
    } else if (tok.startsWith("*")) {
      plain(tok.slice(1, -1), { italics: true })
    } else if (tok.startsWith("[[ref:")) {
      const id = tok.slice(6, -2)
      const r = ctx.refs.get(id)
      if (!r) { warn(`referencia rota [[ref:${id}]]`); plain(`[??? ${id}]`, { color: "C00000", bold: true }); }
      else {
        const label = r.num ? `${r.num} ${r.text}` : r.text
        runs.push(new InternalHyperlink({ anchor: r.bookmark, children: [new TextRun({ text: label, ...base, color: C.acentoTexto, italics: true })] }))
      }
    } else if (tok.startsWith("[[pag:")) {
      const id = tok.slice(6, -2)
      const r = ctx.refs.get(id)
      if (!r) { warn(`referencia de página rota [[pag:${id}]]`); plain("??", { color: "C00000" }) }
      else {
        // PageReference no acepta formato: se le da el de un TextRun con la misma base que el texto
        const ref = new PageReference(r.bookmark, { hyperlink: true })
        ref.properties = new TextRun({ text: "", ...base }).properties
        ref.root[0] = ref.properties
        runs.push(ref)
      }
    } else if (tok.startsWith("[[fig:")) {
      const id = tok.slice(6, -2)
      const f = ctx.figs.get(id)
      if (!f) { warn(`referencia a figura rota [[fig:${id}]]`); plain(`figura ??`, { color: "C00000" }) }
      else runs.push(new InternalHyperlink({ anchor: f.bookmark, children: [new TextRun({ text: `figura ${f.num}`, ...base, color: C.acentoTexto })] }))
    } else {
      runs.push(...badge(tok.slice(1, -1)))
    }
    last = m.index + tok.length
  }
  plain(text.slice(last))
  return runs
}

function badge(kind) {
  return [new TextRun({
    text: ` ${EDICIONES[kind].replace(/ /g, " ")} `, font: DISPLAY, bold: true, size: 15, color: C.fondo,
    characterSpacing: 10, shading: { type: ShadingType.CLEAR, color: "auto", fill: C.acentoTexto },
  })]
}

// --- Bloques a Word ------------------------------------------------------------------------------
let listInstance = 0

function pngSize(file) {
  const buf = fs.readFileSync(file)
  if (buf.toString("ascii", 1, 4) !== "PNG") throw new Error(`no es PNG: ${file}`)
  return { data: buf, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

function figureBlock(b, ctx) {
  const file = path.join(FIGURAS, `${b.id}.png`)
  const out = []
  if (!fs.existsSync(file)) {
    warn(`figura sin imagen: ${b.id}`)
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160, after: 120 },
      border: { top: { style: BorderStyle.DASHED, size: 6, color: "C00000", space: 8 }, bottom: { style: BorderStyle.DASHED, size: 6, color: "C00000", space: 8 } },
      children: [new TextRun({ text: `Figura pendiente: ${b.id}`, color: "C00000", bold: true })],
    }))
  } else {
    const img = pngSize(file)
    // las capturas se hacen a 2x: el tamaño en página sale del ancho pedido, no de los píxeles
    let wIn = Math.min(b.width || FIG_W_DEFAULT, FIG_W_MAX)
    let hIn = wIn * img.h / img.w
    if (hIn > FIG_H_MAX) { hIn = FIG_H_MAX; wIn = hIn * img.w / img.h }
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true, keepLines: true, spacing: { before: 160, after: 80, line: 240 },
      children: [new ImageRun({
        type: "png", data: img.data,
        transformation: { width: Math.round(wIn * 96), height: Math.round(hIn * 96) },
        altText: { title: `Figura ${b.num}`, description: b.caption || b.id, name: b.id },
        outline: { type: "solidFill", solidFillType: "rgb", value: C.borde, width: 9525 },
      })],
    }))
  }
  out.push(new Paragraph({
    style: "PieFigura",
    children: [new Bookmark({ id: b.bookmark, children: [new TextRun({ text: `Figura ${b.num}. `, bold: true, italics: false })] }), ...inline(b.caption, ctx)],
  }))
  return out
}

function calloutBlock(b, ctx) {
  const a = AVISOS[b.kind]
  return b.paras.map((p, idx) => new Paragraph({
    keepLines: true,
    keepNext: idx < b.paras.length - 1,
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: a.borde, space: 10 } },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: a.fondo },
    indent: { left: 240, right: 120 },
    spacing: { before: idx === 0 ? 240 : 0, after: idx === b.paras.length - 1 ? 160 : 0 },
    children: [
      ...(idx === 0 ? [new TextRun({ text: `${a.etiqueta}: `, bold: true, color: a.color })] : []),
      ...inline(p, ctx),
    ],
  }))
}

function listBlock(b, ctx) {
  const out = []
  const instance = ++listInstance
  b.items.forEach((item) => {
    out.push(new Paragraph({
      numbering: b.ordered ? { reference: "pasos", level: 0, instance } : { reference: "vinetas", level: 0 },
      spacing: { before: b.ordered ? 100 : 60 },
      keepLines: true,
      keepNext: item.children.length > 0,
      children: inline(item.text, ctx),
    }))
    for (const child of item.children) {
      if (child.type === "bullet") {
        out.push(new Paragraph({ numbering: { reference: "vinetas", level: 1 }, spacing: { before: 40 }, children: inline(child.text, ctx) }))
      } else {
        out.push(new Paragraph({ indent: { left: 400 }, spacing: { before: 60 }, children: inline(child.text, ctx) }))
      }
    }
  })
  return out
}

function tableBlock(b, ctx) {
  const n = b.header.length
  let rel = b.widths && b.widths.length === n ? b.widths : null
  if (!rel) {
    const len = b.header.map((h, c) => Math.max(h.length, ...b.body.map((r) => (r[c] || "").length)))
    rel = len.map((l) => Math.max(10, Math.min(l, 60)))
  }
  const sum = rel.reduce((s, v) => s + v, 0)
  const widths = rel.map((v) => Math.floor(TEXT_W * v / sum))
  widths[widths.length - 1] += TEXT_W - widths.reduce((s, v) => s + v, 0)
  const border = { style: BorderStyle.SINGLE, size: 4, color: C.borde }
  const borders = { top: border, bottom: border, left: border, right: border }
  const cell = (text, c, head) => new TableCell({
    width: { size: widths[c], type: WidthType.DXA },
    borders,
    shading: head ? { type: ShadingType.CLEAR, color: "auto", fill: C.acento } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.TOP,
    children: [new Paragraph({
      spacing: { before: 0, after: 0, line: 264 },
      indent: { left: 0, right: 0 },
      children: inline(text || "", ctx, head ? { size: 19, bold: true, color: C.fondo, font: SERIF } : { size: 19 }),
    })],
  })
  if (b.body.some((r) => r.length !== n)) warn(`${b.file}: tabla con filas de distinto número de columnas («${b.header[0]}»)`)
  return [new Table({
    width: { size: TEXT_W, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: b.header.map((h, c) => cell(h, c, true)) }),
      ...b.body.map((r) => new TableRow({ cantSplit: true, children: b.header.map((_, c) => cell(r[c], c, false)) })),
    ],
  }), new Paragraph({ spacing: { before: 0, after: 60, line: 240 }, children: [] })]
}

function headingBlock(b) {
  const level = { 1: "Heading1", 2: "Heading2", 3: "Heading3" }[b.level]
  const text = b.level === 1 ? b.text.toUpperCase() : b.text
  const runs = []
  if (b.num) runs.push(new TextRun({ text: b.level === 1 ? `${b.num}. ` : `${b.num} `, color: C.acento }))
  runs.push(new TextRun({ text }))
  const children = b.id ? [new Bookmark({ id: bookmarkName(b.id), children: runs })] : runs
  return [new Paragraph({ style: level, pageBreakBefore: b.level === 1, children })]
}

function render(blocks, ctx) {
  const out = []
  blocks.forEach((b, i) => {
    // el párrafo que presenta una tabla o una lista va con ella; ante una tabla, con algo de aire
    const next = blocks[i + 1] && blocks[i + 1].type
    const beforeTable = next === "table"
    const keepWithNext = beforeTable || (next === "list" && /:\s*$/.test(b.text || ""))
    if (b.type === "heading") out.push(...headingBlock(b))
    else if (b.type === "para") out.push(new Paragraph({ keepNext: keepWithNext, spacing: beforeTable ? { after: 120 } : undefined, children: inline(b.text, ctx) }))
    else if (b.type === "list") out.push(...listBlock(b, ctx))
    else if (b.type === "callout") out.push(...calloutBlock(b, ctx))
    else if (b.type === "figure") out.push(...figureBlock(b, ctx))
    else if (b.type === "table") {
      // una tabla justo después de una lista no queda pegada a su última línea
      if (i > 0 && blocks[i - 1].type === "list") out.push(new Paragraph({ spacing: { before: 0, after: 0, line: 160 }, children: [] }))
      out.push(...tableBlock(b, ctx))
    }
    else if (b.type === "pagebreak") out.push(new Paragraph({ children: [new PageBreak()] }))
  })
  return out
}

// --- Portada, índice, encabezado -----------------------------------------------------------------
function cover() {
  const small = (runs) => new Paragraph({ spacing: { before: 0, line: 240 }, children: runs })
  const out = [
    small([new TextRun({ text: "NEURODATICS", font: DISPLAY, bold: true }), new TextRun({ text: " MANUAL DE USO", font: DISPLAY })]),
    small([new TextRun({ text: "EDICIÓN SERVIDOR Y EDICIÓN ESTUDIANTES · VERSIÓN 1.0", font: DISPLAY })]),
    new Paragraph({ style: "Title", children: [new TextRun({ text: "NEURODATICS" }), new TextRun({ text: "MANUAL DE USO", color: C.texto, break: 1 })] }),
    small([new TextRun({ text: "___", font: DISPLAY, bold: true })]),
    new Paragraph({ style: "Subtitle", children: [new TextRun("Cómo crear proyectos, cargar datos, analizar las señales y generar informes, paso a paso")] }),
  ]
  const portada = path.join(FIGURAS, "portada.png")
  if (fs.existsSync(portada)) {
    const img = pngSize(portada)
    const wIn = 6.5
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 360 },
      children: [new ImageRun({
        type: "png", data: img.data, transformation: { width: Math.round(wIn * 96), height: Math.round(wIn * 96 * img.h / img.w) },
        altText: { title: "Portada", description: "Panel de análisis de NeuroDatics", name: "portada" },
        outline: { type: "solidFill", solidFillType: "rgb", value: C.borde, width: 9525 },
      })],
    }))
  }
  return out
}

function contents() {
  return [
    new Paragraph({ style: "TituloSinIndice", pageBreakBefore: true, children: [new TextRun("CONTENIDO")] }),
    new TableOfContents("Contenido", { hyperlink: true, headingStyleRange: "1-2" }),
  ]
}

function header() {
  const none = { style: BorderStyle.NONE, size: 0, color: "auto" }
  const borders = { top: none, bottom: none, left: none, right: none }
  const band = (children, width, align, marginLeft) => new TableCell({
    width: { size: width, type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
    shading: { type: ShadingType.CLEAR, color: "auto", fill: C.acento },
    margins: { top: 80, bottom: 80, left: marginLeft, right: 100 },
    children: [new Paragraph({ alignment: align, spacing: { before: 0, after: 0, line: 240 }, indent: { left: 0, right: 0 }, children })],
  })
  return new Header({
    children: [
      new Table({
        width: { size: PAGE.w, type: WidthType.DXA }, columnWidths: [PAGE.w - PAGE.right, PAGE.right],
        indent: { size: -PAGE.left, type: WidthType.DXA }, layout: TableLayoutType.FIXED,
        borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
        rows: [new TableRow({
          height: { value: 760, rule: HeightRule.ATLEAST },
          children: [
            band([new TextRun({ text: "NEURODATICS", font: DISPLAY, bold: true, size: 17, color: C.fondo, characterSpacing: 20 }),
              new TextRun({ text: "  ·  MANUAL DE USO", font: DISPLAY, size: 17, color: C.fondo, characterSpacing: 20 })], PAGE.w - PAGE.right, AlignmentType.LEFT, PAGE.left),
            band([new TextRun({ children: [PageNumber.CURRENT], font: DISPLAY, size: 24, color: C.fondo })], PAGE.right, AlignmentType.CENTER, 100),
          ],
        })],
      }),
      new Paragraph({ spacing: { before: 0, after: 0, line: 240 }, children: [] }),
    ],
  })
}

// --- Documento -----------------------------------------------------------------------------------
function fonts() {
  const f = (n) => fs.readFileSync(path.join(FONTS, n))
  return [
    { name: SERIF, data: f("PTSerif-regular.ttf"), bold: f("PTSerif-bold.ttf"), italic: f("PTSerif-italic.ttf"), boldItalic: f("PTSerif-boldItalic.ttf") },
    { name: DISPLAY, data: f("OldStandardTT-regular.ttf"), bold: f("OldStandardTT-bold.ttf"), italic: f("OldStandardTT-italic.ttf") },
  ]
}

function styles() {
  const display = { font: DISPLAY, bold: true }
  return {
    default: {
      document: { run: { font: SERIF, size: 22, color: C.texto }, paragraph: { spacing: { before: 200, line: 312 } } },
      heading1: { run: { ...display, size: 36 }, paragraph: { spacing: { before: 320, after: 120, line: 240 }, keepNext: true, keepLines: true } },
      heading2: { run: { ...display, size: 28 }, paragraph: { spacing: { before: 480, after: 60, line: 264 }, keepNext: true, keepLines: true } },
      heading3: { run: { ...display, size: 25, color: C.acentoTexto }, paragraph: { spacing: { before: 300, after: 0, line: 264 }, keepNext: true, keepLines: true } },
      title: { run: { ...display, size: 72, color: C.acento }, paragraph: { spacing: { before: 320, line: 240 } } },
      hyperlink: { run: { color: C.acentoTexto } },
    },
    paragraphStyles: [
      { id: "Subtitle", name: "Subtitle", basedOn: "Normal", next: "Normal", run: { ...display, size: 26 }, paragraph: { spacing: { before: 320 } } },
      { id: "PieFigura", name: "Pie de figura", basedOn: "Normal", next: "Normal", run: { italics: true, size: 19, color: C.gris }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200, line: 264 } } },
      { id: "TituloSinIndice", name: "Título sin índice", basedOn: "Normal", next: "Normal", run: { ...display, size: 36 }, paragraph: { spacing: { before: 320, after: 240, line: 240 } } },
      { id: "TOC1", name: "toc 1", basedOn: "Normal", next: "Normal", run: { font: DISPLAY, bold: true, size: 22 }, paragraph: { spacing: { before: 200, after: 0, line: 260 } } },
      { id: "TOC2", name: "toc 2", basedOn: "Normal", next: "Normal", run: { size: 20 }, paragraph: { indent: { left: 440 }, spacing: { before: 30, after: 0, line: 260 } } },
    ],
  }
}

function numbering() {
  return {
    config: [
      {
        reference: "pasos",
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { run: { bold: true, color: C.acentoTexto }, paragraph: { indent: { left: 400, hanging: 400 } } },
        }],
      },
      {
        reference: "vinetas",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { run: { color: C.acento }, paragraph: { indent: { left: 400, hanging: 280 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { run: { color: C.acento }, paragraph: { indent: { left: 800, hanging: 280 } } } },
        ],
      },
    ],
  }
}

async function main() {
  const soloIdx = process.argv.indexOf("--solo")
  const filter = soloIdx > 0 ? process.argv[soloIdx + 1] : null
  const sources = listSources(filter)
  if (!sources.length) throw new Error("no hay fuentes en manual/fuentes")
  const allBlocks = sources.flatMap((s) => parseBlocks(s.text, s.name))
  const ctx = number(allBlocks)
  const body = render(allBlocks, ctx)

  const doc = new Document({
    creator: "Jacobo D'león y María Alejandra Muñoz",
    title: "NeuroDatics — Manual de uso",
    description: "Manual de uso de NeuroDatics (edición servidor y edición estudiantes)",
    language: "es-CO",
    background: { color: C.fondo },
    fonts: process.argv.includes("--sin-fuentes") ? [] : fonts(),
    styles: styles(),
    numbering: numbering(),
    features: { updateFields: false },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE.w, height: PAGE.h },
          margin: { top: PAGE.top, bottom: PAGE.bottom, left: PAGE.left, right: PAGE.right, header: 0, footer: 720 },
        },
        titlePage: true,
      },
      headers: { default: header(), first: new Header({ children: [new Paragraph({ children: [] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ children: [] })] }), first: new Footer({ children: [new Paragraph({ children: [] })] }) },
      children: [...cover(), ...contents(), ...body],
    }],
  })
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const out = filter ? OUT.replace(/\.docx$/, `-${filter}.docx`) : OUT
  fs.writeFileSync(out, await Packer.toBuffer(doc))
  console.log(`Escrito: ${out}`)
  console.log(`Fuentes: ${sources.map((s) => s.name).join(", ")}`)
  console.log(`Secciones: ${[...ctx.refs.values()].length} con id · figuras: ${ctx.figs.size}`)
  if (warnings.length) {
    console.log(`\nAvisos (${warnings.length}):`)
    for (const w of warnings) console.log(`  - ${w}`)
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
