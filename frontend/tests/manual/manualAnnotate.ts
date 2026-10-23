// Annotated screenshots for the manual: a rounded red box around a control, a red arrow that reaches it
// from outside and, when the figure has several calls, a filled red circle with a white number.
// The layer is injected in the page (fixed, viewport coordinates) from the control's boundingBox and
// removed after the screenshot. Each figure also writes a JSON with the crop and the boxes.
import type { Locator, Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { FIGURES_DIR, OUT_DIR } from "./manualAssets"

export const RED = "#E0252F"

export type Box = { x: number; y: number; width: number; height: number }
export type Target = Locator | Box
export type Side = "top" | "bottom" | "left" | "right"

export type Callout = {
  /** The control to point at (several are merged into one box). */
  target: Target | Target[]
  /** Number inside the red circle; without it the arrow has no circle. */
  number?: number
  /** Side the arrow comes from. */
  from?: Side
  /** Space between the control and the red box (CSS px). */
  pad?: number
  /** Slides the arrow along the edge of the box (CSS px). */
  shift?: number
  /** Arrow length from the box to its tail (CSS px). */
  length?: number
  /** Draw the box only, no arrow. */
  noArrow?: boolean
}

export type Figure = {
  id: string
  /** Area to keep; by default the union of the targets. The arrows are always inside the crop. */
  region?: Target | Target[]
  callouts?: Callout[]
  /** Air around everything kept (CSS px). */
  margin?: number
  /** Width above which a warning is printed (CSS px). */
  maxWidth?: number
  /** Crop edges stay at the viewport's when true (default false). */
  fullViewport?: boolean
}

const isLocator = (target: Target): target is Locator => typeof (target as Locator).boundingBox === "function"

async function boxOf(target: Target | Target[]): Promise<Box> {
  const list = Array.isArray(target) ? target : [target]
  const boxes: Box[] = []
  for (const item of list) {
    if (isLocator(item)) {
      const box = await item.boundingBox()
      if (!box) throw new Error(`manualAnnotate: the target has no box (${String(item)})`)
      boxes.push(box)
    } else {
      boxes.push(item)
    }
  }
  const x0 = Math.min(...boxes.map((b) => b.x))
  const y0 = Math.min(...boxes.map((b) => b.y))
  const x1 = Math.max(...boxes.map((b) => b.x + b.width))
  const y1 = Math.max(...boxes.map((b) => b.y + b.height))
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

const round = (value: number) => Math.round(value * 10) / 10

type Shape = { svg: string; bounds: Box }

function arrowShapes(callout: Callout, box: Box): Shape[] {
  const pad = callout.pad ?? 5
  const rect = { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 }
  const shapes: Shape[] = []
  const stroke = 3
  shapes.push({
    svg: `<rect x="${round(rect.x)}" y="${round(rect.y)}" width="${round(rect.width)}" height="${round(rect.height)}" rx="8" ry="8" fill="none" stroke="${RED}" stroke-width="${stroke}"/>`,
    bounds: { x: rect.x - stroke, y: rect.y - stroke, width: rect.width + stroke * 2, height: rect.height + stroke * 2 },
  })
  if (callout.noArrow) return shapes

  const side = callout.from ?? "bottom"
  const length = callout.length ?? 46
  const shift = callout.shift ?? 0
  const radius = callout.number ? 12 : 0
  const cx = rect.x + rect.width / 2 + (side === "left" || side === "right" ? 0 : shift)
  const cy = rect.y + rect.height / 2 + (side === "top" || side === "bottom" ? 0 : shift)
  // Tip touches the outer edge of the red box; the tail is `length` away, outside.
  const dir = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[side]
  const tip =
    side === "top" ? { x: cx, y: rect.y - stroke / 2 }
      : side === "bottom" ? { x: cx, y: rect.y + rect.height + stroke / 2 }
        : side === "left" ? { x: rect.x - stroke / 2, y: cy }
          : { x: rect.x + rect.width + stroke / 2, y: cy }
  const tail = { x: tip.x + dir[0] * length, y: tip.y + dir[1] * length }
  const head = 13
  const half = 7.5
  const baseCenter = { x: tip.x + dir[0] * head, y: tip.y + dir[1] * head }
  const normal = [-dir[1], dir[0]]
  const left = { x: baseCenter.x + normal[0] * half, y: baseCenter.y + normal[1] * half }
  const right = { x: baseCenter.x - normal[0] * half, y: baseCenter.y - normal[1] * half }
  const shaftStart = { x: tail.x - dir[0] * radius * 0 + dir[0] * -0, y: tail.y }
  void shaftStart
  const start = { x: tail.x - dir[0] * radius, y: tail.y - dir[1] * radius }
  // The shaft runs from the circle's edge (or the tail) to the arrow head.
  shapes.push({
    svg: `<line x1="${round(start.x)}" y1="${round(start.y)}" x2="${round(baseCenter.x)}" y2="${round(baseCenter.y)}" stroke="${RED}" stroke-width="3" stroke-linecap="round"/>` +
      `<polygon points="${round(tip.x)},${round(tip.y)} ${round(left.x)},${round(left.y)} ${round(right.x)},${round(right.y)}" fill="${RED}"/>`,
    bounds: {
      x: Math.min(tip.x, tail.x) - radius - 2,
      y: Math.min(tip.y, tail.y) - radius - 2,
      width: Math.abs(tip.x - tail.x) + radius * 2 + 4,
      height: Math.abs(tip.y - tail.y) + radius * 2 + 4,
    },
  })
  if (callout.number) {
    shapes.push({
      svg: `<circle cx="${round(tail.x)}" cy="${round(tail.y)}" r="${radius}" fill="${RED}"/>` +
        `<text x="${round(tail.x)}" y="${round(tail.y + 0.5)}" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="15" text-anchor="middle" dominant-baseline="central">${callout.number}</text>`,
      bounds: { x: tail.x - radius, y: tail.y - radius, width: radius * 2, height: radius * 2 },
    })
  }
  return shapes
}

function union(boxes: Box[]): Box {
  const x0 = Math.min(...boxes.map((b) => b.x))
  const y0 = Math.min(...boxes.map((b) => b.y))
  const x1 = Math.max(...boxes.map((b) => b.x + b.width))
  const y1 = Math.max(...boxes.map((b) => b.y + b.height))
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/** Annotates the page, saves manual/figuras/<id>.png (2x) and output/manual/figuras/<id>.json, then removes the layer. */
export async function captureFigure(page: Page, figure: Figure) {
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 }
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))
  const callouts = figure.callouts ?? []
  const targets: Box[] = []
  const shapes: Shape[] = []
  const recorded: Array<{ number?: number; box: Box; pad: number; from?: Side }> = []
  for (const callout of callouts) {
    const box = await boxOf(callout.target)
    targets.push(box)
    shapes.push(...arrowShapes(callout, box))
    recorded.push({ number: callout.number, box: { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) }, pad: callout.pad ?? 5, from: callout.noArrow ? undefined : callout.from ?? "bottom" })
  }
  const regionBoxes: Box[] = []
  if (figure.region) regionBoxes.push(await boxOf(figure.region))
  else regionBoxes.push(...targets)
  const kept = union([...regionBoxes, ...shapes.map((shape) => shape.bounds)])
  const margin = figure.margin ?? 16
  const x0 = figure.fullViewport ? 0 : Math.max(0, Math.floor(kept.x - margin))
  const y0 = figure.fullViewport ? 0 : Math.max(0, Math.floor(kept.y - margin))
  const x1 = figure.fullViewport ? viewport.width : Math.min(viewport.width, Math.ceil(kept.x + kept.width + margin))
  const y1 = figure.fullViewport ? viewport.height : Math.min(viewport.height, Math.ceil(kept.y + kept.height + margin))
  const clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${viewport.width} ${viewport.height}" style="position:absolute;left:0;top:0;overflow:visible">${shapes.map((s) => s.svg).join("")}</svg>`
  await page.evaluate((markup) => {
    document.getElementById("manual-annotation")?.remove()
    const layer = document.createElement("div")
    layer.id = "manual-annotation"
    layer.setAttribute("style", "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none")
    layer.innerHTML = markup
    document.body.appendChild(layer)
  }, svg)

  fs.mkdirSync(FIGURES_DIR, { recursive: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const png = path.join(FIGURES_DIR, `${figure.id}.png`)
  // `clip` is in page coordinates, so the scroll offset is added to the viewport box.
  await page.screenshot({ path: png, clip: { x: clip.x + scroll.x, y: clip.y + scroll.y, width: clip.width, height: clip.height }, animations: "disabled" })
  await page.evaluate(() => document.getElementById("manual-annotation")?.remove())

  const limit = figure.maxWidth ?? 760
  const warning = clip.width > limit ? `ANCHO ${clip.width}px > ${limit}px` : undefined
  if (warning) console.warn(`[figura ${figure.id}] ${warning}`)
  fs.writeFileSync(
    path.join(OUT_DIR, `${figure.id}.json`),
    JSON.stringify({ id: figure.id, viewport, clip, scroll, widthCss: clip.width, heightCss: clip.height, callouts: recorded, warning }, null, 2),
    "utf8",
  )
  return clip
}
