import assert from "node:assert/strict"
import test from "node:test"
import {
  getMissingStimulusMessage,
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

test("uses the standard instruction and missing-stimulus messages", () => {
  assert.equal(
    getMissingStimulusMessage("Instrucción 1"),
    "Pantalla de instrucción — no hay estímulo visual asociado a este escenario"
  )
  assert.equal(
    getMissingStimulusMessage("Scenario A"),
    'El escenario "Scenario A" no tiene estímulo visual registrado'
  )
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
