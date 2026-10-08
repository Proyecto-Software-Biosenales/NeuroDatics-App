import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { chromium } from "@playwright/test"
import ts from "typescript"

// Real React hook + real loader in Chromium; only the fetcher is controlled.
const require = createRequire(import.meta.url)
const frontend = path.resolve(import.meta.dirname, "../..")
const source = (relative) => readFileSync(path.join(frontend, relative), "utf8")
const cjs = (packageName, file) => readFileSync(path.join(path.dirname(require.resolve(`${packageName}/package.json`)), "cjs", file), "utf8")
const compile = (relative) => ts.transpileModule(source(relative), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const modules = {
  react: cjs("react", "react.development.js"),
  "react-dom": cjs("react-dom", "react-dom.development.js"),
  "react-dom/client": cjs("react-dom", "react-dom-client.development.js"),
  scheduler: cjs("scheduler", "scheduler.development.js"),
  "./comparisonLoader": compile("features/analytics/participantComparison/comparisonLoader.ts"),
  "../analyticsCache": compile("features/analytics/analyticsCache.ts"),
  "./participantComparison/comparisonLoader": compile("features/analytics/participantComparison/comparisonLoader.ts"),
  "../hooks/useAnalyticsContext": 'exports.useAnalyticsRevision = () => require("react").useSyncExternalStore(require("../analyticsCache").subscribeAnalyticsContext, require("../analyticsCache").analyticsContextVersion, () => 0)',
  cardHooks: compile("features/analytics/participantComparison/cardHooks.ts"),
}
let browser
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })

async function fixture(t, key, scoped = false) {
  const page = await browser.newPage()
  t.after(() => page.close())
  await page.setContent('<div id="root"></div>')
  await page.evaluate(async ({ modules, key, scoped }) => {
    const cache = {
      "@/lib/api/apiFetch": { exports: { apiFetchBlob: () => Promise.reject(new Error("unused")) } },
      "@/features/projects/api/stimulusUrls": { exports: { getStimulusImageUrl: () => "" } },
    }
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
    const { useLoaderEntry } = require("cardHooks")
    const calls = []
    const fetcher = (signal) => new Promise((resolve, reject) => calls.push({ resolve, reject, signal }))
    const api = require("../analyticsCache")
    if (scoped) {
      api.setAnalyticsSession("user", "session", "2100-01-01")
      await api.revalidateAnalyticsProject("project", async () => ({ ingestion_generation: 1 }))
    }
    const probeState = { current: null, calls, api }
    function Probe({ cardKey }) {
      React.useSyncExternalStore(api.subscribeAnalyticsContext, api.analyticsContextVersion, () => 0)
      const key = scoped && cardKey ? api.analyticsKey("project", "card", [cardKey]) : cardKey
      const entry = useLoaderEntry(key, fetcher, 0, cardKey ?? "none", scoped ? "project" : undefined)
      React.useLayoutEffect(() => { probeState.current = entry }, [entry])
      return null
    }
    probeState.render = (cardKey) => flushSync(() => root.render(cardKey === undefined ? null : React.createElement(Probe, { cardKey })))
    probeState.render(key)
    window.hookTest = probeState
  }, { modules, key, scoped })
  return page
}

const snapshot = (page) => page.evaluate(() => window.hookTest.current)
const render = (page, key) => page.evaluate((key) => window.hookTest.render(key), key)
const resolve = (page, index, value) => page.evaluate(({ index, value }) => window.hookTest.calls[index].resolve(value), { index, value })
const callCount = (page) => page.evaluate(() => window.hookTest.calls.length)
async function settle(page, expected) {
  await page.waitForFunction((expected) => JSON.stringify(window.hookTest.current) === JSON.stringify(expected), expected)
}

test("a late answer for a previous card never replaces the current card's data", async (t) => {
  const page = await fixture(t, "P01|pupil")
  await page.waitForFunction(() => window.hookTest.calls.length === 1)
  await render(page, "P02|pupil")
  await page.waitForFunction(() => window.hookTest.calls.length === 2)
  await resolve(page, 1, { participant: "P02" })
  await settle(page, { status: "success", data: { participant: "P02" }, error: null })
  // P01 answers last; the card now shows P02 and must keep showing it.
  await resolve(page, 0, { participant: "P01" })
  await new Promise((done) => setTimeout(done, 50))
  assert.deepEqual(await snapshot(page), { status: "success", data: { participant: "P02" }, error: null })
  // P01's request was kept running and finished into the cache: returning is free.
  await render(page, "P01|pupil")
  assert.deepEqual(await snapshot(page), { status: "success", data: { participant: "P01" }, error: null })
  assert.equal(await callCount(page), 2)
})

test("a remounted card attaches to its in-flight request instead of repeating it", async (t) => {
  const page = await fixture(t, "P03|gsr")
  await page.waitForFunction(() => window.hookTest.calls.length === 1)
  await render(page, undefined)
  await render(page, "P03|gsr")
  await new Promise((done) => setTimeout(done, 50))
  assert.equal(await callCount(page), 1)
  assert.deepEqual(await snapshot(page), { status: "loading", data: null, error: null })
  await resolve(page, 0, { participant: "P03" })
  await settle(page, { status: "success", data: { participant: "P03" }, error: null })
})


test("a scoped remount waits for fresh metadata before reusing its card cache", async (t) => {
  const page = await fixture(t, "P01", true)
  await page.waitForFunction(() => window.hookTest.calls.length === 1)
  await resolve(page, 0, { participant: "P01" })
  await settle(page, { status: "success", data: { participant: "P01" }, error: null })
  await render(page, undefined)
  await page.evaluate(() => {
    window.metadata = new Promise((resolve) => { window.resolveMetadata = resolve })
    window.validation = window.hookTest.api.revalidateAnalyticsProject("project", () => window.metadata)
  })
  await render(page, "P01")
  assert.equal(await callCount(page), 1)
  assert.equal((await snapshot(page)).status, "queued")
  await page.evaluate(() => window.resolveMetadata({ ingestion_generation: 1 }))
  await settle(page, { status: "success", data: { participant: "P01" }, error: null })
  assert.equal(await callCount(page), 1, "metadata was fresh before cache hit; no payload/model job repeated")
  await render(page, undefined)
  await page.evaluate(() => {
    window.validation = window.hookTest.api.revalidateAnalyticsProject("project", async () => ({ ingestion_generation: 2 }))
  })
  await page.evaluate(() => window.validation)
  await render(page, "P01")
  await page.waitForFunction(() => window.hookTest.calls.length === 2)
  await resolve(page, 1, { participant: "P01-new" })
  await settle(page, { status: "success", data: { participant: "P01-new" }, error: null })
})
