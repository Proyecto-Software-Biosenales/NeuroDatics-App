"use client"

import { type ChangeEvent } from "react"
import { Activity, Brain, Clock, TrendingUp } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { KpiCard } from "@/components/ui/KpiCard"
import { cn } from "@/lib/utils"
import { type EegTopographyData } from "../../types"
import { formatChannel, formatNumber, VIRIDIS_GRADIENT, type TopographyFrameRow } from "../../eegPresentation"
import { TOPOGRAPHY_CHANNELS, CHANNEL_COLORS, type EegView } from "./eegViewShared"
import { TopographyScene } from "./EegCanvasPanels"

interface EegTopographyViewProps {
  availableTopographyChannels: string[]
  handleTopographyChannelToggle: (channel: string) => void
  handleTopographyFrameChange: (event: ChangeEvent<HTMLInputElement>) => void
  participantCode: string | null
  projectId: string
  selectedChannels: string[]
  topographyData: EegTopographyData | null
  topographyError: string | null
  topographyFrameIndex: number
  topographyLoading: boolean
  topographyRows: TopographyFrameRow[]
  topographyStats: { frameTime: number | null; meanPower: number | null; minPower: number | null; maxPower: number | null; strongest: TopographyFrameRow | null; }
  view: EegView
}

export function EegTopographyView({
  availableTopographyChannels,
  handleTopographyChannelToggle,
  handleTopographyFrameChange,
  participantCode,
  projectId,
  selectedChannels,
  topographyData,
  topographyError,
  topographyFrameIndex,
  topographyLoading,
  topographyRows,
  topographyStats,
  view,
}: EegTopographyViewProps) {
  return <>
{view === "topography" ? (
        <Card>
          <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Brain className="h-5 w-5" />
                Topografía EEG
              </CardTitle>
              <CardDescription>
                Distribución espacial de potencia broadband por ventanas temporales.
              </CardDescription>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Unidad</span>
                <span className="font-semibold text-foreground">{topographyData?.unit ?? "uV^2"}</span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Ventanas</span>
                <span className="font-semibold text-foreground">{(topographyData?.time.length ?? 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Ventana</span>
                <span className="font-semibold text-foreground">{(topographyData?.window_s ?? 0.33).toFixed(2)}s</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              <KpiCard
                label="Tiempo"
                value={topographyStats.frameTime}
                unit="s"
                decimals={2}
                description="Centro de la ventana seleccionada"
                Icon={Clock}
                loading={topographyLoading}
                iconBgClass="bg-blue-100 dark:bg-blue-900/40"
                iconColorClass="text-blue-600 dark:text-blue-400"
                labelColorClass="text-blue-700 dark:text-blue-400"
              />
              <KpiCard
                label="Mayor potencia"
                value={topographyStats.strongest?.value ?? null}
                unit={topographyData?.unit ?? "uV^2"}
                decimals={4}
                description={topographyStats.strongest ? formatChannel(topographyStats.strongest.channel) : "Electrodo dominante"}
                Icon={TrendingUp}
                loading={topographyLoading}
                iconBgClass="bg-rose-100 dark:bg-rose-900/40"
                iconColorClass="text-rose-600 dark:text-rose-400"
                labelColorClass="text-rose-700 dark:text-rose-400"
              />
              <KpiCard
                label="Potencia media"
                value={topographyStats.meanPower}
                unit={topographyData?.unit ?? "uV^2"}
                decimals={4}
                description="Promedio entre electrodos visibles"
                Icon={Activity}
                loading={topographyLoading}
                iconBgClass="bg-emerald-100 dark:bg-emerald-900/40"
                iconColorClass="text-emerald-600 dark:text-emerald-400"
                labelColorClass="text-emerald-700 dark:text-emerald-400"
              />
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {TOPOGRAPHY_CHANNELS.map((channel) => {
                const isActive = selectedChannels.includes(channel)
                const isAvailable = availableTopographyChannels.includes(channel)
                return (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => handleTopographyChannelToggle(channel)}
                    disabled={!isAvailable}
                    className={cn(
                      "inline-flex min-w-12 items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium transition",
                      isActive && isAvailable
                        ? "border-transparent text-white"
                        : "border-border bg-background text-muted-foreground hover:bg-muted",
                      !isAvailable && "cursor-not-allowed opacity-40"
                    )}
                    style={isActive && isAvailable ? { backgroundColor: CHANNEL_COLORS[channel] } : undefined}
                  >
                    {formatChannel(channel)}
                  </button>
                )
              })}
            </div>

            {topographyLoading ? (
              <div className="h-[560px] w-full animate-pulse rounded-lg bg-muted" />
            ) : topographyError ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
                No se pudo cargar la topografía EEG.
              </div>
            ) : !topographyData || topographyData.time.length === 0 || topographyRows.length < 3 ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
                No hay datos suficientes para calcular la topografía EEG.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-5">
                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center">
                    <span className="w-24 text-xs text-muted-foreground">
                      {topographyData.color_domain.min.toFixed(2)}
                    </span>
                    <div
                      className="h-3 min-w-40 flex-1 rounded-full"
                      style={{ background: VIRIDIS_GRADIENT }}
                    />
                    <span className="w-28 text-right text-xs text-muted-foreground">
                      {topographyData.color_domain.max.toFixed(2)} {topographyData.unit}
                    </span>
                  </div>

                  <TopographyScene
                    rows={topographyRows}
                    colorDomain={topographyData.color_domain}
                    unit={topographyData.unit}
                    projectId={projectId}
                    participantCode={participantCode}
                    selectedTime={topographyStats.frameTime}
                  />

                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-foreground">
                        Ventana {topographyFrameIndex + 1} / {topographyData.time.length}
                      </span>
                      <span className="text-muted-foreground">
                        t≈{topographyStats.frameTime?.toFixed(2) ?? "0.00"}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, topographyData.time.length - 1)}
                      value={topographyFrameIndex}
                      onChange={handleTopographyFrameChange}
                      className="w-full accent-foreground"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-sm font-semibold text-foreground">Potencia por electrodo</p>
                    <p className="text-xs text-muted-foreground">
                      Valores de la ventana temporal seleccionada.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 divide-y divide-border/60 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-3">
                    {topographyRows.map((row) => (
                      <div key={row.channel} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: CHANNEL_COLORS[row.channel] ?? "#4B5563" }}
                          />
                          <span className="font-semibold text-foreground">{formatChannel(row.channel)}</span>
                        </div>
                        <span className="font-medium text-foreground">
                          {row.value.toFixed(4)} {topographyData.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3 border-t border-border p-4 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">Mínima</p>
                      <p className="mt-1 font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatNumber(topographyStats.minPower, 4, ` ${topographyData.unit}`)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">Máxima</p>
                      <p className="mt-1 font-semibold text-rose-600 dark:text-rose-400">
                        {formatNumber(topographyStats.maxPower, 4, ` ${topographyData.unit}`)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
  </>
}
