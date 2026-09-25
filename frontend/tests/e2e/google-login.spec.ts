import { expect, test, type Page } from "@playwright/test"

const SESSION_KEY = "neurodatics-auth-session"

async function mockBackend(page: Page, authorizeRequests: unknown[]) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/api/auth/google/login-url") {
      // Stand in for Google: send the browser straight back to the callback.
      const redirectUri = url.searchParams.get("redirect_uri") ?? ""
      await route.fulfill({ json: { authorization_url: `${redirectUri}?code=one-time-code&state=issued-state` } })
      return
    }
    if (url.pathname === "/api/auth/google/authorize") {
      authorizeRequests.push(route.request().postDataJSON())
      await route.fulfill({ json: {
        access_token: "google-login-token", token_type: "Bearer", expires_in: 3600,
        user: { id: "google-user", email: "google@test.invalid", name: "Google User" },
      } })
      return
    }
    await route.fulfill({ json: [] })
  })
}

test("login offers Google as the only way in and completes the round trip", async ({ page, baseURL }) => {
  const authorizeRequests: unknown[] = []
  await mockBackend(page, authorizeRequests)

  await page.goto("/login")
  await expect(page.getByRole("textbox")).toHaveCount(0)
  await expect(page.getByRole("link", { name: /crear cuenta/i })).toHaveCount(0)
  await page.getByRole("button", { name: "Continuar con Google", exact: true }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  expect(authorizeRequests).toEqual([{ code: "one-time-code", redirect_uri: `${baseURL}/authorize` }])
  const stored = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)) ?? "null")
  expect(stored.user).toEqual({ id: "google-user", email: "google@test.invalid", name: "Google User" })
  expect(stored.session.accessToken).toBe("google-login-token")
})

test("callback rejects a code this tab did not request", async ({ page }) => {
  const authorizeRequests: unknown[] = []
  await mockBackend(page, authorizeRequests)

  await page.goto("/authorize?code=planted-code&state=attacker-state")

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText("La sesión de Google no coincide. Vuelve a intentarlo.")).toBeVisible()
  expect(authorizeRequests).toEqual([])
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBeNull()
})

test("cancelling Google's account chooser returns to login quietly", async ({ page }) => {
  await mockBackend(page, [])

  await page.goto("/authorize?error=access_denied")

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole("button", { name: "Continuar con Google", exact: true })).toBeEnabled()
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0)
})

test("/register is gone", async ({ page }) => {
  const response = await page.goto("/register")
  expect(response?.status()).toBe(404)
})
