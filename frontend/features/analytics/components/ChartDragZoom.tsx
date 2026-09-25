"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react"
import type { MouseHandlerDataParam } from "recharts"
import { ArrowLeft, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { DRAG_ZOOM_THRESHOLD_PX, readZoomValue } from "../chartZoom"

type ChartMouseHandler = (state: MouseHandlerDataParam, event: SyntheticEvent) => void
type ZoomHandler = (start: number, end: number) => void

// Pixel edges of the band being dragged, relative to the chart wrapper.
interface DragBand {
  from: number
  to: number
  top?: number
  height?: number
}

interface PlotBounds {
  top: number
  height: number
}

// Recharts clips series to the plot area; that rect bounds the band vertically.
function readPlotBounds(wrapper: EventTarget | null): PlotBounds | null {
  const rect = wrapper instanceof Element ? wrapper.querySelector("clipPath rect") : null
  const top = Number(rect?.getAttribute("y"))
  const height = Number(rect?.getAttribute("height"))
  return rect && Number.isFinite(top) && Number.isFinite(height) ? { top, height } : null
}

interface DragBandStore {
  get: () => DragBand | null
  set: (band: DragBand | null) => void
  subscribe: (listener: () => void) => () => void
}

function createDragBandStore(): DragBandStore {
  let band: DragBand | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => band,
    set: (next) => {
      band = next
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export interface ChartDragZoom {
  enabled: boolean
  store: DragBandStore
  chartProps: (onClick?: ChartMouseHandler) => {
    onMouseDown: ChartMouseHandler
    onMouseMove: ChartMouseHandler
    onClick: ChartMouseHandler
  }
}

/**
 * Click-and-drag range selection for Recharts charts. The band is published
 * through a tiny external store so dragging never re-renders large series.
 * A drag suppresses the click that follows it; a plain click still reaches
 * `onClick`.
 */
export function useChartDragZoom(onZoom?: ZoomHandler): ChartDragZoom {
  const [store] = useState(createDragBandStore)
  const drag = useRef<{
    start: number
    end: number
    originX: number
    fromPx: number
    plot: PlotBounds | null
    moved: boolean
  } | null>(null)
  const suppressClick = useRef(false)
  const onZoomRef = useRef(onZoom)
  useEffect(() => {
    onZoomRef.current = onZoom
  })

  const finish = useCallback(() => {
    const current = drag.current
    drag.current = null
    store.set(null)
    if (!current?.moved) return
    suppressClick.current = true
    onZoomRef.current?.(Math.min(current.start, current.end), Math.max(current.start, current.end))
  }, [store])

  useEffect(() => () => window.removeEventListener("mouseup", finish), [finish])

  const chartProps = (onClick?: ChartMouseHandler) => ({
    onMouseDown: (state: MouseHandlerDataParam, event: SyntheticEvent) => {
      suppressClick.current = false
      const mouse = event as SyntheticEvent<Element, MouseEvent>
      const value = readZoomValue(state)
      if (!onZoomRef.current || value == null || mouse.nativeEvent.button !== 0) return
      // Keep the drag from selecting page text around the chart.
      mouse.preventDefault()
      const fromPx = state.activeCoordinate?.x ?? 0
      const plot = readPlotBounds(mouse.currentTarget)
      drag.current = { start: value, end: value, originX: mouse.nativeEvent.clientX, fromPx, plot, moved: false }
      window.addEventListener("mouseup", finish, { once: true })
    },
    onMouseMove: (state: MouseHandlerDataParam, event: SyntheticEvent) => {
      const current = drag.current
      if (!current) return
      const value = readZoomValue(state)
      if (value != null) current.end = value
      const clientX = (event as SyntheticEvent<Element, MouseEvent>).nativeEvent.clientX
      if (Math.abs(clientX - current.originX) >= DRAG_ZOOM_THRESHOLD_PX) current.moved = true
      const toPx = state.activeCoordinate?.x
      if (current.moved && toPx != null) {
        store.set({ from: current.fromPx, to: toPx, top: current.plot?.top, height: current.plot?.height })
      }
    },
    onClick: (state: MouseHandlerDataParam, event: SyntheticEvent) => {
      if (suppressClick.current) {
        suppressClick.current = false
        return
      }
      onClick?.(state, event)
    },
  })

  return { enabled: Boolean(onZoom), store, chartProps }
}

export function DragZoomBand({ store }: { store: DragBandStore }) {
  const band = useSyncExternalStore(store.subscribe, store.get, () => null)
  if (!band) return null
  return (
    <DragZoomSelection
      left={Math.min(band.from, band.to)}
      width={Math.abs(band.to - band.from)}
      top={band.top}
      height={band.height}
    />
  )
}

function DragZoomSelection({ left, width, top = 0, height = "100%" }: {
  left: number | string
  width: number | string
  top?: number
  height?: number | string
}) {
  return (
    <div
      aria-hidden="true"
      className="analytics-chart-zoom-band pointer-events-none absolute z-[1]"
      style={{ left, width, top, height }}
    />
  )
}

/**
 * Drag-to-zoom for canvas surfaces. Positions are ratios of the element width
 * so callers map them onto whatever axis they draw. Touch keeps scrolling.
 */
export function usePointerDragZoom(onZoomRatios?: (from: number, to: number) => void) {
  const [band, setBand] = useState<DragBand | null>(null)
  const drag = useRef<{ originX: number; from: number; to: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)

  const ratioAt = (event: ReactPointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)))
  }

  const handlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      suppressClick.current = false
      if (!onZoomRatios || event.pointerType !== "mouse" || event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      const ratio = ratioAt(event)
      drag.current = { originX: event.clientX, from: ratio, to: ratio, moved: false }
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const current = drag.current
      if (!current) return
      current.to = ratioAt(event)
      if (Math.abs(event.clientX - current.originX) >= DRAG_ZOOM_THRESHOLD_PX) current.moved = true
      if (current.moved) setBand({ from: current.from, to: current.to })
    },
    onPointerUp: () => {
      const current = drag.current
      drag.current = null
      setBand(null)
      if (!current?.moved) return
      suppressClick.current = true
      onZoomRatios?.(Math.min(current.from, current.to), Math.max(current.from, current.to))
    },
    onPointerCancel: () => {
      drag.current = null
      setBand(null)
    },
  }

  /** True once for the click the browser dispatches right after a drag. */
  const consumeDragClick = () => {
    const suppressed = suppressClick.current
    suppressClick.current = false
    return suppressed
  }

  const bandElement = band ? (
    <DragZoomSelection
      left={`${Math.min(band.from, band.to) * 100}%`}
      width={`${Math.abs(band.to - band.from) * 100}%`}
    />
  ) : null

  return { handlers, consumeDragClick, bandElement }
}

/**
 * Top-right zoom actions: the arrow steps back one nested zoom level and the
 * X returns to the full view. Renders nothing outside a zoom.
 */
export function ZoomControls({
  onBack,
  onReset,
  className,
}: {
  onBack?: () => void
  onReset?: () => void
  className?: string
}) {
  if (!onBack && !onReset) return null
  return (
    <div className={cn("absolute right-2 top-1 z-10 flex items-center gap-1", className)}>
      {onBack ? (
        <ZoomControlButton label="Volver al zoom anterior" onClick={onBack}>
          <ArrowLeft />
        </ZoomControlButton>
      ) : null}
      {onReset ? (
        <ZoomControlButton label="Volver a la vista completa" onClick={onReset}>
          <X />
        </ZoomControlButton>
      ) : null}
    </div>
  )
}

function ZoomControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-xs"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="cursor-pointer bg-background/90 shadow-sm"
    >
      {children}
    </Button>
  )
}
