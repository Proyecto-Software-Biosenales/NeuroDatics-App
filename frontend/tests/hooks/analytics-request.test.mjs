import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { chromium } from "@playwright/test"
import ts from "typescript"

const require = createRequire(import.meta.url)
// Exercise the real React hooks without a dev server or extra DOM dependencies.
// Only the API is controlled; React, ReactDOM and the browser run unchanged.
const frontend = path.resolve(import.meta.dirname, "../..")
const source = (relative) => readFileSync(path.join(frontend, relative), "utf8")
const cjs = (packageName, file) => readFileSync(path.join(path.dirname(require.resolve(`${packageName}/package.json`)), "cjs", file), "utf8")
const compile = (relative) => ts.transpileModule(source(relative), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const modules = {
  react: cjs("react", "react.development.js"),
  "react-dom": cjs("react-dom", "react-dom.development.js"),
  "react-dom/client": cjs("react-dom", "react-dom-client.development.js"),
  scheduler: cjs("scheduler", "scheduler.development.js"),
  "../types": compile("features/analytics/types.ts"),
  hooks: compile("features/analytics/hooks/useAnalyticsData.ts"),
}
let browser
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })

async function fixture(t, hook, args) {
  const page = await browser.newPage()
  t.after(() => page.close())
  await page.setContent('<div id="root"></div>')
  await page.evaluate(({ modules, hook, args }) => {
    const cache = {}
    const requests = []
    const api = new Proxy({}, { get: (_, method) => (...args) => new Promise((resolve, reject) => requests.push({ method, args, resolve, reject })) })
    cache["../api/analyticsApi"] = { exports: { AnalyticsApi: api } }
    const require = (id) => {
      if (cache[id]) return cache[id].exports
      if (!modules[id]) throw new Error(`Missing test module: ${id}`)
      const entry = { exports: {} }
      cache[id] = entry
      new Function("require", "module", "exports", "process", modules[id])(require, entry, entry.exports, { env: { NODE_ENV: "development" } })
      return entry.exports
    }
    const React = require("react")
    const { flushSync } = require("react-dom")
    const root = require("react-dom/client").createRoot(document.getElementById("root"))
    const hooksModuleId = ["hook", "s"].join("")
    const useHook = require(hooksModuleId)[hook]
    const state = { current: null, requests, revokedUrls: [] }
    const revokeObjectURL = URL.revokeObjectURL.bind(URL)
    URL.revokeObjectURL = (url) => {
      state.revokedUrls.push(url)
      revokeObjectURL(url)
    }
    function Probe({ args }) {
      state.current = useHook(...args)
      return null
    }
    state.render = (args) => flushSync(() => root.render(React.createElement(Probe, { args })))
    state.render(args)
    window.hookTest = state
  }, { modules, hook, args })
  return page
}

const snapshot = (page) => page.evaluate(() => window.hookTest.current)
const render = (page, args) => page.evaluate((args) => window.hookTest.render(args), args)
const resolve = (page, index, value) => page.evaluate(({ index, value }) => window.hookTest.requests[index].resolve(value), { index, value })
async function settle(page, expected) {
  await page.waitForFunction((expected) => JSON.stringify(window.hookTest.current) === JSON.stringify(expected), expected)
}

test("participant options disappear immediately when their project is cleared", async (t) => {
  const page = await fixture(t, "useAnalyticsParticipants", ["project-a"])
  const participants = [{ participant_code: "P01", user_index: 1 }]
  await resolve(page, 0, participants)
  await settle(page, { participants, loading: false })
  await render(page, [null])
  assert.deepEqual(await snapshot(page), { participants: [], loading: false })
})

test("a new participant never displays the previous participant's series", async (t) => {
  const page = await fixture(t, "usePupilTimeseries", ["project-a", "P01"])
  const data = { time: [1], left: [2], right: [3], average: [2.5], smooth_left: [2], smooth_right: [3] }
  await resolve(page, 0, data)
  await settle(page, { data, loading: false, error: null })
  await render(page, ["project-a", "P02"])
  assert.deepEqual(await snapshot(page), { data: null, loading: true, error: null })
})

test("clearing a pending selection ends loading and ignores its late response", async (t) => {
  const page = await fixture(t, "usePupilTimeseries", ["project-a", "P01"])
  await render(page, ["project-a", null])
  assert.deepEqual(await snapshot(page), { data: null, loading: false, error: null })
  await resolve(page, 0, { time: [1] })
  assert.deepEqual(await snapshot(page), { data: null, loading: false, error: null })
  await render(page, ["project-a", "P01"])
  assert.deepEqual(await snapshot(page), { data: null, loading: true, error: null })
})

test("late responses cannot overwrite newer results or restart unchanged requests", async (t) => {
  const page = await fixture(t, "useComparisonCharts", ["project-a", "P01", "all", ["pupil"]])
  await render(page, ["project-a", "P02", "all", ["pupil"]])
  const data = { participant_code: "P02", charts: [] }
  await resolve(page, 1, data)
  await settle(page, { data, loading: false, error: null })
  await resolve(page, 0, { participant_code: "P01", charts: [] })
  await render(page, ["project-a", "P02", "all", ["pupil"]])
  assert.deepEqual(await snapshot(page), { data, loading: false, error: null })
  assert.equal(await page.evaluate(() => window.hookTest.requests.length), 2)
  await render(page, ["project-a", "P02", "all", []])
  assert.deepEqual(await snapshot(page), { data: null, loading: false, error: null })
})

test("reselecting a completed query starts clean and clears its previous error", async (t) => {
  const page = await fixture(t, "usePupilTimeseries", ["project-a", "P01"])
  await page.evaluate(() => window.hookTest.requests[0].reject(new Error("Network unavailable")))
  await settle(page, { data: null, loading: false, error: "Network unavailable" })
  await render(page, [null, null])
  assert.deepEqual(await snapshot(page), { data: null, loading: false, error: null })
  await render(page, ["project-a", "P01"])
  assert.deepEqual(await snapshot(page), { data: null, loading: true, error: null })
  await resolve(page, 1, { time: [7] })
  await settle(page, { data: { time: [7] }, loading: false, error: null })
})

test("heatmaps wait for a generation, release old blobs and ignore cancelled blobs", async (t) => {
  const page = await fixture(t, "useHeatmapOverlay", ["project-a", "P01", "scene", "screen-stimulus-v1", null])
  assert.equal(await page.evaluate(() => window.hookTest.requests.length), 0)
  const empty = { overlayUrl: null, coordinateTransform: null, loading: false, error: null }
  assert.deepEqual(await snapshot(page), empty)
  await render(page, ["project-a", "P01", "scene", "screen-stimulus-v1", 1])
  await page.evaluate(() => window.hookTest.requests[0].resolve({ blob: new Blob(["image"]), headers: new Headers({ "X-Stimulus-Transform-Version": "screen-stimulus-v1" }) }))
  await page.waitForFunction(() => window.hookTest.current.overlayUrl !== null)
  const first = await snapshot(page)
  assert.equal(first.coordinateTransform.contractVersion, "screen-stimulus-v1")
  await render(page, ["project-a", "P01", "scene", "screen-stimulus-v1", 2])
  assert.deepEqual(await snapshot(page), { ...empty, loading: true })
  assert.deepEqual(await page.evaluate(() => window.hookTest.revokedUrls), [first.overlayUrl])
  await render(page, ["project-a", "P01", "all", "screen-stimulus-v1", 2])
  await page.evaluate(() => window.hookTest.requests[1].resolve({ blob: new Blob(["late"]), headers: new Headers() }))
  assert.deepEqual(await snapshot(page), empty)
})
