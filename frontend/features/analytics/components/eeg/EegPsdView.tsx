"use client"
import { EegChannelSelector } from "./EegChannelSelector"


import { Skeleton } from "@/components/ui/skeleton"

import { type Dispatch, type SetStateAction } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts"
import { CircleDashed, Crosshair, Radio, TrendingUp, Waves } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { KpiCard } from "@/features/analytics/components/KpiCard"

import { TimeWindowControls, type TimeWindow, type TimeWindowDraft } from "../TimeWindowControls"
import { AnalyticsChartShell, type AnalyticsChartNote, LINE_CHART_MARGIN } from "../AnalyticsChartShell"
import { InfoChip } from "../InfoChip"
import { useChartDragZoom } from "../ChartDragZoom"
import { axisTickDecimals, formatAxisTick } from "../../chartZoom"
import { type EegPsdData } from "../../types"
import { formatChannel } from "../../eegPresentation"
import { EEG_CHANNELS, CHANNEL_COLORS, type EegView, type EegPsdChartPoint, type PsdStats } from "./eegViewShared"
import { PsdStatsTable } from "./EegStatsTables"
import { PsdTooltip } from "./EegTooltips"

/** What the response says about contaminated windows, as a chart chip. */
function psdWindowFlagNote(psdData: EegPsdData | null): AnalyticsChartNote | null {
  const total = psdData?.metadata?.windows_total ?? {}
  const flagged = psdData?.metadata?.windows_flagged ?? {}
  // Per channel: a sum over channels hid that F3 alone had 12 of its 63.
  const affected = Object.keys(total).filter((channel) => (flagged[channel] ?? 0) > 0)
  if (affected.length === 0) return null
  const excluded = psdData?.metadata?.artifact_windows_excluded === true
  const ratio = (channel: string) => `${flagged[channel]}/${total[channel]}`
  return {
    id: "flagged-windows",
    tone: excluded ? "neutral" : "warning",
    Icon: Crosshair,
    label:
      affected.length <= 2
        ? `Ventanas con artefacto: ${affected.map((channel) => `${formatChannel(channel)} ${ratio(channel)}`).join(" · ")}`
        : `Ventanas con artefacto en ${affected.length} canales`,
    detail: (
      <>
        <ul className="space-y-0.5 tabular-nums">
          {affected.map((channel) => (
            <li key={channel}>
              <strong>{formatChannel(channel)}</strong>: {ratio(channel)} ventanas solapan un artefacto
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          {excluded ? "Están excluidas de la PSD." : "Siguen incluidas en la PSD."} Welch solapa sus ventanas un 50 %,
          así que una muestra con artefacto cae en dos.
        </p>
      </>
    ),
  }
}

interface EegPsdViewProps {
  availableChannels: string[]
  handleApplyPsdWindow: () => void
  handleChannelToggle: (channel: string) => void
  handleResetPsdWindow: () => void
  handleZoomPsdFrequency: (start: number, end: number) => void
  handleResetPsdFrequencyZoom?: () => void
  handleBackPsdFrequencyZoom?: () => void
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
  excludeArtifactWindows: boolean
  setExcludeArtifactWindows: Dispatch<SetStateAction<boolean>>
  selectedChannels: string[]
  setPsdWindowDraft: Dispatch<SetStateAction<TimeWindowDraft>>
  setPsdWindowError: Dispatch<SetStateAction<string | null>>
  view: EegView
  visiblePsdChannels: string[]
  /** Points at the quality card that closes the tab; absent on a clean export. */
  qualityNote: AnalyticsChartNote | null
}

export function EegPsdView({
  availableChannels,
  handleApplyPsdWindow,
  handleChannelToggle,
  handleResetPsdWindow,
  handleZoomPsdFrequency,
  handleResetPsdFrequencyZoom,
  handleBackPsdFrequencyZoom,
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
  excludeArtifactWindows,
  setExcludeArtifactWindows,
  selectedChannels,
  setPsdWindowDraft,
  setPsdWindowError,
  view,
  visiblePsdChannels,
  qualityNote,
}: EegPsdViewProps) {
  const dragZoom = useChartDragZoom(handleZoomPsdFrequency)
  // One reason per channel: the backend also names a channel whose every
  // window was excluded, which is not in incomplete_channels.
  const unavailable = Object.entries(psdData?.metadata?.channel_unavailable_reason ?? {})
  const incompleteNote: AnalyticsChartNote | null =
    unavailable.length > 0
      ? {
          id: "incomplete-channels",
          tone: "warning",
          Icon: CircleDashed,
          label: `Sin PSD: ${unavailable.map(([channel]) => formatChannel(channel)).join(", ")}`,
          detail: (
            <>
              <ul className="space-y-0.5">
                {unavailable.map(([channel, reason]) => (
                  <li key={channel}>
                    <strong>{formatChannel(channel)}</strong>: {reason}.
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground">
                Acortar la ventana para todos movería la potencia de los demás canales.
              </p>
            </>
          ),
        }
      : null
  const chartNotes = [psdWindowFlagNote(psdData), incompleteNote, qualityNote].filter(
    (note): note is AnalyticsChartNote => note != null
  )
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
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div>
              <span className="block text-xs uppercase tracking-widest text-muted-foreground">Unidad</span>
              <span className="font-semibold text-foreground">{psdData?.unit ?? "dB"}</span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-widest text-muted-foreground">Bins</span>
              <span className="font-semibold text-foreground">{psdChartData.length.toLocaleString()}</span>
            </div>
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
              zoomHint="Arrastra sobre la gráfica para ampliar un rango de frecuencias."
            />
            {/* Welch overlaps its windows by 50 %, so one artifact sample lands
                in two of them. The contaminated number is the default. */}
            <Label
              htmlFor="psd-exclude-artifact-windows"
              className="flex items-center gap-2 whitespace-nowrap text-xs font-normal text-muted-foreground"
            >
              <Checkbox
                id="psd-exclude-artifact-windows"
                checked={excludeArtifactWindows}
                onCheckedChange={(value) => setExcludeArtifactWindows(value === true)}
              />
              Excluir ventanas con artefacto
            </Label>
          </div>
        </CardHeader>
        <CardContent>
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
              label="Densidad pico"
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
              label="Nivel medio"
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

          <EegChannelSelector channels={EEG_CHANNELS} availableChannels={availableChannels} selectedChannels={selectedChannels} onToggle={handleChannelToggle} />

          {psdLoading ? (
            <Skeleton className="analytics-state-frame-mid w-full animate-pulse rounded-lg bg-muted" />
          ) : psdError ? (
            <div className="analytics-state-frame-mid flex items-center justify-center text-sm text-muted-foreground">
              No se pudo cargar la PSD de EEG.
            </div>
          ) : psdChartData.length === 0 || visiblePsdChannels.length === 0 ? (
            <div className="analytics-state-frame-mid flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              No hay datos suficientes para calcular la PSD.
              {incompleteNote ? <InfoChip {...incompleteNote} /> : null}
            </div>
          ) : (
            <AnalyticsChartShell
              legend={psdChartLegend}
              notes={chartNotes}
              xAxisLabel="Frecuencia (Hz)"
              variant="mid"
              dragZoom={dragZoom}
              onZoomReset={handleResetPsdFrequencyZoom}
              onZoomBack={handleBackPsdFrequencyZoom}
            >
            <ResponsiveContainer className="analytics-chart-plot-frame" width="100%" height="100%">
              <LineChart
                data={psdChartData}
                {...dragZoom.chartProps()}
                margin={LINE_CHART_MARGIN}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="frequency"
                  type="number"
                  domain={psdDomain}
                  tickFormatter={(value) => formatAxisTick(value, Math.max(1, axisTickDecimals(psdDomain)))}
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
              <Skeleton className="h-52 w-full animate-pulse rounded-lg bg-muted" />
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
