"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronDown, Crosshair, FileWarning, LocateFixed, Ruler } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { InfoChip } from "../InfoChip"
import {
  channelQualityRows,
  clusterArtifactSpans,
  describeArtifactCluster,
  describeArtifactSpan,
  formatChannel,
  formatNumber,
  formatSpanRange,
  qualityCardWarnings,
  reingestionNotice,
  visibleArtifactSpans,
  type ArtifactSpanCluster,
} from "../../eegPresentation"
import type { EegArtifactSpan, EegMetadata } from "../../types"
import {
  ARTIFACT_DETECTOR_COLORS,
  ARTIFACT_DETECTORS,
  CHANNEL_COLORS,
  EEG_ARTIFACT_SPANS_ID,
  EEG_QUALITY_NOTES_ID,
  JUMP_TARGET_CLASS,
} from "./eegViewShared"

function unitCaveats(metadata: EegMetadata | undefined): string[] {
  const notice = reingestionNotice(metadata)
  if (!notice.needed) return []
  const lines: string[] = []
  if (notice.rescaledChannels.length > 0) {
    lines.push(
      `Reescalados en ingesta: ${notice.rescaledChannels
        .map((channel) => `${formatChannel(channel)} (${metadata?.source_units?.[channel]})`)
        .join(", ")}. El reescalado corrige la magnitud, no recupera la precisión perdida.`
    )
  }
  if (notice.assumedChannels.length > 0) {
    lines.push(
      `Unidad no declarada, uV supuesto: ${notice.assumedChannels.map(formatChannel).join(", ")}.`
    )
  }
  if (notice.excludedChannels.length > 0) {
    lines.push(
      `Excluidos por unidad ambigua: ${notice.excludedChannels.map(formatChannel).join(", ")}.`
    )
  }
  return lines
}

/** Every line the end-of-tab quality card shows, unit caveats first: the chart
 *  chip counts them and previews the first few in its tooltip. */
export function eegQualityLines(metadata: EegMetadata | undefined): string[] {
  return [...unitCaveats(metadata), ...qualityCardWarnings(metadata)]
}

/**
 * Processing warnings and unit caveats close the tab: they still have to be
 * read before comparing, but they no longer push every chart down. A chip
 * beside each chart counts them, previews them and jumps here.
 */
export function EegQualityNotes({ metadata }: { metadata?: EegMetadata }) {
  const warnings = qualityCardWarnings(metadata)
  const caveats = unitCaveats(metadata)
  if (warnings.length === 0 && caveats.length === 0) return null

  return (
    <Card role="status" id={EEG_QUALITY_NOTES_ID} tabIndex={-1} className={JUMP_TARGET_CLASS}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Calidad y alcance de EEG
        </CardTitle>
        <CardDescription>
          Avisos del procesamiento de este registro. Descriptivos: la señal no se ha corregido.
        </CardDescription>
        {caveats.length > 0 ? (
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link href="/proyectos">Volver a ingerir</Link>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {caveats.length > 0 ? (
          <div className="flex gap-2">
            <FileWarning aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
            <div>
              <strong className="font-semibold text-foreground">Unidades EEG con salvedades</strong>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                {caveats.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="mt-1 text-muted-foreground">
                No compares este participante con otro ingerido bajo otras unidades sin volver a ingerir ambos.
              </p>
            </div>
          </div>
        ) : null}
        {warnings.length > 0 ? (
          <ul
            className={cn(
              "list-disc space-y-1 pl-5 text-muted-foreground",
              caveats.length > 0 && "border-t border-border pt-3 pl-11"
            )}
          >
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}

/** Square swatches: the chart draws detector spans as shaded bands, not lines. */
function DetectorSwatches({ detectors }: { detectors: EegArtifactSpan["detector"][] }) {
  return (
    <span aria-hidden="true" className="inline-flex gap-0.5">
      {detectors.map((detector) => (
        <span
          key={detector}
          className="size-2 rounded-[2px]"
          style={{ backgroundColor: ARTIFACT_DETECTOR_COLORS[detector] ?? "#DC2626" }}
        />
      ))}
    </span>
  )
}

/** Which colour is which detector, for the span card and the chart chip. */
export function ArtifactDetectorLegend({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      {ARTIFACT_DETECTORS.map(({ detector, label }) => (
        <span key={detector} className="inline-flex items-center gap-1">
          <DetectorSwatches detectors={[detector]} />
          {label}
        </span>
      ))}
    </span>
  )
}

function clusterContains(cluster: ArtifactSpanCluster, time: number | null) {
  return time != null && time >= cluster.start_s - 1e-6 && time <= cluster.end_s + 1e-6
}

function count(value: number, one: string, many: string) {
  return `${value} ${value === 1 ? one : many}`
}

/**
 * Where the detectors fired: channel groups side by side, one chip per event.
 * The individual detector runs stay one click away in the detail table.
 */
export function EegArtifactSpanList({
  metadata,
  channels,
  selectedTime,
  onSelectTime,
}: {
  metadata?: EegMetadata
  channels: string[]
  selectedTime: number | null
  onSelectTime: (time: number) => void
}) {
  const [detailOpen, setDetailOpen] = useState(false)
  const spans = visibleArtifactSpans(metadata, channels)
  if (spans.length === 0) return null
  const total = metadata?.artifact_spans_total ?? spans.length
  const reported = metadata?.artifact_spans?.length ?? spans.length
  const clusters = clusterArtifactSpans(spans)
  const rows = channels
    .map((channel) => ({ channel, clusters: clusters.filter((cluster) => cluster.channel === channel) }))
    .filter((row) => row.clusters.length > 0)

  return (
    <Card id={EEG_ARTIFACT_SPANS_ID} tabIndex={-1} className={JUMP_TARGET_CLASS}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Crosshair aria-hidden="true" className="h-4 w-4" />
          Tramos con artefacto candidato
        </CardTitle>
        <CardDescription>
          {count(clusters.length, "evento", "eventos")} · {count(spans.length, "tramo", "tramos")} del detector
          en los canales visibles
          {total > reported ? ` (se informan los ${reported} más severos de ${total})` : ""}. Señalados, no
          eliminados.
        </CardDescription>
        <CardAction className="hidden sm:block">
          <ArtifactDetectorLegend />
        </CardAction>
      </CardHeader>
      <CardContent>
        <Collapsible open={detailOpen} onOpenChange={setDetailOpen}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {rows.map((row) => (
                <li key={row.channel} className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 pr-0.5 text-xs font-semibold text-foreground">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: CHANNEL_COLORS[row.channel] ?? "#4B5563" }}
                    />
                    {formatChannel(row.channel)}
                  </span>
                  {row.clusters.map((cluster) => {
                    const range = formatSpanRange(cluster.start_s, cluster.end_s)
                    const runs = cluster.spans.length > 1 ? ` ×${cluster.spans.length}` : ""
                    const description = describeArtifactCluster(cluster)
                    return (
                      <InfoChip
                        key={`${cluster.channel}-${cluster.start_s}`}
                        // Starts with the visible text, so voice control can name it.
                        ariaLabel={`${range}${runs}: ir a ${description}`}
                        marks={<DetectorSwatches detectors={cluster.detectors} />}
                        label={
                          <>
                            {range}
                            {runs ? <span className="text-muted-foreground">{runs}</span> : null}
                          </>
                        }
                        detail={
                          <>
                            <p>{description}</p>
                            <p className="text-muted-foreground">Clic para verlo en el gráfico.</p>
                          </>
                        }
                        pressed={clusterContains(cluster, selectedTime)}
                        onClick={() => onSelectTime(cluster.start_s)}
                      />
                    )
                  })}
                </li>
              ))}
            </ul>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="xs" className="text-muted-foreground">
                <ChevronDown aria-hidden="true" className={cn("transition-transform", detailOpen && "rotate-180")} />
                {detailOpen ? "Ocultar detalle" : `Detalle de los ${count(spans.length, "tramo", "tramos")}`}
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-border">
              <Table className="w-full text-xs">
                <TableHeader>
                  <TableRow className="bg-muted/60">
                    {["Canal", "Inicio", "Fin", "Pico", "z", "Detector", ""].map((header, index) => (
                      <TableHead
                        key={header || "go"}
                        className={cn("h-8 px-3", index >= 1 && index <= 4 ? "text-right" : "text-left")}
                      >
                        {header || <span className="sr-only">Ir</span>}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spans.map((span, index) => (
                    <TableRow key={`${span.channel}-${span.detector}-${span.start_s}-${index}`}>
                      <TableCell className="px-3 py-1 font-semibold">{formatChannel(span.channel)}</TableCell>
                      <TableCell className="px-3 py-1 text-right tabular-nums">{span.start_s.toFixed(2)} s</TableCell>
                      <TableCell className="px-3 py-1 text-right tabular-nums">{span.end_s.toFixed(2)} s</TableCell>
                      <TableCell className="px-3 py-1 text-right tabular-nums">{formatNumber(span.peak_uV, 1, " uV")}</TableCell>
                      <TableCell className="px-3 py-1 text-right tabular-nums">{formatNumber(span.z, 1)}</TableCell>
                      <TableCell className="px-3 py-1">
                        <span className="inline-flex items-center gap-1.5">
                          <DetectorSwatches detectors={[span.detector]} />
                          {ARTIFACT_DETECTORS.find((item) => item.detector === span.detector)?.label ?? span.detector}
                        </span>
                      </TableCell>
                      <TableCell className="px-1 py-0.5 text-right">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Ir a ${describeArtifactSpan(span)}`}
                          onClick={() => onSelectTime(span.start_s)}
                        >
                          <LocateFixed aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

/** Quality the backend already measured per channel and nothing was showing. */
export function EegChannelQualityTable({
  metadata,
  channels,
}: {
  metadata?: EegMetadata
  channels: string[]
}) {
  const rows = channelQualityRows(metadata, channels)
  if (rows.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Ruler className="h-4 w-4" />
          Calidad por canal
        </CardTitle>
        <CardDescription>
          Resolución del exportador, muestras repetidas, huecos y desplazamiento. Descriptivo: nada de
          esto se ha corregido.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/60">
                {["Canal", "Paso mín.", "Repetidas", "Ausentes", "Desplaz.", "z máx.", "Marcadas", "Avisos"].map(
                  (header, index) => (
                    <TableHead
                      key={header}
                      className={cn(
                        "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                        index === 0 || index === 7 ? "text-left" : "text-right"
                      )}
                    >
                      {header}
                    </TableHead>
                  )
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.channel} className="border-b border-border/50 last:border-b-0 hover:bg-muted/30">
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: CHANNEL_COLORS[row.channel] ?? "#4B5563" }}
                      />
                      <span className="font-semibold text-foreground">{formatChannel(row.channel)}</span>
                    </div>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "px-4 py-3 text-right",
                      row.coarselyQuantized
                        ? "font-semibold text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {formatNumber(row.quantizationStepUV, 2, " uV")}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-foreground/80">
                    {row.repeatedFraction == null ? "—" : `${(row.repeatedFraction * 100).toFixed(2)} %`}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-foreground/80">
                    {row.missingSamples.toLocaleString()}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-foreground/80">
                    {formatNumber(row.medianOffset, 1, " uV")}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-foreground/80">
                    {formatNumber(row.amplitudeZMax, 1)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-foreground/80">
                    {(
                      row.amplitudeOutlierSamples +
                      row.transientCandidates +
                      row.peakToPeakExcursions
                    ).toLocaleString()}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.coarselyQuantized ? (
                        <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
                          cuantización gruesa
                        </Badge>
                      ) : null}
                      {row.assumedUnit ? (
                        <Badge variant="outline" className="border-orange-500 text-orange-700 dark:text-orange-400">
                          uV supuesto
                        </Badge>
                      ) : null}
                      {row.sourceUnit && row.sourceUnit !== "uv" ? (
                        <Badge variant="outline" className="border-orange-500 text-orange-700 dark:text-orange-400">
                          origen {row.sourceUnit}
                        </Badge>
                      ) : null}
                      {row.amplitudeOutlierSamples > 0 ? (
                        <Badge variant="outline" className="border-rose-500 text-rose-700 dark:text-rose-400">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          amplitud
                        </Badge>
                      ) : null}
                      {row.transientCandidates > 0 ? (
                        <Badge variant="outline" className="border-rose-500 text-rose-700 dark:text-rose-400">
                          escalón
                        </Badge>
                      ) : null}
                      {row.peakToPeakExcursions > 0 ? (
                        <Badge variant="outline" className="border-rose-500 text-rose-700 dark:text-rose-400">
                          pico a pico {formatNumber(row.peakToPeakMaxUV, 0, " uV")}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
