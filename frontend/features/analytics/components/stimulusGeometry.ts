import type { CSSProperties } from "react"

/**
 * Where the stimulus is actually painted inside its container.
 *
 * A stimulus is displayed with `object-contain`, so the painted image is
 * centred inside the element and letterboxed on whichever axis has slack.
 * Every overlay - AOI shapes, scanpath nodes, the heatmap PNG - has to be
 * placed against this box rather than against the container, otherwise the
 * overlay drifts by the size of the letterbox bars.
 */
export type ContainedImageBox = {
  cW: number
  cH: number
  renderedW: number
  renderedH: number
  offsetX: number
  offsetY: number
}

export function getContainedImageBox(
  img: HTMLImageElement | null,
  container: HTMLElement | null
): ContainedImageBox | null {
  if (!img || !container) return null

  const cW = container.clientWidth
  const cH = container.clientHeight
  const iW = img.naturalWidth
  const iH = img.naturalHeight
  if (!cW || !cH || !iW || !iH) return null

  const scale = Math.min(cW / iW, cH / iH)
  const renderedW = iW * scale
  const renderedH = iH * scale
  return {
    cW,
    cH,
    renderedW,
    renderedH,
    offsetX: (cW - renderedW) / 2,
    offsetY: (cH - renderedH) / 2,
  }
}

/**
 * Absolute box that exactly covers the painted stimulus.
 *
 * A raster overlay (the heatmap PNG) must be pinned here rather than
 * letterboxed on its own with `object-contain`: `object-contain` sizes the
 * overlay from the PNG's own intrinsic aspect ratio, so a stimulus and an
 * overlay that disagree even slightly end up occupying different visible boxes
 * and every hotspot drifts. Stretching to the measured box also keeps overlays
 * for scenarios ingested before intrinsic dimensions were captured aligned,
 * because the overlay's coordinates are normalized to the stimulus either way.
 */
export function containedImageBoxStyle(box: ContainedImageBox): CSSProperties {
  return {
    position: "absolute",
    left: `${box.offsetX}px`,
    top: `${box.offsetY}px`,
    width: `${box.renderedW}px`,
    height: `${box.renderedH}px`,
  }
}

/**
 * A point given in stimulus percentages, as a percentage of the container.
 *
 * Percentages are measured from the stimulus' top-left corner, the same
 * convention the backend normalizes fixations into.
 */
export function imagePointToContainerPercent(
  box: ContainedImageBox,
  xPercent: number,
  yPercent: number
) {
  return {
    x: ((box.offsetX + (xPercent / 100) * box.renderedW) / box.cW) * 100,
    y: ((box.offsetY + (yPercent / 100) * box.renderedH) / box.cH) * 100,
  }
}
