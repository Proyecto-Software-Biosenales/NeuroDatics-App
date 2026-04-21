"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Loader2, X } from "lucide-react"
import type { scenaries } from "./types"
import { ProjectsApi } from "@/features/projects/api/projectsApi"

interface CreateProjectStep4Props {
  scenaries: scenaries[]
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
      <div className="absolute inset-0" />
    )
  }

  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/80 text-muted-foreground">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando imagen...
          </div>
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
            // If proxy/object URL fails, try fallback URL before giving up.
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

export const CreateProjectStep4 = ({ scenaries }: CreateProjectStep4Props) => {
  const imageScenaries = scenaries.filter((scenary) => (scenary.type || "image") === "image")
  const [openscenaries, setOpenscenaries] = useState<string>(
    imageScenaries[0]?.id || ""
  )

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          Áreas de Interés (AOIs)
        </h3>
        <p className="text-sm text-muted-foreground">
          Dibuja rectángulos sobre la imagen para delimitar las áreas de interés
        </p>
      </div>

      <div className="space-y-3">
        {imageScenaries.map((scenary) => {
          const isOpen = openscenaries === scenary.id
          const scenaryAois = scenary.aois || []

          return (
            <div
              key={scenary.id}
              className="border border-border rounded-xl bg-card overflow-hidden"
            >
              <button
                type="button"
                onClick={() =>
                  setOpenscenaries(isOpen ? "" : scenary.id)
                }
                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                <span className="font-medium text-foreground">
                  {scenary.name}
                </span>
                {isOpen ? (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                )}
              </button>

              {isOpen && (
                <div className="px-4 pb-4 border-t border-border">
                  <div className="pt-4 space-y-4">
                    {/* Image placeholder with AOI rectangles */}
                    <div className="relative rounded-xl overflow-hidden bg-muted aspect-video">
                      <ScenarioPreviewImage
                        projectId={scenary.projectId}
                        fileId={scenary.fileId}
                        fallbackUrl={scenary.imageUrl}
                        alt={scenary.name}
                      />
                      {scenaryAois.map((aoi) => (
                        <div
                          key={aoi.id}
                          className="absolute border-4"
                          style={{
                            left: `${aoi.x}%`,
                            top: `${aoi.y}%`,
                            width: `${aoi.width}%`,
                            height: `${aoi.height}%`,
                            borderColor: "#3b82f6",
                          }}
                        />
                      ))}
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-3">
                        AOIs creadas ({scenaryAois.length})
                      </h4>
                      <div className="space-y-2">
                        {scenaryAois.map((aoi) => (
                          <div
                            key={aoi.id}
                            className="flex items-center justify-between p-3 bg-muted/40 rounded-lg border border-border"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-4 h-4 rounded bg-blue-500" />
                              <span className="text-sm font-medium text-foreground">
                                {aoi.name}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="p-1 hover:bg-accent rounded transition-colors"
                            >
                              <X className="w-4 h-4 text-muted-foreground" />
                            </button>
                          </div>
                        ))}
                        {scenaryAois.length === 0 && (
                          <p className="text-sm text-muted-foreground">No hay AOIs registradas para este estímulo.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {imageScenaries.length === 0 && (
          <div className="rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
            No hay escenarios de imagen disponibles para definir AOIs.
          </div>
        )}
      </div>
    </div>
  )
}
