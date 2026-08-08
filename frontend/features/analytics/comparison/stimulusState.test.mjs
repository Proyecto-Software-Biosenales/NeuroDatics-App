import assert from "node:assert/strict"
import test from "node:test"
import {
  getMissingStimulusDescriptor,
  getPreviewFailureMessage,
  hasGazeCoordinates,
  resolveStimulusPointStatus,
  supportsStimulusAois,
} from "../components/stimulusState.ts"

const gaze = {
  nearest_time_s: 12.5,
  scenario: "Scenario A",
  gx: 0,
  gy: 0,
  scenario_file_id: "file-1",
  scenario_type: "image",
}

const emptyPreview = { url: null, loading: false, error: null }

test("classifies bilingual fileless scenario names regardless of case or accents", () => {
  const cases = [
    ["Instruction 1.png", "instructions", "INSTRUCCIONES"],
    ["Instructions02.png", "instructions", "INSTRUCCIONES"],
    ["INSTRUCCIÓN 2.JPG", "instructions", "INSTRUCCIONES"],
    ["practice-03.webp", "practice", "PRÁCTICA"],
    ["Práctica 4.MP4", "practice", "PRÁCTICA"],
    ["Introduction.mov", "introduction", "INTRODUCCIÓN"],
    ["Introducción_02.svg", "introduction", "INTRODUCCIÓN"],
    ["blank-screen.jpeg", "blank", "PANTALLA EN BLANCO"],
    ["Pantalla en blanco 01.PNG", "blank", "PANTALLA EN BLANCO"],
    ["rest 1.gif", "rest", "DESCANSO"],
    ["Descanso_2.webm", "rest", "DESCANSO"],
    ["fixation-01.bmp", "fixation", "FIJACIÓN"],
    ["Fijación 2.tiff", "fixation", "FIJACIÓN"],
  ]

  for (const [scenario, category, displayLabel] of cases) {
    assert.deepEqual(getMissingStimulusDescriptor(scenario), {
      category,
      displayLabel,
    })
  }
})

test("uses a cleaned scenario basename for unknown fileless scenarios", () => {
  assert.deepEqual(
    getMissingStimulusDescriptor("  study/Visual objetivo final.JPEG  "),
    { category: "custom", displayLabel: "Visual objetivo final" }
  )
  assert.deepEqual(
    getMissingStimulusDescriptor("C:\\stimuli\\Escenario Personalizado.MKV"),
    { category: "custom", displayLabel: "Escenario Personalizado" }
  )
  assert.deepEqual(getMissingStimulusDescriptor("archive.session"), {
    category: "custom",
    displayLabel: "archive.session",
  })
  assert.deepEqual(getMissingStimulusDescriptor("Restaurant.png"), {
    category: "custom",
    displayLabel: "Restaurant",
  })
  assert.deepEqual(getMissingStimulusDescriptor("Blanket.jpg"), {
    category: "custom",
    displayLabel: "Blanket",
  })
})

test("uses the generic no-stimulus label for null or empty scenario names", () => {
  for (const scenario of [null, "", "   ", "path/.png"]) {
    assert.deepEqual(getMissingStimulusDescriptor(scenario), {
      category: "missing",
      displayLabel: "SIN ESTÍMULO VISUAL",
    })
  }
})

test("treats zero coordinates as a valid fixation point", () => {
  assert.equal(hasGazeCoordinates(gaze), true)
  assert.equal(hasGazeCoordinates({ ...gaze, gx: null }), false)
  assert.equal(hasGazeCoordinates({ ...gaze, gy: null }), false)
})

test("keeps static AOIs off video frames like the standard view", () => {
  assert.equal(supportsStimulusAois(gaze), true)
  assert.equal(supportsStimulusAois({ ...gaze, scenario_type: "VIDEO" }), false)
  assert.equal(supportsStimulusAois(null), true)
})

test("resolves every point-on-stimulus display state", () => {
  assert.equal(
    resolveStimulusPointStatus({
      gaze: null,
      gazeLoading: true,
      preview: emptyPreview,
    }),
    "loading-gaze"
  )
  assert.equal(
    resolveStimulusPointStatus({
      gaze: null,
      gazeLoading: false,
      preview: emptyPreview,
    }),
    "no-gaze"
  )
  assert.equal(
    resolveStimulusPointStatus({
      gaze: { ...gaze, gx: null },
      gazeLoading: false,
      preview: emptyPreview,
    }),
    "no-coordinates"
  )
  assert.equal(
    resolveStimulusPointStatus({
      gaze: { ...gaze, scenario_file_id: null },
      gazeLoading: false,
      preview: emptyPreview,
    }),
    "no-stimulus"
  )
  assert.equal(
    resolveStimulusPointStatus({
      gaze,
      gazeLoading: false,
      preview: { ...emptyPreview, loading: true },
    }),
    "loading-preview"
  )
  assert.equal(
    resolveStimulusPointStatus({
      gaze,
      gazeLoading: false,
      preview: emptyPreview,
    }),
    "preview-error"
  )
  assert.equal(
    resolveStimulusPointStatus({
      gaze,
      gazeLoading: false,
      preview: { ...emptyPreview, url: "blob:preview" },
    }),
    "ready"
  )
})

test("uses the standard video and image preview failure messages", () => {
  assert.equal(
    getPreviewFailureMessage({ ...gaze, scenario_type: "video" }, "detail"),
    "No se pudo cargar el frame del video."
  )
  assert.equal(
    getPreviewFailureMessage(gaze, null),
    "No se pudo cargar la imagen del escenario."
  )
})
