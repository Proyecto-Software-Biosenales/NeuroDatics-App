import { cn } from "@/lib/utils"

export interface MetricCardProps {
  /** Short uppercase label shown above the value (e.g. "MEDIA", "MÁXIMO") */
  label: string
  /** Numeric value to display. Pass null to show the skeleton loader. */
  value: number | null
  /** Unit suffix rendered in smaller text. Defaults to "mm". */
  unit?: string
  /** Number of decimal places for the displayed value. Defaults to 4. */
  decimals?: number
  /** Tailwind border-l-* color class for the left accent stripe. */
  borderColorClass?: string
  /** Tailwind border-* color class for the full card border. Defaults to border-gray-100. */
  borderCardClass?: string
  /** Tailwind text-* color class for the label. */
  labelColorClass?: string
  /** Tailwind bg-gradient-* class applied to the card background. Defaults to plain white. */
  bgColorClass?: string
  /** When true, renders an animated skeleton instead of the value. */

  loading?: boolean
  /** When provided the card becomes interactive and calls this on click. */
  onClick?: () => void
  /** Adds a visible focus ring to indicate the card is selected/pinned. */
  active?: boolean
}

/**
 * Generic metric card used across the analytics dashboard.
 *
 * Renders a left-accented card with a coloured label and a prominent numeric
 * value. Supports optional click interaction and an active/pinned state.
 */
export function MetricCard({
  label,
  value,
  unit = "mm",
  decimals = 4,
  borderColorClass = "border-l-gray-300",
  borderCardClass = "border-gray-100",
  labelColorClass = "text-gray-400",
  bgColorClass = "bg-white",
  loading = false,
  onClick,
  active = false,
}: MetricCardProps) {
  const isInteractive = onClick != null

  return (
    <div
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick?.()
            }
          : undefined
      }
      className={cn(
        "rounded-xl border px-4 py-3 shadow-sm",
        "border-l-4 transition-all duration-200 ease-out",
        "hover:-translate-y-1 hover:scale-[1] hover:shadow-md",
        borderCardClass,
        bgColorClass,
        borderColorClass,
        isInteractive
          ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1"
          : "cursor-default",
        active ? "ring-2 ring-gray-400 ring-offset-1" : "",
      )}
    >
      <p className={cn("text-[10px] font-semibold uppercase tracking-wider", labelColorClass)}>
        {label}
      </p>

      {loading || value == null ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-gray-100" />
      ) : (
        <p className="mt-1 text-2xl font-bold text-gray-900">
          {value.toFixed(decimals)}{" "}
          <span className="text-sm font-normal text-gray-400">{unit}</span>
        </p>
      )}
    </div>
  )
}
