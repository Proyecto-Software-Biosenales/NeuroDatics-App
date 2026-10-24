"use client"

import { useMemo, type ReactNode } from "react"
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { KpiCard, type KpiCardProps } from "../KpiCard"
import { InfoChip } from "../InfoChip"
import { AnalyticsChartShell, LINE_CHART_MARGIN, type AnalyticsChartNote } from "../AnalyticsChartShell"
import { AnalyticsMessageSurface } from "../AnalyticsMessageSurface"
import { useChartDragZoom } from "../ChartDragZoom"
import { axisTickDecimals, formatAxisTick } from "../../chartZoom"
import { fittedAxis } from "../../fittedAxis"
import { formatNumber, type AveragedFigures } from "../../eegPresentation"
import { groupLoadNotes } from "../../groupMode/groupNotes"
import type { GroupMode } from "../../groupMode/groupSupport"
import type { GroupData } from "../../groupMode/useGroupData"
import type { EegGroupEntry, GroupPsd } from "./useEegGroupData"

const AVERAGE_COLOR = "var(--group-average)"
const MAX_LEGEND_ITEMS = 8
const MAX_TOOLTIP_ROWS = 10

const participantsText = (count: number) => (count === 1 ? "1 participante" : `${count} participantes`)

/** What a group view puts in place of its own cards, chart and statistics. */
export interface EegGroupSlots {
  /** Replaces the KPI cards; null shows none («Superposición»). */
  kpis: ReactNode
  /**
   * Replaces the chart; when absent the view draws the group's data itself.
   * A function receives the view's own display toggles.
   */
  chart?: ReactNode | ((view: { fit: boolean }) => ReactNode)
  /** Replaces the statistics card. */
  stats: ReactNode
  /** Chips for the view's own colour bar (load state, how it is computed). */
  notes?: ReactNode
  /** No group data yet: the view shows its loading placeholder. */
  loading?: boolean
}

/** The chart slot, given the view's display toggles. */
export function groupChart(group: EegGroupSlots, view: { fit: boolean } = { fit: false }): ReactNode {
  return typeof group.chart === "function" ? group.chart(view) : group.chart
}

// ---------------------------------------------------------------------------
// KPI cards and statistics table
// ---------------------------------------------------------------------------

export type EegGroupKpi<K extends string> = Omit<KpiCardProps, "value" | "loading" | "onClick" | "active" | "description" | "tooltipExtra"> & {
  field: K
}

/** «Promedio» cards: the view's own cards, each the mean over participants of that participant's figure. */
export function EegGroupKpis<K extends string>({
  kpis,
  average,
  loading,
  className = "analytics-kpi-grid",
  children,
}: {
  kpis: EegGroupKpi<K>[]
  average: AveragedFigures<K>
  loading?: boolean
  className?: string
  /** Cards that are not a participant's figure (e.g. the chosen instant), drawn first. */
  children?: ReactNode
}) {
  return (
    <div className={className} data-testid="group-kpis">
      {children}
      {kpis.map(({ field, ...card }) => (
        <KpiCard
          key={card.label}
          {...card}
          loading={loading}
          value={average.values[field] ?? null}
          description={`Promedio de ${participantsText(average.n[field])}`}
        />
      ))}
    </div>
  )
}

export interface EegGroupColumn<K extends string> {
  field: K
  label: string
  decimals: number
  /** Suffix, with its leading space (" uV", " Hz"). */
  unit?: string
  className?: string
}

/**
 * The statistics card of an EEG view in a group mode. «Superposición»: one
 * row per participant with its colour. «Promedio»: the «Promedio (n
 * participantes)» row first, then each participant.
 */
export function EegGroupStatsCard<K extends string>({
  mode,
  columns,
  entries,
  average,
  loading,
  db,
  detail,
}: {
  mode: GroupMode
  columns: EegGroupColumn<K>[]
  entries: EegGroupEntry<K>[]
  average: AveragedFigures<K>
  loading?: boolean
  /** Some figures are power levels in dB. */
  db?: boolean
  detail?: ReactNode
}) {
  const rows = useMemo(
    () => [
      ...(mode === "average"
        ? [{ key: "group-average", label: `Promedio (${participantsText(average.participants)})`, color: AVERAGE_COLOR, values: average.values, average: true }]
        : []),
      ...entries.map(({ participant, values }) => ({ key: participant.code, label: participant.label, color: participant.color, values, average: false })),
    ],
    [average, entries, mode]
  )
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64 space-y-1.5">
          <CardTitle className="text-lg">Estadísticas</CardTitle>
          <CardDescription>Las cifras de cada participante, calculadas igual que en su vista individual.</CardDescription>
        </div>
        <InfoChip
          label="Cómo se calcula"
          detail={
            <>
              <span>Cada fila de participante usa su propio escenario completo, desde el inicio.</span>
              {mode === "average" ? (
                <span>
                  La fila «Promedio» es la media, entre participantes, de la cifra de cada uno; solo cuentan los
                  participantes que tienen esa cifra.
                </span>
              ) : null}
              {mode === "average" && db ? <span>Los niveles en dB se promedian en potencia lineal y se pasan a dB después.</span> : null}
              {detail ? <span>{detail}</span> : null}
            </>
          }
        />
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <Skeleton className="h-52 w-full animate-pulse rounded-lg bg-muted" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Table className="w-full text-sm">
              <TableHeader>
                <TableRow className="border-b border-border bg-muted/60">
                  {["Participante", ...columns.map((column) => column.label)].map((header, index) => (
                    <TableHead
                      key={header}
                      className={cn(
                        "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                        index === 0 ? "text-left" : "text-right"
                      )}
                    >
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.key}
                    className={cn("border-b border-border/50 last:border-b-0 hover:bg-muted/30", row.average && "bg-muted/20")}
                  >
                    <TableCell className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                        <span className="whitespace-nowrap font-semibold text-foreground">{row.label}</span>
                      </div>
                    </TableCell>
                    {columns.map((column) => (
                      <TableCell
                        key={column.field}
                        className={cn("whitespace-nowrap px-4 py-4 text-right text-foreground/80", column.className)}
                      >
                        {formatNumber(row.values?.[column.field] ?? null, column.decimals, column.unit ?? "")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Densidad espectral: one line per participant, or the mean with ±1 SD
// ---------------------------------------------------------------------------

type PsdRow = { frequency: number; mean: number | null; band: [number, number] | null; low: number | null; high: number | null; n: number } & Record<string, unknown>

function GroupPsdTooltip({
  active,
  payload,
  mode,
  psd,
}: {
  active?: boolean
  payload?: Array<{ payload?: PsdRow }>
  mode: GroupMode
  psd: GroupPsd
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  const format = (value: number) => `${value.toFixed(2).replace(".", ",")} ${psd.unit}`
  if (mode === "average") {
    return (
      <div className="rounded-lg bg-gray-800 px-3 py-2 text-xs text-white shadow-lg">
        <p className="mb-1 font-medium text-gray-300">{row.frequency.toFixed(2)} Hz</p>
        <p className="font-medium">Promedio: {row.mean == null ? "—" : format(row.mean)}</p>
        <p>
          ±1 desviación estándar: {row.low == null ? "hasta abajo" : format(row.low)} a {row.high == null ? "—" : format(row.high)}
        </p>
        <p className="text-gray-300">{participantsText(row.n)} en esta frecuencia</p>
      </div>
    )
  }
  const values = psd.series.flatMap((series, index) => {
    const value = row[`s${index}`]
    return typeof value === "number" ? [{ series, value }] : []
  })
  const shown = values.slice(0, MAX_TOOLTIP_ROWS)
  return (
    <div className="max-w-[280px] rounded-lg bg-gray-800 px-3 py-2 text-xs text-white shadow-lg">
      <p className="mb-1 font-medium text-gray-300">{row.frequency.toFixed(2)} Hz</p>
      {shown.length === 0 ? <p className="text-gray-300">Sin datos en esta frecuencia</p> : null}
      {shown.map(({ series, value }) => (
        <p key={series.participant.code} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: series.participant.color }} />
          <span className="truncate">{series.participant.label}: {format(value)}</span>
        </p>
      ))}
      {values.length > shown.length ? <p className="mt-1 text-gray-300">y {values.length - shown.length} más</p> : null}
    </div>
  )
}

/** Chart notes as chips, for views whose chips sit in their own colour bar. */
export function EegGroupChips({ notes }: { notes: AnalyticsChartNote[] }) {
  return (
    <>
      {notes.map(({ id, ...note }) => (
        <InfoChip key={id} {...note} />
      ))}
    </>
  )
}

/** Where nothing is drawn yet: no participant chosen, still loading, or nobody with data. */
export function EegGroupState({ data, frameClassName, emptyMessage, notes }: { data: GroupData; frameClassName: string; emptyMessage: string; notes?: AnalyticsChartNote[] }) {
  if (data.total === 0) {
    return <AnalyticsMessageSurface className={frameClassName}>Elige al menos un participante en «Participantes».</AnalyticsMessageSurface>
  }
  if (data.loading) {
    return (
      <div className={cn(frameClassName, "relative")} role="status">
        <Skeleton className="absolute inset-0 animate-pulse rounded-lg bg-muted" />
        <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Cargando {data.settled} de {data.total} participantes…
        </span>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <AnalyticsMessageSurface className={frameClassName}>{emptyMessage}</AnalyticsMessageSurface>
      {notes?.length ? (
        <div role="group" className="analytics-chart-notes" aria-label="Notas de la gráfica">
          <EegGroupChips notes={notes} />
        </div>
      ) : null}
    </div>
  )
}

export function EegGroupPsdChart({
  mode,
  psd,
  data,
  fit,
  onZoom,
  onZoomReset,
  onZoomBack,
}: {
  mode: GroupMode
  psd: GroupPsd
  data: GroupData
  /** The view's «Ajustar» toggle. */
  fit: boolean
  onZoom: (start: number, end: number) => void
  onZoomReset?: () => void
  onZoomBack?: () => void
}) {
  const dragZoom = useChartDragZoom(onZoom)
  const { frequency, mean, lower, upper, n } = psd.mean

  const values = useMemo(() => {
    const drawn: number[] = []
    const push = (column: ArrayLike<number>) => {
      for (let index = 0; index < column.length; index += 1) if (Number.isFinite(column[index])) drawn.push(column[index])
    }
    if (mode === "average") {
      push(mean)
      push(lower)
      push(upper)
    } else {
      for (const series of psd.series) push(series.power)
    }
    return drawn
  }, [lower, mean, mode, psd.series, upper])
  const axis = useMemo(() => (fit ? fittedAxis(values) : null), [fit, values])
  // Where the spread exceeds the mean in linear power, the band reaches zero power: the bottom.
  const floor = axis ? axis.domain[0] : values.reduce((low, value) => Math.min(low, value), Number.POSITIVE_INFINITY)

  const rows = useMemo<PsdRow[]>(
    () =>
      Array.from(frequency, (value, index) => {
        const average = mean[index]
        const high = upper[index]
        const low = lower[index]
        const row: PsdRow = {
          frequency: value,
          mean: Number.isFinite(average) ? average : null,
          low: Number.isFinite(low) ? low : null,
          high: Number.isFinite(high) ? high : null,
          n: n[index],
          band: Number.isFinite(high) && Number.isFinite(floor) ? [Number.isFinite(low) ? low : floor, high] : null,
        }
        psd.series.forEach((series, position) => {
          const point = series.power[index]
          row[`s${position}`] = Number.isFinite(point) ? point : null
        })
        return row
      }),
    [floor, frequency, lower, mean, n, psd.series, upper]
  )

  const maxN = n.reduce((best, value) => Math.max(best, value), 0)
  const legend =
    mode === "average"
      ? [
          { label: `Promedio (${participantsText(maxN)})`, color: AVERAGE_COLOR, thick: true },
          { label: "±1 desviación estándar", color: AVERAGE_COLOR, opacity: 0.3, thick: true },
        ]
      : psd.series.length <= MAX_LEGEND_ITEMS
        ? psd.series.map((series) => ({ label: series.participant.label, color: series.participant.color }))
        : []
  const notes: AnalyticsChartNote[] = [
    {
      id: "group-how",
      label: mode === "overlay" && psd.series.length > MAX_LEGEND_ITEMS ? `${psd.series.length} participantes` : "Cómo se calcula",
      detail: (
        <>
          <span>Cada participante aporta la media de sus canales elegidos, calculada en potencia lineal.</span>
          {mode === "average" ? (
            <>
              <span>
                La línea es la media de los participantes en potencia lineal, pasada a dB después; la banda es ±1
                desviación estándar entre ellos, también en potencia lineal.
              </span>
              <span>Donde la desviación supera a la media, la banda llega hasta abajo.</span>
            </>
          ) : psd.series.length > MAX_LEGEND_ITEMS ? (
            <span>Cada color es un participante; la tabla de estadísticas muestra el de cada uno.</span>
          ) : null}
        </>
      ),
    },
    ...groupLoadNotes(data),
  ]

  if (psd.series.length === 0) {
    return (
      <EegGroupState
        data={data}
        frameClassName="analytics-state-frame-mid"
        emptyMessage="Ninguno de los participantes elegidos tiene densidad espectral para estos canales."
        notes={groupLoadNotes(data)}
      />
    )
  }
  const domain: [number, number] = [rows[0]?.frequency ?? 0, rows[rows.length - 1]?.frequency ?? 1]
  return (
    <div
      role="img"
      aria-label={`Densidad espectral (${psd.unit}). ${mode === "average" ? "Promedio" : "Superposición"} de ${psd.series.length} participantes. Arrastra para ampliar un rango de frecuencias.`}
      data-testid="group-psd-chart"
      data-mode={mode}
      data-series={psd.series.length}
    >
      <AnalyticsChartShell
        legend={legend}
        notes={notes}
        xAxisLabel="Frecuencia (Hz)"
        variant="mid"
        dragZoom={dragZoom}
        onZoomReset={onZoomReset}
        onZoomBack={onZoomBack}
      >
        <ResponsiveContainer className="analytics-chart-plot-frame" width="100%" height="100%">
          <ComposedChart data={rows} margin={LINE_CHART_MARGIN} {...dragZoom.chartProps()}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="frequency"
              type="number"
              domain={domain}
              tickFormatter={(value) => formatAxisTick(value, Math.max(1, axisTickDecimals(domain)))}
              tickMargin={8}
            />
            <YAxis
              width={92}
              domain={axis?.domain ?? ["auto", "auto"]}
              ticks={axis?.ticks}
              allowDataOverflow={Boolean(axis)}
              tickFormatter={axis ? (value: number) => Number(value).toFixed(axis.decimals) : undefined}
              label={{ value: `PSD (${psd.unit})`, angle: -90, position: "insideLeft", offset: 4, style: { textAnchor: "middle" } }}
            />
            <RechartsTooltip content={<GroupPsdTooltip mode={mode} psd={psd} />} />
            {mode === "average" ? (
              <>
                <Area
                  type="linear"
                  dataKey="band"
                  name="±1 desviación estándar"
                  stroke="none"
                  fill={AVERAGE_COLOR}
                  fillOpacity={0.18}
                  connectNulls={false}
                  isAnimationActive={false}
                  activeDot={false}
                />
                <Line type="linear" dataKey="mean" name="Promedio" stroke={AVERAGE_COLOR} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
              </>
            ) : (
              psd.series.map((series, index) => (
                <Line
                  key={series.participant.code}
                  type="linear"
                  dataKey={`s${index}`}
                  name={series.participant.label}
                  stroke={series.participant.color}
                  strokeDasharray={series.participant.dash}
                  strokeWidth={1.6}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </AnalyticsChartShell>
    </div>
  )
}
