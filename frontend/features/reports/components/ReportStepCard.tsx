import type { ReactNode } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function ReportStepCard({ step, title, description, children, disabled = false }: {
  step: number
  title: string
  description: string
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <Card className={cn("p-4 sm:p-6", disabled && "opacity-50")}>
      <CardHeader className="mb-6 flex flex-row items-start gap-4 p-0">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-lg font-semibold">{step}</div>
        <div className="min-w-0 flex-1">
          <h2 className="mb-2 text-xl font-semibold">{title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  )
}
