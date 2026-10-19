import { expect, test } from "@playwright/test"

const project = {
  id: "ui-project", name: "Estudio de experiencia", description: "Sesión de evaluación de estímulos",
  status: "active", ingestion_status: "READY", created_at: "2026-01-01T12:00:00Z",
  sensors: [{ id: "eye", sensor_type: "EyeTracker" }, { id: "gsr", sensor_type: "GSR" }],
  participants_count: 0, participants: [], scenaries: [], files: [],
}

for (const [width, height] of [[1536, 730], [390, 844]]) {
  test(`a project processed before the gaze cleaning asks to be updated at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.addInitScript(() => {
      localStorage.setItem("neurodatics-auth-session", JSON.stringify({
        user: { id: "ui-test", email: "ui@test.invalid", name: "UI Test", authSource: "google-oauth" },
        session: { accessToken: "ui-test-token", tokenType: "bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
      }))
    })
    const projects = [
      { ...project, id: "old", name: "Estudio anterior", needs_update: true },
      { ...project, id: "new", name: "Estudio reciente", needs_update: false },
    ]
    await page.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname.replace(/\/$/, "")
      await route.fulfill({ json: pathname === "/api/projects" ? projects : [] })
    })

    await page.goto("/proyectos")
    const card = (name: string) => page.locator("div.rounded-2xl", { has: page.getByText(name, { exact: true }) }).first()
    await expect(card("Estudio anterior").getByText("Actualizar proyecto", { exact: true })).toBeVisible()
    await expect(card("Estudio reciente").getByText("Actualizar proyecto", { exact: true })).toHaveCount(0)

    // The badge sits in the sensor row, so the cards' footer lines stay level.
    const footerTops = await page.locator("div.rounded-2xl > div.mt-auto").evaluateAll(
      (footers) => footers.map((footer) => Math.round(footer.getBoundingClientRect().top))
    )
    if (width >= 768) expect(new Set(footerTops).size).toBe(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `../output/mirada-invalida/proyectos-${width}.png`, fullPage: true })
  })
}

for (const theme of ["light", "dark"]) {
  for (const width of [390, 768, 1366, 1920]) {
    test(`screens remain usable at ${width}px in ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.addInitScript(({ theme }) => {
        localStorage.setItem("theme", theme)
        if (location.pathname === "/login") {
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
      for (const route of ["/", "/login", "/proyectos", "/reportes", "/dashboard"]) {
        await page.goto(route)
        await expect(page.locator("body")).not.toBeEmpty()
        if (route === "/dashboard") await expect(page.getByRole("button", { name: "Eye tracker", exact: true })).toHaveAttribute("aria-pressed", "true")
        if (route === "/login") {
          await expect(page.getByRole("button", { name: "Continuar con Google", exact: true })).toBeVisible()
          await expect(page.getByRole("textbox")).toHaveCount(0)
        }
        if (route === "/proyectos") await expect(page.getByText(project.name, { exact: true })).toBeVisible()
        if (route === "/reportes") {
          await page.getByRole("combobox").click()
          await page.getByRole("option", { name: new RegExp(project.name) }).click()
          await expect(page.getByRole("radio", { name: "Un participante", exact: true })).toBeVisible()
          await expect(page.getByRole("button", { name: "Descargar informe PDF", exact: true })).toBeVisible()
        }
        await page.evaluate(() => document.fonts.ready)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
      expect(errors).toEqual([])
    })
  }
}
