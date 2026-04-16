"use client"

import { Download, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
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
    <div className="flex items-center gap-3 px-6 py-4">
      <div className="mr-2 flex items-center gap-2 text-sm font-medium text-gray-700">
        <SlidersHorizontal className="h-4 w-4" />
        <span>Filtros</span>
      </div>

      <select
        value={selectedScenario}
        onChange={(event) => onScenarioChange(event.target.value)}
        disabled={scenariosLoading}
        className="max-w-[280px] truncate rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
      >
        <option value="all">Todos los escenarios</option>
        {scenarios.map((scenario) => (
          <option key={scenario.name} value={scenario.name}>
            {scenario.name}
          </option>
        ))}
      </select>

      <select
        value={selectedParticipant ?? ""}
        onChange={(event) => onParticipantChange(event.target.value)}
        disabled={participantsLoading || participants.length === 0}
        className="w-36 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
      >
        {participants.length === 0 ? <option value="">Sin sujetos</option> : null}
        {participants.map((participant) => (
          <option key={participant.participant_code} value={participant.participant_code}>
            {`Sujeto ${participant.participant_code}`}
          </option>
        ))}
      </select>

      <div className="ml-auto">
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
