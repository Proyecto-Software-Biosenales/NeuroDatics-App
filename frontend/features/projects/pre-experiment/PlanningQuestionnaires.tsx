"use client"
import type { ReactNode } from "react"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { SubTabs } from "../components/SubTabs"
import { PlanningQuestionnaire } from "./PlanningQuestionnaire"
import { phaseLabel, type Phase, type PreExperimentConfig } from "./types"

export type QuestionnaireView = Phase | "responses"
const phases = ["before", "after"] as const

/** Before and after questionnaires of the project, as the two sub-tabs creating and editing share.
 *  `responses` adds a third sub-tab with the answers already taken. */
export function PlanningQuestionnaires({
  value,
  onChange,
  view,
  onViewChange,
  invalidPhases = [],
  disabled = false,
  responses,
}: {
  value: PreExperimentConfig
  onChange: (value: PreExperimentConfig) => void
  view: QuestionnaireView
  onViewChange: (view: QuestionnaireView) => void
  invalidPhases?: Phase[]
  disabled?: boolean
  responses?: { count: number; content: ReactNode }
}) {
  return (
    <Tabs value={view} onValueChange={(next) => onViewChange(next as QuestionnaireView)} className="gap-4">
      <SubTabs
        label="Momento del cuestionario"
        disabled={disabled}
        tabs={[
          ...phases.map((phase) => ({
            id: phase,
            label: phaseLabel[phase],
            count: value.questionnaires[phase].questions.length,
            unit: "preguntas",
            invalid: invalidPhases.includes(phase),
          })),
          ...(responses
            ? [{ id: "responses", label: "Respuestas", count: responses.count, unit: "respuestas" }]
            : []),
        ]}
      />
      {phases.map((phase) => (
        <TabsContent key={phase} value={phase}>
          <PlanningQuestionnaire phase={phase} value={value} onChange={onChange} disabled={disabled} />
        </TabsContent>
      ))}
      {responses && <TabsContent value="responses">{responses.content}</TabsContent>}
    </Tabs>
  )
}
