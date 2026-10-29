"use client"

import type { ReactNode } from "react"
import { AlertTriangle, Ruler } from "lucide-react"
import { FieldHint } from "@/components/FieldHint"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { InfoChip } from "../InfoChip"
import {
  channelQualityRows,
  clusterArtifactSpans,
  describeArtifactCluster,
  formatChannel,
  formatNumber,
  formatSpanRange,
  qualityCardWarnings,
  visibleArtifactSpans,
  type ArtifactSpanCluster,
  type ChannelQualityRow,
} from "../../eegPresentation"
import type { EegArtifactSpan, EegMetadata } from "../../types"
import { CHANNEL_COLORS, EEG_QUALITY_NOTES_ID, JUMP_TARGET_CLASS } from "./eegViewShared"

/**
 * Processing warnings close the tab: they still have to be read before
 * comparing, but they no longer push every chart down. Only what no other
 * element states reaches this card; per-channel facts live in «Calidad por canal».
 */
export function EegQualityNotes({ metadata }: { metadata?: EegMetadata }) {
  const warnings = qualityCardWarnings(metadata)
  if (warnings.length === 0) return null

  return (
    <Card role="status" id={EEG_QUALITY_NOTES_ID} tabIndex={-1} className={JUMP_TARGET_CLASS}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Calidad y alcance de EEG
        </CardTitle>
        <CardDescription>Avisos del procesamiento de este registro. La señal no se ha corregido.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/** What each detector found, said for someone who has never read the methods guide. */
const DETECTOR_PLAIN: Record<EegArtifactSpan["detector"], string> = {
  amplitude: "Amplitud muy por encima de lo habitual en este canal.",
  step: "Salto brusco entre dos muestras seguidas.",
  peak_to_peak: "Oscilación muy amplia en poco tiempo.",
}

function clusterContains(cluster: ArtifactSpanCluster, time: number | null) {
  return time != null && time >= cluster.start_s - 1e-6 && time <= cluster.end_s + 1e-6
}

function ArtifactChip({
  cluster,
  selectedTime,
  onSelectTime,
}: {
  cluster: ArtifactSpanCluster
  selectedTime: number | null
  onSelectTime: (time: number) => void
}) {
  const range = formatSpanRange(cluster.start_s, cluster.end_s)
  const runs = cluster.spans.length > 1 ? ` ×${cluster.spans.length}` : ""
  return (
    <InfoChip
      // Starts with the visible text, so voice control can name it.
      ariaLabel={`${range}${runs}: ir a ${describeArtifactCluster(cluster)}`}
      label={
        <>
          {range}
          {runs ? <span className="text-muted-foreground">{runs}</span> : null}
        </>
      }
      detail={
        <>
          <p className="font-semibold">
            {formatChannel(cluster.channel)} · {range}
          </p>
          {cluster.detectors.map((detector) => (
            <p key={detector}>{DETECTOR_PLAIN[detector] ?? detector}</p>
          ))}
          <p className="text-muted-foreground">
            Pico {formatNumber(cluster.peak_uV, 1, " uV")}
            {cluster.spans.length > 1 ? ` · ${cluster.spans.length} tramos seguidos` : ""}. Clic para verlo en el
            gráfico.
          </p>
        </>
      }
      pressed={clusterContains(cluster, selectedTime)}
      onClick={() => onSelectTime(cluster.start_s)}
    />
  )
}

/** At most a couple of notices per channel, each explained in its tooltip. */
function channelNotices(row: ChannelQualityRow, finestStep: number | null) {
  const notices: { label: string; detail: string }[] = []
  const step = formatNumber(row.quantizationStepUV, 2, " uV")
  if (row.constant) {
    notices.push({
      label: "Señal plana",
      detail: "El canal no varía en todo el registro: revisa el contacto del electrodo, la saturación o la exportación.",
    })
  }
  if (row.rescaled) {
    notices.push({
      label: "Unidad convertida",
      detail: `El archivo traía este canal en ${row.sourceUnit} y se convirtió a uV. La magnitud es correcta, pero la resolución sigue siendo la del archivo${row.coarselyQuantized ? ` (pasos de ${step})` : ""}.`,
    })
  } else if (row.coarselyQuantized) {
    notices.push({
      label: "Resolución baja",
      detail: `El exportador guardó este canal en pasos de ${step}, más gruesos que en los demás canales (${formatNumber(finestStep, 2, " uV")}): las oscilaciones pequeñas no se distinguen.`,
    })
  }
  return notices
}

function HeaderWithHint({ children, hint, label }: { children: ReactNode; hint: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <FieldHint label={label}>{hint}</FieldHint>
    </span>
  )
}

/**
 * One row per visible channel: missing samples, the candidate artefacts (each a
 * chip that marks its start on the chart) and the notices worth reading before
 * comparing. The chart itself is not shaded: the spans of several channels
 * overlapped until the whole trace was tinted. The detectors' numbers stay in
 * each chip's tooltip.
 */
export function EegChannelQualityTable({
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
  const rows = channelQualityRows(metadata, channels)
  if (rows.length === 0) return null
  const spans = visibleArtifactSpans(metadata, channels)
  const clusters = clusterArtifactSpans(spans)
  const total = metadata?.artifact_spans_total ?? spans.length
  const reported = metadata?.artifact_spans?.length ?? spans.length
  const steps = rows
    .map((row) => row.quantizationStepUV)
    .filter((step): step is number => step != null && step > 0)
  const finestStep = steps.length > 0 ? Math.min(...steps) : null
  const headerClass = "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Ruler aria-hidden="true" className="h-4 w-4" />
          Calidad por canal
        </CardTitle>
        <CardDescription>
          Lo que el procesamiento encontró en cada canal visible. Nada se ha corregido ni eliminado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/60">
                <TableHead className={cn(headerClass, "w-28 text-left")}>Canal</TableHead>
                <TableHead className={cn(headerClass, "w-44 text-right")}>
                  <HeaderWithHint label="Qué son las muestras ausentes" hint="Instantes sin valor en el archivo. El gráfico los deja como huecos y los análisis espectrales saltan las ventanas que los contienen.">
                    Muestras ausentes
                  </HeaderWithHint>
                </TableHead>
                <TableHead className={cn(headerClass, "text-left")}>
                  <HeaderWithHint
                    label="Qué son los posibles artefactos"
                    hint={
                      <>
                        <p>
                          Tramos que los detectores señalan como posible artefacto (movimiento, parpadeo, mal
                          contacto). La señal no se ha modificado.
                        </p>
                        <p>Haz clic en un tramo para marcar ese instante en el gráfico.</p>
                        {total > reported ? <p>Se muestran los {reported} más severos de {total}.</p> : null}
                      </>
                    }
                  >
                    Posibles artefactos
                  </HeaderWithHint>
                </TableHead>
                <TableHead className={cn(headerClass, "w-48 text-left")}>
                  <HeaderWithHint label="Qué son los avisos" hint="Lo que conviene saber antes de comparar este canal con otros. Pasa el cursor sobre cada aviso para leerlo.">
                    Avisos
                  </HeaderWithHint>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const events = clusters.filter((cluster) => cluster.channel === row.channel)
                const notices = channelNotices(row, finestStep)
                return (
                  <TableRow key={row.channel} className="border-b border-border/50 last:border-b-0 hover:bg-muted/30">
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: CHANNEL_COLORS[row.channel] ?? "#4B5563" }}
                        />
                        <span className="font-semibold text-foreground">{formatChannel(row.channel)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right tabular-nums text-foreground/80">
                      {row.missingSamples.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-2">
                      {events.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {events.map((cluster) => (
                            <ArtifactChip
                              key={`${cluster.channel}-${cluster.start_s}`}
                              cluster={cluster}
                              selectedTime={selectedTime}
                              onSelectTime={onSelectTime}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Ninguno</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-2">
                      {notices.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {notices.map((notice) => (
                            <InfoChip key={notice.label} label={notice.label} detail={notice.detail} />
                          ))}
                        </div>
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
      </CardContent>
    </Card>
  )
}
