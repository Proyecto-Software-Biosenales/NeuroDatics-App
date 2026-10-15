"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { AuthGuard } from "@/features/auth/components/AuthGuard"
import { ProjectEditor } from "@/features/projects/edit/ProjectEditor"

/** One project, opened from its card: `/proyectos/editar?proyecto=<id>`. */
function EditProject() {
  // The address is read in the browser: the static export has no request to read it from, so the server snapshot is null.
  const projectId = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("proyecto") ?? "",
    () => null
  )
  return (
    <div className="app-page-shell">
      <div className="app-page-container max-w-6xl">
        {projectId === null ? (
          <p role="status" className="text-sm text-muted-foreground">
            Cargando el proyecto…
          </p>
        ) : projectId ? (
          <ProjectEditor key={projectId} projectId={projectId} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              No se encontró este proyecto. Ábrelo desde su tarjeta en «Proyectos».
            </p>
            <Button asChild variant="outline">
              <Link href="/proyectos">Volver a proyectos</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function EditarProyectoPage() {
  return <AuthGuard><EditProject /></AuthGuard>
}
