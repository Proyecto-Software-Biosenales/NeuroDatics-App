
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Calendar, Clock3, Folder, Users, MoreVertical, Edit, Trash2, Archive, Loader2 } from "lucide-react"
import { useState } from "react"
import { Card } from "@/components/ui/card"
import { SensorBadge } from "../../../features/projects/components/SensorBadge"
import { DeleteProjectDialog } from "../../../features/projects/components/DeleteProjectDialog"
import { EditProjectDialog } from "../../../features/projects/components/EditProjectDialog"
import { ViewProjectDialog } from "../../../features/projects/components/ViewProjectDialog"
import { ProjectsApi } from "../api/projectsApi"
import type { DeleteProjectResult } from "@/features/projects/api/projectsApi"
import type { Project, ProjectStatus } from "@/features/projects/types"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"

interface ProjectsGridProps {
  projects: Project[]
  onDelete: (id: string) => Promise<DeleteProjectResult | void> | DeleteProjectResult | void
  onEdit: (project: Project) => void
  onContinueDraft?: (project: Project) => void
}

const statusLabel: Record<ProjectStatus, string> = {
  draft: "Borrador",
  active: "Activo",
  archived: "Archivado",
}

const statusColorClass: Record<ProjectStatus, string> = {
  draft: "bg-amber-500",
  active: "bg-emerald-500",
  archived: "bg-gray-400",
}

export const ProjectsGrid = ({ projects, onDelete, onEdit, onContinueDraft }: ProjectsGridProps) => {
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editOpenId, setEditOpenId] = useState<string | null>(null)
  const [deleteOpenId, setDeleteOpenId] = useState<string | null>(null)
  const [viewOpenId, setViewOpenId] = useState<string | null>(null)

  const handleDeleteProject = async (projectId: string) => {
    setDeletingId(projectId)
    try {
      return await onDelete(projectId)
    } finally {
      setDeletingId((current) => (current === projectId ? null : current))
    }
  }

  const handleArchiveProject = async (projectId: string, project: Project) => {
    try {
      setArchivingId(projectId)
      await ProjectsApi.update(projectId, { status: "archived" })
      onEdit({ ...project, status: "archived" })
      toast.success("Proyecto archivado correctamente")
    } catch (error) {
      console.error("[ProjectsGrid] Archive failed", { projectId, error })
      toast.error("No se pudo archivar el proyecto")
    } finally {
      setArchivingId(null)
    }
  }

  const handleUnarchiveProject = async (projectId: string, project: Project) => {
    try {
      setArchivingId(projectId)
      await ProjectsApi.update(projectId, { status: "active" })
      onEdit({ ...project, status: "active" })
      toast.success("Proyecto desarchivado correctamente")
    } catch (error) {
      console.error("[ProjectsGrid] Unarchive failed", { projectId, error })
      toast.error("No se pudo desarchiva el proyecto")
    } finally {
      setArchivingId(null)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">
      {projects.map((project) => {
        const projectStatus = (project.status || "active") as ProjectStatus
        const participants = project.participants ?? 0
        const isDeleting = deletingId === project.id
        const isDraftProcessing =
          project.status === "draft" && project.ingestionStatus === "PROCESSING"

        // PENDING = upload never completed (interrupted or never started).
        // No backend work is running for these — show a "Retomar" footer.
        const isDraftPending =
          project.status === "draft" &&
          (!project.ingestionStatus || project.ingestionStatus === "PENDING")

        const canContinueDraft =
          project.status === "draft" &&
          project.ingestionStatus === "READY"

        return (
        <Card
          key={project.id}
          className={`group relative cursor-pointer rounded-2xl border p-4 transition-all duration-200 xl:p-6 ${
            isDeleting ? "animate-pulse scale-[0.99] opacity-70 pointer-events-none" : ""
          } ${
            isDraftProcessing
              ? "border-border shadow-none bg-muted/40 pb-16"
              : isDraftPending
              ? "border-border shadow-sm bg-card pb-14"
              : "border-border shadow-sm bg-card hover:-translate-y-0.5 hover:shadow-lg"
          }`}
        >
          <DeleteProjectDialog
            projectId={project.id}
            projectName={project.name}
            onDelete={handleDeleteProject}
            isOpen={deleteOpenId === project.id}
            onOpenChange={(open) => setDeleteOpenId(open ? project.id : null)}
          />
          <EditProjectDialog
            projectId={project.id}
            projectName={project.name}
            onProjectUpdated={onEdit}
            isOpen={editOpenId === project.id}
            onOpenChange={(open) => setEditOpenId(open ? project.id : null)}
          />
          <ViewProjectDialog
            projectId={project.id}
            projectName={project.name}
            isOpen={viewOpenId === project.id}
            onOpenChange={(open) => setViewOpenId(open ? project.id : null)}
          />

          {/* Menu dropdown */}
          <div className="absolute top-4 right-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={isDraftProcessing}>
                <Button size="icon-sm" variant="ghost"
                  type="button"
                  className="text-muted-foreground"
                  disabled={isDraftProcessing}
                  aria-label="Opciones del proyecto"
                >
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setEditOpenId(project.id)}
                  disabled={isDraftProcessing}
                >
                  <Edit className="h-4 w-4" />
                  <span>Editar</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setDeleteOpenId(project.id)}
                  disabled={isDraftProcessing}
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Eliminar</span>
                </DropdownMenuItem>
                {projectStatus !== "archived" ? (
                  <DropdownMenuItem
                    onClick={() => handleArchiveProject(project.id, project)}
                    disabled={isDraftProcessing || archivingId === project.id}
                  >
                    <Archive className="h-4 w-4" />
                    <span>
                      {archivingId === project.id ? "Archivando..." : "Archivar"}
                    </span>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => handleUnarchiveProject(project.id, project)}
                    disabled={isDraftProcessing || archivingId === project.id}
                  >
                    <Archive className="h-4 w-4" />
                    <span>
                      {archivingId === project.id ? "Desarchivando..." : "Desarchivar"}
                    </span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mb-4 flex items-center gap-3 xl:mb-5 xl:gap-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted transition-colors xl:h-12 xl:w-12 ${
                isDraftProcessing ? "animate-pulse" : "group-hover:bg-accent"
              }`}>
              <Folder className={`h-5 w-5 xl:h-6 xl:w-6 ${isDraftProcessing ? "text-muted-foreground" : "text-foreground"}`} />
            </div>

            <div className="min-w-0 flex-1 pr-24">
              <h3 className="mb-0.5 truncate text-base font-semibold leading-tight text-foreground xl:text-lg">
                {project.name}
              </h3>

              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${statusColorClass[projectStatus]}`}
                  aria-hidden="true"
                />
                <span>{statusLabel[projectStatus]}</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Creado: </span>
              <span className="font-medium text-foreground">{project.createdAt}</span>
            </p>

            {project.updatedAt && (
              <p className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-muted-foreground" />
                <span>Modificado: </span>
                <span className="font-medium text-foreground">{project.updatedAt}</span>
              </p>
            )}
          </div>

          <div className="mb-4 mt-3 flex flex-wrap gap-2 xl:mb-5 xl:mt-4">
            {project.sensors.map((sensor) => (
              <SensorBadge key={sensor} sensor={sensor} size="sm" />
            ))}
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {participants} participante{participants !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {!isDraftProcessing && !isDraftPending && !canContinueDraft && (
                  <Button size="sm" variant="outline"
                    type="button"
                    className=""
                    onClick={() => setViewOpenId(project.id)}
                  >
                    Ver proyecto
                  </Button>
                )}
                {canContinueDraft && (
                  <Button variant="outline"
                    type="button"
                    className="text-xs"
                    onClick={() => onContinueDraft?.(project)}
                  >
                    Continuar
                  </Button>
                )}
              </div>
            </div>
          </div>

          {isDraftProcessing && (
            <>
              {/* Pulsing border */}
              <Skeleton className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-border animate-pulse z-[5]" />
              {/* Content dimming overlay */}
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-background/40 z-[6]" />
            </>
          )}

          {isDeleting && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/70 backdrop-blur-[1px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Eliminando proyecto...
              </div>
            </div>
          )}

          {isDraftProcessing && (
            <div className="absolute bottom-0 left-0 right-0 rounded-b-2xl overflow-hidden z-[10]">
              {/* Animated shimmer line */}
              <div className="relative h-0.5 w-full overflow-hidden bg-muted">
                <Skeleton className="absolute inset-y-0 left-0 w-2/3 animate-pulse bg-gradient-to-r from-transparent via-gray-500 to-transparent" />
              </div>
              {/* Footer body */}
              <div className="flex items-center gap-3 bg-muted/95 backdrop-blur-sm px-4 py-4">
                {/* Custom spinner */}
                <div className="h-5 w-5 flex-shrink-0 rounded-full border-2 border-border border-t-foreground animate-spin" />
                {/* Text */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight text-foreground">Procesando archivos</p>
                </div>
                {/* Bouncing dots */}
                <div className="flex flex-shrink-0 items-end gap-1 pb-0.5">
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "0ms" }} />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "150ms" }} />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          {isDraftPending && (
            <div className="absolute bottom-0 left-0 right-0 border-t border-dashed border-border rounded-b-2xl z-[10]">
              <div className="flex items-center justify-between bg-card px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  <p className="text-xs text-muted-foreground">Paso 1 incompleto</p>
                </div>
                <Button variant="link"
                  type="button"
                  className="text-xs"
                  onClick={(e) => { e.stopPropagation(); onContinueDraft?.(project) }}
                >
                  Retomar
                </Button>
              </div>
            </div>
          )}
        </Card>
        )
      })}
    </div>
  )
}
