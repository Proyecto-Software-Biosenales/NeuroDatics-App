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
        try { dependency = resolve.resolve(name) }
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
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { ProjectSelect } from '@/features/projects/components/ProjectSelect';
  import { FiltersBar } from '@/features/analytics/components/FiltersBar';
  import { ReportScopeCard } from '@/features/reports/components/ReportScopeCard';
  const projects = [
    {id:'a', name:'Alpha study', sensors:['EEG']},
    {id:'b', name:'Beta study', sensors:['GSR']},
    {id:'c', name:'Gamma study', sensors:['EyeTracker']},
  ];
  const participants = [{participant_code:'P01', user_index:1}, {participant_code:'P02', user_index:2}];
  function Fixture({mode, disabled=false}) {
    const [project, setProject] = useState('');
    const [participant, setParticipant] = useState(null);
    const [scenario, setScenario] = useState('all');
    const [scope, setScope] = useState('participant');
    return <><div id="controls">
      {mode === 'project' && <ProjectSelect projects={projects} value={project} onChange={setProject} />}
      {mode === 'filters' && <FiltersBar scenarios={[{name:'Alpha scenario',type:'image'},{name:'Beta scenario',type:'image'}]}
        participants={disabled ? [] : participants} selectedScenario={scenario} selectedParticipant={participant}
        onScenarioChange={setScenario} onParticipantChange={setParticipant}
        scenariosLoading={disabled} participantsLoading={disabled} />}
      {mode === 'report' && <ReportScopeCard participants={participants} selectedParticipant={participant ?? ''}
        scopeKind={scope} onScopeKindChange={setScope} onParticipantChange={setParticipant} loading={disabled} />}
    </div><button id="after">After selector</button>
    <output id="selection">{JSON.stringify({project,participant,scenario})}</output></>;
  }
  window.mount = (mode, disabled) => createRoot(document.getElementById('root')).render(<Fixture mode={mode} disabled={disabled} />);
`)

let browser
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })

async function fixture(t, mode, disabled = false) {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  t.after(async () => {
    await page.close()
    assert.deepEqual(errors, [])
  })
  await page.setContent('<html><body><div id="root"></div></body></html>')
  await page.addScriptTag({ content: bundle })
  await page.evaluate(({ mode, disabled }) => window.mount(mode, disabled), { mode, disabled })
  await page.locator("#selection").waitFor()
  return page
}

test("project selection preserves placeholder, rich options, controlled label and focus", async (t) => {
  const page = await fixture(t, "project")
  const trigger = page.locator('[data-slot="combobox-trigger"]')
  await expect(trigger).toContainText("Selecciona un proyecto")
  await expect(trigger).toHaveAttribute("role", "combobox")
  await trigger.click()
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  await expect(page.getByRole("listbox")).toHaveAttribute("id", await trigger.getAttribute("aria-controls"))
  await expect(page.locator("#controls").getByRole("listbox")).toHaveCount(0)
  const beta = page.getByRole("option", { name: /Beta study/ })
  await expect(beta).toContainText("GSR")
  await beta.click()
  await expect(trigger).toHaveText("Beta study")
  await expect(trigger).toHaveAttribute("aria-expanded", "false")
  await expect(trigger).toBeFocused()
  assert.equal(JSON.parse(await page.locator("#selection").textContent()).project, "b")
  await trigger.click()
  await expect(page.getByRole("option", { name: /Beta study/ })).toHaveAttribute("aria-selected", "true")
  await page.keyboard.press("Escape")
})

test("keyboard navigation selects an option and Escape cancels without changing selection", async (t) => {
  const page = await fixture(t, "project")
  const trigger = page.locator('[data-slot="combobox-trigger"]')
  await trigger.focus()
  await page.keyboard.press("ArrowDown")
  await expect(page.getByRole("option", { name: /Alpha study/ })).toBeFocused()
  await page.keyboard.press("End")
  await expect(page.getByRole("option", { name: /Gamma study/ })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(trigger).toHaveText("Gamma study")
  await expect(trigger).toBeFocused()
  await page.keyboard.press("Space")
  await expect(page.getByRole("option", { name: /Gamma study/ })).toBeFocused()
  await page.keyboard.press("Home")
  await expect(page.getByRole("option", { name: /Alpha study/ })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(trigger).toHaveText("Gamma study")
  await expect(trigger).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(page.locator("#after")).toBeFocused()
})

test("typeahead finds project names while the option list is open", async (t) => {
  const page = await fixture(t, "project")
  const trigger = page.locator('[data-slot="combobox-trigger"]')
  await trigger.click()
  await expect(page.getByRole("option", { name: /Alpha study/ })).toBeFocused()
  await page.keyboard.type("Beta")
  await expect(page.getByRole("option", { name: /Beta study/ })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(trigger).toHaveText("Beta study")
  assert.equal(await page.getByRole("textbox").count(), 0)
})

test("analytics filters preserve all-scenarios and null participant selection", async (t) => {
  const page = await fixture(t, "filters")
  const triggers = page.locator('[data-slot="combobox-trigger"]')
  await expect(triggers.nth(0)).toContainText("Todos los escenarios")
  await expect(triggers.nth(1)).toContainText("Sin sujetos")
  await triggers.nth(0).click()
  await page.getByRole("option", { name: "Beta scenario", exact: true }).click()
  await expect(triggers.nth(0)).toContainText("Beta scenario")
  await triggers.nth(1).click()
  await page.getByRole("option", { name: "Sujeto P02", exact: true }).click()
  assert.deepEqual(JSON.parse(await page.locator("#selection").textContent()), {
    project: "", participant: "P02", scenario: "Beta scenario",
  })
})

test("loading and empty participant lists leave both analytics triggers disabled", async (t) => {
  const page = await fixture(t, "filters", true)
  const triggers = page.locator('[data-slot="combobox-trigger"]')
  await expect(triggers.nth(0)).toBeDisabled()
  await expect(triggers.nth(1)).toBeDisabled()
  assert.equal(await page.getByRole("option").count(), 0)
})

test("report participant selection remains operable inside its radio label", async (t) => {
  const page = await fixture(t, "report")
  const trigger = page.locator('[data-slot="combobox-trigger"]')
  await expect(trigger).toContainText("Selecciona un participante")
  await trigger.click()
  await page.getByRole("option", { name: "Sujeto P01", exact: true }).click()
  assert.equal(JSON.parse(await page.locator("#selection").textContent()).participant, "P01")
  await expect(trigger).toBeFocused()
})

test("report loading state shows its placeholder and disables selection", async (t) => {
  const page = await fixture(t, "report", true)
  const trigger = page.locator('[data-slot="combobox-trigger"]')
  await expect(trigger).toContainText("Cargando...")
  await expect(trigger).toBeDisabled()
})
