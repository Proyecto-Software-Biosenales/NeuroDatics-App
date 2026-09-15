import { CheckCircle2, Cloud, Gauge, Clock3, HardDrive } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

interface ProjectSaveProgressProps {
  zipUploadPercent: number | null
  zipUploadBytes: { loaded: number; total: number } | null
  zipUploadSpeedMbps: number | null
  zipUploadEtaSeconds: number | null
  zipDriveProcessingSeconds: number | null
  isSaveCompleted: boolean
  isZipUploadInProgress: boolean
  cancelZipUpload: () => void
  message: string
}
const formatBytesToMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`
const formatEta = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`
}
export function ProjectSaveProgress({ zipUploadPercent, zipUploadBytes, zipUploadSpeedMbps, zipUploadEtaSeconds, zipDriveProcessingSeconds, isSaveCompleted, isZipUploadInProgress, cancelZipUpload, message }: ProjectSaveProgressProps) {
  const isDriveSyncInProgress = zipUploadPercent !== null && zipUploadPercent < 100
  const isDriveSyncFinalizing = zipUploadPercent !== null && zipUploadPercent >= 99 && zipUploadPercent < 100
  return (<div className="mt-4 p-5 bg-muted border border-border rounded-2xl">
              {zipUploadPercent !== null ? (
                <>
                  {/* Header with title and percentage */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl border border-border bg-card flex items-center justify-center">
                        <Cloud className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {isDriveSyncFinalizing
                            ? "Finalizando sincronización con Google Drive"
                            : isDriveSyncInProgress
                            ? "Sincronizando con Google Drive"
                            : "Sincronización completada"}
                        </p>
                        <p className="text-sm text-muted-foreground">{zipUploadPercent}% completado</p>
                      </div>
                    </div>
                    <span className="text-xl font-bold text-foreground">{zipUploadPercent}%</span>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-4">
                    <Progress value={zipUploadPercent} aria-label="Sincronización del proyecto" className="h-2" />
                  </div>

                  {/* Data info grid */}
                  {zipUploadBytes && zipUploadBytes.total > 0 && (
                    <div className="grid grid-cols-2 gap-4 mb-4 text-sm text-foreground">
                      <div className="flex items-center gap-2">
                          <HardDrive className="h-4 w-4 text-muted-foreground" />
                          <p>{formatBytesToMB(zipUploadBytes.total)}</p>
                      </div>
                      <div className="text-right font-medium text-foreground">
                        {formatBytesToMB(zipUploadBytes.loaded)} transferidos
                      </div>
                    </div>
                  )}

                  {/* Metrics row */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm bg-card p-3 rounded-lg border border-border">
                    <div className="flex items-start gap-2">
                      <div className="h-6 w-6 rounded-lg border border-border flex items-center justify-center mt-0.5">
                        <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs mb-1">VELOCIDAD</p>
                        <p className="font-semibold text-foreground">
                          {zipUploadSpeedMbps !== null ? `${zipUploadSpeedMbps.toFixed(1)} MB/s` : "calculando..."}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="h-6 w-6 rounded-lg border border-border flex items-center justify-center mt-0.5">
                        <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs mb-1">RESTANTE</p>
                        <p className="font-semibold text-foreground">
                          {zipUploadEtaSeconds !== null ? formatEta(zipUploadEtaSeconds) : isDriveSyncInProgress ? "--" : "0:00"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="h-6 w-6 rounded-lg border border-border flex items-center justify-center mt-0.5">
                        <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs mb-1">TRANSCURRIDO</p>
                        <p className="font-semibold text-foreground">
                          {zipDriveProcessingSeconds !== null ? formatEta(zipDriveProcessingSeconds) : "0:00"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-muted-foreground text-sm">
                    <div className="flex items-center gap-1">
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse"
                        style={{ animationDelay: "0ms", animationDuration: "900ms" }}
                      />
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse"
                        style={{ animationDelay: "180ms", animationDuration: "900ms" }}
                      />
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse"
                        style={{ animationDelay: "360ms", animationDuration: "900ms" }}
                      />
                      <span className="ml-2">Procesando en Google Drive...</span>
                    </div>
                    <Button variant="ghost"
                      type="button"
                      onClick={cancelZipUpload}
                      disabled={!isZipUploadInProgress}
                      className="hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancelar
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3 text-sm text-foreground">
                  {isSaveCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-foreground" />
                  ) : (
                    <div className="h-4 w-4 border-2 border-muted-foreground border-t-foreground rounded-full animate-spin" />
                  )}
                  <span>{message}</span>
                </div>
              )}
            </div>)
}
