"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError } from "@/lib/api/apiFetch"
import { ProjectsApi, type ApiProjectDetail } from "@/features/projects/api/projectsApi"
import {
  participantDataFromApi,
  participantToApi,
  type ParticipantData,
  type scenaries,
} from "@/features/projects/create-project/types"
import { serializeAoisForComparison, serializeScenaryAois } from "@/features/projects/create-project/aoiUtils"
import { PreExperimentApi, planningError } from "@/features/projects/pre-experiment/api"
import { newPlanningParticipant, type ParticipantFields } from "@/features/projects/pre-experiment/PlanningParticipants"
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
import {
  assignedParticipant,
  linkParticipants,
  mirroredParticipant,
  repeatedDocuments,
  type ParticipantLinks,
} from "./participants"
import { extractProjectNameAndId, parseScenaries, toParticipantSex } from "./projectDetail"
import { describeFailure } from "../projectErrors"

export type EditorSection =
  | "project"
  | "participants"
  | "questionnaires"
  | "screen"
  | "aois"
  | "notes"

/** What the project holds apart from its preparation: its name and, once it has a folder, what was read from it. */
type ProjectData = {
  name: string
  description: string
  participants: ParticipantData[]
  scenaries: scenaries[]
}

const emptyData: ProjectData = { name: "", description: "", participants: [], scenaries: [] }

// Older saves could keep questions in a questionnaire switched off; the editor treats questions as switched on.
const savedDraft = (envelope: PreExperimentEnvelope) => withDerivedQuestionnaires(structuredClone(envelope.config))

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
  const [links, setLinks] = useState<ParticipantLinks>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const request = useRef<AbortController | null>(null)
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError(null)
    setConflict(false)
    try {
      const [project, envelope] = await Promise.all([
        ProjectsApi.get(projectId, controller.signal),
        PreExperimentApi.get(projectId, controller.signal),
      ])
      if (controller.signal.aborted) return
      const next: ProjectData = {
        name: extractProjectNameAndId(project.name || "").name,
        description: project.description || "",
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
      setLinks(project.is_pre_experiment === true ? {} : linkParticipants(next.participants, envelope.config.participants))
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
  }, [projectId])

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
  const participantsChanged = hasData && !sameParticipants(baseline.participants, data.participants)
  const aoisChanged =
    hasData && serializeAoisForComparison(baseline.scenaries) !== serializeAoisForComparison(data.scenaries)
  const dirty =
    metadataChanged || planningDirty || participantsChanged || aoisChanged

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
  const updateAois = (scenaryId: string, aois: scenaries["aois"]) =>
    setData((previous) => ({
      ...previous,
      scenaries: previous.scenaries.map((scenary) => (scenary.id === scenaryId ? { ...scenary, aois } : scenary)),
    }))
  const changePlanning = (next: PreExperimentConfig) => {
    setPlanning(next)
    setError(null)
  }
  /** Edits a participant read from the data; the preparation's copy of it, if any, stays equal. Notes live only
   *  in the preparation, so the first note of a participant without a copy creates it. */
  const updateRecordedParticipant = (code: string, change: Partial<ParticipantFields>) => {
    const current = data.participants.find((participant) => participant.id === code)
    if (!current || !planning) return
    const next: ParticipantData = {
      ...current,
      ...(change.name !== undefined && { name: change.name }),
      ...(change.document !== undefined && { document: change.document }),
      ...(change.sex !== undefined && { sex: toParticipantSex(change.sex) }),
      ...(change.age !== undefined && { age: change.age }),
    }
    setData((previous) => ({
      ...previous,
      participants: previous.participants.map((participant) => (participant.id === code ? next : participant)),
    }))
    const linked = links[code]
    const notes = change.notes !== undefined ? { notes: change.notes } : {}
    if (linked)
      changePlanning({
        ...planning,
        participants: planning.participants.map((item) =>
          item.id === linked ? { ...item, ...mirroredParticipant(next), ...notes } : item
        ),
      })
    else if (change.notes) {
      const created = { ...newPlanningParticipant(), ...mirroredParticipant(next), notes: change.notes }
      setLinks((previous) => ({ ...previous, [code]: created.id }))
      changePlanning({ ...planning, participants: [...planning.participants, created] })
    }
  }

  /** Pairs a participant of the preparation with one read from the data that has no pair yet: the one of the data
   *  takes its document and details, and from then on both are one card. */
  const assignParticipant = (plannedId: string, code: string) => {
    const planned = planning?.participants.find((item) => item.id === plannedId)
    const current = data.participants.find((participant) => participant.id === code)
    if (!planning || !planned || !current || links[code] || Object.values(links).includes(plannedId)) return
    const next = assignedParticipant(current, planned)
    setData((previous) => ({
      ...previous,
      participants: previous.participants.map((participant) => (participant.id === code ? next : participant)),
    }))
    setLinks((previous) => ({ ...previous, [code]: plannedId }))
    changePlanning({
      ...planning,
      participants: planning.participants.map((item) =>
        item.id === plannedId ? { ...item, ...mirroredParticipant(next) } : item
      ),
    })
  }

  const repeatedDocument = planning ? repeatedDocuments(data.participants, planning.participants, links).first : null
  const participantsProblem =
    hasData && !hasValidParticipants(data.participants)
      ? "Completa sexo y edad de los participantes leídos de los datos."
      : repeatedDocument
        ? `Hay dos participantes con el documento ${repeatedDocument}.`
        : planning
          ? validateParticipants(planning)
          : null

  /** What keeps each section from being saved as it is; null when it can be saved. */
  const problems: Record<EditorSection, string | null> = {
    project: data.name.trim() ? null : "Escribe el nombre del proyecto.",
    participants: participantsProblem,
    questionnaires: planning
      ? (validateQuestionnaire(planning, "before") ?? validateQuestionnaire(planning, "after"))
      : null,
    screen: planning ? validateScreen(planning) : null,
    aois: null,
    notes: null,
  }
  /** The first section to fix, in the order of the tabs. */
  const validate = (): { section: EditorSection; message: string } | null => {
    const order: EditorSection[] = ["project", "participants", "questionnaires", "screen"]
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
      if (participantsChanged) {
        await ProjectsApi.setParticipants(projectId, data.participants.map(participantToApi))
        setBaseline((previous) => ({ ...previous, participants: structuredClone(data.participants) }))
      }
      if (aoisChanged) {
        await ProjectsApi.setAois(projectId, serializeScenaryAois(data.scenaries))
        setBaseline((previous) => ({ ...previous, scenaries: structuredClone(data.scenaries) }))
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
    updateRecordedParticipant,
    assignParticipant,
    updateAois,
    envelope: saved,
    planning,
    planningDirty,
    changePlanning,
    links,
    problems,
    validate,
    save,
    load,
    answered,
    download,
  }
}
