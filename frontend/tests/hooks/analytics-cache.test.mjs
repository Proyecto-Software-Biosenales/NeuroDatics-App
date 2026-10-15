import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import { createServer } from "node:http"
import { once } from "node:events"
import { chromium, expect } from "@playwright/test"
import { browserBundle } from "../browserBundle.mjs"

let browser
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })
const bundle = browserBundle(`
  import React from "react"
  import { createRoot } from "react-dom/client"
  import { flushSync } from "react-dom"
  import { useStimulusImage } from "@/features/analytics/participantComparison/cardHooks"
  import { useEegTimeseries, useAoiMetrics, useFixationSensitivity } from "@/features/analytics/hooks/useAnalyticsData"
  import { useAnalyticsProjectContext } from "@/features/analytics/hooks/useAnalyticsContext"
  import { writeStoredAuthSession, clearStoredAuthSession } from "@/lib/auth/sessionStore"
  import { revalidateAnalyticsProject } from "@/features/analytics/analyticsCache"
  import { ProjectsApi } from "@/features/projects/api/projectsApi"
  const root = createRoot(document.getElementById("root"))
  const state = { current: {}, images: {}, aois: {}, sensitivity: {}, revoked: [], projects: ProjectsApi, logout: clearStoredAuthSession }
  state.login = (id) => writeStoredAuthSession({ user: { id }, session: { accessToken: id, expiresAt: "2100-01-01" } })
  state.login("user-a")
  state.revalidate = (project) => revalidateAnalyticsProject(project, (signal) => ProjectsApi.get(project, signal))
  const revoke = URL.revokeObjectURL.bind(URL)
  URL.revokeObjectURL = (url) => { state.revoked.push(url); revoke(url) }
  function Consumer({ project, index, images, aois, sensitivity }) {
    const entry = useEegTimeseries(project, "P1")
    const image = useStimulusImage(project ?? "none", project && images ? "file" : null)
    const aoi = useAoiMetrics(aois ? project : null, "P1", "scene")
    const thresholds = useFixationSensitivity(sensitivity ? project : null, "P1", "scene")
    React.useLayoutEffect(() => { state.sensitivity[index] = thresholds }, [thresholds, index])
    React.useLayoutEffect(() => { state.aois[index] = aoi }, [aoi, index])
    React.useLayoutEffect(() => { state.images[index] = image }, [image, index])
    React.useLayoutEffect(() => { state.current[index] = entry }, [entry, index])
    return null
  }
  function Scope({ project, count, images, aois, sensitivity }) {
    useAnalyticsProjectContext(project)
    return Array.from({ length: count }, (_, index) => <Consumer key={index} project={project} index={index} images={images} aois={aois} sensitivity={sensitivity}/>)
  }
  state.render = (project, count = 1, images = false, aois = false, sensitivity = false) => flushSync(() => root.render(<Scope project={project} count={count} images={images} aois={aois} sensitivity={sensitivity}/>))
  window.cacheTest = state
`)

async function fixture(t) {
  const requests = [], metadata = [], state = { generation: 1, aoi: 1, fail: false, legacy: false, delay: 0 }
  const server = createServer((req, res) => {
    if (!req.url.startsWith("/api/")) { res.setHeader("Content-Type", "text/html"); res.end('<div id="root"></div>'); return }
    if (req.method === "PUT") { res.setHeader("Content-Type", "application/json"); res.end("{}"); return }
    res.setHeader("Content-Type", "application/json")
    if (req.url.endsWith("/image")) {
      const entry = { url: req.url, closed: false }; requests.push(entry)
      res.on("close", () => { entry.closed = true })
      res.setHeader("Content-Type", "image/png"); res.end("image-generation-" + state.generation); return
    }
    if (!req.url.includes("/analytics/")) {
      metadata.push(req.url)
      if (state.fail) { res.statusCode = 503; res.end('{"detail":"offline"}'); return }
      if (state.legacy) { res.end(JSON.stringify({ ingestion_generation: state.generation })); return }
      res.end(JSON.stringify({ ingestion_generation: state.generation, scenaries: [{ id: "scene", name: "scene", width: 100, height: 100, aois: [{ id: "aoi", name: "area", shape_type: "rectangle", shape: { x: state.aoi, y: 0, width: 10, height: 10 } }] }] })); return
    }
    const entry = { url: req.url, closed: false }; requests.push(entry)
    res.on("close", () => { entry.closed = true })
    if (req.url.includes("/analytics/fixations/sensitivity")) {
      setTimeout(() => { if (!res.destroyed) res.end(JSON.stringify({ available_min_fixation_durations_ms: [100, 200] })) }, state.delay); return
    }
    if (req.url.includes("/analytics/aois")) { res.end(JSON.stringify({ revision: state.aoi })); return }
    const generation = state.generation
    setTimeout(() => { if (!res.destroyed) res.end(JSON.stringify({ channels: ["f3"], time: [generation], raw: { f3: [generation] }, smooth: { f3: [generation] } })) }, state.delay)
  })
  server.listen(0, "127.0.0.1"); await once(server, "listening")
  const page = await browser.newPage()
  t.after(async () => { await page.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.addScriptTag({ content: bundle })
  return { page, requests, metadata, state }
}
const render = (page, project, count = 1) => page.evaluate(({ project, count }) => window.cacheTest.render(project, count), { project, count })
const ready = (page, generation) => page.waitForFunction((g) => window.cacheTest.current[0]?.data?.time[0] === g && !window.cacheTest.current[0]?.loading, generation)

test("real hooks reuse A→B→A and revalidate focus, changed generation and failed context", async (t) => {
  const { page, requests, metadata, state } = await fixture(t)
  await render(page, "a"); await ready(page, 1)
  await render(page, "b"); await ready(page, 1)
  await render(page, "a"); await ready(page, 1)
  assert.equal(requests.length, 2); assert.equal(metadata.length, 3)
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await expect.poll(() => metadata.length).toBe(4); await ready(page, 1)
  assert.equal(requests.length, 2)
  state.generation = 2
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await ready(page, 2); assert.equal(requests.length, 3)
  state.fail = true
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await expect.poll(() => requests.length).toBe(4); await ready(page, 2)
  await render(page, null); await render(page, "a"); await ready(page, 2)
  assert.equal(requests.length, 5, "failed validation cannot retain the previous generation")
})

test("real sibling hooks share request, cancel separately, invalidate AOIs and isolate sessions", async (t) => {
  const { page, requests, state } = await fixture(t)
  state.delay = 200
  await render(page, "a", 2); await expect.poll(() => requests.length).toBe(1)
  await render(page, "a", 1); assert.equal(requests[0].closed, false)
  await ready(page, 1); assert.equal(requests.length, 1)
  await page.evaluate(() => window.cacheTest.projects.setAois("a", []))
  await expect.poll(() => requests.length).toBe(2); await ready(page, 1)
  await page.evaluate(() => window.cacheTest.login("user-b"))
  await expect.poll(() => requests.length).toBe(3); await ready(page, 1)
  // Start a new selection, then remove every consumer while the network is pending.
  await render(page, "b", 2); await expect.poll(() => requests.length).toBe(4)
  await render(page, null, 0)
  await expect.poll(() => requests[3].closed).toBe(true)
  await page.evaluate(() => window.cacheTest.logout())
})


test("scoped images share one download, bypass the legacy blob cache and revoke consumer URLs", async (t) => {
  const { page, requests, state } = await fixture(t)
  await page.evaluate(() => window.cacheTest.render("a", 2, true))
  await page.waitForFunction(() => window.cacheTest.images[0]?.url && window.cacheTest.images[1]?.url)
  assert.equal(requests.filter((r) => r.url.endsWith("/image")).length, 1)
  const urls = await page.evaluate(() => [window.cacheTest.images[0].url, window.cacheTest.images[1].url])
  assert.notEqual(urls[0], urls[1], "each subscriber owns its object URL")
  await page.evaluate(() => window.cacheTest.render(null, 0, false))
  assert.deepEqual(await page.evaluate(() => window.cacheTest.revoked.sort()), urls.sort())
  await page.evaluate(() => window.cacheTest.render("a", 2, true))
  await page.waitForFunction(() => window.cacheTest.images[0]?.url && window.cacheTest.images[1]?.url)
  assert.equal(requests.filter((r) => r.url.endsWith("/image")).length, 1)
  state.generation = 2
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await ready(page, 2)
  await expect.poll(() => requests.filter((r) => r.url.endsWith("/image")).length).toBe(2)
  await page.waitForFunction(() => window.cacheTest.images[0]?.url && !window.cacheTest.images[0].loading)
  assert.equal(await page.evaluate(async () => (await fetch(window.cacheTest.images[0].url)).text()), "image-generation-2")
})

test("focus detects remote AOI shape edits with unchanged ingestion and preserves signal cache", async (t) => {
  const { page, requests, metadata, state } = await fixture(t)
  await page.evaluate(() => window.cacheTest.render("a", 1, false, true))
  await ready(page, 1)
  await page.waitForFunction(() => window.cacheTest.aois[0]?.data?.revision === 1)
  const signals = () => requests.filter((entry) => !entry.url.includes("/analytics/aois")).length
  const aois = () => requests.filter((entry) => entry.url.includes("/analytics/aois")).length
  assert.equal(signals(), 1); assert.equal(aois(), 1)
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await expect.poll(() => metadata.length).toBe(2)
  await ready(page, 1)
  assert.equal(signals(), 1); assert.equal(aois(), 1, "unchanged shape retains current AOIs")
  state.aoi = 2
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await page.waitForFunction(() => window.cacheTest.aois[0]?.data?.revision === 2)
  assert.equal(signals(), 1, "AOI revision must not invalidate EEG")
  assert.equal(aois(), 2)
  await page.evaluate(() => window.cacheTest.render(null, 0))
  await page.evaluate(() => window.cacheTest.render("a", 1, false, true))
  await ready(page, 1)
  await page.waitForFunction(() => window.cacheTest.aois[0]?.data?.revision === 2)
  assert.equal(signals(), 1); assert.equal(aois(), 2, "reopen validates then retains the updated shape")
})


test("legacy spatial context preserves live sensitivity across dialog revalidation, focus and reopen without retaining it", async (t) => {
  const { page, requests, metadata, state } = await fixture(t)
  state.legacy = true
  state.delay = 150
  const sensitivityRequests = () => requests.filter((entry) => entry.url.includes("/fixations/sensitivity")).length
  const readySensitivity = () => page.waitForFunction(() => window.cacheTest.sensitivity[0]?.data?.available_min_fixation_durations_ms?.includes(200) && !window.cacheTest.sensitivity[0]?.loading && !window.cacheTest.sensitivity[0]?.error)
  await page.evaluate(() => window.cacheTest.render("a", 1, false, false, true))
  await expect.poll(sensitivityRequests).toBe(1)
  // The dialog validates after its sensitivity hook subscribes.
  await page.evaluate(() => window.cacheTest.revalidate("a"))
  await readySensitivity()
  assert.equal(sensitivityRequests(), 1)
  await page.evaluate(() => window.cacheTest.render(null, 0))
  await page.evaluate(() => window.cacheTest.render("a", 1, false, false, true))
  await expect.poll(sensitivityRequests).toBe(2)
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await expect.poll(() => metadata.length).toBe(4)
  await readySensitivity()
  assert.equal(sensitivityRequests(), 2, "reopen refetches unknown spatial results; focus does not cancel their live request")
  await ready(page, 1)
  assert.equal(requests.filter((entry) => entry.url.includes("/timeseries/eeg")).length, 1, "known ingestion still retains EEG")
})
