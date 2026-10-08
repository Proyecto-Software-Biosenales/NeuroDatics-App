import { ComparisonLoader, estimateWeight, type Fetcher } from "./participantComparison/comparisonLoader"
import type { ApiProjectDetail } from "../projects/api/projectsApi"

// One budget for dashboard JSON, comparison cards/timing and scoped blobs.
// Weight is estimated retained BYTES, including object/array/string overhead.
export const analyticsLoader = new ComparisonLoader({ concurrency: 4, maxQueued: 128, maxEntries: 48, maxWeight: 16 * 1024 * 1024, ttlMs: 5 * 60_000 })
export const comparisonCardLoader = new ComparisonLoader({ concurrency: 4, maxQueued: 128, maxEntries: 48, maxWeight: 8 * 1024 * 1024, ttlMs: 5 * 60_000 })
const loaders = [analyticsLoader, comparisonCardLoader]
const invalidate = (matches?: (key: string) => boolean) => { for (const loader of loaders) loader.invalidate(matches) }
type Context = { generation: number | null; spatialDigest: string | null; revision: number; pending?: Promise<void>; refresh?: (signal: AbortSignal) => Promise<Pick<ApiProjectDetail, "ingestion_generation" | "scenaries">> }
const contexts = new Map<string, Context>()
const listeners = new Set<() => void>()
type WaitListener = (error?: unknown) => void
type WaitEntry = { projectId: string; listeners: Set<WaitListener> }
type Barrier = { keys: Map<string, WaitEntry> }
// Admission before the I/O queues is bounded independently. Duplicate
// consumers subscribe to a key; only ONE completion callback owns a barrier.
const MAX_CONTEXT_WAITS = 128
const barriers = new Map<Promise<void>, Barrier>()
const waitingKeys = new Map<string, WaitEntry>()
let maxWaitingKeys = 0
export function analyticsWaitStats() { return { uniqueKeys: waitingKeys.size, barriers: barriers.size, maxUniqueKeys: maxWaitingKeys, limitKeys: MAX_CONTEXT_WAITS, limitBarriers: MAX_CONTEXT_WAITS } }
function cancelContextWaits(projectId?: string) {
  for (const [key, entry] of [...waitingKeys]) {
    if (projectId != null && entry.projectId !== projectId) continue
    waitingKeys.delete(key)
    for (const listener of [...entry.listeners]) listener(new DOMException("Aborted", "AbortError"))
    entry.listeners.clear()
  }
  for (const barrier of barriers.values()) for (const [key, entry] of [...barrier.keys]) {
    if (projectId == null || entry.projectId === projectId) barrier.keys.delete(key)
  }
}
let version = 0
let nextRevision = 0
let sessionEpoch = 0
let userId: string | null = null
let sessionIdentity: string | null = null
let sessionExpiresAt = 0
const notify = () => { version += 1; for (const listener of [...listeners]) listener() }
export const subscribeAnalyticsContext = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const analyticsContextVersion = () => version

function context(projectId: string): Context {
  let entry = contexts.get(projectId)
  if (!entry) {
    entry = { generation: null, spatialDigest: null, revision: ++nextRevision }
    contexts.set(projectId, entry)
    // Metadata is bounded too; forgotten projects revalidate before reuse.
    if (contexts.size > 64) {
      const oldest = contexts.keys().next().value!
      invalidate((key) => projectInKey(key) === oldest)
      contexts.delete(oldest)
    }
  }
  return entry
}
function projectInKey(key: string) {
  try { return JSON.parse(key)[3] as string } catch { return null }
}
export function setAnalyticsSession(nextUser: string | null, identity: string | null, expiresAt: string | null = null) {
  const expiry = expiresAt ? Date.parse(expiresAt) : 0
  if (userId === nextUser && sessionIdentity === identity && sessionExpiresAt === expiry) return
  userId = nextUser
  sessionIdentity = identity // Only compared in memory, never emitted in keys/logs.
  sessionExpiresAt = expiry
  sessionEpoch += 1
  cancelContextWaits()
  invalidate()
  for (const entry of contexts.values()) { entry.generation = null; entry.spatialDigest = null; entry.revision = ++nextRevision; entry.pending = undefined }
  notify()
  for (const projectId of contexts.keys()) void revalidateAnalyticsProject(projectId)
}
export function analyticsKey(projectId: string, operation: string, args: unknown): string {
  const entry = context(projectId)
  return JSON.stringify(["analytics-v1", sessionEpoch, userId, projectId, entry.generation, entry.revision, operation, args, dependsOnSpatialConfig(operation, args) ? entry.spatialDigest : null])
}
export function isAnalyticsKeyCurrent(key: string): boolean {
  try {
    const parts = JSON.parse(key)
    return parts[0] === "analytics-v1" && key === analyticsKey(parts[3], parts[6], parts[7])
  } catch { return false }
}
export function analyticsCacheable(projectId: string, operation?: string, args?: unknown) {
  const entry = context(projectId)
  return userId !== null && sessionExpiresAt > Date.now() && entry.generation !== null && !entry.pending && (!dependsOnSpatialConfig(operation, args) || entry.spatialDigest !== null)
}
export function analyticsKeyCacheable(key: string) {
  try { const parts = JSON.parse(key); return isAnalyticsKeyCurrent(key) && analyticsCacheable(parts[3], parts[6], parts[7]) } catch { return false }
}
function dependsOnSpatialConfig(operation?: string, args?: unknown) {
  if (operation?.startsWith("getComparisonCharts:")) return true
  if (operation && ["getAoiMetrics", "getGazeTimeseries", "getGazeStatistics", "getScanpath", "getFixationData", "getFixationHistogram", "getFixationSensitivity", "getComparisonCharts", "getScenarios", "gaze-at", "heatmap-overlay"].includes(operation)) return true
  if (operation !== "participant-card" || !Array.isArray(args)) return false
  try { return ["aoi", "heatmap", "scanpath", "fixation_histogram", "gaze"].includes(JSON.parse(args[0]).kind) } catch { return false }
}
function spatialKey(key: string) {
  try { const parts = JSON.parse(key); return dependsOnSpatialConfig(parts[6], parts[7]) } catch { return false }
}
// Store only a 64-character SHA-256 digest per context, never spatial JSON.
// Legacy/missing or >1 MiB configuration has unknown identity: spatial results
// may be delivered but cannot persist; signal reuse remains generation-based.
async function spatialDigest(project: Pick<ApiProjectDetail, "scenaries">): Promise<string | null> {
  if (!Array.isArray(project.scenaries) || project.scenaries.some((scene) => !Array.isArray(scene.aois)) || !globalThis.crypto?.subtle) return null
  const json = JSON.stringify(project.scenaries)
  if (json.length > 512 * 1024) return null
  const bytes = new TextEncoder().encode(json)
  if (bytes.byteLength > 1024 * 1024) return null
  try {
    const digest = await crypto.subtle.digest("SHA-256", bytes)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  } catch { return null }
}
export function getAnalyticsGeneration(projectId: string) { return context(projectId).generation }
export function invalidateAnalyticsProject(projectId: string) {
  const entry = context(projectId)
  entry.revision = ++nextRevision
  entry.generation = null
  entry.spatialDigest = null
  entry.pending = undefined
  cancelContextWaits(projectId)
  invalidate((key) => projectInKey(key) === projectId)
  notify()
}
/** HTTP no-store context validation on project reopen and focus. Failure is unknown. */
export function revalidateAnalyticsProject(projectId: string, refresh?: Context["refresh"]): Promise<void> {
  const entry = context(projectId)
  if (refresh) entry.refresh = refresh
  if (entry.pending) return entry.pending
  if (!entry.refresh) return Promise.resolve()
  const epoch = sessionEpoch
  const revision = entry.revision
  const previous = entry.generation
  const previousSpatial = entry.spatialDigest
  // Context I/O shares the network budget and never enters the result cache.
  const source = entry.refresh
  const pending = loaderRequest(analyticsKey(projectId, "project-context", []), source, new AbortController().signal, false).then(async (project) => {
    const nextSpatial = await spatialDigest(project)
    if (contexts.get(projectId) !== entry || epoch !== sessionEpoch || entry.revision !== revision) return
    const next = Number.isSafeInteger(project.ingestion_generation) && project.ingestion_generation! >= 0 ? project.ingestion_generation! : null
    // Stable unknown identity has no retained results to purge. Its live,
    // non-cacheable requests must survive another metadata check.
    if (previous !== next) {
      invalidate((key) => projectInKey(key) === projectId)
    } else if (previousSpatial !== nextSpatial) {
      invalidate((key) => projectInKey(key) === projectId && spatialKey(key))
    }
    entry.generation = next
    entry.spatialDigest = nextSpatial
    if (previous !== next || previousSpatial !== nextSpatial) notify()
  }, () => {
    if (contexts.get(projectId) !== entry || epoch !== sessionEpoch || entry.revision !== revision) return
    if (previous !== null || previousSpatial !== null) invalidate((key) => projectInKey(key) === projectId)
    entry.generation = null
    entry.spatialDigest = null
    if (previous !== null || previousSpatial !== null) notify()
  }).finally(() => {
    if (entry.pending === pending) entry.pending = undefined
  })
  entry.pending = pending
  return pending
}
export async function analyticsMutation<T>(projectId: string, mutate: () => Promise<T>): Promise<T> {
  invalidateAnalyticsProject(projectId)
  const entry = context(projectId)
  let finish!: () => void
  // Subscribers arriving during a mutation wait, then are replaced by the
  // post-mutation revision. No result computed during editing is retained.
  entry.pending = new Promise<void>((resolve) => { finish = resolve })
  try { return await mutate() } finally {
    invalidateAnalyticsProject(projectId)
    finish()
    await revalidateAnalyticsProject(projectId)
  }
}

/** Promise adapter over subscriptions: cancelling one consumer only releases it. */
export function loaderRequest<T>(key: string, fetcher: Fetcher<T>, signal: AbortSignal, cacheable = true): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return }
    const subscription: { release?: () => void } = {}
    let settled = false
    const cleanup = () => { signal.removeEventListener("abort", abort); subscription.release?.() }
    const abort = () => { if (!settled) { settled = true; cleanup(); reject(new DOMException("Aborted", "AbortError")) } }
    signal.addEventListener("abort", abort, { once: true })
    subscription.release = analyticsLoader.subscribe(key, fetcher, (state) => {
      if (settled || (state.status !== "success" && state.status !== "error")) return
      settled = true
      cleanup()
      if (state.status === "success") resolve(state.data as T)
      else reject(new Error(state.error ?? "Error loading analytics"))
    }, { cacheable, weigh: estimateWeight })
    if (settled) cleanup() // Cache hits notify synchronously before release is assigned.
  })
}
export async function requestAnalytics<T>(projectId: string, operation: string, args: unknown, fetcher: Fetcher<T>, signal: AbortSignal, expectedVersion?: number): Promise<T> {
  if (expectedVersion != null && expectedVersion !== version) throw new DOMException("Aborted", "AbortError")
  await waitForAnalyticsContext(projectId, signal, analyticsKey(projectId, operation, args))
  return loaderRequest(analyticsKey(projectId, operation, args), fetcher, signal, analyticsCacheable(projectId, operation, args))
}
export async function waitForAnalyticsContext(projectId: string, signal: AbortSignal, key = analyticsKey(projectId, "context-wait", [])): Promise<void> {
  const entry = context(projectId)
  const epoch = sessionEpoch
  const revision = entry.revision
  await waitForContext(entry.pending, projectId, key, signal)
  if (contexts.get(projectId) !== entry || signal.aborted || epoch !== sessionEpoch || revision !== entry.revision) throw new DOMException("Aborted", "AbortError")
}

/** Release a waiting consumer immediately; its siblings still validate context. */
function waitForContext(pending: Promise<void> | undefined, projectId: string, key: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"))
  if (!pending) return Promise.resolve()
  let barrier = barriers.get(pending)
  if (!barrier) {
    if (barriers.size >= MAX_CONTEXT_WAITS) return Promise.reject(new Error("La cola de validación está llena. Vuelve a intentar."))
    barrier = { keys: new Map() }
    barriers.set(pending, barrier)
    const current = barrier
    const finish = (error?: unknown) => {
      barriers.delete(pending)
      for (const [candidate, entry] of [...current.keys]) {
        if (waitingKeys.get(candidate) === entry) waitingKeys.delete(candidate)
        for (const listener of [...entry.listeners]) listener(error)
        entry.listeners.clear()
      }
      current.keys.clear()
    }
    pending.then(() => finish(), finish)
  }
  let entry = barrier.keys.get(key)
  if (!entry) {
    if (waitingKeys.size >= MAX_CONTEXT_WAITS) return Promise.reject(new Error("La cola de validación está llena. Vuelve a intentar."))
    entry = { projectId, listeners: new Set() }
    barrier.keys.set(key, entry)
    waitingKeys.set(key, entry)
    maxWaitingKeys = Math.max(maxWaitingKeys, waitingKeys.size)
  }
  const current = entry
  const currentBarrier = barrier
  return new Promise((resolve, reject) => {
    const finish: WaitListener = (error) => {
      signal.removeEventListener("abort", abort)
      current.listeners.delete(finish)
      if (current.listeners.size === 0) {
        currentBarrier.keys.delete(key)
        if (waitingKeys.get(key) === current) waitingKeys.delete(key)
      }
      if (error) reject(error)
      else resolve()
    }
    const abort = () => finish(new DOMException("Aborted", "AbortError"))
    current.listeners.add(finish)
    signal.addEventListener("abort", abort, { once: true })
  })
}

