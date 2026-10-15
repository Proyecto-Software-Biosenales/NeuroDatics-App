import { cn } from "@/lib/utils"
import type { AoiMetricItem } from "../../types"

export const OUTSIDE_AOI_LABEL = "Fuera de AOIs"
/** Mid grey, so "outside" blocks stay visible on the muted track in both themes. */
export const OUTSIDE_AOI_COLOR = "#A3A3A3"

export function AoiSwatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  )
}

/** An AOI as every card of the tab names it: its colour, then its name. */
export function AoiName({
  aoi,
  className,
}: {
  aoi: Pick<AoiMetricItem, "name" | "color">
  className?: string
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground", className)}>
      <AoiSwatch color={aoi.color} />
      <span className="truncate" title={aoi.name}>{aoi.name}</span>
    </span>
  )
}

export function OutsideAoiName({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-muted-foreground", className)}>
      <AoiSwatch color={OUTSIDE_AOI_COLOR} />
      <span className="truncate">{OUTSIDE_AOI_LABEL}</span>
    </span>
  )
}
