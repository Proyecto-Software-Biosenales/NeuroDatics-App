"use client"
import { useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Check,
  ClipboardList,
  FileText,
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
import { CreateProjectStep4 } from "@/features/projects/create-project/CreateProjectStep4"
import { SectionTabs, type SectionTab } from "@/features/projects/components/SectionTabs"
import { PlanningNotes } from "@/features/projects/pre-experiment/PlanningNotes"
import { PlanningQuestionnaires, type QuestionnaireView } from "@/features/projects/pre-experiment/PlanningQuestionnaires"
import { PlanningScreen } from "@/features/projects/pre-experiment/PlanningScreen"
import { QuestionnaireDialog } from "@/features/projects/pre-experiment/QuestionnaireDialog"
import { QuestionnaireResponses } from "@/features/projects/pre-experiment/QuestionnaireResponses"
import { validateQuestionnaire, type Phase } from "@/features/projects/pre-experiment/types"
import { ProjectParticipants } from "./ProjectParticipants"
import { useProjectEditor, type EditorSection } from "./useProjectEditor"

/** One project, whether it only has its preparation or already has its folder: the sections change, the page does not. */
export function ProjectEditor({ projectId }: { projectId: string }) {
  const editor = useProjectEditor(projectId)
  const [section, setSection] = useState<EditorSection>("project")
  const [phase, setPhase] = useState<QuestionnaireView>("before")
  const [attempted, setAttempted] = useState(false)
  // Which questionnaire is being answered: one of them, or "any" to choose it in the dialog.
  const [answering, setAnswering] = useState<Phase | "any" | null>(null)
  const { data, planning, envelope, hasData } = editor
  const locked = editor.busy

  const save = async () => {
    const invalid = editor.validate()
    if (invalid) {
      setAttempted(true)
      editor.setError(invalid.message)
      setSection(invalid.section)
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

  const canAnswer =
    !!envelope.config.participants.length &&
    (["before", "after"] as const).some((item) => envelope.config.questionnaires[item].enabled)
  // Answering works on the saved project, as in the responses tab.
  const answerBlocked = (item: Phase) =>
    editor.dirty || !envelope.config.questionnaires[item].enabled
      ? "Guarda los cambios para responder."
      : !envelope.config.participants.length
        ? "Para responder, agrega un participante y guarda."
        : null

  const tabs: SectionTab[] = [
    { id: "project", label: "Proyecto", icon: FileText, invalid: attempted && !!editor.problems.project },
    { id: "participants", label: "Participantes", icon: UsersRound, invalid: attempted && !!editor.problems.participants },
    {
      id: "questionnaires",
      label: "Cuestionarios",
      icon: ClipboardList,
      invalid: attempted && !!editor.problems.questionnaires,
    },
    { id: "screen", label: "Pantalla", icon: Monitor, invalid: attempted && !!editor.problems.screen },
    ...(hasData ? [{ id: "aois", label: "Áreas de interés", icon: Shapes } satisfies SectionTab] : []),
    { id: "notes", label: "Notas", icon: NotebookPen },
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
                <ProjectParticipants
                  recorded={data.participants}
                  planning={planning}
                  links={editor.links}
                  attempted={attempted}
                  onRecordedChange={editor.updateRecordedParticipant}
                  onPlanningChange={editor.changePlanning}
                  onAssign={editor.assignParticipant}
                />
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
                  answer={{ blocked: answerBlocked, onAnswer: setAnswering }}
                  responses={{
                    count: envelope.responses.length,
                    content: (
                      <QuestionnaireResponses
                        saved={envelope}
                        canAnswer={canAnswer}
                        dirty={editor.dirty}
                        busy={locked}
                        onAnswer={() => setAnswering("any")}
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
                <TabsContent value="aois">
                  <CreateProjectStep4 hideTitle scenaries={data.scenaries} onScenaryAoisChange={editor.updateAois} />
                </TabsContent>
              )}

              <TabsContent value="notes">
                <PlanningNotes value={planning} onChange={editor.changePlanning} />
              </TabsContent>
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
          fixedPhase={answering === "any" ? undefined : answering}
          onClose={() => setAnswering(null)}
          onSubmitted={editor.answered}
        />
      )}
    </div>
  )
}
