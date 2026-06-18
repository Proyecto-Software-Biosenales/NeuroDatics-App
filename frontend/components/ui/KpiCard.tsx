"use client"

import type { ElementType } from "react"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export interface KpiCardProps {
  /** Label shown as the card title (e.g. "Media", "Mínimo"). */
  label: string
  /** Numeric value. Null/undefined shows "—". */
  value?: number | null
  /** Unit suffix rendered after the value. Defaults to "mm". */
  unit?: string
  /** Number of decimal places. Defaults to 2. */
  decimals?: number
  /** Short description shown below the value. */
  description?: string
  /** Lucide icon component rendered inside the accent circle. */
  Icon: ElementType
  /** Tailwind bg-* class for card background. Defaults to bg-card. */
  bgClass?: string
  /** Tailwind border-* class for card border. Defaults to border-border. */
  borderClass?: string
  /**
   * Full Tailwind hover+active bg classes, e.g. "hover:bg-violet-50 dark:hover:bg-violet-950/30".
   * Applied always; use Tailwind's `hover:` prefix in the value so it only shows on hover.
   * When `active` is true, also apply the non-hover version via `activeBgClass`.
   */
  hoverBgClass?: string
  /** Plain bg class (no hover: prefix) applied when active. Should match the hover color. */
  activeBgClass?: string
  /** Tailwind bg-* class for the icon circle background. */
  iconBgClass?: string
  /** Tailwind text-* class for the icon color. */
  iconColorClass?: string
  /** Tailwind text-* class for the label/title color. */
  labelColorClass?: string
  /** Primary text shown on the Info tooltip. */
  tooltip?: string
  /** Secondary tooltip line, e.g. "Valor real: 4.7617 mm". */
  tooltipExtra?: string
  /** When true renders a skeleton loading state. */
  loading?: boolean
  /** When provided the card becomes clickable. */
  onClick?: () => void
  /** When true renders an inset ring to show selected/pinned state. */
  active?: boolean
  /** Extra Tailwind classes applied to the root element. */
  className?: string
}

/**
 * Generic KPI summary card for analytics dashboards.
 *
 * Layout: large icon circle on the left, label + value + description on the right.
 * Supports click interaction, active/pinned state, and an optional shadcn Tooltip
 * via the Info icon in the top-right corner.
 */
export function KpiCard({
  label,
  value,
  unit = "mm",
  decimals = 2,
  description,
  Icon,
  bgClass = "bg-card",
  borderClass = "border-border",
  hoverBgClass = "",
  activeBgClass = "",
  iconBgClass = "bg-muted",
  iconColorClass = "text-muted-foreground",
  labelColorClass = "text-muted-foreground",
  tooltip,
  tooltipExtra,
  loading = false,
  onClick,
  active = false,
  className,
}: KpiCardProps) {
  const isInteractive = onClick != null

  if (loading) {
    return (
      <div className={cn("rounded-2xl border border-border p-6", className)}>
        <div className="mb-4 h-3 w-16 animate-pulse rounded bg-muted" />
        <div className="h-8 w-24 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  return (
    <div
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick()
            }
          : undefined
      }
      className={cn(
        "relative rounded-2xl border p-6 transition-all duration-200",
        bgClass,
        borderClass,
        active ? cn("shadow-sm ring-1 ring-inset ring-foreground/10", activeBgClass) : "",
        isInteractive
          ? cn("cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", hoverBgClass)
          : "",
        className,
      )}
    >
      {/* Info icon with shadcn tooltip — only rendered when tooltip text is provided */}
      {(tooltip || tooltipExtra) && (
        <div className="absolute right-4 top-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 cursor-help text-muted-foreground/40 hover:text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="top" className="space-y-1">
                {tooltip && <p>{tooltip}</p>}
                {tooltipExtra && (
                  <p className="text-muted-foreground">{tooltipExtra}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Accent icon circle */}
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            iconBgClass,
          )}
        >
          <Icon className={cn("h-5 w-5", iconColorClass)} />
        </div>

        {/* Label / value / description */}
        <div>
          <p className={cn("text-sm font-medium", labelColorClass)}>{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {value != null ? (
              <>
                {value.toFixed(decimals).replace(".", ",")}
                <span className="ml-1 text-lg font-semibold text-foreground">{unit}</span>
              </>
            ) : (
              "—"
            )}
          </p>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
    </div>
  )
}
