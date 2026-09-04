"use client"

import { type Dispatch, type SetStateAction } from "react"
import { Activity, Radio, TrendingUp, Waves } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { KpiCard } from "@/components/ui/KpiCard"
import { cn } from "@/lib/utils"
import { StimulusFixationCard } from "../StimulusFixationCard"
import { type EegSpectrogramData } from "../../types"
import { formatChannel, VIRIDIS_GRADIENT } from "../../eegPresentation"
import { EEG_CHANNELS, CHANNEL_COLORS, type EegView, type SpectrogramStats } from "./eegViewShared"
import { SpectrogramStatsTable } from "./EegStatsTables"
import { SpectrogramPanel } from "./EegCanvasPanels"

interface EegSpectrogramViewProps {
  availableChannels: string[]
  handleChannelToggle: (channel: string) => void
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
  view: EegView
  visibleSpectrogramChannels: string[]
}

export function EegSpectrogramView({
  availableChannels,
  handleChannelToggle,
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
  view,
  visibleSpectrogramChannels,
}: EegSpectrogramViewProps) {
  return <>
{view === "spectrogram" ? (
        <Card>
          <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Waves className="h-5 w-5" />
                Espectrograma de frecuencias
              </CardTitle>
              <CardDescription>
                Variación temporal de potencia por frecuencia para los canales EEG seleccionados.
              </CardDescription>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Unidad</span>
                <span className="font-semibold text-foreground">{spectrogramData?.unit ?? "dB centrado"}</span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Ventanas</span>
                <span className="font-semibold text-foreground">{(spectrogramData?.time.length ?? 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Frecuencias</span>
                <span className="font-semibold text-foreground">{(spectrogramData?.frequency.length ?? 0).toLocaleString()}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
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
                label="Potencia máxima"
                value={spectrogramRepresentativeStats.maxPower}
                unit={spectrogramData?.unit ?? "dB centrado"}
                decimals={4}
                description="Mayor valor visible"
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
                label="Potencia media"
                value={spectrogramRepresentativeStats.meanPower}
                unit={spectrogramData?.unit ?? "dB centrado"}
                decimals={4}
                description="Promedio de la matriz visible"
                Icon={Activity}
                loading={spectrogramLoading}
                iconBgClass="bg-emerald-100 dark:bg-emerald-900/40"
                iconColorClass="text-emerald-600 dark:text-emerald-400"
                labelColorClass="text-emerald-700 dark:text-emerald-400"
              />
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {EEG_CHANNELS.map((channel) => {
                const isActive = selectedChannels.includes(channel)
                const isAvailable = availableChannels.includes(channel)
                return (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => handleChannelToggle(channel)}
                    disabled={!isAvailable}
                    className={cn(
                      "inline-flex min-w-12 items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium transition",
                      isActive && isAvailable
                        ? "border-transparent text-white"
                        : "border-border bg-background text-muted-foreground hover:bg-muted",
                      !isAvailable && "cursor-not-allowed opacity-40"
                    )}
                    style={isActive && isAvailable ? { backgroundColor: CHANNEL_COLORS[channel] } : undefined}
                  >
                    {formatChannel(channel)}
                  </button>
                )
              })}
            </div>

            {spectrogramLoading ? (
              <div className="h-[520px] w-full animate-pulse rounded-lg bg-muted" />
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
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {visibleSpectrogramChannels.map((channel) => (
                    <SpectrogramPanel
                      key={`${channel}-spectrogram`}
                      channel={channel}
                      time={spectrogramData.time}
                      frequency={spectrogramData.frequency}
                      matrix={spectrogramData.power[channel] ?? []}
                      colorDomain={spectrogramData.color_domain}
                      unit={spectrogramData.unit}
                      selectedTime={selectedTime}
                      onTimeSelect={setSelectedTime}
                    />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

{view === "spectrogram" ? (
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
          emptyText="Haz clic en un espectrograma o en Potencia máxima para ver la mirada del participante"
          metricDescription="la potencia EEG del espectrograma"
          onClearSelection={() => setSelectedTime(null)}
        />
      ) : null}

{view === "spectrogram" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Estadísticas del espectrograma</CardTitle>
            <CardDescription>
              Resumen de potencia, frecuencia pico y tiempo pico para los canales seleccionados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {spectrogramLoading ? (
              <div className="h-52 w-full animate-pulse rounded-lg bg-muted" />
            ) : spectrogramStats.length === 0 ? (
              <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
                No hay datos suficientes para calcular estadísticas del espectrograma.
              </div>
            ) : (
              <SpectrogramStatsTable rows={spectrogramStats} unit={spectrogramData?.unit ?? "dB centrado"} />
            )}
          </CardContent>
        </Card>
      ) : null}
  </>
}
