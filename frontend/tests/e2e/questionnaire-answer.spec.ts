import { expect, test, type Page } from "@playwright/test"

async function signIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("neurodatics-auth-session", JSON.stringify({
      user: { id: "answer-user", email: "user@example.test", name: "Usuario de prueba" },
      session: { accessToken: "answer-test-token", tokenType: "Bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
    }))
  })
}

async function mockApi(page: Page) {
  const question = { id: "q-1", type: "open_text", prompt: "Puede ser", required: true, options: [] }
  const planning = {
    participants: [{ id: "p-1", name: "Ana", identification_document: "SINTETICO-1", gender: "female", age: 25, notes: "" }],
    screen: { width_px: 1280, height_px: 1024, width_cm: null, height_cm: null, viewing_distance_cm: null, notes: "" },
    notes: "",
    questionnaires: {
      before: { enabled: true, title: "Cuestionario antes del experimento", questions: [{ ...question, id: "q-0" }] },
      after: { enabled: true, title: "Cuestionario después del experimento", questions: [question] },
    },
    project_notes: [],
  }
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === "/api/settings/screen") {
      await route.fulfill({ json: { screen: planning.screen, confirmed: true } })
      return
    }
    if (path.endsWith("/plan-1/pre-experiment")) {
      const responses = [{
        id: "r-1", revision: 1, participant_id: "p-1", phase: "after",
        participant_snapshot: planning.participants[0], questionnaire_snapshot: planning.questionnaires.after,
        answers: { "q-1": "Sí" }, submitted_at: "2026-10-28T15:43:35Z",
      }]
      await route.fulfill({ json: { revision: 1, config: planning, responses } })
      return
    }
    if (path.endsWith("/plan-1")) {
      await route.fulfill({ json: { id: "plan-1", name: "Plan de prueba", status: "draft", is_pre_experiment: true, participants: [], scenaries: [], sensors: [], files: [] } })
      return
    }
    await route.fulfill({ json: [] })
  })
}

for (const viewport of [{ width: 1536, height: 730 }, { width: 390, height: 844 }]) {
  test(`«Responder cuestionario» va bajo «Agregar pregunta» con su mismo tamaño a ${viewport.width} px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await signIn(page)
    await mockApi(page)
    await page.goto("/proyectos/editar?proyecto=plan-1")
    await page.getByRole("tab", { name: /^Cuestionarios/ }).click()
    await page.getByRole("tab", { name: /^Después del experimento/ }).click()
    const add = await page.getByRole("button", { name: "Agregar pregunta", exact: true }).boundingBox()
    const answer = page.getByRole("button", { name: "Responder cuestionario", exact: true })
    await expect(answer).toBeEnabled()
    const box = await answer.boundingBox()
    expect(box!.width).toBe(add!.width)
    expect(box!.height).toBe(add!.height)
    expect(box!.x).toBe(add!.x)
    expect(box!.y).toBeGreaterThan(add!.y + add!.height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `../output/qa-answer/editor-${viewport.width}.png`, fullPage: true })

    // Opened from the questionnaire, the dialog only asks who answers.
    await answer.click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText("Después del experimento.")
    await expect(dialog.getByRole("combobox", { name: "Cuestionario", exact: true })).toHaveCount(0)
    await expect(dialog.getByRole("combobox", { name: "Participante", exact: true })).toBeVisible()
    await page.screenshot({ path: `../output/qa-answer/dialog-${viewport.width}.png` })
  })

  test(`En «Respuestas», responder y descargar comparten la línea bajo la lista a ${viewport.width} px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await signIn(page)
    await mockApi(page)
    await page.goto("/proyectos/editar?proyecto=plan-1")
    await page.getByRole("tab", { name: /^Cuestionarios/ }).click()
    await page.getByRole("tab", { name: /^Respuestas/ }).click()
    const answer = page.getByRole("button", { name: "Responder cuestionario", exact: true })
    const download = page.getByRole("button", { name: "Descargar respuestas", exact: true })
    await expect(answer).toBeEnabled()
    const list = (await page.getByRole("button", { name: /Ana/ }).locator("..").boundingBox())!
    const a = (await answer.boundingBox())!
    const d = (await download.boundingBox())!
    expect(a.y).toBeGreaterThan(list.y + list.height)
    expect(d.y).toBe(a.y)
    expect(d.height).toBe(a.height)
    expect(d.width).toBe(d.height)
    expect(a.width).toBeGreaterThan(d.width * 4)
    expect(Math.abs(a.x - list.x)).toBeLessThan(1)
    expect(Math.abs(d.x + d.width - (list.x + list.width))).toBeLessThan(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `../output/qa-answer/responses-${viewport.width}.png`, fullPage: true })
  })
}
