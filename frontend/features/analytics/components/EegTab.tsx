"use client"

import { EegTimeseriesView } from "./eeg/EegTimeseriesView"
import { EegPsdView } from "./eeg/EegPsdView"
import { EegSpectrogramView } from "./eeg/EegSpectrogramView"
import { EegTopographyView } from "./eeg/EegTopographyView"

import { useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"
import type { AnalyticsChartNote } from "./AnalyticsChartShell"
import { useEegPsd, useEegSpectrogram, useEegTimeseries, useEegTopography } from "../hooks/useAnalyticsData"
import { useTimeWindow, useZoomHistory } from "../hooks/useZoomHistory"
import { normalizeZoomRange, sameZoomRange, zoomSpan, sliceEegPsd, sliceEegSpectrogram, type ZoomRange } from "../chartZoom"
import { EEG_CHANNELS, EEG_QUALITY_NOTES_ID, EEG_TIMESERIES_CHART_ID, TOPOGRAPHY_CHANNELS, CHANNEL_COLORS, scrollToSection, type SignalMode, type ChartLayout, type EegTabProps, type EegChartPoint, type EegPsdChartPoint, type PsdStats, type SpectrogramStats } from "./eeg/eegViewShared"
import { buildStats, finiteValues, fullResolutionStats, montageLanes, nearestTimeIndex, formatChannel, mean, median, readClickedTime, robustDomain, rotateTopographyPositionClockwise, std, visibleArtifactSpans, type ChannelStats, type TopographyFrameRow } from "../eegPresentation"
import { EegArtifactSpanList, EegChannelQualityTable, EegQualityNotes, eegQualityLines } from "./eeg/EegQualityPanel"
const EMPTY_CHANNELS: string[] = []

export function EegTab({ projectId, participantCode, scenario, view }: EegTabProps) {
  const [selectedChannels, setSelectedChannels] = useState<string[]>(EEG_CHANNELS)
  const [signalMode, setSignalMode] = useState<SignalMode>("raw")
  const [chartLayout, setChartLayout] = useState<ChartLayout>("overlay")
  const [focusChannel, setFocusChannel] = useState<string | null>(null)
  const [excludeArtifactWindows, setExcludeArtifactWindows] = useState(false)
  const [perChannelSpectrogramColor, setPerChannelSpectrogramColor] = useState(false)
  const [selectedTime, setSelectedTime] = useState<number | null>(null)
  const [selectedTopographyFrame, setSelectedTopographyFrame] = useState(0)
  const timeseriesWindowState = useTimeWindow(() => setSelectedTime(null))
  const timeseriesWindow = timeseriesWindowState.window
  const psdWindowState = useTimeWindow()
  const psdWindow = psdWindowState.window
  const spectrogramWindowState = useTimeWindow(() => setSelectedTime(null))
  const spectrogramWindow = spectrogramWindowState.window
  const topographyWindowState = useTimeWindow(() => setSelectedTopographyFrame(0))
  const topographyWindow = topographyWindowState.window
  const psdFrequencyZoom = useZoomHistory<ZoomRange>(sameZoomRange)
  const spectrogramTimeZoom = useZoomHistory<ZoomRange>(sameZoomRange)

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
    timeseriesWindow.end,
    // Evenly spaced selection hid one-sample peaks outright; the envelope keeps
    // both extremes of every bucket inside the same point budget.
    "minmax_envelope"
  )
  const {
    data: fullPsdData,
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
    psdWindow.end,
    excludeArtifactWindows
  )
  const {
    data: fullSpectrogramData,
    loading: spectrogramLoading,
    error: spectrogramError,
  } = useEegSpectrogram(
    projectId,
    view === "spectrogram" ? participantCode : null,
    scenario,
    selectedChannels,
    25,
    true,
    "none",
    600,
    256,
    spectrogramWindow.start,
    spectrogramWindow.end,
    perChannelSpectrogramColor
  )
  const {
    data: topographyData,
    loading: topographyLoading,
    error: topographyError,
  } = useEegTopography(
    projectId,
    view === "topography" ? participantCode : null,
    scenario,
    selectedChannels,
    2.0,
    0.5,
    true,
    600,
    topographyWindow.start,
    topographyWindow.end
  )

  // Drag zoom narrows what PSD and spectrogram show; every derived statistic follows it.
  const psdData = useMemo(
    () => sliceEegPsd(fullPsdData, psdFrequencyZoom.range),
    [fullPsdData, psdFrequencyZoom.range]
  )
  const spectrogramData = useMemo(
    () => sliceEegSpectrogram(fullSpectrogramData, spectrogramTimeZoom.range),
    [fullSpectrogramData, spectrogramTimeZoom.range]
  )

  const chartData = useMemo<EegChartPoint[]>(() => {
    if (!timeseriesData) return []

    return timeseriesData.time.map((time, index) => {
      const point: EegChartPoint = { time }
      for (const channel of timeseriesData.channels) {
        point[`${channel}_raw`] = timeseriesData.raw[channel]?.[index] ?? Number.NaN
        point[`${channel}_smooth`] = timeseriesData.smooth[channel]?.[index] ?? Number.NaN
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
        point[channel] = psdData.power[channel]?.[index] ?? Number.NaN
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

  const channelStats = useMemo<ChannelStats[]>(
    () => fullResolutionStats(timeseriesData, signalMode),
    [timeseriesData, signalMode]
  )
  const statisticsMode = signalMode === "smooth" ? "smooth" : "raw"

  // Channel medians in SAIO block 5 run from -1,256 uV (C4) to +988 uV (LE), so
  // a mean over channels describes no electrode, and it moved whenever a chip
  // was toggled. These three numbers now name whose they are.
  const activeFocusChannel = useMemo(() => {
    const available = channelStats.map((row) => row.channel)
    if (available.length === 0) return null
    return focusChannel && available.includes(focusChannel) ? focusChannel : available[0]
  }, [channelStats, focusChannel])

  const timeRepresentativeStats = useMemo(() => {
    const row = channelStats.find((item) => item.channel === activeFocusChannel)
    return {
      meanValue: row?.mean ?? null,
      minValue: row?.min ?? null,
      maxValue: row?.max ?? null,
    }
  }, [channelStats, activeFocusChannel])

  const psdStats = useMemo<PsdStats[]>(() => {
    if (!psdData) return []
    return psdData.channels
      .map((channel) => {
        const values = finiteValues(psdData.power[channel] ?? [])
        const stats = buildStats(channel, values)
        if (!stats || values.length === 0) return null

        const original = psdData.power[channel] ?? []
        let peakIndex = -1
        original.forEach((value, index) => {
          if (typeof value === "number" && Number.isFinite(value) &&
              (peakIndex < 0 || value > (original[peakIndex] ?? -Infinity))) peakIndex = index
        })

        return {
          ...stats,
          peakFrequency: psdData.frequency[peakIndex] ?? 0,
          peakPower: original[peakIndex] as number,
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
            if (typeof value !== "number" || !Number.isFinite(value)) return
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

  const timeseriesChannels = timeseriesData?.channels ?? EMPTY_CHANNELS

  const artifactSpans = useMemo(
    () => visibleArtifactSpans(timeseriesData?.metadata, timeseriesChannels),
    [timeseriesData, timeseriesChannels]
  )

  /** Per-channel robust span: sets both the shared y range and the lane pitch. */
  const channelDomains = useMemo(() => {
    const domains: Record<string, { min: number; max: number }> = {}
    const source = statisticsMode === "smooth" ? timeseriesData?.smooth : timeseriesData?.raw
    for (const channel of timeseriesChannels) {
      const domain = robustDomain(finiteValues(source?.[channel] ?? []))
      if (domain) domains[channel] = { min: domain.min, max: domain.max }
    }
    return domains
  }, [timeseriesData, timeseriesChannels, statisticsMode])

  const yDomain = useMemo(() => {
    const source = statisticsMode === "smooth" ? timeseriesData?.smooth : timeseriesData?.raw
    return robustDomain(
      timeseriesChannels.flatMap((channel) => finiteValues(source?.[channel] ?? []))
    )
  }, [timeseriesData, timeseriesChannels, statisticsMode])

  const montage = useMemo(
    () =>
      montageLanes(
        timeseriesChannels,
        Object.fromEntries(
          Object.entries(channelDomains).map(([channel, domain]) => [
            channel,
            domain.max - domain.min,
          ])
        )
      ),
    [timeseriesChannels, channelDomains]
  )

  /** The montage keeps the recorded value in the row and plots a shifted copy,
   *  so the tooltip and every statistic still read microvolts. */
  const laneChartData = useMemo<EegChartPoint[]>(() => {
    if (chartLayout !== "stacked") return chartData
    const centre: Record<string, number> = {}
    for (const lane of montage.lanes) {
      const domain = channelDomains[lane.channel]
      centre[lane.channel] = domain ? (domain.min + domain.max) / 2 : 0
    }
    return chartData.map((point) => {
      const next: EegChartPoint = { ...point }
      for (const lane of montage.lanes) {
        for (const mode of ["raw", "smooth"] as const) {
          const value = point[`${lane.channel}_${mode}`]
          next[`${lane.channel}_${mode}_lane`] = Number.isFinite(value)
            ? value - (centre[lane.channel] ?? 0) + lane.offset
            : Number.NaN
        }
      }
      return next
    })
  }, [chartData, chartLayout, montage, channelDomains])

  const availableChannels =
    timeseriesData?.available_channels ??
    psdData?.available_channels ??
    spectrogramData?.available_channels ??
    EEG_CHANNELS
  const visibleChannels = timeseriesData?.channels ?? EMPTY_CHANNELS
  const visiblePsdChannels = psdData?.channels ?? EMPTY_CHANNELS
  const visibleSpectrogramChannels = spectrogramData?.channels ?? EMPTY_CHANNELS
  const availableTopographyChannels = topographyData?.available_channels ?? TOPOGRAPHY_CHANNELS
  // One entry per channel: the mode selector already says Cruda or Suavizada,
  // and in "Ambas" two style keys explain the thick and the faded stroke.
  const eegChartLegend = [
    ...visibleChannels.map((channel) => ({
      label: formatChannel(channel),
      color: CHANNEL_COLORS[channel] ?? "#4B5563",
    })),
    ...(signalMode === "both"
      ? [
          { label: "suavizada", color: "#6B7280", thick: true },
          { label: "cruda", color: "#6B7280", opacity: 0.36 },
        ]
      : []),
  ]
  const psdChartLegend = visiblePsdChannels.map((channel) => ({
    label: formatChannel(channel),
    color: CHANNEL_COLORS[channel] ?? "#4B5563",
  }))

  const selectedEegValue = useMemo(() => {
    if (!selectedPoint || visibleChannels.length === 0) return null
    const values = visibleChannels
      .map((channel) => selectedPoint[`${channel}_${statisticsMode}`])
      .filter((value): value is number => Number.isFinite(value))
    return values.length > 0 ? mean(values) : null
  }, [selectedPoint, visibleChannels, statisticsMode])

  const timeExtremePoints = useMemo(() => {
    let minPoint: { time: number; value: number } | null = null
    let maxPoint: { time: number; value: number } | null = null

    for (const point of chartData) {
      if (!activeFocusChannel) break
      const value = point[`${activeFocusChannel}_${statisticsMode}`]
      if (!Number.isFinite(value)) continue
      if (!minPoint || value < minPoint.value) {
        minPoint = { time: point.time, value }
      }
      if (!maxPoint || value > maxPoint.value) {
        maxPoint = { time: point.time, value }
      }
    }

    return { minPoint, maxPoint }
  }, [chartData, activeFocusChannel, statisticsMode])

  const spectrogramSelectedValue = useMemo(() => {
    if (selectedTime == null || !spectrogramData || visibleSpectrogramChannels.length === 0) {
      return null
    }

    const timeIndex = nearestTimeIndex(spectrogramData.time, selectedTime, Number(spectrogramData.metadata?.display_hop_s ?? spectrogramData.metadata?.hop_s))
    if (timeIndex < 0) return null

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

  const handleZoomPsdFrequency = (start: number, end: number) => {
    const range = normalizeZoomRange(start, end, { decimals: 2 })
    if (range && fullPsdData && zoomSpan(fullPsdData.frequency, range)) psdFrequencyZoom.zoomTo(range)
  }

  const handleZoomSpectrogramTime = (start: number, end: number) => {
    const range = normalizeZoomRange(start, end)
    if (range && fullSpectrogramData && zoomSpan(fullSpectrogramData.time, range)) spectrogramTimeZoom.zoomTo(range)
  }

  // A zoom the current data cannot show (for example after a reload) offers no zoom actions.
  const psdZoomed = psdData !== fullPsdData
  const spectrogramZoomed = spectrogramData !== fullSpectrogramData

  const handleTopographyFrameChange = (value: number) => {
    setSelectedTopographyFrame(value)
  }

  const currentData = view === "timeseries" ? timeseriesData : view === "psd" ? psdData : view === "spectrogram" ? spectrogramData : topographyData
  // Warnings and unit caveats close the tab; each chart carries one chip that
  // counts them, previews the first few on hover and jumps to the full card.
  const qualityLines = eegQualityLines(currentData?.metadata)
  const qualityNote: AnalyticsChartNote | null =
    qualityLines.length > 0
      ? {
          id: "quality-notes",
          tone: "warning",
          Icon: AlertTriangle,
          label: `${qualityLines.length} ${qualityLines.length === 1 ? "aviso" : "avisos"} de calidad`,
          detail: (
            <>
              <ul className="list-disc space-y-0.5 pl-4">
                {qualityLines.slice(0, 3).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="text-muted-foreground">
                {qualityLines.length > 3 ? `Y ${qualityLines.length - 3} más. ` : ""}Clic para verlos al final de la página.
              </p>
            </>
          ),
          onClick: () => scrollToSection(EEG_QUALITY_NOTES_ID),
        }
      : null
  // A span chip marks the instant and brings the chart back into view.
  const showArtifactOnChart = (time: number) => {
    setSelectedTime(time)
    scrollToSection(EEG_TIMESERIES_CHART_ID)
  }
  return (
    <div className="analytics-stack">
      <EegTimeseriesView
        availableChannels={availableChannels}
        artifactSpans={artifactSpans}
        chartLayout={chartLayout}
        setChartLayout={setChartLayout}
        focusChannel={activeFocusChannel}
        setFocusChannel={setFocusChannel}
        montage={montage}
        yDomain={yDomain}
        channelStats={channelStats}
        chartData={chartLayout === "stacked" ? laneChartData : chartData}
        chartDomain={chartDomain}
        eegChartLegend={eegChartLegend}
        handleApplyTimeseriesWindow={timeseriesWindowState.apply}
        handleBackTimeseriesWindow={timeseriesWindowState.canGoBack ? timeseriesWindowState.back : undefined}
        handleChannelToggle={handleChannelToggle}
        handleChartClick={handleChartClick}
        handleResetTimeseriesWindow={timeseriesWindowState.reset}
        handleZoomTimeseriesWindow={timeseriesWindowState.zoomTo}
        participantCode={participantCode}
        projectId={projectId}
        scenario={scenario}
        selectedChannels={selectedChannels}
        selectedEegValue={selectedEegValue}
        selectedPoint={selectedPoint}
        selectedTime={selectedTime}
        setSelectedTime={setSelectedTime}
        setSignalMode={setSignalMode}
        setTimeseriesWindowDraft={timeseriesWindowState.setDraft}
        setTimeseriesWindowError={timeseriesWindowState.setError}
        signalMode={signalMode}
        timeExtremePoints={timeExtremePoints}
        timeRepresentativeStats={timeRepresentativeStats}
        timeseriesData={timeseriesData}
        timeseriesError={timeseriesError}
        timeseriesLoading={timeseriesLoading}
        timeseriesWindow={timeseriesWindow}
        timeseriesWindowDraft={timeseriesWindowState.draft}
        timeseriesWindowError={timeseriesWindowState.error}
        view={view}
        visibleChannels={visibleChannels}
        qualityNote={qualityNote}
      />

      {view === "timeseries" ? (
        <EegArtifactSpanList
          metadata={timeseriesData?.metadata}
          channels={timeseriesChannels}
          selectedTime={selectedTime}
          onSelectTime={showArtifactOnChart}
        />
      ) : null}

      {view === "timeseries" ? (
        <EegChannelQualityTable metadata={timeseriesData?.metadata} channels={timeseriesChannels} />
      ) : null}


      <EegPsdView
        availableChannels={availableChannels}
        handleApplyPsdWindow={psdWindowState.apply}
        handleChannelToggle={handleChannelToggle}
        handleResetPsdWindow={psdWindowState.reset}
        handleZoomPsdFrequency={handleZoomPsdFrequency}
        handleResetPsdFrequencyZoom={psdZoomed ? psdFrequencyZoom.reset : undefined}
        handleBackPsdFrequencyZoom={psdZoomed && psdFrequencyZoom.canGoBack ? psdFrequencyZoom.back : undefined}
        psdChartData={psdChartData}
        psdChartLegend={psdChartLegend}
        psdData={psdData}
        psdDomain={psdDomain}
        psdError={psdError}
        psdLoading={psdLoading}
        psdRepresentativeStats={psdRepresentativeStats}
        psdStats={psdStats}
        psdWindow={psdWindow}
        psdWindowDraft={psdWindowState.draft}
        psdWindowError={psdWindowState.error}
        excludeArtifactWindows={excludeArtifactWindows}
        setExcludeArtifactWindows={setExcludeArtifactWindows}
        selectedChannels={selectedChannels}
        setPsdWindowDraft={psdWindowState.setDraft}
        setPsdWindowError={psdWindowState.setError}
        view={view}
        visiblePsdChannels={visiblePsdChannels}
        qualityNote={qualityNote}
      />



      <EegSpectrogramView
        availableChannels={availableChannels}
        handleChannelToggle={handleChannelToggle}
        handleZoomSpectrogramTime={handleZoomSpectrogramTime}
        handleResetSpectrogramZoom={spectrogramZoomed ? spectrogramTimeZoom.reset : undefined}
        handleBackSpectrogramZoom={spectrogramZoomed && spectrogramTimeZoom.canGoBack ? spectrogramTimeZoom.back : undefined}
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
        spectrogramWindow={spectrogramWindow}
        spectrogramWindowDraft={spectrogramWindowState.draft}
        spectrogramWindowError={spectrogramWindowState.error}
        setSpectrogramWindowDraft={spectrogramWindowState.setDraft}
        setSpectrogramWindowError={spectrogramWindowState.setError}
        handleApplySpectrogramWindow={spectrogramWindowState.apply}
        handleResetSpectrogramWindow={spectrogramWindowState.reset}
        perChannelColorDomain={perChannelSpectrogramColor}
        setPerChannelColorDomain={setPerChannelSpectrogramColor}
        view={view}
        visibleSpectrogramChannels={visibleSpectrogramChannels}
        qualityNote={qualityNote}
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
        topographyWindow={topographyWindow}
        topographyWindowDraft={topographyWindowState.draft}
        topographyWindowError={topographyWindowState.error}
        setTopographyWindowDraft={topographyWindowState.setDraft}
        setTopographyWindowError={topographyWindowState.setError}
        handleApplyTopographyWindow={topographyWindowState.apply}
        handleResetTopographyWindow={topographyWindowState.reset}
        view={view}
        qualityNote={qualityNote}
      />

      <EegQualityNotes metadata={currentData?.metadata} />
    </div>
  )
}
