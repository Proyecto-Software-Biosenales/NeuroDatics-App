"use client"

import { type Dispatch, type SetStateAction } from "react"
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts"
import { Radio, TrendingUp, Waves } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { KpiCard } from "@/components/ui/KpiCard"
import { cn } from "@/lib/utils"
import { TimeWindowControls, type TimeWindow, type TimeWindowDraft } from "../TimeWindowControls"
import { AnalyticsChartShell } from "../AnalyticsChartShell"
import { type EegPsdData } from "../../types"
import { formatChannel } from "../../eegPresentation"
import { EEG_CHANNELS, CHANNEL_COLORS, type EegView, type EegPsdChartPoint, type PsdStats } from "./eegViewShared"
import { PsdStatsTable } from "./EegStatsTables"
import { PsdTooltip } from "./EegTooltips"

interface EegPsdViewProps {
  availableChannels: string[]
  handleApplyPsdWindow: () => void
  handleChannelToggle: (channel: string) => void
  handleResetPsdWindow: () => void
  psdChartData: EegPsdChartPoint[]
  psdChartLegend: { label: string; color: string; }[]
  psdData: EegPsdData | null
  psdDomain: [number, number] | ["dataMin", "dataMax"]
  psdError: string | null
  psdLoading: boolean
  psdRepresentativeStats: { peakFrequency: null; peakPower: null; meanPower: null; } | { peakFrequency: number; peakPower: number; meanPower: number | null; }
  psdStats: PsdStats[]
  psdWindow: TimeWindow
  psdWindowDraft: TimeWindowDraft
  psdWindowError: string | null
  selectedChannels: string[]
  setPsdWindowDraft: Dispatch<SetStateAction<TimeWindowDraft>>
  setPsdWindowError: Dispatch<SetStateAction<string | null>>
  view: EegView
  visiblePsdChannels: string[]
}

export function EegPsdView({
  availableChannels,
  handleApplyPsdWindow,
  handleChannelToggle,
  handleResetPsdWindow,
  psdChartData,
  psdChartLegend,
  psdData,
  psdDomain,
  psdError,
  psdLoading,
  psdRepresentativeStats,
  psdStats,
  psdWindow,
  psdWindowDraft,
  psdWindowError,
  selectedChannels,
  setPsdWindowDraft,
  setPsdWindowError,
  view,
  visiblePsdChannels,
}: EegPsdViewProps) {
  return <>
{view === "psd" ? (
      <Card>
        <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Radio className="h-5 w-5" />
              Densidad espectral de potencia
            </CardTitle>
            <CardDescription>
              Potencia por frecuencia de los canales EEG seleccionados.
            </CardDescription>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="block text-xs uppercase tracking-widest text-muted-foreground">Unidad</span>
              <span className="font-semibold text-foreground">{psdData?.unit ?? "dB"}</span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-widest text-muted-foreground">Bins</span>
              <span className="font-semibold text-foreground">{psdChartData.length.toLocaleString()}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TimeWindowControls
            draftStart={psdWindowDraft.start}
            draftEnd={psdWindowDraft.end}
            appliedWindow={psdWindow}
            error={psdWindowError}
            loading={psdLoading}
            onDraftStartChange={(value) => {
              setPsdWindowDraft((current) => ({ ...current, start: value }))
              setPsdWindowError(null)
            }}
            onDraftEndChange={(value) => {
              setPsdWindowDraft((current) => ({ ...current, end: value }))
              setPsdWindowError(null)
            }}
            onApply={handleApplyPsdWindow}
            onReset={handleResetPsdWindow}
          />

              <div className="analytics-kpi-grid">
            <KpiCard
              label="Frecuencia pico"
              value={psdRepresentativeStats.peakFrequency}
              unit="Hz"
              decimals={2}
              description="Máxima potencia observada"
              Icon={Radio}
              loading={psdLoading}
              iconBgClass="bg-violet-100 dark:bg-violet-900/40"
              iconColorClass="text-violet-600 dark:text-violet-400"
              labelColorClass="text-violet-700 dark:text-violet-400"
            />
            <KpiCard
              label="Potencia pico"
              value={psdRepresentativeStats.peakPower}
              unit={psdData?.unit ?? "dB"}
              decimals={4}
              description="Mayor PSD entre canales"
              Icon={TrendingUp}
              loading={psdLoading}
              iconBgClass="bg-rose-100 dark:bg-rose-900/40"
              iconColorClass="text-rose-600 dark:text-rose-400"
              labelColorClass="text-rose-700 dark:text-rose-400"
            />
            <KpiCard
              label="Potencia media"
              value={psdRepresentativeStats.meanPower}
              unit={psdData?.unit ?? "dB"}
              decimals={4}
              description="Promedio espectral visible"
              Icon={Waves}
              loading={psdLoading}
              iconBgClass="bg-emerald-100 dark:bg-emerald-900/40"
              iconColorClass="text-emerald-600 dark:text-emerald-400"
              labelColorClass="text-emerald-700 dark:text-emerald-400"
            />
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {EEG_CHANNELS.map((channel) => {
              const isActive = selectedChannels.includes(channel)
              const isAvailable = availableChannels.includes(channel)
              return (
                <button
                  key={channel}
                  type="button"
                  onClick={() => handleChannelToggle(channel)}
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

          {psdLoading ? (
            <div className="analytics-state-frame-mid w-full animate-pulse rounded-lg bg-muted" />
          ) : psdError ? (
            <div className="analytics-state-frame-mid flex items-center justify-center text-sm text-muted-foreground">
              No se pudo cargar la PSD de EEG.
            </div>
          ) : psdChartData.length === 0 || visiblePsdChannels.length === 0 ? (
            <div className="analytics-state-frame-mid flex items-center justify-center text-sm text-muted-foreground">
              No hay datos suficientes para calcular la PSD.
            </div>
          ) : (
            <AnalyticsChartShell legend={psdChartLegend} xAxisLabel="Frecuencia (Hz)" variant="mid">
            <ResponsiveContainer className="analytics-chart-plot-frame" width="100%" height="100%">
              <LineChart
                data={psdChartData}
                margin={{ top: 12, right: 24, left: 16, bottom: 28 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="frequency"
                  type="number"
                  domain={psdDomain}
                  tickFormatter={(value) => Number(value).toFixed(1)}
                  tickMargin={8}
                />
                <YAxis
                  width={92}
                  label={{
                    value: `PSD (${psdData?.unit ?? "dB"})`,
                    angle: -90,
                    position: "insideLeft",
                    offset: 4,
                    style: { textAnchor: "middle" },
                  }}
                />
                <RechartsTooltip content={<PsdTooltip unit={psdData?.unit ?? "dB"} />} />

                {visiblePsdChannels.map((channel) => (
                  <Line
                    key={`${channel}-psd`}
                    type="linear"
                    dataKey={channel}
                    name={formatChannel(channel)}
                    stroke={CHANNEL_COLORS[channel] ?? "#4B5563"}
                    strokeWidth={1.6}
                    dot={false}
                    activeDot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            </AnalyticsChartShell>
          )}
        </CardContent>
      </Card>
      ) : null}

{view === "psd" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Estadísticas de densidad espectral</CardTitle>
            <CardDescription>
              Resumen de potencia y frecuencia pico para los canales seleccionados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {psdLoading ? (
              <div className="h-52 w-full animate-pulse rounded-lg bg-muted" />
            ) : psdStats.length === 0 ? (
              <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
                No hay datos suficientes para calcular estadísticas espectrales.
              </div>
            ) : (
              <PsdStatsTable rows={psdStats} unit={psdData?.unit ?? "dB"} />
            )}
          </CardContent>
        </Card>
      ) : null}
  </>
}
