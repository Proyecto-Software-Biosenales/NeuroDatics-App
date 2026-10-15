"use client"
import { useEffect, useRef, useState } from "react"
import { NotebookPen, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { PreExperimentConfig, ProjectNote } from "./types"

/** Free notes of the project, a title over its text like the screen's groups. Empty ones are not kept. */
export function PlanningNotes({
  value,
  onChange,
}: {
  value: PreExperimentConfig
  onChange: (value: PreExperimentConfig) => void
}) {
  const [added, setAdded] = useState<string | null>(null)
  const addedField = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (added) addedField.current?.focus()
  }, [added])
  const notes = value.project_notes
  const setNotes = (project_notes: ProjectNote[]) =>
    onChange({ ...value, project_notes })
  const update = (id: string, change: Partial<ProjectNote>) =>
    setNotes(notes.map((item) => (item.id === id ? { ...item, ...change } : item)))
  const add = () => {
    const id = crypto.randomUUID()
    setNotes([...notes, { id, title: "", text: "" }])
    setAdded(id)
  }
  if (!notes.length)
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
          <NotebookPen aria-hidden className="size-6" />
        </div>
        <div className="space-y-1">
          <p className="font-medium">Aún no hay notas</p>
          <p className="text-sm text-muted-foreground">
            Apunta lo que quieras recordar del proyecto.
          </p>
        </div>
        <Button type="button" onClick={add}>
          <Plus aria-hidden />
          Agregar nota
        </Button>
      </div>
    )
  return (
    <div className="space-y-3">
      {notes.map((note, index) => (
        <section key={note.id} className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted [&_svg]:size-4">
              <NotebookPen aria-hidden />
            </div>
            <Input
              ref={note.id === added ? addedField : undefined}
              aria-label={`Título de la nota ${index + 1}`}
              placeholder="Título"
              maxLength={255}
              value={note.title}
              onChange={(event) => update(note.id, { title: event.target.value })}
              className="h-8 border-transparent px-1.5 font-medium shadow-none hover:border-input dark:bg-transparent"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Quitar nota ${index + 1}`}
              title="Quitar nota"
              onClick={() => setNotes(notes.filter((item) => item.id !== note.id))}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
          <Textarea
            aria-label={`Nota ${index + 1}`}
            value={note.text}
            onChange={(event) => update(note.id, { text: event.target.value })}
          />
        </section>
      ))}
      <Button type="button" variant="outline" className="w-full" onClick={add}>
        <Plus aria-hidden />
        Agregar nota
      </Button>
    </div>
  )
}
