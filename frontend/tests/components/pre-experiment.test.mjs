import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import { mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { chromium, expect } from "@playwright/test"
import { browserBundle } from "../browserBundle.mjs"

const bundle = browserBundle(`
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { PreExperimentSettings } from '@/features/projects/pre-experiment/PreExperimentSettings';
  import { CreateProjectDialog } from '@/features/projects/create-project/CreateProjectDialog';
  import { ProjectsApi } from '@/features/projects/api/projectsApi';
  import { PreExperimentApi } from '@/features/projects/pre-experiment/api';
  import { ApiError } from '@/lib/api/apiFetch';
  import { emptyConfig } from '@/features/projects/pre-experiment/types';
  const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12,'0');
  const participant = (n,name) => ({id:uuid(n),code:'P0'+n,name,identification_document:'SINTETICO-'+n,gender:'Sin especificar',age:25,notes:''});
  const config = emptyConfig();
  config.participants = [participant(1,'Ana de prueba'),participant(2,'Luis de prueba')];
  config.questionnaires.before.enabled = true;
  config.questionnaires.before.questions = [
    {id:uuid(3),type:'open_text',prompt:'¿Cómo te sientes?',required:true,options:[]},
    {id:uuid(4),type:'multiple_choice',prompt:'Actividades de hoy',required:true,options:[{id:uuid(5),label:'Leer'},{id:uuid(6),label:'Caminar'}]},
    {id:uuid(7),type:'true_false',prompt:'He dormido bien',required:true,options:[]},
  ];
  const state = {data:{revision:1,config,responses:[]},creates:[],saves:[],posts:[],gets:[],removed:[],created:[],loadFail:false,listFail:false,conflict:false,responseConflict:false,holdCreate:false,holdResponse:false};
  ProjectsApi.list = async () => { if(state.listFail) throw Error('Servidor no disponible'); return [{id:'a',name:'Estudio de prueba'},{id:'b',name:'Segundo estudio'}]; };
  ProjectsApi.create = payload => { state.creates.push(payload); if(state.createConflict)return Promise.reject(new ApiError('Ya existe un proyecto con ese nombre',409,null)); const result={id:'new',name:payload.name,status:'draft',created_at:'2026-10-05T12:00:00Z',planning_participants_count:payload.pre_experiment?.participants.length}; if(state.holdCreate)return new Promise(resolve=>state.finishCreate=()=>resolve(result)); return Promise.resolve(result); };
  ProjectsApi.get = async id => ({id,name:'Estudio de prueba',status:'draft',participants:[],scenaries:[],sensors:[],files:[]});
  ProjectsApi.remove = async id => { state.removed.push(id);return {message:'deleted'}; };
  PreExperimentApi.get = async id => { state.gets.push(id); if(state.loadFail)throw Error('Fallo de carga'); return structuredClone(state.data); };
  PreExperimentApi.save = async (id,revision,config) => { state.saves.push({id,revision,config}); if(state.conflict)throw new ApiError('La versión cambió',409,null); state.data={...state.data,revision:revision+1,config:structuredClone(config)}; return structuredClone(state.data); };
  PreExperimentApi.respond = async (id,revision,participant_id,phase,answers) => {
    state.posts.push({id,revision,participant_id,phase,answers});
    if(state.responseConflict)throw new ApiError('La versión cambió',409,null);
    const result={id:uuid(20+state.posts.length),revision,participant_id,phase,answers:structuredClone(answers),participant_snapshot:structuredClone(state.data.config.participants.find(p=>p.id===participant_id)),questionnaire_snapshot:structuredClone(state.data.config.questionnaires[phase]),submitted_at:'2026-10-05T12:00:00Z'};
    if(state.holdResponse)await new Promise(resolve=>state.finishResponse=resolve);
    state.data.responses.push(result);return result;
  };
  PreExperimentApi.export = async () => ({project:{id:'a'},...state.data});
  const root=createRoot(document.getElementById('root'));
  window.testState=state;
  window.mount = mode => root.render(mode === 'settings' ? <PreExperimentSettings/> : <CreateProjectDialog trigger={<button>Crear proyecto</button>} onProjectCreated={project=>state.created.push(project)} resumeProject={mode==='resume' ? {id:'a',name:'Estudio de prueba',status:'draft',isPreExperiment:true,ingestionStatus:'PENDING',createdAt:'',sensors:[]} : null} />);
`)

let browser
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })
const screenshotDir = process.env.PRE_EXPERIMENT_QA_OUTPUT
const screenshot = async (page, name) => {
  if (!screenshotDir) return
  mkdirSync(screenshotDir, { recursive: true })
  await page.screenshot({ path: path.join(screenshotDir, name), fullPage: true })
}
async function fixture(t, mode = 'settings', flags = {}, mobile = false) {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  t.after(async () => { await page.close(); assert.deepEqual(errors, []) })
  await page.route('http://localhost/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body><main style="max-width:850px;margin:24px auto;padding:12px"><div id="root"></div></main></body></html>' }))
  await page.goto('http://localhost/?proyecto=a')
  if (process.env.PRE_EXPERIMENT_QA_CSS) await page.addStyleTag({ content: readFileSync(process.env.PRE_EXPERIMENT_QA_CSS, 'utf8') })
  await page.addScriptTag({ content: bundle })
  await page.evaluate(({ mode, flags }) => { Object.assign(window.testState, flags); window.mount(mode) }, { mode, flags })
  if (mode === 'settings' && !flags.loadFail && !flags.listFail) await expect(page.getByText('Versión guardada: 1.', { exact: false })).toBeVisible()
  return page
}
const select = async (page, name, option) => {
  await page.getByRole('combobox', { name, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}
const state = (page, key) => page.evaluate(key => window.testState[key], key)
const openPre = async page => {
  await page.getByRole('button', { name: 'Crear proyecto', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Con carpeta', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Pre-experimento', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pre-experimento', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Con carpeta', exact: true })).toHaveAttribute('aria-pressed', 'false')
}

test('creates a draft with only its name, no folder, participants or questions', async t => {
  const page = await fixture(t, 'create')
  await openPre(page)
  await page.getByRole('textbox', { name: 'Nombre del proyecto *', exact: true }).fill('Proyecto sin carpeta')
  await screenshot(page, 'create-desktop.png')
  await page.getByRole('button', { name: 'Crear pre-experimento', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const [payload] = await state(page, 'creates')
  assert.equal(payload.status, 'draft')
  assert.equal(payload.name, 'Proyecto sin carpeta')
  assert.deepEqual(payload.pre_experiment.participants, [])
  assert.equal(payload.pre_experiment.questionnaires.before.enabled, false)
  assert.equal((await state(page, 'created'))[0].isPreExperiment, true)
})

test('optional creation editor allows participants, partial screen geometry and an after-only questionnaire', async t => {
  const page = await fixture(t, 'create', {}, true)
  await openPre(page)
  await page.getByRole('textbox', { name: 'Nombre del proyecto *', exact: true }).fill('Estudio después')
  await screenshot(page, 'create-mobile.png')
  await expect(page.getByRole('tab', { name: /^Proyecto/ })).toHaveAttribute('aria-selected', 'true')
  // The overview cards on the first tab jump straight to the optional sections.
  await page.getByRole('button', { name: /^Participantes/ }).click()
  await expect(page.getByRole('tab', { name: /^Participantes/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Aún no hay participantes', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Agregar participante', exact: true }).click()
  await page.getByRole('textbox', { name: 'Código *', exact: true }).fill('P01')
  await screenshot(page, 'create-participants-mobile.png')
  // Leaving a participant without a name sends the student back to that tab with the reason.
  await page.getByRole('tab', { name: /^Pantalla/ }).click()
  await page.getByRole('spinbutton', { name: 'Ancho (px)', exact: true }).fill('1920')
  await page.getByRole('button', { name: 'Crear pre-experimento', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Completa el código y el nombre de cada participante.')
  await expect(page.getByRole('tab', { name: /^Participantes/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: /^Participantes/ })).toContainText('Revisar')
  assert.equal((await state(page, 'creates')).length, 0)
  await page.getByRole('textbox', { name: 'Nombre del participante *', exact: true }).fill('Participante sintético')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect(page.getByRole('tab', { name: /^Cuestionarios/ })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: /^Después del experimento/ }).click()
  await page.getByRole('checkbox', { name: 'Usar cuestionario después', exact: true }).check()
  await page.getByRole('button', { name: 'Agregar pregunta después', exact: true }).click()
  await page.getByRole('textbox', { name: 'Enunciado', exact: true }).fill('¿Qué aprendiste?')
  await screenshot(page, 'create-questionnaire-mobile.png')
  await page.getByRole('button', { name: 'Crear pre-experimento', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const [payload] = await state(page, 'creates')
  assert.equal(payload.pre_experiment.participants[0].name, 'Participante sintético')
  assert.equal(payload.pre_experiment.screen.height_px, null)
  assert.equal(payload.pre_experiment.screen.width_px, 1920)
  assert.equal(payload.pre_experiment.questionnaires.before.enabled, false)
  assert.equal(payload.pre_experiment.questionnaires.after.enabled, true)
})

test('pending create prevents closing or changing modes and does not send twice', async t => {
  const page = await fixture(t, 'create', { holdCreate: true })
  await openPre(page)
  await page.getByRole('textbox', { name: 'Nombre del proyecto *', exact: true }).fill('Pendiente')
  await page.getByRole('button', { name: 'Crear pre-experimento', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Con carpeta', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  assert.equal((await state(page, 'creates')).length, 1)
  await page.evaluate(() => window.testState.finishCreate())
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('duplicate project name preserves form and displays the correct 409 reason', async t => {
  const page = await fixture(t, 'create', { createConflict: true })
  await openPre(page)
  await page.getByRole('textbox', { name: 'Nombre del proyecto *', exact: true }).fill('Duplicado')
  await page.getByRole('button', { name: 'Crear pre-experimento', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Ya existe un proyecto con ese nombre')
  await expect(page.getByRole('textbox', { name: 'Nombre del proyecto *', exact: true })).toHaveValue('Duplicado')
  await expect(page.getByRole('button', { name: 'Crear pre-experimento', exact: true })).toBeEnabled()
})

test('saves changes, locks project switching while dirty and reloads saved values', async t => {
  const page = await fixture(t)
  await page.getByRole('textbox', { name: 'Nombre del participante *', exact: true }).first().fill('Ana actualizada')
  await expect(page.getByRole('combobox', { name: 'Proyecto', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Responder cuestionario', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Guardar información y cuestionarios', exact: true }).click()
  await expect(page.getByText('Información y cuestionarios guardados.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Recargar información', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Nombre del participante *', exact: true }).first()).toHaveValue('Ana actualizada')
  assert.equal((await state(page, 'saves'))[0].revision, 1)
  await screenshot(page, 'settings-desktop.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await screenshot(page, 'settings-mobile.png')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
})

test('required false, multiple selection and open text submit with the chosen participant; success survives failed refresh', async t => {
  const page = await fixture(t)
  await page.getByRole('button', { name: 'Responder cuestionario', exact: true }).click()
  await select(page, 'Participante', 'P02 — Luis de prueba')
  await select(page, 'Momento del cuestionario', 'Antes del experimento')
  await page.getByRole('button', { name: 'Comenzar respuestas', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Participante', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Guardar respuestas', exact: true }).click()
  await expect(page.getByText('Completa todas las respuestas obligatorias.', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '¿Cómo te sientes?', exact: true }).fill('En calma')
  await page.getByRole('checkbox', { name: 'Leer', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Caminar', exact: true }).check()
  await page.getByRole('radio', { name: 'Falso', exact: true }).check()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.evaluate(() => { window.testState.loadFail = true })
  await page.getByRole('button', { name: 'Guardar respuestas', exact: true }).click()
  await expect(page.getByText('Respuestas guardadas correctamente.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  const [post] = await state(page, 'posts')
  assert.equal(post.participant_id, '00000000-0000-4000-8000-000000000002')
  assert.equal(post.answers['00000000-0000-4000-8000-000000000007'], false)
  assert.equal(post.answers['00000000-0000-4000-8000-000000000004'].length, 2)
  await expect(page.getByText('Historial de respuestas (1)', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /P02 — Luis de prueba · Antes del experimento/ }).click()
  await expect(page.getByText('En calma', { exact: true })).toBeVisible()
  await expect(page.getByText('Leer, Caminar', { exact: true })).toBeVisible()
  await expect(page.getByText('Falso', { exact: true })).toBeVisible()
  await screenshot(page, 'history-desktop.png')
  assert.equal((await state(page, 'gets')).length, 1)
  assert.equal((await state(page, 'posts')).length, 1)
})

test('history keeps participant and question snapshots after removing them', async t => {
  const page = await fixture(t)
  await page.evaluate(() => {
    const state = window.testState
    const q = state.data.config.questionnaires.before
    state.data.responses.push({ id: 'history', revision: 1, participant_id: state.data.config.participants[1].id, phase: 'before', participant_snapshot: structuredClone(state.data.config.participants[1]), questionnaire_snapshot: structuredClone(q), answers: { [q.questions[1].id]: q.questions[1].options[0].id }, submitted_at: '2026-10-05T12:00:00Z' })
  })
  await page.getByRole('button', { name: 'Recargar información', exact: true }).click()
  await page.getByRole('button', { name: 'Quitar participante 2', exact: true }).click()
  await page.getByRole('button', { name: 'Quitar pregunta 2', exact: true }).click()
  await page.getByRole('button', { name: 'Guardar información y cuestionarios', exact: true }).click()
  await page.getByRole('button', { name: /P02 — Luis de prueba · Antes del experimento/ }).click()
  await expect(page.getByText('Actividades de hoy', { exact: true })).toBeVisible()
  await expect(page.getByText('Leer', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await screenshot(page, 'history-mobile.png')
})

test('stale save retains draft and requires explicit discard/reload', async t => {
  const page = await fixture(t, 'settings', { conflict: true })
  await page.getByRole('textbox', { name: 'Nombre del participante *', exact: true }).first().fill('Cambio local')
  await page.getByRole('button', { name: 'Guardar información y cuestionarios', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('La configuración cambió')
  await expect(page.getByRole('textbox', { name: 'Nombre del participante *', exact: true }).first()).toHaveValue('Cambio local')
  await expect(page.getByRole('button', { name: 'Guardar información y cuestionarios', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Descartar cambios y recargar', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Nombre del participante *', exact: true }).first()).toHaveValue('Ana de prueba')
})

test('failed configuration and failed project loads can be retried', async t => {
  const page = await fixture(t, 'settings', { loadFail: true })
  await expect(page.getByRole('alert')).toContainText('Fallo de carga')
  await page.evaluate(() => { window.testState.loadFail = false })
  await page.getByRole('button', { name: 'Recargar información', exact: true }).click()
  await expect(page.getByText('Versión guardada: 1.', { exact: false })).toBeVisible()
  const page2 = await fixture(t, 'settings', { listFail: true })
  await expect(page2.getByRole('alert')).toContainText('Servidor no disponible')
  await page2.evaluate(() => { window.testState.listFail = false })
  await page2.getByRole('button', { name: 'Reintentar carga de proyectos', exact: true }).click()
  await expect(page2.getByText('Versión guardada: 1.', { exact: false })).toBeVisible()
})

test('resume of an existing pre-experiment opens the regular folder wizard and preserves cancel', async t => {
  const page = await fixture(t, 'resume')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('Paso 1 de 4', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pre-experimento', exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Nombre del proyecto', exact: true })).toHaveValue('Estudio de prueba')
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  assert.deepEqual(await state(page, 'creates'), [])
  assert.deepEqual(await state(page, 'removed'), [])
})

test('question builder changes types, retains stable IDs and reorders questions', async t => {
  const page = await fixture(t)
  const original = (await state(page, 'data')).config.questionnaires.before.questions
  await page.getByRole('button', { name: 'Subir pregunta 3', exact: true }).click()
  const second = page.getByRole('combobox', { name: 'Tipo de pregunta', exact: true }).nth(1)
  await second.click()
  await page.getByRole('option', { name: 'Respuesta abierta', exact: true }).click()
  await page.getByRole('button', { name: 'Guardar información y cuestionarios', exact: true }).click()
  const saved = (await state(page, 'data')).config.questionnaires.before.questions
  assert.equal(saved[1].id, original[2].id)
  assert.equal(saved[1].type, 'open_text')
  assert.equal(saved[2].id, original[1].id)
  assert.deepEqual(saved[2].options, original[1].options)
  await select(page, 'Proyecto', 'Segundo estudio')
  await expect(page.getByText('Versión guardada: 2.', { exact: false })).toBeVisible()
  assert.deepEqual(await state(page, 'gets'), ['a', 'b'])
})

test('stale response cannot be resent and pending submit protects the dialog', async t => {
  const page = await fixture(t, 'settings', { responseConflict: true })
  await page.getByRole('button', { name: 'Responder cuestionario', exact: true }).click()
  await select(page, 'Participante', 'P01 — Ana de prueba')
  await select(page, 'Momento del cuestionario', 'Antes del experimento')
  await page.getByRole('button', { name: 'Comenzar respuestas', exact: true }).click()
  await page.getByRole('textbox', { name: '¿Cómo te sientes?', exact: true }).fill('Respuesta local')
  await page.getByRole('checkbox', { name: 'Leer', exact: true }).check()
  await page.getByRole('radio', { name: 'Falso', exact: true }).check()
  await page.getByRole('button', { name: 'Guardar respuestas', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('La configuración cambió')
  await expect(page.getByRole('button', { name: 'Guardar respuestas', exact: true })).toBeDisabled()
  await expect(page.getByRole('textbox', { name: '¿Cómo te sientes?', exact: true })).toHaveValue('Respuesta local')
  assert.equal((await state(page, 'posts')).length, 1)
  await page.getByRole('button', { name: 'Cerrar y descartar respuestas sin guardar', exact: true }).click()
  await page.evaluate(() => { window.testState.responseConflict = false; window.testState.holdResponse = true })
  await page.getByRole('button', { name: 'Responder cuestionario', exact: true }).click()
  await select(page, 'Participante', 'P01 — Ana de prueba')
  await select(page, 'Momento del cuestionario', 'Antes del experimento')
  await page.getByRole('button', { name: 'Comenzar respuestas', exact: true }).click()
  await page.getByRole('textbox', { name: '¿Cómo te sientes?', exact: true }).fill('Intento actualizado')
  await page.getByRole('checkbox', { name: 'Leer', exact: true }).check()
  await page.getByRole('radio', { name: 'Falso', exact: true }).check()
  await page.getByRole('button', { name: 'Guardar respuestas', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cerrar y descartar respuestas sin guardar', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.evaluate(() => window.testState.finishResponse())
  await expect(page.getByText('Respuestas guardadas correctamente.', { exact: true })).toBeVisible()
})

test('JSON download exports the saved configuration and response history', async t => {
  const page = await fixture(t)
  const pendingDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar información y respuestas (JSON)', exact: true }).click()
  const download = await pendingDownload
  assert.equal(download.suggestedFilename(), 'pre-experimento-a.json')
  const exported = JSON.parse(readFileSync(await download.path(), 'utf8'))
  assert.equal(exported.revision, 1)
  assert.equal(exported.config.participants.length, 2)
  assert.deepEqual(exported.responses, [])
})
