"use client"

import { EegTimeseriesView } from "./eeg/EegTimeseriesView"
import { EegPsdView } from "./eeg/EegPsdView"
import { EegSpectrogramView } from "./eeg/EegSpectrogramView"
import { EegTopographyView } from "./eeg/EegTopographyView"

import { useMemo, useState, type ChangeEvent } from "react"
import { useEegPsd, useEegSpectrogram, useEegTimeseries, useEegTopography } from "../hooks/useAnalyticsData"
import { EMPTY_TIME_WINDOW, EMPTY_TIME_WINDOW_DRAFT, parseTimeWindowValue, validateTimeWindowDraft, type TimeWindow, type TimeWindowDraft } from "./TimeWindowControls"
import { EEG_CHANNELS, TOPOGRAPHY_CHANNELS, CHANNEL_COLORS, type SignalMode, type EegTabProps, type EegChartPoint, type EegPsdChartPoint, type PsdStats, type SpectrogramStats } from "./eeg/eegViewShared"
import { buildStats, finiteValues, formatChannel, mean, median, readClickedTime, rotateTopographyPositionClockwise, std, type ChannelStats, type TopographyFrameRow } from "../eegPresentation"
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

      

      <EegSpectrogramView
        availableChannels={availableChannels}
        handleChannelToggle={handleChannelToggle}
        participantCode={participantCode}
        projectId={projectId}
        scenario={scenario}
        selectedChannels={selectedChannels}
        selectedTime={selectedTime}
        setSelectedTime={setSelectedTime}
        spectrogramData={spectrogramData}
        spectrogramError={spectrogramError}
        spectrogramLoading={spectrogramLoading}
        spectrogramPeak={spectrogramPeak}
        spectrogramRepresentativeStats={spectrogramRepresentativeStats}
        spectrogramSelectedValue={spectrogramSelectedValue}
        spectrogramStats={spectrogramStats}
        view={view}
        visibleSpectrogramChannels={visibleSpectrogramChannels}
      />

      

      

      <EegTopographyView
        availableTopographyChannels={availableTopographyChannels}
        handleTopographyChannelToggle={handleTopographyChannelToggle}
        handleTopographyFrameChange={handleTopographyFrameChange}
        participantCode={participantCode}
        projectId={projectId}
        selectedChannels={selectedChannels}
        topographyData={topographyData}
        topographyError={topographyError}
        topographyFrameIndex={topographyFrameIndex}
        topographyLoading={topographyLoading}
        topographyRows={topographyRows}
        topographyStats={topographyStats}
        view={view}
      />

      

    </div>
  )
}
