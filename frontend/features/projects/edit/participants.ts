import type { ParticipantData } from "@/features/projects/create-project/types"
import type { PlanningParticipant } from "@/features/projects/pre-experiment/types"

/** A project with its folder keeps two records of its participants: the ones read from the data (sex and age
 *  feed the analysis) and the ones of its preparation (questionnaires and notes). The editor shows them as one
 *  list: a participant of the data is paired with the one of the preparation that has the same document. */

const documentKey = (value: string) => value.trim().toLowerCase()

/** The document a participant read from the data is known by: the corrected one, or the code in the data. */
export const recordedDocument = (participant: ParticipantData) => participant.document.trim() || participant.id

/** Code read from the data → id of its participant in the preparation. */
export type ParticipantLinks = Record<string, string>

export function linkParticipants(recorded: ParticipantData[], planned: PlanningParticipant[]): ParticipantLinks {
  const links: ParticipantLinks = {}
  const taken = new Set<string>()
  for (const participant of recorded) {
    const key = documentKey(recordedDocument(participant))
    const match = planned.find(
      (item) => !taken.has(item.id) && documentKey(item.identification_document || item.code || "") === key
    )
    if (!match) continue
    links[participant.id] = match.id
    taken.add(match.id)
  }
  return links
}

/** The participants of the preparation that have no card of their own from the data. */
export const unlinkedParticipants = (planned: PlanningParticipant[], links: ParticipantLinks) => {
  const linked = new Set(Object.values(links))
  return planned.filter((item) => !linked.has(item.id))
}

/** The documents of every card, so a document repeated between the two records is caught too. */
export function repeatedDocuments(recorded: ParticipantData[], planned: PlanningParticipant[], links: ParticipantLinks) {
  const documents = [
    ...recorded.map(recordedDocument),
    ...unlinkedParticipants(planned, links).map((item) => item.identification_document),
  ]
  const counts = new Map<string, number>()
  for (const document of documents) counts.set(documentKey(document), (counts.get(documentKey(document)) ?? 0) + 1)
  const isRepeated = (document: string) => !!documentKey(document) && (counts.get(documentKey(document)) ?? 0) > 1
  return { isRepeated, first: documents.find(isRepeated)?.trim() ?? null }
}

/** A participant of the data assigned to one of the preparation: it takes the preparation's document and fills
 *  what the preparation knows, keeping what was read from the data where the preparation is blank. */
export const assignedParticipant = (participant: ParticipantData, planned: PlanningParticipant): ParticipantData => {
  const sex = planned.gender
  return {
    ...participant,
    document: planned.identification_document.trim() || planned.code?.trim() || participant.document,
    name: planned.name.trim() || participant.name,
    sex: sex === "male" || sex === "female" || sex === "other" ? sex : participant.sex,
    age: planned.age !== null ? String(planned.age) : participant.age,
  }
}

// Documents are compared without case, spaces or punctuation: «1.234-56» and «123456» are the same document.
const comparable = (value: string) => value.toLowerCase().replace(/[^0-9a-z]/g, "")

/** Edits between two documents, a swap of two neighbouring characters counting as one. */
function documentDistance(a: string, b: string) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i ? (j ? 0 : i) : j)))
  for (let i = 1; i <= a.length; i += 1)
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1)
    }
  return rows[a.length][b.length]
}

/** How far a document typed in the preparation is from one read from the data; null when they are too far apart
 *  to be the same person mistyped. A cédula of eight or more characters may differ in two, a shorter one in one,
 *  and a code of fewer than four characters must be equal. */
function similarity(planned: PlanningParticipant, participant: ParticipantData) {
  const a = comparable(planned.identification_document || planned.code || "")
  const b = comparable(recordedDocument(participant))
  if (!a || !b) return null
  const distance = documentDistance(a, b)
  return distance <= Math.min(2, Math.floor(Math.max(a.length, b.length) / 4)) ? distance : null
}

/** Participant of the preparation → code read from the data it is first assigned to: equal documents first,
 *  then the closest ones, each participant used once. The rest stay unassigned for the person to choose. */
export function suggestedAssignments(planned: PlanningParticipant[], recorded: ParticipantData[]) {
  const pairs = planned
    .flatMap((item) => recorded.map((participant) => ({ planned: item.id, code: participant.id, distance: similarity(item, participant) })))
    .filter((pair): pair is { planned: string; code: string; distance: number } => pair.distance !== null)
    .sort((a, b) => a.distance - b.distance)
  const assignments: Record<string, string> = {}
  const taken = new Set<string>()
  for (const pair of pairs) {
    if (assignments[pair.planned] || taken.has(pair.code)) continue
    assignments[pair.planned] = pair.code
    taken.add(pair.code)
  }
  return assignments
}

/** The value of «Asignar documento» for a participant left out of the data. */
export const UNASSIGNED = "sin-asignar"

/** The choices of «Asignar documento»: unassigned, then the given participants of the data, the closest first. */
export function assignmentOptions(planned: PlanningParticipant, recorded: ParticipantData[]) {
  const target = comparable(planned.identification_document || planned.code || "")
  const ranked = recorded
    .map((participant, index) => ({ participant, index, distance: documentDistance(target, comparable(recordedDocument(participant))) }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
  return [
    { value: UNASSIGNED, label: "Sin asignar" },
    ...ranked.map(({ participant }) => ({ value: participant.id, label: recordedDocument(participant) })),
  ]
}

/** The fields the preparation keeps of a participant read from the data, equal to the data's. */
export const mirroredParticipant = (participant: ParticipantData): Partial<PlanningParticipant> => {
  const age = Number(participant.age)
  return {
    name: participant.name,
    identification_document: recordedDocument(participant),
    gender: participant.sex ?? "",
    age: participant.age.trim() !== "" && Number.isInteger(age) ? age : null,
  }
}
