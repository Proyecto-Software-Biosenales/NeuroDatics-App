"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ProjectsApi, type ApiProject } from "../api/projectsApi"
import { PreExperimentEditor } from "./PreExperimentEditor"
import { QuestionnaireDialog } from "./QuestionnaireDialog"
import { planningError, PreExperimentApi } from "./api"
import {
  phaseLabel,
  validateConfig,
  type PreExperimentConfig,
  type PreExperimentEnvelope,
  type QuestionnaireResponse,
} from "./types"
import { PlanningSection, PlanningSelect } from "./PlanningControls"

function ResponseHistory({
  responses,
}: {
  responses: QuestionnaireResponse[]
}) {
  if (!responses.length)
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay respuestas guardadas.
      </p>
    )
  return (
    <div className="space-y-3">
      {[...responses].reverse().map((response) => (
        <PlanningSection
          key={response.id}
          title={`${response.participant_snapshot.code} — ${response.participant_snapshot.name} · ${phaseLabel[response.phase]} · ${new Date(response.submitted_at).toLocaleString("es-CO")} · Versión ${response.revision}`}
        >
          <div className="mt-3 space-y-3 text-sm">
            <p>{response.questionnaire_snapshot.title}</p>
            <p className="text-muted-foreground">
              Documento:{" "}
              {response.participant_snapshot.identification_document ||
                "Sin dato"}{" "}
              · Género: {response.participant_snapshot.gender || "Sin dato"} ·
              Edad: {response.participant_snapshot.age ?? "Sin dato"}
            </p>
            {response.questionnaire_snapshot.questions.map((question) => {
              const answer = response.answers[question.id]
              const formatted = Array.isArray(answer)
                ? answer
                    .map(
                      (id) =>
                        question.options.find((option) => option.id === id)
                          ?.label || id
                    )
                    .join(", ")
                : typeof answer === "boolean"
                  ? answer
                    ? "Verdadero"
                    : "Falso"
                  : question.type === "multiple_choice" &&
                      typeof answer === "string"
                    ? question.options.find((option) => option.id === answer)
                        ?.label || answer
                    : answer
              return (
                <div key={question.id}>
                  <p className="font-medium break-words">{question.prompt}</p>
                  <p className="break-words whitespace-pre-wrap">
                    {formatted || "Sin respuesta"}
                  </p>
                </div>
              )
            })}
          </div>
        </PlanningSection>
      ))}
    </div>
  )
}

export function PreExperimentSettings() {
  const [projects, setProjects] = useState<ApiProject[]>([])
  const [projectId, setProjectId] = useState("")
  const [saved, setSaved] = useState<PreExperimentEnvelope | null>(null)
  const [draft, setDraft] = useState<PreExperimentConfig | null>(null)
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const loadRequest = useRef<AbortController | null>(null)
  const listGeneration = useRef(0)
  const inFlight = useRef(false)
  const dirty =
    !!saved && !!draft && JSON.stringify(saved.config) !== JSON.stringify(draft)
  const listProjects = useCallback(async () => {
    const generation = ++listGeneration.current
    setLoadingProjects(true)
    setError(null)
    try {
      const result = await ProjectsApi.list()
      if (generation !== listGeneration.current) return
      setProjects(result)
      const requested = new URLSearchParams(window.location.search).get(
        "proyecto"
      )
      setProjectId(
        (current) =>
          current ||
          (result.some((project) => project.id === requested)
            ? requested!
            : result[0]?.id || "")
      )
    } catch (failure) {
      if (generation === listGeneration.current)
        setError(planningError(failure))
    } finally {
      if (generation === listGeneration.current) setLoadingProjects(false)
    }
  }, [])
  const load = useCallback(async (id: string) => {
    loadRequest.current?.abort()
    const controller = new AbortController()
    loadRequest.current = controller
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const result = await PreExperimentApi.get(id, controller.signal)
      if (controller.signal.aborted) return
      setSaved(result)
      setDraft(structuredClone(result.config))
      setConflict(false)
    } catch (failure) {
      if (!controller.signal.aborted) setError(planningError(failure))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])
  useEffect(() => {
    const generationRef = listGeneration
    void listProjects()
    return () => {
      generationRef.current++
      loadRequest.current?.abort()
    }
  }, [listProjects])
  useEffect(() => {
    setSaved(null)
    setDraft(null)
    setConflict(false)
    if (projectId) void load(projectId)
  }, [projectId, load])
  useEffect(() => {
    if (!dirty) return
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", preventUnload)
    return () => window.removeEventListener("beforeunload", preventUnload)
  }, [dirty])
  const save = async () => {
    if (!saved || !draft || inFlight.current || conflict) return
    const validation = validateConfig(draft)
    if (validation) {
      setError(validation)
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await PreExperimentApi.save(
        projectId,
        saved.revision,
        draft
      )
      setSaved(result)
      setDraft(structuredClone(result.config))
      setNotice("Información y cuestionarios guardados.")
    } catch (failure) {
      setError(planningError(failure))
      setConflict(
        typeof failure === "object" &&
          failure !== null &&
          "status" in failure &&
          failure.status === 409
      )
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  const download = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const payload = await PreExperimentApi.export(projectId)
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        })
      )
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
  const submitted = (response: QuestionnaireResponse) => {
    // The POST result is authoritative. Avoid a second request that could obscure a successful save.
    setSaved((current) =>
      current
        ? { ...current, responses: [...current.responses, response] }
        : current
    )
  }
  const canAnswer =
    !!saved?.config.participants.length &&
    (["before", "after"] as const).some(
      (phase) => saved?.config.questionnaires[phase].enabled
    )
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pre-experimento y cuestionarios</CardTitle>
        <CardDescription>
          Organiza participantes, información de pantalla y preguntas antes de
          tener una carpeta. También puedes completar esta información en
          proyectos existentes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Label className="block space-y-1 text-sm">
          Proyecto
          <PlanningSelect
            label="Proyecto"
            placeholder="Seleccionar proyecto"
            disabled={loadingProjects || loading || busy || dirty || answering}
            value={projectId}
            onChange={setProjectId}
            options={projects.map((project) => ({
              value: project.id,
              label: project.name,
            }))}
          />
        </Label>
        {loadingProjects && (
          <p role="status" className="text-sm">
            Cargando proyectos…
          </p>
        )}
        {!loadingProjects && !projects.length && !error && (
          <p className="text-sm text-muted-foreground">
            Crea primero un proyecto desde «Proyectos», con la opción
            Pre-experimento.
          </p>
        )}
        {loading && (
          <p role="status" className="text-sm">
            Cargando pre-experimento…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!loadingProjects && !projects.length && error && (
          <Button variant="outline" onClick={() => void listProjects()}>
            Reintentar carga de proyectos
          </Button>
        )}
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
        {projectId && !loading && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || answering}
              onClick={() => {
                if (saved) setDraft(structuredClone(saved.config))
                void load(projectId)
              }}
            >
              {dirty ? "Descartar cambios y recargar" : "Recargar información"}
            </Button>
          </div>
        )}
        {saved && draft && !loading && (
          <>
            <p className="text-sm text-muted-foreground">
              Versión guardada: {saved.revision}. Los datos de planificación
              permanecen separados de los participantes detectados al agregar
              una carpeta.
            </p>
            {dirty && (
              <p
                role="status"
                className="text-sm text-amber-700 dark:text-amber-400"
              >
                Hay cambios sin guardar. Guarda o descarta los cambios antes de
                cambiar de proyecto o responder.
              </p>
            )}
            <PreExperimentEditor
              value={draft}
              onChange={(value) => {
                setDraft(value)
                setNotice(null)
              }}
              disabled={busy || answering}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || !dirty || conflict || answering}
                onClick={() => void save()}
              >
                {busy ? "Guardando…" : "Guardar información y cuestionarios"}
              </Button>
              <Button
                variant="outline"
                disabled={busy || dirty || !canAnswer || answering || conflict}
                onClick={() => setAnswering(true)}
              >
                Responder cuestionario
              </Button>
            </div>
            {!canAnswer && (
              <p className="text-sm text-muted-foreground">
                Para responder, guarda al menos un participante y un
                cuestionario habilitado con preguntas.
              </p>
            )}
            <div className="space-y-3 border-t pt-4">
              <h3 className="font-medium">
                Historial de respuestas ({saved.responses.length})
              </h3>
              <p className="text-sm text-muted-foreground">
                Cada respuesta conserva las preguntas y el participante de ese
                momento, aunque después los edites o elimines. Puedes responder
                varias veces.
              </p>
              <ResponseHistory responses={saved.responses} />
              <Button
                variant="outline"
                disabled={busy || dirty || answering}
                onClick={() => void download()}
              >
                Descargar información y respuestas (JSON)
              </Button>
            </div>
          </>
        )}
        {answering && saved && (
          <QuestionnaireDialog
            projectId={projectId}
            saved={saved}
            onClose={() => setAnswering(false)}
            onSubmitted={submitted}
          />
        )}
      </CardContent>
    </Card>
  )
}
