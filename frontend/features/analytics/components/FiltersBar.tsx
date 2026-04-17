"use client"

import { Download, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
  ComboboxInput
} from "@/components/ui/combobox"
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
      <div className="flex items-center gap-2.5 text-sm font-medium text-gray-700">
        <SlidersHorizontal className="h-4 w-4 shrink-0" />
        <span>Filtros</span>
      </div>

      <Combobox
        value={selectedScenario}
        onValueChange={(val) => onScenarioChange(val ?? "all")}
        disabled={scenariosLoading}
      >
        <ComboboxTrigger className="flex max-w-[280px] items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-50">
          <span className="truncate">
            {selectedScenario === "all" ? "Todos los escenarios" : selectedScenario}
          </span>
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxList>
            <ComboboxItem value="all">Todos los escenarios</ComboboxItem>
            {scenarios.map((scenario) => (
              <ComboboxItem key={scenario.name} value={scenario.name}>
                {scenario.name}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      <Combobox
        value={selectedParticipant}
        onValueChange={(val) => val && onParticipantChange(val)}
        disabled={participantsLoading || participants.length === 0}
      >
        <ComboboxTrigger className="flex min-w-[180px] shrink-0 items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-50">
          <ComboboxValue placeholder="Sin sujetos" />
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxList>
            {participants.map((participant) => (
              <ComboboxItem key={participant.participant_code} value={participant.participant_code}>
                {`Sujeto ${participant.participant_code}`}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

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
