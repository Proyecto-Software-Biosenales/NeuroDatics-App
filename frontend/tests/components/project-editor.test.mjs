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
  const requests = [], plannings = [], calls = [];
  const envelope = { revision: 1, config: emptyConfig(), responses: [] };
  ProjectsApi.get = (id) => new Promise((resolve, reject) => requests.push({ id, resolve, reject }));
  ProjectsApi.update = async (id, data) => { if (window.editorTest.updateFails) throw new ApiError('Ya existe un proyecto con ese nombre', 409, null); calls.push(['update', id, data]); return data; };
  ProjectsApi.setSensors = async (id, sensors) => { calls.push(['sensors', id, sensors]); };
  ProjectsApi.setParticipants = async (id, participants) => { calls.push(['participants', id, participants]); };
  ProjectsApi.setAois = async (id, aois) => { calls.push(['aois', id, aois]); };
  ProjectsApi.finalize = async (id) => { calls.push(['finalize', id]); };
  // The preparation arrives with the project, so a test can set it before answering.
  PreExperimentApi.get = () => new Promise((resolve) => plannings.push(resolve));
  PreExperimentApi.save = async (id, revision, config) => { calls.push(['planning', id, revision, config]); return { ...envelope, revision: revision + 1, config }; };
  const root = createRoot(document.getElementById('root'));
  let props = { projectId: 'a' };
  const render = (next) => {
    props = { ...props, ...next };
    flushSync(() => root.render(<ProjectEditor key={props.projectId} projectId={props.projectId} />));
  };
  window.editorTest = { requests, plannings, calls, render, emptyConfig, envelope: null, defaultEnvelope: envelope };
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
  // localhost is a secure context, where new participants get their crypto.randomUUID id.
  await page.route("http://localhost/**", (route) => route.fulfill({ contentType: "text/html", body: '<html><body><main style="max-width:900px;margin:24px auto"><div id="root"></div></main></body></html>' }))
  await page.goto("http://localhost/")
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
  const test = window.editorTest
  test.requests[index].resolve(detail)
  test.plannings[index](structuredClone(test.envelope ?? test.defaultEnvelope))
}, { index, detail })
const calls = (page) => page.evaluate(() => window.editorTest.calls)
const section = (page, name) => page.getByRole("tab", { name: new RegExp(`^${name}`) }).click()
const save = (page) => page.getByRole("button", { name: "Guardar cambios", exact: true })

test("a project with its folder adds only its areas of interest to the preparation: no devices or folder tabs", async (t) => {
  const page = await fixture(t)
  await respond(page, 0, project("a"))
  await expect(page.getByRole("heading", { name: "Study a", exact: true })).toBeVisible()
  // Each tab is only its name: no counts or checks beside it.
  const names = ["Proyecto", "Participantes", "Cuestionarios", "Pantalla", "Áreas de interés", "Notas"]
  for (const name of names) await expect(page.getByRole("tab", { name, exact: true })).toHaveText(name)
  await expect(page.getByRole("tab")).toHaveCount(names.length)
  await expect(page.locator("p.app-page-description")).toHaveText("Description a")
})

test("participants read from the data and those of the preparation are one list of the same cards", async (t) => {
  const page = await fixture(t)
  await page.evaluate(() => {
    window.editorTest.envelope = {
      revision: 1,
      responses: [],
      config: {
        ...window.editorTest.emptyConfig(),
        participants: [
          { id: "p1", name: "", identification_document: "p01", gender: "", age: null, notes: "Usa gafas" },
          { id: "p2", name: "Sin datos", identification_document: "D-2", gender: "", age: null, notes: "" },
        ],
      },
    }
  })
  await respond(page, 0, project("a", { participants: [
    { participant_code: "P01", age: 30, sex: "male" },
    { participant_code: "P02", age: 25, sex: "female" },
  ] }))
  await section(page, "Participantes")
  await expect(page.getByRole("tab", { name: /^Del experimento/ })).toHaveCount(0)
  // P01 and the planned "p01" are the same person: one card, with the notes of the preparation.
  await expect(page.getByRole("textbox", { name: "Documento", exact: true })).toHaveCount(2)
  await expect(page.getByRole("textbox", { name: "Documento *", exact: true })).toHaveCount(1)
  await expect(page.getByRole("group", { name: "Participante 1" }).getByRole("textbox", { name: "Notas del participante" })).toHaveValue("Usa gafas")
  // Only participants without recordings can be removed.
  await expect(page.getByRole("button", { name: /^Quitar participante/ })).toHaveCount(1)
  await expect(page.getByRole("button", { name: "Quitar participante 3" })).toBeVisible()

  // Editing a card with data also keeps its copy in the preparation equal; a first note creates that copy.
  const first = page.getByRole("group", { name: "Participante 1" })
  await first.getByRole("textbox", { name: "Nombre", exact: true }).fill("Ana")
  await page.getByRole("group", { name: "Participante 2" }).getByRole("textbox", { name: "Notas del participante" }).fill("Llegó tarde")
  await save(page).click()
  await page.waitForFunction(() => window.editorTest.requests.length === 2)
  await respond(page, 1, project("a"))
  const [participants, planning] = await calls(page)
  assert.equal(participants[0], "participants")
  assert.equal(participants[2][0].name, "Ana")
  assert.equal(planning[0], "planning")
  assert.deepEqual(
    planning[3].participants.map(({ name, identification_document, gender, age, notes }) => ({ name, identification_document, gender, age, notes })),
    [
      { name: "Ana", identification_document: "P01", gender: "male", age: 30, notes: "Usa gafas" },
      { name: "Sin datos", identification_document: "D-2", gender: "", age: null, notes: "" },
      { name: "", identification_document: "P02", gender: "female", age: 25, notes: "Llegó tarde" },
    ]
  )
})

test("a participant of the preparation left out of the data can be assigned one of the data without a pair", async (t) => {
  const page = await fixture(t)
  await page.evaluate(() => {
    window.editorTest.envelope = {
      revision: 3,
      responses: [],
      config: {
        ...window.editorTest.emptyConfig(),
        participants: [
          { id: "p1", name: "", identification_document: "P01", gender: "", age: null, notes: "" },
          { id: "p2", name: "Bea", identification_document: "1023456798", gender: "female", age: 29, notes: "Zurda" },
        ],
      },
    }
  })
  await respond(page, 0, project("a", { participants: [
    { participant_code: "P01", age: 30, sex: "male" },
    { participant_code: "1023456789", age: null, sex: null },
  ] }))
  await section(page, "Participantes")
  // Only the card without a pair asks for a document, and it offers only the participant of the data without one.
  const select = page.getByRole("combobox", { name: "Asignar documento" })
  await expect(select).toHaveCount(1)
  await select.click()
  await expect(page.getByRole("option")).toHaveText(["Sin asignar", "1023456789"])
  await page.getByRole("option", { name: "1023456789", exact: true }).click()
  // Both are now one card, in the place of the one of the data, with the preparation's details and notes.
  await expect(page.getByRole("group", { name: /^Participante \d/ })).toHaveCount(2)
  const second = page.getByRole("group", { name: "Participante 2" })
  await expect(second.getByRole("textbox", { name: "Documento", exact: true })).toHaveValue("1023456798")
  await expect(second.getByRole("textbox", { name: "Nombre", exact: true })).toHaveValue("Bea")
  await expect(second.getByRole("textbox", { name: "Notas del participante" })).toHaveValue("Zurda")
  await save(page).click()
  await page.waitForFunction(() => window.editorTest.requests.length === 2)
  await respond(page, 1, project("a"))
  // The preparation already had those details, so only the data changes.
  const saved = await calls(page)
  assert.deepEqual(saved.map(([kind]) => kind), ["participants"])
  assert.deepEqual(saved[0][2][1], { participant_code: "1023456789", age: 29, sex: "female", name: "Bea", document: "1023456798" })
})

test("a participant of the preparation cannot take the document of one read from the data", async (t) => {
  const page = await fixture(t)
  await respond(page, 0, project("a"))
  await section(page, "Participantes")
  await page.getByRole("button", { name: "Agregar participante" }).click()
  await page.getByRole("textbox", { name: "Documento *", exact: true }).fill("p01")
  await expect(page.getByText("Documento repetido", { exact: true })).toHaveCount(2)
  await save(page).click()
  await expect(page.getByRole("alert")).toHaveText("Hay dos participantes con el documento P01.")
  assert.deepEqual(await calls(page), [])
})

test("a pre-experiment has no devices, areas of interest or folder tabs", async (t) => {
  const page = await fixture(t)
  await respond(page, 0, project("a", { is_pre_experiment: true, sensors: [], participants: [] }))
  await expect(page.getByRole("tab", { name: /^Notas/ })).toBeVisible()
  for (const name of ["Dispositivos", "Áreas de interés"])
    await expect(page.getByRole("tab", { name: new RegExp(`^${name}`) })).toHaveCount(0)
})

test("saving sends only what changed, each part once", async (t) => {
  const page = await fixture(t)
  await respond(page, 0, project("a", { name: "Original-9ac9ef2b-20260324225557" }))
  await expect(page.getByRole("heading", { name: "Original", exact: true })).toBeVisible()
  await expect(save(page)).toBeDisabled()
  await page.getByRole("textbox", { name: "Nombre del proyecto *" }).fill("Edited study")
  await page.getByRole("textbox", { name: "Descripción" }).fill("Updated description")
  await expect(page.getByText("Hay cambios sin guardar")).toBeVisible()
  // Saving reloads the project, so answer that second read.
  await save(page).click()
  await page.waitForFunction(() => window.editorTest.requests.length === 2)
  await respond(page, 1, project("a", { name: "Edited study" }))
  await expect(page.getByText("Hay cambios sin guardar")).toHaveCount(0)
  assert.deepEqual(await calls(page), [
    ["update", "a", { name: "Edited study", description: "Updated description" }],
  ])
})

test("saving is refused while a section has something to fix and sends nothing", async (t) => {
  const page = await fixture(t)
  await respond(page, 0, project("a"))
  await page.getByRole("textbox", { name: "Nombre del proyecto *" }).fill(" ")
  await save(page).click()
  await expect(page.getByRole("alert")).toHaveText("Escribe el nombre del proyecto.")
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
