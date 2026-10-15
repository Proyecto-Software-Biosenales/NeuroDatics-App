import type { AnalyticsParticipant } from "./types"

type LabelSource = Pick<AnalyticsParticipant, "participant_code" | "name" | "document">

/** Short identity: the entered name, otherwise the document (the extracted code by default). */
export function participantShortLabel(participant: LabelSource): string {
  return participant.name?.trim() || participant.document?.trim() || participant.participant_code
}

/** Option text: the name alone, or "Participante <documento>" as before names existed. */
export function participantLabel(participant: LabelSource): string {
  const name = participant.name?.trim()
  return name || `Participante ${participant.document?.trim() || participant.participant_code}`
}

/** participant_code -> label, for views that only carry codes. */
export function participantLabelMap(participants: readonly LabelSource[]): Record<string, string> {
  return Object.fromEntries(participants.map((participant) => [participant.participant_code, participantLabel(participant)]))
}
