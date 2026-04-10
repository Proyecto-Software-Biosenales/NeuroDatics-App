"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Image,
  Loader2,
  Users,
  Video,
  Package,
  FileArchive,
  Layers3,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ProjectsApi, type ApiProjectDetail, type ApiProjectFile } from "@/features/projects/api/projectsApi"

interface ViewProjectDialogProps {
  projectId: string
  projectName: string
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

const getLatestZipFilename = (files: ApiProjectFile[] | undefined): string => {
  if (!files || files.length === 0) return "No disponible"

  const zipFiles = files.filter((file) => file.kind === "experiment_zip")
  if (zipFiles.length === 0) return "No disponible"

  const latestZip = zipFiles.sort((a, b) => {
    const aTs = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTs = b.created_at ? new Date(b.created_at).getTime() : 0
    return bTs - aTs
  })[0]

  return latestZip?.filename || "No disponible"
}

const toSexLabel = (sex?: string | null): string => {
  if (!sex) return "No especificado"
  if (sex === "male" || sex === "MALE") return "Masculino"
  if (sex === "female" || sex === "FEMALE") return "Femenino"
  if (sex === "other" || sex === "OTHER") return "Otro"
  return String(sex)
}

const getSexPillClass = (): string => {
  return "bg-gray-50 text-gray-700 border-gray-300"
}

const toScenaryTypeLabel = (type?: string | null): string => {
  if (!type) return "No definido"
  if (type.toLowerCase() === "image") return "Imagen"
  if (type.toLowerCase() === "video") return "Video"
  return type
}

const extractDriveFileId = (url?: string | null): string | null => {
  if (!url) return null
  const filePathMatch = url.match(/\/d\/([^/]+)/i)
  if (filePathMatch?.[1]) return filePathMatch[1]
  const queryMatch = url.match(/[?&]id=([^&]+)/i)
  if (queryMatch?.[1]) return queryMatch[1]
  return null
}

const resolveScenarioImageUrl = (file?: ApiProjectFile): string | null => {
  if (!file) return null
  if (file.drive_download_link) return file.drive_download_link
  const driveFileId = file.external_id || extractDriveFileId(file.drive_web_view_link)
  if (driveFileId) {
    return `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w2000`
  }
  return file.drive_web_view_link ?? null
}

export const ViewProjectDialog = ({
  projectId,
  projectName,
  isOpen: controlledIsOpen,
  onOpenChange: controlledOnOpenChange,
}: ViewProjectDialogProps) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [projectDetail, setProjectDetail] = useState<ApiProjectDetail | null>(null)
  const [openScenaryId, setOpenScenaryId] = useState<string>("")

  const isOpen = controlledIsOpen ?? internalIsOpen
  const setIsOpen = (value: boolean) => {
    if (controlledOnOpenChange) {
      controlledOnOpenChange(value)
    } else {
      setInternalIsOpen(value)
    }
  }

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false

    const loadProject = async () => {
      setIsLoading(true)
      setLoadError(null)
      try {
        const detail = await ProjectsApi.get(projectId)
        if (!cancelled) {
          setProjectDetail(detail)
        }
      } catch (error) {
        console.error("[ViewProjectDialog] loadProject failed", { projectId, error })
        if (!cancelled) {
          setLoadError("No se pudo cargar la información del proyecto.")
          setProjectDetail(null)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadProject()

    return () => {
      cancelled = true
    }
  }, [isOpen, projectId])

  const participants = projectDetail?.participants || []
  const sensors = projectDetail?.sensors || []
  const scenaries = projectDetail?.scenaries || []
  const filesById = useMemo(() => {
    const map = new Map<string, ApiProjectFile>()
    for (const file of projectDetail?.files || []) {
      map.set(file.id, file)
    }
    return map
  }, [projectDetail?.files])
  const zipFilename = useMemo(() => getLatestZipFilename(projectDetail?.files), [projectDetail?.files])

  useEffect(() => {
    if (!isOpen) {
      setOpenScenaryId("")
      return
    }

    const firstImageScenary = scenaries.find((scenary) => String(scenary.type || "").toLowerCase() !== "video")
    setOpenScenaryId(firstImageScenary?.id || scenaries[0]?.id || "")
  }, [isOpen, scenaries])

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-x-hidden overflow-y-auto p-0">
        <DialogHeader className="border-b border-gray-200 px-6 pt-6 pb-4">
          <DialogTitle className="truncate text-2xl font-semibold text-gray-900">
            Ver proyecto
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 flex items-center justify-center text-gray-600">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando información del proyecto...
          </div>
        ) : loadError ? (
          <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {loadError}
          </div>
        ) : (
          <div className="space-y-7 px-6 pb-6 pt-2">
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-gray-500">
                <Package className="h-4 w-4" />
                Informacion general
              </h3>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4">
                <div className="grid grid-cols-1 gap-y-3 sm:grid-cols-[130px_1fr] sm:gap-x-4">
                  <span className="text-sm font-semibold text-gray-600">Nombre</span>
                  <span className="text-base font-semibold text-gray-900">{projectDetail?.name || "-"}</span>

                  <span className="text-sm font-semibold text-gray-600">Descripcion</span>
                  <span className="text-sm font-medium leading-6 text-gray-800">
                    {projectDetail?.description || "Sin descripción"}
                  </span>

                  <span className="text-sm font-semibold text-gray-600">Carpeta</span>
                  <div className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-sm font-medium text-gray-800">
                    <FileArchive className="h-4 w-4 shrink-0 text-gray-500" />
                    <span className="break-all">{zipFilename}</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-gray-500">
                <Activity className="h-4 w-4" />
                Sensores asociados
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gray-200 px-1.5 text-xs font-semibold text-gray-700">
                  {sensors.length}
                </span>
              </h3>
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                {sensors.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {sensors.map((sensor) => (
                      <span
                        key={sensor.id}
                        className="inline-flex items-center rounded-xl border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-700"
                      >
                        {sensor.sensor_type}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No hay sensores asociados.</p>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-gray-500">
                <Users className="h-4 w-4" />
                Participantes
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gray-200 px-1.5 text-xs font-semibold text-gray-700">
                  {participants.length}
                </span>
              </h3>
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                {participants.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr className="text-left">
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">Documento</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">Edad</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">Sexo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {participants.map((participant) => (
                        <tr key={participant.id} className="border-t border-gray-100 text-gray-700">
                          <td className="px-4 py-3 text-sm font-medium">{participant.participant_code}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex min-w-8 items-center justify-center rounded-md bg-gray-100 px-2 py-0.5 text-sm font-semibold text-gray-700">
                              {participant.age ?? "-"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full border px-3 py-0.5 text-sm font-semibold ${getSexPillClass()}`}>
                              {toSexLabel(participant.sex)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-gray-500">No hay participantes registrados.</p>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-gray-500">
                <Layers3 className="h-4 w-4" />
                Escenarios
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gray-200 px-1.5 text-xs font-semibold text-gray-700">
                  {scenaries.length}
                </span>
              </h3>
              <div className="space-y-2">
                {scenaries.length > 0 ? (
                  <ul className="space-y-3">
                    {scenaries.map((scenary) => (
                      <li key={scenary.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                        <button
                          type="button"
                          onClick={() => setOpenScenaryId((prev) => (prev === scenary.id ? "" : scenary.id))}
                          className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="break-words text-base font-semibold text-gray-900">{scenary.name}</p>
                            <p className="text-sm font-medium text-gray-500">{toScenaryTypeLabel(scenary.type)}</p>
                          </div>
                          {openScenaryId === scenary.id ? (
                            <ChevronDown className="h-5 w-5 text-gray-500" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-gray-500" />
                          )}
                        </button>

                        {openScenaryId === scenary.id && (
                          <div className="border-t border-gray-100 p-4">
                            {String(scenary.type || "").toLowerCase() === "video" ? (
                              <div className="flex aspect-video items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <Video className="h-4 w-4" />
                                  Escenario de video
                                </div>
                              </div>
                            ) : (
                              <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-100 aspect-video">
                                <ScenarioPreviewImage
                                  projectId={projectId}
                                  fileId={scenary.file_id}
                                  fallbackUrl={scenary.file_id ? resolveScenarioImageUrl(filesById.get(scenary.file_id)) : null}
                                  alt={scenary.name}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">No hay escenarios disponibles.</p>
                )}
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const ScenarioPreviewImage = ({
  projectId,
  fileId,
  fallbackUrl,
  alt,
}: {
  projectId?: string
  fileId?: string | null
  fallbackUrl?: string | null
  alt: string
}) => {
  const hasAnySource = Boolean((projectId && fileId) || fallbackUrl)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [currentSrc, setCurrentSrc] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [isLoading, setIsLoading] = useState(hasAnySource)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    setBlobUrl(null)
    setCurrentSrc(null)
    setLoadError(false)
    setIsLoading(hasAnySource)

    const load = async () => {
      if (!projectId || !fileId) {
        if (fallbackUrl) {
          setCurrentSrc(fallbackUrl)
        } else {
          setIsLoading(false)
        }
        return
      }

      try {
        const blob = await ProjectsApi.fetchScenarioImage(projectId, fileId)
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
        setCurrentSrc(objectUrl)
        setLoadError(false)
      } catch {
        if (!cancelled) {
          if (fallbackUrl) {
            setCurrentSrc(fallbackUrl)
          } else {
            setLoadError(true)
            setIsLoading(false)
          }
        }
      }
    }

    void load()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [projectId, fileId, fallbackUrl, hasAnySource])

  const finalSrc = currentSrc
  if (loadError || (!finalSrc && !isLoading)) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-gray-500">
        <Image className="h-4 w-4" />
      </div>
    )
  }

  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100/80 text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
      {finalSrc && (
        <img
          src={finalSrc}
          alt={alt}
          className={`h-full w-full object-contain transition-opacity ${isLoading ? "opacity-0" : "opacity-100"}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            if (blobUrl && fallbackUrl && finalSrc === blobUrl) {
              setCurrentSrc(fallbackUrl)
              setIsLoading(true)
              return
            }
            setLoadError(true)
            setIsLoading(false)
          }}
        />
      )}
    </>
  )
}
