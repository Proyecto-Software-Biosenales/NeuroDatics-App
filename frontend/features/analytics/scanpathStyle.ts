/**
 * Visual presets for the main scanpath tab ("Mapa de recorridos").
 *
 * - "python": mirrors the reference Python plot. Nodes are nearly opaque with
 *   a thin outline and the connecting line is thin. Node sizes are the same
 *   fixed 12-40 px radii as "legacy".
 * - "legacy": the previous web look (translucent nodes, thick white ring,
 *   fixed 12-40 px radii that ignore the displayed image size).
 *
 * To go back to the previous look, set ACTIVE_SCANPATH_STYLE to "legacy".
 *
 * A preset with scaleWithImage multiplies every size by the displayed stimulus
 * size, as the PDF report does. Radii stay on the shared absolute area scale
 * (scanpathScale.ts): scaling the minimum and maximum radius by the same
 * factor scales every node by that factor, so area remains proportional to
 * duration.
 */
export type ScanpathStyleName = "python" | "legacy"

export const ACTIVE_SCANPATH_STYLE: ScanpathStyleName = "python"

export type ScanpathStyle = {
  /** Radius at zero duration, in px at the reference size. */
  minRadius: number
  /** Radius at the duration cap, in px at the reference size. */
  maxRadius: number
  /** When false, every size below is used as-is in CSS px. */
  scaleWithImage: boolean
  /** Displayed stimulus size at which sizes are used unscaled. */
  referenceWidth: number
  referenceHeight: number
  minScale: number
  maxScale: number
  nodeFill: string
  nodeStroke: string
  nodeStrokeWidth: number
  /** Static Tailwind classes so the utilities are always generated. */
  nodeClassName: string
  lineStroke: string
  lineWidth: number
  labelFill: string
  /** Outline painted under the label; only its outer half shows. */
  labelHalo: string
  labelHaloWidth: number
  /** "round" avoids spiky corners on thick outlines; SVG defaults to "miter". */
  labelHaloLineJoin: "round" | "miter"
  labelRadiusRatio: number
  labelMinFontSize: number
  labelMaxFontSize: number
}

export const SCANPATH_STYLES: Readonly<Record<ScanpathStyleName, ScanpathStyle>> = {
  python: {
    // Same node sizes as "legacy". For image-relative sizing set
    // scaleWithImage: true (e.g. minScale 0.6, maxScale 2).
    minRadius: 12,
    maxRadius: 40,
    scaleWithImage: false,
    referenceWidth: 1024,
    referenceHeight: 576,
    minScale: 1,
    maxScale: 1,
    nodeFill: "rgba(26, 115, 232, 0.9)",
    nodeStroke: "rgba(255, 255, 255, 0.85)",
    nodeStrokeWidth: 1,
    nodeClassName: "transition-[stroke-width] group-focus-visible:stroke-[3]",
    lineStroke: "rgba(26, 115, 232, 0.85)",
    lineWidth: 1.5,
    labelFill: "white",
    // Solid black outline around white digits, as in the Colab plot.
    labelHalo: "black",
    labelHaloWidth: 3,
    labelHaloLineJoin: "round",
    labelRadiusRatio: 0.55,
    labelMinFontSize: 9,
    labelMaxFontSize: 16,
  },
  legacy: {
    minRadius: 12,
    maxRadius: 40,
    scaleWithImage: false,
    referenceWidth: 1024,
    referenceHeight: 576,
    minScale: 1,
    maxScale: 1,
    nodeFill: "rgba(0, 122, 255, 0.55)",
    nodeStroke: "rgba(255,255,255,0.95)",
    nodeStrokeWidth: 2.5,
    nodeClassName: "transition-[stroke-width] group-focus-visible:stroke-[4]",
    lineStroke: "rgba(0, 122, 255, 0.7)",
    lineWidth: 2.5,
    labelFill: "white",
    labelHalo: "rgba(0,0,0,0.5)",
    labelHaloWidth: 2,
    labelHaloLineJoin: "miter",
    labelRadiusRatio: 0.55,
    labelMinFontSize: 9,
    labelMaxFontSize: 16,
  },
}

export type ScanpathGeometry = {
  scale: number
  minRadius: number
  maxRadius: number
  nodeStrokeWidth: number
  lineWidth: number
}

/**
 * Size multiplier for a stimulus painted at renderedW x renderedH. Like the
 * PDF renderer, the axis that grew most relative to the reference wins, so
 * portrait and landscape stimuli are treated alike. Unmeasured boxes use 1.
 */
export function scanpathRenderScale(
  style: ScanpathStyle,
  renderedW: number,
  renderedH: number
): number {
  if (!style.scaleWithImage) return 1
  const raw = Math.max(
    renderedW / style.referenceWidth,
    renderedH / style.referenceHeight
  )
  if (!Number.isFinite(raw) || raw <= 0) return 1
  return Math.min(Math.max(raw, style.minScale), style.maxScale)
}

export function scanpathGeometry(
  style: ScanpathStyle,
  renderedW: number,
  renderedH: number
): ScanpathGeometry {
  const scale = scanpathRenderScale(style, renderedW, renderedH)
  return {
    scale,
    minRadius: style.minRadius * scale,
    maxRadius: style.maxRadius * scale,
    nodeStrokeWidth: style.nodeStrokeWidth * scale,
    lineWidth: style.lineWidth * scale,
  }
}

export function scanpathLabelFontSize(
  style: ScanpathStyle,
  radius: number
): number {
  return Math.max(
    style.labelMinFontSize,
    Math.min(Math.round(radius * style.labelRadiusRatio), style.labelMaxFontSize)
  )
}
