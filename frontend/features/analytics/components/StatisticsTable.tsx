
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Activity, ArrowLeft, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

export interface StatRow {
  serie: string
  count: number | null
  baseline: number | null
  mean?: number | null
  std: number | null
  median: number | null
  min: number | null
  max: number | null
  peak: number | null // percentage value e.g. 12.3 means 12.3%
  /** React key when two rows could share a `serie` text (e.g. participant names). */
  key?: string
  /** Colour of the row's line in the chart, drawn as a swatch before the name. */
  color?: string
}

interface StatisticsTableProps {
  rows: StatRow[]
  loading?: boolean
  /** Unit suffix for numeric values. Defaults to " mm". */
  unit?: string
  /** Highlights this row; without it, the first row stands out. */
  activeSerie?: string
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

export function StatisticsTable({ rows, loading, unit = " mm", activeSerie }: StatisticsTableProps) {
  return (
    <div>
      {loading ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow className="border-b border-border bg-muted">
                {TABLE_HEADERS.map((h) => (
                  <TableHead
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="border-b border-border/50 last:border-b-0">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j} className="px-4 py-4">
                      <Skeleton className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/60">
                {TABLE_HEADERS.map((h, i) => (
                  <TableHead
                    key={h}
                    className={cn(
                      "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      i === 0 ? "text-left" : "text-right"
                    )}
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => {
                const meta = SERIE_META[row.serie]
                return (
                  <TableRow
                    key={row.key ?? row.serie}
                    className={cn(
                      "border-b border-border/50 transition-colors hover:bg-muted/30",
                      index === rows.length - 1 && "border-b-0",
                      (activeSerie ? row.serie === activeSerie : index === 0) && "bg-muted/20"
                    )}
                  >
                    <TableCell className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        {row.color ? (
                          <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                        ) : meta ? (
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
                    </TableCell>

                    <TableCell className="px-4 py-4 text-right text-muted-foreground">
                      {row.count ?? "—"}
                    </TableCell>

                    <TableCell className="px-4 py-4 text-right text-muted-foreground">
                      {fmt(row.baseline, 4, unit)}
                    </TableCell>

                    <TableCell className="px-4 py-4 text-right text-foreground/80">
                      {fmt(row.std, 4, unit)}
                    </TableCell>

                    <TableCell className="px-4 py-4 text-right font-semibold text-foreground">
                      {fmt(row.mean ?? row.median, 4, unit)}
                    </TableCell>

                    <TableCell className="px-4 py-4 text-right font-medium text-emerald-500 dark:text-emerald-400">
                      {fmt(row.min, 4, unit)}
                    </TableCell>

                    <TableCell className="px-4 py-4 text-right font-medium text-rose-500 dark:text-rose-400">
                      {fmt(row.max, 4, unit)}
                    </TableCell>

                    <TableCell className="px-4 py-4 text-right">
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
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
