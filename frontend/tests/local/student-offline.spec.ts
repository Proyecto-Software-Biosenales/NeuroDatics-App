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

test("there is no account, Google or Drive anywhere in the app", async ({ page }) => {
  const seen = watch(page)
  await page.goto("/")

  const header = page.locator("header")
  await expect(header.getByText("Estudiante")).toBeVisible()
  await expect(header.getByRole("link", { name: "Configuración" })).toHaveCount(0)
  await expect(header.getByRole("button", { name: "Salir" })).toHaveCount(0)
  await expect(page.getByText("Google", { exact: false })).toHaveCount(0)

  // The sign-in and Drive pages are not reachable: they hand the student on to their own screens.
  await page.goto("/login/")
  await expect(page).toHaveURL(/\/dashboard\/?$/)
  await page.goto("/configuracion/")
  await expect(page).toHaveURL(/\/proyectos\/?$/)

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

test("the whole flow works with the network off: upload, analyze, view, delete", async ({ page }) => {
  test.skip(!rawFolder, "set STUDENT_RAW_FOLDER to an extracted raw experiment folder")
  const seen = watch(page)
  const name = `Proyecto local ${Date.now()}`

  await page.goto("/proyectos/")
  await page.getByRole("button", { name: "Crear nuevo proyecto" }).first().click()
  const dialog = page.getByRole("dialog")
  await dialog.locator("#nombre-proyecto").fill(name)
  await dialog.locator("input[type=file]").setInputFiles(rawFolder!)
  await expect(dialog.getByText("CSV a procesar")).toBeVisible()

  // Step 1 -> 2: the browser packs the folder and the local backend ingests it.
  await dialog.getByRole("button", { name: "Siguiente" }).click()
  await expect(dialog.getByText("Paso 2 de 4")).toBeVisible({ timeout: 5 * 60_000 })
  await dialog.getByRole("button", { name: "Siguiente" }).click()

  // Step 3: demographics for every participant found in the data.
  await expect(dialog.getByText("Paso 3 de 4")).toBeVisible()
  const codes = [...new Set((await dialog.innerText()).match(/[0-9]{10}/g) ?? [])]
  expect(codes.length).toBeGreaterThan(0)
  for (const code of codes) {
    const header = dialog.getByRole("button").filter({ hasText: code })
    if ((await header.getAttribute("aria-expanded")) !== "true") await header.click()
    await dialog.getByText("Masculino", { exact: true }).first().click()
    await dialog.getByPlaceholder("Ej: 25").first().fill("25")
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

  // Analytics computed live from the ingested data.
  await page.goto("/dashboard/")
  const sidebar = page.getByRole("button", { name, exact: true }).locator("xpath=../..")
  await expect(sidebar.getByRole("button", { name: "Electroencefalógrafo" })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("puntos renderizados")).toBeVisible({ timeout: 90_000 })
  await sidebar.getByRole("button", { name: "Sensor Galvánico" }).click()
  await expect(page.locator("main .recharts-surface").first()).toBeVisible({ timeout: 90_000 })
  await sidebar.getByRole("button", { name: "Eye Tracker" }).click()
  await expect(page.getByText("Promedio ambas pupilas")).toBeVisible({ timeout: 90_000 })

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
