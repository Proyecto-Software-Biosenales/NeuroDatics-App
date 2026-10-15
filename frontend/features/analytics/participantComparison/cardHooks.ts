"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import { apiFetchBlob } from "@/lib/api/apiFetch"
import { getStimulusImageUrl } from "@/features/projects/api/stimulusUrls"
import { estimateWeight, type EntryState, type Fetcher } from "./comparisonLoader"
import { analyticsKeyCacheable, comparisonCardLoader, isAnalyticsKeyCurrent, requestAnalytics, waitForAnalyticsContext } from "../analyticsCache"
import { useAnalyticsRevision } from "../hooks/useAnalyticsContext"

/**
 * One queue for every comparison dialog: four requests at a time, and a result
 * cache bounded in entries, weight and time that survives a close/reopen.
 */
export const participantComparisonLoader = comparisonCardLoader

export interface CardVisibility {
  /** Within the mount margin: the card renders its chart and asks for data. */
  near: boolean
  /** On screen: its request goes before the margin's. */
  visible: boolean
}

type VisibilityListener = (state: CardVisibility) => void

/** Two shared IntersectionObservers for all cards of one scroll container. */
export class ViewportTracker {
  private near: IntersectionObserver | null = null
  private visible: IntersectionObserver | null = null
  private readonly listeners = new Map<Element, VisibilityListener>()
  private readonly states = new Map<Element, CardVisibility>()

  constructor(private readonly nearMargin: string) {}

  connect(root: Element | null) {
    this.disconnect()
    if (typeof IntersectionObserver === "undefined") {
      // Without observers every card counts as visible rather than never loading.
      for (const [element, listener] of this.listeners) this.update(element, { near: true, visible: true }, listener)
      return
    }
    const handle = (key: keyof CardVisibility) => (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        const listener = this.listeners.get(entry.target)
        if (!listener) continue
        const current = this.states.get(entry.target) ?? { near: false, visible: false }
        this.update(entry.target, { ...current, [key]: entry.isIntersecting }, listener)
      }
    }
    this.near = new IntersectionObserver(handle("near"), { root, rootMargin: this.nearMargin })
    this.visible = new IntersectionObserver(handle("visible"), { root, rootMargin: "0px" })
    for (const element of this.listeners.keys()) {
      this.near.observe(element)
      this.visible.observe(element)
    }
  }

  disconnect() {
    this.near?.disconnect()
    this.visible?.disconnect()
    this.near = null
    this.visible = null
  }

  observe(element: Element, listener: VisibilityListener) {
    this.listeners.set(element, listener)
    this.near?.observe(element)
    this.visible?.observe(element)
    return () => {
      this.listeners.delete(element)
      this.states.delete(element)
      this.near?.unobserve(element)
      this.visible?.unobserve(element)
    }
  }

  private update(element: Element, next: CardVisibility, listener: VisibilityListener) {
    const previous = this.states.get(element)
    if (previous && previous.near === next.near && previous.visible === next.visible) return
    this.states.set(element, next)
    listener(next)
  }
}

/**
 * The root is passed as an element, not a ref: the dialog portal mounts after
 * the first effects run, and a null root would clip the margin to the screen.
 */
export function useViewportTracker(root: Element | null, nearMargin = "480px 0px") {
  const [tracker] = useState(() => new ViewportTracker(nearMargin))
  useEffect(() => {
    if (!root) return
    tracker.connect(root)
    return () => tracker.disconnect()
  }, [root, tracker])
  return tracker
}

export function useCardVisibility(tracker: ViewportTracker, ref: RefObject<Element | null>): CardVisibility {
  const [state, setState] = useState<CardVisibility>({ near: false, visible: false })
  useEffect(() => {
    const element = ref.current
    if (!element) return
    return tracker.observe(element, setState)
  }, [ref, tracker])
  return state
}

const QUEUED: EntryState<never> = { status: "queued", data: null, error: null }

/**
 * Subscribe a mounted card to its queue entry. Unmounting releases it: a
 * queued request is dropped, a running one completes into the cache.
 */
export function useLoaderEntry<T>(key: string | null, fetcher: Fetcher<T>, priority: number, group: string, projectId?: string): EntryState<T> {
  const [state, setState] = useState<{ key: string; entry: EntryState<T> } | null>(null)
  const fetcherRef = useRef(fetcher)
  const priorityRef = useRef(priority)
  useEffect(() => {
    fetcherRef.current = fetcher
    priorityRef.current = priority
  })
  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    const subscription: { release?: (options?: { keepRunning?: boolean }) => void } = {}
    const subscribe = () => {
      if (controller.signal.aborted || (projectId && !isAnalyticsKeyCurrent(key))) return
      subscription.release = participantComparisonLoader.subscribe<T>(
        key,
        (signal) => fetcherRef.current(signal),
        (entry) => setState({ key, entry }),
        { priority: priorityRef.current, weigh: estimateWeight, group, cacheable: projectId ? analyticsKeyCacheable(key) : true }
      )
    }
    if (projectId) void waitForAnalyticsContext(projectId, controller.signal, key).then(subscribe, (error: unknown) => {
      if (!controller.signal.aborted) setState({ key, entry: { status: "error", data: null, error: error instanceof Error ? error.message : "Error loading analytics" } })
    })
    else subscribe()
    // Scrolling away keeps a running request (it finishes into the cache);
    // deselection and closing cancel it through abortGroup / cancelAll.
    return () => { controller.abort(); subscription.release?.({ keepRunning: true }) }
  }, [group, key, projectId])
  useEffect(() => {
    if (key) participantComparisonLoader.setPriority(key, priority)
  }, [key, priority])
  return state && state.key === key ? state.entry : QUEUED
}

/** An object URL for a Blob, revoked when the blob or the card goes away. */
export function useBlobUrl(blob: Blob | null) {
  const [entry, setEntry] = useState<{ blob: Blob; url: string } | null>(null)
  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) setEntry({ blob, url })
    })
    return () => {
      cancelled = true
      URL.revokeObjectURL(url)
    }
  }, [blob])
  return blob && entry?.blob === blob ? entry.url : null
}

export interface StimulusImageState {
  url: string | null
  loading: boolean
  error: string | null
}

/**
 * The scenario image. Every card asks for the same URL; the shared blob cache
 * turns that into one download, and each card keeps only its object URL.
 */
export function useStimulusImage(projectId: string, fileId: string | null): StimulusImageState {
  const revision = useAnalyticsRevision()
  const identity = JSON.stringify([projectId, fileId, revision])
  const [state, setState] = useState<{ identity: string; blob: Blob | null; error: string | null } | null>(null)
  useEffect(() => {
    if (!fileId) return
    let cancelled = false
    const controller = new AbortController()
    const url = getStimulusImageUrl(projectId, fileId)
    requestAnalytics(projectId, "stimulus-image", [url], (signal) => apiFetchBlob(url, { signal, cache: "no-store" }), controller.signal).then(
      (blob) => {
        if (!cancelled) setState({ identity, blob, error: null })
      },
      (error: unknown) => {
        if (!cancelled)
          setState({ identity, blob: null, error: error instanceof Error ? error.message : "No se pudo cargar el estímulo." })
      }
    )
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [fileId, projectId, identity])
  const current = fileId && state?.identity === identity ? state : null
  const url = useBlobUrl(current?.blob ?? null)
  if (!fileId) return { url: null, loading: false, error: null }
  if (!current) return { url: null, loading: true, error: null }
  return { url, loading: Boolean(current.blob) && !url, error: current.error }
}
