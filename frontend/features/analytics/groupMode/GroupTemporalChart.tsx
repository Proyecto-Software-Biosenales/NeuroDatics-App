"use client"

import { useMemo, type ReactNode } from "react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { AnalyticsChartShell, LINE_CHART_MARGIN, type AnalyticsChartNote } from "../components/AnalyticsChartShell"
import { AnalyticsMessageSurface } from "../components/AnalyticsMessageSurface"
import { useChartDragZoom } from "../components/ChartDragZoom"
import { useZoomHistory } from "../hooks/useZoomHistory"
import { axisTickDecimals, formatAxisTick, normalizeZoomRange, sameZoomRange, zoomSpan, type ZoomRange } from "../chartZoom"
import { fittedAxis, type FittedAxis } from "../fittedAxis"
import { aggregateTraces } from "./aggregate"
import type { GroupParticipant } from "./GroupModeProvider"
import type { GroupMode, GroupTimeAxis } from "./groupSupport"
import { groupLoadNotes } from "./groupNotes"
import type { GroupData } from "./useGroupData"

/** One participant's drawn signal, already on the group's time axis (`GroupTimeAxis`). */
export interface GroupTrace {
  participant: GroupParticipant
  time: ArrayLike<number>
  /**
   * NaN where a sample is missing. A lone missing sample is bridged; the line
   * breaks only where the valid samples are far apart in time (see `resampleTrace`).
   */
  value: ArrayLike<number>
}
const AVERAGE_COLOR = "var(--group-average)"
/** Past this many participants the legend gives way to the table's colours. */
const MAX_LEGEND_ITEMS = 8
const MAX_TOOLTIP_ROWS = 10

type Row = { time: number; mean: number | null; sd: number | null; n: number; band: [number, number] | null } & Record<string, unknown>

const finiteOrNull = (value: number) => (Number.isFinite(value) ? value : null)

function GroupTooltip({
  active,
  payload,
  mode,
  traces,
  unit,
  decimals,
}: {
  active?: boolean
  payload?: Array<{ payload?: Row }>
  mode: GroupMode
  traces: GroupTrace[]
  unit: string
  decimals: number
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  const format = (value: number) => `${value.toFixed(decimals).replace(".", ",")} ${unit}`
  if (mode === "average") {
    return (
      <div className="rounded-lg bg-gray-800 px-3 py-2 text-xs text-white shadow-lg">
        <p className="mb-1 font-medium text-gray-300">{row.time.toFixed(2)} s</p>
        <p className="font-medium">Promedio: {row.mean == null ? "—" : format(row.mean)}</p>
        <p>Desviación estándar: {row.sd == null ? "—" : format(row.sd)}</p>
        <p className="text-gray-300">{row.n === 1 ? "1 participante" : `${row.n} participantes`} en este instante</p>
      </div>
    )
  }
  const values = traces.flatMap((trace, index) => {
    const value = row[`s${index}`]
    return typeof value === "number" ? [{ trace, value }] : []
  })
  const shown = values.slice(0, MAX_TOOLTIP_ROWS)
  return (
    <div className="max-w-[280px] rounded-lg bg-gray-800 px-3 py-2 text-xs text-white shadow-lg">
      <p className="mb-1 font-medium text-gray-300">{row.time.toFixed(2)} s</p>
      {shown.length === 0 ? <p className="text-gray-300">Sin datos en este instante</p> : null}
      {shown.map(({ trace, value }) => (
        <p key={trace.participant.code} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: trace.participant.color }} />
          <span className="truncate">{trace.participant.label}: {format(value)}</span>
        </p>
      ))}
      {values.length > shown.length ? <p className="mt-1 text-gray-300">y {values.length - shown.length} más</p> : null}
    </div>
  )
}

/**
 * The temporal chart of «Superposición» (one line per participant, in its
 * colour) and «Promedio» (mean line with a ±1 SD band). Every participant is
 * resampled on one common grid of at most 2,000 points; dragging zooms on the
 * time axis, which counts from the scenario's onset or, with «Todos los
 * escenarios», from each recording's start.
 */
export function GroupTemporalChart({
  mode,
  traces,
  data,
  timeAxis,
  unit,
  yLabel,
  yAxis = fittedAxis,
  decimals = 2,
  averageDetail,
  emptyMessage = "Ninguno de los participantes elegidos tiene datos para esta vista.",
}: {
  mode: GroupMode
  traces: GroupTrace[]
  /** Load state of every chosen participant, for the status chips. */
  data: GroupData
  /** Where each participant's time 0 is: `GroupView.timeAxis`. */
  timeAxis: GroupTimeAxis
  unit: string
  yLabel: string
  /** The vertical scale from the drawn values; the view's own rule. */
  yAxis?: (values: number[]) => FittedAxis | null
  decimals?: number
  /** A view-specific line added to the «Cómo se calcula» chip. */
  averageDetail?: ReactNode
  emptyMessage?: string
}) {
  const aggregate = useMemo(() => aggregateTraces(traces.map((trace) => ({ x: trace.time, y: trace.value }))), [traces])
  const rows = useMemo<Row[]>(() => {
    const { grid, mean, sd, n, resampled } = aggregate
    return Array.from(grid, (time, index) => {
      const average = mean[index]
      const spread = sd[index]
      const row: Row = {
        time,
        mean: finiteOrNull(average),
        sd: finiteOrNull(spread),
        n: n[index],
        band: Number.isFinite(average) && Number.isFinite(spread) ? [average - spread, average + spread] : null,
      }
      resampled.forEach((column, trace) => {
        row[`s${trace}`] = finiteOrNull(column[index])
      })
      return row
    })
  }, [aggregate])
  const times = useMemo(() => rows.map((row) => row.time), [rows])

  const zoomHistory = useZoomHistory<ZoomRange>(sameZoomRange)
  const zoom = zoomHistory.range && zoomSpan(times, zoomHistory.range) ? zoomHistory.range : null
  const visibleRows = useMemo(() => (zoom ? rows.filter((row) => row.time >= zoom.start && row.time <= zoom.end) : rows), [rows, zoom])
  const dragZoom = useChartDragZoom((start, end) => {
    const range = normalizeZoomRange(start, end)
    if (range && zoomSpan(times, range)) zoomHistory.zoomTo(range)
  })

  const axis = useMemo(() => {
    const values: number[] = []
    if (mode === "average") {
      for (const row of visibleRows) if (row.band) values.push(...row.band)
      else if (row.mean != null) values.push(row.mean)
    } else {
      for (const column of aggregate.resampled) for (const value of column) if (Number.isFinite(value)) values.push(value)
    }
    return yAxis(values)
  }, [aggregate.resampled, mode, visibleRows, yAxis])

  const maxN = useMemo(() => aggregate.n.reduce((best, value) => Math.max(best, value), 0), [aggregate.n])
  const legend =
    mode === "average"
      ? [
          { label: `Promedio (${maxN === 1 ? "1 participante" : `${maxN} participantes`})`, color: AVERAGE_COLOR, thick: true },
          { label: "±1 desviación estándar", color: AVERAGE_COLOR, opacity: 0.3, thick: true },
        ]
      : traces.length <= MAX_LEGEND_ITEMS
        ? traces.map((trace) => ({ label: trace.participant.label, color: trace.participant.color }))
        : []
  const timeNote: AnalyticsChartNote = { id: "group-time", label: timeAxis.chip, detail: timeAxis.detail }
  const notes: AnalyticsChartNote[] = [
    ...(mode === "average"
      ? [
          {
            id: "group-how",
            label: "Cómo se calcula",
            detail: (
              <>
                <span>
                  Cada participante se cuenta desde {timeAxis.origin} y se lleva a una rejilla común de tiempo. Una
                  muestra perdida suelta no corta la línea; una pérdida larga de señal queda como hueco, sin rellenar.
                </span>
                <span>
                  La línea es la media de los participantes con dato en cada instante y la banda, ±1 desviación
                  estándar entre ellos.
                </span>
                {averageDetail ? <span>{averageDetail}</span> : null}
              </>
            ),
          },
          // Without a common onset the same second is not the same moment: say so beside the chart.
          ...(timeAxis.aligned ? [] : [timeNote]),
        ]
      : [
          {
            ...timeNote,
            detail: (
              <>
                <span>{timeAxis.detail}</span>
                <span>Una muestra perdida suelta no corta la línea; una pérdida larga de señal deja un hueco.</span>
                {averageDetail ? <span>{averageDetail}</span> : null}
              </>
            ),
          },
          ...(traces.length > MAX_LEGEND_ITEMS
            ? [
                {
                  id: "group-colors",
                  label: `${traces.length} participantes`,
                  detail: "Cada color es un participante; la tabla de estadísticas muestra el de cada uno.",
                },
              ]
            : []),
        ]),
    ...groupLoadNotes(data),
  ]

  if (traces.length === 0) {
    if (data.total === 0) {
      return <AnalyticsMessageSurface className="analytics-state-frame">Elige al menos un participante en «Participantes».</AnalyticsMessageSurface>
    }
    if (data.loading) {
      return (
        <div className="analytics-state-frame relative" role="status">
          <Skeleton className="absolute inset-0 animate-pulse rounded-lg bg-muted" />
          <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Cargando {data.settled} de {data.total} participantes…
          </span>
        </div>
      )
    }
    return (
      <AnalyticsChartShell notes={groupLoadNotes(data)} xAxisLabel="">
        <AnalyticsMessageSurface className="h-full">{emptyMessage}</AnalyticsMessageSurface>
      </AnalyticsChartShell>
    )
  }

  const domain: [number, number] = zoom ? [zoom.start, zoom.end] : [rows[0]?.time ?? 0, rows[rows.length - 1]?.time ?? 1]
  return (
    <div
      role="img"
      aria-label={`${yLabel}. ${mode === "average" ? "Promedio" : "Superposición"} de ${traces.length} participantes; eje horizontal en segundos desde ${timeAxis.origin}. Arrastra para ampliar.`}
      data-testid="group-temporal-chart"
      data-mode={mode}
      data-series={traces.length}
    >
      <AnalyticsChartShell
        legend={legend}
        notes={notes}
        xAxisLabel={timeAxis.label}
        dragZoom={dragZoom}
        onZoomReset={zoom ? zoomHistory.reset : undefined}
        onZoomBack={zoom && zoomHistory.canGoBack ? zoomHistory.back : undefined}
      >
        <ResponsiveContainer className="analytics-chart-plot-frame" width="100%" height="100%">
          <ComposedChart data={visibleRows} margin={LINE_CHART_MARGIN} {...dragZoom.chartProps()}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="time"
              type="number"
              domain={domain}
              allowDataOverflow
              tickFormatter={(value) => formatAxisTick(value, axisTickDecimals(domain))}
              tickMargin={8}
            />
            <YAxis
              width={72}
              domain={axis?.domain ?? ["auto", "auto"]}
              ticks={axis?.ticks}
              allowDataOverflow={Boolean(axis)}
              tickFormatter={axis ? (value: number) => formatAxisTick(value, axis.decimals) : undefined}
              label={{ value: yLabel, angle: -90, position: "insideLeft", offset: 10, style: { textAnchor: "middle" } }}
            />
            <RechartsTooltip content={<GroupTooltip mode={mode} traces={traces} unit={unit} decimals={decimals} />} />
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
                <Line
                  type="linear"
                  dataKey="mean"
                  name="Promedio"
                  stroke={AVERAGE_COLOR}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </>
            ) : (
              traces.map((trace, index) => (
                <Line
                  key={trace.participant.code}
                  type="linear"
                  dataKey={`s${index}`}
                  name={trace.participant.label}
                  stroke={trace.participant.color}
                  strokeDasharray={trace.participant.dash}
                  strokeWidth={1.5}
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
