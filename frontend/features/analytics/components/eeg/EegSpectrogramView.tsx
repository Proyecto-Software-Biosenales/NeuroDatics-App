"use client"
import { EegChannelSelector } from "./EegChannelSelector"


import { Skeleton } from "@/components/ui/skeleton"

import { type Dispatch, type SetStateAction } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Activity, Radio, SlidersHorizontal, SquareDashed, TrendingUp, Waves } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { KpiCard } from "@/features/analytics/components/KpiCard"

import { StimulusFixationCard } from "../StimulusFixationCard"
import { InfoChip } from "../InfoChip"
import { TimeWindowControls, type TimeWindow, type TimeWindowDraft } from "../TimeWindowControls"
import { type EegSpectrogramData } from "../../types"
import { formatChannel, VIRIDIS_GRADIENT, type SpectrogramGaps } from "../../eegPresentation"
import { EEG_CHANNELS, type EegView, type SpectrogramStats } from "./eegViewShared"
import { SpectrogramStatsTable } from "./EegStatsTables"
import { SpectrogramPanel } from "./EegCanvasPanels"
import { groupChart, type EegGroupSlots } from "./EegGroupPieces"

/** Shared so a channel without a matrix keeps the same prop across renders. */
const EMPTY_MATRIX: Array<Array<number | null>> = []

interface EegSpectrogramViewProps {
  availableChannels: string[]
  handleChannelToggle: (channel: string) => void
  handleZoomSpectrogramTime: (start: number, end: number) => void
  handleResetSpectrogramZoom?: () => void
  handleBackSpectrogramZoom?: () => void
  participantCode: string | null
  projectId: string
  scenario: string
  selectedChannels: string[]
  selectedTime: number | null
  setSelectedTime: Dispatch<SetStateAction<number | null>>
  spectrogramData: EegSpectrogramData | null
  spectrogramError: string | null
  spectrogramLoading: boolean
  spectrogramPeak: SpectrogramStats | null
  spectrogramRepresentativeStats: { maxPower: number | null; meanPower: number | null; maxFrequency: number | null; }
  spectrogramSelectedValue: number | null
  spectrogramStats: SpectrogramStats[]
  spectrogramWindow: TimeWindow
  spectrogramWindowDraft: TimeWindowDraft
  spectrogramWindowError: string | null
  setSpectrogramWindowDraft: Dispatch<SetStateAction<TimeWindowDraft>>
  setSpectrogramWindowError: Dispatch<SetStateAction<string | null>>
  handleApplySpectrogramWindow: () => void
  handleResetSpectrogramWindow: () => void
  perChannelColorDomain: boolean
  setPerChannelColorDomain: Dispatch<SetStateAction<boolean>>
  interpolateSpectrogram: boolean
  setInterpolateSpectrogram: Dispatch<SetStateAction<boolean>>
  /** What the black bands are, counted; null while there is nothing to draw. */
  spectrogramGaps: SpectrogramGaps | null
  view: EegView
  visibleSpectrogramChannels: string[]
  /** «Promedio»: `spectrogramData` is the averaged spectrogram on the stimulus-time axis. */
  group?: EegGroupSlots | null
}

export function EegSpectrogramView({
  availableChannels,
  handleChannelToggle,
  handleZoomSpectrogramTime,
  handleResetSpectrogramZoom,
  handleBackSpectrogramZoom,
  participantCode,
  projectId,
  scenario,
  selectedChannels,
  selectedTime,
  setSelectedTime,
  spectrogramData,
  spectrogramError,
  spectrogramLoading,
  spectrogramPeak,
  spectrogramRepresentativeStats,
  spectrogramSelectedValue,
  spectrogramStats,
  spectrogramWindow,
  spectrogramWindowDraft,
  spectrogramWindowError,
  setSpectrogramWindowDraft,
  setSpectrogramWindowError,
  handleApplySpectrogramWindow,
  handleResetSpectrogramWindow,
  perChannelColorDomain,
  setPerChannelColorDomain,
  interpolateSpectrogram,
  setInterpolateSpectrogram,
  spectrogramGaps,
  view,
  visibleSpectrogramChannels,
  group = null,
}: EegSpectrogramViewProps) {
  return <>
{view === "spectrogram" ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 basis-72">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Waves className="h-5 w-5" />
                Espectrograma de frecuencias
              </CardTitle>
              <CardDescription>
                {group
                  ? group.description
                  : "Densidad espectral por ventana. dB referidos a 1 uV²/Hz; los huecos indican ventanas no disponibles."}
              </CardDescription>
            </div>
            <div className="flex max-w-full flex-wrap items-center gap-x-6 gap-y-3 text-sm">
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Unidad</span>
                <span className="font-semibold text-foreground">{spectrogramData?.unit ?? "dB"}</span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Ventanas</span>
                <span className="font-semibold text-foreground">{(spectrogramData?.time.length ?? 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Frecuencias</span>
                <span className="font-semibold text-foreground">{(spectrogramData?.frequency.length ?? 0).toLocaleString()}</span>
              </div>
              {/* The window is recomputed on the server, so the colour limits
                  follow what is visible instead of the whole block. Recording
                  seconds belong to one recording: no window in a group mode. */}
              {group ? null : <TimeWindowControls
                draftStart={spectrogramWindowDraft.start}
                draftEnd={spectrogramWindowDraft.end}
                appliedWindow={spectrogramWindow}
                error={spectrogramWindowError}
                loading={spectrogramLoading}
                onDraftStartChange={(value) => {
                  setSpectrogramWindowDraft((current) => ({ ...current, start: value }))
                  setSpectrogramWindowError(null)
                }}
                onDraftEndChange={(value) => {
                  setSpectrogramWindowDraft((current) => ({ ...current, end: value }))
                  setSpectrogramWindowError(null)
                }}
                onApply={handleApplySpectrogramWindow}
                onReset={handleResetSpectrogramWindow}
              />}
            </div>
          </CardHeader>
          <CardContent>
            {group ? group.kpis : <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              <KpiCard
                label="Frecuencia máxima"
                value={spectrogramRepresentativeStats.maxFrequency}
                unit="Hz"
                decimals={2}
                description="Límite visible del espectrograma"
                Icon={Radio}
                loading={spectrogramLoading}
                iconBgClass="bg-violet-100 dark:bg-violet-900/40"
                iconColorClass="text-violet-600 dark:text-violet-400"
                labelColorClass="text-violet-700 dark:text-violet-400"
              />
              <KpiCard
                label="Nivel máximo"
                value={spectrogramRepresentativeStats.maxPower}
                unit={spectrogramData?.unit ?? "dB"}
                decimals={4}
                Icon={TrendingUp}
                loading={spectrogramLoading}
                onClick={spectrogramPeak ? () => setSelectedTime(spectrogramPeak.peakTime) : undefined}
                active={selectedTime === spectrogramPeak?.peakTime}
                hoverBgClass="hover:bg-rose-50 dark:hover:bg-rose-950/30"
                activeBgClass="bg-rose-50 dark:bg-rose-950/30"
                iconBgClass="bg-rose-100 dark:bg-rose-900/40"
                iconColorClass="text-rose-600 dark:text-rose-400"
                labelColorClass="text-rose-700 dark:text-rose-400"
              />
              <KpiCard
                label="Nivel medio"
                value={spectrogramRepresentativeStats.meanPower}
                unit={spectrogramData?.unit ?? "dB"}
                decimals={4}
                Icon={Activity}
                loading={spectrogramLoading}
                iconBgClass="bg-emerald-100 dark:bg-emerald-900/40"
                iconColorClass="text-emerald-600 dark:text-emerald-400"
                labelColorClass="text-emerald-700 dark:text-emerald-400"
              />
            </div>}

            <EegChannelSelector channels={EEG_CHANNELS} availableChannels={availableChannels} selectedChannels={selectedChannels} onToggle={handleChannelToggle} />

            {group?.chart ? groupChart(group) : spectrogramLoading ? (
              <Skeleton className="h-[520px] w-full animate-pulse rounded-lg bg-muted" />
            ) : spectrogramError ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
                No se pudo cargar el espectrograma de EEG.
              </div>
            ) : !spectrogramData ||
              spectrogramData.time.length === 0 ||
              spectrogramData.frequency.length === 0 ||
              visibleSpectrogramChannels.length === 0 ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
                No hay datos suficientes para calcular el espectrograma.
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center">
                  <span className="w-24 text-xs text-muted-foreground">
                    {spectrogramData.color_domain.min.toFixed(2)}
                  </span>
                  <div
                    className="h-3 min-w-40 flex-1 rounded-full"
                    style={{ background: VIRIDIS_GRADIENT }}
                  />
                  <span className="w-24 text-right text-xs text-muted-foreground">
                    {spectrogramData.color_domain.max.toFixed(2)} {spectrogramData.unit}
                  </span>
                  {/* In SAIO block 5, F3 sits ~25 dB above its neighbours and
                      flattens every one of them onto the shared ramp. */}
                  <Label
                    htmlFor="spectrogram-per-channel-color"
                    className="flex items-center gap-2 whitespace-nowrap text-xs font-normal text-muted-foreground"
                  >
                    <Checkbox
                      id="spectrogram-per-channel-color"
                      checked={perChannelColorDomain}
                      onCheckedChange={(value) => setPerChannelColorDomain(value === true)}
                    />
                    Escala de color por canal
                  </Label>
                  {/* Each cell is one window by one frequency bin, so at this
                      size the matrix reads as blocks. Blending them is a
                      display choice and stays off by default. */}
                  <Label
                    htmlFor="spectrogram-interpolate"
                    className="flex items-center gap-2 whitespace-nowrap text-xs font-normal text-muted-foreground"
                  >
                    <Checkbox
                      id="spectrogram-interpolate"
                      checked={interpolateSpectrogram}
                      onCheckedChange={(value) => setInterpolateSpectrogram(value === true)}
                    />
                    Interpolar celdas
                  </Label>
                  {spectrogramGaps && (spectrogramGaps.nullColumnsAny > 0 || spectrogramGaps.missingWindows > 0) ? (
                    <InfoChip
                      Icon={SquareDashed}
                      label={`Bandas negras: ${(
                        spectrogramGaps.nullColumnsAny + spectrogramGaps.missingWindows
                      ).toLocaleString()} ventanas`}
                      detail={
                        <>
                          <p>
                            Una banda negra es tiempo sin estimación espectral. Las ventanas nunca se
                            calculan a caballo de un hueco, así que el color no se interpola sobre ellas.
                          </p>
                          <dl className="grid grid-cols-[auto_auto] gap-x-3 tabular-nums">
                            {spectrogramGaps.missingWindows > 0 ? (
                              <div className="contents">
                                <dt className="font-semibold">{spectrogramGaps.missingWindows}</dt>
                                <dd>
                                  ventanas que no existen: la ventana de análisis no cabe entre dos
                                  discontinuidades (salto de reloj o cambio de escenario)
                                </dd>
                              </div>
                            ) : null}
                            {spectrogramGaps.nullColumnsAny > 0 ? (
                              <div className="contents">
                                <dt className="font-semibold">{spectrogramGaps.nullColumnsAny}</dt>
                                <dd>
                                  ventanas descartadas por contener muestras ausentes, en al menos un
                                  canal mostrado
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                          {spectrogramGaps.nullColumns.length > 0 ? (
                            <p>
                              Por canal:{" "}
                              {spectrogramGaps.nullColumns
                                .map((row) => `${formatChannel(row.channel)} ${row.count}`)
                                .join(" · ")}
                              .
                            </p>
                          ) : null}
                          <p className="text-muted-foreground">
                            {spectrogramGaps.seconds.toFixed(1)} s del eje sin estimación, sobre ventanas
                            de {spectrogramGaps.hopS.toFixed(2)} s.
                          </p>
                        </>
                      }
                    />
                  ) : null}
                  {group?.notes}
                  {perChannelColorDomain && spectrogramData.channel_color_domain ? (
                    <InfoChip
                      Icon={SlidersHorizontal}
                      label="Límites por panel"
                      detail={
                        <>
                          <p>Cada panel usa sus propios límites; no compares colores entre canales.</p>
                          <dl className="grid grid-cols-[auto_auto] gap-x-3 tabular-nums">
                            {visibleSpectrogramChannels.map((channel) => {
                              const domain = spectrogramData.channel_color_domain?.[channel]
                              return domain ? (
                                <div key={channel} className="contents">
                                  <dt className="font-semibold">{formatChannel(channel)}</dt>
                                  <dd>
                                    {domain.min.toFixed(1)}…{domain.max.toFixed(1)} {spectrogramData.unit}
                                  </dd>
                                </div>
                              ) : null
                            })}
                          </dl>
                          <p className="text-muted-foreground">Esta barra es la escala compartida.</p>
                        </>
                      }
                    />
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {visibleSpectrogramChannels.map((channel) => (
                    <SpectrogramPanel
                      key={`${channel}-spectrogram`}
                      channel={channel}
                      time={spectrogramData.time}
                      frequency={spectrogramData.frequency}
                      matrix={spectrogramData.power[channel] ?? EMPTY_MATRIX}
                      hopS={Number(spectrogramData.metadata?.display_hop_s ?? spectrogramData.metadata?.hop_s)}
                      colorDomain={
                        spectrogramData.channel_color_domain?.[channel] ??
                        spectrogramData.color_domain
                      }
                      unit={spectrogramData.unit}
                      interpolate={interpolateSpectrogram}
                      selectedTime={selectedTime}
                      onTimeSelect={setSelectedTime}
                      onTimeZoom={handleZoomSpectrogramTime}
                      onZoomReset={handleResetSpectrogramZoom}
                      onZoomBack={handleBackSpectrogramZoom}
                    />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

{view === "spectrogram" && !group ? (
        <StimulusFixationCard
          projectId={projectId}
          participantCode={participantCode}
          scenario={scenario}
          selectedTime={selectedTime}
          selectedValue={spectrogramSelectedValue}
          selectedValueLabel="POTENCIA"
          selectedValueSub={spectrogramData?.unit ?? "potencia EEG"}
          selectedValueDecimals={4}
          totalDurationS={spectrogramData?.time[spectrogramData.time.length - 1] ?? null}
          description="Ubicación de la mirada del participante durante el instante seleccionado del espectrograma."
          emptyText="Haz clic en un espectrograma o en Nivel máximo para ver la mirada del participante"
          onClearSelection={() => setSelectedTime(null)}
        />
      ) : null}

{view === "spectrogram" && group ? group.stats : null}

{view === "spectrogram" && !group ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Estadísticas del espectrograma</CardTitle>
            <CardDescription>
              Estadísticas descriptivas de los píxeles visibles; el promedio en dB no es potencia integrada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {spectrogramLoading ? (
              <Skeleton className="h-52 w-full animate-pulse rounded-lg bg-muted" />
            ) : spectrogramStats.length === 0 ? (
              <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
                No hay datos suficientes para calcular estadísticas del espectrograma.
              </div>
            ) : (
              <SpectrogramStatsTable rows={spectrogramStats} unit={spectrogramData?.unit ?? "dB"} />
            )}
          </CardContent>
        </Card>
      ) : null}
  </>
}
