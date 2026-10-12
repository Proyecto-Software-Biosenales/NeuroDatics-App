"use client"

import type { PreExperimentConfig } from "./types"
import { phaseLabel } from "./types"
import { PlanningSection } from "./PlanningControls"
import { PlanningParticipants } from "./PlanningParticipants"
import { PlanningScreen } from "./PlanningScreen"
import { PlanningQuestionnaire } from "./PlanningQuestionnaire"

/** Full planning editor on one page, used by Configuración. */
export function PreExperimentEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: PreExperimentConfig
  onChange: (value: PreExperimentConfig) => void
  disabled?: boolean
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-5">
      <legend className="sr-only">Información del pre-experimento</legend>
      <PlanningSection
        title={`Participantes (${value.participants.length})`}
        defaultOpen={value.participants.length > 0}
      >
        <div className="mt-2">
          <PlanningParticipants value={value} onChange={onChange} />
        </div>
      </PlanningSection>
      <PlanningSection title="Pantalla y datos relevantes (opcionales)">
        <div className="mt-2">
          <PlanningScreen value={value} onChange={onChange} />
        </div>
      </PlanningSection>
      {(["before", "after"] as const).map((phase) => (
        <fieldset key={phase} className="min-w-0 space-y-4 rounded-lg border p-4">
          <legend className="px-1 font-medium">{phaseLabel[phase]}</legend>
          <PlanningQuestionnaire
            phase={phase}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        </fieldset>
      ))}
    </fieldset>
  )
}
