import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("neurodatics-auth-session", JSON.stringify({
      user: { id: "navigation-test", email: "navigation@test.invalid", name: "Navigation Test", authSource: "google-oauth" },
      session: { accessToken: "navigation-test-token", tokenType: "bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
    }))
  })
})

test("opens the first project and selects the first visible sensor on entry and project clicks", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, "")
    await route.fulfill({ json: path === "/api/projects" ? [
      { id: "first", name: "Primer proyecto", sensors: [{ sensor_type: "GSR" }, { sensor_type: "EEG" }] },
      { id: "second", name: "Segundo proyecto", sensors: [{ sensor_type: "unsupported" }, { sensor_type: "EEG" }, { sensor_type: "EyeTracker" }] },
      { id: "empty", name: "Sin sensores", sensors: [] },
    ] : [] })
  })

  await page.goto("/dashboard")
  const first = page.getByRole("button", { name: "Primer proyecto", exact: true }).locator("xpath=../..")
  const second = page.getByRole("button", { name: "Segundo proyecto", exact: true }).locator("xpath=../..")
  await expect(first.getByRole("button", { name: "Contraer proyecto" })).toHaveAttribute("aria-expanded", "true")
  await expect(first.getByRole("button", { name: "Sensor Galvánico" })).toHaveAttribute("aria-pressed", "true")
  await expect(first.getByRole("button", { name: "Electroencefalógrafo" })).toBeVisible()
  await expect(first.getByRole("button", { name: "Comparativas" })).toBeVisible()

  await first.getByRole("button", { name: "Electroencefalógrafo" }).click()
  await expect(first.getByRole("button", { name: "Electroencefalógrafo" })).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "Segundo proyecto", exact: true }).click()
  await expect(second.getByRole("button", { name: "Contraer proyecto" })).toHaveAttribute("aria-expanded", "true")
  await expect(second.getByRole("button", { name: "Electroencefalógrafo" })).toHaveAttribute("aria-pressed", "true")
  await expect(second.getByRole("button", { name: "Eye Tracker" })).toBeVisible()

  await second.getByRole("button", { name: "Eye Tracker" }).click()
  await expect(second.getByRole("button", { name: "Eye Tracker" })).toHaveAttribute("aria-pressed", "true")
  await second.getByRole("button", { name: "Contraer proyecto" }).click()
  await expect(second.getByRole("button", { name: "Eye Tracker" })).toBeHidden()
  await page.getByRole("button", { name: "Segundo proyecto", exact: true }).click()
  await expect(second.getByRole("button", { name: "Electroencefalógrafo" })).toHaveAttribute("aria-pressed", "true")

  await page.getByRole("button", { name: "Primer proyecto", exact: true }).click()
  await expect(first.getByRole("button", { name: "Sensor Galvánico" })).toHaveAttribute("aria-pressed", "true")
  await first.getByRole("button", { name: "Contraer proyecto" }).click()
  await first.getByRole("button", { name: "Expandir proyecto" }).click()
  await expect(first.getByRole("button", { name: "Sensor Galvánico" })).toHaveAttribute("aria-pressed", "true")

  await page.getByRole("button", { name: "Sin sensores", exact: true }).click()
  const empty = page.getByRole("button", { name: "Sin sensores", exact: true }).locator("xpath=../..")
  await expect(empty.getByRole("button", { name: "Comparativas" })).toHaveAttribute("aria-pressed", "true")

  await page.getByRole("link", { name: "Inicio", exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole("link", { name: "Dashboard", exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(first.getByRole("button", { name: "Sensor Galvánico" })).toHaveAttribute("aria-pressed", "true")
  expect(errors).toEqual([])
})

test("keeps the empty dashboard usable when there are no projects", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ json: [] }))
  await page.goto("/dashboard")
  await expect(page.getByText("Selecciona un proyecto del panel lateral")).toBeVisible()
  await expect(page.getByRole("button", { name: "Contraer panel" })).toBeVisible()
})
