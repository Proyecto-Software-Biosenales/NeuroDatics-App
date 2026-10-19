import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import { chromium } from "@playwright/test"
import { browserBundle } from "../browserBundle.mjs"

const bundle = browserBundle(`
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { flushSync } from 'react-dom';
  import { useCreateProjectWizard } from '@/features/projects/create-project/useCreateProjectWizard';
  import { ProjectsApi } from '@/features/projects/api/projectsApi';
  import { PreExperimentApi } from '@/features/projects/pre-experiment/api';
  const state = { uploads: [], polls: [], gets: [], deletes: [], creates: [], updates: [], cancels: [], metadata: [] };
  ProjectsApi.create = async (data) => { state.creates.push(data); return { id: 'draft-a' }; };
  ProjectsApi.update = async (id, data) => { state.updates.push({ id, data }); return { id }; };
  ProjectsApi.delete = async (id) => { state.deletes.push(id); };
  ProjectsApi.get = (id) => new Promise((resolve, reject) => state.gets.push({ id, resolve, reject }));
  ProjectsApi.getZipUploadProgress = (id, uploadId, signal) => new Promise((resolve, reject) => state.polls.push({ id, uploadId, signal, resolve, reject }));
  ProjectsApi.cancelZipUpload = async (id, uploadId) => { state.cancels.push({ id, uploadId }); };
  ProjectsApi.uploadZipWithProgress = (id, file, onProgress, signal, selection, geometry, placements, uploadId) =>
    new Promise((resolve, reject) => {
      state.uploads.push({ id, file, onProgress, signal, selection, uploadId, resolve, reject });
      signal.addEventListener('abort', () => reject(new Error('Subida cancelada.')), { once: true });
    });
  ProjectsApi.setSensors = async (id, sensors) => { state.metadata.push({ id, sensors }); };
  ProjectsApi.setParticipants = async (id, participants) => { state.metadata.push({ id, participants }); };
  ProjectsApi.setAois = async () => {};
  ProjectsApi.finalize = async (id) => { state.metadata.push({ id, finalized: true }); };
  // A project created with its folder has no preparation; a test sets one to resume a pre-experiment.
  state.preparation = { revision: 0, config: { participants: [] }, responses: [] };
  state.plannings = [];
  PreExperimentApi.get = async () => structuredClone(state.preparation);
  PreExperimentApi.save = async (id, revision, config) => { state.plannings.push({ id, revision, config }); return { revision: revision + 1, config, responses: [] }; };
  const pollTimers = new Set();
  const originalTimeout = window.setTimeout.bind(window), originalClear = window.clearTimeout.bind(window);
  window.setTimeout = (callback, delay, ...args) => {
    const timer = originalTimeout(() => { pollTimers.delete(timer); callback(...args); }, delay);
    if (delay === 1000) pollTimers.add(timer);
    return timer;
  };
  window.clearTimeout = (timer) => { pollTimers.delete(timer); originalClear(timer); };
  state.pollTimers = pollTimers;
  const root = createRoot(document.getElementById('root'));
  function Probe() { state.current = useCreateProjectWizard(); return null; }
  flushSync(() => root.render(<Probe />));
  state.select = () => flushSync(() => {
    const file = new File(['time,value\\n0,1'], 'data.csv', { type: 'text/csv' });
    Object.assign(file, { _relativePath: 'Study/data.csv' });
    state.current.updateProjectName('Study');
    state.current.setExperimentFolder([file]);
    state.current.setFolderStructureSelection({ selectedCsvPath: 'data.csv', selectedImagesFolder: null,
      selectedVideosFolder: null, selectedAcquisitionFolder: null, allowMissingImages: true, allowMissingVideos: true });
  });
  state.start = () => { state.pending = state.current.nextStep(); };
  state.unmount = () => flushSync(() => root.unmount());
  window.uploadTest = state;
`)

let browser
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })

async function fixture(t) {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  t.after(async () => { await page.close(); assert.deepEqual(errors, []) })
  await page.setContent('<div id="root"></div>')
  await page.addScriptTag({ content: bundle })
  await page.evaluate(() => window.uploadTest.select())
  return page
}

const completed = {
  project_id: "draft-a", ingestion_status: "READY", detected_sensors: ["EEG"],
  participants: [{ participant_code: "P01", user_index: 1 }],
}
const detail = { id: "draft-a", name: "Study", scenaries: [], files: [] }
const start = async (page, count = 1) => {
  await page.evaluate(() => window.uploadTest.start())
  await page.waitForFunction((count) => window.uploadTest.uploads.length === count, count)
}
const waitIdle = (page) => page.waitForFunction(() => !window.uploadTest.current.isSaving)

test("a rejected upload preserves its draft, clears progress, and permits a fresh attempt", async (t) => {
  const page = await fixture(t)
  await start(page)
  await page.evaluate(() => window.uploadTest.uploads[0].reject(new Error("Network unavailable")))
  await waitIdle(page)
  assert.deepEqual(await page.evaluate(() => ({
    deletes: window.uploadTest.deletes, timers: window.uploadTest.pollTimers.size,
    zip: window.uploadTest.current.formData.uploadedZip, message: window.uploadTest.current.saveProgressMessage,
  })), { deletes: [], timers: 0, zip: null, message: null })
  await start(page, 2)
  const ids = await page.evaluate(() => window.uploadTest.uploads.map((upload) => upload.uploadId))
  assert.match(ids[0], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.notEqual(ids[0], ids[1])
  assert.equal(await page.evaluate(() => window.uploadTest.creates.length), 1)
  await page.evaluate(() => window.uploadTest.current.cancelZipUpload())
  await waitIdle(page)
  await page.evaluate(() => window.uploadTest.current.discardDraftProject())
  assert.deepEqual(await page.evaluate(() => window.uploadTest.deletes), [])
})

test("a failed detail read after publication retries the read without replacing data again", async (t) => {
  const page = await fixture(t)
  await start(page)
  await page.evaluate((result) => window.uploadTest.uploads[0].resolve(result), completed)
  await page.waitForFunction(() => window.uploadTest.gets.length === 1)
  await page.evaluate(() => window.uploadTest.gets[0].reject(new Error("Detail unavailable")))
  await waitIdle(page)
  assert.equal(await page.evaluate(() => window.uploadTest.current.formData.uploadedZip.ingestion_status), "READY")
  assert.deepEqual(await page.evaluate(() => window.uploadTest.deletes), [])
  await page.evaluate(() => window.uploadTest.start())
  await page.waitForFunction(() => window.uploadTest.gets.length === 2)
  await page.evaluate((detail) => window.uploadTest.gets[1].resolve(detail), detail)
  await waitIdle(page)
  assert.equal(await page.evaluate(() => window.uploadTest.uploads.length), 1)
  assert.equal(await page.evaluate(() => window.uploadTest.current.currentStep), 2)
  assert.deepEqual(await page.evaluate(() => window.uploadTest.metadata), [])
})

test("a failed replacement never deletes a resumed draft or its existing demographics", async (t) => {
  const page = await fixture(t)
  await page.evaluate(() => { void window.uploadTest.current.openForResume({ id: 'existing', name: 'Study', status: 'draft', ingestionStatus: 'READY', sensors: ['EEG'] }) })
  await page.waitForFunction(() => window.uploadTest.gets.length === 1)
  await page.evaluate((detail) => window.uploadTest.gets[0].resolve({ ...detail, id: 'existing',
    participants: [{ participant_code: 'P01', age: 34, sex: 'female' }], sensors: [{ sensor_type: 'EEG' }] }), detail)
  await page.waitForFunction(() => window.uploadTest.current.currentStep === 2)
  await page.evaluate(() => window.uploadTest.current.prevStep())
  await page.evaluate(() => window.uploadTest.select())
  await start(page)
  await page.evaluate(() => window.uploadTest.uploads[0].reject(new Error("Drive failed")))
  await waitIdle(page)
  assert.deepEqual(await page.evaluate(() => window.uploadTest.deletes), [])
  assert.deepEqual(await page.evaluate(() => window.uploadTest.current.formData.participants), [{ id: "P01", age: "34", sex: "female", name: "", document: "P01" }])
})

test("a pre-experiment receiving its folder assigns its participants by document and keeps both records equal", async (t) => {
  const page = await fixture(t)
  await page.evaluate(() => {
    window.uploadTest.preparation = { revision: 4, responses: [], config: { notes: "", participants: [
      { id: "exact", name: "Ana", identification_document: "p01", gender: "female", age: 31, notes: "Usa gafas" },
      { id: "typo", name: "Beto", identification_document: "1023456798", gender: "", age: 40, notes: "" },
      { id: "absent", name: "Ceci", identification_document: "999", gender: "", age: null, notes: "" },
    ] } }
    void window.uploadTest.current.openForResume({ id: 'pre', name: 'Study', status: 'draft', ingestionStatus: 'READY', sensors: ['EEG'] })
  })
  await page.waitForFunction(() => window.uploadTest.gets.length === 1)
  await page.evaluate((detail) => window.uploadTest.gets[0].resolve({ ...detail, id: 'pre', sensors: [{ sensor_type: 'EEG' }],
    participants: [{ participant_code: 'P01' }, { participant_code: '1023456789' }, { participant_code: '1099' }] }), detail)
  await page.waitForFunction(() => window.uploadTest.current.currentStep === 2)
  // The equal document and the one with two swapped digits are assigned; the one too far from any is not.
  assert.deepEqual(await page.evaluate(() => window.uploadTest.current.preparation.assignments), { exact: "P01", typo: "1023456789" })
  assert.deepEqual(await page.evaluate(() => window.uploadTest.current.formData.participants), [
    { id: "P01", sex: "female", age: "31", name: "Ana", document: "p01", notes: "Usa gafas" },
    { id: "1023456789", sex: null, age: "40", name: "Beto", document: "1023456798", notes: "" },
    { id: "1099", sex: null, age: "", name: "", document: "1099" },
  ])
  // Moving an assignment gives the one left its data back.
  await page.evaluate(() => window.uploadTest.current.assignParticipant("typo", "1099"))
  assert.deepEqual(await page.evaluate(() => window.uploadTest.current.formData.participants.slice(1)), [
    { id: "1023456789", sex: null, age: "", name: "", document: "1023456789" },
    { id: "1099", sex: null, age: "40", name: "Beto", document: "1023456798", notes: "" },
  ])
  // A participant left unassigned with the document of one of the data would be two cards for one person.
  await page.evaluate(() => window.uploadTest.current.assignParticipant("exact", null))
  assert.equal(await page.evaluate(() => window.uploadTest.current.repeatedParticipantDocument), "P01")
  await page.evaluate(() => window.uploadTest.current.assignParticipant("exact", "P01"))
  assert.equal(await page.evaluate(() => window.uploadTest.current.repeatedParticipantDocument), null)

  await page.evaluate(() => {
    const wizard = window.uploadTest.current
    for (const code of ["1023456789", "1099"]) wizard.updateParticipant(code, "sex", "male")
    wizard.updateParticipant("1023456789", "age", "22")
    wizard.updateParticipant("1099", "notes", "Zurdo")
    wizard.updateParticipant("1023456789", "notes", "Llegó tarde")
  })
  await page.evaluate(() => { window.uploadTest.saving = window.uploadTest.current.saveProject() })
  await page.waitForFunction(() => window.uploadTest.gets.length === 2)
  const { metadata, plannings } = await page.evaluate(() => ({ metadata: window.uploadTest.metadata, plannings: window.uploadTest.plannings }))
  assert.deepEqual(metadata.find((item) => item.participants).participants, [
    { participant_code: "P01", age: 31, sex: "female", name: "Ana", document: "p01" },
    { participant_code: "1023456789", age: 22, sex: "male", name: null, document: "1023456789" },
    { participant_code: "1099", age: 40, sex: "male", name: "Beto", document: "1023456798" },
  ])
  // The preparation takes what was saved with the data and the notes; the one left out keeps its own record, and
  // the one only in the data gets a record for its notes.
  assert.equal(plannings.length, 1)
  assert.equal(plannings[0].revision, 4)
  assert.deepEqual(plannings[0].config.participants.map(({ id, identification_document, gender, age, notes }) => ({ id, identification_document, gender, age, notes })), [
    { id: "exact", identification_document: "p01", gender: "female", age: 31, notes: "Usa gafas" },
    { id: "typo", identification_document: "1023456798", gender: "male", age: 40, notes: "Zurdo" },
    { id: "absent", identification_document: "999", gender: "", age: null, notes: "" },
    { id: plannings[0].config.participants[3].id, identification_document: "1023456789", gender: "male", age: 22, notes: "Llegó tarde" },
  ])
  await page.evaluate((detail) => window.uploadTest.gets[1].resolve({ ...detail, id: 'pre' }), detail)
  await page.evaluate(() => window.uploadTest.saving)
})

test("notes typed while uploading a folder are kept in the preparation; without notes nothing is written there", async (t) => {
  const plannings = []
  for (const notes of [null, "Usa gafas"]) {
    const page = await fixture(t)
    await start(page)
    await page.evaluate((result) => window.uploadTest.uploads[0].resolve(result), completed)
    await page.waitForFunction(() => window.uploadTest.gets.length === 1)
    await page.evaluate((detail) => window.uploadTest.gets[0].resolve(detail), detail)
    await page.waitForFunction(() => window.uploadTest.current.currentStep === 2)
    await page.evaluate((notes) => {
      const wizard = window.uploadTest.current
      wizard.updateParticipant("P01", "sex", "female")
      wizard.updateParticipant("P01", "age", "34")
      if (notes) wizard.updateParticipant("P01", "notes", notes)
    }, notes)
    await page.evaluate(() => { window.uploadTest.saving = window.uploadTest.current.saveProject() })
    await page.waitForFunction(() => window.uploadTest.gets.length === 2)
    await page.evaluate((detail) => window.uploadTest.gets[1].resolve(detail), detail)
    await page.evaluate(() => window.uploadTest.saving)
    plannings.push(await page.evaluate(() => window.uploadTest.plannings))
  }
  assert.deepEqual(plannings[0], [])
  assert.equal(plannings[1].length, 1)
  assert.equal(plannings[1][0].revision, 0)
  assert.deepEqual(plannings[1][0].config.participants.map(({ name, identification_document, gender, age, notes }) => ({ name, identification_document, gender, age, notes })), [
    { name: "", identification_document: "P01", gender: "female", age: 34, notes: "Usa gafas" },
  ])
})

test("polling is serial, scoped, and cannot revive progress after cancellation", async (t) => {
  const page = await fixture(t)
  await start(page)
  await page.waitForFunction(() => window.uploadTest.polls.length === 1)
  await page.waitForTimeout(1100)
  assert.equal(await page.evaluate(() => window.uploadTest.polls.length), 1)
  await page.evaluate(() => window.uploadTest.current.cancelZipUpload())
  await waitIdle(page)
  const scoped = await page.evaluate(() => ({
    uploadId: window.uploadTest.uploads[0].uploadId,
    pollId: window.uploadTest.polls[0].uploadId,
    cancelId: window.uploadTest.cancels[0].uploadId,
    aborted: window.uploadTest.polls[0].signal.aborted,
  }))
  assert.equal(scoped.uploadId, scoped.pollId)
  assert.equal(scoped.uploadId, scoped.cancelId)
  assert.equal(scoped.aborted, true)
  await page.evaluate(() => window.uploadTest.polls[0].resolve({ phase: 'completed', uploaded_bytes: 100, total_bytes: 100, percent: 100 }))
  assert.deepEqual(await page.evaluate(() => ({ percent: window.uploadTest.current.zipUploadPercent,
    message: window.uploadTest.current.saveProgressMessage, timers: window.uploadTest.pollTimers.size })),
  { percent: null, message: null, timers: 0 })
})

test("an explicit snapshot for a previous attempt cannot complete the current progress", async (t) => {
  const page = await fixture(t)
  await start(page)
  await page.waitForFunction(() => window.uploadTest.polls.length === 1)
  await page.evaluate(() => window.uploadTest.polls[0].resolve({ upload_id: 'old-attempt', phase: 'completed', total_bytes: 100, uploaded_bytes: 100, percent: 100 }))
  assert.equal(await page.evaluate(() => window.uploadTest.current.zipUploadPercent), null)
  await page.waitForFunction(() => window.uploadTest.polls.length === 2)
  await page.evaluate(() => window.uploadTest.current.cancelZipUpload())
  await waitIdle(page)
})

test("unmount cancels the active upload and drops every pending polling callback", async (t) => {
  const page = await fixture(t)
  await start(page)
  await page.waitForFunction(() => window.uploadTest.polls.length === 1)
  await page.evaluate(() => window.uploadTest.unmount())
  assert.deepEqual(await page.evaluate(() => ({
    aborted: window.uploadTest.uploads[0].signal.aborted, pollAborted: window.uploadTest.polls[0].signal.aborted,
    timers: window.uploadTest.pollTimers.size, cancels: window.uploadTest.cancels.length,
  })), { aborted: true, pollAborted: true, timers: 0, cancels: 1 })
  await page.evaluate(() => window.uploadTest.polls[0].resolve({ phase: 'uploading', total_bytes: 100, uploaded_bytes: 50, percent: 50 }))
  assert.equal(await page.evaluate(() => window.uploadTest.pollTimers.size), 0)
})

test("rapid duplicate Next calls start only one upload", async (t) => {
  const page = await fixture(t)
  await page.evaluate(() => { window.uploadTest.start(); window.uploadTest.start() })
  await page.waitForFunction(() => window.uploadTest.uploads.length === 1)
  assert.equal(await page.evaluate(() => window.uploadTest.creates.length), 1)
  await page.evaluate(() => window.uploadTest.current.cancelZipUpload())
  await waitIdle(page)
})

test("resuming an unpublished failed upload requires uploading again", async (t) => {
  const page = await fixture(t)
  await page.evaluate(() => window.uploadTest.current.openForResume({
    id: 'failed-draft', name: 'Study', status: 'draft', ingestionStatus: 'FAILED', sensors: [],
  }))
  assert.equal(await page.evaluate(() => window.uploadTest.current.currentStep), 1)
  assert.equal(await page.evaluate(() => window.uploadTest.current.formData.uploadedZip), null)
  assert.equal(await page.evaluate(() => window.uploadTest.current.canGoNext()), false)
})

test("reset invalidates a pending resume response", async (t) => {
  const page = await fixture(t)
  await page.evaluate(() => { window.uploadTest.resume = window.uploadTest.current.openForResume({
    id: 'old-draft', name: 'Old', status: 'draft', ingestionStatus: 'READY', sensors: [],
  }) })
  await page.waitForFunction(() => window.uploadTest.gets.length === 1)
  await page.evaluate(() => window.uploadTest.current.reset())
  await page.evaluate((detail) => window.uploadTest.gets[0].resolve(detail), detail)
  await page.evaluate(() => window.uploadTest.resume)
  assert.equal(await page.evaluate(() => window.uploadTest.current.isOpen), false)
  assert.equal(await page.evaluate(() => window.uploadTest.current.formData.projectName), '')
})
