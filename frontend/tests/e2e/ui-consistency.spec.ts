import { expect, test } from "@playwright/test"
import path from "node:path"

const project = {
  id: "ui-project", name: "Estudio de experiencia", description: "Sesión de evaluación de estímulos",
  status: "active", ingestion_status: "READY", created_at: "2026-01-01T12:00:00Z",
  sensors: [{ id: "eye", sensor_type: "EyeTracker" }, { id: "gsr", sensor_type: "GSR" }],
  participants_count: 0, participants: [], scenaries: [], files: [],
}

for (const theme of ["light", "dark"]) {
  for (const width of [390, 768, 1366, 1920]) {
    test(`screens remain usable at ${width}px in ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.addInitScript(({ theme }) => {
        localStorage.setItem("theme", theme)
        if (["/login", "/register"].includes(location.pathname)) {
          localStorage.removeItem("neurodatics-auth-session")
          return
        }
        localStorage.setItem("neurodatics-auth-session", JSON.stringify({
          user: { id: "ui-test", email: "ui@test.invalid", name: "UI Test", authSource: "google-oauth" },
          session: { accessToken: "ui-test-token", tokenType: "bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
        }))
      }, { theme })
      await page.route("**/api/**", async (route) => {
        const pathname = new URL(route.request().url()).pathname.replace(/\/$/, "")
        await route.fulfill({ json: pathname === "/api/projects" ? [project] : pathname === "/api/projects/ui-project" ? project : pathname.endsWith("/analytics/participants") && page.url().includes("/reportes") ? [{ participant_code: "P01", user_index: 1 }] : [] })
      })
      const errors: string[] = []
      page.on("pageerror", error => errors.push(error.message))
      for (const route of ["/", "/login", "/register", "/proyectos", "/reportes", "/dashboard"]) {
        await page.goto(route)
        await expect(page.locator("body")).not.toBeEmpty()
        if (route === "/dashboard") await expect(page.getByRole("button", { name: "Eye Tracker", exact: true })).toHaveAttribute("aria-pressed", "true")
        if (route === "/login") await expect(page.getByLabel("Correo electrónico", { exact: true })).toBeVisible()
        if (route === "/register") await expect(page.getByLabel("Correo electrónico", { exact: true })).toBeVisible()
        if (route === "/proyectos") await expect(page.getByText(project.name, { exact: true })).toBeVisible()
        if (route === "/reportes") {
          await page.getByRole("combobox").click()
          await page.getByRole("option", { name: new RegExp(project.name) }).click()
          await expect(page.getByRole("radio", { name: "Un participante", exact: true })).toBeVisible()
          await expect(page.getByRole("button", { name: "Descargar reporte PDF", exact: true })).toBeVisible()
        }
        await page.evaluate(() => document.fonts.ready)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        if (process.env.UI_CAPTURE) {
          await page.screenshot({ path: path.resolve(".next/ui-refactor", process.env.UI_CAPTURE, `${route.replace(/\//g, "") || "home"}-${theme}-${width}.png`), fullPage: true })
        }
      }
      expect(errors).toEqual([])
    })
  }
}
