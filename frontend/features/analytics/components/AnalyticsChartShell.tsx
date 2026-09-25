import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { DragZoomBand, ZoomControls, type ChartDragZoom } from "./ChartDragZoom"
import { InfoChip, type InfoChipProps } from "./InfoChip"

export interface AnalyticsChartLegendItem {
  label: string
  color: string
  /** Line-style keys ("thick = smoothed") mirror the stroke they explain. */
  opacity?: number
  thick?: boolean
}

/** The x-axis title is HTML under the plot, so the SVG keeps no room for one
 *  below its tick labels; 28 px of it used to push the legend past the fold. */
export const LINE_CHART_MARGIN = { top: 12, right: 24, left: 16, bottom: 6 }

/** A caveat about what the chart shows, read on hover beside the legend. */
export interface AnalyticsChartNote extends Omit<InfoChipProps, "className"> {
  id: string
}

interface AnalyticsChartShellProps {
  children: ReactNode
  legend?: AnalyticsChartLegendItem[]
  notes?: AnalyticsChartNote[]
  xAxisLabel?: string
  variant?: "main" | "mid" | "compact" | "eeg"
  className?: string
  dragZoom?: ChartDragZoom
  // Present while the chart shows a sub-range; renders the "full view" X.
  onZoomReset?: () => void
  // Present inside a nested zoom; renders the arrow back to the previous zoom.
  onZoomBack?: () => void
}

export function AnalyticsChartShell({
  children,
  legend = [],
  notes = [],
  xAxisLabel = "Tiempo (s)",
  variant = "main",
  className,
  dragZoom,
  onZoomReset,
  onZoomBack,
}: AnalyticsChartShellProps) {
  return (
    <div
      className={cn(
        "analytics-chart-shell",
        variant !== "main" && `analytics-chart-shell-${variant}`,
        className
      )}
    >
      <div className={cn("analytics-chart-plot-area", dragZoom?.enabled && "analytics-chart-zoomable")}>
        {children}
        {dragZoom ? <DragZoomBand store={dragZoom.store} /> : null}
        <ZoomControls onBack={onZoomBack} onReset={onZoomReset} />
      </div>
      {xAxisLabel ? <div className="analytics-chart-axis-label">{xAxisLabel}</div> : null}
      {notes.length > 0 ? (
        <div className="analytics-chart-footer">
          <ChartLegend legend={legend} />
          <div role="group" className="analytics-chart-notes" aria-label="Notas de la grafica">
            {notes.map(({ id, ...note }) => (
              <InfoChip key={id} {...note} />
            ))}
          </div>
        </div>
      ) : (
        <ChartLegend legend={legend} />
      )}
    </div>
  )
}

function ChartLegend({ legend }: { legend: AnalyticsChartLegendItem[] }) {
  if (legend.length === 0) return null
  return (
    <div role="group" className="analytics-chart-legend" aria-label="Leyenda de la grafica">
      {legend.map((item) => (
        <span key={item.label} className="analytics-chart-legend-item">
          <span
            aria-hidden="true"
            className="analytics-chart-legend-line"
            style={{ backgroundColor: item.color, opacity: item.opacity, height: item.thick ? "0.1875rem" : undefined }}
          />
          <span className="truncate">{item.label}</span>
        </span>
      ))}
    </div>
  )
}
