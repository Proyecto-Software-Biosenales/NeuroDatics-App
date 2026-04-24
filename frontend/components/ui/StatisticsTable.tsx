import { Activity, ArrowLeft, ArrowRight, BarChart2, TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

export interface StatRow {
  serie: string
  count: number | null
  baseline: number | null
  std: number | null
  median: number | null
  min: number | null
  max: number | null
  peak: number | null // percentage value e.g. 12.3 means 12.3%
}

interface StatisticsTableProps {
  rows: StatRow[]
  /** When provided, renders 4 summary KPI cards above the table using this row's data */
  summaryRow?: StatRow
  loading?: boolean
  /** Unit suffix for numeric values. Defaults to " mm". */
  unit?: string
}

const fmt = (v: number | null, decimals = 4, suffix = " mm") =>
  v != null ? `${v.toFixed(decimals)}${suffix}` : "—"

const SERIE_META: Record<string, { Icon: typeof Activity; bg: string; iconColor: string }> = {
  Promedio: {
    Icon: Activity,
    bg: "bg-indigo-100 dark:bg-indigo-950/50",
    iconColor: "text-indigo-500",
  },
  Izquierda: {
    Icon: ArrowLeft,
    bg: "bg-blue-100 dark:bg-blue-950/50",
    iconColor: "text-blue-500",
  },
  Derecha: {
    Icon: ArrowRight,
    bg: "bg-violet-100 dark:bg-violet-950/50",
    iconColor: "text-violet-500",
  },
}

function SummaryCards({ row, loading, unit = " mm" }: { row?: StatRow; loading?: boolean; unit?: string }) {
  if (loading) {
    return (
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-4"
          >
            <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-2.5 w-20 animate-pulse rounded bg-muted" />
              <div className="h-5 w-24 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!row) return null

  const items = [
    {
      label: "MEDIA (PROMEDIO)",
      value: fmt(row.median, 4, unit),
      Icon: Activity,
      bg: "bg-indigo-50 dark:bg-indigo-950/40",
      iconColor: "text-indigo-500",
      valueColor: "text-foreground",
    },
    {
      label: "MIN (PROMEDIO)",
      value: fmt(row.min, 4, unit),
      Icon: TrendingDown,
      bg: "bg-cyan-50 dark:bg-cyan-950/40",
      iconColor: "text-cyan-500",
      valueColor: "text-cyan-600 dark:text-cyan-400",
    },
    {
      label: "MAX (PROMEDIO)",
      value: fmt(row.max, 4, unit),
      Icon: TrendingUp,
      bg: "bg-rose-50 dark:bg-rose-950/40",
      iconColor: "text-rose-500",
      valueColor: "text-rose-600 dark:text-rose-400",
    },
    {
      label: "PICO % (PROMEDIO)",
      value:
        row.peak != null
          ? `${row.peak >= 0 ? "+" : ""}${row.peak.toFixed(1)}%`
          : "—",
      Icon: BarChart2,
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
      iconColor: "text-emerald-500",
      valueColor:
        row.peak != null
          ? row.peak >= 0
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-500"
          : "text-muted-foreground",
    },
  ]

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(({ label, value, Icon, bg, iconColor, valueColor }) => (
        <div
          key={label}
          className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
        >
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              bg
            )}
          >
            <Icon className={cn("h-5 w-5", iconColor)} />
          </div>
          <div className="min-w-0 space-y-2">
            <p className="text-xs font-normal uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className={cn("truncate text-xl font-bold leading-tight", valueColor)}>
              {value}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

const TABLE_HEADERS = [
  "SERIE",
  "NÚMERO",
  "BASE",
  "DESV. ESTÁNDAR",
  "MEDIA",
  "MIN",
  "MAX",
  "PICO %",
]

export function StatisticsTable({ rows, summaryRow, loading, unit = " mm" }: StatisticsTableProps) {
  return (
    <div>
      <SummaryCards row={summaryRow} loading={loading} unit={unit} />

      {loading ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                {TABLE_HEADERS.map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50 last:border-b-0">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-4 py-4">
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60">
                {TABLE_HEADERS.map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      i === 0 ? "text-left" : "text-right"
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const meta = SERIE_META[row.serie]
                return (
                  <tr
                    key={row.serie}
                    className={cn(
                      "border-b border-border/50 transition-colors hover:bg-muted/30",
                      index === rows.length - 1 && "border-b-0",
                      index === 0 && "bg-muted/20"
                    )}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        {meta ? (
                          <div
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                              meta.bg
                            )}
                          >
                            <meta.Icon className={cn("h-4 w-4", meta.iconColor)} />
                          </div>
                        ) : null}
                        <span className="font-semibold text-foreground">{row.serie}</span>
                      </div>
                    </td>

                    <td className="px-4 py-4 text-right text-muted-foreground">
                      {row.count ?? "—"}
                    </td>

                    <td className="px-4 py-4 text-right text-muted-foreground">
                      {fmt(row.baseline, 4, unit)}
                    </td>

                    <td className="px-4 py-4 text-right text-foreground/80">
                      {fmt(row.std, 4, unit)}
                    </td>

                    <td className="px-4 py-4 text-right font-semibold text-foreground">
                      {fmt(row.median, 4, unit)}
                    </td>

                    <td className="px-4 py-4 text-right font-medium text-cyan-500 dark:text-cyan-400">
                      {fmt(row.min, 4, unit)}
                    </td>

                    <td className="px-4 py-4 text-right font-medium text-rose-500 dark:text-rose-400">
                      {fmt(row.max, 4, unit)}
                    </td>

                    <td className="px-4 py-4 text-right">
                      {row.peak != null ? (
                        <span
                          className={cn(
                            "font-semibold",
                            row.peak >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-500"
                          )}
                        >
                          {row.peak >= 0 ? "+" : ""}
                          {row.peak.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
