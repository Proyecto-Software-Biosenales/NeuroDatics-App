import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface AnalyticsChartLegendItem {
  label: string
  color: string
}

interface AnalyticsChartShellProps {
  children: ReactNode
  legend?: AnalyticsChartLegendItem[]
  xAxisLabel?: string
  variant?: "main" | "mid" | "compact" | "eeg"
  className?: string
}

export function AnalyticsChartShell({
  children,
  legend = [],
  xAxisLabel = "Tiempo (s)",
  variant = "main",
  className,
}: AnalyticsChartShellProps) {
  return (
    <div
      className={cn(
        "analytics-chart-shell",
        variant !== "main" && `analytics-chart-shell-${variant}`,
        className
      )}
    >
      <div className="analytics-chart-plot-area">{children}</div>
      {xAxisLabel ? <div className="analytics-chart-axis-label">{xAxisLabel}</div> : null}
      {legend.length > 0 ? (
        <div className="analytics-chart-legend" aria-label="Leyenda de la grafica">
          {legend.map((item) => (
            <span key={item.label} className="analytics-chart-legend-item">
              <span
                aria-hidden="true"
                className="analytics-chart-legend-line"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate">{item.label}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
