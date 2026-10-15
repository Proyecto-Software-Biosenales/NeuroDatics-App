"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

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
 * Layout: icon on the left, label + value + description on the right. Compact by
 * default so laptop screens keep the chart in view; `roomy:` (wide and tall screens)
 * restores the large size. Supports click interaction, active/pinned state, and an
 * optional shadcn Tooltip via the Info icon in the top-right corner.
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
      <Card className={cn("p-3 roomy:p-5", className)}>
        <Skeleton className="mb-3 h-3 w-16 animate-pulse rounded bg-muted roomy:mb-4" />
        <Skeleton className="h-7 w-24 animate-pulse rounded bg-muted roomy:h-8" />
      </Card>
    )
  }

  return (
    <Card
      className={cn(
        "relative rounded-xl border p-3 transition-all duration-200 roomy:p-5",
        bgClass,
        borderClass,
        active ? cn("shadow-sm ring-1 ring-inset ring-foreground/10", activeBgClass) : "",
        isInteractive
          ? cn("cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", hoverBgClass)
          : "",
        className,
      )}
    >
      {isInteractive && (
        <Button variant="ghost" onClick={onClick} aria-pressed={active}
          aria-label={`${label}: ${value != null ? value.toFixed(decimals).replace(".", ",") : "—"} ${unit}`}
          className="absolute inset-0 z-0 h-full w-full rounded-xl hover:bg-transparent focus-visible:ring-inset" />
      )}
      {/* Info icon with shadcn tooltip — only rendered when tooltip text is provided */}
      {(tooltip || tooltipExtra) && (
        <div className="absolute right-2 top-2 z-10 roomy:right-3 roomy:top-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label={`Información sobre ${label}`} className="cursor-help text-muted-foreground">
                  <Info className="size-4" />
                </Button>
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

      <div className="pointer-events-none relative flex items-start gap-3 roomy:gap-4">
        {/* Accent icon circle */}
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg roomy:h-10 roomy:w-10 roomy:rounded-xl",
            iconBgClass,
          )}
        >
          <Icon className={cn("h-4 w-4 roomy:h-5 roomy:w-5", iconColorClass)} />
        </div>

        {/* Label / value / description */}
        <div className="min-w-0">
          <p className={cn("truncate text-xs font-medium roomy:text-sm", labelColorClass)}>{label}</p>
          <p className="mt-0.5 text-lg leading-6 font-bold tracking-tight text-foreground roomy:mt-1 roomy:text-2xl roomy:leading-8">
            {value != null ? (
              <>
                {value.toFixed(decimals).replace(".", ",")}
                <span className="ml-1 text-sm font-semibold text-foreground roomy:text-lg">{unit}</span>
              </>
            ) : (
              "—"
            )}
          </p>
          {description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground roomy:mt-1" title={description}>{description}</p>
          )}
        </div>
      </div>
    </Card>
  )
}
