import { expect, test, type Page } from "@playwright/test"

type Connection = { connected: boolean; account_email: string | null; oauth_configured: boolean }

async function signIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("neurodatics-auth-session", JSON.stringify({
      user: { id: "configuration-user", email: "user@example.test", name: "Usuario de prueba" },
      session: { accessToken: "configuration-test-token", tokenType: "Bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
    }))
  })
}

async function mockConnection(page: Page, state: { connection: Connection; status?: number; authorizeStatus?: number }) {
  const authorizationHeaders: string[] = []
  const authorizeRequests: string[] = []
  await page.route("**/api/**", async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === "/api/integrations/google-drive/connection") {
      authorizationHeaders.push(request.headers().authorization)
      await route.fulfill({ status: state.status ?? 200, json: state.connection })
      return
    }
    if (path === "/api/integrations/google-drive/authorize") {
      authorizeRequests.push(path)
      await route.fulfill({
        status: state.authorizeStatus ?? 200,
        json: { authorization_url: "https://accounts.google.com/o/oauth2/v2/auth?state=synthetic-state" },
      })
      return
    }
    await route.fulfill({ json: [] })
  })
  await page.context().route("https://accounts.google.com/**", route => route.fulfill({
    contentType: "text/html", body: "<h1>Permiso de Google simulado</h1>",
  }))
  return { authorizationHeaders, authorizeRequests }
}

test("requiere iniciar sesión antes de consultar la conexión compartida", async ({ page }) => {
  const calls = await mockConnection(page, { connection: { connected: false, account_email: null, oauth_configured: true } })
  await page.goto("/configuracion")
  await expect(page).toHaveURL(/\/login$/)
  expect(calls.authorizationHeaders).toEqual([])
})

test("una base vacía autoriza Drive y permite comprobar el permiso guardado", async ({ page }) => {
  await signIn(page)
  const state = { connection: { connected: false, account_email: null, oauth_configured: true } as Connection }
  const calls = await mockConnection(page, state)
  await page.goto("/configuracion")
  await expect(page.getByText("Google Drive todavía no está conectado.", { exact: false })).toBeVisible()
  const popupPromise = page.waitForEvent("popup")
  await page.getByRole("button", { name: "Conectar Google Drive", exact: true }).click()
  const popup = await popupPromise
  await expect(popup).toHaveURL(/accounts\.google\.com/)
  await expect(page.getByText(/Completa el permiso en la pestaña de Google/)).toBeVisible()
  state.connection = { connected: true, account_email: "storage@example.test", oauth_configured: true }
  await popup.close()
  await page.getByRole("button", { name: "Comprobar conexión" }).click()
  await expect(page.getByText("Conexión guardada", { exact: true })).toBeVisible()
  await expect(page.getByText("Cuenta de almacenamiento: storage@example.test.")).toBeVisible()
  expect(calls.authorizeRequests).toHaveLength(1)
  expect(calls.authorizationHeaders.every(value => value === "Bearer configuration-test-token")).toBe(true)
})

test("reconectar una cuenta compartida requiere confirmación y cancelar no la altera", async ({ page }) => {
  await signIn(page)
  const calls = await mockConnection(page, { connection: { connected: true, account_email: "shared@example.test", oauth_configured: true } })
  await page.goto("/configuracion")
  await page.getByRole("button", { name: "Reconectar Google Drive" }).click()
  await expect(page.getByRole("alertdialog")).toContainText("todos los usuarios de esta base de datos")
  await page.getByRole("button", { name: "Cancelar", exact: true }).click()
  expect(calls.authorizeRequests).toEqual([])
  await expect(page.getByText("Cuenta de almacenamiento: shared@example.test.")).toBeVisible()
  await page.getByRole("button", { name: "Reconectar Google Drive" }).click()
  const popupPromise = page.waitForEvent("popup")
  await page.getByRole("button", { name: "Continuar con la reconexión" }).click()
  const popup = await popupPromise
  await expect(popup).toHaveURL(/accounts\.google\.com/)
  expect(calls.authorizeRequests).toHaveLength(1)
  await popup.close()
})

test("un error de estado permite reintentar y no permite autorizar a ciegas", async ({ page }) => {
  await signIn(page)
  const state = { connection: { connected: false, account_email: null, oauth_configured: true }, status: 503 }
  const calls = await mockConnection(page, state)
  await page.goto("/configuracion")
  await expect(page.getByRole("alert").filter({ hasText: "No se pudo comprobar" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Conectar Google Drive", exact: true })).toBeDisabled()
  state.status = 200
  await page.getByRole("button", { name: "Comprobar conexión" }).click()
  await expect(page.getByRole("button", { name: "Conectar Google Drive", exact: true })).toBeEnabled()
  expect(calls.authorizeRequests).toEqual([])
})

test("sin credenciales de Google explica cómo completar la instalación", async ({ page }) => {
  await signIn(page)
  await mockConnection(page, { connection: { connected: false, account_email: null, oauth_configured: false } })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/configuracion")
  await expect(page.getByRole("alert").filter({ hasText: "Falta la configuración de Google" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Conectar Google Drive", exact: true })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test("Configuración es accesible desde la navegación sin desbordar la ventana", async ({ page }) => {
  await signIn(page)
  await mockConnection(page, { connection: { connected: false, account_email: null, oauth_configured: true } })
  for (const width of [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/configuracion")
    await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Configuración" })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})

test("una autorización fallida conserva la página y muestra un error recuperable", async ({ page }) => {
  await signIn(page)
  await mockConnection(page, { connection: { connected: false, account_email: null, oauth_configured: true }, authorizeStatus: 502 })
  await page.goto("/configuracion")
  await page.getByRole("button", { name: "Conectar Google Drive", exact: true }).click()
  await expect(page.getByRole("alert").filter({ hasText: "No se pudo abrir la autorización" })).toBeVisible()
  await expect(page).toHaveURL(/\/configuracion$/)
  await expect(page.getByRole("button", { name: "Conectar Google Drive", exact: true })).toBeEnabled()
})
