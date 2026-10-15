"use client"
import { useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Check,
  ClipboardList,
  Cpu,
  FileText,
  FolderOpen,
  Info,
  Monitor,
  NotebookPen,
  Shapes,
  UsersRound,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { CreateProjectStep2 } from "@/features/projects/create-project/CreateProjectStep2"
import { CreateProjectStep3 } from "@/features/projects/create-project/CreateProjectStep3"
import { CreateProjectStep4 } from "@/features/projects/create-project/CreateProjectStep4"
import { SectionTabs, type SectionTab } from "@/features/projects/components/SectionTabs"
import { SubTabs } from "@/features/projects/components/SubTabs"
import { PlanningNotes } from "@/features/projects/pre-experiment/PlanningNotes"
import { PlanningParticipants } from "@/features/projects/pre-experiment/PlanningParticipants"
import { PlanningQuestionnaires, type QuestionnaireView } from "@/features/projects/pre-experiment/PlanningQuestionnaires"
import { PlanningScreen } from "@/features/projects/pre-experiment/PlanningScreen"
import { QuestionnaireDialog } from "@/features/projects/pre-experiment/QuestionnaireDialog"
import { QuestionnaireResponses } from "@/features/projects/pre-experiment/QuestionnaireResponses"
import { hasScreenData, noteCount, plural, questionCount } from "@/features/projects/pre-experiment/summary"
import { validateQuestionnaire, type Phase } from "@/features/projects/pre-experiment/types"
import { ProjectDataSection } from "./ProjectDataSection"
import { useProjectEditor, type EditorSection } from "./useProjectEditor"

type ParticipantsView = "experiment" | "questionnaires"

/** One project, whether it only has its preparation or already has its folder: the sections change, the page does not. */
export function ProjectEditor({ projectId }: { projectId: string }) {
  const editor = useProjectEditor(projectId)
  const [section, setSection] = useState<EditorSection>("project")
  const [phase, setPhase] = useState<QuestionnaireView>("before")
  const [participantsView, setParticipantsView] = useState<ParticipantsView>("experiment")
  const [attempted, setAttempted] = useState(false)
  const [answering, setAnswering] = useState(false)
  const { data, planning, envelope, hasData, folder } = editor
  const locked = editor.busy || folder.processing

  const save = async () => {
    const invalid = editor.validate()
    if (invalid) {
      setAttempted(true)
      editor.setError(invalid.message)
      setSection(invalid.section)
      if (invalid.section === "participants")
        setParticipantsView(invalid.message === editor.planningParticipantsProblem ? "questionnaires" : "experiment")
      if (invalid.section === "questionnaires")
        setPhase(planning && validateQuestionnaire(planning, "before") ? "before" : "after")
      return
    }
    setAttempted(false)
    if (await editor.save()) toast.success("Cambios guardados.")
  }

  if (editor.loading && !editor.detail)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Cargando el proyecto…
      </p>
    )
  if (!editor.detail || !planning || !envelope)
    return (
      <div className="space-y-4">
        {editor.error && (
          <p role="alert" className="text-sm text-destructive">
            {editor.error}
          </p>
        )}
        <Button type="button" variant="outline" onClick={() => void editor.load()}>
          Reintentar
        </Button>
      </div>
    )

  const aoiCount = data.scenaries.reduce((total, scenary) => total + scenary.aois.length, 0)
  const canAnswer =
    !!envelope.config.participants.length &&
    (["before", "after"] as const).some((item) => envelope.config.questionnaires[item].enabled)
  const participantCount = hasData ? data.participants.length + planning.participants.length : planning.participants.length

  const tabs: SectionTab[] = [
    { id: "project", label: "Proyecto", icon: FileText, invalid: attempted && !!editor.problems.project },
    {
      id: "participants",
      label: "Participantes",
      icon: UsersRound,
      filled: participantCount > 0,
      invalid: attempted && !!editor.problems.participants,
      status: participantCount ? plural(participantCount, "participante", "participantes") : null,
    },
    {
      id: "questionnaires",
      label: "Cuestionarios",
      icon: ClipboardList,
      filled: questionCount(planning) > 0,
      invalid: attempted && !!editor.problems.questionnaires,
      status: questionCount(planning) ? plural(questionCount(planning), "pregunta", "preguntas") : null,
    },
    {
      id: "screen",
      label: "Pantalla",
      icon: Monitor,
      filled: hasScreenData(planning),
      invalid: attempted && !!editor.problems.screen,
      status: hasScreenData(planning) ? "Con datos" : null,
    },
    ...(hasData
      ? ([
          {
            id: "devices",
            label: "Dispositivos",
            icon: Cpu,
            filled: data.sensors.length > 0,
            invalid: attempted && !!editor.problems.devices,
            status: data.sensors.length ? plural(data.sensors.length, "dispositivo", "dispositivos") : null,
          },
          {
            id: "aois",
            label: "Áreas de interés",
            icon: Shapes,
            filled: aoiCount > 0,
            status: aoiCount ? plural(aoiCount, "área", "áreas") : null,
          },
        ] satisfies SectionTab[])
      : []),
    {
      id: "notes",
      label: "Notas",
      icon: NotebookPen,
      filled: noteCount(planning) > 0,
      status: noteCount(planning) ? plural(noteCount(planning), "nota", "notas") : null,
    },
    ...(hasData ? [{ id: "data", label: "Carpeta", icon: FolderOpen, filled: folder.processed } satisfies SectionTab] : []),
  ]

  return (
    <div>
      <div className="app-page-header">
        <div className="min-w-0">
          <h1 className="app-page-title break-words">{editor.saved.name}</h1>
          {editor.saved.description && <p className="app-page-description">{editor.saved.description}</p>}
        </div>
        <Button asChild variant="outline">
          <Link href="/proyectos">
            <ArrowLeft aria-hidden />
            Volver a proyectos
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-5 pt-(--card-spacing)">
          <Tabs value={section} onValueChange={(next) => setSection(next as EditorSection)} className="gap-5">
            <SectionTabs label="Secciones del proyecto" tabs={tabs} disabled={locked} />

            <fieldset disabled={locked} className="min-w-0">
              <legend className="sr-only">{tabs.find((tab) => tab.id === section)?.label}</legend>

              <TabsContent value="project" className="space-y-5">
                <div className="space-y-4">
                  <Label className="block space-y-1.5 text-sm">
                    <span>Nombre del proyecto *</span>
                    <Input
                      value={data.name}
                      aria-invalid={attempted && !!editor.problems.project}
                      onChange={(event) => editor.setName(event.target.value)}
                    />
                  </Label>
                  <Label className="block space-y-1.5 text-sm">
                    <span>Descripción</span>
                    <Textarea value={data.description} onChange={(event) => editor.setDescription(event.target.value)} />
                  </Label>
                </div>
                {!hasData && (
                  <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
                    <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    No necesitas los datos todavía. Cuando tengas las grabaciones, agrega la carpeta desde la tarjeta
                    del proyecto.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="participants">
                {hasData ? (
                  <Tabs
                    value={participantsView}
                    onValueChange={(next) => setParticipantsView(next as ParticipantsView)}
                    className="gap-4"
                  >
                    <SubTabs
                      label="Registro de participantes"
                      disabled={locked}
                      tabs={[
                        { id: "experiment", label: "Del experimento", count: data.participants.length, unit: "participantes" },
                        { id: "questionnaires", label: "Para cuestionarios", count: planning.participants.length, unit: "participantes" },
                      ]}
                    />
                    <TabsContent value="experiment">
                      <CreateProjectStep3
                        hideTitle
                        participants={data.participants}
                        onUpdateParticipant={editor.updateParticipant}
                      />
                    </TabsContent>
                    <TabsContent value="questionnaires">
                      <PlanningParticipants value={planning} onChange={editor.changePlanning} />
                    </TabsContent>
                  </Tabs>
                ) : (
                  <PlanningParticipants value={planning} onChange={editor.changePlanning} />
                )}
              </TabsContent>

              <TabsContent value="questionnaires">
                <PlanningQuestionnaires
                  value={planning}
                  onChange={editor.changePlanning}
                  view={phase}
                  onViewChange={setPhase}
                  invalidPhases={(["before", "after"] as Phase[]).filter(
                    (item) => attempted && !!validateQuestionnaire(planning, item)
                  )}
                  disabled={locked}
                  responses={{
                    count: envelope.responses.length,
                    content: (
                      <QuestionnaireResponses
                        saved={envelope}
                        canAnswer={canAnswer}
                        dirty={editor.dirty}
                        busy={locked}
                        onAnswer={() => setAnswering(true)}
                        onDownload={() => void editor.download()}
                      />
                    ),
                  }}
                />
              </TabsContent>

              <TabsContent value="screen">
                <PlanningScreen value={planning} onChange={editor.changePlanning} />
              </TabsContent>

              {hasData && (
                <>
                  <TabsContent value="devices">
                    <CreateProjectStep2 hideTitle selectedSensors={data.sensors} onToggleSensor={editor.toggleSensor} />
                  </TabsContent>
                  <TabsContent value="aois">
                    <CreateProjectStep4 hideTitle scenaries={data.scenaries} onScenaryAoisChange={editor.updateAois} />
                  </TabsContent>
                </>
              )}

              <TabsContent value="notes">
                <PlanningNotes value={planning} onChange={editor.changePlanning} />
              </TabsContent>

              {hasData && (
                <TabsContent value="data">
                  <ProjectDataSection folder={folder} name={data.name} description={data.description} />
                </TabsContent>
              )}
            </fieldset>
          </Tabs>

          {editor.error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {editor.error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-end">
            {editor.dirty && (
              <p role="status" className="text-sm text-amber-700 sm:mr-auto dark:text-amber-400">
                Hay cambios sin guardar.
              </p>
            )}
            {(editor.dirty || editor.conflict) && (
              <Button type="button" variant="outline" disabled={locked} onClick={() => void editor.load()}>
                Descartar cambios
              </Button>
            )}
            <Button type="button" disabled={locked || !editor.dirty || editor.conflict} onClick={() => void save()}>
              <Check aria-hidden />
              {editor.busy ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {answering && (
        <QuestionnaireDialog
          projectId={projectId}
          saved={envelope}
          onClose={() => setAnswering(false)}
          onSubmitted={editor.answered}
        />
      )}
    </div>
  )
}
