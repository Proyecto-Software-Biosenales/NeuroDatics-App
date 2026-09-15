"use client"

import { Download, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AnalyticsParticipant, AnalyticsScenario } from "../types"

interface FiltersBarProps {
  scenarios: AnalyticsScenario[]
  participants: AnalyticsParticipant[]
  selectedScenario: string
  selectedParticipant: string | null
  onScenarioChange: (scenario: string) => void
  onParticipantChange: (participantCode: string) => void
  scenariosLoading: boolean
  participantsLoading: boolean
}

export function FiltersBar({
  scenarios,
  participants,
  selectedScenario,
  selectedParticipant,
  onScenarioChange,
  onParticipantChange,
  scenariosLoading,
  participantsLoading,
}: FiltersBarProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 px-4 py-3 lg:flex-nowrap xl:gap-3 xl:px-6 xl:py-4">
      <div className="flex shrink-0 items-center gap-2.5 text-sm font-medium text-muted-foreground">
        <SlidersHorizontal className="h-4 w-4 shrink-0" />
        <span>Filtros</span>
      </div>

      <Select
        value={selectedScenario}
        onValueChange={(val) => onScenarioChange(val ?? "all")}
        disabled={scenariosLoading}
      >
        <SelectTrigger className="flex w-[min(34vw,240px)] min-w-40 max-w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-50 2xl:w-[280px] 2xl:py-2">
          <span className="truncate">
            {selectedScenario === "all" ? "Todos los escenarios" : selectedScenario}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">Todos los escenarios</SelectItem>
            {scenarios.map((scenario) => (
              <SelectItem key={scenario.name} value={scenario.name}>
                {scenario.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        value={selectedParticipant ?? ""}
        onValueChange={(val) => val && onParticipantChange(val)}
        disabled={participantsLoading || participants.length === 0}
      >
        <SelectTrigger className="flex w-40 shrink-0 items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-50 2xl:w-44 2xl:py-2">
          <SelectValue placeholder="Sin sujetos">{selectedParticipant ?? undefined}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {participants.map((participant) => (
              <SelectItem key={participant.participant_code} value={participant.participant_code}>
                {`Sujeto ${participant.participant_code}`}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <div className="ml-auto shrink-0">
        <Button
          type="button"
          variant="outline"
          disabled
          className="cursor-not-allowed opacity-50"
        >
          <Download className="h-4 w-4" />
          Exportar reporte
        </Button>
      </div>
    </div>
  )
}
