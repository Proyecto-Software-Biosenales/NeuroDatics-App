"use client"

import { Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnalyticsMessageSurface } from "../components/AnalyticsMessageSurface"
import { useGroupMode } from "./GroupModeProvider"

/** Takes the chart's place when the open view cannot show the chosen group mode. */
export function GroupUnsupported({ reason, className }: { reason: string; className?: string }) {
  const group = useGroupMode()
  return (
    <AnalyticsMessageSurface Icon={Users} className={className}>
      <p data-testid="group-unsupported" className="max-w-md">{reason}</p>
      <Button type="button" variant="outline" size="sm" className="mt-1 bg-background" onClick={group.leave}>
        Ver un participante
      </Button>
    </AnalyticsMessageSurface>
  )
}
