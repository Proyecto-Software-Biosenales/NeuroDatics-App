/**
 * Bounded request queue plus a bounded result cache for per-participant cards.
 *
 * - At most `concurrency` fetchers run at once; the rest wait by priority
 *   (visible cards before the near margin) and then by arrival order.
 * - One job per key: two cards, or a remount, never duplicate a request.
 * - A job whose last subscriber leaves is removed from the queue. A running one
 *   is aborted, unless the release asks to keep it (a card scrolled out of the
 *   mount margin): it then finishes into the cache while still holding its
 *   slot, and a returning card re-attaches to it instead of asking again.
 *   `abortGroup` cancels a participant's work when it is deselected. A late
 *   answer from an aborted or replaced job is always dropped.
 * - Results live in an LRU with a TTL, an entry cap and a weight cap, so
 *   "all selected" never means "all retained".
 */

export type EntryStatus = "queued" | "loading" | "success" | "error"

export interface EntryState<T> {
  status: EntryStatus
  data: T | null
  error: string | null
}

export type Fetcher<T> = (signal: AbortSignal) => Promise<T>
type Listener = (state: EntryState<unknown>) => void

interface Job {
  key: string
  group: string | null
  fetcher: Fetcher<unknown>
  weigh: (data: unknown) => number
  priority: number
  seq: number
  listeners: Set<Listener>
  state: EntryState<unknown>
  controller: AbortController | null
  running: boolean
  token: number
  cacheable: boolean
}

interface CacheEntry {
  data: unknown
  weight: number
  expiresAt: number
}

export interface LoaderOptions {
  concurrency?: number
  maxEntries?: number
  maxWeight?: number
  ttlMs?: number
  now?: () => number
  maxQueued?: number
}

export interface LoaderStats {
  started: number
  succeeded: number
  failed: number
  aborted: number
  discarded: number
  cacheHits: number
  maxActive: number
  active: number
  queued: number
  cachedEntries: number
  cachedWeight: number
}

export interface SubscribeOptions<T> {
  priority?: number
  /** Jobs of one group (a participant) can be cancelled together. */
  group?: string
  weigh?: (data: T) => number
  cacheable?: boolean
}

export function errorMessage(error: unknown, fallback = "No se pudo cargar la gráfica."): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

export class ComparisonLoader {
  readonly concurrency: number
  private readonly maxEntries: number
  private readonly maxWeight: number
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly maxQueued: number
  private readonly cache = new Map<string, CacheEntry>()
  private readonly jobs = new Map<string, Job>()
  private cachedWeight = 0
  private active = 0
  private seq = 0
  private tokens = 0
  private pumpScheduled = false
  private counters = { started: 0, succeeded: 0, failed: 0, aborted: 0, discarded: 0, cacheHits: 0, maxActive: 0 }

  constructor(options: LoaderOptions = {}) {
    this.concurrency = Math.max(1, options.concurrency ?? 4)
    this.maxEntries = Math.max(1, options.maxEntries ?? 48)
    this.maxWeight = Math.max(1, options.maxWeight ?? 24 * 1024 * 1024)
    this.ttlMs = Math.max(1, options.ttlMs ?? 5 * 60_000)
    this.now = options.now ?? Date.now
    this.maxQueued = Math.max(0, options.maxQueued ?? 128)
  }

  /** A fresh cached result, refreshed in LRU order, or undefined. */
  peek<T>(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= this.now()) {
      this.dropCache(key)
      return undefined
    }
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.data as T
  }

  /**
   * Ask for `key`. The listener receives the current state synchronously and
   * every change after it. The returned function releases the interest.
   */
  subscribe<T>(
    key: string,
    fetcher: Fetcher<T>,
    listener: (state: EntryState<T>) => void,
    options: SubscribeOptions<T> = {}
  ): (release?: { keepRunning?: boolean }) => void {
    const cached = options.cacheable === false ? undefined : this.peek<T>(key)
    if (cached !== undefined) {
      this.counters.cacheHits += 1
      listener({ status: "success", data: cached, error: null })
      return () => {}
    }
    let job = this.jobs.get(key)
    if (!job) {
      const waiting = [...this.jobs.values()].filter((entry) => entry.state.status === "queued").length
      if (this.jobs.size >= this.concurrency + this.maxQueued || waiting >= this.maxQueued + Math.max(0, this.concurrency - this.active)) {
        listener({ status: "error", data: null, error: "La cola de análisis está llena. Vuelve a intentar." })
        return () => {}
      }
      job = {
        key,
        group: options.group ?? null,
        fetcher: fetcher as Fetcher<unknown>,
        weigh: (options.weigh ?? (() => 1)) as (data: unknown) => number,
        priority: options.priority ?? 0,
        seq: this.seq++,
        listeners: new Set(),
        state: { status: "queued", data: null, error: null },
        controller: null,
        running: false,
        token: 0,
        cacheable: options.cacheable !== false,
      }
      this.jobs.set(key, job)
    } else if (options.priority != null) {
      job.priority = Math.min(job.priority, options.priority)
    }
    const entry = job
    const wrapped = listener as Listener
    entry.listeners.add(wrapped)
    wrapped(entry.state)
    this.pump()
    return (release) => this.release(entry, wrapped, release?.keepRunning ?? false)
  }

  /** Re-rank a waiting job, e.g. when its card scrolls into view. */
  setPriority(key: string, priority: number) {
    const job = this.jobs.get(key)
    if (!job) return
    job.priority = priority
    this.pump()
  }

  /** Put a failed job back in the queue. */
  retry(key: string) {
    const job = this.jobs.get(key)
    if (!job || job.state.status !== "error") return
    job.seq = this.seq++
    this.setState(job, { status: "queued", data: null, error: null })
    this.pump()
  }

  /** Abort and forget every job of `group`, e.g. a deselected participant. */
  abortGroup(group: string) {
    for (const job of [...this.jobs.values()]) {
      if (job.group !== group) continue
      this.jobs.delete(job.key)
      this.abortJob(job)
    }
    this.pump()
  }

  /** Abort and forget every job; cached results stay. */
  cancelAll() {
    for (const job of [...this.jobs.values()]) this.abortJob(job)
    this.jobs.clear()
    this.pump()
  }

  /** Forget cached results, e.g. after the project is re-processed. */
  clearCache() {
    this.cache.clear()
    this.cachedWeight = 0
  }

  /** Forget matching data AND pending work. Late answers cannot repopulate it. */
  invalidate(matches: (key: string) => boolean = () => true) {
    for (const key of [...this.cache.keys()]) if (matches(key)) this.dropCache(key)
    for (const job of [...this.jobs.values()]) {
      if (!matches(job.key)) continue
      this.jobs.delete(job.key)
      this.abortJob(job)
      this.setState(job, { status: "error", data: null, error: "El contexto de análisis cambió." })
      job.listeners.clear()
    }
    this.pump()
  }

  stats(): LoaderStats {
    return {
      ...this.counters,
      active: this.active,
      queued: [...this.jobs.values()].filter((job) => job.state.status === "queued").length,
      cachedEntries: this.cache.size,
      cachedWeight: this.cachedWeight,
    }
  }

  private release(job: Job, listener: Listener, keepRunning: boolean) {
    job.listeners.delete(listener)
    if (job.listeners.size > 0) return
    if (keepRunning && job.running) return
    if (this.jobs.get(job.key) === job) this.jobs.delete(job.key)
    this.abortJob(job)
    this.pump()
  }

  private abortJob(job: Job) {
    if (!job.running || job.controller?.signal.aborted) return
    job.token = -1
    this.counters.aborted += 1
    job.controller?.abort()
  }

  private setState(job: Job, state: EntryState<unknown>) {
    job.state = state
    for (const listener of [...job.listeners]) listener(state)
  }

  private next(): Job | null {
    let best: Job | null = null
    for (const job of this.jobs.values()) {
      if (job.state.status !== "queued" || job.running) continue
      if (!best || job.priority < best.priority || (job.priority === best.priority && job.seq < best.seq)) best = job
    }
    return best
  }

  /**
   * Starts run one microtask later, so every card mounted in the same commit
   * is ranked together and a visible card is never overtaken by a mount that
   * merely happened first.
   */
  private pump() {
    if (this.pumpScheduled) return
    this.pumpScheduled = true
    queueMicrotask(() => {
      this.pumpScheduled = false
      this.drain()
    })
  }

  private drain() {
    while (this.active < this.concurrency) {
      const job = this.next()
      if (!job) return
      this.start(job)
    }
  }

  private start(job: Job) {
    const token = ++this.tokens
    const controller = new AbortController()
    job.token = token
    job.controller = controller
    job.running = true
    this.active += 1
    this.counters.started += 1
    this.counters.maxActive = Math.max(this.counters.maxActive, this.active)
    this.setState(job, { status: "loading", data: null, error: null })

    const settle = (apply: () => void) => {
      job.running = false
      job.controller = null
      this.active -= 1
      if (job.token !== token || controller.signal.aborted) {
        this.counters.discarded += 1
        this.pump()
        return
      }
      apply()
      this.pump()
    }

    let pending: Promise<unknown>
    try {
      pending = Promise.resolve(job.fetcher(controller.signal))
    } catch (error) {
      pending = Promise.reject(error)
    }
    pending.then(
      (data) =>
        settle(() => {
          this.counters.succeeded += 1
          if (job.cacheable) this.writeCache(job.key, data, job.weigh(data))
          if (this.jobs.get(job.key) === job) this.jobs.delete(job.key)
          this.setState(job, { status: "success", data, error: null })
        }),
      (error: unknown) =>
        settle(() => {
          this.counters.failed += 1
          this.setState(job, { status: "error", data: null, error: errorMessage(error) })
        })
    )
  }

  private writeCache(key: string, data: unknown, weight: number) {
    const safeWeight = Number.isFinite(weight) && weight > 0 ? weight : 1
    this.dropCache(key)
    // A result larger than the whole budget is shown but never retained.
    if (safeWeight > this.maxWeight) return
    this.cache.set(key, { data, weight: safeWeight, expiresAt: this.now() + this.ttlMs })
    this.cachedWeight += safeWeight
    const now = this.now()
    for (const [candidate, entry] of this.cache) {
      if (entry.expiresAt <= now) this.dropCache(candidate)
    }
    while (this.cache.size > this.maxEntries || this.cachedWeight > this.maxWeight) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.dropCache(oldest)
    }
  }

  private dropCache(key: string) {
    const entry = this.cache.get(key)
    if (!entry) return
    this.cache.delete(key)
    this.cachedWeight -= entry.weight
  }
}

/** Estimated retained bytes, including strings/containers; not a JS heap meter. */
export function estimateWeight(value: unknown): number {
  const seen = new WeakSet<object>()
  function bytes(item: unknown): number {
    if (item == null) return 8
    if (typeof item === "string") return 16 + item.length * 2
    if (typeof item !== "object") return 8
    if (seen.has(item)) return 0
    seen.add(item)
    if (typeof Blob !== "undefined" && item instanceof Blob) return 64 + item.size
    if (typeof Headers !== "undefined" && item instanceof Headers) return bytes([...item.entries()])
    if (ArrayBuffer.isView(item)) return 64 + item.byteLength
    if (item instanceof ArrayBuffer) return 64 + item.byteLength
    if (Array.isArray(item)) return 32 + item.reduce((sum, entry) => sum + 8 + bytes(entry), 0)
    return 64 + Object.entries(item).reduce((sum, [key, entry]) => sum + 16 + key.length * 2 + bytes(entry), 0)
  }
  return bytes(value)
}
