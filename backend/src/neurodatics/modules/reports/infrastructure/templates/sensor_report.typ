// NeuroDatics device report.
//
// Python prepares every value as display-ready text (see
// application/sensor_reports/document.py); this file only lays the document
// out. Strings from report.json are always inserted as text, never evaluated.

#let data = json("report.json")
#let meta = data.meta

#let ink = rgb("#171717")
#let ink-2 = rgb("#525252")
#let muted = rgb("#737373")
#let hairline = rgb("#E5E5E5")
#let rule = rgb("#A3A3A3")
#let tint = rgb("#F5F5F5")
#let warn-tint = rgb("#FFF7E6")
#let warn = rgb("#fab219")
#let accent = rgb(meta.accent)

#set document(
  title: meta.document_title,
  author: "NeuroDatics",
  keywords: meta.keywords,
)
#set text(font: "Poppins", size: 8.6pt, fill: ink, lang: "es", region: "co")
#set par(leading: 0.6em, spacing: 0.85em, justify: false)
#set list(indent: 0.4em, body-indent: 0.5em, marker: text(fill: muted)[•])

#let to-width(value) = {
  if value == none or value == "auto" { auto }
  else if value.ends-with("fr") { float(value.slice(0, -2)) * 1fr }
  else if value.ends-with("mm") { float(value.slice(0, -2)) * 1mm }
  else if value.ends-with("%") { float(value.slice(0, -1)) * 1% }
  else { auto }
}

#let to-align(value) = {
  if value == "left" { left } else if value == "center" { center } else { right }
}

#let eyebrow(body) = text(size: 6.8pt, weight: 600, fill: muted, tracking: 0.6pt, upper(body))

// Logo mark plus wordmark, sized from the wordmark so the lockup scales as one.
#let wordmark(size) = {
  let mark = size * 1.35
  box(height: mark, baseline: mark * 0.26, image(meta.logo, height: mark))
  h(size * 0.34)
  text(size: size, weight: 700, fill: ink)[NeuroDatics]
}

// ---------------------------------------------------------------- headings

#show heading.where(level: 1): it => block(above: 0pt, below: 0.9em, width: 100%, sticky: true)[
  #text(size: 19pt, weight: 700, fill: ink, it.body)
]

#show heading.where(level: 2): it => block(above: 1.9em, below: 0.75em, sticky: true)[
  #box(width: 3pt, height: 9pt, fill: accent, baseline: 1pt)
  #h(5pt)
  #text(size: 11pt, weight: 600, fill: ink, it.body)
]

// ---------------------------------------------------------------- blocks

#let block-title(title, description) = {
  if title != "" {
    block(below: if description != "" { 0.35em } else { 0.6em }, sticky: true,
      text(size: 9pt, weight: 600, fill: ink, title))
  }
  if description != "" {
    block(below: 0.6em, sticky: true, text(size: 7.4pt, fill: muted, description))
  }
}

#let kpi-tiles(item) = {
  let count = calc.max(1, calc.min(item.items.len(), 4))
  block(above: 0.9em, below: 1.1em, grid(
    columns: (1fr,) * count,
    column-gutter: 7pt,
    row-gutter: 7pt,
    ..item.items.map(tile => block(
      width: 100%,
      inset: (x: 9pt, top: 7.5pt, bottom: 7.5pt),
      radius: 5pt,
      stroke: 0.6pt + hairline,
    )[
      #set text(top-edge: "ascender", bottom-edge: "descender")
      #block(below: 2.5pt, eyebrow(tile.label))
      #block(below: 1.5pt, text(size: 12.5pt, weight: 600, fill: ink, tile.value))
      #block(text(size: 6.8pt, fill: muted, if tile.hint != "" { tile.hint } else { sym.space.nobreak }))
    ]),
  ))
}

#let fact-list(item) = {
  let pairs = item.items.map(fact => (
    text(size: 7.2pt, fill: muted, fact.label),
    text(size: 8.4pt, fill: ink, fact.value),
  ))
  block(above: 0.8em, below: 1.1em, grid(
    columns: (auto, 1fr) * item.columns,
    column-gutter: (10pt, 18pt) * item.columns,
    row-gutter: 6.5pt,
    ..pairs.flatten(),
  ))
}

#let figure-block(item) = block(above: 1.1em, below: 1.2em, breakable: false, width: 100%)[
  #block-title(item.title, item.description)
  #image(item.src, width: 100%)
]

// Short tables move as a whole; long ones break with a repeated header.
#let data-table(item) = block(above: 1em, below: 1.2em, width: 100%, breakable: item.rows.len() > 14)[
  #block-title(item.title, item.description)
  #let columns = item.columns
  #let body-cells = item.rows.map(row => row.cells.enumerate().map(((index, cell)) => {
    let content = if index == 0 and row.swatch != none {
      box(circle(radius: 2.6pt, fill: rgb(row.swatch)), baseline: -0.5pt) + h(4.5pt) + cell
    } else { cell }
    table.cell(
      fill: if row.emphasis { tint } else { none },
      text(weight: if row.emphasis { 600 } else { 400 }, content),
    )
  })).flatten()
  #set text(size: 7.6pt)
  #table(
    columns: columns.map(column => to-width(column.width)),
    align: (x, y) => to-align(columns.at(x).align) + horizon,
    inset: (x: 4.5pt, y: 4.3pt),
    stroke: (x, y) => (
      bottom: if y == 0 { 0.8pt + rule } else { 0.5pt + hairline },
    ),
    table.header(
      repeat: true,
      ..columns.map(column => text(size: 6.6pt, weight: 600, fill: muted, column.label)),
    ),
    ..body-cells,
  )
  #if item.note != "" {
    block(above: 0.5em, text(size: 6.8pt, fill: muted, item.note))
  }
]

#let callout-block(item) = {
  let is-warning = item.tone == "warning"
  block(
    above: 1em,
    below: 1.1em,
    width: 100%,
    breakable: false,
    inset: (left: 11pt, right: 10pt, y: 8.5pt),
    radius: 4pt,
    fill: if is-warning { warn-tint } else { tint },
    stroke: (left: 2.5pt + if is-warning { warn } else { accent }),
  )[
    #text(size: 8.4pt, weight: 600, fill: ink, item.title)
    #set text(size: 7.6pt, fill: ink-2)
    #if item.items.len() == 1 {
      block(above: 0.5em, item.items.first())
    } else {
      block(above: 0.5em, list(..item.items))
    }
  ]
}

#let image-grid(item) = block(above: 1em, below: 1.2em, width: 100%, breakable: false)[
  #block-title(item.title, item.description)
  #let max-height = item.max_height_mm * 1mm
  #grid(
    columns: (1fr,) * item.columns,
    column-gutter: 9pt,
    row-gutter: 10pt,
    ..item.items.map(entry => layout(size => {
      let ratio = entry.aspect
      let height = calc.min(max-height, size.width / ratio)
      let width = height * ratio
      if entry.title != "" {
        block(below: 0.45em, sticky: true, text(size: 7.8pt, weight: 600, fill: ink, entry.title))
      }
      align(center, box(
        stroke: 0.5pt + hairline,
        radius: 3pt,
        clip: true,
        image(entry.src, width: width, height: height),
      ))
      if entry.key != none {
        align(center, block(above: 0.6em, {
          block(below: 0.4em, text(size: 6.6pt, fill: muted, entry.key.title))
          grid(
            columns: entry.key.items.len() * 2,
            column-gutter: (3.5pt, 10pt) * entry.key.items.len(),
            align: horizon,
            ..entry.key.items.map(item => (
              circle(radius: item.radius * height, fill: rgb(entry.key.fill), stroke: 0.6pt + white),
              text(size: 6.8pt, fill: ink, item.label),
            )).flatten(),
          )
        }))
      }
      if entry.caption != "" {
        block(above: 0.45em, text(size: 6.8pt, fill: muted, entry.caption))
      }
    })),
  )
]

#let render-blocks(blocks) = {
  for item in blocks {
    if item.type == "heading" { heading(level: 2, item.text) }
    else if item.type == "paragraph" {
      block(above: 0.7em, below: 0.9em, text(fill: if item.muted { muted } else { ink-2 }, item.text))
    }
    else if item.type == "kpis" { kpi-tiles(item) }
    else if item.type == "facts" { fact-list(item) }
    else if item.type == "figure" { figure-block(item) }
    else if item.type == "table" { data-table(item) }
    else if item.type == "callout" { callout-block(item) }
    else if item.type == "images" { image-grid(item) }
    else if item.type == "columns" {
      block(above: 1em, below: 1em, grid(
        columns: item.widths.map(to-width),
        column-gutter: 14pt,
        ..item.columns.map(stack => render-blocks(stack)),
      ))
    }
    else if item.type == "group" { block(breakable: false, width: 100%, render-blocks(item.blocks)) }
  }
}

// ---------------------------------------------------------------- cover

#if meta.include_cover {
  page(margin: 0pt, header: none, footer: none)[
    #place(top + left, dx: 20mm, dy: 18mm, wordmark(11pt))
    #place(top + right, dx: -20mm, dy: 19mm, eyebrow("Informe de resultados"))
    #if meta.cover_art != "" {
      place(bottom + right, dx: 0mm, dy: 0mm, image(meta.cover_art, width: 150mm))
    }
    #place(top + left, dx: 20mm, dy: 84mm, block(width: 170mm)[
      #box(width: 34mm, height: 3pt, fill: accent)
      #v(12pt)
      #eyebrow(meta.cover_eyebrow)
      #v(8pt, weak: true)
      #text(size: 40pt, weight: 700, fill: ink, meta.device_label)
      #v(14pt, weak: true)
      #text(size: 17pt, weight: 500, fill: ink-2, meta.project)
      #v(8pt, weak: true)
      #text(size: 10.5pt, fill: ink-2, meta.scope_label)
    ])
    #place(top + left, dx: 20mm, dy: 152mm, block(width: 170mm)[
      #line(length: 100%, stroke: 0.6pt + hairline)
      #v(9pt)
      #grid(
        columns: (1fr,) * meta.cover_facts.len(),
        column-gutter: 12pt,
        ..meta.cover_facts.map(fact => [
          #block(below: 5pt, eyebrow(fact.label))
          #text(size: 11pt, weight: 600, fill: ink, fact.value)
        ]),
      )
    ])
  ]
}

// ---------------------------------------------------------------- pages

#set page(
  paper: "a4",
  margin: (left: 18mm, right: 18mm, top: 23mm, bottom: 19mm),
  header-ascent: 38%,
  footer-descent: 30%,
  header: context {
    let here-page = here().page()
    let on-page = query(heading.where(level: 1)).filter(h => h.location().page() == here-page)
    let before = query(heading.where(level: 1).before(here()))
    let section = if on-page.len() > 0 { on-page.first().body } else if before.len() > 0 { before.last().body } else { [] }
    set text(size: 7pt, fill: muted)
    grid(
      columns: (auto, 1fr),
      // Centred, not bottom-aligned: the logo hangs below the baseline, and
      // bottom alignment would lift the wordmark above the section name.
      align: (left + horizon, right + horizon),
      [#wordmark(7pt) #h(4pt) #meta.report_title],
      section,
    )
    v(4pt, weak: true)
    line(length: 100%, stroke: 0.5pt + hairline)
  },
  footer: context {
    set text(size: 6.8pt, fill: muted)
    grid(
      columns: (1fr, auto),
      align: (left, right),
      meta.footer_note,
      [Página #counter(page).display() de #counter(page).final().first()],
    )
  },
)

#show outline.entry.where(level: 1): set block(above: 1.1em)
#show outline.entry.where(level: 1): set text(weight: 600, size: 9pt)
#show outline.entry.where(level: 2): set text(fill: ink-2, size: 8.2pt)

#outline(title: [Contenido], depth: 2, indent: 1.2em)

#pagebreak(weak: true)
#heading(level: 1)[Resumen]
#render-blocks(data.summary)

#for section in data.sections {
  pagebreak(weak: true)
  if section.eyebrow != "" {
    block(below: 0.6em, sticky: true, eyebrow(section.eyebrow))
  }
  heading(level: 1, section.title)
  if section.subtitle != "" {
    block(below: 1.2em, sticky: true, text(size: 8pt, fill: muted, section.subtitle))
  }
  render-blocks(section.blocks)
}

#if data.appendix.len() > 0 {
  pagebreak(weak: true)
  heading(level: 1)[Metodología y glosario]
  render-blocks(data.appendix)
}
