import type { ElementType } from "react"
import { cn } from "@/lib/utils"

export interface KpiCardProps {
  /** Label shown as the card title (e.g. "Media", "Mínimo"). */
  label: string
  /** Numeric value. Pass null/undefined to show the skeleton loader. */
  value?: number | null
  /** Short description shown below the value. */
  description?: string
  /** Lucide icon component rendered in the top-right badge. */
  Icon: ElementType
  /** Number of decimal places. Defaults to 2. */
  decimals?: number
  /** Unit suffix. Defaults to "mm". */
  unit?: string
  /** Tailwind bg-* for the card background. */
  bgClass?: string
  /** Tailwind bg-* for the icon badge background. */
  iconBgClass?: string
  /** Tailwind text-* color for the icon and description. */
  accentClass?: string
  /** Tailwind border class for the full card border. */
  borderCardClass?: string
  /** Tailwind text-* color for the card title/label. */
  titleColorClass?: string
  /** When true shows the skeleton pulse overlay. */
  loading?: boolean
  /** When provided the card becomes interactive and calls this on click. */
  onClick?: () => void
  /** When true renders a focus ring to indicate pinned/selected state. */
  active?: boolean
}

/**
 * Generic KPI summary card for analytics dashboards.
 *
 * Shows a labelled metric value with an icon badge, description, and
 * configurable colour accents. Supports click interaction and pinned state.
 * Use this anywhere you need a compact numeric highlight card.
 */
export function KpiCard({
  label,
  value,
  description,
  Icon,
  decimals = 2,
  unit = "mm",
  bgClass = "bg-gray-50",
  iconBgClass = "bg-gray-100",
  accentClass = "text-gray-400",
  borderCardClass = "border border-gray-100",
  titleColorClass = "text-gray-700",
  loading = false,
  onClick,
  active = false,
}: KpiCardProps) {
  const isInteractive = onClick != null

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
        "rounded-xl p-5 transition-all duration-200 ease-out",
        "hover:-translate-y-1 hover:scale-[1.02] hover:shadow-md",
        isInteractive
          ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1"
          : "cursor-default",
        active ? "ring-2 ring-offset-1 ring-gray-500" : "",
        bgClass,
        borderCardClass,
      )}
    >
      <div className="flex items-start justify-between">
        <span className={cn("text-sm font-semibold", titleColorClass)}>{label}</span>
        <div className={cn("rounded-full p-1.5", iconBgClass)}>
          <Icon className={cn("h-4 w-4", accentClass)} />
        </div>
      </div>

      {loading || value == null ? (
        <div className="mt-3 h-8 w-24 animate-pulse rounded bg-white/60" />
      ) : (
        <p className="mt-2 text-3xl font-bold text-gray-900">
          {value.toFixed(decimals)}{" "}
          <span className="text-lg font-bold text-gray-900">{unit}</span>
        </p>
      )}

      {description ? (
        <p className={cn("mt-1 text-xs", accentClass)}>{description}</p>
      ) : null}
    </div>
  )
}
