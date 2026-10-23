import assert from "node:assert/strict"
import test from "node:test"
import { ComparisonLoader, estimateWeight } from "./comparisonLoader.ts"
import { commonDomain, describeCommonScale, mergeDomains, withQuantiles } from "./scales.ts"
import {
  cardCacheKey,
  filterParticipants,
  orderParticipants,
  specMinFixationDuration,
  specRestriction,
  withMinFixationDuration,
} from "./spec.ts"
import { axisOffsets, participantWindow, transferWindow } from "./timeAlignment.ts"

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function controlledLoader(options) {
  const loader = new ComparisonLoader(options)
  const calls = []
  const fetcherFor = (key) => (signal) => {
    const call = { key, signal, ...deferred() }
    calls.push(call)
    return call.promise
  }
  return { loader, calls, fetcherFor }
}

test("never runs more than the concurrency limit and starts visible cards first", async () => {
  const { loader, calls, fetcherFor } = controlledLoader({ concurrency: 4 })
  const states = new Map()
  for (let index = 0; index < 10; index += 1) {
    const key = `P${index}`
    // P7 is visible, the rest are in the near margin.
    loader.subscribe(key, fetcherFor(key), (state) => states.set(key, state.status), { priority: index === 7 ? 0 : 1 })
  }
  await flush()
  assert.equal(calls.length, 4)
  assert.deepEqual(calls.map((call) => call.key), ["P7", "P0", "P1", "P2"])
  assert.equal(loader.stats().active, 4)
  assert.equal(loader.stats().queued, 6)
  calls[0].resolve({ ok: 1 })
  await flush()
  assert.equal(calls.length, 5)
  assert.equal(loader.stats().maxActive, 4)
  assert.equal(states.get("P7"), "success")
})

test("duplicate subscribers share one request and one result", async () => {
  const { loader, calls, fetcherFor } = controlledLoader({ concurrency: 2 })
  const seen = []
  loader.subscribe("same", fetcherFor("same"), (state) => seen.push(["a", state.status]))
  loader.subscribe("same", fetcherFor("same"), (state) => seen.push(["b", state.status]))
  await flush()
  assert.equal(calls.length, 1)
  calls[0].resolve([1, 2, 3])
  await flush()
  assert.deepEqual(seen.filter(([, status]) => status === "success").map(([who]) => who).sort(), ["a", "b"])
  // A later mount is a cache hit, not a new request.
  let later = null
  loader.subscribe("same", fetcherFor("same"), (state) => { later = state })
  assert.equal(calls.length, 1)
  assert.deepEqual(later, { status: "success", data: [1, 2, 3], error: null })
})

test("releasing a queued card removes it; releasing a running card aborts it and ignores its late answer", async () => {
  const { loader, calls, fetcherFor } = controlledLoader({ concurrency: 1 })
  const results = []
  const releaseA = loader.subscribe("A", fetcherFor("A"), (state) => results.push(["A", state.status]))
  const releaseB = loader.subscribe("B", fetcherFor("B"), (state) => results.push(["B", state.status]))
  loader.subscribe("C", fetcherFor("C"), (state) => results.push(["C", state.status]))
  await flush()
  releaseB()
  assert.equal(loader.stats().queued, 1)
  releaseA()
  await flush()
  assert.equal(calls[0].signal.aborted, true)
  // A keeps its physical slot until settling, even if fetcher ignores abort.
  assert.deepEqual(calls.map((call) => call.key), ["A"])
  calls[0].resolve("late A")
  await flush()
  assert.equal(loader.peek("A"), undefined)
  assert.ok(!results.some(([key, status]) => key === "A" && status === "success"))
  assert.equal(loader.stats().discarded, 1)
})

test("out-of-order answers only reach their own card", async () => {
  const { loader, calls, fetcherFor } = controlledLoader({ concurrency: 3 })
  const data = {}
  for (const key of ["P1", "P2", "P3"]) {
    loader.subscribe(key, fetcherFor(key), (state) => {
      if (state.status === "success") data[key] = state.data
    })
  }
  await flush()
  calls[2].resolve({ participant: "P3" })
  calls[0].resolve({ participant: "P1" })
  await flush()
  calls[1].resolve({ participant: "P2" })
  await flush()
  assert.deepEqual(data, { P1: { participant: "P1" }, P2: { participant: "P2" }, P3: { participant: "P3" } })
})

test("a failure does not block the others and can be retried", async () => {
  const { loader, calls, fetcherFor } = controlledLoader({ concurrency: 1 })
  const states = {}
  loader.subscribe("bad", fetcherFor("bad"), (state) => { states.bad = state })
  loader.subscribe("good", fetcherFor("good"), (state) => { states.good = state })
  await flush()
  calls[0].reject(new Error("Error 500: fallo"))
  await flush()
  assert.equal(states.bad.status, "error")
  assert.equal(states.bad.error, "Error 500: fallo")
  assert.equal(calls[1].key, "good")
  calls[1].resolve("ok")
  await flush()
  assert.equal(states.good.status, "success")
  loader.retry("bad")
  await flush()
  assert.equal(calls.length, 3)
  calls[2].resolve("recovered")
  await flush()
  assert.equal(states.bad.data, "recovered")
})

test("the cache is bounded by entries, weight and time", async () => {
  let now = 0
  const loader = new ComparisonLoader({ concurrency: 8, maxEntries: 3, maxWeight: 10, ttlMs: 100, now: () => now })
  const load = async (key, weight) => {
    loader.subscribe(key, async () => key, () => {}, { weigh: () => weight })
    await flush()
  }
  await load("a", 2)
  await load("b", 2)
  await load("c", 2)
  await load("d", 2)
  assert.equal(loader.peek("a"), undefined)
  assert.equal(loader.stats().cachedEntries, 3)
  await load("heavy", 7)
  assert.ok(loader.stats().cachedWeight <= 10)
  await load("too-heavy", 11)
  assert.equal(loader.peek("too-heavy"), undefined)
  now = 1000
  assert.equal(loader.peek("heavy"), undefined)
})

test("cancelAll aborts running work and drops the queue", async () => {
  const { loader, calls, fetcherFor } = controlledLoader({ concurrency: 2 })
  for (const key of ["a", "b", "c"]) loader.subscribe(key, fetcherFor(key), () => {})
  await flush()
  loader.cancelAll()
  assert.ok(calls.every((call) => call.signal.aborted))
  assert.equal(loader.stats().active, 2)
  assert.equal(loader.stats().queued, 0)
  calls[0].resolve("late")
  await flush()
  assert.equal(loader.peek("a"), undefined)
})

test("cache keys isolate project, generation, participant, scenario and request parameters", () => {
  const spec = {
    kind: "pupil",
    title: "Dilatación pupilar",
    scenario: "Video A",
    sourceParticipant: "P01",
    origin: "individual",
    params: { eyes: "both", window: { start: null, end: null } },
  }
  const context = { projectId: "p1", generation: 3 }
  const base = cardCacheKey(context, "P02", spec, 2000)
  assert.equal(base, cardCacheKey(context, "P02", { ...spec, params: { ...spec.params, eyes: "left" } }, 2000))
  const variants = [
    cardCacheKey({ ...context, projectId: "p2" }, "P02", spec, 2000),
    cardCacheKey({ ...context, generation: 4 }, "P02", spec, 2000),
    cardCacheKey(context, "P03", spec, 2000),
    cardCacheKey(context, "P02", { ...spec, scenario: "Video B" }, 2000),
    cardCacheKey(context, "P02", { ...spec, params: { ...spec.params, window: { start: 1, end: 2 } } }, 2000),
    cardCacheKey(context, "P02", { ...spec, kind: "gaze", params: { axes: "both", window: spec.params.window } }, 2000),
    cardCacheKey(context, "P02", spec, 1000),
  ]
  assert.equal(new Set([base, ...variants]).size, variants.length + 1)
})

test("participants keep their real codes in a stable natural order and search ignores accents", () => {
  assert.deepEqual(orderParticipants(["P10", "P2", "P01", "P2", ""]), ["P01", "P2", "P10"])
  assert.deepEqual(filterParticipants(["Pedro", "ÁLVARO", "P03"], "alva"), ["ÁLVARO"])
})

test("windows move through the stimulus onset, never through absolute times", () => {
  const source = { scenario: "A", time_basis: "scenario_onset", onset_s: 100, end_s: 160, gsr_origin_s: 101 }
  const other = { scenario: "A", time_basis: "scenario_onset", onset_s: 400, end_s: 470, gsr_origin_s: 405 }
  const transfer = transferWindow({ start: 110, end: 130 }, "recording", "A", source)
  assert.deepEqual(transfer, { kind: "relative", start: 10, end: 30 })
  assert.deepEqual(participantWindow(transfer, "recording", other), { start: 410, end: 430 })
  // GSR counts from its first valid sample: 10 s after onset is 5 s on P02's GSR axis.
  const gsr = transferWindow({ start: 9, end: 29 }, "gsr_relative", "A", source)
  assert.deepEqual(gsr, { kind: "relative", start: 10, end: 30 })
  assert.deepEqual(participantWindow(gsr, "gsr_relative", other), { start: 5, end: 25 })
  // A window entirely before the GSR axis of a participant has no data.
  assert.equal(participantWindow({ kind: "relative", start: 0, end: 3 }, "gsr_relative", other), null)
  const all = transferWindow({ start: 110, end: 130 }, "recording", "all", source)
  assert.equal(all.kind, "not_transferable")
  assert.deepEqual(participantWindow(all, "recording", other), { start: null, end: null })
})

test("axes align on the onset only for a concrete scenario", () => {
  const timing = { scenario: "A", time_basis: "scenario_onset", onset_s: 400, end_s: 470, gsr_origin_s: 405 }
  assert.deepEqual(axisOffsets("recording", "A", timing), { displayOffset: -400, recordingOffset: 0, aligned: true })
  assert.deepEqual(axisOffsets("gsr_relative", "A", timing), { displayOffset: 5, recordingOffset: 405, aligned: true })
  assert.deepEqual(axisOffsets("recording", "all", timing), { displayOffset: 0, recordingOffset: 0, aligned: false })
})

test("spatial restrictions are explained and scales state their coverage", () => {
  const heatmap = { kind: "heatmap", title: "", scenario: "all", sourceParticipant: null, origin: "individual", params: { minFixationDurationMs: 60, showAois: true } }
  assert.match(specRestriction(heatmap), /escenario específico/)
  assert.equal(specRestriction({ ...heatmap, scenario: "Imagen 1" }), null)
  assert.match(describeCommonScale(3, 12), /3 de 12/)
  assert.match(describeCommonScale(12, 12), /los 12/)
  assert.deepEqual(mergeDomains([{ min: 1, max: 2 }, null, { min: -1, max: 1.5 }]), { min: -1, max: 2 })
  assert.ok(estimateWeight({ time: [1, 2, 3], power: { a: [[1, 2], [3, 4]] } }) >= 7 * 8)
})

test("the common range is the pooled P1-P99, so one artefact cannot flatten every card", () => {
  const card = (values) => withQuantiles({ min: Math.min(...values), max: Math.max(...values) }, values)
  const steady = Array.from({ length: 200 }, (_, index) => 3 + (index % 10) * 0.1)
  const spiked = [...steady.slice(1), 40]
  const domain = commonDomain([card(steady), card(spiked), card(steady)])
  assert.ok(domain.min >= 3 && domain.min < 3.1, `min ${domain.min}`)
  assert.ok(domain.max > 3.8 && domain.max <= 3.9 + 1e-9, `max ${domain.max}`)
  // The union of extremes reaches the artefact.
  assert.equal(mergeDomains([card(steady), card(spiked)]).max, 40)
  // Every value weighs the same, so a card with more values counts for more.
  const low = Array.from({ length: 900 }, () => 1)
  const high = Array.from({ length: 100 }, () => 2)
  const weighted = commonDomain([card(low), card(high)])
  assert.ok(Math.abs(weighted.min - 1) < 1e-9 && Math.abs(weighted.max - 2) < 1e-9, JSON.stringify(weighted))
  // Ranges without a summary (histograms, colour scales) still merge.
  assert.deepEqual(commonDomain([{ min: 0, max: 5 }, { min: 0, max: 9 }]), { min: 0, max: 9 })
  assert.equal(commonDomain([null, undefined]), null)
  assert.match(describeCommonScale(12, 12, true), /del 1 % al 99 %/)
  assert.doesNotMatch(describeCommonScale(12, 12), /99 %/)
})

test("a card scrolled away keeps its running request, which a returning card reuses; deselection aborts it", async () => {
  const { loader, calls, fetcherFor } = controlledLoader({ concurrency: 1 })
  const release = loader.subscribe("P1", fetcherFor("P1"), () => {}, { group: "P1" })
  loader.subscribe("P2", fetcherFor("P2"), () => {}, { group: "P2" })
  await flush()
  release({ keepRunning: true })
  await flush()
  // Still holding the only slot: P2 waits instead of exceeding the limit.
  assert.equal(calls.length, 1)
  assert.equal(calls[0].signal.aborted, false)
  let back = null
  loader.subscribe("P1", fetcherFor("P1"), (state) => { back = state.status }, { group: "P1" })
  assert.equal(calls.length, 1)
  calls[0].resolve("P1 data")
  await flush()
  assert.equal(back, "success")
  assert.equal(calls[1].key, "P2")
  loader.abortGroup("P2")
  assert.equal(calls[1].signal.aborted, true)
  assert.equal(loader.stats().active, 1)
  calls[1].resolve("ignored")
  await flush()
  assert.equal(loader.stats().active, 0)
})

test("only fixation-derived charts expose a minimum fixation that changes their cache key", () => {
  const base = { title: "", scenario: "A", sourceParticipant: "P1", origin: "individual" }
  const scanpath = { ...base, kind: "scanpath", params: { minFixationDurationMs: 200, showAois: true } }
  const pupil = { ...base, kind: "pupil", params: { eyes: "both", window: { start: null, end: null } } }
  assert.equal(specMinFixationDuration(scanpath), 200)
  assert.equal(specMinFixationDuration(pupil), null)
  const changed = withMinFixationDuration(scanpath, 100)
  assert.deepEqual(changed.params, { minFixationDurationMs: 100, showAois: true })
  assert.equal(scanpath.params.minFixationDurationMs, 200)
  assert.equal(withMinFixationDuration(scanpath, 200), scanpath)
  assert.equal(withMinFixationDuration(pupil, 100), pupil)
  const context = { projectId: "p", generation: 1 }
  assert.notEqual(cardCacheKey(context, "P1", scanpath, 2000), cardCacheKey(context, "P1", changed, 2000))
})
