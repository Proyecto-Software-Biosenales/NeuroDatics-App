/** What the planning of a project holds, counted the same way wherever its sections are listed. */
import { noteIsEmpty, type PreExperimentConfig } from "./types"

export const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

export const hasScreenData = (config: PreExperimentConfig) =>
  !!config.notes.trim() ||
  Object.values(config.screen).some((value) =>
    typeof value === "string" ? !!value.trim() : value !== null
  )

export const noteCount = (config: PreExperimentConfig) =>
  config.project_notes.filter((note) => !noteIsEmpty(note)).length

export const questionCount = (config: PreExperimentConfig) =>
  (["before", "after"] as const).reduce((total, phase) => total + config.questionnaires[phase].questions.length, 0)
