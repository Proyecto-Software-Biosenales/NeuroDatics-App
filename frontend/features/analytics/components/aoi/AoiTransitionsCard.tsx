"use client"

import { useId } from "react"
import { ArrowRight, ArrowRightLeft } from "lucide-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { InfoChip } from "../InfoChip"
import { AoiName } from "./AoiName"
import type { AoiMetricItem } from "../../types"
import { formatPercent, plural, type AoiTransitionSummary } from "../../aoiInsights"

const TOP_LINKS = 3

function EmptyState({ children }: { children: string }) {
  return (
    <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

/** Heat of a matrix cell: the same blue at every size, stronger with the count. */
const cellBackground = (count: number, max: number) => (
  count > 0 && max > 0 ? `rgba(59, 130, 246, ${(0.12 + (count / max) * 0.38).toFixed(2)})` : undefined
)

/**
 * The busiest connections first, both directions together, then the full
 * matrix for anyone who needs every directed pair. AOIs that were never
 * fixated are left out of the matrix: their rows and columns could only hold
 * zeros.
 */
export function AoiTransitionsCard({
  aois,
  summary,
}: {
  aois: AoiMetricItem[]
  summary: AoiTransitionSummary
}) {
  const headingId = useId()
  const visible = aois.filter((aoi) => aoi.fixation_count > 0)
  const omitted = aois.filter((aoi) => aoi.fixation_count === 0)
  const topLinks = summary.links.slice(0, TOP_LINKS)
  const maxLink = topLinks[0]?.total ?? 0

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Transiciones entre AOIs</CardTitle>
        <CardDescription>
          {summary.total > 0
            ? `Saltos directos de la mirada entre áreas: ${plural(summary.total, "transición", "transiciones")} en total.`
            : "Saltos directos de la mirada entre áreas."}
        </CardDescription>
        <CardAction>
          <InfoChip
            label="Cómo se cuentan"
            detail={(
              <>
                <span>Cada salto de un AOI a otro distinto dentro del mismo segmento de registro.</span>
                <span>Las fijaciones fuera de las AOIs no cortan la cadena: A, fuera, B cuenta como A → B.</span>
                <span>Cada conexión suma los saltos en los dos sentidos entre dos áreas; «ida» es el sentido más frecuente.</span>
                <span>En la matriz, filas: área de salida; columnas: área de llegada.</span>
              </>
            )}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1">
        {aois.length < 2 ? (
          <EmptyState>Se necesitan al menos dos AOIs para medir transiciones.</EmptyState>
        ) : summary.total === 0 ? (
          <EmptyState>La mirada no pasó de un AOI a otro en este escenario.</EmptyState>
        ) : (
          <div className="space-y-5">
            <section aria-labelledby={`${headingId}-links`} className="space-y-2">
              <h4 id={`${headingId}-links`} className="text-xs font-medium text-muted-foreground">
                Conexiones más frecuentes
              </h4>
              <ol className="space-y-2">
                {topLinks.map((link, index) => {
                  const bothWays = link.backward > 0
                  const LinkIcon = bothWays ? ArrowRightLeft : ArrowRight
                  return (
                    <li
                      key={`${link.a.id}-${link.b.id}`}
                      className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
                    >
                      <span className="text-xs font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
                          <AoiName aoi={link.a} />
                          <LinkIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="sr-only">{bothWays ? "y" : "hacia"}</span>
                          <AoiName aoi={link.b} />
                          <span className="text-xs text-muted-foreground">
                            · {bothWays
                              ? `${link.forward} de ida, ${link.backward} de vuelta`
                              : "solo en ese sentido"}
                          </span>
                        </div>
                        {/* Split by direction: each segment takes the colour of the AOI the jumps leave. */}
                        <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="flex h-full overflow-hidden rounded-full"
                            style={{ width: `${maxLink > 0 ? (link.total / maxLink) * 100 : 0}%` }}
                          >
                            <span
                              className="h-full"
                              style={{ width: `${(link.forward / link.total) * 100}%`, backgroundColor: link.a.color }}
                            />
                            <span
                              className="h-full"
                              style={{ width: `${(link.backward / link.total) * 100}%`, backgroundColor: link.b.color }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums text-foreground">
                          {plural(link.total, "vez", "veces")}
                        </p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {formatPercent(link.sharePercent, 0)}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>

            {visible.length >= 2 ? (
              <section aria-labelledby={`${headingId}-matrix`} className="space-y-2">
                <h4 id={`${headingId}-matrix`} className="text-xs font-medium text-muted-foreground">
                  Matriz completa
                </h4>
                <div className="overflow-hidden rounded-xl border border-border">
                  <Table className="text-sm" style={{ minWidth: `${10 + visible.length * 6}rem` }}>
                    <TableHeader className="bg-muted/50 text-xs">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 px-3 text-xs font-semibold text-muted-foreground">
                          Desde \ Hacia
                        </TableHead>
                        {visible.map((aoi) => (
                          <TableHead key={aoi.id} className="h-9 max-w-[7rem] px-2 text-center text-xs">
                            <AoiName aoi={aoi} className="max-w-full justify-center font-semibold" />
                          </TableHead>
                        ))}
                        <TableHead className="h-9 px-3 text-right text-xs font-semibold text-muted-foreground">
                          Salidas
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((from) => (
                        <TableRow key={from.id} className="hover:bg-muted/25">
                          <TableCell className="max-w-[9rem] px-3 py-2">
                            <AoiName aoi={from} className="max-w-full font-semibold" />
                          </TableCell>
                          {visible.map((to) => {
                            const count = summary.count(from, to)
                            return (
                              <TableCell key={to.id} className="px-2 py-1.5 text-center">
                                {from.id === to.id ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : (
                                  <span
                                    className={count > 0
                                      ? "inline-flex min-w-9 justify-center rounded-md px-2 py-1 font-medium tabular-nums text-foreground"
                                      : "inline-flex min-w-9 justify-center px-2 py-1 tabular-nums text-muted-foreground"}
                                    style={{ backgroundColor: cellBackground(count, summary.maxCount) }}
                                  >
                                    {count}
                                  </span>
                                )}
                              </TableCell>
                            )
                          })}
                          <TableCell className="px-3 py-2 text-right font-semibold tabular-nums">
                            {summary.exits.get(from.id) ?? 0}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter className="bg-muted/30">
                      <TableRow className="hover:bg-transparent">
                        <TableCell className="px-3 py-2 text-xs font-semibold text-muted-foreground">Entradas</TableCell>
                        {visible.map((to) => (
                          <TableCell key={to.id} className="px-2 py-2 text-center font-semibold tabular-nums">
                            {summary.entries.get(to.id) ?? 0}
                          </TableCell>
                        ))}
                        <TableCell className="px-3 py-2 text-right font-semibold tabular-nums">{summary.total}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
                {omitted.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Sin fijaciones, fuera de la matriz: {omitted.map((aoi) => aoi.name).join(", ")}.
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
