"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
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
import { ProjectsApi, type ApiProjectAoi, type ApiProjectDetail, type ApiProjectFile } from "@/features/projects/api/projectsApi"
import { apiAoiToFormAoi, normalizeAoiPoints } from "@/features/projects/create-project/aoiUtils"

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
  return "bg-muted text-foreground border-border"
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
  const scenaries = useMemo(() => projectDetail?.scenaries ?? [], [projectDetail?.scenaries])
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
        <DialogHeader className="border-b border-border px-6 pt-6 pb-4">
          <DialogTitle className="truncate text-2xl font-semibold text-foreground">
            Ver proyecto: {projectName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando información del proyecto...
          </div>
        ) : loadError ? (
          <div className="m-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 dark:text-red-400">
            {loadError}
          </div>
        ) : (
          <div className="space-y-7 px-6 pb-6 pt-2">
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <Package className="h-4 w-4" />
                Informacion general
              </h3>
              <div className="rounded-2xl border border-border bg-muted/40 px-5 py-4">
                <div className="grid grid-cols-1 gap-y-3 sm:grid-cols-[130px_1fr] sm:gap-x-4">
                  <span className="text-sm font-semibold text-muted-foreground">Nombre</span>
                  <span className="text-base font-semibold text-foreground">{projectDetail?.name || "-"}</span>

                  <span className="text-sm font-semibold text-muted-foreground">Descripcion</span>
                  <span className="text-sm font-medium leading-6 text-foreground">
                    {projectDetail?.description || "Sin descripción"}
                  </span>

                  <span className="text-sm font-semibold text-muted-foreground">Carpeta</span>
                  <div className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium text-foreground">
                    <FileArchive className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="break-all">{zipFilename}</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <Activity className="h-4 w-4" />
                Sensores asociados
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold text-foreground">
                  {sensors.length}
                </span>
              </h3>
              <div className="rounded-2xl border border-border bg-card p-4">
                {sensors.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {sensors.map((sensor) => (
                      <span
                        key={sensor.id}
                        className="inline-flex items-center rounded-xl border border-border bg-muted px-3 py-1.5 text-sm font-semibold text-foreground"
                      >
                        {sensor.sensor_type}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No hay sensores asociados.</p>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <Users className="h-4 w-4" />
                Participantes
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold text-foreground">
                  {participants.length}
                </span>
              </h3>
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {participants.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-muted-foreground">
                      <tr className="text-left">
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">Documento</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">Edad</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">Sexo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {participants.map((participant) => (
                        <tr key={participant.id} className="border-t border-border text-foreground">
                          <td className="px-4 py-3 text-sm font-medium">{participant.participant_code}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex min-w-8 items-center justify-center rounded-md bg-muted px-2 py-0.5 text-sm font-semibold text-foreground">
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
                  <p className="text-sm text-muted-foreground">No hay participantes registrados.</p>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <Layers3 className="h-4 w-4" />
                Escenarios
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold text-foreground">
                  {scenaries.length}
                </span>
              </h3>
              <div className="space-y-2">
                {scenaries.length > 0 ? (
                  <ul className="space-y-3">
                    {scenaries.map((scenary) => (
                      <li key={scenary.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                        <button
                          type="button"
                          onClick={() => setOpenScenaryId((prev) => (prev === scenary.id ? "" : scenary.id))}
                          className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="break-words text-base font-semibold text-foreground">{scenary.name}</p>
                            <p className="text-sm font-medium text-muted-foreground">{toScenaryTypeLabel(scenary.type)}</p>
                          </div>
                          {openScenaryId === scenary.id ? (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                        </button>

                        {openScenaryId === scenary.id && (
                          <div className="border-t border-border p-4">
                            {String(scenary.type || "").toLowerCase() === "video" ? (
                              <div className="flex aspect-video items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <Video className="h-4 w-4" />
                                  Escenario de video
                                </div>
                              </div>
                            ) : (
                              <div className="relative overflow-hidden rounded-xl border border-border bg-muted aspect-video">
                                <ScenarioPreviewImage
                                  projectId={projectId}
                                  fileId={scenary.file_id}
                                  fallbackUrl={scenary.file_id ? resolveScenarioImageUrl(filesById.get(scenary.file_id)) : null}
                                  alt={scenary.name}
                                  aois={scenary.aois ?? []}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No hay escenarios disponibles.</p>
                )}
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

type PreviewLetterbox = {
  cW: number
  cH: number
  renderedW: number
  renderedH: number
  offsetX: number
  offsetY: number
}

const ScenarioPreviewImage = ({
  projectId,
  fileId,
  fallbackUrl,
  alt,
  aois = [],
}: {
  projectId?: string
  fileId?: string | null
  fallbackUrl?: string | null
  alt: string
  aois?: ApiProjectAoi[]
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const hasAnySource = Boolean((projectId && fileId) || fallbackUrl)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [currentSrc, setCurrentSrc] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [isLoading, setIsLoading] = useState(hasAnySource)
  const [letterbox, setLetterbox] = useState<PreviewLetterbox | null>(null)
  const normalizedAois = useMemo(() => aois.map((aoi, index) => apiAoiToFormAoi(aoi, index)), [aois])

  const computeLetterbox = useCallback(() => {
    const img = imageRef.current
    const container = containerRef.current
    if (!img || !container) {
      setLetterbox(null)
      return
    }

    const cW = container.clientWidth
    const cH = container.clientHeight
    const iW = img.naturalWidth
    const iH = img.naturalHeight
    if (!cW || !cH || !iW || !iH) {
      setLetterbox(null)
      return
    }

    const scale = Math.min(cW / iW, cH / iH)
    const renderedW = iW * scale
    const renderedH = iH * scale
    setLetterbox({
      cW,
      cH,
      renderedW,
      renderedH,
      offsetX: (cW - renderedW) / 2,
      offsetY: (cH - renderedH) / 2,
    })
  }, [])

  useEffect(() => {
    const frame = requestAnimationFrame(() => computeLetterbox())
    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(frame)
    }

    const observer = new ResizeObserver(() => computeLetterbox())
    observer.observe(container)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [computeLetterbox, currentSrc])

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    const load = async () => {
      setBlobUrl(null)
      setCurrentSrc(null)
      setLoadError(false)
      setIsLoading(hasAnySource)

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
      <div ref={containerRef} className="absolute inset-0 flex items-center justify-center text-muted-foreground">
        <ImageIcon className="h-4 w-4" />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="absolute inset-0">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/80 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
      {finalSrc && (
        <img
          ref={imageRef}
          src={finalSrc}
          alt={alt}
          className={`h-full w-full object-contain transition-opacity ${isLoading ? "opacity-0" : "opacity-100"}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => {
            setIsLoading(false)
            computeLetterbox()
          }}
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
      {letterbox && normalizedAois.length > 0 ? (
        <>
          <svg
            className="pointer-events-none absolute inset-0"
            width="100%"
            height="100%"
            viewBox={`0 0 ${letterbox.cW} ${letterbox.cH}`}
          >
            {normalizedAois.map((aoi) => {
              const x = letterbox.offsetX + (aoi.x / 100) * letterbox.renderedW
              const y = letterbox.offsetY + (aoi.y / 100) * letterbox.renderedH
              const width = (aoi.width / 100) * letterbox.renderedW
              const height = (aoi.height / 100) * letterbox.renderedH
              const points = normalizeAoiPoints(aoi.points)
              const isPolygon = aoi.shapeType === "polygon" && points.length >= 3
              const svgPoints = points.map((point) => ({
                x: letterbox.offsetX + (point.x / 100) * letterbox.renderedW,
                y: letterbox.offsetY + (point.y / 100) * letterbox.renderedH,
              }))
              const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
                x: (a.x + b.x) / 2,
                y: (a.y + b.y) / 2,
              })
              const smoothPath = isPolygon
                ? (() => {
                    const start = midpoint(svgPoints[svgPoints.length - 1], svgPoints[0])
                    const commands = [`M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`]
                    for (let index = 0; index < svgPoints.length; index += 1) {
                      const current = svgPoints[index]
                      const next = svgPoints[(index + 1) % svgPoints.length]
                      const end = midpoint(current, next)
                      commands.push(`Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`)
                    }
                    commands.push("Z")
                    return commands.join(" ")
                  })()
                : ""
              return (
                <g key={aoi.id}>
                  {isPolygon ? (
                    <path
                      d={smoothPath}
                      fill={`${aoi.color}14`}
                      stroke={aoi.color}
                      strokeWidth={2.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : (
                    <rect
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      fill={`${aoi.color}14`}
                      stroke={aoi.color}
                      strokeWidth={2.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  <text
                    x={x + 8}
                    y={Math.max(y - 8, 16)}
                    fill={aoi.color}
                    fontSize="12"
                    fontWeight="700"
                    style={{
                      paintOrder: "stroke",
                      stroke: "white",
                      strokeWidth: 3,
                    }}
                  >
                    {aoi.name}
                  </text>
                </g>
              )
            })}
          </svg>
          <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2 rounded-lg border border-border bg-background/90 px-3 py-2 shadow-sm backdrop-blur">
            {normalizedAois.map((aoi) => (
              <span key={aoi.id} className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: aoi.color }}
                />
                {aoi.name}
              </span>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
