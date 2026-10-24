"use client"

import { useMemo, type ReactNode } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { meanByKey, type KeyedMean } from "../groupMode/aggregate"
import type { GroupParticipant } from "../groupMode/GroupModeProvider"
import type { GroupMode } from "../groupMode/groupSupport"
import type { GroupEntry } from "../groupMode/useGroupData"
import type { CardResult } from "../participantComparison/cardData"
import { scanpathRadiusForDuration } from "../scanpathScale"
import type { FixationPoint } from "../types"
import type { AnalyticsChartNote } from "./AnalyticsChartShell"
import { InfoChip } from "./InfoChip"
import { KpiCard, type KpiCardProps } from "./KpiCard"
import type { ContainedImageBox } from "./stimulusGeometry"

/**
 * Pieces shared by the spatial views (mapa de calor, recorridos, AOIs) in
 * «Superposición» and «Promedio»: one figures table and averaged KPI cards fed
 * by the same per-participant values, the legend under the stimulus and the
 * fixation points of the heatmap overlay.
 */

/** Past this many participants the legend gives way to the table's colours. */
export const MAX_GROUP_LEGEND_ITEMS = 8

const participantsText = (count: number) => (count === 1 ? "1 participante" : `${count} participantes`)

/** One participant's figures by column key; null while loading or without data. */
export interface GroupFigureEntry {
  participant: GroupParticipant
  values: Record<string, number | null> | null
  loading: boolean
}

type Success = Exclude<CardResult, { type: "empty" }>

/** Each chosen participant's figures, computed with the view's own rule. */
export function groupFigureEntries(entries: readonly GroupEntry[], figures: (result: Success) => Record<string, number | null> | null): GroupFigureEntry[] {
  return entries.map((entry) => ({
    participant: entry.participant,
    values: entry.status === "success" && entry.result ? figures(entry.result) : null,
    loading: entry.status === "loading",
  }))
}

/** Mean, over participants that have it, of each participant's own figure. */
export function useGroupFigureMeans(entries: readonly GroupFigureEntry[], keys: readonly string[]) {
  return useMemo(() => {
    const present = entries.flatMap((entry) => (entry.values ? [entry.values] : []))
    const means = meanByKey(present, keys) as Record<string, KeyedMean>
    return { means, participants: present.length }
  }, [entries, keys])
}

export type GroupFigureKpi = Omit<KpiCardProps, "value" | "loading" | "onClick" | "active" | "description" | "tooltipExtra"> & {
  key: string
  /** Replaces «Promedio de n participantes», e.g. with the AOI's name. */
  description?: string
}

/** «Promedio» KPI cards: the view's own cards, each the mean of every participant's figure. */
export function GroupFigureKpis({
  kpis,
  entries,
  four = false,
  extra,
}: {
  kpis: GroupFigureKpi[]
  entries: readonly GroupFigureEntry[]
  four?: boolean
  /** A card that is not a mean of participants' figures, after the others. */
  extra?: ReactNode
}) {
  const keys = useMemo(() => kpis.map((kpi) => kpi.key), [kpis])
  const { means } = useGroupFigureMeans(entries, keys)
  const loading = entries.every((entry) => entry.values == null) && entries.some((entry) => entry.loading)
  return (
    <div className={cn("analytics-kpi-grid", four && "analytics-kpi-grid-four")} data-testid="group-kpis">
      {kpis.map(({ key, description, ...card }) => (
        <KpiCard
          key={key}
          bgClass="bg-card"
          {...card}
          loading={loading}
          value={means[key]?.mean ?? null}
          description={description ?? `Promedio de ${participantsText(means[key]?.n ?? 0)}`}
        />
      ))}
      {extra}
    </div>
  )
}

export interface GroupFigureColumn {
  key: string
  label: string
  format: (value: number) => string
}

/**
 * The figures card in a group mode: one row per participant with its colour;
 * «Promedio» adds the «Promedio (n participantes)» row first.
 */
export function GroupFiguresCard({
  mode,
  entries,
  columns,
  title = "Estadísticas",
  description = "Las cifras de cada participante, calculadas igual que en su vista individual.",
  detail,
}: {
  mode: GroupMode
  entries: readonly GroupFigureEntry[]
  columns: GroupFigureColumn[]
  title?: string
  description?: string
  /** A view-specific line for the «Cómo se calcula» chip. */
  detail?: ReactNode
}) {
  const keys = useMemo(() => columns.map((column) => column.key), [columns])
  const { means, participants } = useGroupFigureMeans(entries, keys)
  const cell = (value: number | null | undefined, column: GroupFigureColumn, loading = false) =>
    value != null && Number.isFinite(value) ? column.format(value) : loading ? "…" : "—"
  return (
    <Card data-testid="group-figures">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64 space-y-1.5">
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <InfoChip
          label="Cómo se calcula"
          detail={
            <>
              <span>Cada fila de participante usa sus propias fijaciones en este escenario, con la duración mínima elegida.</span>
              {mode === "average" ? (
                <span>
                  La fila «Promedio» es la media, entre participantes, de la cifra de cada uno; solo cuentan los
                  participantes que tienen esa cifra.
                </span>
              ) : null}
              {detail ? <span>{detail}</span> : null}
            </>
          }
        />
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/60">
                <TableHead className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Participante
                </TableHead>
                {columns.map((column) => (
                  <TableHead key={column.key} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {mode === "average" ? (
                <TableRow className="border-b border-border/50 bg-muted/20">
                  <TableCell className="px-4 py-3 font-semibold text-foreground">Promedio ({participantsText(participants)})</TableCell>
                  {columns.map((column) => (
                    <TableCell key={column.key} className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                      {cell(means[column.key]?.mean, column)}
                    </TableCell>
                  ))}
                </TableRow>
              ) : null}
              {entries.map(({ participant, values, loading }) => (
                <TableRow key={participant.code} className="border-b border-border/50 last:border-b-0 hover:bg-muted/30">
                  <TableCell className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: participant.color }} />
                      <span className="font-semibold text-foreground">{participant.label}</span>
                    </span>
                  </TableCell>
                  {columns.map((column) => (
                    <TableCell key={column.key} className="px-4 py-3 text-right tabular-nums text-foreground/80">
                      {cell(values?.[column.key], column, loading)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Under a stimulus in a group mode: who is who (up to eight participants;
 * beyond that the table shows each colour) and the status and «Cómo se lee»
 * chips. Same classes as a chart's legend and notes.
 */
export function GroupSpatialFooter({ participants, notes }: { participants: readonly GroupParticipant[]; notes: AnalyticsChartNote[] }) {
  const legend = participants.length <= MAX_GROUP_LEGEND_ITEMS ? participants : []
  if (legend.length === 0 && notes.length === 0) return null
  return (
    <div className="analytics-chart-footer mt-3">
      {legend.length > 0 ? (
        <div role="group" className="analytics-chart-legend" aria-label="Leyenda de participantes">
          {legend.map((participant) => (
            <span key={participant.code} className="analytics-chart-legend-item">
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: participant.color }} />
              <span className="truncate">{participant.label}</span>
            </span>
          ))}
        </div>
      ) : null}
      {notes.length > 0 ? (
        <div role="group" className="analytics-chart-notes" aria-label="Notas de la gráfica">
          {notes.map(({ id, ...note }) => (
            <InfoChip key={id} {...note} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Fixation radius in px: area grows with duration on the scanpath's absolute scale. */
export const GROUP_FIXATION_RADIUS = { min: 3, max: 12, capMs: 2_000 }

export function groupFixationRadius(durationS: number) {
  return scanpathRadiusForDuration(durationS, GROUP_FIXATION_RADIUS.min, GROUP_FIXATION_RADIUS.max, GROUP_FIXATION_RADIUS.capMs)
}

/**
 * «Superposición» of the heatmap: every chosen participant's fixations in its
 * colour over the measured stimulus box. Hovering a point names its
 * participant and duration.
 */
export function GroupFixationLayer({
  layers,
  box,
}: {
  layers: ReadonlyArray<{ participant: GroupParticipant; fixations: readonly FixationPoint[] }>
  box: ContainedImageBox
}) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10"
      width="100%"
      height="100%"
      viewBox={`0 0 ${box.cW} ${box.cH}`}
      data-testid="group-fixations"
    >
      {layers.map(({ participant, fixations }) => (
        <g
          key={participant.code}
          data-participant={participant.code}
          role="img"
          aria-label={`${participant.label}: ${fixations.length === 1 ? "1 fijación" : `${fixations.length} fijaciones`}`}
        >
          {fixations.map((fixation, index) => {
            const durationMs = Math.round(fixation.duration_s * 1_000)
            return (
              <circle
                key={fixation.id ?? index}
                className="pointer-events-auto cursor-help"
                cx={box.offsetX + fixation.x_norm * box.renderedW}
                cy={box.offsetY + fixation.y_norm * box.renderedH}
                r={groupFixationRadius(fixation.duration_s)}
                fill={participant.color}
                fillOpacity={0.7}
                stroke="white"
                strokeOpacity={0.9}
                strokeWidth={1}
                strokeDasharray={participant.dash}
              >
                <title>{`${participant.label}: fijación de ${durationMs} ms`}</title>
              </circle>
            )
          })}
        </g>
      ))}
    </svg>
  )
}
