import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import { readFileSync, existsSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import ts from "typescript"
import { chromium, expect } from "@playwright/test"

const frontend = path.resolve(import.meta.dirname, "../..")

// Bundle the real installed CommonJS packages and TSX components in memory.
// No primitive, React implementation, DOM method or consumer is mocked.
function browserBundle(entry) {
  const files = new Map()
  const modules = []
  function add(filename, supplied) {
    if (files.has(filename)) return files.get(filename)
    const id = modules.length
    files.set(filename, id)
    modules.push("")
    let source = supplied ?? readFileSync(filename, "utf8")
    if (/\.tsx?$/.test(filename)) {
      source = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
      } }).outputText
    }
    const resolve = createRequire(filename)
    source = source.replace(/\brequire\(["']([^"']+)["']\)/g, (_match, name) => {
      let dependency
      if (name.startsWith("@/")) {
        const base = path.join(frontend, name.slice(2))
        dependency = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(existsSync)
        assert.ok(dependency, `Cannot resolve ${name}`)
      } else {
        try { dependency = resolve.resolve(name === "jszip" ? "jszip/dist/jszip.min.js" : name) }
        catch (error) {
          const base = path.resolve(path.dirname(filename), name)
          dependency = [`${base}.ts`, `${base}.tsx`].find(existsSync)
          if (!dependency) throw error
        }
      }
      return `require(${add(dependency)})`
    })
    modules[id] = `function(module,exports,require){\n${source}\n}`
    return id
  }
  const entryId = add(path.join(frontend, "tests/components/fixture.tsx"), entry)
  return `globalThis.process={env:{NODE_ENV:"development"}};
    const factories=[${modules.join(",")}], cache={};
    function require(id){if(cache[id])return cache[id].exports;
      const module=cache[id]={exports:{}};factories[id](module,module.exports,require);return module.exports;}
    require(${entryId});`
}

const bundle = browserBundle(`
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { flushSync } from 'react-dom';
  import { EditProjectDialog } from '@/features/projects/components/EditProjectDialog';
  import { ProjectsApi } from '@/features/projects/api/projectsApi';
  const requests = [], updates = [], saved = [];
  ProjectsApi.get = (id) => new Promise((resolve, reject) => requests.push({ id, resolve, reject }));
  ProjectsApi.update = async (id, data) => { updates.push({ id, data }); return data; };
  const root = createRoot(document.getElementById('root'));
  let props = { projectId: 'a', isOpen: true };
  const render = (next) => {
    props = { ...props, ...next };
    flushSync(() => root.render(<EditProjectDialog {...props} projectName="Study"
      onOpenChange={(isOpen) => render({ isOpen })} onProjectUpdated={(project) => saved.push(project)} />));
  };
  window.dialogTest = { requests, updates, saved, render };
  render({});
`)

let browser
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })

async function fixture(t) {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  t.after(async () => {
    await page.close()
    assert.deepEqual(errors, [])
  })
  await page.setContent('<html><body><div id="root"></div></body></html>')
  await page.addScriptTag({ content: bundle })
  await expect(page.getByText("Cargando datos del proyecto...")).toBeVisible()
  await page.waitForFunction(() => window.dialogTest.requests.length === 1)
  return page
}

const project = (id, name = `Study ${id}`) => ({
  id, name, description: `Description ${id}`, status: "active", created_at: "2026-01-02T12:00:00Z",
  sensors: [{ sensor_type: "EEG" }],
  participants: [{ participant_code: "P01", age: 30, sex: "male" }],
  scenaries: [], files: [],
})
const render = (page, props) => page.evaluate((props) => window.dialogTest.render(props), props)
const respond = (page, index, detail) => page.evaluate(({ index, detail }) => {
  window.dialogTest.requests[index].resolve(detail)
}, { index, detail })
const nameInput = (page) => page.getByRole("textbox", { name: "Nombre del proyecto" })

test("changing projectId reloads an open dialog and ignores the previous response", async (t) => {
  const page = await fixture(t)
  await render(page, { projectId: "b" })
  assert.deepEqual(await page.evaluate(() => window.dialogTest.requests.map(({ id }) => id)), ["a", "b"])
  await respond(page, 1, project("b"))
  await expect(nameInput(page)).toHaveValue("Study b")
  await respond(page, 0, project("a"))
  await expect(nameInput(page)).toHaveValue("Study b")
})

test("reopening ignores an earlier response while the current request is pending", async (t) => {
  const page = await fixture(t)
  await page.getByRole("button", { name: "Cancelar", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await render(page, { isOpen: true })
  assert.equal(await page.evaluate(() => window.dialogTest.requests.length), 2)
  await respond(page, 0, project("a", "Outdated"))
  await expect(page.getByText("Cargando datos del proyecto...")).toBeVisible()
  await expect(page.getByRole("button", { name: "Siguiente" })).toBeDisabled()
  await respond(page, 1, project("a", "Current"))
  await expect(nameInput(page)).toHaveValue("Current")
})

test("a late failure cannot replace the reopened form or reset its local edits", async (t) => {
  const page = await fixture(t)
  await render(page, { isOpen: false })
  await render(page, { isOpen: true })
  await respond(page, 1, project("a"))
  await expect(nameInput(page)).toHaveValue("Study a")
  await nameInput(page).fill("Edited name")
  await page.evaluate(() => window.dialogTest.requests[0].reject(new Error("Stale request")))
  await expect(page.getByText("No se pudo cargar la información del proyecto para editar.")).toHaveCount(0)
  await render(page, { projectId: "a" })
  await expect(nameInput(page)).toHaveValue("Edited name")
  assert.equal(await page.evaluate(() => window.dialogTest.requests.length), 2)
})

test("editing and saving loaded metadata preserves the existing wizard flow", async (t) => {
  const page = await fixture(t)
  await respond(page, 0, project("a", "Original-9ac9ef2b-20260324225557"))
  await expect(nameInput(page)).toHaveValue("Original")
  await nameInput(page).fill("Edited study")
  await page.getByRole("textbox", { name: "Descripción" }).fill("Updated description")
  for (let step = 1; step < 4; step++) {
    await page.getByRole("button", { name: "Siguiente" }).click()
    await expect(page.getByText(`Paso ${step + 1} de 4`)).toBeVisible()
  }
  await page.getByRole("button", { name: "Guardar cambios" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  const { updates, saved } = await page.evaluate(() => window.dialogTest)
  assert.deepEqual(updates, [{ id: "a", data: { name: "Edited study", description: "Updated description", status: "active" } }])
  assert.equal(saved[0].id, "a")
  assert.equal(saved[0].name, "Edited study")
  assert.deepEqual(saved[0].sensors, ["EEG"])
  assert.equal(saved[0].participants, 1)
})
