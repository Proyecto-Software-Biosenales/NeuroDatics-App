import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import ts from "typescript"
import * as loaderModule from "./participantComparison/comparisonLoader.ts"

function fixture() {
  const compiled = ts.transpileModule(readFileSync(new URL("./analyticsCache.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const entry = { exports: {} }
  new Function("require", "module", "exports", compiled)(() => loaderModule, entry, entry.exports)
  const api = entry.exports
  api.setAnalyticsSession("user-a", "session-a", "2100-01-01")
  return api
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const signal = () => new AbortController().signal
async function valid(api, project = "a", generation = 1) { await api.revalidateAnalyticsProject(project, async () => ({ ingestion_generation: generation })) }

test("A→B→A revalidates metadata and reuses only a current generation", async () => {
  const api = fixture()
  let requests = 0, contexts = 0
  const load = (p) => api.requestAnalytics(p, "series", ["P1", "all", 5000], async () => { requests += 1; return { p, time: [1, 2] } }, signal())
  const open = (p, generation = 1) => api.revalidateAnalyticsProject(p, async () => { contexts += 1; return { ingestion_generation: generation } })
  await open("a"); await load("a")
  await open("b"); await load("b")
  await open("a"); assert.equal((await load("a")).p, "a")
  assert.equal(contexts, 3); assert.equal(requests, 2)
  await open("a", 2); await load("a"); assert.equal(requests, 3)
})

test("two subscribers share one request; isolated cancellation preserves its sibling", async () => {
  const api = fixture(); await valid(api)
  const work = deferred(); let calls = 0, sharedSignal
  const first = new AbortController(), second = new AbortController()
  const fetcher = (s) => { calls += 1; sharedSignal = s; return work.promise }
  const a = api.requestAnalytics("a", "timing", ["P1", "scene"], fetcher, first.signal)
  const b = api.requestAnalytics("a", "timing", ["P1", "scene"], fetcher, second.signal)
  await flush(); assert.equal(calls, 1)
  const rejected = assert.rejects(a, { name: "AbortError" }); first.abort(); await rejected
  assert.equal(sharedSignal.aborted, false)
  work.resolve({ onset_s: 5 }); assert.deepEqual(await b, { onset_s: 5 })
})

test("last cancellation aborts; ignored abort retains slot until settlement and never caches", async () => {
  const api = fixture(); await valid(api)
  const work = deferred(), controller = new AbortController(); let sharedSignal
  const pending = api.requestAnalytics("a", "series", [], (s) => { sharedSignal = s; return work.promise }, controller.signal)
  await flush(); const rejected = assert.rejects(pending, { name: "AbortError" }); controller.abort(); await rejected
  assert.equal(sharedSignal.aborted, true); assert.equal(api.analyticsLoader.stats().active, 1)
  work.resolve("late"); await flush()
  assert.equal(api.analyticsLoader.stats().active, 0); assert.equal(api.analyticsLoader.stats().cachedEntries, 0)
})

test("in-flight project invalidation and logout discard late answers in both loaders", async () => {
  const api = fixture(); await valid(api)
  const work = deferred(), card = deferred()
  const key = api.analyticsKey("a", "card", [])
  api.comparisonCardLoader.subscribe(key, () => card.promise, () => {})
  const pending = api.requestAnalytics("a", "series", [], () => work.promise, signal())
  await flush(); const rejected = assert.rejects(pending, /contexto/)
  api.invalidateAnalyticsProject("a"); await rejected
  api.setAnalyticsSession(null, null)
  work.resolve("old"); card.resolve("old-card"); await flush()
  assert.equal(api.analyticsLoader.stats().cachedEntries, 0)
  assert.equal(api.comparisonCardLoader.peek(key), undefined)
})

test("unknown/failed context and expired session cannot persist or consume old cache", async () => {
  const api = fixture(); let calls = 0
  const load = () => api.requestAnalytics("a", "series", [], async () => ++calls, signal())
  await load(); await load(); assert.equal(calls, 2)
  await valid(api); await load(); await load(); assert.equal(calls, 3)
  await api.revalidateAnalyticsProject("a", async () => { throw new Error("offline") })
  assert.equal(api.getAnalyticsGeneration("a"), null)
  await load(); await load(); assert.equal(calls, 5)
  await valid(api); await load()
  api.setAnalyticsSession("user-a", "session-a", "2000-01-01")
  await valid(api); await load(); await load(); assert.equal(calls, 8)
})

test("keys isolate users, sessions, projects, generations, AOI revisions and every filter", async () => {
  const api = fixture(); await valid(api)
  const first = api.analyticsKey("a", "psd", ["P1", "scene", ["f3"], 25, true, 5000, 1, 3, false])
  for (const [p, op, args] of [["b", "psd", []], ["a", "series", []], ["a", "psd", ["P1", "scene", ["f4"], 25, true, 5000, 1, 3, false]]]) assert.notEqual(api.analyticsKey(p, op, args), first)
  api.invalidateAnalyticsProject("a"); await valid(api); assert.notEqual(api.analyticsKey("a", "psd", []), first)
  api.setAnalyticsSession("user-b", "session-b", "2100-01-01"); await valid(api); assert.notEqual(api.analyticsKey("a", "psd", []), first)
  assert.ok(!first.includes("session-a"))
})

test("revalidation blocks hits; a late metadata answer from an old session is ignored", async () => {
  const api = fixture(); await valid(api)
  let calls = 0
  await api.requestAnalytics("a", "series", [], async () => ++calls, signal())
  const metadata = deferred(); const refresh = api.revalidateAnalyticsProject("a", () => metadata.promise)
  const pending = api.requestAnalytics("a", "series", [], async () => ++calls, signal())
  await flush(); assert.equal(calls, 1)
  const rejected = assert.rejects(pending, { name: "AbortError" })
  api.setAnalyticsSession("user-b", "session-b", "2100-01-01")
  metadata.resolve({ ingestion_generation: 99 }); await refresh; await rejected
  // A fresh validation for B was also registered; revalidate with B's own source.
  await api.revalidateAnalyticsProject("a")
  assert.equal(api.analyticsLoader.stats().cachedEntries, 0)
})

test("mutation waits and invalidates work, including a failed write", async () => {
  const api = fixture(); await valid(api)
  const write = deferred(); let reads = 0
  const mutation = api.analyticsMutation("a", () => write.promise)
  const pending = api.requestAnalytics("a", "aois", [], async () => ++reads, signal())
  await flush(); assert.equal(reads, 0)
  const failed = assert.rejects(mutation, /write failed/), stale = assert.rejects(pending, { name: "AbortError" })
  write.reject(new Error("write failed")); await failed; await stale
  await api.requestAnalytics("a", "aois", [], async () => ++reads, signal())
  assert.equal(reads, 1)
})

test("physical active/queue bounds survive repeated ignored aborts; duplicate admission is free", async () => {
  const loader = new loaderModule.ComparisonLoader({ concurrency: 1, maxQueued: 2 })
  const work = deferred(); let calls = 0
  const release = loader.subscribe("active", () => { calls++; return work.promise }, () => {})
  await flush(); release()
  loader.subscribe("one", async () => ++calls, () => {})
  loader.subscribe("two", async () => ++calls, () => {})
  loader.subscribe("two", async () => ++calls, () => {})
  let rejected
  loader.subscribe("overflow", async () => ++calls, (entry) => { rejected = entry })
  await flush(); assert.equal(calls, 1); assert.equal(loader.stats().active, 1); assert.equal(loader.stats().queued, 2)
  assert.equal(rejected.status, "error")
  work.resolve("late"); await flush(); await flush()
  assert.equal(calls, 3); assert.equal(loader.stats().maxActive, 1)
})

test("LRU/TTL/bytes bound strings, metadata, blobs and oversize results", async () => {
  let now = 0
  const loader = new loaderModule.ComparisonLoader({ maxEntries: 2, maxWeight: 400, ttlMs: 100, now: () => now })
  const load = async (key, data) => { loader.subscribe(key, async () => data, () => {}, { weigh: loaderModule.estimateWeight }); await flush() }
  await load("a", "a".repeat(50)); await load("b", new Blob(["b".repeat(50)]))
  loader.peek("a"); await load("c", { metadata: "c".repeat(30) })
  assert.equal(loader.peek("b"), undefined); assert.ok(loader.stats().cachedWeight <= 400)
  await load("oversized", new Blob(["x".repeat(401)])); assert.equal(loader.peek("oversized"), undefined)
  now = 100; assert.equal(loader.peek("a"), undefined)
  assert.ok(loaderModule.estimateWeight({ headers: new Headers({ test: "value" }) }) > 64)
})

test("four card orchestrations can wait on the four network slots without deadlock", async () => {
  const api = fixture(); await valid(api)
  const results = []
  for (let i = 0; i < 4; i++) api.comparisonCardLoader.subscribe(api.analyticsKey("a", "card", [i]), (s) => api.requestAnalytics("a", "timing", [i], async () => i, s), (entry) => { if (entry.status === "success") results.push(entry.data) })
  await flush(); await flush()
  assert.deepEqual(results.sort(), [0, 1, 2, 3])
  assert.ok(api.analyticsLoader.stats().maxActive <= 4)
  assert.ok(api.comparisonCardLoader.stats().maxActive <= 4)
})

test("cancellation while validating metadata rejects immediately without cancelling its sibling", { timeout: 1000 }, async () => {
  const api = fixture(), metadata = deferred(), controller = new AbortController()
  const refresh = api.revalidateAnalyticsProject("a", () => metadata.promise)
  let calls = 0
  const first = api.requestAnalytics("a", "series", [], async () => ++calls, controller.signal)
  const second = api.requestAnalytics("a", "series", [], async () => ++calls, signal())
  await flush()
  const rejected = assert.rejects(first, { name: "AbortError" }); controller.abort(); await rejected
  assert.equal(calls, 0)
  metadata.resolve({ ingestion_generation: 1 }); await refresh
  assert.equal(await second, 1)
})

test("an evicted context's late metadata cannot invalidate its reopened replacement", async () => {
  const api = fixture(), old = deferred(), fresh = deferred()
  await valid(api)
  const stale = api.revalidateAnalyticsProject("a", () => old.promise)
  await flush()
  for (let i = 0; i < 65; i++) api.analyticsKey(`project-${i}`, "series", [])
  const reopened = api.revalidateAnalyticsProject("a", () => fresh.promise)
  old.resolve({ ingestion_generation: 99 })
  await stale; await flush()
  fresh.resolve({ ingestion_generation: 2 }); await reopened
  assert.equal(api.getAnalyticsGeneration("a"), 2)
  const result = await api.requestAnalytics("a", "series", [], async () => "fresh", signal())
  assert.equal(result, "fresh")
  assert.equal(api.analyticsLoader.stats().cachedEntries, 1)
})

test("slow metadata admits bounded unique waits, shares duplicates and detaches cancellations", async () => {
  const api = fixture(), metadata = deferred()
  const refresh = api.revalidateAnalyticsProject("a", () => metadata.promise)
  const controllers = Array.from({ length: 140 }, () => new AbortController())
  let calls = 0
  const fetcher = async () => ++calls
  const pending = controllers.map((controller, index) => api.requestAnalytics("a", "series", [index], fetcher, controller.signal).catch((error) => error))
  const duplicate = api.requestAnalytics("a", "series", [127], fetcher, signal())
  await flush()
  assert.equal(calls, 0)
  assert.equal(api.analyticsWaitStats().uniqueKeys, 128)
  assert.equal(api.analyticsWaitStats().barriers, 1)
  for (let i = 128; i < 140; i++) assert.match((await pending[i]).message, /cola de validación/)
  for (let i = 0; i < 64; i++) controllers[i].abort()
  for (let i = 0; i < 64; i++) assert.equal((await pending[i]).name, "AbortError")
  assert.equal(api.analyticsWaitStats().uniqueKeys, 64)
  // Repeated subscribe/abort attaches no additional Promise.then callbacks:
  // the barrier stays singular and removes each consumer's listener immediately.
  for (let i = 0; i < 200; i++) {
    const controller = new AbortController()
    const cancelled = api.requestAnalytics("a", "series", ["cancel", i], fetcher, controller.signal)
    const rejected = assert.rejects(cancelled, { name: "AbortError" })
    controller.abort(); await rejected
  }
  assert.equal(api.analyticsWaitStats().uniqueKeys, 64)
  assert.equal(api.analyticsWaitStats().barriers, 1)
  metadata.resolve({ ingestion_generation: 1 }); await refresh
  await Promise.all(pending.slice(64, 128)); await duplicate
  assert.equal(calls, 64, "duplicate payload shares a job after the barrier opens")
  assert.equal(api.analyticsWaitStats().uniqueKeys, 0)
  assert.equal(api.analyticsWaitStats().barriers, 0)
  assert.equal(api.analyticsWaitStats().maxUniqueKeys, 128)
})

test("AOI digest covers geometry/order and legacy or oversized config cannot retain AOIs", async () => {
  const api = fixture()
  const scene = { id: "scene", name: "scene", width: 100, height: 100, stimulus_placement: { x: 0 }, aois: [{ id: "a", name: "area", color: "red", shape_type: "rectangle", shape: { x: 1, y: 0 } }, { id: "b", shape: { x: 2 } }] }
  const refresh = (scenaries) => api.revalidateAnalyticsProject("a", async () => ({ ingestion_generation: 1, scenaries }))
  let signals = 0, aois = 0
  const loadSignals = () => api.requestAnalytics("a", "series", [], async () => ++signals, signal())
  const loadAois = () => api.requestAnalytics("a", "getAoiMetrics", ["P1", "scene"], async () => ++aois, signal())
  const cardArgs = [JSON.stringify({ kind: "aoi", participant: "P1" })]
  await refresh([scene]); await loadSignals(); await loadAois()
  const key = api.analyticsKey("a", "participant-card", cardArgs)
  assert.equal(api.analyticsKeyCacheable(key), true)
  assert.equal(JSON.parse(key)[8].length, 64)
  const spatial = ["getAoiMetrics", "getGazeTimeseries", "getGazeStatistics", "getScanpath", "getFixationData", "getFixationHistogram", "getFixationSensitivity", "getComparisonCharts", "getScenarios", "gaze-at", "heatmap-overlay"]
  const priorKeys = spatial.map((operation) => api.analyticsKey("a", operation, []))
  const cardKeys = ["aoi", "heatmap", "scanpath", "fixation_histogram", "gaze"].map((kind) => api.analyticsKey("a", "participant-card", [JSON.stringify({ kind })]))
  await refresh([scene]); await loadSignals(); await loadAois()
  assert.equal(signals, 1); assert.equal(aois, 1)
  scene.aois[0].shape.x = 5
  await refresh([scene]); await loadSignals(); await loadAois()
  assert.equal(signals, 1); assert.equal(aois, 2)
  assert.equal(api.isAnalyticsKeyCurrent(key), false)
  for (const candidate of [...priorKeys, ...cardKeys]) assert.equal(api.isAnalyticsKeyCurrent(candidate), false)
  const edited = api.analyticsKey("a", "participant-card", cardArgs)
  scene.aois.reverse(); await refresh([scene])
  assert.equal(api.isAnalyticsKeyCurrent(edited), false, "AOI order is scientifically relevant")
  for (const config of [undefined, [{ id: "legacy" }], [{ ...scene, name: "x".repeat(512 * 1024 + 1) }]]) {
    await refresh(config); await loadAois(); await loadAois(); await loadSignals()
    assert.equal(api.analyticsKeyCacheable(api.analyticsKey("a", "participant-card", cardArgs)), false)
  }
  assert.equal(signals, 1); assert.equal(aois, 8)
})


test("stable unknown metadata and repeated failures preserve only live non-cacheable requests", async () => {
  const api = fixture()
  await api.revalidateAnalyticsProject("a", async () => ({ ingestion_generation: null }))
  const work = deferred()
  let calls = 0
  const load = () => api.requestAnalytics("a", "getFixationSensitivity", ["P1", "scene"], () => { calls += 1; return work.promise }, signal())
  const pending = load()
  await flush()
  await api.revalidateAnalyticsProject("a", async () => ({ ingestion_generation: null }))
  await api.revalidateAnalyticsProject("a", async () => { throw new Error("offline") })
  work.resolve({ available_min_fixation_durations_ms: [200] })
  assert.deepEqual(await pending, { available_min_fixation_durations_ms: [200] })
  assert.equal(calls, 1)
  assert.equal(api.analyticsLoader.stats().cachedEntries, 0)
  await load()
  assert.equal(calls, 2, "unknown identity never retains a completed result")
})
