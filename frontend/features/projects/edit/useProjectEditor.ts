"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError } from "@/lib/api/apiFetch"
import { ProjectsApi, type ApiProjectDetail } from "@/features/projects/api/projectsApi"
import type { SensorType } from "@/features/projects/types"
import {
  participantDataFromApi,
  participantToApi,
  type ParticipantData,
  type ParticipantField,
  type scenaries,
} from "@/features/projects/create-project/types"
import { serializeAoisForComparison, serializeScenaryAois } from "@/features/projects/create-project/aoiUtils"
import { PreExperimentApi, planningError } from "@/features/projects/pre-experiment/api"
import {
  validateParticipants,
  validateQuestionnaire,
  validateScreen,
  withDerivedQuestionnaires,
  withoutEmptyNotes,
  withScreenDefaults,
  type PreExperimentConfig,
  type PreExperimentEnvelope,
  type QuestionnaireResponse,
} from "@/features/projects/pre-experiment/types"
import { useScreenSettings } from "@/features/settings/screenSettings"
import { describeFailure, extractProjectNameAndId, parseScenaries, toParticipantSex } from "./projectDetail"
import { useFolderReplacement } from "./useFolderReplacement"

export type EditorSection =
  | "project"
  | "participants"
  | "questionnaires"
  | "screen"
  | "devices"
  | "aois"
  | "notes"
  | "data"

/** What the project holds apart from its preparation: its name and, once it has a folder, what was read from it. */
type ProjectData = {
  name: string
  description: string
  sensors: SensorType[]
  participants: ParticipantData[]
  scenaries: scenaries[]
}

const emptyData: ProjectData = { name: "", description: "", sensors: [], participants: [], scenaries: [] }

// Older saves could keep questions in a questionnaire switched off; the editor treats questions as switched on.
const savedDraft = (envelope: PreExperimentEnvelope) => withDerivedQuestionnaires(structuredClone(envelope.config))

const sameSensors = (a: SensorType[], b: SensorType[]) => a.length === b.length && a.every((sensor) => b.includes(sensor))

const sameParticipants = (a: ParticipantData[], b: ParticipantData[]) =>
  a.length === b.length &&
  a.every((participant, index) => {
    const other = b[index]
    return (
      participant.id === other.id &&
      participant.age === other.age &&
      participant.sex === other.sex &&
      participant.name.trim() === other.name.trim() &&
      participant.document.trim() === other.document.trim()
    )
  })

const hasValidParticipants = (participants: ParticipantData[]) =>
  participants.length > 0 &&
  participants.every((participant) => {
    const age = Number(participant.age)
    return (
      participant.id.trim() !== "" &&
      (participant.sex === "male" || participant.sex === "female" || participant.sex === "other") &&
      participant.age.trim() !== "" &&
      Number.isFinite(age) &&
      age > 0
    )
  })

/** Everything the project editor shows and saves: the project, what was read from its folder, and its preparation. */
export function useProjectEditor(projectId: string) {
  const globalScreen = useScreenSettings()?.screen
  const [detail, setDetail] = useState<ApiProjectDetail | null>(null)
  const [baseline, setBaseline] = useState<ProjectData>(emptyData)
  const [data, setData] = useState<ProjectData>(emptyData)
  const [saved, setSaved] = useState<PreExperimentEnvelope | null>(null)
  const [planning, setPlanning] = useState<PreExperimentConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const request = useRef<AbortController | null>(null)
  const inFlight = useRef(false)
  const finalized = useRef(false)

  const folder = useFolderReplacement({
    projectId,
    participants: data.participants,
    saveMetadata: async () => {
      if (data.name.trim() === baseline.name.trim() && data.description.trim() === baseline.description.trim()) return
      await ProjectsApi.update(projectId, { name: data.name.trim(), description: data.description.trim() })
      setBaseline((previous) => ({ ...previous, name: data.name, description: data.description }))
    },
    onProcessed: (processed) =>
      setData((previous) => ({
        ...previous,
        sensors: processed.sensors,
        participants: processed.participants,
        scenaries: processed.scenaries,
      })),
  })
  const resetFolder = folder.reset

  const load = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError(null)
    setConflict(false)
    finalized.current = false
    try {
      const [project, envelope] = await Promise.all([
        ProjectsApi.get(projectId, controller.signal),
        PreExperimentApi.get(projectId, controller.signal),
      ])
      if (controller.signal.aborted) return
      const next: ProjectData = {
        name: extractProjectNameAndId(project.name || "").name,
        description: project.description || "",
        sensors: (project.sensors || []).map((sensor) => sensor.sensor_type) as SensorType[],
        participants: (project.participants || []).map((participant) =>
          participantDataFromApi(participant, toParticipantSex(participant.sex))
        ),
        scenaries: parseScenaries(project),
      }
      setDetail(project)
      setBaseline(structuredClone(next))
      setData(next)
      setSaved(envelope)
      setPlanning(savedDraft(envelope))
      resetFolder(project)
    } catch (failure) {
      if (controller.signal.aborted) return
      setError(
        failure instanceof ApiError && failure.status === 404
          ? "No se encontró este proyecto. Ábrelo desde su tarjeta en «Proyectos»."
          : planningError(failure)
      )
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [projectId, resetFolder])

  useEffect(() => {
    void load()
    return () => request.current?.abort()
  }, [load])

  // Empty screen measures show the ones saved in Configuración, which arrive on their own;
  // filling them is not a change of the person's.
  useEffect(() => {
    setPlanning((current) => current && withScreenDefaults(current, globalScreen))
  }, [globalScreen, saved])

  const hasData = !!detail && detail.is_pre_experiment !== true
  const planningDirty =
    !!saved &&
    !!planning &&
    JSON.stringify(withScreenDefaults(savedDraft(saved), globalScreen)) !==
      JSON.stringify(withScreenDefaults(planning, globalScreen))
  const metadataChanged =
    data.name.trim() !== baseline.name.trim() || data.description.trim() !== baseline.description.trim()
  const sensorsChanged = hasData && !sameSensors(baseline.sensors, data.sensors)
  const participantsChanged = hasData && !sameParticipants(baseline.participants, data.participants)
  const aoisChanged =
    hasData && serializeAoisForComparison(baseline.scenaries) !== serializeAoisForComparison(data.scenaries)
  const dirty =
    metadataChanged || planningDirty || sensorsChanged || participantsChanged || aoisChanged || folder.processed

  useEffect(() => {
    if (!dirty) return
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", preventUnload)
    return () => window.removeEventListener("beforeunload", preventUnload)
  }, [dirty])

  const setName = (name: string) => setData((previous) => ({ ...previous, name }))
  const setDescription = (description: string) => setData((previous) => ({ ...previous, description }))
  const toggleSensor = (sensor: SensorType) =>
    setData((previous) => ({
      ...previous,
      sensors: previous.sensors.includes(sensor)
        ? previous.sensors.filter((item) => item !== sensor)
        : [...previous.sensors, sensor],
    }))
  const updateParticipant = (id: string, field: ParticipantField, value: string) =>
    setData((previous) => ({
      ...previous,
      participants: previous.participants.map((participant) =>
        participant.id === id ? { ...participant, [field]: value } : participant
      ),
    }))
  const updateAois = (scenaryId: string, aois: scenaries["aois"]) =>
    setData((previous) => ({
      ...previous,
      scenaries: previous.scenaries.map((scenary) => (scenary.id === scenaryId ? { ...scenary, aois } : scenary)),
    }))
  const changePlanning = (next: PreExperimentConfig) => {
    setPlanning(next)
    setError(null)
  }

  // The two participant lists are checked apart, so the editor can open the one to fix.
  const planningParticipantsProblem = planning ? validateParticipants(planning) : null
  const experimentParticipantsProblem =
    hasData && !hasValidParticipants(data.participants)
      ? "Completa sexo y edad de todos los participantes del experimento."
      : null

  /** What keeps each section from being saved as it is; null when it can be saved. */
  const problems: Record<EditorSection, string | null> = {
    project: data.name.trim() ? null : "Escribe el nombre del proyecto.",
    participants: experimentParticipantsProblem ?? planningParticipantsProblem,
    questionnaires: planning
      ? (validateQuestionnaire(planning, "before") ?? validateQuestionnaire(planning, "after"))
      : null,
    screen: planning ? validateScreen(planning) : null,
    devices: hasData && data.sensors.length === 0 ? "Selecciona al menos un dispositivo." : null,
    aois: null,
    notes: null,
    data: null,
  }
  /** The first section to fix, in the order of the tabs. */
  const validate = (): { section: EditorSection; message: string } | null => {
    const order: EditorSection[] = ["project", "participants", "questionnaires", "screen", "devices"]
    const section = order.find((item) => problems[item])
    return section ? { section, message: problems[section] as string } : null
  }

  /** Saves what changed, each part once: a part that went through is not sent again if a later one fails. */
  const save = async (): Promise<boolean> => {
    if (!saved || !planning || inFlight.current || conflict || !dirty) return false
    inFlight.current = true
    setBusy(true)
    setError(null)
    // Only the preparation is saved against a revision; a 409 from the project itself (a repeated name) is not a conflict.
    let savingPlanning = false
    try {
      if (metadataChanged) {
        await ProjectsApi.update(projectId, { name: data.name.trim(), description: data.description.trim() })
        setBaseline((previous) => ({ ...previous, name: data.name, description: data.description }))
      }
      if (sensorsChanged) {
        await ProjectsApi.setSensors(projectId, data.sensors as string[])
        setBaseline((previous) => ({ ...previous, sensors: data.sensors }))
      }
      if (participantsChanged) {
        await ProjectsApi.setParticipants(projectId, data.participants.map(participantToApi))
        setBaseline((previous) => ({ ...previous, participants: structuredClone(data.participants) }))
      }
      if (aoisChanged) {
        await ProjectsApi.setAois(projectId, serializeScenaryAois(data.scenaries))
        setBaseline((previous) => ({ ...previous, scenaries: structuredClone(data.scenaries) }))
      }
      // Finalize only when a new experiment folder was uploaded, and once even if a later part fails.
      if (folder.processed && !finalized.current) {
        await ProjectsApi.finalize(projectId)
        finalized.current = true
      }
      if (planningDirty) {
        savingPlanning = true
        const result = await PreExperimentApi.save(projectId, saved.revision, withoutEmptyNotes(planning))
        setSaved(result)
        setPlanning(savedDraft(result))
      }
      await load()
      return true
    } catch (failure) {
      const conflicted = savingPlanning && failure instanceof ApiError && failure.status === 409
      const { cancelled, message } = describeFailure(failure)
      setError(conflicted ? planningError(failure) : cancelled ? null : message)
      setConflict(conflicted)
      return false
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const answered = (response: QuestionnaireResponse) =>
    // The POST result is authoritative; a second request could obscure a successful save.
    setSaved((current) => (current ? { ...current, responses: [...current.responses, response] } : current))

  const download = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const payload = await PreExperimentApi.export(projectId)
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }))
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `pre-experimento-${projectId}.json`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) {
      setError(planningError(failure))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return {
    detail,
    hasData,
    loading,
    busy,
    error,
    setError,
    conflict,
    dirty,
    /** The project as saved: the header keeps showing it while the name is being edited. */
    saved: baseline,
    data,
    setName,
    setDescription,
    toggleSensor,
    updateParticipant,
    updateAois,
    envelope: saved,
    planning,
    planningDirty,
    changePlanning,
    folder,
    problems,
    planningParticipantsProblem,
    validate,
    save,
    load,
    answered,
    download,
  }
}
