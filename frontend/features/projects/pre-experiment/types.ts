import type { ScreenSettings } from "@/features/settings/screenSettings"

export type Phase = "before" | "after"
export type PlanningParticipant = {
  id: string
  /** What identified participants before the document; only older saves have it. */
  code?: string
  name: string
  identification_document: string
  gender: string
  age: number | null
  notes: string
}
export type ProjectNote = { id: string; title: string; text: string }
export type PlanningQuestion = {
  id: string
  type: "multiple_choice" | "open_text" | "true_false"
  prompt: string
  required: boolean
  options: { id: string; label: string }[]
}
export type Questionnaire = {
  enabled: boolean
  title: string
  questions: PlanningQuestion[]
}
export type PreExperimentConfig = {
  participants: PlanningParticipant[]
  screen: {
    width_px: number | null
    height_px: number | null
    width_cm: number | null
    height_cm: number | null
    viewing_distance_cm: number | null
    notes: string
  }
  notes: string
  questionnaires: Record<Phase, Questionnaire>
  project_notes: ProjectNote[]
}
export type Answers = Record<string, string | boolean | string[]>
export type QuestionnaireResponse = {
  id: string
  revision: number
  participant_id: string
  phase: Phase
  participant_snapshot: PlanningParticipant
  questionnaire_snapshot: Questionnaire
  answers: Answers
  submitted_at: string
}
export type PreExperimentEnvelope = {
  revision: number
  config: PreExperimentConfig
  responses: QuestionnaireResponse[]
}
/** The same choices as the participants of a project created from its folder. */
export const sexOptions = [
  { label: "Masculino", value: "male" },
  { label: "Femenino", value: "female" },
  { label: "Otro", value: "other" },
] as const
export const sexLabel = (value: string) =>
  sexOptions.find((option) => option.value === value)?.label ?? value
/** The document identifies a participant; older saves were identified by a code. */
export const participantLabel = (participant: PlanningParticipant) =>
  [
    participant.identification_document.trim() || participant.code?.trim(),
    participant.name.trim(),
  ]
    .filter(Boolean)
    .join(" — ")
/** Whether another participant has the same document, compared as the backend does. */
export function repeatedDocument(participants: PlanningParticipant[]) {
  const key = (participant: PlanningParticipant) =>
    participant.identification_document.trim().toLowerCase()
  const counts = new Map<string, number>()
  for (const participant of participants)
    counts.set(key(participant), (counts.get(key(participant)) ?? 0) + 1)
  return (participant: PlanningParticipant) =>
    !!key(participant) && (counts.get(key(participant)) ?? 0) > 1
}
export const phaseLabel: Record<Phase, string> = {
  before: "Antes del experimento",
  after: "Después del experimento",
}
export const emptyConfig = (): PreExperimentConfig => ({
  participants: [],
  screen: {
    width_px: null,
    height_px: null,
    width_cm: null,
    height_cm: null,
    viewing_distance_cm: null,
    notes: "",
  },
  notes: "",
  questionnaires: {
    before: {
      enabled: false,
      title: "Cuestionario antes del experimento",
      questions: [],
    },
    after: {
      enabled: false,
      title: "Cuestionario después del experimento",
      questions: [],
    },
  },
  project_notes: [],
})
/** Empty screen measures start from Configuración: the resolution and the physical size, each as a pair. */
export function withScreenDefaults(
  config: PreExperimentConfig,
  saved: ScreenSettings | null | undefined
): PreExperimentConfig {
  if (!saved) return config
  const screen = { ...config.screen }
  if (screen.width_px === null && screen.height_px === null) {
    screen.width_px = saved.width_px
    screen.height_px = saved.height_px
  }
  if (screen.width_cm === null && screen.height_cm === null) {
    screen.width_cm = saved.width_cm
    screen.height_cm = saved.height_cm
  }
  return JSON.stringify(screen) === JSON.stringify(config.screen)
    ? config
    : { ...config, screen }
}
/** A note with neither title nor text is not kept. */
export const noteIsEmpty = (note: ProjectNote) => !note.title.trim() && !note.text.trim()
export const withoutEmptyNotes = (config: PreExperimentConfig): PreExperimentConfig => ({
  ...config,
  project_notes: config.project_notes.filter((note) => !noteIsEmpty(note)),
})
/** The screen tab no longer asks for «Notas de pantalla» or «Datos relevantes del experimento»;
 *  text saved there becomes notes of the Notas section. The ids are fixed so a reloaded draft
 *  compares equal, and the text is split at the note's 10 000-character limit. */
const NOTE_LIMIT = 10000
const legacyNotes = (prefix: string, title: string, text: string): ProjectNote[] =>
  Array.from({ length: Math.ceil(text.length / NOTE_LIMIT) }, (_, index) => ({
    id: `${prefix}-${String(index).padStart(12, "0")}`,
    title,
    text: text.slice(index * NOTE_LIMIT, (index + 1) * NOTE_LIMIT),
  }))
export function withLegacyNotes(config: PreExperimentConfig): PreExperimentConfig {
  const screenNotes = config.screen.notes.trim()
  const experimentNotes = config.notes.trim()
  if (!screenNotes && !experimentNotes) return config
  return {
    ...config,
    screen: { ...config.screen, notes: "" },
    notes: "",
    project_notes: [
      ...legacyNotes("5c6e8a10-0d1b-4c4e-8f00", "Notas de pantalla", screenNotes),
      ...legacyNotes("5c6e8a10-0d1b-4c4e-8f01", "Datos relevantes del experimento", experimentNotes),
      ...config.project_notes,
    ],
  }
}
/** A questionnaire exists when it has questions; there is no separate switch to turn it on. */
export function withDerivedQuestionnaires(
  config: PreExperimentConfig
): PreExperimentConfig {
  const defaults = emptyConfig().questionnaires
  const derive = (phase: Phase): Questionnaire => {
    const questionnaire = config.questionnaires[phase]
    return {
      ...questionnaire,
      enabled: questionnaire.questions.length > 0,
      title: questionnaire.title.trim() || defaults[phase].title,
    }
  }
  return {
    ...config,
    questionnaires: { before: derive("before"), after: derive("after") },
  }
}
export function validateParticipants(
  config: PreExperimentConfig
): string | null {
  const isRepeated = repeatedDocument(config.participants)
  for (const participant of config.participants) {
    if (!participant.identification_document.trim())
      return "Escribe el documento de identificación de cada participante."
    if (isRepeated(participant))
      return `Hay dos participantes con el documento ${participant.identification_document.trim()}.`
    if (
      participant.age !== null &&
      (!Number.isInteger(participant.age) ||
        participant.age < 0 ||
        participant.age > 150)
    )
      return "La edad debe ser un entero entre 0 y 150."
  }
  return null
}
export function validateScreen(config: PreExperimentConfig): string | null {
  for (const [key, value] of Object.entries(config.screen)) {
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) ||
        value <= 0 ||
        (key.endsWith("_px") && !Number.isInteger(value)))
    )
      return "Las medidas de pantalla deben ser positivas; los píxeles deben ser enteros."
  }
  return null
}
export function validateQuestionnaire(
  config: PreExperimentConfig,
  phase: Phase
): string | null {
  const questionnaire = config.questionnaires[phase]
  for (const question of questionnaire.questions) {
    if (!question.prompt.trim())
      return `Escribe todas las preguntas de «${phaseLabel[phase]}».`
    if (
      question.type === "multiple_choice" &&
      (question.options.length < 2 ||
        question.options.some((option) => !option.label.trim()))
    )
      return "Cada pregunta de selección múltiple necesita al menos dos opciones completas."
  }
  return null
}
export const missingRequiredAnswer = (
  question: PlanningQuestion,
  answer: Answers[string] | undefined
) =>
  question.required &&
  (answer === undefined ||
    (typeof answer === "string" && !answer.trim()) ||
    (Array.isArray(answer) && !answer.length))
