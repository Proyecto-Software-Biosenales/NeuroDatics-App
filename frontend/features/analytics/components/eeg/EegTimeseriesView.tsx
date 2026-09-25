"use client"
import { AnalyticsModeSelector } from "@/features/analytics/components/AnalyticsModeSelector"
import { EegChannelSelector } from "./EegChannelSelector"

import { Skeleton } from "@/components/ui/skeleton"

import { useMemo, type Dispatch, type SetStateAction } from "react"
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts"
import { Activity, Brain, ChartSpline, Clock, Crosshair, Gauge, Rows3, Scissors, TrendingDown, TrendingUp, Waves } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { KpiCard } from "@/features/analytics/components/KpiCard"
import { cn } from "@/lib/utils"
import { StimulusFixationCard } from "../StimulusFixationCard"
import { TimeWindowControls, hasTimeWindow, type TimeWindow, type TimeWindowDraft } from "../TimeWindowControls"
import { AnalyticsChartShell, type AnalyticsChartNote, LINE_CHART_MARGIN } from "../AnalyticsChartShell"
import { useChartDragZoom } from "../ChartDragZoom"
import { axisTickDecimals, formatAxisTick } from "../../chartZoom"
import { type EegArtifactSpan, type EegTimeseriesData } from "../../types"
import { clusterArtifactSpans, envelopeWarning, formatChannel, formatNumber, type ChannelStats, type MontageLane } from "../../eegPresentation"
import { ARTIFACT_DETECTOR_COLORS, EEG_ARTIFACT_SPANS_ID, EEG_CHANNELS, EEG_TIMESERIES_CHART_ID, CHANNEL_COLORS, JUMP_TARGET_CLASS, scrollToSection, type SignalMode, type EegView, type EegChartPoint, type ChartLayout } from "./eegViewShared"
import { EegStatsTable } from "./EegStatsTables"
import { EegTooltip } from "./EegTooltips"
import { ArtifactDetectorLegend } from "./EegQualityPanel"

interface EegTimeseriesViewProps {
  availableChannels: string[]
  channelStats: ChannelStats[]
  chartData: EegChartPoint[]
  chartDomain: [number, number] | ["dataMin", "dataMax"]
  eegChartLegend: { label: string; color: string; }[]
  handleApplyTimeseriesWindow: () => void
  handleBackTimeseriesWindow?: () => void
  handleChannelToggle: (channel: string) => void
  handleChartClick: (state: unknown) => void
  handleResetTimeseriesWindow: () => void
  handleZoomTimeseriesWindow: (start: number, end: number) => void
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
  timeRepresentativeStats: { meanValue: number | null; minValue: number | null; maxValue: number | null; }
  timeseriesData: EegTimeseriesData | null
  timeseriesError: string | null
  timeseriesLoading: boolean
  timeseriesWindow: TimeWindow
  timeseriesWindowDraft: TimeWindowDraft
  timeseriesWindowError: string | null
  view: EegView
  visibleChannels: string[]
  artifactSpans: EegArtifactSpan[]
  chartLayout: ChartLayout
  setChartLayout: Dispatch<SetStateAction<ChartLayout>>
  focusChannel: string | null
  setFocusChannel: Dispatch<SetStateAction<string | null>>
  montage: { lanes: MontageLane[]; spacing: number; domain: [number, number] }
  yDomain: { min: number; max: number; clippedLow: number; clippedHigh: number } | null
  /** Points at the quality card that closes the tab; absent on a clean export. */
  qualityNote: AnalyticsChartNote | null
}

export function EegTimeseriesView({
  availableChannels,
  channelStats,
  chartData,
  chartDomain,
  eegChartLegend,
  handleApplyTimeseriesWindow,
  handleBackTimeseriesWindow,
  handleChannelToggle,
  handleChartClick,
  handleResetTimeseriesWindow,
  handleZoomTimeseriesWindow,
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
  artifactSpans,
  chartLayout,
  setChartLayout,
  focusChannel,
  setFocusChannel,
  montage,
  yDomain,
  qualityNote,
}: EegTimeseriesViewProps) {
  const dragZoom = useChartDragZoom(handleZoomTimeseriesWindow)
  const stacked = chartLayout === "stacked"
  const laneByOffset = new Map(montage.lanes.map((lane) => [lane.offset, lane.channel]))
  const clipped = (yDomain?.clippedLow ?? 0) + (yDomain?.clippedHigh ?? 0)
  const focusLabel = focusChannel ? formatChannel(focusChannel) : "—"
  const laneSpan = montage.spacing / 1.2
  const laneScale = formatNumber(laneSpan, laneSpan >= 100 ? 0 : 1, " uV")
  // The chips count events; the chart shades the same events, not every
  // detector run, so a cluster of runs 10 ms apart reads as one band.
  const artifactEvents = useMemo(() => clusterArtifactSpans(artifactSpans), [artifactSpans])
  const laneOffset = new Map(montage.lanes.map((lane) => [lane.channel, lane.offset]))
  // A one-sample event has zero width and Recharts draws nothing for it; give
  // every band a few pixels so each counted event can be found on the chart.
  const minBandS = chartDomain[0] === "dataMin" ? 0 : (chartDomain[1] - chartDomain[0]) * 0.004
  const envelope = envelopeWarning(timeseriesData?.metadata)
  const chartNotes: AnalyticsChartNote[] = [
    ...(signalMode !== "raw"
      ? [{
          id: "smoothing",
          Icon: Waves,
          label: "Suavizado 0.2 s",
          detail: "La media móvil de 0.2 s atenúa ritmos EEG; úsala sólo para explorar tendencias.",
        }]
      : []),
    ...(envelope
      ? [{
          id: "envelope",
          Icon: ChartSpline,
          label: "Envolvente",
          detail: envelope,
        }]
      : []),
    ...(stacked
      ? [{
          id: "montage",
          Icon: Rows3,
          label: `${laneScale} por carril`,
          detail: `Un carril por canal, ${laneScale} de escala en cada uno; el desplazamiento es sólo de dibujo. El tooltip y las estadísticas leen el valor registrado.`,
        }]
      : clipped > 0 && yDomain
        ? [{
            id: "clipped-axis",
            tone: "warning" as const,
            Icon: Scissors,
            label: `Eje recortado · ${clipped.toLocaleString()} puntos fuera`,
            detail: `Eje recortado a ${formatNumber(yDomain.min, 0, "")}…${formatNumber(yDomain.max, 0, " uV")} para que una excursión no aplaste los demás canales: ${clipped.toLocaleString()} puntos quedan fuera de la vista. El valor real sigue en el tooltip y en las estadísticas.`,
          }]
        : []),
    ...(artifactEvents.length > 0
      ? [{
          id: "artifact-spans",
          Icon: Crosshair,
          label: `${artifactEvents.length} ${artifactEvents.length === 1 ? "evento marcado" : "eventos marcados"}`,
          detail: (
            <>
              <p>
                {artifactEvents.length} {artifactEvents.length === 1 ? "evento" : "eventos"} ({artifactSpans.length}{" "}
                {artifactSpans.length === 1 ? "tramo" : "tramos"} del detector) sombreados como artefacto candidato; la
                señal no se ha modificado. Clic para ver la lista.
              </p>
              <ArtifactDetectorLegend />
            </>
          ),
          onClick: () => scrollToSection(EEG_ARTIFACT_SPANS_ID),
        }]
      : []),
    ...(qualityNote ? [qualityNote] : []),
  ]
  return <>
{view === "timeseries" ? (
      <Card id={EEG_TIMESERIES_CHART_ID} tabIndex={-1} className={JUMP_TARGET_CLASS}>
        <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Brain className="h-5 w-5" />
              EEG por canal
            </CardTitle>
            <CardDescription>
              Trazas EEG sin corrección de artefactos.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-3 xl:shrink-0">
            <AnalyticsModeSelector value={signalMode} onValueChange={setSignalMode} options={[
                { key: "smooth", label: "Suavizada" },
                { key: "raw", label: "Cruda" },
                { key: "both", label: "Ambas" },
              ]} />
            <AnalyticsModeSelector value={chartLayout} onValueChange={setChartLayout} options={[
                { key: "overlay", label: "Superpuesta" },
                { key: "stacked", label: "Montaje" },
              ]} />
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
          </div>
        </CardHeader>

        <CardContent>
          <EegChannelSelector channels={EEG_CHANNELS} availableChannels={availableChannels} selectedChannels={selectedChannels} onToggle={handleChannelToggle} />

          {/* Medians here run from -1,256 uV to +988 uV between channels, so one
              number over all of them describes nothing. Pick whose it is. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm roomy:mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Estadísticas de:</span>
              {visibleChannels.map((channel) => (
                <Button
                  key={channel}
                  variant="outline"
                  size="sm"
                  aria-pressed={channel === focusChannel}
                  onClick={() => setFocusChannel(channel)}
                  className={cn(
                    "h-auto px-2 py-1 text-xs font-semibold",
                    channel === focusChannel
                      ? "border-transparent text-white hover:text-white"
                      : "text-muted-foreground"
                  )}
                  style={
                    channel === focusChannel
                      ? { backgroundColor: CHANNEL_COLORS[channel] ?? "#4B5563" }
                      : undefined
                  }
                >
                  {formatChannel(channel)}
                </Button>
              ))}
            </div>

            {/* Recording facts, not results: one line instead of a second row of cards. */}
            <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {[
                { label: "Muestras", value: chartData.length.toLocaleString(), sub: "puntos renderizados", Icon: Activity, iconColor: "text-blue-500" },
                { label: "Frecuencia", value: `${(timeseriesData?.sampling_rate_hz ?? 0).toFixed(2)}`, sub: "Hz estimados", Icon: Gauge, iconColor: "text-emerald-500" },
                { label: "Canales", value: String(visibleChannels.length), sub: "canales", title: selectedChannels.map(formatChannel).join(", "), Icon: Brain, iconColor: "text-violet-500" },
              ].map(({ label, value, sub, title, Icon, iconColor }) => (
                <div key={label} className="inline-flex items-center gap-1.5" title={title}>
                  <Icon aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0", iconColor)} />
                  <dt className="sr-only">{label}</dt>
                  <dd className="flex items-baseline gap-1">
                    <span className="font-semibold text-foreground">{value}</span>
                    <span>{sub}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="analytics-kpi-grid">
            <KpiCard
              label={`Media · ${focusLabel}`}
              value={timeRepresentativeStats.meanValue}
              unit="uV"
              decimals={4}
              description={signalMode === "smooth" ? "Media de muestras suavizadas válidas" : "Media de muestras crudas válidas"}
              Icon={Activity}
              loading={timeseriesLoading}
              iconBgClass="bg-emerald-100 dark:bg-emerald-900/40"
              iconColorClass="text-emerald-600 dark:text-emerald-400"
              labelColorClass="text-emerald-700 dark:text-emerald-400"
            />
            <KpiCard
              label={`Mínimo · ${focusLabel}`}
              value={timeRepresentativeStats.minValue}
              unit="uV"
              decimals={4}
              description="Mínimo de muestras válidas"
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
              label={`Máximo · ${focusLabel}`}
              value={timeRepresentativeStats.maxValue}
              unit="uV"
              decimals={4}
              description="Máximo de muestras válidas"
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

          {timeseriesLoading ? (
            <Skeleton className="analytics-state-frame-eeg w-full animate-pulse rounded-lg bg-muted" />
          ) : timeseriesError ? (
            <div className="analytics-state-frame-eeg flex items-center justify-center text-sm text-muted-foreground">
              No se pudo cargar la senal EEG.
            </div>
          ) : chartData.length === 0 || visibleChannels.length === 0 ? (
            <div className="analytics-state-frame-eeg flex items-center justify-center text-sm text-muted-foreground">
              No hay datos de EEG para los filtros seleccionados.
            </div>
          ) : (
            <AnalyticsChartShell
              legend={eegChartLegend}
              notes={chartNotes}
              variant="eeg"
              dragZoom={dragZoom}
              onZoomReset={hasTimeWindow(timeseriesWindow) ? handleResetTimeseriesWindow : undefined}
              onZoomBack={handleBackTimeseriesWindow}
            >
            <ResponsiveContainer className="analytics-chart-plot-frame" width="100%" height="100%">
              <LineChart
                data={chartData}
                {...dragZoom.chartProps(handleChartClick)}
                margin={LINE_CHART_MARGIN}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={chartDomain}
                  tickFormatter={(value) => formatAxisTick(value, axisTickDecimals(chartDomain))}
                  tickMargin={8}
                />
                <YAxis
                  width={80}
                  domain={stacked ? montage.domain : yDomain ? [yDomain.min, yDomain.max] : ["auto", "auto"]}
                  allowDataOverflow={!stacked && yDomain != null}
                  ticks={stacked ? montage.lanes.map((lane) => lane.offset) : undefined}
                  tickFormatter={
                    stacked
                      ? (value: number) => formatChannel(laneByOffset.get(value) ?? "")
                      : yDomain
                        ? (value: number) => formatAxisTick(value, axisTickDecimals([yDomain.min, yDomain.max]))
                        : undefined
                  }
                  label={{ value: stacked ? "Canal" : "EEG (uV)", angle: -90, position: "insideLeft", offset: 4, style: { textAnchor: "middle" } }}
                />
                <RechartsTooltip content={<EegTooltip />} />

                {artifactEvents.map((event) => {
                  // In the montage a band covers only its own channel's lane.
                  const offset = stacked ? laneOffset.get(event.channel) : undefined
                  const pad = Math.max(0, (minBandS - (event.end_s - event.start_s)) / 2)
                  return (
                    <ReferenceArea
                      key={`${event.channel}-${event.start_s}`}
                      className="eeg-artifact-band"
                      x1={event.start_s - pad}
                      x2={event.end_s + pad}
                      y1={offset != null ? offset - montage.spacing / 2 : undefined}
                      y2={offset != null ? offset + montage.spacing / 2 : undefined}
                      fill={ARTIFACT_DETECTOR_COLORS[event.detectors[0]] ?? "#DC2626"}
                      fillOpacity={0.12}
                      stroke="none"
                      ifOverflow="hidden"
                    />
                  )
                })}

                {selectedTime != null ? (
                  <ReferenceLine
                    x={selectedTime}
                    className="analytics-selected-time"
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
                      dataKey={stacked ? `${channel}_smooth_lane` : `${channel}_smooth`}
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
                      dataKey={stacked ? `${channel}_raw_lane` : `${channel}_raw`}
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
              Resumen antes de reducir puntos del gráfico; señal {signalMode === "smooth" ? "suavizada" : "cruda"}, en uV.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {timeseriesLoading ? (
              <Skeleton className="h-52 w-full animate-pulse rounded-lg bg-muted" />
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
                        <span className="font-medium">{formatNumber(smooth, 4, " uV")}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Cruda</span>
                        <span className="font-medium">{formatNumber(raw, 4, " uV")}</span>
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
