"use client"

import type { ReactNode } from "react"
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
import { cn } from "@/lib/utils"
import { InfoChip } from "../InfoChip"
import { AoiName, OUTSIDE_AOI_COLOR, OutsideAoiName } from "./AoiName"
import type { AoiMetricItem } from "../../types"
import {
  formatDecimal,
  formatMilliseconds,
  formatPercent,
  formatSeconds,
  formatSignedDecimal,
  isFiniteNumber,
  plural,
  relativeTtffS,
} from "../../aoiInsights"

interface AoiMetricsCardProps {
  aois: AoiMetricItem[]
  /** Order of discovery by AOI id. */
  ranks: Map<string, number>
  onsetS: number | null
  /** Null while the fixation sequence is loading or unavailable. */
  visits: Map<string, number> | null
  outside: { percent: number; seconds: number; fixations: number | null }
  totalFixations: number
}

const DEFINITIONS = [
  "Tiempo en AOI: porcentaje del tiempo total de fijación que recae en el área.",
  "Fijaciones: cuántas caen en el área y qué parte son de las del escenario (tasa de acierto).",
  "TTFF: tiempo desde el inicio del escenario hasta la primera fijación en el área, y qué número de fijación fue.",
  "Visitas: veces que la mirada entró en el área; fijar fuera de ella cierra la visita.",
  "Pupila y distancia: media de las muestras de mirada dentro del área frente a la línea base del escenario (media entre sus percentiles 5 y 20).",
  "El número junto a cada AOI es su orden de descubrimiento.",
]

const GROUP_START = "border-l border-border"

function MetricCell({
  primary,
  secondary,
  className,
}: {
  primary: ReactNode
  secondary?: ReactNode
  className?: string
}) {
  return (
    <TableCell className={cn("px-3 py-2.5 text-right align-top", className)}>
      <div className="font-semibold tabular-nums text-foreground">{primary}</div>
      {secondary != null ? (
        <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">{secondary}</div>
      ) : null}
    </TableCell>
  )
}

const Missing = () => <span className="font-normal text-muted-foreground">—</span>

/** Share of the scenario's fixation time, beside the seconds it stands for. */
function ShareOfTime({ percent, seconds, color }: { percent: number; seconds: number; color: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="inline-block h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.min(Math.max(percent, 0), 100)}%`, backgroundColor: color }}
        />
      </span>
      {formatSeconds(seconds)}
    </span>
  )
}

/** Every per-AOI number of the tab in one row per area, grouped by question. */
export function AoiMetricsCard({ aois, ranks, onsetS, visits, outside, totalFixations }: AoiMetricsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Métricas por AOI</CardTitle>
        <CardDescription>
          Cuánta atención recibió cada área, cuándo la encontró la mirada y cómo respondió el participante.
        </CardDescription>
        <CardAction>
          <InfoChip
            label="Cómo se calculan"
            detail={DEFINITIONS.map((line) => <span key={line}>{line}</span>)}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-xl border border-border">
          <Table className="min-w-[920px] text-sm">
            <TableHeader className="bg-muted/50 text-xs text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead rowSpan={2} className="px-4 align-bottom text-xs font-semibold text-muted-foreground">
                  AOI
                </TableHead>
                <TableHead colSpan={3} className={cn(GROUP_START, "h-8 px-3 text-center text-[11px] font-semibold tracking-wide text-muted-foreground uppercase")}>
                  Atención
                </TableHead>
                <TableHead colSpan={2} className={cn(GROUP_START, "h-8 px-3 text-center text-[11px] font-semibold tracking-wide text-muted-foreground uppercase")}>
                  Descubrimiento
                </TableHead>
                <TableHead colSpan={2} className={cn(GROUP_START, "h-8 px-3 text-center text-[11px] font-semibold tracking-wide text-muted-foreground uppercase")}>
                  Respuesta
                </TableHead>
              </TableRow>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(GROUP_START, "h-9 px-3 text-right text-xs font-semibold text-muted-foreground")}>Tiempo en AOI</TableHead>
                <TableHead className="h-9 px-3 text-right text-xs font-semibold text-muted-foreground">Fijaciones</TableHead>
                <TableHead className="h-9 px-3 text-right text-xs font-semibold text-muted-foreground">Duración media</TableHead>
                <TableHead className={cn(GROUP_START, "h-9 px-3 text-right text-xs font-semibold text-muted-foreground")}>TTFF</TableHead>
                <TableHead className="h-9 px-3 text-right text-xs font-semibold text-muted-foreground">Visitas</TableHead>
                <TableHead className={cn(GROUP_START, "h-9 px-3 text-right text-xs font-semibold text-muted-foreground")}>Pupila</TableHead>
                <TableHead className="h-9 px-3 text-right text-xs font-semibold text-muted-foreground">Distancia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aois.map((aoi) => {
                const seen = aoi.fixation_count > 0
                const rank = ranks.get(aoi.id)
                const ttffS = relativeTtffS(aoi.ttff_ms, onsetS)
                const aoiVisits = visits?.get(aoi.id) ?? 0
                const hasPupil = aoi.pupil_sample_count > 0 && isFiniteNumber(aoi.pupil_delta_percent)
                const hasDistance = aoi.distance_sample_count > 0 && isFiniteNumber(aoi.avg_distance_cm)
                return (
                  <TableRow key={aoi.id} className={cn("hover:bg-muted/25", !seen && "text-muted-foreground")}>
                    <TableCell className="px-4 py-2.5 align-top">
                      <div className="flex min-w-0 max-w-[14rem] items-center gap-2">
                        <span
                          className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground"
                          title={rank ? `Orden de descubrimiento: ${rank}` : "Sin fijaciones"}
                        >
                          {rank ?? "–"}
                        </span>
                        <AoiName aoi={aoi} className="font-semibold" />
                      </div>
                    </TableCell>

                    <MetricCell
                      className={GROUP_START}
                      primary={formatPercent(aoi.total_dwell_time_percent)}
                      secondary={(
                        <ShareOfTime
                          percent={aoi.total_dwell_time_percent}
                          seconds={aoi.total_dwell_time_ms / 1000}
                          color={aoi.color}
                        />
                      )}
                    />
                    <MetricCell
                      primary={aoi.fixation_count}
                      secondary={`${formatPercent(aoi.hit_rate_percent)} del total`}
                    />
                    <MetricCell primary={seen ? formatMilliseconds(aoi.avg_fixation_duration_ms) : <Missing />} />

                    <MetricCell
                      className={GROUP_START}
                      primary={seen && ttffS != null ? formatSeconds(ttffS) : <Missing />}
                      secondary={seen
                        ? aoi.fixations_to_target != null ? `fijación nº ${aoi.fixations_to_target}` : null
                        : "sin fijaciones"}
                    />
                    <MetricCell
                      primary={!seen ? <Missing /> : visits ? aoiVisits : "…"}
                      secondary={seen && visits && aoiVisits > 1
                        ? `volvió ${plural(aoiVisits - 1, "vez", "veces")}`
                        : null}
                    />

                    <MetricCell
                      className={GROUP_START}
                      primary={hasPupil ? `${formatSignedDecimal(aoi.pupil_delta_percent as number, 1)} %` : <Missing />}
                      secondary={hasPupil && isFiniteNumber(aoi.avg_pupil_mm)
                        ? `${formatDecimal(aoi.avg_pupil_mm, 2)} mm`
                        : hasPupil ? null : "sin muestras"}
                    />
                    <MetricCell
                      primary={hasDistance ? `${formatDecimal(aoi.avg_distance_cm as number, 1)} cm` : <Missing />}
                      secondary={hasDistance && isFiniteNumber(aoi.distance_delta_from_baseline_cm)
                        ? `${formatSignedDecimal(aoi.distance_delta_from_baseline_cm, 1)} cm vs. base`
                        : hasDistance ? null : "sin muestras"}
                    />
                  </TableRow>
                )
              })}
            </TableBody>
            <TableFooter className="bg-muted/30 font-normal">
              <TableRow className="hover:bg-transparent">
                <TableCell className="px-4 py-2.5 align-top">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="size-5 shrink-0" />
                    <OutsideAoiName />
                  </div>
                </TableCell>
                <MetricCell
                  className={GROUP_START}
                  primary={formatPercent(outside.percent)}
                  secondary={(
                    <ShareOfTime percent={outside.percent} seconds={outside.seconds} color={OUTSIDE_AOI_COLOR} />
                  )}
                />
                <MetricCell
                  primary={outside.fixations ?? "…"}
                  secondary={outside.fixations != null && totalFixations > 0
                    ? `${formatPercent((outside.fixations / totalFixations) * 100)} del total`
                    : null}
                />
                <MetricCell primary={<Missing />} />
                <MetricCell className={GROUP_START} primary={<Missing />} />
                <MetricCell primary={<Missing />} />
                <MetricCell className={GROUP_START} primary={<Missing />} />
                <MetricCell primary={<Missing />} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
