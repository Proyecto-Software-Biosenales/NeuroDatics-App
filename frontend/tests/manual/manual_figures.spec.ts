// Annotated figures for the usage manual (mydocs-priv/manual/indice.md), with the API simulated and
// synthetic data. Output: manual/figuras/<id>.png (2x) and output/manual/figuras/<id>.json.
// Run all:  cd frontend; npx playwright test -c playwright.manual.config.ts manual_figures
// One figure or group:  ... manual_figures -g "3-1"
import { test, expect, type Locator, type Page } from "@playwright/test"
import { captureFigure } from "./manualAnnotate"
import { ensureAssets, FOLDER_FULL, FOLDER_NO_VIDEOS } from "./manualAssets"
import {
  DEMO_ID, DEMO_NAME, demoProject, pilotProject, pendingDraft, readyDraft,
  archivedProject, installMocks, stable,
} from "./manualMocks"
import { ensureHeatmaps, installDashboardMocks } from "./manualDashboardMocks"

test.use({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  locale: "es-CO",
  timezoneId: "America/Bogota",
  colorScheme: "light",
})

test.beforeAll(async ({ browser }) => {
  await ensureAssets(browser)
  await ensureHeatmaps(browser)
})

// Opens a page after the simulation is installed and waits for fonts and animations.
async function open(page: Page, url: string) {
  await page.goto(url)
  await stable(page)
}

const button = (page: Page, name: string | RegExp, exact = true) => page.getByRole("button", { name, exact: typeof name === "string" ? exact : undefined })

test.describe("capítulo 1 · conocer", () => {
  test("1-1 cabecera", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 400 })
    await installMocks(page)
    await open(page, "/")
    const header = page.locator("header").first()
    await expect(header).toBeVisible()
    await captureFigure(page, {
      id: "1-1",
      maxWidth: 1100,
      margin: 6,
      region: header,
      callouts: [
        { number: 1, target: [page.getByRole("link", { name: "Inicio", exact: true }), page.getByRole("link", { name: "Informes", exact: true })], from: "bottom", length: 24 },
        { number: 2, target: button(page, "Cambiar tema"), from: "bottom", length: 24, pad: 3 },
        { number: 3, target: button(page, "Menú de usuario"), from: "bottom", length: 24 },
      ],
    })
  })

  test("1-2 acceso", async ({ page }) => {
    await installMocks(page, { authenticated: false })
    await open(page, "/login")
    const google = button(page, "Continuar con Google")
    await expect(google).toBeVisible()
    await captureFigure(page, {
      id: "1-2",
      region: page.locator("[data-slot=card]").first(),
      callouts: [{ target: google, from: "right", length: 60 }],
    })
  })
})

const cardOf = (page: Page, name: string) => page.locator("[data-slot=card]").filter({ hasText: name })

test.describe("capítulo 3 · proyectos", () => {
  test("3-1 lista", async ({ page }) => {
    await page.setViewportSize({ width: 660, height: 760 })
    await installMocks(page, { projects: [demoProject, pilotProject, pendingDraft, archivedProject] })
    await open(page, "/proyectos")
    await expect(page.getByText(DEMO_NAME, { exact: true })).toBeVisible()
    await captureFigure(page, {
      id: "3-1",
      margin: 12,
      region: [page.getByRole("heading", { name: "Proyectos", exact: true }), cardOf(page, DEMO_NAME)],
      callouts: [
        { number: 1, target: [button(page, "Todos"), button(page, "Archivados")], from: "top", shift: 230, length: 40 },
        { number: 2, target: button(page, "Crear proyecto"), from: "left", length: 50 },
        { number: 3, target: button(page, "Opciones del proyecto").first(), from: "left", length: 60 },
      ],
    })
  })

  test("3-2 tarjetas", async ({ page }) => {
    await page.setViewportSize({ width: 660, height: 900 })
    await installMocks(page, { projects: [pendingDraft, readyDraft, pilotProject] })
    await open(page, "/proyectos")
    await expect(page.getByText(pilotProject.name, { exact: true })).toBeVisible()
    await captureFigure(page, {
      id: "3-2",
      region: [cardOf(page, pendingDraft.name), cardOf(page, pilotProject.name)],
      callouts: [
        { target: button(page, "Retomar"), from: "left", length: 40 },
        { target: button(page, "Continuar"), from: "left", length: 40 },
        { target: button(page, "Subir"), from: "left", length: 40 },
      ],
    })
  })

  test("3-10 menú de la tarjeta", async ({ page }) => {
    await page.setViewportSize({ width: 660, height: 760 })
    await installMocks(page, { projects: [demoProject, pilotProject] })
    await open(page, "/proyectos")
    await button(page, "Opciones del proyecto").first().click()
    const archive = page.getByRole("menuitem", { name: "Archivar" })
    await expect(archive).toBeVisible()
    await captureFigure(page, {
      id: "3-10",
      region: [cardOf(page, DEMO_NAME), page.getByRole("menu")],
      callouts: [{ target: archive, from: "left", length: 50 }],
    })
  })
})

// Opens the project wizard from the list, in the viewport used for the dialogs.
async function openWizard(page: Page, options: Parameters<typeof installMocks>[1] = {}, height = 1000) {
  await page.setViewportSize({ width: 740, height })
  const mock = await installMocks(page, { projects: [demoProject], ...options })
  await open(page, "/proyectos")
  await button(page, "Crear proyecto").first().click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await stable(page)
  return mock
}

async function chooseFolder(page: Page, folder: string, name = DEMO_NAME) {
  const dialog = page.getByRole("dialog")
  await dialog.locator("input[type=file]").setInputFiles(folder)
  await page.getByRole("textbox", { name: "Nombre del proyecto" }).fill(name)
  await page.waitForTimeout(500)
}

test.describe("asistente · paso 1", () => {
  test("3-3 paso 1 vacío", async ({ page }) => {
    await openWizard(page, {}, 1200)
    const dialog = page.getByRole("dialog")
    await hideBlocks(page, [...wizardSpare(page), page.getByRole("dialog").getByText("Pantalla de la adquisición", { exact: false })])
    const top = await button(page, "Con datos").locator("xpath=..").boundingBox()
    if (!top) throw new Error("sin selector de tipo")
    await captureFigure(page, {
      id: "3-3",
      margin: 6,
      region: await dialogFrom(dialog, top.y - 6),
      callouts: [
        { number: 1, target: page.getByRole("group", { name: "Tipo de proyecto" }), from: "right", length: 60 },
        { number: 2, target: page.getByRole("textbox", { name: "Nombre del proyecto" }), from: "top", shift: 200, length: 30 },
        { number: 3, target: button(page, "Seleccionar carpeta"), from: "right", length: 80 },
      ],
    })
  })

  test("2-1 paso 1 con carpeta", async ({ page }) => {
    await openWizard(page, {}, 1300)
    await chooseFolder(page, FOLDER_FULL)
    const dialog = page.getByRole("dialog")
    await hideBlocks(page, wizardSpare(page))
    const label = await page.getByText("Nombre del proyecto", { exact: true }).first().boundingBox()
    if (!label) throw new Error("sin etiqueta")
    await captureFigure(page, {
      id: "2-1",
      margin: 6,
      region: await trimBottom(await dialogFrom(dialog, label.y - 8), 8),
      callouts: [
        { number: 1, target: page.getByRole("textbox", { name: "Nombre del proyecto" }), from: "top", shift: 200, length: 26 },
        { number: 2, target: page.getByText("Carpeta seleccionada:").locator("xpath=.."), from: "right", length: 60 },
        { number: 3, target: button(page, "Siguiente"), from: "top", length: 30 },
      ],
    })
  })
})

/** Hides blocks that the text does not mention so a tall dialog fits in the figure (figure only). */
async function hideBlocks(page: Page, blocks: Locator[]) {
  for (const block of blocks) {
    if (await block.count()) await block.first().evaluate((element) => { (element as HTMLElement).style.display = "none" })
  }
  await page.waitForTimeout(300)
}

/** Rectangle from page y `top` down to the dialog's bottom edge, over the dialog's width. */
async function dialogFrom(dialog: Locator, top: number) {
  const box = await dialog.boundingBox()
  if (!box) throw new Error("sin diálogo")
  return { x: box.x, y: top, width: box.width, height: box.y + box.height - top }
}

/** The rectangle with `px` CSS px cut from its bottom edge (keeps the dialog's shadow out of the figure). */
function trimBottom(box: { x: number; y: number; width: number; height: number }, px: number) {
  return { ...box, height: box.height - px }
}

/** From the first participant card down to the fourth, across the dialog. */
async function participantsBox(page: Page) {
  const dialog = await page.getByRole("dialog").boundingBox()
  const first = await page.getByText("Participante 1", { exact: true }).boundingBox()
  const last = await page.getByText("Completar", { exact: true }).boundingBox()
  if (!dialog || !first || !last) throw new Error("sin participantes")
  return { x: dialog.x + 8, y: first.y - 22, width: dialog.width - 16, height: last.y + last.height / 2 + 34 - (first.y - 22) }
}

/** The element's box shrunk by `inset` CSS px on every side. */
async function insetBox(target: Locator, inset: number) {
  const box = await target.boundingBox()
  if (!box) throw new Error("sin caja")
  return { x: box.x + inset, y: box.y + inset, width: box.width - inset * 2, height: box.height - inset * 2 }
}

/** Blocks of step 1 of the wizard that the manual does not mention. */
const wizardSpare = (page: Page) => [
  page.getByText("Pantalla distinta a la configuración", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]"),
  page.getByText("Descripción", { exact: true }).locator("xpath=.."),
  page.getByRole("dialog").locator("section"),
]

test.describe("datos · carpeta", () => {
  test("4-1 zona de carga", async ({ page }) => {
    await openWizard(page, {}, 1300)
    await chooseFolder(page, FOLDER_FULL)
    const summary = page.locator("div.bg-muted").filter({ hasText: "CSV a procesar" }).last()
    await captureFigure(page, {
      id: "4-1",
      region: [page.getByText("Carpeta del experimento", { exact: true }), summary],
      callouts: [
        { number: 1, target: [button(page, "Seleccionar carpeta"), page.getByText("Carpeta seleccionada:")], from: "right", length: 60 },
        { number: 2, target: summary, from: "top", shift: 250, length: 22 },
      ],
    })
  })

  test("4-2 confirma la carpeta", async ({ page }) => {
    await openWizard(page, {}, 1000)
    await chooseFolder(page, FOLDER_NO_VIDEOS)
    await expect(page.getByText("Confirma la carpeta")).toBeVisible()
    const yes = button(page, "Sí, continuar")
    // Room under the buttons for the arrow, inside the notice (figure only).
    const notice = page.getByText("Confirma la carpeta").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")
    await notice.evaluate((element) => { (element as HTMLElement).style.paddingBottom = "44px" })
    await page.waitForTimeout(300)
    await captureFigure(page, {
      id: "4-2",
      margin: 10,
      region: [page.getByText("Carpeta del experimento", { exact: true }), notice],
      callouts: [{ target: yes, from: "bottom", length: 30 }],
    })
  })

  test("4-4 ubicación del estímulo", async ({ page }) => {
    await openWizard(page, {}, 1500)
    await chooseFolder(page, FOLDER_FULL)
    await page.getByText("Ubicación del estímulo en pantalla", { exact: true }).click()
    await page.getByRole("checkbox", { name: /Registrar la ubicación de Images.Página principal/ }).click()
    await page.waitForTimeout(300)
    const mode = page.getByRole("combobox", { name: /¿Cómo se mostró\?/ })
    await mode.click()
    await page.getByRole("option", { name: "Pantalla completa" }).click()
    await page.waitForTimeout(300)
    const acquisition = page.getByText("Pantalla de la adquisición (px)").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")
    await captureFigure(page, {
      id: "4-4",
      margin: 6,
      region: page.getByRole("dialog").locator("section"),
      callouts: [
        { number: 1, target: acquisition, from: "top", length: 22 },
        { number: 2, target: mode, from: "top", shift: 150, length: 22 },
      ],
    })
  })
})

// Goes through step 1 of the wizard with the full folder and lands on step 2.
async function toStep2(page: Page, project: { folder?: string; name?: string } = {}) {
  await chooseFolder(page, project.folder ?? FOLDER_FULL, project.name)
  await button(page, "Siguiente").click()
  await expect(page.getByText("Paso 2 de 4")).toBeVisible({ timeout: 15000 })
  await stable(page)
}

test.describe("asistente · pasos 2 y 3", () => {
  test("3-4 paso 2 sensores", async ({ page }) => {
    await openWizard(page, {}, 1000)
    await toStep2(page)
    const detected = page.getByText("Detectado", { exact: true }).first()
    await captureFigure(page, {
      id: "3-4",
      margin: 0,
      region: await insetBox(page.getByRole("dialog"), 4),
      callouts: [{ target: detected, from: "right", length: 70 }],
    })
  })

  test("3-5 paso 3 participantes", async ({ page }) => {
    await openWizard(page, {}, 1300)
    await toStep2(page)
    await button(page, "Siguiente").click()
    await expect(page.getByText("Paso 3 de 4")).toBeVisible()
    await stable(page)
    // The notice and the third participant are not part of the text (figure only).
    await hideBlocks(page, [
      page.getByText(/participantes requieren sexo y edad/).locator("xpath=ancestor-or-self::div[contains(@class,'rounded')][1]"),
      page.getByText("Participante 3", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]"),
    ])
    await captureFigure(page, {
      id: "3-5",
      region: page.getByRole("dialog"),
      callouts: [
        { number: 1, target: page.getByRole("combobox", { name: /^Sexo/ }).first(), from: "bottom", shift: 120, length: 30 },
        { number: 2, target: page.getByRole("spinbutton", { name: /^Edad/ }).first(), from: "bottom", shift: 120, length: 30 },
      ],
    })
  })
})

test.describe("datos · procesamiento y asignación", () => {
  test("4-3 progreso", async ({ page }) => {
    const mock = await openWizard(page, { upload: "hold" }, 1300)
    await chooseFolder(page, FOLDER_FULL)
    await button(page, "Siguiente").click()
    const panel = page.locator("div").filter({ has: page.getByText("VELOCIDAD") }).filter({ has: page.getByText("% completado") }).last()
    await expect(page.getByText("RESTANTE")).toBeVisible({ timeout: 15000 })
    await expect(page.getByText("8.4 MB/s")).toBeVisible({ timeout: 15000 })
    await stable(page)
    await captureFigure(page, {
      id: "4-3",
      margin: 12,
      region: panel,
      callouts: [
        { number: 1, target: page.getByRole("progressbar", { name: "Sincronización del proyecto" }), from: "top", length: 18 },
        { number: 2, target: page.getByText("RESTANTE").locator("xpath=.."), from: "top", length: 20 },
        { number: 3, target: panel.getByRole("button", { name: "Cancelar" }), from: "top", length: 20 },
      ],
    })
    mock.releaseUpload()
  })

  test("4-5 asignar documento", async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 1300 })
    await installMocks(page, { projects: [demoProject, pilotProject] })
    await open(page, "/proyectos")
    await button(page, "Subir").click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await stable(page)
    await toStep2(page, { name: pilotProject.name })
    await button(page, "Siguiente").click()
    await expect(page.getByText("Paso 3 de 4")).toBeVisible()
    await stable(page)
    await captureFigure(page, {
      id: "4-5",
      margin: 4,
      region: await participantsBox(page),
      callouts: [
        { number: 1, target: page.getByRole("combobox", { name: /Asignar documento/ }), from: "right", length: 60 },
        { number: 2, target: page.getByText("Sin asignar", { exact: true }), from: "left", length: 60 },
      ],
    })
  })
})

test.describe("proyectos · ver, editar, eliminar", () => {
  test("3-7 ver proyecto", async ({ page }) => {
    await page.setViewportSize({ width: 860, height: 1040 })
    await installMocks(page, { projects: [demoProject, pilotProject] })
    await open(page, "/proyectos")
    await button(page, "Ver proyecto").first().click()
    await expect(page.getByText("Información general", { exact: false }).first()).toBeVisible()
    await expect(page.getByText("Valentina Suárez")).toBeVisible()
    await page.waitForTimeout(800)
    await stable(page)
    // The scenario list is folded so the figure ends on a whole card.
    await page.getByText("Página principal", { exact: true }).first().click()
    await page.waitForTimeout(500)
    const dialog = page.getByRole("dialog")
    const box = await dialog.boundingBox()
    const scenario = await page.getByText("Página principal", { exact: true }).first().boundingBox()
    if (!box || !scenario) throw new Error("sin diálogo")
    await captureFigure(page, { id: "3-7", margin: 0, region: { x: box.x, y: box.y, width: box.width, height: scenario.y + 74 - box.y } })
  })

  test("3-8 editor", async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 640 })
    await installMocks(page)
    await open(page, `/proyectos/editar?proyecto=${DEMO_ID}`)
    await expect(page.getByRole("heading", { name: DEMO_NAME, level: 1 })).toBeVisible()
    await page.getByRole("textbox", { name: "Descripción" }).fill("Efecto de dos anuncios sobre la atención visual en una página web de café.")
    await expect(page.getByText("Hay cambios sin guardar.")).toBeVisible()
    await captureFigure(page, {
      id: "3-8",
      region: [page.getByRole("heading", { name: DEMO_NAME, level: 1 }), button(page, "Guardar cambios")],
      callouts: [
        { number: 1, target: page.getByRole("tablist", { name: "Secciones del proyecto" }), from: "top", shift: 250, length: 22 },
        { number: 2, target: page.getByText("Hay cambios sin guardar."), from: "bottom", length: 22 },
        { number: 3, target: button(page, "Guardar cambios"), from: "bottom", length: 22 },
      ],
    })
  })

  test("3-9 participantes", async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 1700 })
    await installMocks(page)
    await open(page, `/proyectos/editar?proyecto=${DEMO_ID}`)
    await page.getByRole("tab", { name: /^Participantes/ }).click()
    await expect(page.getByRole("group", { name: "Participante 4" })).toBeVisible()
    await page.waitForTimeout(500)
    await stable(page)
    // The notes boxes are not part of the text (figure only).
    await page.evaluate(() => {
      document.querySelectorAll("label, span, div, p").forEach((node) => {
        if (node.children.length === 0 && node.textContent?.trim() === "Notas del participante") (node.parentElement as HTMLElement).style.display = "none"
      })
    })
    await page.waitForTimeout(300)
    await captureFigure(page, {
      id: "3-9",
      margin: 6,
      region: [page.getByRole("group", { name: "Participante 3" }), page.getByRole("group", { name: "Participante 4" })],
      callouts: [
        { number: 1, target: page.getByRole("textbox", { name: /^Documento/ }).nth(2), from: "top", shift: 150, length: 18 },
        { number: 2, target: page.getByRole("combobox", { name: /Asignar documento/ }), from: "right", length: 60 },
      ],
    })
  })

  test("3-6 áreas de interés", async ({ page }) => {
    await page.setViewportSize({ width: 880, height: 1400 })
    await installMocks(page)
    await open(page, `/proyectos/editar?proyecto=${DEMO_ID}`)
    await page.getByRole("tab", { name: /^Áreas de interés/ }).click()
    await expect(page.getByText("AOIs creadas (2)")).toBeVisible()
    await page.waitForTimeout(1000)
    await stable(page)
    const colors = page.getByRole("button", { name: /^Usar color/ })
    // Room inside the toolbar card for the numbered circles (figure only).
    await page.getByText("Nueva AOI").locator("xpath=ancestor::div[contains(@class,'rounded')][1]").evaluate((element) => { (element as HTMLElement).style.paddingTop = "40px" })
    await page.waitForTimeout(300)
    const nueva = await page.getByText("Nueva AOI").boundingBox()
    const row = await page.getByRole("textbox", { name: /AOI|Titular|Producto/ }).first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]").boundingBox()
    if (!nueva || !row) throw new Error("sin editor de AOI")
    await captureFigure(page, {
      id: "3-6",
      margin: 3,
      region: { x: row.x - 6, y: nueva.y - 52, width: row.width + 12, height: row.y + row.height + 1 - (nueva.y - 52) },
      callouts: [
        { number: 1, target: [button(page, "Dibujar silueta fiel"), button(page, "Dibujar círculo")], from: "top", shift: 60, length: 18 },
        { number: 2, target: [colors.first(), colors.nth(5)], from: "top", length: 18 },
        { number: 3, target: page.getByText("AOIs creadas (2)"), from: "right", length: 80 },
      ],
    })
  })

  test("3-11 eliminar paso 2", async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 640 })
    await installMocks(page, { projects: [demoProject, pilotProject] })
    await open(page, "/proyectos")
    await button(page, "Opciones del proyecto").nth(1).click()
    await page.getByRole("menuitem", { name: "Eliminar" }).click()
    await button(page, "Continuar").click()
    const field = page.getByPlaceholder('Escribe "eliminar"')
    await field.fill("eliminar")
    await stable(page)
    await captureFigure(page, {
      id: "3-11",
      margin: 0,
      region: await insetBox(page.getByRole("alertdialog"), 3),
      callouts: [
        { number: 1, target: field, from: "bottom", shift: -120, length: 16 },
        { number: 2, target: button(page, "Eliminar proyecto"), from: "top", length: 22 },
      ],
    })
  })
})

// ---------- capítulo 5 · Dashboard ----------

type DashboardOptions = {
  width?: number
  height?: number
  /** Scenario in the first filter; omitted = "Todos los escenarios". */
  scenario?: string
  sensor?: "Eye tracker" | "Electroencefalógrafo" | "Sensor galvánico" | "Comparativas"
  tab?: string
}

async function openDashboard(page: Page, options: DashboardOptions = {}) {
  await page.setViewportSize({ width: options.width ?? 1000, height: options.height ?? 1500 })
  await installMocks(page)
  await installDashboardMocks(page)
  await open(page, `/dashboard?proyecto=${DEMO_ID}`)
  await expect(page.getByRole("button", { name: "Eye tracker", exact: true })).toBeVisible()
  await page.waitForTimeout(1500)
  if (options.scenario) {
    await page.locator('[data-slot="select-trigger"]').first().click()
    await page.getByRole("option", { name: options.scenario, exact: true }).click()
    await page.waitForTimeout(800)
  }
  if (options.sensor && options.sensor !== "Eye tracker") {
    await page.getByRole("button", { name: options.sensor, exact: true }).click()
    await page.waitForTimeout(1500)
  }
  if (options.tab) {
    await page.getByRole("tab", { name: options.tab, exact: true }).click()
    await page.waitForTimeout(1800)
  }
  await stable(page)
}

const cardWith = (page: Page, text: string | RegExp) => page.locator("[data-slot=card]").filter({ hasText: text }).first()

/** Opens a gap above a control row so the numbered circles do not cover the text over it (figure only). */
async function spaceAbove(row: Locator, px: number) {
  await row.evaluate((element, gap) => { (element as HTMLElement).style.marginTop = `${gap}px` }, px)
  await row.page().waitForTimeout(300)
}

/** Lets truncated texts inside `scope` wrap, so no label ends in an ellipsis (figure only). */
async function unTruncate(scope: Locator) {
  await scope.evaluate((root) => {
    root.querySelectorAll<HTMLElement>("*").forEach((node) => {
      const style = getComputedStyle(node)
      if (style.textOverflow === "ellipsis") {
        node.style.whiteSpace = "normal"
        node.style.overflow = "visible"
        node.style.textOverflow = "clip"
      }
    })
  })
  await scope.page().waitForTimeout(300)
}

/** Clicks the chart at a fraction of its plot width, moving the mouse first so the chart registers the point. */
async function clickChart(page: Page, fraction: number, index = 0) {
  const plot = page.locator(".recharts-wrapper").nth(index)
  const box = await plot.boundingBox()
  if (!box) throw new Error("sin gráfica")
  const x = box.x + 70 + (box.width - 100) * fraction
  const y = box.y + box.height * 0.45
  await page.mouse.move(x - 10, y)
  await page.mouse.move(x, y)
  await page.mouse.click(x, y)
  await page.waitForTimeout(1500)
}

test.describe("capítulo 5 · Dashboard", () => {
  test("5-1 vista general", async ({ page }) => {
    await openDashboard(page, { width: 1040, height: 690 })
    const sensors = ["Eye tracker", "Electroencefalógrafo", "Sensor galvánico", "Comparativas"].map((name) => button(page, name))
    // Figure only: the buttons at the right of the filters leave the window, and a gap under the tabs holds circle 3.
    for (const name of ["Comparar participantes", "Exportar informe"]) await button(page, name).evaluate((element) => { (element as HTMLElement).style.display = "none" })
    // The tabs after the fourth do not fit in the figure; they are left out so no label is cut at the right edge.
    await page.getByRole("tab").evaluateAll((tabs) => tabs.slice(4).forEach((tab) => { (tab as HTMLElement).style.display = "none" }))
    await spaceAbove(cardWith(page, "Diámetro pupilar a lo largo del tiempo").first(), 34)
    const firstTab = page.getByRole("tab", { name: "Dilatación pupilar", exact: true })
    const lastTab = page.getByRole("tab", { name: "Mapa de calor", exact: true })
    const last = await lastTab.boundingBox()
    if (!last) throw new Error("sin pestañas")
    // The figure stops after the last tab that fits, so no label is cut.
    const right = 1040
    await captureFigure(page, {
      id: "5-1",
      maxWidth: 1040,
      margin: 0,
      region: { x: 0, y: 0, width: right, height: 690 },
      callouts: [
        { number: 1, target: sensors, from: "right", length: 30, pad: 8, shift: -56 },
        { number: 2, target: [page.locator('[data-slot="select-trigger"]').first(), page.locator('[data-slot="select-trigger"]').nth(1)], from: "top", length: 24, pad: 6, shift: 110 },
        { number: 3, target: [firstTab, lastTab], from: "bottom", length: 26, shift: -230 },
      ],
    })
  })

  test("portada", async ({ page }) => {
    await openDashboard(page, { width: 1366, height: 860, scenario: "Página principal", tab: "Mapa de calor" })
    await captureFigure(page, { id: "portada", maxWidth: 1366, fullViewport: true })
  })

  test("5-2 dilatación pupilar", async ({ page }) => {
    await openDashboard(page, { scenario: "Página principal" })
    await button(page, "Ajustar").click()
    await page.waitForTimeout(2200)
    await spaceAbove(button(page, "Ajustar").locator("xpath=../.."), 34)
    const card = cardWith(page, "Diámetro pupilar a lo largo del tiempo")
    const timeWindow = page.getByRole("button", { name: /^Ventana temporal/ })
    await captureFigure(page, {
      id: "5-2",
      region: card,
      callouts: [
        { number: 1, target: page.getByRole("group", { name: "Modo de visualización" }), from: "top", length: 24 },
        { number: 2, target: button(page, "Ajustar"), from: "top", length: 24 },
        { number: 3, target: timeWindow, from: "top", length: 24 },
      ],
    })
  })

  test("5-3 punto sobre el estímulo", async ({ page }) => {
    await openDashboard(page, { scenario: "Página principal", height: 2300 })
    // Look for an instant where the gaze falls on the product, so the point is easy to read.
    for (const fraction of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85]) {
      await clickChart(page, fraction)
      const x = await page.getByText("POS X", { exact: true }).locator("xpath=..").innerText().catch(() => "")
      const y = await page.getByText("POS Y", { exact: true }).locator("xpath=..").innerText().catch(() => "")
      const px = Number(/(\d+)%/.exec(x)?.[1] ?? 0)
      const py = Number(/(\d+)%/.exec(y)?.[1] ?? 0)
      if (px >= 74 && px <= 88 && py >= 28 && py <= 44) break
    }
    const dot = page.locator("div.border-cyan-400").first()
    await expect(dot).toBeVisible()
    await page.mouse.move(5, 5)
    await captureFigure(page, {
      id: "5-3",
      margin: 8,
      region: cardWith(page, "Punto de fijación sobre estímulo visual"),
      callouts: [{ target: dot, from: "left", length: 60, pad: 8 }],
    })
  })

  test("5-4 histograma de fijaciones", async ({ page }) => {
    await openDashboard(page, { scenario: "Página principal", tab: "Histograma de fijaciones" })
    const duration = page.getByRole("combobox", { name: "Duración mínima de fijación" })
    // Room under the table for circle 2, inside its card (figure only).
    await cardWith(page, "Sensibilidad del umbral").evaluate((element) => { (element as HTMLElement).style.paddingBottom = "44px" })
    await page.waitForTimeout(300)
    await captureFigure(page, {
      id: "5-4",
      margin: 3,
      region: [duration, cardWith(page, "Sensibilidad del umbral")],
      callouts: [
        { number: 1, target: duration, from: "bottom", length: 26 },
        { number: 2, target: page.getByRole("table").first().locator("xpath=.."), from: "bottom", length: 22, shift: -200, pad: 3 },
      ],
    })
  })

  test("5-5 mapa de calor", async ({ page }) => {
    await openDashboard(page, { scenario: "Página principal", tab: "Mapa de calor" })
    const card = cardWith(page, "Representación visual de la densidad")
    // Room under the bar of controls for the numbered circles, inside the card (figure only).
    await card.evaluate((element) => { (element as HTMLElement).style.paddingBottom = "34px" })
    await page.waitForTimeout(300)
    await captureFigure(page, {
      id: "5-5",
      region: card,
      callouts: [
        { number: 1, target: button(page, /^Filtro violeta/), from: "bottom", length: 22, pad: 3 },
        { number: 2, target: button(page, /^AOIs/), from: "bottom", length: 22, pad: 3 },
      ],
    })
  })

  test("5-6 mapa de recorridos", async ({ page }) => {
    await openDashboard(page, { scenario: "Página principal", tab: "Mapa de recorridos", width: 1100 })
    const slider = page.getByRole("slider", { name: "Fijaciones visibles" })
    await slider.focus()
    for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowLeft")
    await page.waitForTimeout(500)
    const bar = slider.locator("xpath=ancestor::div[contains(@class,'rounded')][1]")
    await unTruncate(cardWith(page, "Recorrido visual con nodos numerados"))
    await captureFigure(page, {
      id: "5-6",
      region: cardWith(page, "Recorrido visual con nodos numerados"),
      callouts: [{ target: bar, from: "top", length: 40, shift: 150 }],
    })
  })

  test("5-7 comparativa de AOIs", async ({ page }) => {
    await openDashboard(page, { scenario: "Página principal", tab: "Comparativa AOIs", width: 1100 })
    const kpis = page.locator(".analytics-kpi-grid").first()
    await unTruncate(page.locator("main.analytics-shell"))
    // Closes the empty band between the summary cards and the chart card (figure only).
    await cardWith(page, "Fijaciones y concentración visual").evaluate((element) => { (element as HTMLElement).style.marginTop = "-26px" })
    await page.waitForTimeout(300)
    await captureFigure(page, { id: "5-7", region: [kpis, cardWith(page, "Fijaciones y concentración visual")] })
  })

  test("5-8 EEG por canal", async ({ page }) => {
    await openDashboard(page, { scenario: "Página principal", sensor: "Electroencefalógrafo" })
    const channels = page.getByLabel("Canales EEG")
    const mode = page.getByRole("button", { name: "Suavizada", exact: true }).locator("xpath=..")
    const layout = page.getByRole("button", { name: "Montaje", exact: true }).locator("xpath=..")
    await spaceAbove(mode.locator("xpath=.."), 34)
    await unTruncate(cardWith(page, "Trazas EEG sin corrección"))
    const first = channels.getByRole("button").first()
    const last = channels.getByRole("button").last()
    await captureFigure(page, {
      id: "5-8",
      region: cardWith(page, "Trazas EEG sin corrección"),
      callouts: [
        { number: 1, target: [first, last], from: "right", length: 40 },
        { number: 2, target: mode, from: "top", length: 24 },
        { number: 3, target: layout, from: "top", length: 24 },
      ],
    })
  })

  test("5-9 espectrograma", async ({ page }) => {
    await openDashboard(page, { scenario: "Página principal", sensor: "Electroencefalógrafo", tab: "Espectrograma de frecuencias", height: 1700 })
    await unTruncate(cardWith(page, "Densidad espectral por ventana"))
    const canvas = await page.locator("canvas").first().boundingBox()
    const card = await cardWith(page, "Densidad espectral por ventana").boundingBox()
    if (!canvas || !card) throw new Error("sin espectrograma")
    // Controls and the first channel panel only (the card holds one panel per channel).
    await captureFigure(page, {
      id: "5-9",
      margin: 4,
      region: { x: card.x, y: card.y, width: card.width, height: canvas.y + canvas.height + 50 - card.y },
    })
  })

  test("5-10 respuesta galvánica", async ({ page }) => {
    await openDashboard(page, { scenario: "Página principal", sensor: "Sensor galvánico" })
    await button(page, "Ajustar").click()
    await page.waitForTimeout(2200)
    await spaceAbove(button(page, "Ajustar").locator("xpath=../.."), 34)
    await captureFigure(page, {
      id: "5-10",
      region: cardWith(page, "Conductancia de la piel a lo largo del tiempo"),
      callouts: [
        { number: 1, target: button(page, "Suavizada").locator("xpath=.."), from: "top", length: 24 },
        { number: 2, target: button(page, "Ajustar"), from: "top", length: 24 },
      ],
    })
  })

  test("5-11 comparativas", async ({ page }) => {
    await openDashboard(page, { scenario: "Página principal", sensor: "Comparativas", height: 1500, width: 980 })
    const select = button(page, /^Gráficas a comparar/)
    const panelOf = (title: string) => page.getByRole("heading", { name: title, exact: true }).locator("xpath=ancestor::*[contains(@class,'rounded')][3]")
    const first = panelOf("Dilatación pupilar")
    await page.waitForTimeout(1200)
    await captureFigure(page, {
      id: "5-11",
      margin: 8,
      region: [page.getByRole("heading", { name: "Comparativas", level: 1 }), first],
      callouts: [
        { number: 1, target: select, from: "right", length: 60 },
        { number: 2, target: first, from: "top", length: 40, shift: 230 },
      ],
    })
  })

  test("5-12 comparar participantes", async ({ page }) => {
    await openDashboard(page, { scenario: "Página principal", width: 1000, height: 900 })
    await button(page, "Comparar participantes").first().click()
    const dialog = page.getByTestId("participant-comparison-dialog")
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(2500)
    await stable(page)
    await captureFigure(page, {
      id: "5-12",
      region: dialog,
      fullViewport: true,
      callouts: [
        { number: 1, target: button(page, /^Participantes:/), from: "bottom", length: 30 },
        { number: 2, target: page.getByRole("group", { name: "Modo de visualización" }), from: "bottom", length: 30 },
      ],
    })
  })
})

// ---------- capítulo 6 · pre-experimento y cuestionarios ----------

async function openPilotEditor(page: Page, tab?: string, height = 1100) {
  await page.setViewportSize({ width: 760, height })
  await installMocks(page, { projects: [demoProject, pilotProject] })
  await open(page, `/proyectos/editar?proyecto=${pilotProject.id}`)
  await expect(page.getByRole("heading", { name: pilotProject.name, level: 1 })).toBeVisible()
  if (tab) {
    await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click()
    await page.waitForTimeout(700)
  }
  await stable(page)
}

test.describe("capítulo 6 · pre-experimento", () => {
  test("6-1 crear pre-experimento", async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 1000 })
    await installMocks(page, { projects: [demoProject] })
    await open(page, "/proyectos")
    await button(page, "Crear proyecto").first().click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await button(page, "Pre-experimento").click()
    await page.getByRole("textbox", { name: /Nombre del proyecto/ }).fill("Piloto de cuestionario")
    await page.waitForTimeout(500)
    await stable(page)
    const dialog = page.getByRole("dialog")
    await captureFigure(page, {
      id: "6-1",
      region: dialog,
      callouts: [
        { number: 1, target: button(page, "Pre-experimento"), from: "right", length: 60 },
        { number: 2, target: dialog.getByRole("tablist"), from: "top", length: 24, shift: 220 },
        { number: 3, target: button(page, "Crear pre-experimento"), from: "top", length: 30 },
      ],
    })
  })

  test("6-2 participante planificado", async ({ page }) => {
    await openPilotEditor(page, "Participantes", 1100)
    const first = page.getByRole("group", { name: "Participante 1" })
    await captureFigure(page, {
      id: "6-2",
      region: first,
      callouts: [{ target: page.getByRole("textbox", { name: /^Documento/ }).first(), from: "top", length: 26, shift: 100 }],
    })
  })

  test("6-3 pregunta de selección múltiple", async ({ page }) => {
    await openPilotEditor(page, "Cuestionarios", 1300)
    const prompt = page.locator("textarea").nth(1)
    const type = page.getByRole("combobox").filter({ hasText: "Selección múltiple" })
    const add = button(page, "Agregar opción")
    const required = page.getByRole("checkbox", { name: "Obligatoria" }).nth(1)
    const pBox = await prompt.boundingBox()
    const aBox = await add.boundingBox()
    if (!pBox || !aBox) throw new Error("sin pregunta")
    await captureFigure(page, {
      id: "6-3",
      region: { x: pBox.x - 20, y: pBox.y - 62, width: pBox.width + 40, height: aBox.y + aBox.height + 24 - (pBox.y - 62) },
      callouts: [
        { number: 1, target: type, from: "bottom", length: 28, shift: 200 },
        { number: 2, target: add, from: "right", length: 60 },
        { number: 3, target: required.locator("xpath=.."), from: "top", length: 26 },
      ],
    })
  })

  test("6-4 pantalla del proyecto", async ({ page }) => {
    await openPilotEditor(page, "Pantalla", 1100)
    const distance = page.getByRole("spinbutton", { name: /^Distancia/ })
    const cardOfField = (field: Locator) => field.locator("xpath=ancestor::section[1]")
    const screen = cardOfField(page.getByRole("spinbutton", { name: /^Ancho \(px\)/ }))
    const physical = cardOfField(distance)
    // Room under the fields for the arrow, inside the card (figure only); the figure ends before the notes card.
    await physical.evaluate((element) => { (element as HTMLElement).style.paddingBottom = "44px" })
    await page.waitForTimeout(300)
    await captureFigure(page, {
      id: "6-4",
      margin: 4,
      region: [screen, physical],
      callouts: [{ target: distance, from: "bottom", length: 28 }],
    })
  })

  test("6-5 responder cuestionario", async ({ page }) => {
    await openPilotEditor(page, "Cuestionarios", 1300)
    await page.getByRole("tab", { name: /^Respuestas/ }).click()
    await button(page, "Responder cuestionario").click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await dialog.getByRole("combobox", { name: "Participante" }).click()
    await page.getByRole("option", { name: /Camila Rojas/ }).click()
    await dialog.getByRole("combobox", { name: "Cuestionario" }).click()
    await page.getByRole("option").first().click()
    await dialog.getByRole("button", { name: "Comenzar" }).click()
    await expect(dialog.getByText("* Obligatoria")).toBeVisible()
    await dialog.getByRole("textbox").first().fill("Variedad de cafés, buenos precios y envío rápido.")
    await page.waitForTimeout(500)
    await stable(page)
    await captureFigure(page, {
      id: "6-5",
      region: dialog,
      callouts: [
        { number: 1, target: dialog.locator("fieldset fieldset").first(), from: "top", length: 26, shift: 230, pad: 4 },
        { number: 2, target: dialog.getByRole("button", { name: "Guardar respuestas" }), from: "bottom", length: 26 },
      ],
    })
  })

  test("6-6 respuestas", async ({ page }) => {
    await openPilotEditor(page, "Cuestionarios", 1000)
    await page.getByRole("tab", { name: /^Respuestas/ }).click()
    await page.waitForTimeout(500)
    await page.getByText(/Camila Rojas · /).first().click().catch(() => undefined)
    await page.waitForTimeout(500)
    await stable(page)
    const falso = await page.getByText("Falso", { exact: true }).last().boundingBox()
    if (!falso) throw new Error("sin respuesta")
    await captureFigure(page, {
      id: "6-6",
      // The last point is the bottom edge of the answer card, so the figure ends on it.
      region: [page.getByRole("tab", { name: /^Antes del experimento/ }), page.getByRole("tab", { name: /^Respuestas/ }), button(page, "Responder cuestionario"), { x: falso.x, y: falso.y + falso.height + 22, width: 2, height: 2 }],
      margin: 6,
      callouts: [{ target: button(page, "Descargar respuestas"), from: "right", length: 60 }],
    })
  })
})

// ---------- capítulo 8 · configuración ----------

test.describe("capítulo 8 · configuración", () => {
  test("8-1 menú de usuario", async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 420 })
    await installMocks(page)
    await open(page, "/proyectos")
    await button(page, "Menú de usuario").click()
    const item = page.getByRole("menuitem", { name: "Configuración" })
    await expect(item).toBeVisible()
    // The page under the bar is hidden so the figure ends on the menu, not on half a button (figure only).
    await page.evaluate(() => { document.querySelectorAll("main").forEach((el) => ((el as HTMLElement).style.visibility = "hidden")) })
    await captureFigure(page, {
      id: "8-1",
      margin: 8,
      region: [page.locator("header").first(), page.getByRole("menu")],
      callouts: [{ target: item, from: "left", length: 60 }],
    })
  })

  test("8-2 pantalla", async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 700 })
    await installMocks(page)
    await open(page, "/configuracion")
    await expect(page.getByText("Configuración revisada.")).toBeVisible()
    const card = page.locator("[data-slot=card]").first()
    await spaceAbove(page.getByText("Medidas físicas (opcionales)", { exact: true }).locator("xpath=.."), 30)
    await captureFigure(page, {
      id: "8-2",
      region: card,
      callouts: [
        { number: 1, target: [page.getByText("Ancho (px)", { exact: true }), page.getByText("Alto (px)", { exact: true }), page.getByRole("spinbutton", { name: /^Ancho \(px\)/ }), page.getByRole("spinbutton", { name: /^Alto \(px\)/ })], from: "bottom", length: 24, shift: 0 },
        { number: 2, target: button(page, "Guardar configuración de pantalla"), from: "right", length: 60 },
      ],
    })
  })

  test("8-3 aviso de revisión", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 })
    await installMocks(page, { screenConfirmed: false })
    await open(page, "/proyectos")
    const toast = page.locator("[data-sonner-toast]").first()
    await expect(toast).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(800)
    await page.evaluate(() => { document.querySelectorAll("main, header, nav").forEach((el) => ((el as HTMLElement).style.visibility = "hidden")) })
    await captureFigure(page, {
      id: "8-3",
      margin: 30,
      region: toast,
      callouts: [{ target: page.getByRole("button", { name: "Ir a Configuración" }), from: "top", length: 36, shift: -40 }],
    })
  })
})

// ---------- capítulo 7 · informes ----------

async function openReports(page: Page, height = 1500, width = 760) {
  await page.setViewportSize({ width, height })
  await installMocks(page)
  await installDashboardMocks(page)
  await open(page, "/reportes")
  await page.getByRole("combobox").first().click()
  await page.getByRole("option", { name: new RegExp(DEMO_NAME.slice(0, 20)) }).click()
  await expect(page.getByText("Alcance del informe", { exact: true })).toBeVisible()
  await page.waitForTimeout(1500)
  await stable(page)
}

test.describe("capítulo 7 · informes", () => {
  test("7-1 tarjetas del informe", async ({ page }) => {
    await openReports(page, 1300, 1000)
    const cards = page.locator("[data-slot=card]")
    const project = cards.nth(0)
    const scope = cards.nth(1)
    const device = cards.nth(2)
    await spaceAbove(project, 60)
    await spaceAbove(scope, 30)
    await spaceAbove(device, 30)
    await captureFigure(page, {
      id: "7-1",
      margin: 6,
      region: [project, scope, device],
      callouts: [
        { number: 1, target: project, from: "top", length: 22, shift: 320, pad: 3 },
        { number: 2, target: scope, from: "top", length: 22, shift: 320, pad: 3 },
        { number: 3, target: device, from: "top", length: 22, shift: 320, pad: 3 },
      ],
    })
  })

  test("7-2 vista previa y opciones", async ({ page }) => {
    await openReports(page, 2200, 1000)
    const preview = page.getByLabel("Contenido del informe")
    const download = button(page, "Descargar informe PDF")
    await spaceAbove(preview, 70)
    // The download button sits at the foot of its card: the figure ends on the card's bottom edge.
    const options = await page.getByText("Opciones del informe", { exact: true }).boundingBox()
    const foot = await download.boundingBox()
    if (!options || !foot) throw new Error("sin opciones")
    await captureFigure(page, {
      id: "7-2",
      margin: 6,
      region: [preview, { x: 4, y: foot.y + foot.height + 24, width: 992, height: 2 }],
      callouts: [
        { number: 1, target: preview, from: "top", length: 22, shift: 200 },
        { number: 2, target: download, from: "left", length: 50 },
      ],
    })
  })

  test("7-3 informe de grupo y de todos los dispositivos", async ({ page }) => {
    await openReports(page, 2600)
    await page.getByText("Resumen de todos los participantes").click()
    await page.getByText("Todos los dispositivos", { exact: true }).click()
    await page.waitForTimeout(800)
    const download = button(page, "Descargar informes (ZIP)")
    await expect(download).toBeVisible()
    // The preview lists the contents of three PDFs; for the figure only its summary line stays.
    const preview = page.getByLabel("Contenido del informe")
    await preview.evaluate((root) => {
      for (const node of Array.from(root.querySelectorAll("div"))) {
        if (/^(Eye tracker|EEG|GSR)Portada/.test(node.textContent ?? "")) (node as HTMLElement).style.display = "none"
      }
    })
    await page.waitForTimeout(400)
    const cards = page.locator("[data-slot=card]")
    await captureFigure(page, {
      id: "7-3",
      region: [cards.nth(2), preview, download],
      callouts: [{ target: download, from: "left", length: 50 }],
    })
  })
})
