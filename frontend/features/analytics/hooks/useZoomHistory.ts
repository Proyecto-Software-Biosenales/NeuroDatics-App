"use client"

import { useState } from "react"
import { EMPTY_ZOOM_HISTORY, popZoom, pushZoom, sameZoomRange, type ZoomHistory } from "../chartZoom"
import {
  EMPTY_TIME_WINDOW,
  EMPTY_TIME_WINDOW_DRAFT,
  hasTimeWindow,
  timeWindowDraftOf,
  timeWindowFromDrag,
  validateTimeWindowDraft,
  type TimeWindow,
  type TimeWindowDraft,
} from "../components/TimeWindowControls"

/** Zoom that only changes what a chart shows, with one step back per nested zoom. */
export function useZoomHistory<T>(same?: (a: T, b: T) => boolean) {
  const [history, setHistory] = useState<ZoomHistory<T>>(EMPTY_ZOOM_HISTORY)
  return {
    range: history.current,
    canGoBack: history.previous.length > 0,
    zoomTo: (next: T) => setHistory((current) => pushZoom(current, next, same)),
    back: () => setHistory((current) => popZoom(current)),
    reset: () => setHistory(EMPTY_ZOOM_HISTORY),
  }
}

/**
 * Time window typed in the controls or dragged on a chart. The server reloads
 * each window; every new one remembers the window it replaced, so a nested
 * zoom steps back one level before returning to the full recording.
 */
export function useTimeWindow(onChange?: () => void) {
  const [draft, setDraft] = useState<TimeWindowDraft>(EMPTY_TIME_WINDOW_DRAFT)
  const [history, setHistory] = useState<ZoomHistory<TimeWindow>>(EMPTY_ZOOM_HISTORY)
  const [error, setError] = useState<string | null>(null)

  const show = (next: ZoomHistory<TimeWindow>, nextDraft?: TimeWindowDraft) => {
    setHistory(next)
    if (nextDraft) setDraft(nextDraft)
    setError(null)
    onChange?.()
  }

  return {
    draft,
    setDraft,
    error,
    setError,
    window: history.current ?? EMPTY_TIME_WINDOW,
    isZoomed: history.current != null,
    canGoBack: history.previous.length > 0,
    apply: () => {
      const { window, error: draftError } = validateTimeWindowDraft(draft)
      if (draftError || !window) {
        setError(draftError)
        return
      }
      show(hasTimeWindow(window) ? pushZoom(history, window, sameZoomRange) : EMPTY_ZOOM_HISTORY)
    },
    zoomTo: (start: number, end: number) => {
      const window = timeWindowFromDrag(start, end)
      if (window) show(pushZoom(history, window, sameZoomRange), timeWindowDraftOf(window))
    },
    back: () => {
      const next = popZoom(history)
      show(next, timeWindowDraftOf(next.current))
    },
    reset: () => show(EMPTY_ZOOM_HISTORY, EMPTY_TIME_WINDOW_DRAFT),
  }
}
