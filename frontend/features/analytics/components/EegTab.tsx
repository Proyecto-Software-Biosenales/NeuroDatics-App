"use client"

import { EegTimeseriesView } from "./eeg/EegTimeseriesView"
import { EegPsdView } from "./eeg/EegPsdView"

import { useMemo, useState, type ChangeEvent } from "react"
import { Activity, Brain, Clock, Radio, TrendingUp, Waves } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card"
import { KpiCard } from "@/components/ui/KpiCard"
import { cn } from "@/lib/utils"
import { useEegPsd, useEegSpectrogram, useEegTimeseries, useEegTopography } from "../hooks/useAnalyticsData"
import { StimulusFixationCard } from "./StimulusFixationCard"
import { EMPTY_TIME_WINDOW, EMPTY_TIME_WINDOW_DRAFT, parseTimeWindowValue, validateTimeWindowDraft, type TimeWindow, type TimeWindowDraft } from "./TimeWindowControls"
import { SpectrogramStatsTable } from "./eeg/EegStatsTables"
import { SpectrogramPanel, TopographyScene } from "./eeg/EegCanvasPanels"
import { EEG_CHANNELS, TOPOGRAPHY_CHANNELS, CHANNEL_COLORS, type SignalMode, type EegTabProps, type EegChartPoint, type EegPsdChartPoint, type PsdStats, type SpectrogramStats } from "./eeg/eegViewShared"
import {
  buildStats, finiteValues, formatChannel, formatNumber,
  mean, median, readClickedTime,
  rotateTopographyPositionClockwise, std, VIRIDIS_GRADIENT,
  type ChannelStats, type TopographyFrameRow,
} from "../eegPresentation"
const EMPTY_CHANNELS: string[] = []

export function EegTab({ projectId, participantCode, scenario, view }: EegTabProps) {
  const [selectedChannels, setSelectedChannels] = useState<string[]>(EEG_CHANNELS)
  const [signalMode, setSignalMode] = useState<SignalMode>("smooth")
  const [selectedTime, setSelectedTime] = useState<number | null>(null)
  const [selectedTopographyFrame, setSelectedTopographyFrame] = useState(0)
  const [timeseriesWindowDraft, setTimeseriesWindowDraft] = useState<TimeWindowDraft>(EMPTY_TIME_WINDOW_DRAFT)
  const [timeseriesWindow, setTimeseriesWindow] = useState<TimeWindow>(EMPTY_TIME_WINDOW)
  const [timeseriesWindowError, setTimeseriesWindowError] = useState<string | null>(null)
  const [psdWindowDraft, setPsdWindowDraft] = useState<TimeWindowDraft>(EMPTY_TIME_WINDOW_DRAFT)
  const [psdWindow, setPsdWindow] = useState<TimeWindow>(EMPTY_TIME_WINDOW)
  const [psdWindowError, setPsdWindowError] = useState<string | null>(null)

  const {
    data: timeseriesData,
    loading: timeseriesLoading,
    error: timeseriesError,
  } = useEegTimeseries(
    projectId,
    participantCode,
    scenario,
    selectedChannels,
    0.2,
    5000,
    timeseriesWindow.start,
    timeseriesWindow.end
  )
  const {
    data: psdData,
    loading: psdLoading,
    error: psdError,
  } = useEegPsd(
    projectId,
    participantCode,
    scenario,
    selectedChannels,
    null,
    true,
    5000,
    psdWindow.start,
    psdWindow.end
  )
  const {
    data: spectrogramData,
    loading: spectrogramLoading,
    error: spectrogramError,
  } = useEegSpectrogram(
    projectId,
    view === "spectrogram" ? participantCode : null,
    scenario,
    selectedChannels
  )
  const {
    data: topographyData,
    loading: topographyLoading,
    error: topographyError,
  } = useEegTopography(
    projectId,
    view === "topography" ? participantCode : null,
    scenario,
    selectedChannels
  )

  const chartData = useMemo<EegChartPoint[]>(() => {
    if (!timeseriesData) return []

    return timeseriesData.time.map((time, index) => {
      const point: EegChartPoint = { time }
      for (const channel of timeseriesData.channels) {
        point[`${channel}_raw`] = timeseriesData.raw[channel]?.[index] ?? 0
        point[`${channel}_smooth`] = timeseriesData.smooth[channel]?.[index] ?? 0
      }
      return point
    })
  }, [timeseriesData])

  const chartDomain = useMemo<[number, number] | ["dataMin", "dataMax"]>(() => {
    if (chartData.length === 0) return ["dataMin", "dataMax"]
    return [chartData[0].time, chartData[chartData.length - 1].time]
  }, [chartData])

  const psdChartData = useMemo<EegPsdChartPoint[]>(() => {
    if (!psdData) return []

    return psdData.frequency.map((frequency, index) => {
      const point: EegPsdChartPoint = { frequency }
      for (const channel of psdData.channels) {
        point[channel] = psdData.power[channel]?.[index] ?? 0
      }
      return point
    })
  }, [psdData])

  const psdDomain = useMemo<[number, number] | ["dataMin", "dataMax"]>(() => {
    if (psdChartData.length === 0) return ["dataMin", "dataMax"]
    return [psdChartData[0].frequency, psdChartData[psdChartData.length - 1].frequency]
  }, [psdChartData])

  const selectedPoint = useMemo<EegChartPoint | null>(() => {
    if (selectedTime == null || chartData.length === 0) return null
    let nearest = chartData[0]
    let minDiff = Math.abs(chartData[0].time - selectedTime)
    for (const point of chartData) {
      const diff = Math.abs(point.time - selectedTime)
      if (diff < minDiff) {
        minDiff = diff
        nearest = point
      }
    }
    return nearest
  }, [chartData, selectedTime])

  const channelStats = useMemo<ChannelStats[]>(() => {
    if (!timeseriesData) return []
    return timeseriesData.channels
      .map((channel) => {
        const values = finiteValues(timeseriesData.smooth[channel] ?? [])
        return buildStats(channel, values)
      })
      .filter((row): row is ChannelStats => row != null)
  }, [timeseriesData])

  const timeRepresentativeStats = useMemo(() => {
    const values = channelStats.flatMap((row) =>
      finiteValues(timeseriesData?.smooth[row.channel] ?? [])
    )
    if (values.length === 0) {
      return {
        meanValue: null,
        minValue: null,
        maxValue: null,
      }
    }

    return {
      meanValue: mean(values),
      minValue: Math.min(...values),
      maxValue: Math.max(...values),
    }
  }, [channelStats, timeseriesData])

  const psdStats = useMemo<PsdStats[]>(() => {
    if (!psdData) return []
    return psdData.channels
      .map((channel) => {
        const values = finiteValues(psdData.power[channel] ?? [])
        const stats = buildStats(channel, values)
        if (!stats || values.length === 0) return null

        let peakIndex = 0
        for (let index = 1; index < values.length; index += 1) {
          if (values[index] > values[peakIndex]) {
            peakIndex = index
          }
        }

        return {
          ...stats,
          peakFrequency: psdData.frequency[peakIndex] ?? 0,
          peakPower: values[peakIndex],
        }
      })
      .filter((row): row is PsdStats => row != null)
  }, [psdData])

  const psdRepresentativeStats = useMemo(() => {
    if (psdStats.length === 0) {
      return {
        peakFrequency: null,
        peakPower: null,
        meanPower: null,
      }
    }

    const peak = psdStats.reduce((best, row) =>
      row.peakPower > best.peakPower ? row : best
    )
    const allPower = psdStats.flatMap((row) => finiteValues(psdData?.power[row.channel] ?? []))

    return {
      peakFrequency: peak.peakFrequency,
      peakPower: peak.peakPower,
      meanPower: allPower.length > 0 ? mean(allPower) : null,
    }
  }, [psdData, psdStats])

  const spectrogramRepresentativeStats = useMemo(() => {
    if (!spectrogramData) {
      return {
        maxPower: null,
        meanPower: null,
        maxFrequency: null,
      }
    }

    const values = spectrogramData.channels.flatMap((channel) =>
      (spectrogramData.power[channel] ?? []).flatMap((row) => finiteValues(row))
    )
    const maxPower = values.reduce(
      (currentMax, value) => (value > currentMax ? value : currentMax),
      values[0] ?? 0
    )

    return {
      maxPower: values.length > 0 ? maxPower : null,
      meanPower: values.length > 0 ? mean(values) : null,
      maxFrequency:
        spectrogramData.frequency.length > 0
          ? spectrogramData.frequency[spectrogramData.frequency.length - 1]
      : null,
    }
  }, [spectrogramData])

  const spectrogramStats = useMemo<SpectrogramStats[]>(() => {
    if (!spectrogramData) return []

    return spectrogramData.channels
      .map((channel) => {
        const matrix = spectrogramData.power[channel] ?? []
        const values = matrix.flatMap((row) => finiteValues(row))
        if (values.length === 0) return null

        let peakPower = values[0]
        let peakFrequencyIndex = 0
        let peakTimeIndex = 0
        let minPower = values[0]

        matrix.forEach((row, frequencyIndex) => {
          row.forEach((value, timeIndex) => {
            if (!Number.isFinite(value)) return
            if (value > peakPower) {
              peakPower = value
              peakFrequencyIndex = frequencyIndex
              peakTimeIndex = timeIndex
            }
            if (value < minPower) {
              minPower = value
            }
          })
        })

        return {
          channel,
          frequencyBins: matrix.length,
          timeBins: matrix[0]?.length ?? 0,
          peakFrequency: spectrogramData.frequency[peakFrequencyIndex] ?? 0,
          peakTime: spectrogramData.time[peakTimeIndex] ?? 0,
          peakPower,
          meanPower: mean(values),
          stdPower: std(values),
          medianPower: median(values),
          minPower,
          maxPower: peakPower,
        }
      })
      .filter((row): row is SpectrogramStats => row != null)
  }, [spectrogramData])

  const spectrogramPeak = useMemo(() => {
    if (spectrogramStats.length === 0) return null
    return spectrogramStats.reduce((best, row) =>
      row.peakPower > best.peakPower ? row : best
    )
  }, [spectrogramStats])

  const topographyFrameIndex = useMemo(() => {
    const frameCount = topographyData?.time.length ?? 0
    if (frameCount === 0) return 0
    return Math.max(0, Math.min(selectedTopographyFrame, frameCount - 1))
  }, [selectedTopographyFrame, topographyData])

  const topographyRows = useMemo<TopographyFrameRow[]>(() => {
    if (!topographyData) return []

    return topographyData.channels
      .map((channel) => {
        const position = topographyData.positions[channel]
        const value = topographyData.power[channel]?.[topographyFrameIndex]
        if (!position || position.length < 2 || !Number.isFinite(value)) return null
        const rotated = rotateTopographyPositionClockwise(position[0], position[1])
        return {
          channel,
          value: Number(value),
          x: rotated.x,
          y: rotated.y,
        }
      })
      .filter((row): row is TopographyFrameRow => row != null)
  }, [topographyData, topographyFrameIndex])

  const topographyStats = useMemo(() => {
    const values = topographyRows.map((row) => row.value).filter(Number.isFinite)
    const strongest = topographyRows.reduce<TopographyFrameRow | null>(
      (best, row) => (!best || row.value > best.value ? row : best),
      null
    )

    return {
      frameTime: topographyData?.time[topographyFrameIndex] ?? null,
      meanPower: values.length > 0 ? mean(values) : null,
      minPower: values.length > 0 ? Math.min(...values) : null,
      maxPower: values.length > 0 ? Math.max(...values) : null,
      strongest,
    }
  }, [topographyData, topographyFrameIndex, topographyRows])

  const availableChannels =
    timeseriesData?.available_channels ??
    psdData?.available_channels ??
    spectrogramData?.available_channels ??
    EEG_CHANNELS
  const visibleChannels = timeseriesData?.channels ?? EMPTY_CHANNELS
  const visiblePsdChannels = psdData?.channels ?? EMPTY_CHANNELS
  const visibleSpectrogramChannels = spectrogramData?.channels ?? EMPTY_CHANNELS
  const availableTopographyChannels = topographyData?.available_channels ?? TOPOGRAPHY_CHANNELS
  const eegChartLegend = visibleChannels.flatMap((channel) => {
    const color = CHANNEL_COLORS[channel] ?? "#4B5563"
    const channelLabel = formatChannel(channel)
    return [
      ...(signalMode === "smooth" || signalMode === "both"
        ? [{ label: `${channelLabel} suavizada`, color }]
        : []),
      ...(signalMode === "raw" || signalMode === "both"
        ? [{ label: `${channelLabel} cruda`, color }]
        : []),
    ]
  })
  const psdChartLegend = visiblePsdChannels.map((channel) => ({
    label: formatChannel(channel),
    color: CHANNEL_COLORS[channel] ?? "#4B5563",
  }))

  const selectedEegValue = useMemo(() => {
    if (!selectedPoint || visibleChannels.length === 0) return null
    const values = visibleChannels
      .map((channel) => selectedPoint[`${channel}_smooth`])
      .filter((value): value is number => Number.isFinite(value))
    return values.length > 0 ? mean(values) : null
  }, [selectedPoint, visibleChannels])

  const timeExtremePoints = useMemo(() => {
    let minPoint: { time: number; value: number } | null = null
    let maxPoint: { time: number; value: number } | null = null

    for (const point of chartData) {
      for (const channel of visibleChannels) {
        const value = point[`${channel}_smooth`]
        if (!Number.isFinite(value)) continue
        if (!minPoint || value < minPoint.value) {
          minPoint = { time: point.time, value }
        }
        if (!maxPoint || value > maxPoint.value) {
          maxPoint = { time: point.time, value }
        }
      }
    }

    return { minPoint, maxPoint }
  }, [chartData, visibleChannels])

  const spectrogramSelectedValue = useMemo(() => {
    if (selectedTime == null || !spectrogramData || visibleSpectrogramChannels.length === 0) {
      return null
    }

    let timeIndex = 0
    let minDiff = Math.abs((spectrogramData.time[0] ?? 0) - selectedTime)
    for (let index = 1; index < spectrogramData.time.length; index += 1) {
      const diff = Math.abs(spectrogramData.time[index] - selectedTime)
      if (diff < minDiff) {
        minDiff = diff
        timeIndex = index
      }
    }

    const values = visibleSpectrogramChannels
      .flatMap((channel) => (spectrogramData.power[channel] ?? []).map((row) => row[timeIndex]))
      .filter((value): value is number => Number.isFinite(value))

    return values.length > 0 ? Math.max(...values) : null
  }, [selectedTime, spectrogramData, visibleSpectrogramChannels])

  const handleChannelToggle = (channel: string) => {
    if (!availableChannels.includes(channel)) return
    setSelectedChannels((current) => {
      if (current.includes(channel)) {
        return current.length === 1 ? current : current.filter((item) => item !== channel)
      }
      return [...current, channel]
    })
  }

  const handleTopographyChannelToggle = (channel: string) => {
    if (!availableTopographyChannels.includes(channel)) return
    setSelectedChannels((current) => {
      const selectedTopographyChannels = current.filter((item) =>
        TOPOGRAPHY_CHANNELS.includes(item)
      )
      if (current.includes(channel)) {
        if (selectedTopographyChannels.length <= 3) return current
        return current.filter((item) => item !== channel)
      }
      return [...current, channel]
    })
  }

  const handleChartClick = (state: unknown) => {
    const time = readClickedTime(state)
    if (time == null) return
    setSelectedTime(time)
  }

  const handleApplyTimeseriesWindow = () => {
    const start = parseTimeWindowValue(timeseriesWindowDraft.start)
    const end = parseTimeWindowValue(timeseriesWindowDraft.end)

    if (Number.isNaN(start) || Number.isNaN(end)) {
      setTimeseriesWindowError("Usa valores numéricos válidos para la ventana temporal.")
      return
    }

    if ((start != null && start < 0) || (end != null && end < 0)) {
      setTimeseriesWindowError("Los segundos deben ser mayores o iguales a 0.")
      return
    }

    if (start != null && end != null && end <= start) {
      setTimeseriesWindowError("El segundo final debe ser mayor que el segundo inicial.")
      return
    }

    setTimeseriesWindow({
      start: start == null ? null : Number(start.toFixed(4)),
      end: end == null ? null : Number(end.toFixed(4)),
    })
    setTimeseriesWindowError(null)
    setSelectedTime(null)
  }

  const handleResetTimeseriesWindow = () => {
    setTimeseriesWindowDraft(EMPTY_TIME_WINDOW_DRAFT)
    setTimeseriesWindow(EMPTY_TIME_WINDOW)
    setTimeseriesWindowError(null)
    setSelectedTime(null)
  }

  const handleApplyPsdWindow = () => {
    const { window, error } = validateTimeWindowDraft(psdWindowDraft)
    if (error || !window) {
      setPsdWindowError(error)
      return
    }

    setPsdWindow(window)
    setPsdWindowError(null)
  }

  const handleResetPsdWindow = () => {
    setPsdWindowDraft(EMPTY_TIME_WINDOW_DRAFT)
    setPsdWindow(EMPTY_TIME_WINDOW)
    setPsdWindowError(null)
  }

  const handleTopographyFrameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedTopographyFrame(Number(event.target.value))
  }

  return (
    <div className="analytics-stack">
      <EegTimeseriesView
        availableChannels={availableChannels}
        channelStats={channelStats}
        chartData={chartData}
        chartDomain={chartDomain}
        eegChartLegend={eegChartLegend}
        handleApplyTimeseriesWindow={handleApplyTimeseriesWindow}
        handleChannelToggle={handleChannelToggle}
        handleChartClick={handleChartClick}
        handleResetTimeseriesWindow={handleResetTimeseriesWindow}
        participantCode={participantCode}
        projectId={projectId}
        scenario={scenario}
        selectedChannels={selectedChannels}
        selectedEegValue={selectedEegValue}
        selectedPoint={selectedPoint}
        selectedTime={selectedTime}
        setSelectedTime={setSelectedTime}
        setSignalMode={setSignalMode}
        setTimeseriesWindowDraft={setTimeseriesWindowDraft}
        setTimeseriesWindowError={setTimeseriesWindowError}
        signalMode={signalMode}
        timeExtremePoints={timeExtremePoints}
        timeRepresentativeStats={timeRepresentativeStats}
        timeseriesData={timeseriesData}
        timeseriesError={timeseriesError}
        timeseriesLoading={timeseriesLoading}
        timeseriesWindow={timeseriesWindow}
        timeseriesWindowDraft={timeseriesWindowDraft}
        timeseriesWindowError={timeseriesWindowError}
        view={view}
        visibleChannels={visibleChannels}
      />

      

      

      <EegPsdView
        availableChannels={availableChannels}
        handleApplyPsdWindow={handleApplyPsdWindow}
        handleChannelToggle={handleChannelToggle}
        handleResetPsdWindow={handleResetPsdWindow}
        psdChartData={psdChartData}
        psdChartLegend={psdChartLegend}
        psdData={psdData}
        psdDomain={psdDomain}
        psdError={psdError}
        psdLoading={psdLoading}
        psdRepresentativeStats={psdRepresentativeStats}
        psdStats={psdStats}
        psdWindow={psdWindow}
        psdWindowDraft={psdWindowDraft}
        psdWindowError={psdWindowError}
        selectedChannels={selectedChannels}
        setPsdWindowDraft={setPsdWindowDraft}
        setPsdWindowError={setPsdWindowError}
        view={view}
        visiblePsdChannels={visiblePsdChannels}
      />

      

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

      {view === "topography" ? (
        <Card>
          <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Brain className="h-5 w-5" />
                Topografía EEG
              </CardTitle>
              <CardDescription>
                Distribución espacial de potencia broadband por ventanas temporales.
              </CardDescription>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Unidad</span>
                <span className="font-semibold text-foreground">{topographyData?.unit ?? "uV^2"}</span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Ventanas</span>
                <span className="font-semibold text-foreground">{(topographyData?.time.length ?? 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Ventana</span>
                <span className="font-semibold text-foreground">{(topographyData?.window_s ?? 0.33).toFixed(2)}s</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              <KpiCard
                label="Tiempo"
                value={topographyStats.frameTime}
                unit="s"
                decimals={2}
                description="Centro de la ventana seleccionada"
                Icon={Clock}
                loading={topographyLoading}
                iconBgClass="bg-blue-100 dark:bg-blue-900/40"
                iconColorClass="text-blue-600 dark:text-blue-400"
                labelColorClass="text-blue-700 dark:text-blue-400"
              />
              <KpiCard
                label="Mayor potencia"
                value={topographyStats.strongest?.value ?? null}
                unit={topographyData?.unit ?? "uV^2"}
                decimals={4}
                description={topographyStats.strongest ? formatChannel(topographyStats.strongest.channel) : "Electrodo dominante"}
                Icon={TrendingUp}
                loading={topographyLoading}
                iconBgClass="bg-rose-100 dark:bg-rose-900/40"
                iconColorClass="text-rose-600 dark:text-rose-400"
                labelColorClass="text-rose-700 dark:text-rose-400"
              />
              <KpiCard
                label="Potencia media"
                value={topographyStats.meanPower}
                unit={topographyData?.unit ?? "uV^2"}
                decimals={4}
                description="Promedio entre electrodos visibles"
                Icon={Activity}
                loading={topographyLoading}
                iconBgClass="bg-emerald-100 dark:bg-emerald-900/40"
                iconColorClass="text-emerald-600 dark:text-emerald-400"
                labelColorClass="text-emerald-700 dark:text-emerald-400"
              />
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {TOPOGRAPHY_CHANNELS.map((channel) => {
                const isActive = selectedChannels.includes(channel)
                const isAvailable = availableTopographyChannels.includes(channel)
                return (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => handleTopographyChannelToggle(channel)}
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

            {topographyLoading ? (
              <div className="h-[560px] w-full animate-pulse rounded-lg bg-muted" />
            ) : topographyError ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
                No se pudo cargar la topografía EEG.
              </div>
            ) : !topographyData || topographyData.time.length === 0 || topographyRows.length < 3 ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
                No hay datos suficientes para calcular la topografía EEG.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-5">
                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center">
                    <span className="w-24 text-xs text-muted-foreground">
                      {topographyData.color_domain.min.toFixed(2)}
                    </span>
                    <div
                      className="h-3 min-w-40 flex-1 rounded-full"
                      style={{ background: VIRIDIS_GRADIENT }}
                    />
                    <span className="w-28 text-right text-xs text-muted-foreground">
                      {topographyData.color_domain.max.toFixed(2)} {topographyData.unit}
                    </span>
                  </div>

                  <TopographyScene
                    rows={topographyRows}
                    colorDomain={topographyData.color_domain}
                    unit={topographyData.unit}
                    projectId={projectId}
                    participantCode={participantCode}
                    selectedTime={topographyStats.frameTime}
                  />

                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-foreground">
                        Ventana {topographyFrameIndex + 1} / {topographyData.time.length}
                      </span>
                      <span className="text-muted-foreground">
                        t≈{topographyStats.frameTime?.toFixed(2) ?? "0.00"}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, topographyData.time.length - 1)}
                      value={topographyFrameIndex}
                      onChange={handleTopographyFrameChange}
                      className="w-full accent-foreground"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-sm font-semibold text-foreground">Potencia por electrodo</p>
                    <p className="text-xs text-muted-foreground">
                      Valores de la ventana temporal seleccionada.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 divide-y divide-border/60 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-3">
                    {topographyRows.map((row) => (
                      <div key={row.channel} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: CHANNEL_COLORS[row.channel] ?? "#4B5563" }}
                          />
                          <span className="font-semibold text-foreground">{formatChannel(row.channel)}</span>
                        </div>
                        <span className="font-medium text-foreground">
                          {row.value.toFixed(4)} {topographyData.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3 border-t border-border p-4 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">Mínima</p>
                      <p className="mt-1 font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatNumber(topographyStats.minPower, 4, ` ${topographyData.unit}`)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">Máxima</p>
                      <p className="mt-1 font-semibold text-rose-600 dark:text-rose-400">
                        {formatNumber(topographyStats.maxPower, 4, ` ${topographyData.unit}`)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      

    </div>
  )
}
