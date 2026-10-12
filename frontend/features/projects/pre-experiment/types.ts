export type Phase = "before" | "after"
export type PlanningParticipant = {
  id: string
  code: string
  name: string
  identification_document: string
  gender: string
  age: number | null
  notes: string
}
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
    model: string
    width_px: number | null
    height_px: number | null
    width_cm: number | null
    height_cm: number | null
    viewing_distance_cm: number | null
    notes: string
  }
  notes: string
  questionnaires: Record<Phase, Questionnaire>
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
export const phaseLabel: Record<Phase, string> = {
  before: "Antes del experimento",
  after: "Después del experimento",
}
export const emptyConfig = (): PreExperimentConfig => ({
  participants: [],
  screen: {
    model: "",
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
})
export function validateConfig(config: PreExperimentConfig): string | null {
  return (
    validateParticipants(config) ??
    validateScreen(config) ??
    validateQuestionnaires(config)
  )
}
export function validateParticipants(
  config: PreExperimentConfig
): string | null {
  const codes = new Set<string>()
  for (const participant of config.participants) {
    if (!participant.code.trim() || !participant.name.trim())
      return "Completa el código y el nombre de cada participante."
    if (codes.has(participant.code.trim().toLowerCase()))
      return "Usa un código distinto para cada participante."
    codes.add(participant.code.trim().toLowerCase())
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
export function validateQuestionnaires(
  config: PreExperimentConfig
): string | null {
  return (
    validateQuestionnaire(config, "before") ??
    validateQuestionnaire(config, "after")
  )
}
export function validateQuestionnaire(
  config: PreExperimentConfig,
  phase: Phase
): string | null {
  const questionnaire = config.questionnaires[phase]
  if (!questionnaire.title.trim())
    return `Completa el título en «${phaseLabel[phase]}».`
  if (questionnaire.enabled && !questionnaire.questions.length)
    return `Añade una pregunta en «${phaseLabel[phase]}».`
  for (const question of questionnaire.questions) {
    if (!question.prompt.trim())
      return "Escribe el enunciado de todas las preguntas, incluidas las conservadas en cuestionarios deshabilitados."
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
