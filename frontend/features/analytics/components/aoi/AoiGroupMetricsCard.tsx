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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { InfoChip } from "../InfoChip"
import { AoiName } from "./AoiName"
import type { AveragedAoi } from "../../aoiGroup"
import {
  formatDecimal,
  formatMilliseconds,
  formatPercent,
  formatSeconds,
  formatSignedDecimal,
} from "../../aoiInsights"

const DEFINITIONS = [
  "Cada cifra es la media, entre los participantes que la tienen, de la cifra de cada uno.",
  "Tiempo en AOI: porcentaje del tiempo total de fijación que recae en el área.",
  "Duración media: solo cuentan los participantes que fijaron el área.",
  "Pupila y distancia: solo cuentan los participantes con muestras de mirada dentro del área; se comparan con la línea base del escenario de cada uno.",
  "n: participantes que aportan a la fila.",
]

const GROUP_START = "border-l border-border"
const Missing = () => <span className="font-normal text-muted-foreground">—</span>

function MetricCell({ primary, secondary, className }: { primary: ReactNode; secondary?: ReactNode; className?: string }) {
  return (
    <TableCell className={cn("px-3 py-2.5 text-right align-top", className)}>
      <div className="font-semibold tabular-nums text-foreground">{primary}</div>
      {secondary != null ? <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">{secondary}</div> : null}
    </TableCell>
  )
}

/** «Promedio» of the AOI view: the per-area metrics of the individual table, averaged. */
export function AoiGroupMetricsCard({ rows }: { rows: AveragedAoi[] }) {
  return (
    <Card data-testid="aoi-group-metrics">
      <CardHeader>
        <CardTitle>Métricas por AOI</CardTitle>
        <CardDescription>Cuánta atención recibió cada área, en promedio entre los participantes elegidos.</CardDescription>
        <CardAction>
          <InfoChip label="Cómo se calculan" detail={DEFINITIONS.map((line) => <span key={line}>{line}</span>)} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table className="min-w-[760px] text-sm">
            <TableHeader className="bg-muted/50 text-xs text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 px-4 text-xs font-semibold text-muted-foreground">AOI</TableHead>
                <TableHead className={cn(GROUP_START, "h-9 px-3 text-right text-xs font-semibold text-muted-foreground")}>Tiempo en AOI</TableHead>
                <TableHead className="h-9 px-3 text-right text-xs font-semibold text-muted-foreground">Fijaciones</TableHead>
                <TableHead className="h-9 px-3 text-right text-xs font-semibold text-muted-foreground">Duración media</TableHead>
                <TableHead className={cn(GROUP_START, "h-9 px-3 text-right text-xs font-semibold text-muted-foreground")}>Pupila</TableHead>
                <TableHead className="h-9 px-3 text-right text-xs font-semibold text-muted-foreground">Distancia</TableHead>
                <TableHead className={cn(GROUP_START, "h-9 px-3 text-right text-xs font-semibold text-muted-foreground")}>n</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ aoi, n, means }) => {
                const dwell = means.total_dwell_time_percent.mean
                const dwellMs = means.total_dwell_time_ms.mean
                const fixations = means.fixation_count.mean
                const duration = means.avg_fixation_duration_ms
                const pupil = means.pupil_delta_percent
                const pupilMm = means.avg_pupil_mm.mean
                const distance = means.avg_distance_cm
                const distanceDelta = means.distance_delta_from_baseline_cm.mean
                return (
                  <TableRow key={aoi.id} className="hover:bg-muted/25">
                    <TableCell className="px-4 py-2.5 align-top">
                      <div className="flex min-w-0 max-w-[14rem] items-center gap-2">
                        <AoiName aoi={aoi} className="font-semibold" />
                      </div>
                    </TableCell>
                    <MetricCell
                      className={GROUP_START}
                      primary={dwell != null ? formatPercent(dwell) : <Missing />}
                      secondary={dwellMs != null ? formatSeconds(dwellMs / 1000) : null}
                    />
                    <MetricCell primary={fixations != null ? formatDecimal(fixations, 1) : <Missing />} />
                    <MetricCell
                      primary={duration.mean != null ? formatMilliseconds(duration.mean) : <Missing />}
                      secondary={duration.n > 0 && duration.n < n ? `n = ${duration.n}` : null}
                    />
                    <MetricCell
                      className={GROUP_START}
                      primary={pupil.mean != null ? `${formatSignedDecimal(pupil.mean, 1)} %` : <Missing />}
                      secondary={pupilMm != null ? `${formatDecimal(pupilMm, 2)} mm${pupil.n < n ? ` · n = ${pupil.n}` : ""}` : "sin muestras"}
                    />
                    <MetricCell
                      primary={distance.mean != null ? `${formatDecimal(distance.mean, 1)} cm` : <Missing />}
                      secondary={distance.mean != null && distanceDelta != null
                        ? `${formatSignedDecimal(distanceDelta, 1)} cm vs. base${distance.n < n ? ` · n = ${distance.n}` : ""}`
                        : distance.mean != null ? null : "sin muestras"}
                    />
                    <MetricCell className={GROUP_START} primary={n} />
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
