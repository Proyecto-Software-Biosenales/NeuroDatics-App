import { expect, test, type Page } from "@playwright/test"

const project = {
  id: "private-project", name: "Estudio privado de A", description: "", status: "active",
  ingestion_status: "READY", created_at: "2026-01-01T12:00:00Z",
  sensors: [{ id: "eye", sensor_type: "EyeTracker" }], participants_count: 2,
}

const signIn = (page: Page, userId: string) => page.evaluate((id) => {
  localStorage.setItem("neurodatics-auth-session", JSON.stringify({
    user: { id, email: `${id}@test.invalid`, name: `Usuario ${id}`, authSource: "google-oauth" },
    session: { accessToken: `token-${id}`, tokenType: "bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
  }))
}, userId)

test("a user who signs in after another never sees that user's projects when the list fails", async ({ page }) => {
  let listFails = false
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/\/$/, "")
    if (pathname === "/api/projects" && listFails) {
      await route.fulfill({ status: 500, json: { detail: "Servicio caído" } })
      return
    }
    await route.fulfill({ json: pathname === "/api/projects" ? [project] : [] })
  })

  // User A loads the list and signs out.
  await page.goto("/login")
  await signIn(page, "usuario-a")
  await page.goto("/proyectos")
  await expect(page.getByText(project.name, { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Salir", exact: true }).click()
  await expect(page).not.toHaveURL(/\/proyectos/)
  expect(await page.evaluate(() => localStorage.getItem("neurodatics-auth-session"))).toBeNull()

  // User B opens Projects in the same browser while the API is failing.
  listFails = true
  await signIn(page, "usuario-b")
  await page.goto("/proyectos")
  await expect(page.getByText("No se pudieron cargar los proyectos.", { exact: true })).toBeVisible()
  await expect(page.getByText(project.name, { exact: true })).toHaveCount(0)
  await expect(page.getByText("No hay proyectos creados")).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem("neurodatics_projects"))).toBeNull()
})

test("the projects copy that older versions kept in the browser is neither shown nor kept", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ status: 500, json: { detail: "Servicio caído" } }))
  await page.goto("/login")
  await page.evaluate(() => localStorage.setItem("neurodatics_projects", JSON.stringify([
    { id: "viejo", name: "Proyecto viejo", sensors: [], createdAt: "1/1/2026" },
  ])))
  await signIn(page, "usuario-b")
  await page.goto("/proyectos")
  await expect(page.getByText("No se pudieron cargar los proyectos.", { exact: true })).toBeVisible()
  await expect(page.getByText("Proyecto viejo", { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem("neurodatics_projects"))).toBeNull()
})
