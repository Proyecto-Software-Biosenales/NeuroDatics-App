import { expect, test, type Page } from "@playwright/test"

type Screen = {
  width_px: number
  height_px: number
  width_cm: number | null
  height_cm: number | null
}

const LAB: Screen = { width_px: 1280, height_px: 1024, width_cm: null, height_cm: null }

async function signIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("neurodatics-auth-session", JSON.stringify({
      user: { id: "screen-user", email: "user@example.test", name: "Usuario de prueba" },
      session: { accessToken: "screen-test-token", tokenType: "Bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
    }))
  })
}

async function mockApi(page: Page) {
  const state = { screen: LAB, confirmed: false, saved: [] as Screen[] }
  await page.route("**/api/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === "/api/settings/screen") {
      if (request.method() === "PUT") {
        state.screen = request.postDataJSON()
        state.saved.push(state.screen)
        state.confirmed = true
      }
      await route.fulfill({ json: { screen: state.screen, confirmed: state.confirmed } })
      return
    }
    if (path === "/api/integrations/google-drive/connection") {
      await route.fulfill({ json: { connected: true, account_email: "storage@example.test", oauth_configured: true } })
      return
    }
    await route.fulfill({ json: [] })
  })
  return state
}

test("el primer ingreso avisa de revisar la pantalla y lleva a Configuración", async ({ page }) => {
  await signIn(page)
  const state = await mockApi(page)
  await page.goto("/proyectos")

  const notice = page.getByText("Revisa la configuración de pantalla", { exact: true })
  await expect(notice).toBeVisible()
  await page.getByRole("button", { name: "Ir a Configuración", exact: true }).click()
  await expect(page).toHaveURL(/\/configuracion$/)
  await expect(notice).toHaveCount(0)

  // Only global settings: the screen (laboratory default) and, on the server, Drive.
  await expect(page.getByRole("spinbutton", { name: "Ancho (px)", exact: true })).toHaveValue("1280")
  await expect(page.getByRole("spinbutton", { name: "Alto (px)", exact: true })).toHaveValue("1024")
  await expect(page.getByText("Pre-experimento y cuestionarios", { exact: true })).toHaveCount(0)
  await expect(page.getByText("Comprueba que estos valores correspondan a tu pantalla", { exact: false })).toBeVisible()

  await page.getByRole("spinbutton", { name: "Alto (px)", exact: true }).fill("0")
  await page.getByRole("button", { name: "Guardar configuración de pantalla", exact: true }).click()
  await expect(page.getByRole("alert").filter({ hasText: "número entero de píxeles" })).toBeVisible()
  expect(state.saved).toEqual([])

  // The model was a label nothing used, and the distance comes from each CSV: neither is asked here.
  await expect(page.getByRole("textbox", { name: "Modelo de pantalla", exact: true })).toHaveCount(0)
  await expect(page.getByRole("spinbutton", { name: "Distancia a la pantalla (cm)", exact: true })).toHaveCount(0)
  await page.getByRole("spinbutton", { name: "Alto (px)", exact: true }).fill("1024")
  await page.getByRole("spinbutton", { name: "Ancho (cm)", exact: true }).fill("52.7")
  await page.getByRole("button", { name: "Guardar configuración de pantalla", exact: true }).click()
  await expect(page.getByText("Configuración revisada.", { exact: true })).toBeVisible()
  expect(state.saved).toEqual([{ ...LAB, width_cm: 52.7 }])

  await page.goto("/proyectos")
  await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible()
  await expect(notice).toHaveCount(0)
})

test("el aviso se puede cerrar sin perder la página", async ({ page }) => {
  await signIn(page)
  await mockApi(page)
  await page.goto("/proyectos")
  const notice = page.getByText("Revisa la configuración de pantalla", { exact: true })
  await expect(notice).toBeVisible()
  await page.getByRole("button", { name: "Close toast" }).click()
  await expect(notice).toHaveCount(0)
  await expect(page).toHaveURL(/\/proyectos$/)
})

test("salir de Configuración sin guardar no repite el aviso hasta el siguiente inicio", async ({ page, browser }) => {
  await signIn(page)
  await mockApi(page)
  await page.goto("/proyectos")
  const notice = page.getByText("Revisa la configuración de pantalla", { exact: true })
  await expect(notice).toBeVisible()
  await page.getByRole("button", { name: "Ir a Configuración", exact: true }).click()
  await expect(page).toHaveURL(/\/configuracion$/)

  await page.goto("/proyectos")
  await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible()
  await expect(notice).toHaveCount(0)

  // A new launch opens a new window: the screen is still unsaved, so it asks again.
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL })
  const relaunch = await context.newPage()
  await signIn(relaunch)
  await mockApi(relaunch)
  await relaunch.goto("/proyectos")
  await expect(relaunch.getByText("Revisa la configuración de pantalla", { exact: true })).toBeVisible()
  await context.close()
})

test("un pre-experimento sin medidas toma la pantalla y el tamaño físico de Configuración", async ({ page }) => {
  await signIn(page)
  const state = await mockApi(page)
  state.screen = { ...LAB, width_cm: 37.6, height_cm: 30.1 }
  state.confirmed = true
  const planning = {
    participants: [],
    screen: { model: "", width_px: null, height_px: null, width_cm: null, height_cm: null, viewing_distance_cm: null, notes: "" },
    notes: "",
    questionnaires: {
      before: { enabled: false, title: "Cuestionario antes del experimento", questions: [] },
      after: { enabled: false, title: "Cuestionario después del experimento", questions: [] },
    },
    project_notes: [],
  }
  await page.route("**/api/projects/plan-1**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/pre-experiment")) {
      await route.fulfill({ json: { revision: 1, config: planning, responses: [] } })
      return
    }
    await route.fulfill({ json: { id: "plan-1", name: "Plan de prueba", status: "draft", is_pre_experiment: true, participants: [], scenaries: [], sensors: [], files: [] } })
  })
  await page.goto("/proyectos/editar?proyecto=plan-1")
  await page.getByRole("tab", { name: /^Pantalla/ }).click()
  await expect(page.getByRole("spinbutton", { name: "Ancho (px)", exact: true })).toHaveValue("1280")
  await expect(page.getByRole("spinbutton", { name: "Ancho (cm)", exact: true })).toHaveValue("37.6")
  await expect(page.getByRole("spinbutton", { name: "Alto (cm)", exact: true })).toHaveValue("30.1")
  await expect(page.getByText("Hay cambios sin guardar", { exact: false })).toHaveCount(0)
})
