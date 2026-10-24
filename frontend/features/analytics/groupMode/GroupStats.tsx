"use client"

import { useMemo, type ReactNode } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoChip } from "../components/InfoChip"
import { KpiCard, type KpiCardProps } from "../components/KpiCard"
import { StatisticsTable, type StatRow } from "../components/StatisticsTable"
import { averageStatRows, type StatField } from "./aggregate"
import type { GroupParticipant } from "./GroupModeProvider"
import type { GroupMode } from "./groupSupport"

/** One participant's figures, computed with the view's own method; null without data. */
export interface GroupStatEntry {
  participant: GroupParticipant
  row: StatRow | null
}

const participantsText = (count: number) => (count === 1 ? "1 participante" : `${count} participantes`)

/** The «Promedio» row: each figure is the mean of every participant's own figure. */
export function useAveragedStats(entries: GroupStatEntry[]) {
  return useMemo(() => {
    const averaged = averageStatRows(entries.map((entry) => entry.row), "")
    return { ...averaged, row: { ...averaged.row, serie: `Promedio (${participantsText(averaged.participants)})` } as StatRow }
  }, [entries])
}

export type GroupKpi = Omit<KpiCardProps, "value" | "loading" | "onClick" | "active" | "description" | "tooltipExtra"> & {
  field: StatField
}

/**
 * «Promedio» KPI cards: the view's own cards, each showing the mean over
 * participants of that participant's figure.
 */
export function GroupKpiGrid({ kpis, entries, loading }: { kpis: GroupKpi[]; entries: GroupStatEntry[]; loading?: boolean }) {
  const averaged = useAveragedStats(entries)
  return (
    <div className="analytics-kpi-grid" data-testid="group-kpis">
      {kpis.map(({ field, ...card }) => (
        <KpiCard
          key={card.label}
          {...card}
          loading={loading}
          value={averaged.row[field] ?? null}
          description={`Promedio de ${participantsText(averaged.n[field])}`}
        />
      ))}
    </div>
  )
}

/**
 * The statistics card in a group mode. «Superposición»: one row per
 * participant with its colour. «Promedio»: the «Promedio (n participantes)»
 * row first, then each participant.
 */
export function GroupStatsCard({
  mode,
  entries,
  unit,
  loading,
  description = "Las cifras de cada participante, calculadas igual que en su vista individual.",
  detail,
  basis = "Cada fila de participante usa sus propias muestras dibujadas, desde el inicio del escenario.",
}: {
  mode: GroupMode
  entries: GroupStatEntry[]
  unit?: string
  loading?: boolean
  description?: string
  /** A view-specific line for the «Cómo se calcula» chip. */
  detail?: ReactNode
  /** What each participant row is computed from, when it is not the drawn samples. */
  basis?: ReactNode
}) {
  const averaged = useAveragedStats(entries)
  const participantRows = useMemo<StatRow[]>(
    () =>
      entries.map(({ participant, row }) => ({
        serie: participant.label,
        count: null,
        baseline: null,
        mean: null,
        std: null,
        median: null,
        min: null,
        max: null,
        peak: null,
        ...row,
        key: participant.code,
        color: participant.color,
      })),
    [entries]
  )
  const rows = mode === "average" ? [{ ...averaged.row, key: "group-average" }, ...participantRows] : participantRows
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64 space-y-1.5">
          <CardTitle className="text-lg">Estadísticas</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <InfoChip
          label="Cómo se calcula"
          detail={
            <>
              <span>{basis}</span>
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
        {/* Only the «Promedio» row is highlighted; no participant row stands out. */}
        <StatisticsTable rows={rows} loading={loading} unit={unit} activeSerie={mode === "average" ? averaged.row.serie : "\u0000"} />
      </CardContent>
    </Card>
  )
}
