"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AnalyticsApi } from "../api/analyticsApi"
import type {
  CorrelationCell,
  CorrelationCellStatus,
  CorrelationResponse,
  CorrelationSignal,
  CorrelationSignalId,
} from "../types"
import { VISUALIZATION_BY_ID, type VisualizationId } from "./registry"

export interface CorrelationMatrixSectionProps {
  projectId: string
  participantCode: string | null
  scenario: string
  selectedViewIds: VisualizationId[]
}

const SIGNAL_ORDER: readonly CorrelationSignalId[] = [
  "pupil_avg_mm",
  "gaze_x_pct",
  "gaze_y_pct",
  "distance_cm",
  "gsr_smoothed_us",
  "eeg_broadband_power_db",
]

const STATUS_LABELS: Record<CorrelationCellStatus, string> = {
  ok: "Disponible",
  unavailable: "No disponible",
  insufficient_overlap: "Solapamiento insuficiente",
  constant_signal: "Señal constante",
}

interface RequestState {
  key: string
  data: CorrelationResponse | null
  loading: boolean
  error: string | null
}

const INITIAL_REQUEST_STATE: RequestState = {
  key: "",
  data: null,
  loading: false,
  error: null,
}

function getSelectedSignalIds(
  selectedViewIds: VisualizationId[]
): CorrelationSignalId[] {
  const selectedSignals = new Set<CorrelationSignalId>()

  for (const viewId of selectedViewIds) {
    for (const signalId of VISUALIZATION_BY_ID[viewId].correlationSignals) {
      selectedSignals.add(signalId)
    }
  }

  return SIGNAL_ORDER.filter((signalId) => selectedSignals.has(signalId))
}

function formatCoverage(coverage: number): string {
  const percentage = coverage <= 1 ? coverage * 100 : coverage
  return `${Math.max(0, Math.min(100, percentage)).toFixed(0)}%`
}

function formatDuration(durationS: number): string {
  if (durationS < 60) return `${durationS.toFixed(1)} s`
  return `${(durationS / 60).toFixed(1)} min`
}

function formatBinSize(binSizeS: number): string {
  if (binSizeS < 1) return `${Math.round(binSizeS * 1000)} ms`
  return `${binSizeS.toLocaleString("es-CO", {
    maximumFractionDigits: 2,
  })} s`
}

function formatCoefficient(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toFixed(3)
}

function getCellTone(cell: CorrelationCell | undefined): string {
  if (!cell || cell.status !== "ok" || cell.coefficient == null) {
    return "bg-muted/40 text-muted-foreground"
  }

  if (cell.coefficient <= -0.67) {
    return "bg-blue-600 text-white dark:bg-blue-400 dark:text-blue-950"
  }
  if (cell.coefficient <= -0.34) {
    return "bg-blue-300 text-blue-950 dark:bg-blue-700 dark:text-blue-50"
  }
  if (cell.coefficient < 0) {
    return "bg-blue-100 text-blue-950 dark:bg-blue-950 dark:text-blue-100"
  }
  if (cell.coefficient >= 0.67) {
    return "bg-rose-600 text-white dark:bg-rose-400 dark:text-rose-950"
  }
  if (cell.coefficient >= 0.34) {
    return "bg-rose-300 text-rose-950 dark:bg-rose-700 dark:text-rose-50"
  }
  if (cell.coefficient > 0) {
    return "bg-rose-100 text-rose-950 dark:bg-rose-950 dark:text-rose-100"
  }
  return "bg-muted/50 text-foreground"
}

function cellKey(
  signalX: CorrelationSignalId,
  signalY: CorrelationSignalId
): string {
  return `${signalX}:${signalY}`
}

function MatrixCell({
  cell,
  rowSignal,
  columnSignal,
}: {
  cell: CorrelationCell | undefined
  rowSignal: CorrelationSignal
  columnSignal: CorrelationSignal
}) {
  const coefficient = formatCoefficient(cell?.coefficient ?? null)
  const sampleCount = cell?.n_samples ?? 0
  const coverage = formatCoverage(cell?.coverage ?? 0)
  const status = cell ? STATUS_LABELS[cell.status] : STATUS_LABELS.unavailable

  return (
    <td className="border border-border p-1.5 text-center align-middle">
      <div
        className={cn(
          "flex min-h-20 min-w-28 flex-col items-center justify-center rounded-md px-2 py-2",
          getCellTone(cell)
        )}
      >
        <span aria-hidden="true" className="font-medium tabular-nums">
          {coefficient}
        </span>
        <span
          aria-hidden="true"
          className="mt-0.5 text-xs leading-4 opacity-80"
        >
          n={sampleCount} · {coverage}
        </span>
        {cell?.status !== "ok" && (
          <span aria-hidden="true" className="max-w-28 text-xs leading-4">
            {status}
          </span>
        )}
        <span className="sr-only">
          {rowSignal.label} con {columnSignal.label}: coeficiente {coefficient},{" "}
          {sampleCount} muestras emparejadas, cobertura {coverage}, estado{" "}
          {status}.
        </span>
      </div>
    </td>
  )
}

function Guidance({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-36 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-6 py-8 text-center">
      <p className="max-w-2xl text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

function LoadingMatrix() {
  return (
    <div aria-live="polite" className="space-y-4" role="status">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Calculando correlaciones…
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-muted" />
    </div>
  )
}

export function CorrelationMatrixSection({
  projectId,
  participantCode,
  scenario,
  selectedViewIds,
}: CorrelationMatrixSectionProps) {
  const [reloadVersion, setReloadVersion] = useState(0)
  const [request, setRequest] = useState<RequestState>(INITIAL_REQUEST_STATE)
  const cachedResponses = useRef(new Map<string, CorrelationResponse>())
  const inFlightRequests = useRef(
    new Map<string, Promise<CorrelationResponse>>()
  )

  const selectedSignalIds = useMemo(
    () => getSelectedSignalIds(selectedViewIds),
    [selectedViewIds]
  )
  const isConcreteScenario = Boolean(
    scenario && scenario.toLowerCase() !== "all"
  )
  const hasEnoughSelectedSignals = selectedSignalIds.length >= 2
  const canFetch = Boolean(
    participantCode && isConcreteScenario && hasEnoughSelectedSignals
  )
  const contextKey = JSON.stringify([projectId, participantCode, scenario])
  const requestKey = `${contextKey}:${reloadVersion}`

  useEffect(() => {
    if (!canFetch || !participantCode) return

    const cached = cachedResponses.current.get(contextKey)
    if (cached) {
      let cancelled = false
      Promise.resolve().then(() => {
        if (!cancelled) {
          setRequest({
            key: requestKey,
            data: cached,
            loading: false,
            error: null,
          })
        }
      })
      return () => {
        cancelled = true
      }
    }

    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) {
        setRequest({ key: requestKey, data: null, loading: true, error: null })
      }
    })

    let pendingRequest = inFlightRequests.current.get(contextKey)
    if (!pendingRequest) {
      pendingRequest = AnalyticsApi.getCorrelations(
        projectId,
        participantCode,
        scenario
      )
      inFlightRequests.current.set(contextKey, pendingRequest)
      pendingRequest.then(
        (data) => {
          cachedResponses.current.set(contextKey, data)
          if (inFlightRequests.current.get(contextKey) === pendingRequest) {
            inFlightRequests.current.delete(contextKey)
          }
        },
        () => {
          if (inFlightRequests.current.get(contextKey) === pendingRequest) {
            inFlightRequests.current.delete(contextKey)
          }
        }
      )
    }

    pendingRequest
      .then((data) => {
        if (!cancelled) {
          setRequest({ key: requestKey, data, loading: false, error: null })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRequest({
            key: requestKey,
            data: null,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "No fue posible cargar las correlaciones.",
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [canFetch, contextKey, participantCode, projectId, requestKey, scenario])

  const activeRequest =
    request.key === requestKey ? request : INITIAL_REQUEST_STATE
  const data = activeRequest.data

  const signalById = useMemo(
    () => new Map(data?.signals.map((signal) => [signal.id, signal]) ?? []),
    [data]
  )
  const filteredSignals = useMemo(
    () =>
      selectedSignalIds
        .map((signalId) => signalById.get(signalId))
        .filter((signal): signal is CorrelationSignal => signal != null),
    [selectedSignalIds, signalById]
  )
  const cellsByPair = useMemo(() => {
    const cells = new Map<string, CorrelationCell>()
    for (const row of data?.matrix ?? []) {
      for (const cell of row) {
        cells.set(cellKey(cell.signal_x, cell.signal_y), cell)
      }
    }
    return cells
  }, [data])

  return (
    <Card>
      <CardHeader>
        <div className="space-y-1.5">
          <CardTitle>Correlaciones entre señales</CardTitle>
          <CardDescription>
            Pearson sin desfase sobre señales agregadas en intervalos temporales
            compartidos. Una asociación no implica causalidad.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Solo participan señales continuas seleccionadas: pupila, mirada X/Y,
            distancia, GSR y potencia EEG. Las vistas de eventos o mapas sin una
            señal continua permanecen descriptivas.
          </p>

          {!participantCode ? (
            <Guidance>
              Selecciona un participante para calcular las correlaciones.
            </Guidance>
          ) : !isConcreteScenario ? (
            <Guidance>
              Selecciona un escenario específico. Las correlaciones no están
              disponibles para &ldquo;Todos los escenarios&rdquo;.
            </Guidance>
          ) : !hasEnoughSelectedSignals ? (
            <Guidance>
              Selecciona al menos dos señales compatibles entre pupila, mirada,
              distancia, GSR y EEG. Las vistas sin una señal continua asociada
              no se correlacionan.
            </Guidance>
          ) : activeRequest.loading || activeRequest.key !== requestKey ? (
            <LoadingMatrix />
          ) : activeRequest.error ? (
            <div
              className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-6 py-8 text-center"
              role="alert"
            >
              <p className="text-sm text-destructive">{activeRequest.error}</p>
              <Button
                onClick={() => setReloadVersion((version) => version + 1)}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCw aria-hidden="true" />
                Reintentar
              </Button>
            </div>
          ) : !data || filteredSignals.length < 2 ? (
            <Guidance>
              No hay al menos dos señales seleccionadas disponibles para
              construir la matriz.
            </Guidance>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <p>
                  {filteredSignals.length} señales · {data.total_bins}{" "}
                  intervalos de {formatBinSize(data.bin_size_s)} ·{" "}
                  {formatDuration(data.duration_s)}
                </p>
                <p>Azul: inversa · Neutro: cercana a 0 · Rojo: directa</p>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <table
                  aria-label={`Matriz de correlaciones de Pearson para ${data.scenario}`}
                  className="mx-auto min-w-[720px] border-collapse text-sm"
                >
                  <caption className="sr-only">
                    Coeficientes de Pearson, muestras emparejadas, cobertura y
                    estado para cada par de señales seleccionadas.
                  </caption>
                  <thead>
                    <tr>
                      <th
                        className="sticky left-0 z-20 border border-border bg-card px-3 py-2 text-left font-medium"
                        scope="col"
                      >
                        Señal
                      </th>
                      {filteredSignals.map((signal) => (
                        <th
                          className="min-w-32 border border-border bg-muted/40 px-2 py-2 text-center font-medium"
                          key={signal.id}
                          scope="col"
                        >
                          <span className="block">{signal.label}</span>
                          <span className="block text-xs font-normal text-muted-foreground">
                            {signal.unit} · {formatCoverage(signal.coverage)}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSignals.map((rowSignal) => (
                      <tr key={rowSignal.id}>
                        <th
                          className="sticky left-0 z-10 border border-border bg-card px-3 py-2 text-left font-medium"
                          scope="row"
                        >
                          <span className="block">{rowSignal.label}</span>
                          <span className="block text-xs font-normal text-muted-foreground">
                            {rowSignal.valid_bins} intervalos
                          </span>
                        </th>
                        {filteredSignals.map((columnSignal) => {
                          const cell =
                            cellsByPair.get(
                              cellKey(rowSignal.id, columnSignal.id)
                            ) ??
                            cellsByPair.get(
                              cellKey(columnSignal.id, rowSignal.id)
                            )
                          return (
                            <MatrixCell
                              cell={cell}
                              columnSignal={columnSignal}
                              key={columnSignal.id}
                              rowSignal={rowSignal}
                            />
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredSignals.some((signal) => !signal.available) && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Señales no disponibles
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    {filteredSignals
                      .filter((signal) => !signal.available)
                      .map((signal) => (
                        <li key={signal.id}>
                          {signal.label}:{" "}
                          {signal.unavailable_reason ?? "sin datos suficientes"}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
