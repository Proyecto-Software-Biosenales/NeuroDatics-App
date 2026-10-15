"use client"

import type { ElementType } from "react"
import { Activity, MoveHorizontal, MoveVertical, Ruler } from "lucide-react"
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { InfoChip } from "../InfoChip"
import { AoiName, OutsideAoiName } from "./AoiName"
import type { AoiEventItem } from "../../types"
import { formatDecimal, formatSeconds, relativeTimeS } from "../../aoiInsights"

const SIGNALS: Array<{
  metric: string
  label: string
  Icon: ElementType
  iconClassName: string
  decimals: number
}> = [
  { metric: "pupil", label: "Pupila", Icon: Activity, iconClassName: "text-violet-600 dark:text-violet-300", decimals: 2 },
  { metric: "distance", label: "Distancia", Icon: Ruler, iconClassName: "text-emerald-700 dark:text-emerald-300", decimals: 1 },
  { metric: "gaze_x", label: "Mirada horizontal (X)", Icon: MoveHorizontal, iconClassName: "text-blue-600 dark:text-blue-300", decimals: 1 },
  { metric: "gaze_y", label: "Mirada vertical (Y)", Icon: MoveVertical, iconClassName: "text-blue-600 dark:text-blue-300", decimals: 1 },
]

function PeakCell({
  event,
  decimals,
  onsetS,
}: {
  event: AoiEventItem | null
  decimals: number
  onsetS: number | null
}) {
  if (!event) {
    return <TableCell className="px-3 py-2.5 align-top text-muted-foreground">—</TableCell>
  }
  const relative = relativeTimeS(event.time_s, onsetS)
  const time = relative != null
    ? formatSeconds(relative)
    : event.time_s != null
      ? `${formatSeconds(event.time_s)} (grabación)`
      : null
  return (
    <TableCell className="px-3 py-2.5 align-top whitespace-normal">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold tabular-nums text-foreground">
          {formatDecimal(event.value, decimals)} {event.unit}
        </span>
        {time ? <span className="text-xs tabular-nums text-muted-foreground">{time}</span> : null}
      </div>
      <div className="mt-1 text-xs">
        {event.aoi_name ? (
          <AoiName aoi={{ name: event.aoi_name, color: event.aoi_color ?? "#3B82F6" }} />
        ) : (
          <OutsideAoiName />
        )}
      </div>
    </TableCell>
  )
}

/**
 * Where the gaze was at each signal extreme. Extremes are single samples, so
 * this card locates moments; the per-AOI means in the metrics table are the
 * robust comparison.
 */
export function AoiSignalPeaksCard({ events, onsetS }: { events: AoiEventItem[]; onsetS: number | null }) {
  const rows = SIGNALS
    .map((signal) => ({
      ...signal,
      min: events.find((event) => event.metric === signal.metric && event.kind === "min") ?? null,
      max: events.find((event) => event.metric === signal.metric && event.kind === "max") ?? null,
    }))
    .filter((row) => row.min || row.max)
  const shown = rows.flatMap((row) => [row.min, row.max]).filter((event): event is AoiEventItem => event != null)
  const inside = shown.filter((event) => event.aoi_name).length

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Picos de señal</CardTitle>
        <CardDescription>
          Dónde miraba el participante en el valor mínimo y máximo de cada señal.
        </CardDescription>
        {shown.length > 0 ? (
          <CardAction>
            <InfoChip
              label={`${inside} de ${shown.length} en una AOI`}
              detail={(
                <>
                  <span>Un pico cuenta como dentro de una AOI si la mirada cae en ella en ese instante.</span>
                  <span>Son muestras sueltas: para comparar áreas, usa las medias de pupila y distancia de Métricas por AOI.</span>
                  <span>Mirada X e Y: posición horizontal y vertical en % del estímulo; sus extremos muestran hasta dónde llegó la exploración.</span>
                </>
              )}
            />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1">
        {rows.length === 0 ? (
          <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-4 text-center text-sm text-muted-foreground">
            No hay datos de señal suficientes para ubicar picos.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <Table className="min-w-[26rem] text-sm">
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 px-3 text-xs font-semibold text-muted-foreground">Señal</TableHead>
                  <TableHead className="h-9 px-3 text-xs font-semibold text-muted-foreground">Mínimo</TableHead>
                  <TableHead className="h-9 px-3 text-xs font-semibold text-muted-foreground">Máximo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ metric, label, Icon, iconClassName, decimals, min, max }) => (
                  <TableRow key={metric} className="hover:bg-muted/25">
                    <TableCell className="px-3 py-2.5 align-top">
                      <span className="inline-flex items-center gap-2 font-medium text-foreground">
                        <Icon aria-hidden="true" className={cn("size-4 shrink-0", iconClassName)} />
                        {label}
                      </span>
                    </TableCell>
                    <PeakCell event={min} decimals={decimals} onsetS={onsetS} />
                    <PeakCell event={max} decimals={decimals} onsetS={onsetS} />
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
