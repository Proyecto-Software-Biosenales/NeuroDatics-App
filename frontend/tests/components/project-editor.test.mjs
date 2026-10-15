import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import { chromium, expect } from "@playwright/test"
import { browserBundle } from "../browserBundle.mjs"

const bundle = browserBundle(`
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { flushSync } from 'react-dom';
  import { ProjectEditor } from '@/features/projects/edit/ProjectEditor';
  import { ProjectsApi } from '@/features/projects/api/projectsApi';
  import { PreExperimentApi } from '@/features/projects/pre-experiment/api';
  import { emptyConfig } from '@/features/projects/pre-experiment/types';
  import { ApiError } from '@/lib/api/apiFetch';
  const requests = [], calls = [];
  const envelope = { revision: 1, config: emptyConfig(), responses: [] };
  ProjectsApi.get = (id) => new Promise((resolve, reject) => requests.push({ id, resolve, reject }));
  ProjectsApi.update = async (id, data) => { if (window.editorTest.updateFails) throw new ApiError('Ya existe un proyecto con ese nombre', 409, null); calls.push(['update', id, data]); return data; };
  ProjectsApi.setSensors = async (id, sensors) => { calls.push(['sensors', id, sensors]); };
  ProjectsApi.setParticipants = async (id, participants) => { calls.push(['participants', id, participants]); };
  ProjectsApi.setAois = async (id, aois) => { calls.push(['aois', id, aois]); };
  ProjectsApi.finalize = async (id) => { calls.push(['finalize', id]); };
  PreExperimentApi.get = async () => structuredClone(envelope);
  PreExperimentApi.save = async (id, revision, config) => { calls.push(['planning', id, revision]); return { ...envelope, revision: revision + 1, config }; };
  const root = createRoot(document.getElementById('root'));
  let props = { projectId: 'a' };
  const render = (next) => {
    props = { ...props, ...next };
    flushSync(() => root.render(<ProjectEditor key={props.projectId} projectId={props.projectId} />));
  };
  window.editorTest = { requests, calls, render };
  render({});
`)

let browser
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })

async function fixture(t) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  t.after(async () => {
    await page.close()
    assert.deepEqual(errors, [])
  })
  await page.setContent('<html><body><main style="max-width:900px;margin:24px auto"><div id="root"></div></main></body></html>')
  await page.addScriptTag({ content: bundle })
  await expect(page.getByText("Cargando el proyecto…")).toBeVisible()
  await page.waitForFunction(() => window.editorTest.requests.length === 1)
  return page
}

const project = (id, extra = {}) => ({
  id, name: `Study ${id}`, description: `Description ${id}`, status: "active", created_at: "2026-01-02T12:00:00Z",
  sensors: [{ sensor_type: "EEG" }],
  participants: [{ participant_code: "P01", age: 30, sex: "male" }],
  scenaries: [], files: [],
  ...extra,
})
const respond = (page, index, detail) => page.evaluate(({ index, detail }) => {
  window.editorTest.requests[index].resolve(detail)
}, { index, detail })
const calls = (page) => page.evaluate(() => window.editorTest.calls)
const section = (page, name) => page.getByRole("tab", { name: new RegExp(`^${name}`) }).click()
const save = (page) => page.getByRole("button", { name: "Guardar cambios", exact: true })

test("a project with its folder shows devices, areas of interest and the folder next to the preparation", async (t) => {
  const page = await fixture(t)
  await respond(page, 0, project("a"))
  await expect(page.getByRole("heading", { name: "Study a", exact: true })).toBeVisible()
  for (const name of ["Proyecto", "Participantes", "Cuestionarios", "Pantalla", "Dispositivos", "Áreas de interés", "Notas", "Carpeta"])
    await expect(page.getByRole("tab", { name: new RegExp(`^${name}`) })).toBeVisible()
  await expect(page.locator("p.app-page-description")).toHaveText("Description a")
})

test("a pre-experiment has no devices, areas of interest or folder tabs", async (t) => {
  const page = await fixture(t)
  await respond(page, 0, project("a", { is_pre_experiment: true, sensors: [], participants: [] }))
  await expect(page.getByRole("tab", { name: /^Notas/ })).toBeVisible()
  for (const name of ["Dispositivos", "Áreas de interés", "Carpeta"])
    await expect(page.getByRole("tab", { name: new RegExp(`^${name}`) })).toHaveCount(0)
})

test("saving sends only what changed, each part once", async (t) => {
  const page = await fixture(t)
  await respond(page, 0, project("a", { name: "Original-9ac9ef2b-20260324225557" }))
  await expect(page.getByRole("heading", { name: "Original", exact: true })).toBeVisible()
  await expect(save(page)).toBeDisabled()
  await page.getByRole("textbox", { name: "Nombre del proyecto *" }).fill("Edited study")
  await page.getByRole("textbox", { name: "Descripción" }).fill("Updated description")
  await section(page, "Dispositivos")
  await page.getByRole("checkbox", { name: "Sensor galvánico" }).check()
  await expect(page.getByText("Hay cambios sin guardar")).toBeVisible()
  // Saving reloads the project, so answer that second read.
  await save(page).click()
  await page.waitForFunction(() => window.editorTest.requests.length === 2)
  await respond(page, 1, project("a", { name: "Edited study" }))
  await expect(page.getByText("Hay cambios sin guardar")).toHaveCount(0)
  assert.deepEqual(await calls(page), [
    ["update", "a", { name: "Edited study", description: "Updated description" }],
    ["sensors", "a", ["EEG", "GSR"]],
  ])
})

test("saving is refused while a section has something to fix and sends nothing", async (t) => {
  const page = await fixture(t)
  await respond(page, 0, project("a"))
  await section(page, "Dispositivos")
  await page.getByRole("checkbox", { name: "Electroencefalógrafo" }).uncheck()
  await save(page).click()
  await expect(page.getByRole("alert")).toHaveText("Selecciona al menos un dispositivo.")
  assert.deepEqual(await calls(page), [])
})

test("discarding restores what was saved", async (t) => {
  const page = await fixture(t)
  await respond(page, 0, project("a"))
  await page.getByRole("textbox", { name: "Nombre del proyecto *" }).fill("Cambio")
  await page.getByRole("button", { name: "Descartar cambios" }).click()
  await page.waitForFunction(() => window.editorTest.requests.length === 2)
  await respond(page, 1, project("a"))
  await expect(page.getByRole("textbox", { name: "Nombre del proyecto *" })).toHaveValue("Study a")
})

test("a late answer to an earlier load cannot replace the project read after it", async (t) => {
  const page = await fixture(t)
  await respond(page, 0, project("a"))
  await page.getByRole("textbox", { name: "Nombre del proyecto *" }).fill("Cambio")
  await page.getByRole("button", { name: "Descartar cambios" }).click()
  await page.waitForFunction(() => window.editorTest.requests.length === 2)
  await page.getByRole("button", { name: "Descartar cambios" }).click()
  await page.waitForFunction(() => window.editorTest.requests.length === 3)
  await respond(page, 2, project("a", { name: "Current" }))
  await expect(page.getByRole("heading", { name: "Current", level: 1 })).toBeVisible()
  await respond(page, 1, project("a", { name: "Outdated" }))
  await expect(page.getByRole("heading", { name: "Current", level: 1 })).toBeVisible()
})

test("a repeated name is reported as such, without locking the editor as a planning conflict", async (t) => {
  const page = await fixture(t)
  await page.evaluate(() => {
    window.editorTest.updateFails = true
  })
  await respond(page, 0, project("a"))
  await page.getByRole("textbox", { name: "Nombre del proyecto *" }).fill("Duplicado")
  await save(page).click()
  await expect(page.getByRole("alert")).toHaveText("Ya existe un proyecto con ese nombre")
  await expect(save(page)).toBeEnabled()
})
