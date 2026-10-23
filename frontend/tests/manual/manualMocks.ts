// Simulated API for the manual figures: synthetic data, answers by METHOD and path, and a little
// state in memory (a project created by the wizard, a held upload...). Everything here is invented:
// there are no real people, documents or SAIO data.
import type { Page, Route } from "@playwright/test"
import fs from "node:fs"
import { STIMULUS_FILES } from "./manualAssets"

// ---------- data ----------

export const DEMO_ID = "estudio-atencion"
export const DEMO_NAME = "Estudio de atención visual — demostración"

type Json = Record<string, unknown>

export const sensorsAll = [
  { id: "s-eye", sensor_type: "EyeTracker" },
  { id: "s-eeg", sensor_type: "EEG" },
  { id: "s-gsr", sensor_type: "GSR" },
]

export const dataParticipants = [
  { id: "dp-1", participant_code: "1020304050", document: "1020304050", name: "Camila Rojas", age: 27, sex: "female" },
  { id: "dp-2", participant_code: "1030405060", document: "1030405060", name: "Mateo Herrera", age: 31, sex: "male" },
  { id: "dp-3", participant_code: "1040506070", document: "1040506070", name: "Valentina Suárez", age: 24, sex: "female" },
]

export const demoScenarios = [
  {
    id: "sc-1", name: "Página principal", type: "image", file_id: "file-home", width: 1280, height: 720,
    aois: [
      { id: "aoi-1", name: "Titular", color: "#3B82F6", shape_type: "rect", shape: { x: 8, y: 21.5, width: 46, height: 17 } },
      { id: "aoi-2", name: "Producto", color: "#F59E0B", shape_type: "circle", shape: { x: 73.7, y: 21.9, width: 14.8, height: 26.4 } },
    ],
  },
  { id: "sc-2", name: "Oferta destacada", type: "image", file_id: "file-offer", width: 1280, height: 720, aois: [] },
  { id: "sc-3", name: "Video de campaña", type: "video", file_id: "file-video", width: 1280, height: 720, aois: [] },
]

export const demoFiles = [
  { id: "file-home", kind: "scenario_image", filename: "Página principal.png", created_at: "2026-10-05T10:20:00Z" },
  { id: "file-offer", kind: "scenario_image", filename: "Oferta destacada.png", created_at: "2026-10-05T10:20:00Z" },
  { id: "file-video", kind: "scenario_video", filename: "Video de campaña.mp4", created_at: "2026-10-05T10:20:00Z" },
]

export const demoProject = {
  id: DEMO_ID,
  name: DEMO_NAME,
  description: "Efecto de dos anuncios sobre la atención visual en una página web.",
  status: "active",
  ingestion_status: "READY",
  ingestion_generation: 3,
  created_at: "2026-10-05T10:00:00Z",
  sensors: sensorsAll,
  participants_count: 3,
  is_pre_experiment: false,
  planning_participants_count: 0,
  needs_update: false,
}

export const pilotProject = {
  id: "piloto-cuestionario",
  name: "Piloto de cuestionario",
  description: "Prueba del cuestionario previo con cuatro personas.",
  status: "draft",
  ingestion_status: "PENDING",
  ingestion_generation: 0,
  created_at: "2026-10-12T11:00:00Z",
  sensors: [],
  participants_count: 0,
  is_pre_experiment: true,
  planning_participants_count: 3,
  needs_update: false,
}

export const archivedProject = {
  id: "campana-reconocimiento",
  name: "Campaña de reconocimiento — archivo",
  description: "Proyecto conservado para consulta.",
  status: "archived",
  ingestion_status: "READY",
  ingestion_generation: 2,
  created_at: "2026-08-03T14:20:00Z",
  sensors: [{ id: "s-eye-2", sensor_type: "EyeTracker" }],
  participants_count: 8,
  is_pre_experiment: false,
  planning_participants_count: 0,
  needs_update: false,
}

export const pendingDraft = {
  id: "anuncio-revista",
  name: "Prueba de anuncio en revista",
  description: "",
  status: "draft",
  ingestion_status: "PENDING",
  ingestion_generation: 0,
  created_at: "2026-10-14T09:15:00Z",
  sensors: [],
  participants_count: 0,
  is_pre_experiment: false,
  planning_participants_count: 0,
  needs_update: false,
}

export const processingDraft = {
  id: "empaques",
  name: "Estudio de empaques",
  description: "",
  status: "draft",
  ingestion_status: "PROCESSING",
  ingestion_generation: 0,
  created_at: "2026-10-15T08:40:00Z",
  sensors: [],
  participants_count: 0,
  is_pre_experiment: false,
  planning_participants_count: 0,
  needs_update: false,
}

export const readyDraft = {
  id: "etiquetas",
  name: "Evaluación de etiquetas",
  description: "",
  status: "draft",
  ingestion_status: "READY",
  ingestion_generation: 1,
  created_at: "2026-10-13T16:05:00Z",
  sensors: [{ id: "s-eye-3", sensor_type: "EyeTracker" }],
  participants_count: 0,
  is_pre_experiment: false,
  planning_participants_count: 0,
  needs_update: false,
}

export const outdatedProject = {
  id: "lectura-pantalla",
  name: "Estudio de lectura en pantalla",
  description: "",
  status: "active",
  ingestion_status: "READY",
  ingestion_generation: 1,
  created_at: "2026-09-18T13:30:00Z",
  sensors: [{ id: "s-eye-4", sensor_type: "EyeTracker" }],
  participants_count: 6,
  is_pre_experiment: false,
  planning_participants_count: 0,
  needs_update: true,
}

export const defaultProjects = [demoProject, pilotProject, pendingDraft, archivedProject]

const question = (id: string, type: string, prompt: string, options: string[] = [], required = true) => ({
  id, type, prompt, required, options: options.map((label, index) => ({ id: `${id}-o${index + 1}`, label })),
})

export const pilotEnvelope = {
  revision: 3,
  config: {
    participants: [
      { id: "pp-1", name: "Camila Rojas", identification_document: "1020304050", gender: "female", age: 27, notes: "Usa gafas de lectura." },
      { id: "pp-2", name: "Mateo Herrera", identification_document: "1030405061", gender: "male", age: 31, notes: "" },
      { id: "pp-3", name: "Andrés Pardo", identification_document: "1099887766", gender: "male", age: 35, notes: "" },
    ],
    screen: { width_px: 1920, height_px: 1080, width_cm: 53.1, height_cm: 29.9, viewing_distance_cm: 65, notes: "Pantalla calibrada antes de la sesión." },
    notes: "Aplicar el mismo protocolo de iluminación en todas las sesiones.",
    project_notes: [{ id: "note-1", title: "Iluminación", text: "Persianas cerradas y luz de techo al 50 %." }],
    questionnaires: {
      before: {
        enabled: true,
        title: "Cuestionario antes del experimento",
        questions: [
          question("q1", "open_text", "¿Qué esperas encontrar en una tienda de café en línea?"),
          question("q2", "multiple_choice", "¿Con qué frecuencia compras en línea?", ["Nunca", "Una vez al mes", "Cada semana"]),
          question("q3", "true_false", "He visto antes un anuncio de esta marca.", [], false),
        ],
      },
      after: {
        enabled: true,
        title: "Cuestionario después del experimento",
        questions: [question("q4", "open_text", "¿Qué fue lo primero que llamó tu atención?")],
      },
    },
  },
  responses: [
    {
      id: "resp-1", revision: 3, participant_id: "pp-1", phase: "before",
      participant_snapshot: { id: "pp-1", name: "Camila Rojas", identification_document: "1020304050", gender: "female", age: 27, notes: "Usa gafas de lectura." },
      questionnaire_snapshot: {
        enabled: true,
        title: "Cuestionario antes del experimento",
        questions: [
          question("q1", "open_text", "¿Qué esperas encontrar en una tienda de café en línea?"),
          question("q2", "multiple_choice", "¿Con qué frecuencia compras en línea?", ["Nunca", "Una vez al mes", "Cada semana"]),
          question("q3", "true_false", "He visto antes un anuncio de esta marca.", [], false),
        ],
      },
      answers: { q1: "Variedad de cafés, buenos precios y envío rápido.", q2: ["q2-o2"], q3: false },
      submitted_at: "2026-10-14T15:30:00Z",
    },
  ],
}

// The demo project: the data participants and two planned ones (one is the same person as a participant of the data).
export const demoEnvelope = {
  revision: 2,
  config: {
    participants: [
      { id: "pp-d1", name: "Camila Rojas", identification_document: "1020304050", gender: "female", age: 27, notes: "Usa gafas de lectura." },
      { id: "pp-d4", name: "Daniela Ortiz", identification_document: "1050607080", gender: "female", age: 29, notes: "" },
    ],
    screen: { width_px: 1920, height_px: 1080, width_cm: 53.1, height_cm: 29.9, viewing_distance_cm: 65, notes: "" },
    notes: "",
    project_notes: [],
    questionnaires: pilotEnvelope.config.questionnaires,
  },
  responses: [],
}

// What the server says after the wizard uploads the synthetic folder.
export const uploadSummary = (projectId: string) => ({
  project_id: projectId,
  ingestion_status: "READY",
  ingestion_generation: 1,
  zip_saved: false,
  counts: { folders_created: 4, files_uploaded: 5, images: 2, videos: 1, csv: 1, other: 0, scenaries_created: 3 },
  files: [],
  csv_processing: { detected: 1, processed: 1, failed: 0 },
  manifest: { total_detected: 5, images: 2, videos: 1, csv: 1, other: 0 },
  detected_sensors: ["EyeTracker", "GSR", "EEG"],
  participants: dataParticipants.map((p, index) => ({ participant_code: p.participant_code, user_index: index + 1 })),
})

// ---------- options and install ----------

export type MockOptions = {
  authenticated?: boolean
  /** `confirmed` of GET /api/settings/screen. */
  screenConfirmed?: boolean
  screen?: { width_px: number; height_px: number; width_cm: number | null; height_cm: number | null }
  projects?: Json[]
  /** Detail per project id; ids without one get a minimal detail built from the list. */
  details?: Record<string, Json>
  envelopes?: Record<string, Json>
  /** "instant" answers the folder upload at once; "hold" keeps it until `mock.releaseUpload()`. */
  upload?: "instant" | "hold"
  /** Progress answers in order; the last one repeats. */
  progress?: Json[]
}

export type Mock = {
  state: {
    projects: Json[]
    details: Record<string, Json>
    envelopes: Record<string, Json>
    created: Json[]
    unhandled: string[]
  }
  releaseUpload: () => void
}

const fixtureFile = (route: Route, file: string) =>
  route.fulfill({ status: 200, contentType: "image/png", body: fs.readFileSync(file) })

const stimulusFor = (fileId: string) =>
  fileId === "file-offer" ? STIMULUS_FILES.offer : fileId === "file-video" ? STIMULUS_FILES.video : STIMULUS_FILES.home

export async function installMocks(page: Page, options: MockOptions = {}): Promise<Mock> {
  if (options.authenticated !== false) {
    await page.addInitScript(() => {
      localStorage.setItem("neurodatics-auth-session", JSON.stringify({
        user: { id: "manual-demo-user", email: "laura.mendoza@ejemplo.edu", name: "Laura Mendoza", authSource: "google-oauth" },
        session: { accessToken: "manual-demo-token", tokenType: "bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
      }))
      localStorage.setItem("theme", "light")
    })
  }

  const state: Mock["state"] = {
    projects: structuredClone(options.projects ?? defaultProjects) as Json[],
    details: {},
    envelopes: { [pilotProject.id]: pilotEnvelope, [DEMO_ID]: demoEnvelope, ...(options.envelopes ?? {}) },
    created: [],
    unhandled: [],
  }
  const screen = options.screen ?? { width_px: 1920, height_px: 1080, width_cm: 53.1, height_cm: 29.9 }
  let confirmed = options.screenConfirmed !== false
  let releaseHeld: (() => void) | null = null
  const held = new Promise<void>((resolve) => { releaseHeld = resolve })
  let progressCalls = 0
  const progress = options.progress ?? [
    { phase: "uploading", uploaded_bytes: 126_000_000, total_bytes: 210_000_000, percent: 60, speed_mbps: 8.4, eta_seconds: 10, elapsed_seconds: 14 },
  ]

  const detailOf = (id: string): Json | null => {
    if (options.details?.[id]) return options.details[id]
    if (id === DEMO_ID) {
      return { ...demoProject, source_folder_name: "Estudio de atención visual", files: demoFiles, participants: dataParticipants, scenaries: demoScenarios }
    }
    const listed = state.projects.find((project) => project.id === id)
    if (!listed) return null
    // A project made by the wizard has the scenarios of the synthetic folder.
    const fresh = state.created.some((project) => project.id === id)
    return fresh
      ? { ...listed, source_folder_name: "Estudio de atención visual", files: demoFiles, participants: [], scenaries: demoScenarios.map((s) => ({ ...s, aois: [] })), sensors: sensorsAll }
      : { ...listed, files: [], participants: [], scenaries: [] }
  }

  await page.route("**/api/**", async (route) => {
    const request = route.request()
    const method = request.method()
    const url = new URL(request.url())
    const pathname = url.pathname.replace(/\/+$/, "")
    const body = (): Json => {
      try { return JSON.parse(request.postData() ?? "{}") } catch { return {} }
    }
    let m: RegExpMatchArray | null

    if (pathname === "/api/settings/screen") {
      if (method === "PUT") {
        confirmed = true
        await route.fulfill({ json: { screen: { ...screen, ...body() }, confirmed: true } })
      } else {
        await route.fulfill({ json: { screen, confirmed } })
      }
      return
    }

    if (pathname === "/api/projects") {
      if (method === "POST") {
        const payload = body()
        const created = {
          id: payload.pre_experiment ? "preexp-nuevo" : "nuevo-1",
          name: payload.name, description: payload.description ?? "", status: "draft", ingestion_status: "PENDING",
          ingestion_generation: 0, created_at: "2026-10-16T10:00:00Z", sensors: [], participants_count: 0,
          is_pre_experiment: Boolean(payload.pre_experiment), planning_participants_count: 0, needs_update: false,
        }
        state.projects.push(created)
        state.created.push(created)
        await route.fulfill({ status: 201, json: created })
      } else {
        await route.fulfill({ json: state.projects })
      }
      return
    }

    if ((m = pathname.match(/^\/api\/projects\/([^/]+)$/))) {
      const id = decodeURIComponent(m[1])
      if (method === "GET") {
        const detail = detailOf(id)
        if (!detail) await route.fulfill({ status: 404, json: { detail: "Project not found" } })
        else await route.fulfill({ json: detail })
      } else if (method === "PATCH") {
        const index = state.projects.findIndex((project) => project.id === id)
        if (index >= 0) state.projects[index] = { ...state.projects[index], ...body() }
        await route.fulfill({ json: state.projects[index] ?? {} })
      } else if (method === "DELETE") {
        state.projects = state.projects.filter((project) => project.id !== id)
        await route.fulfill({ json: { message: "Project deleted successfully", drive_folder_found: true, drive_folder_deleted: true } })
      } else {
        await route.fulfill({ json: {} })
      }
      return
    }

    if ((m = pathname.match(/^\/api\/projects\/([^/]+)\/files\/experiment-zip$/)) && method === "POST") {
      if (options.upload === "hold") await held
      await route.fulfill({ json: uploadSummary(decodeURIComponent(m[1])) })
      return
    }
    if (/\/files\/experiment-zip\/progress$/.test(pathname)) {
      const next = progress[Math.min(progressCalls, progress.length - 1)]
      progressCalls += 1
      await route.fulfill({ json: next })
      return
    }
    if (/\/files\/experiment-zip\/cancel$/.test(pathname)) {
      await route.fulfill({ json: { message: "ok" } })
      return
    }

    if ((m = pathname.match(/^\/api\/projects\/([^/]+)\/files\/([^/]+)\/(image|preview)$/))) {
      await fixtureFile(route, stimulusFor(decodeURIComponent(m[2])))
      return
    }

    if (/^\/api\/projects\/[^/]+\/(sensors|participants|aois)$/.test(pathname) && method === "PUT") {
      await route.fulfill({ json: {} })
      return
    }
    if (/^\/api\/projects\/[^/]+\/finalize$/.test(pathname)) {
      await route.fulfill({ json: { message: "Project finalized successfully", status: "active" } })
      return
    }

    if ((m = pathname.match(/^\/api\/projects\/([^/]+)\/pre-experiment$/))) {
      const id = decodeURIComponent(m[1])
      const envelope = (state.envelopes[id] ?? { revision: 1, config: pilotEnvelope.config, responses: [] }) as { revision: number; config: Json; responses: unknown[] }
      if (method === "PUT") {
        const payload = body() as { config?: Json }
        const saved = { revision: envelope.revision + 1, config: payload.config ?? envelope.config, responses: envelope.responses }
        state.envelopes[id] = saved
        await route.fulfill({ json: saved })
      } else {
        await route.fulfill({ json: envelope })
      }
      return
    }
    if ((m = pathname.match(/^\/api\/projects\/([^/]+)\/pre-experiment\/responses$/)) && method === "POST") {
      const id = decodeURIComponent(m[1])
      const envelope = (state.envelopes[id] ?? pilotEnvelope) as typeof pilotEnvelope
      const payload = body() as { participant_id: string; phase: "before" | "after"; answers: Json }
      const participant = envelope.config.participants.find((p) => p.id === payload.participant_id) ?? envelope.config.participants[0]
      await route.fulfill({
        status: 201,
        json: {
          id: "resp-new", revision: envelope.revision, participant_id: participant.id, phase: payload.phase,
          participant_snapshot: participant, questionnaire_snapshot: envelope.config.questionnaires[payload.phase],
          answers: payload.answers, submitted_at: "2026-10-16T10:30:00Z",
        },
      })
      return
    }
    if (/\/pre-experiment\/export$/.test(pathname)) {
      await route.fulfill({ json: { exported_at: "2026-10-16T10:30:00Z" } })
      return
    }

    if ((m = pathname.match(/^\/api\/projects\/([^/]+)\/analytics\/participants$/))) {
      const detail = detailOf(decodeURIComponent(m[1]))
      const participants = (detail?.participants as typeof dataParticipants | undefined) ?? []
      await route.fulfill({ json: participants.map((p, index) => ({ participant_code: p.participant_code, user_index: index + 1 })) })
      return
    }
    if ((m = pathname.match(/^\/api\/projects\/([^/]+)\/analytics\/scenarios$/))) {
      const detail = detailOf(decodeURIComponent(m[1]))
      const scenaries = (detail?.scenaries as typeof demoScenarios | undefined) ?? []
      await route.fulfill({ json: scenaries.map((s) => ({ name: s.name, type: s.type, file_id: s.file_id })) })
      return
    }

    if (pathname === "/api/reports/executive" && method === "POST") {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="informe-eye-tracking-estudio-participante-1020304050-20261016-1030.pdf"' },
        body: Buffer.from("%PDF-1.4\n%%EOF"),
      })
      return
    }

    state.unhandled.push(`${method} ${pathname}`)
    await route.fulfill({ json: method === "GET" ? [] : {} })
  })

  return { state, releaseUpload: () => releaseHeld?.() }
}

/** Disables animations, hides the dev overlay and scroll bars, and waits for fonts. */
export async function stable(page: Page) {
  await page.addStyleTag({
    content: `*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; scroll-behavior: auto !important; }
      nextjs-portal { display: none !important; }
      html { scrollbar-width: none; } ::-webkit-scrollbar { display: none; }`,
  })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
}
