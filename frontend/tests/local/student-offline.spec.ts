import { expect, test, type Page } from "@playwright/test"

// Runs against a live student edition. The browser is started with name resolution turned off
// for everything but loopback, and every test also fails on any request that leaves the machine.
//
//   STUDENT_BASE_URL     the address the launcher printed, e.g. http://127.0.0.1:8765
//   STUDENT_RAW_FOLDER   an extracted raw experiment folder (private data, never committed);
//                        the full-flow test is skipped without it
//   npx playwright test -c playwright.local.config.ts

const rawFolder = process.env.STUDENT_RAW_FOLDER
const LOOPBACK = new Set(["127.0.0.1", "localhost"])
const SESSION_KEY = "neurodatics-auth-session"

type Watch = { external: string[]; failed: string[]; errors: string[]; fonts: string[] }

function watch(page: Page): Watch {
  const seen: Watch = { external: [], failed: [], errors: [], fonts: [] }
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (url.protocol.startsWith("http") && !LOOPBACK.has(url.hostname)) seen.external.push(request.url())
  })
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname
    if (path.startsWith("/fonts/") && response.status() === 200) seen.fonts.push(path)
    if (response.status() >= 400) seen.failed.push(`${response.status()} ${response.url()}`)
  })
  page.on("pageerror", (error) => seen.errors.push(error.message))
  return seen
}

function expectClean(seen: Watch) {
  expect(seen.external, "requests that left the machine").toEqual([])
  expect(seen.failed, "requests the app itself answered with an error").toEqual([])
  expect(seen.errors, "uncaught page errors").toEqual([])
}

const storedExpiry = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) as string).session.expiresAt as string, SESSION_KEY)

// First in the file: the profile is fresh, so the screen has never been reviewed.
test("the first visit asks to review the screen, and Configuración holds only global settings", async ({ page }) => {
  const seen = watch(page)
  await page.goto("/proyectos/")
  const notice = page.getByText("Revisa la configuración de pantalla", { exact: true })
  await expect(notice).toBeVisible()
  await page.getByRole("button", { name: "Ir a Configuración", exact: true }).click()
  await expect(page).toHaveURL(/\/configuracion\/?$/)
  await expect(notice).toHaveCount(0)

  // Leaving without saving does not ask again during this launch.
  await page.goto("/proyectos/")
  await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible()
  await expect(notice).toHaveCount(0)
  await page.goto("/configuracion/")

  // The laboratory screen is the default; per-project planning no longer lives here.
  await expect(page.getByRole("spinbutton", { name: "Ancho (px)", exact: true })).toHaveValue("1280")
  await expect(page.getByRole("spinbutton", { name: "Alto (px)", exact: true })).toHaveValue("1024")
  await expect(page.getByText("Pre-experimento y cuestionarios", { exact: true })).toHaveCount(0)
  await expect(page.getByRole("spinbutton", { name: "Distancia a la pantalla (cm)", exact: true })).toHaveCount(0)
  await page.getByRole("spinbutton", { name: "Ancho (cm)", exact: true }).fill("53")
  await page.getByRole("button", { name: "Guardar configuración de pantalla", exact: true }).click()
  await expect(page.getByText("Configuración revisada.", { exact: true })).toBeVisible()

  await page.goto("/proyectos/")
  await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible()
  await expect(notice).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible()
  await expect(notice).toHaveCount(0)
  expectClean(seen)
})

test("there is no account, Google or Drive anywhere in the app", async ({ page }) => {
  const seen = watch(page)
  await page.goto("/")

  const header = page.locator("header")
  await expect(header.getByText("Estudiante")).toBeVisible()
  await expect(header.getByRole("link", { name: "Configuración" })).toHaveCount(0)
  await expect(header.getByRole("button", { name: "Salir" })).toHaveCount(0)
  await header.getByRole("button", { name: "Menú de usuario" }).click()
  await expect(page.getByRole("menuitem", { name: "Configuración" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByText("Google", { exact: false })).toHaveCount(0)

  // Sign-in redirects locally; Configuration holds the screen without Google or Drive.
  await page.goto("/login/")
  await expect(page).toHaveURL(/\/dashboard\/?$/)
  await page.goto("/configuracion/")
  await expect(page).toHaveURL(/\/configuracion\/?$/)
  await expect(page.getByText("Pantalla", { exact: true })).toBeVisible()
  await expect(page.getByText("Google", { exact: false })).toHaveCount(0)
  await expect(page.getByText("Google Drive", { exact: false })).toHaveCount(0)
  await expect(page.getByText("Sesión de NeuroDatics", { exact: true })).toHaveCount(0)

  // Poppins comes from the app itself (the browser could not have fetched it from anywhere else).
  await page.goto("/proyectos/")
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.fonts.check("600 16px Poppins"))).toBe(true)
  expect(seen.fonts.length).toBeGreaterThan(0)

  expectClean(seen)
})

test("the one local session is minted again when it ran out or the browser forgot it", async ({ page }) => {
  const seen = watch(page)
  await page.goto("/proyectos/")
  await expect(page.locator("header").getByText("Estudiante")).toBeVisible()

  // Nobody can sign in by hand, so the app has to do it for the student.
  await page.evaluate((key) => {
    const stored = JSON.parse(localStorage.getItem(key) as string)
    stored.session.expiresAt = new Date(Date.now() - 60_000).toISOString()
    localStorage.setItem(key, JSON.stringify(stored))
  }, SESSION_KEY)
  await page.reload()
  await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible()
  await expect.poll(async () => new Date(await storedExpiry(page)).getTime()).toBeGreaterThan(Date.now())

  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator("header").getByText("Estudiante")).toBeVisible()
  expectClean(seen)
})

test("a pre-experiment is prepared tab by tab without a folder, then deleted", async ({ page }) => {
  const seen = watch(page)
  const name = `Pre-experimento local ${Date.now()}`

  await page.goto("/proyectos/")
  await page.getByRole("button", { name: "Crear proyecto", exact: true }).first().click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: "Pre-experimento", exact: true }).click()
  await dialog.getByRole("textbox", { name: "Nombre del proyecto *", exact: true }).fill(name)

  await dialog.getByRole("tab", { name: /^Participantes/ }).click()
  await dialog.getByRole("button", { name: "Agregar participante", exact: true }).click()
  // The document identifies the participant; the name is optional, as in a project with its folder.
  await dialog.getByRole("textbox", { name: "Nombre", exact: true }).fill("Participante sintético")
  await dialog.getByRole("textbox", { name: "Documento *", exact: true }).fill("SINTETICO-1")
  await dialog.getByRole("combobox", { name: "Sexo", exact: true }).click()
  await page.getByRole("option", { name: "Femenino", exact: true }).click()

  // The screen starts as the one saved in Configuración by the first test.
  await dialog.getByRole("tab", { name: /^Pantalla/ }).click()
  await expect(dialog.getByRole("spinbutton", { name: "Alto (px)", exact: true })).toHaveValue("1024")
  await expect(dialog.getByRole("spinbutton", { name: "Ancho (cm)", exact: true })).toHaveValue("53")
  // The planned seating distance only backs up the eye tracker's own record, and starts empty.
  await expect(dialog.getByRole("spinbutton", { name: "Distancia a la pantalla (cm)", exact: true })).toHaveValue("")
  await dialog.getByRole("spinbutton", { name: "Ancho (px)", exact: true }).fill("1920")

  await dialog.getByRole("tab", { name: /^Cuestionarios/ }).click()
  // Adding a question is what turns the questionnaire on; there is no separate switch.
  await dialog.getByRole("button", { name: "Agregar pregunta", exact: true }).click()
  await dialog.getByRole("textbox", { name: "Pregunta 1", exact: true }).fill("¿Cómo te sientes?")

  await dialog.getByRole("tab", { name: /^Notas/ }).click()
  await dialog.getByRole("button", { name: "Agregar nota", exact: true }).click()
  await dialog.getByRole("textbox", { name: "Título de la nota 1", exact: true }).fill("Sala")
  await dialog.getByRole("textbox", { name: "Nota 1", exact: true }).fill("Reservar la sala")
  await dialog.getByRole("button", { name: "Crear pre-experimento", exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })

  const cardWith = (has: ReturnType<Page["getByRole"]>) =>
    page.locator("div").filter({ has: page.getByText(name, { exact: true }) }).filter({ has }).last()
  const card = cardWith(page.getByRole("button", { name: "Opciones del proyecto" }))
  await expect(cardWith(page.getByRole("button", { name: "Subir", exact: true }))).toBeVisible()

  // The menu has one way to edit, not a second entry for the pre-experiment.
  await card.getByRole("button", { name: "Opciones del proyecto" }).click()
  await expect(page.getByRole("menuitem", { name: "Editar", exact: true })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: /^Pre-experimento/ })).toHaveCount(0)
  await page.keyboard.press("Escape")

  // Clicking the card opens its editor, whose sections load what was typed from the local database.
  await page.getByRole("heading", { name, exact: true }).click()
  await expect(page).toHaveURL(/\/proyectos\/editar\/?\?proyecto=/)
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible()
  await expect(page.getByRole("tab", { name: /^Dispositivos/ })).toHaveCount(0)
  await page.getByRole("tab", { name: /^Participantes/ }).click()
  await expect(page.getByRole("textbox", { name: "Nombre", exact: true })).toHaveValue("Participante sintético")
  await expect(page.getByRole("textbox", { name: "Documento *", exact: true })).toHaveValue("SINTETICO-1")
  await expect(page.getByRole("combobox", { name: "Sexo", exact: true })).toHaveText("Femenino")
  await page.getByRole("tab", { name: /^Cuestionarios/ }).click()
  await expect(page.getByRole("textbox", { name: "Pregunta 1", exact: true })).toHaveValue("¿Cómo te sientes?")
  await page.getByRole("tab", { name: /^Notas/ }).click()
  await expect(page.getByRole("textbox", { name: "Título de la nota 1", exact: true })).toHaveValue("Sala")
  await expect(page.getByRole("textbox", { name: "Nota 1", exact: true })).toHaveValue("Reservar la sala")

  await page.goto("/proyectos/")
  await card.getByRole("button", { name: "Opciones del proyecto" }).click()
  await page.getByRole("menuitem", { name: "Eliminar" }).click()
  const confirm = page.getByRole("alertdialog")
  await confirm.getByRole("button", { name: "Continuar" }).click()
  await confirm.getByPlaceholder('Escribe "eliminar"').fill("eliminar")
  await confirm.getByRole("button", { name: "Eliminar proyecto" }).click()
  await expect(page.getByText(name, { exact: true })).toHaveCount(0, { timeout: 60_000 })

  expectClean(seen)
})

test("the whole flow works with the network off: upload, analyze, view, delete", async ({ page }) => {
  test.skip(!rawFolder, "set STUDENT_RAW_FOLDER to an extracted raw experiment folder")
  const seen = watch(page)
  const name = `Proyecto local ${Date.now()}`

  await page.goto("/proyectos/")
  await page.getByRole("button", { name: "Crear proyecto", exact: true }).first().click()
  const dialog = page.getByRole("dialog")
  await dialog.locator("#nombre-proyecto").fill(name)
  await dialog.locator("input[type=file]").setInputFiles(rawFolder!)
  await expect(dialog.getByText("CSV a procesar")).toBeVisible()

  // Step 1 -> 2: the browser packs the folder and the local backend ingests it.
  await dialog.getByRole("button", { name: "Siguiente" }).click()
  await expect(dialog.getByText("Paso 2 de 4")).toBeVisible({ timeout: 5 * 60_000 })
  await dialog.getByRole("button", { name: "Siguiente" }).click()

  // Step 3: generic "Participante N" headers; the document comes prefilled from the
  // data and the optional name of the first participant becomes its dashboard label.
  await expect(dialog.getByText("Paso 3 de 4")).toBeVisible()
  const count = await dialog.getByRole("button", { name: /^Participante \d+/ }).count()
  expect(count).toBeGreaterThan(0)
  const participantName = "Participante de prueba Ana"
  for (let index = 1; index <= count; index += 1) {
    const header = dialog.getByRole("button", { name: new RegExp(`^Participante ${index}(\\D|$)`) })
    if ((await header.getAttribute("aria-expanded")) !== "true") await header.click()
    await expect(dialog.getByLabel("Documento", { exact: true }).first()).toHaveValue(/[0-9]{10}/)
    if (index === 1) await dialog.getByLabel(/^Nombre/).first().fill(participantName)
    await dialog.getByText("Masculino", { exact: true }).first().click()
    await dialog.getByLabel("Edad", { exact: true }).first().fill("25")
    await header.click()
  }
  await expect(dialog.getByText("Completar", { exact: true })).toHaveCount(0)
  await dialog.getByRole("button", { name: "Siguiente" }).click()

  // Step 4: the stimulus image comes from the local store.
  await expect(dialog.getByText("Paso 4 de 4")).toBeVisible()
  await expect
    .poll(() => dialog.locator("img").first().evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  await dialog.getByRole("button", { name: "Guardar proyecto" }).click()
  await expect(dialog).toBeHidden({ timeout: 60_000 })

  // The project card, and its stimulus images on the view dialog (Drive thumbnails in the server edition).
  const card = page
    .locator("div")
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Ver proyecto" }) })
    .last()
  await card.getByRole("button", { name: "Ver proyecto" }).click()
  const view = page.getByRole("dialog")
  await expect(view.getByText(`Ver proyecto: ${name}`)).toBeVisible()
  await expect
    .poll(() =>
      view.locator("img").evaluateAll((images) => (images as HTMLImageElement[]).filter((img) => img.naturalWidth > 0).length),
    )
    .toBeGreaterThan(0)
  await page.keyboard.press("Escape")

  // The one editor of a project with its folder also holds its devices and areas of interest.
  await card.getByRole("button", { name: "Opciones del proyecto" }).click()
  await page.getByRole("menuitem", { name: "Editar", exact: true }).click()
  await expect(page).toHaveURL(/\/proyectos\/editar\/?\?proyecto=/)
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible()
  await page.getByRole("tab", { name: /^Dispositivos/ }).click()
  await expect(page.getByRole("checkbox", { name: "Eye tracker" })).toBeChecked()
  await page.getByRole("tab", { name: /^Áreas de interés/ }).click()
  await expect(page.locator("main img").first()).toBeVisible()
  await page.goto("/proyectos/")

  // Clicking an active project's card opens its own dashboard, with analytics computed live from the ingested data.
  await page.getByRole("heading", { name, exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard\/?\?proyecto=/)
  const sidebar = page.getByRole("button", { name, exact: true }).locator("xpath=../..")
  await expect(sidebar.getByRole("button", { name: "Eye tracker" })).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator('p[title="Ambas pupilas"]')).toBeVisible({ timeout: 90_000 })
  // The participant filter shows the entered name instead of the document.
  const participantFilter = page.getByRole("combobox").nth(1)
  await participantFilter.click()
  await page.getByRole("option", { name: participantName, exact: true }).click()
  await expect(participantFilter).toHaveText(participantName)
  await expect(page.locator('p[title="Ambas pupilas"]')).toBeVisible({ timeout: 90_000 })
  await sidebar.getByRole("button", { name: "Electroencefalógrafo" }).click()
  await expect(page.getByText("puntos renderizados")).toBeVisible({ timeout: 90_000 })
  // Technical modes explain themselves on hover.
  await page.getByRole("button", { name: "Suavizada", exact: true }).hover()
  await expect(page.getByRole("tooltip")).toHaveText(/promediada/)
  await page.mouse.move(0, 0)
  await sidebar.getByRole("button", { name: "Sensor galvánico" }).click()
  await expect(page.locator("main .recharts-surface").first()).toBeVisible({ timeout: 90_000 })

  // Deleting removes the project and says the student's own files went with it (no Drive folder).
  await page.goto("/proyectos/")
  const again = page
    .locator("div")
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Opciones del proyecto" }) })
    .last()
  await again.getByRole("button", { name: "Opciones del proyecto" }).click()
  await page.getByRole("menuitem", { name: "Eliminar" }).click()
  await expect(page.getByRole("alertdialog")).toContainText("sus archivos en este equipo")
  await expect(page.getByRole("alertdialog")).not.toContainText("Drive")
  await page.getByRole("button", { name: "Continuar" }).click()
  await page.getByPlaceholder('Escribe "eliminar"').fill("eliminar")
  await page.getByRole("button", { name: "Eliminar proyecto" }).click()
  await expect(page.getByText(name, { exact: true })).toHaveCount(0, { timeout: 60_000 })

  expectClean(seen)
})
