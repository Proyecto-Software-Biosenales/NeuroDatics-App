"use client"

import { type Dispatch, type SetStateAction } from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts"
import { Activity, Brain, Clock, Gauge, TrendingDown, TrendingUp } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { KpiCard } from "@/components/ui/KpiCard"
import { cn } from "@/lib/utils"
import { StimulusFixationCard } from "../StimulusFixationCard"
import { TimeWindowControls, type TimeWindow, type TimeWindowDraft } from "../TimeWindowControls"
import { AnalyticsChartShell } from "../AnalyticsChartShell"
import { type EegTimeseriesData } from "../../types"
import { formatChannel, type ChannelStats } from "../../eegPresentation"
import { EEG_CHANNELS, CHANNEL_COLORS, type SignalMode, type EegView, type EegChartPoint } from "./eegViewShared"
import { EegStatsTable } from "./EegStatsTables"
import { EegTooltip } from "./EegTooltips"

interface EegTimeseriesViewProps {
  availableChannels: string[]
  channelStats: ChannelStats[]
  chartData: EegChartPoint[]
  chartDomain: [number, number] | ["dataMin", "dataMax"]
  eegChartLegend: { label: string; color: string; }[]
  handleApplyTimeseriesWindow: () => void
  handleChannelToggle: (channel: string) => void
  handleChartClick: (state: unknown) => void
  handleResetTimeseriesWindow: () => void
  participantCode: string | null
  projectId: string
  scenario: string
  selectedChannels: string[]
  selectedEegValue: number | null
  selectedPoint: EegChartPoint | null
  selectedTime: number | null
  setSelectedTime: Dispatch<SetStateAction<number | null>>
  setSignalMode: Dispatch<SetStateAction<SignalMode>>
  setTimeseriesWindowDraft: Dispatch<SetStateAction<TimeWindowDraft>>
  setTimeseriesWindowError: Dispatch<SetStateAction<string | null>>
  signalMode: SignalMode
  timeExtremePoints: { minPoint: { time: number; value: number; } | null; maxPoint: { time: number; value: number; } | null; }
  timeRepresentativeStats: { meanValue: null; minValue: null; maxValue: null; } | { meanValue: number; minValue: number; maxValue: number; }
  timeseriesData: EegTimeseriesData | null
  timeseriesError: string | null
  timeseriesLoading: boolean
  timeseriesWindow: TimeWindow
  timeseriesWindowDraft: TimeWindowDraft
  timeseriesWindowError: string | null
  view: EegView
  visibleChannels: string[]
}

export function EegTimeseriesView({
  availableChannels,
  channelStats,
  chartData,
  chartDomain,
  eegChartLegend,
  handleApplyTimeseriesWindow,
  handleChannelToggle,
  handleChartClick,
  handleResetTimeseriesWindow,
  participantCode,
  projectId,
  scenario,
  selectedChannels,
  selectedEegValue,
  selectedPoint,
  selectedTime,
  setSelectedTime,
  setSignalMode,
  setTimeseriesWindowDraft,
  setTimeseriesWindowError,
  signalMode,
  timeExtremePoints,
  timeRepresentativeStats,
  timeseriesData,
  timeseriesError,
  timeseriesLoading,
  timeseriesWindow,
  timeseriesWindowDraft,
  timeseriesWindowError,
  view,
  visibleChannels,
}: EegTimeseriesViewProps) {
  return <>
{view === "timeseries" ? (
      <Card>
        <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Brain className="h-5 w-5" />
              EEG por canal
            </CardTitle>
            <CardDescription>
              Trazas de electroencefalografia por canal en el tiempo registrado.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-lg border border-border">
              {[
                { key: "smooth", label: "Suavizada" },
                { key: "raw", label: "Cruda" },
                { key: "both", label: "Ambas" },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setSignalMode(option.key as SignalMode)}
                  className={cn(
                    "px-3 py-1.5 text-sm",
                    signalMode === option.key
                      ? "bg-foreground text-background"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <TimeWindowControls
            draftStart={timeseriesWindowDraft.start}
            draftEnd={timeseriesWindowDraft.end}
            appliedWindow={timeseriesWindow}
            error={timeseriesWindowError}
            loading={timeseriesLoading}
            onDraftStartChange={(value) => {
              setTimeseriesWindowDraft((current) => ({ ...current, start: value }))
              setTimeseriesWindowError(null)
            }}
            onDraftEndChange={(value) => {
              setTimeseriesWindowDraft((current) => ({ ...current, end: value }))
              setTimeseriesWindowError(null)
            }}
            onApply={handleApplyTimeseriesWindow}
            onReset={handleResetTimeseriesWindow}
          />

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

          <div className="analytics-kpi-grid">
            <KpiCard
              label="Media"
              value={timeRepresentativeStats.meanValue}
              unit="uV"
              decimals={4}
              description="Promedio suavizado visible"
              Icon={Activity}
              loading={timeseriesLoading}
              iconBgClass="bg-emerald-100 dark:bg-emerald-900/40"
              iconColorClass="text-emerald-600 dark:text-emerald-400"
              labelColorClass="text-emerald-700 dark:text-emerald-400"
            />
            <KpiCard
              label="Mínimo"
              value={timeRepresentativeStats.minValue}
              unit="uV"
              decimals={4}
              description="Valor más bajo visible"
              Icon={TrendingDown}
              loading={timeseriesLoading}
              onClick={timeExtremePoints.minPoint ? () => setSelectedTime(timeExtremePoints.minPoint?.time ?? null) : undefined}
              active={selectedTime === timeExtremePoints.minPoint?.time}
              hoverBgClass="hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              activeBgClass="bg-emerald-50 dark:bg-emerald-950/30"
              iconBgClass="bg-emerald-100 dark:bg-emerald-900/40"
              iconColorClass="text-emerald-600 dark:text-emerald-400"
              labelColorClass="text-emerald-700 dark:text-emerald-400"
            />
            <KpiCard
              label="Máximo"
              value={timeRepresentativeStats.maxValue}
              unit="uV"
              decimals={4}
              description="Valor más alto visible"
              Icon={TrendingUp}
              loading={timeseriesLoading}
              onClick={timeExtremePoints.maxPoint ? () => setSelectedTime(timeExtremePoints.maxPoint?.time ?? null) : undefined}
              active={selectedTime === timeExtremePoints.maxPoint?.time}
              hoverBgClass="hover:bg-rose-50 dark:hover:bg-rose-950/30"
              activeBgClass="bg-rose-50 dark:bg-rose-950/30"
              iconBgClass="bg-rose-100 dark:bg-rose-900/40"
              iconColorClass="text-rose-600 dark:text-rose-400"
              labelColorClass="text-rose-700 dark:text-rose-400"
            />
          </div>

          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              {
                label: "Muestras",
                value: chartData.length.toLocaleString(),
                sub: "puntos renderizados",
                Icon: Activity,
                bg: "bg-blue-50 dark:bg-blue-950/40",
                iconColor: "text-blue-500",
              },
              {
                label: "Frecuencia",
                value: `${(timeseriesData?.sampling_rate_hz ?? 0).toFixed(2)}`,
                sub: "Hz estimados",
                Icon: Gauge,
                bg: "bg-emerald-50 dark:bg-emerald-950/40",
                iconColor: "text-emerald-500",
              },
              {
                label: "Canales",
                value: String(visibleChannels.length),
                sub: selectedChannels.map(formatChannel).join(", "),
                Icon: Brain,
                bg: "bg-violet-50 dark:bg-violet-950/40",
                iconColor: "text-violet-500",
              },
            ].map(({ label, value, sub, Icon, bg, iconColor }) => (
              <div
                key={label}
                className="flex min-h-24 items-center gap-3 rounded-lg border border-border bg-card px-4 py-4"
              >
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", bg)}>
                  <Icon className={cn("h-5 w-5", iconColor)} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-normal uppercase tracking-widest text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-1 text-2xl font-bold leading-tight text-foreground">
                    {value}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          {timeseriesLoading ? (
            <div className="analytics-state-frame-eeg w-full animate-pulse rounded-lg bg-muted" />
          ) : timeseriesError ? (
            <div className="analytics-state-frame-eeg flex items-center justify-center text-sm text-muted-foreground">
              No se pudo cargar la senal EEG.
            </div>
          ) : chartData.length === 0 || visibleChannels.length === 0 ? (
            <div className="analytics-state-frame-eeg flex items-center justify-center text-sm text-muted-foreground">
              No hay datos de EEG para los filtros seleccionados.
            </div>
          ) : (
            <AnalyticsChartShell legend={eegChartLegend} variant="eeg">
            <ResponsiveContainer className="analytics-chart-plot-frame" width="100%" height="100%">
              <LineChart
                data={chartData}
                onClick={handleChartClick}
                margin={{ top: 12, right: 24, left: 16, bottom: 28 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={chartDomain}
                  tickFormatter={(value) => String(Math.round(Number(value)))}
                  tickMargin={8}
                />
                <YAxis
                  width={80}
                  label={{ value: "EEG (uV)", angle: -90, position: "insideLeft", offset: 4, style: { textAnchor: "middle" } }}
                />
                <RechartsTooltip content={<EegTooltip />} />

                {selectedTime != null ? (
                  <ReferenceLine
                    x={selectedTime}
                    stroke="#374151"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    label={{ value: `${selectedTime.toFixed(1)}s`, position: "top", fontSize: 11, fill: "#374151" }}
                  />
                ) : null}

                {visibleChannels.map((channel) =>
                  signalMode === "smooth" || signalMode === "both" ? (
                    <Line
                      key={`${channel}-smooth`}
                      type="linear"
                      dataKey={`${channel}_smooth`}
                      name={`${formatChannel(channel)} suavizada`}
                      stroke={CHANNEL_COLORS[channel] ?? "#4B5563"}
                      strokeWidth={1.8}
                      dot={false}
                      activeDot={{ r: 3 }}
                      isAnimationActive={false}
                    />
                  ) : null
                )}

                {visibleChannels.map((channel) =>
                  signalMode === "raw" || signalMode === "both" ? (
                    <Line
                      key={`${channel}-raw`}
                      type="linear"
                      dataKey={`${channel}_raw`}
                      name={`${formatChannel(channel)} cruda`}
                      stroke={CHANNEL_COLORS[channel] ?? "#4B5563"}
                      strokeWidth={signalMode === "raw" ? 1.4 : 0.9}
                      strokeOpacity={signalMode === "raw" ? 1 : 0.36}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ) : null
                )}
              </LineChart>
            </ResponsiveContainer>
            </AnalyticsChartShell>
          )}
        </CardContent>
      </Card>
      ) : null}

{view === "timeseries" ? (
        <StimulusFixationCard
          projectId={projectId}
          participantCode={participantCode}
          scenario={scenario}
          selectedTime={selectedTime}
          selectedValue={selectedEegValue}
          selectedValueLabel="EEG"
          selectedValueSub="uV promedio"
          selectedValueDecimals={4}
          totalDurationS={chartData[chartData.length - 1]?.time ?? null}
          description="Ubicación de la mirada del participante durante el instante seleccionado de la señal EEG."
          emptyText="Haz clic en el gráfico o en Mínimo / Máximo para ver la mirada del participante"
          metricDescription="la amplitud EEG promedio"
          onClearSelection={() => setSelectedTime(null)}
        />
      ) : null}

{view === "timeseries" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Estadísticas EEG por canal</CardTitle>
            <CardDescription>
              Resumen de la señal suavizada para los canales seleccionados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {timeseriesLoading ? (
              <div className="h-52 w-full animate-pulse rounded-lg bg-muted" />
            ) : channelStats.length === 0 ? (
              <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
                No hay datos suficientes para calcular estadísticas.
              </div>
            ) : (
              <EegStatsTable rows={channelStats} />
            )}
          </CardContent>
        </Card>
      ) : null}

{view === "timeseries" && selectedPoint ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-4 w-4" />
              Punto seleccionado
            </CardTitle>
            <CardDescription>
              Lectura puntual de los canales visibles en el segundo seleccionado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 text-sm text-muted-foreground">
              Tiempo: <span className="font-medium text-foreground">{selectedPoint.time.toFixed(2)}s</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {visibleChannels.map((channel) => {
                const raw = selectedPoint[`${channel}_raw`]
                const smooth = selectedPoint[`${channel}_smooth`]
                return (
                  <div
                    key={channel}
                    className="rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: CHANNEL_COLORS[channel] ?? "#4B5563" }}
                      />
                      <span className="text-sm font-semibold text-foreground">
                        {formatChannel(channel)}
                      </span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Suavizada</span>
                        <span className="font-medium">{smooth.toFixed(4)} uV</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Cruda</span>
                        <span className="font-medium">{raw.toFixed(4)} uV</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
  </>
}
