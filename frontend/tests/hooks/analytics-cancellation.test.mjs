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
  import * as hooks from "@/features/analytics/hooks/useAnalyticsData"
  import { AnalyticsApi } from "@/features/analytics/api/analyticsApi"
  const root = createRoot(document.getElementById("root"))
  const state = { current: null, api: AnalyticsApi }
  function Probe({ name, args }) {
    const useHook = hooks[name]
    state.current = useHook(...args)
    return null
  }
  state.render = (name, args, strict = false) => flushSync(() => root.render(
    strict ? <React.StrictMode><Probe name={name} args={args}/></React.StrictMode> : <Probe name={name} args={args}/>
  ))
  state.unmount = () => flushSync(() => root.unmount())
  window.analyticsNetwork = state
`)

async function fixture(t) {
  const requests = []
  const server = createServer((req, res) => {
    if (!req.url.startsWith("/api/")) {
      res.setHeader("Content-Type", "text/html")
      res.end('<div id="root"></div>')
      return
    }
    const request = { url: req.url, res, closed: false }
    res.on("close", () => { request.closed = true })
    requests.push(request)
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const page = await browser.newPage()
  t.after(async () => {
    await page.close()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.evaluate(() => localStorage.setItem("neurodatics-auth-session", JSON.stringify({
    user: { id: "test" }, session: { accessToken: "test", expiresAt: "2100-01-01" },
  })))
  await page.addScriptTag({ content: bundle })
  return { page, requests }
}

const render = (page, name, args, strict = false) => page.evaluate(
  ({ name, args, strict }) => window.analyticsNetwork.render(name, args, strict), { name, args, strict }
)

for (const [hook, args, changed, endpoint] of [
  ["usePupilTimeseries", ["project", "P01"], ["project", "P02"], "/timeseries/pupil"],
  ["useGsrStatistics", ["project", "P01", "all"], ["project", "P01", "scene"], "/statistics/gsr"],
  ["useEegTimeseries", ["project", "P01", "all", ["F3"]], ["project", "P01", "all", ["F4"]], "/timeseries/eeg"],
]) {
  test(`${hook} aborts the browser request on selection change and unmount`, async (t) => {
    const { page, requests } = await fixture(t)
    await render(page, hook, args)
    await expect.poll(() => requests.length).toBe(1)
    assert.ok(requests[0].url.includes(endpoint))
    await render(page, hook, changed)
    await expect.poll(() => requests[0].closed).toBe(true)
    await expect.poll(() => requests.length).toBe(2)
    assert.deepEqual(await page.evaluate(() => window.analyticsNetwork.current), { data: null, loading: true, error: null })
    await render(page, hook, changed)
    assert.equal(requests.length, 2, "equal channel arrays must not restart the request")
    await page.evaluate(() => window.analyticsNetwork.unmount())
    await expect.poll(() => requests[1].closed).toBe(true)
  })
}

test("gaze scrubbing and clear cancel the real pending fetch", async (t) => {
  const { page, requests } = await fixture(t)
  await render(page, "useGazeAt", ["project", "P01"])
  await page.evaluate(() => { void window.analyticsNetwork.current.fetchGaze(1) })
  await expect.poll(() => requests.length).toBe(1)
  await page.evaluate(() => { void window.analyticsNetwork.current.fetchGaze(2) })
  await expect.poll(() => requests[0].closed).toBe(true)
  await expect.poll(() => requests.length).toBe(2)
  await page.evaluate(() => window.analyticsNetwork.current.clear())
  await expect.poll(() => requests[1].closed).toBe(true)
  assert.equal(await page.evaluate(() => window.analyticsNetwork.current.loading), false)
})

test("cancelling one heatmap fetch leaves an identical sibling fetch usable", async (t) => {
  const { page, requests } = await fixture(t)
  await page.evaluate(() => {
    window.firstHeatmap = new AbortController()
    window.secondHeatmap = new AbortController()
    const api = window.analyticsNetwork.api
    window.firstResult = api.getHeatmapOverlay("project", "P01", "scene", "v1", 1, 100, window.firstHeatmap.signal).catch(() => null)
    window.secondResult = api.getHeatmapOverlay("project", "P01", "scene", "v1", 1, 100, window.secondHeatmap.signal)
  })
  await expect.poll(() => requests.length).toBeGreaterThanOrEqual(1)
  await page.evaluate(() => window.firstHeatmap.abort())
  await expect.poll(() => requests[0].closed).toBe(true)
  await expect.poll(() => requests.length).toBe(2)
  assert.equal(requests[0].url, requests[1].url)
  assert.equal(requests[1].closed, false)
  requests[1].res.setHeader("Content-Type", "image/png")
  requests[1].res.end("surviving image")
  assert.equal(await page.evaluate(async () => (await window.secondResult).blob.text()), "surviving image")
  assert.equal(await page.evaluate(async () => (await window.analyticsNetwork.api.getHeatmapOverlay("project", "P01", "scene", "v1", 1, 100, new AbortController().signal)).blob.text()), "surviving image")
  assert.equal(requests.length, 2, "completed blobs still use the TTL cache")
})

test("StrictMode heatmap cleanup does not poison its replacement request", async (t) => {
  const { page, requests } = await fixture(t)
  await render(page, "useHeatmapOverlay", ["project", "P01", "scene", "v1", 1], true)
  await expect.poll(() => requests.filter((request) => !request.closed).length).toBe(1)
  // StrictMode may abort before the first fetch reaches the server. Answer
  // every request that does arrive, including a replacement after that abort.
  const answer = () => {
    for (const request of requests) {
      if (!request.closed && !request.res.writableEnded) {
        request.res.setHeader("Content-Type", "image/png")
        request.res.end("image")
      }
    }
  }
  const timer = setInterval(answer, 10)
  t.after(() => clearInterval(timer))
  answer()
  await page.waitForFunction(() => window.analyticsNetwork.current.overlayUrl != null)
  assert.equal(await page.evaluate(() => window.analyticsNetwork.current.error), null)
})
