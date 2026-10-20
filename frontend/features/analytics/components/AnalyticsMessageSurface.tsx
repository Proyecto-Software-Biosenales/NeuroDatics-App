import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { ImageOff, MousePointerClick } from "lucide-react"

/** Placeholder that takes a chart's place: a faint icon above one short message. */
export function AnalyticsMessageSurface({
  Icon = ImageOff,
  className,
  children,
}: {
  Icon?: typeof ImageOff
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("flex min-h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center text-sm text-muted-foreground", className)}>
      <Icon className="h-8 w-8 text-muted-foreground/40" />
      {children}
    </div>
  )
}

/** Shown wherever a chart needs one scenario and «Todos los escenarios» is selected. */
export function ScenarioRequiredMessage({
  label,
  className,
  children,
}: {
  label?: string
  className?: string
  children?: ReactNode
}) {
  return (
    <AnalyticsMessageSurface Icon={MousePointerClick} className={className}>
      {children ?? <>Selecciona un escenario específico para visualizar {label}.</>}
    </AnalyticsMessageSurface>
  )
}
