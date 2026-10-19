"use client"
import type { ParticipantData } from "@/features/projects/create-project/types"
import {
  ParticipantCards,
  newPlanningParticipant,
  planningChange,
  planningFields,
  type ParticipantFields,
} from "@/features/projects/pre-experiment/PlanningParticipants"
import type { PreExperimentConfig } from "@/features/projects/pre-experiment/types"
import {
  UNASSIGNED,
  assignmentOptions,
  recordedDocument,
  repeatedDocuments,
  unlinkedParticipants,
  type ParticipantLinks,
} from "./participants"

/** One list of participants, whether or not the project has its folder: the ones read from the data first,
 *  then the ones registered for the preparation. Once there is data, those of the preparation without a pair
 *  can be assigned one of the data that has none. */
export function ProjectParticipants({
  recorded,
  planning,
  links,
  attempted,
  onRecordedChange,
  onPlanningChange,
  onAssign,
}: {
  recorded: ParticipantData[]
  planning: PreExperimentConfig
  links: ParticipantLinks
  attempted: boolean
  onRecordedChange: (code: string, change: Partial<ParticipantFields>) => void
  onPlanningChange: (value: PreExperimentConfig) => void
  onAssign: (plannedId: string, code: string) => void
}) {
  const notes = new Map(planning.participants.map((item) => [item.id, item.notes]))
  const { isRepeated } = repeatedDocuments(recorded, planning.participants, links)
  const unpaired = recorded.filter((participant) => !links[participant.id])
  const update = (id: string, change: Partial<ParticipantFields>) =>
    onPlanningChange({
      ...planning,
      participants: planning.participants.map((item) => (item.id === id ? { ...item, ...planningChange(change) } : item)),
    })
  return (
    <ParticipantCards
      onAdd={() => onPlanningChange({ ...planning, participants: [...planning.participants, newPlanningParticipant()] })}
      cards={[
        ...recorded.map((participant) => ({
          key: `datos-${participant.id}`,
          recordedCode: participant.id,
          fields: {
            name: participant.name,
            document: participant.document,
            sex: participant.sex ?? "",
            age: participant.age,
            notes: notes.get(links[participant.id]) ?? "",
          },
          repeated: isRepeated(recordedDocument(participant)),
          incomplete: attempted,
          onChange: (change: Partial<ParticipantFields>) => onRecordedChange(participant.id, change),
        })),
        ...unlinkedParticipants(planning.participants, links).map((participant) => ({
          key: participant.id,
          fields: planningFields(participant),
          legacyCode: participant.code,
          repeated: isRepeated(participant.identification_document),
          assignment: recorded.length
            ? {
                options: assignmentOptions(participant, unpaired),
                onChange: (code: string) => code !== UNASSIGNED && onAssign(participant.id, code),
              }
            : undefined,
          onChange: (change: Partial<ParticipantFields>) => update(participant.id, change),
          onRemove: () =>
            onPlanningChange({
              ...planning,
              participants: planning.participants.filter((item) => item.id !== participant.id),
            }),
        })),
      ]}
    />
  )
}
