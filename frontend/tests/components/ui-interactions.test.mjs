import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import { chromium, expect } from "@playwright/test"
import { browserBundle } from "../browserBundle.mjs"

const bundle = browserBundle(`
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { CreateProjectStep2 } from '@/features/projects/create-project/CreateProjectStep2';
  import { CreateProjectStep3 } from '@/features/projects/create-project/CreateProjectStep3';
  import { ReportScopeCard } from '@/features/reports/components/ReportScopeCard';
  import { ReportConfigurationCard } from '@/features/reports/components/ReportConfigurationCard';
  import { ExportOptionsCard } from '@/features/reports/components/ExportOptionsCard';
  import { KpiCard } from '@/features/analytics/components/KpiCard';
  import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
  import { Activity } from 'lucide-react';
  function Fixture({mode}) {
    const [sensors,setSensors]=useState(['EEG']);
    const [participants,setParticipants]=useState([{id:'P01',sex:'male',age:'25'},{id:'P02',sex:'',age:''}]);
    const [scope,setScope]=useState('participant');
    const [participant,setParticipant]=useState('');
    const [reportMode,setReportMode]=useState('comparative');
    const [sensor,setSensor]=useState('EyeTracker');
    const [options,setOptions]=useState({includeCover:true,includeMetadata:true});
    const [downloads,setDownloads]=useState(0);
    const [clicks,setClicks]=useState(0);
    const [placement,setPlacement]=useState('contain');
    return <>
      {mode==='wizard' && <><CreateProjectStep2 selectedSensors={sensors} onToggleSensor={sensor=>setSensors(prev=>prev.includes(sensor)?prev.filter(x=>x!==sensor):[...prev,sensor])}/>
      <CreateProjectStep3 participants={participants} onUpdateParticipant={(id,field,value)=>setParticipants(prev=>prev.map(p=>p.id===id?{...p,[field]:value}:p))}/></>}
      {mode==='reports' && <><ReportScopeCard participants={[{participant_code:'P01'},{participant_code:'P02'}]} selectedParticipant={participant} scopeKind={scope} onScopeKindChange={setScope} onParticipantChange={setParticipant} loading={false}/>
      <ReportConfigurationCard reportMode={reportMode} onReportModeChange={setReportMode} availableSensors={['EyeTracker','GSR']} selectedSensor={sensor} onSensorChange={setSensor}/>
      <ExportOptionsCard enabled options={options} onToggleOption={key=>setOptions(prev=>({...prev,[key]:!prev[key]}))} canDownload onDownload={()=>setDownloads(n=>n+1)}/></>}
      {mode==='kpi' && <KpiCard label="Mínimo" value={2.5} Icon={Activity} onClick={()=>setClicks(n=>n+1)} tooltip="Valor mínimo observado" active={clicks>0}/>}
      {mode==='dialog' && <Dialog defaultOpen><DialogContent><DialogTitle>Presentación</DialogTitle><DialogDescription>Modo del estímulo</DialogDescription>
      <Select value={placement} onValueChange={setPlacement}><SelectTrigger aria-label="Modo de presentación"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="contain">Contain</SelectItem><SelectItem value="cover">Cover</SelectItem></SelectContent></Select>
      </DialogContent></Dialog>}
      <output id="state">{JSON.stringify({sensors,participants,scope,participant,reportMode,sensor,options,downloads,clicks,placement})}</output>
    </>;
  }
  const root=createRoot(document.getElementById('root'));
  window.mountFixture=mode=>root.render(<Fixture mode={mode}/>);
`)

let browser
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })
async function fixture(t, mode) {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  t.after(async () => { await page.close(); assert.deepEqual(errors, []) })
  await page.setContent('<div id="root"></div>')
  await page.addScriptTag({ content: bundle })
  await page.evaluate(mode => window.mountFixture(mode), mode)
  await expect(page.locator("#state")).toBeVisible()
  return page
}
const state = async page => JSON.parse(await page.locator("#state").textContent())

test("sensor cards toggle once and participant disclosures preserve demographics", async t => {
  const page = await fixture(t, "wizard")
  await expect(page.getByRole("checkbox", { name: "Electroencefalógrafo", exact: true })).toBeChecked()
  await page.getByText("Sensor Galvánico", { exact: true }).click()
  assert.deepEqual((await state(page)).sensors, ["EEG", "GSR"])
  await page.getByRole("checkbox", { name: "Sensor Galvánico", exact: true }).focus()
  await page.keyboard.press("Space")
  assert.deepEqual((await state(page)).sensors, ["EEG"])
  await page.getByRole("button", { name: /^P02/ }).click()
  await page.getByRole("radio", { name: "Femenino", exact: true }).click()
  await page.getByLabel("Edad", { exact: true }).fill("31")
  await page.getByRole("button", { name: "P01", exact: true }).click()
  await expect(page.getByLabel("Edad", { exact: true })).toHaveValue("25")
  assert.deepEqual((await state(page)).participants[1], { id: "P02", sex: "female", age: "31" })
})

test("report scope, sensor radios and export options keep independent selections", async t => {
  const page = await fixture(t, "reports")
  await page.getByRole("combobox").click()
  await page.getByRole("option", { name: "Sujeto P02", exact: true }).click()
  await page.getByRole("radio", { name: /Resumen de todos/ }).click()
  assert.equal((await state(page)).scope, "all-participants")
  await expect(page.getByRole("combobox")).toHaveCount(0)
  await page.getByRole("radio", { name: "Un participante", exact: true }).click()
  await expect(page.getByRole("combobox")).toContainText("P02")
  await page.getByRole("radio", { name: /Informe por sensor/ }).click()
  await page.getByRole("radio", { name: "GSR", exact: true }).click()
  await page.keyboard.press("ArrowLeft", { delay: 50 })
  await expect(page.getByRole("radio", { name: "Eye tracker", exact: true })).toBeChecked()
  assert.equal((await state(page)).sensor, "EyeTracker")
  assert.equal((await state(page)).reportMode, "by-sensor")
  await page.getByRole("checkbox", { name: /Incluir portada/ }).click()
  await page.getByRole("button", { name: "Descargar reporte PDF", exact: true }).click()
  assert.deepEqual((await state(page)).options, { includeCover: false, includeMetadata: true })
  assert.equal((await state(page)).downloads, 1)
})

test("select inside a dialog returns focus and Escape closes one layer at a time", async t => {
  const page = await fixture(t, "dialog")
  const trigger = page.getByRole("combobox", { name: "Modo de presentación" })
  await trigger.click()
  await page.getByRole("option", { name: "Cover", exact: true }).click()
  await expect(trigger).toBeFocused()
  assert.equal((await state(page)).placement, "cover")
  await trigger.press("Enter")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(trigger).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
})

test("interactive KPI uses native button keyboard behavior and a separate tooltip trigger", async t => {
  const page = await fixture(t, "kpi")
  const action = page.getByRole("button", { name: /^Mínimo:/ })
  await action.focus()
  await page.keyboard.press("Enter")
  await page.keyboard.press("Space")
  assert.equal((await state(page)).clicks, 2)
  await expect(action).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "Información sobre Mínimo" }).focus()
  await expect(page.getByRole("tooltip")).toContainText("Valor mínimo observado")
  assert.equal((await state(page)).clicks, 2)
})
