"use client"

import { Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useParticipantComparison } from "./ParticipantComparisonProvider"
import type { ParticipantComparisonSpec } from "./spec"

/**
 * Small header action that opens the same chart for every participant. The
 * spec is read at click time so it always carries the view's live filters.
 */
export function CompareParticipantsButton({
  spec,
  className,
}: {
  spec: ParticipantComparisonSpec | (() => ParticipantComparisonSpec)
  className?: string
}) {
  const comparison = useParticipantComparison()
  if (!comparison.available || comparison.nested) return null
  const disabled = comparison.participantCount === 0
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      aria-haspopup="dialog"
      data-testid="compare-participants-button"
      disabled={disabled}
      title={disabled ? "No hay participantes en este proyecto" : "Ver esta gráfica para cada participante"}
      className={cn("ml-auto shrink-0 bg-card", className)}
      onClick={(event) => {
        const resolved = typeof spec === "function" ? spec() : spec
        comparison.open(resolved, event.currentTarget)
      }}
    >
      <Users aria-hidden="true" />
      Comparar participantes
    </Button>
  )
}
