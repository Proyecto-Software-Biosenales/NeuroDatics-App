import { Calendar, Clock3, Folder, Users, MoreVertical, Edit, Trash2, Archive, Loader2 } from "lucide-react"
import { useState } from "react"
import { Card } from "../../../components/ui/Card"
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
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => {
        const projectStatus = (project.status || "active") as ProjectStatus
        const participants = project.participants ?? 0
        const isDeleting = deletingId === project.id
        const isDraftProcessing =
          project.status === "draft" &&
          (project.ingestionStatus === "PENDING" || project.ingestionStatus === "PROCESSING")

        const canContinueDraft =
          project.status === "draft" &&
          project.ingestionStatus === "READY"

        return (
        <Card
          key={project.id}
          className={`group relative cursor-pointer rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
            isDeleting ? "animate-pulse scale-[0.99] opacity-70 pointer-events-none" : ""
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
                <button
                  type="button"
                  className={`rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 ${
                    isDraftProcessing ? "cursor-not-allowed opacity-40" : ""
                  }`}
                  disabled={isDraftProcessing}
                  aria-label="Opciones del proyecto"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
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

          <div className="mb-5 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-100 transition-colors group-hover:bg-gray-200">
              <Folder className="h-6 w-6 text-gray-600" />
            </div>

            <div className="min-w-0 flex-1 pr-24">
              <h3 className="mb-0.5 truncate text-lg font-semibold leading-tight text-gray-900">
                {project.name}
              </h3>

              <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${statusColorClass[projectStatus]}`}
                  aria-hidden="true"
                />
                <span>{statusLabel[projectStatus]}</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 text-sm text-gray-600">
            <p className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span>Creado: </span>
              <span className="font-medium text-gray-700">{project.createdAt}</span>
            </p>

            {project.updatedAt && (
              <p className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-gray-500" />
                <span>Modificado: </span>
                <span className="font-medium text-gray-700">{project.updatedAt}</span>
              </p>
            )}
          </div>

          <div className="mb-5 mt-4 flex flex-wrap gap-2">
            {project.sensors.map((sensor) => (
              <SensorBadge key={sensor} sensor={sensor} size="sm" />
            ))}
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <Users className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  {participants} participante{participants !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-100 hover:text-gray-900"
                  onClick={() => setViewOpenId(project.id)}
                >
                  Ver proyecto
                </button>
                {canContinueDraft && (
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 hover:text-emerald-800"
                    onClick={() => onContinueDraft?.(project)}
                  >
                    Continuar
                  </button>
                )}
              </div>
            </div>
          </div>

          {isDeleting && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-[1px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Eliminando proyecto...
              </div>
            </div>
          )}

          {isDraftProcessing && (
            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 bg-muted/80 backdrop-blur-sm rounded-b-2xl px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Procesando archivos...</span>
            </div>
          )}
        </Card>
        )
      })}
    </div>
  )
}