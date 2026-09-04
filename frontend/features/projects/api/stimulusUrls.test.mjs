import assert from "node:assert/strict"
import test from "node:test"
import { getStimulusImageUrl, getStimulusPreviewUrl } from "./stimulusUrls.ts"

test("stimulus image and preview paths preserve project and file identity", () => {
  assert.equal(getStimulusImageUrl("project-a", "file-b"), "/api/projects/project-a/files/file-b/image")
  assert.equal(getStimulusPreviewUrl("project-a", "file-b"), "/api/projects/project-a/files/file-b/preview")
})

test("preview timestamps distinguish an explicit zero from an omitted timestamp", () => {
  assert.equal(getStimulusPreviewUrl("p", "f", { timeS: 0 }), "/api/projects/p/files/f/preview?time_s=0")
  assert.equal(getStimulusPreviewUrl("p", "f", { timeS: 12.25 }), "/api/projects/p/files/f/preview?time_s=12.25")
  assert.equal(getStimulusPreviewUrl("p", "f", { timeS: null }), "/api/projects/p/files/f/preview")
  assert.equal(getStimulusPreviewUrl("p", "f", { timeS: undefined }), "/api/projects/p/files/f/preview")
})

test("preview query encoding and order match the existing analytics URLs", () => {
  assert.equal(
    getStimulusPreviewUrl("p", "f", { timeS: 0, participantCode: "P 01+é", scenario: "Instrucción 01 & test.png" }),
    "/api/projects/p/files/f/preview?time_s=0&participant_code=P+01%2B%C3%A9&scenario=Instrucci%C3%B3n+01+%26+test.png"
  )
})

test("empty optional labels add no query parameters or trailing question mark", () => {
  assert.equal(getStimulusPreviewUrl("p", "f", { participantCode: "", scenario: null }), "/api/projects/p/files/f/preview")
  assert.equal(getStimulusPreviewUrl("p", "f", { participantCode: null, scenario: "Scene 1" }), "/api/projects/p/files/f/preview?scenario=Scene+1")
})

test("project preview callers can preserve their positive-time-only contract", () => {
  for (const timeS of [0, -1, NaN]) {
    assert.equal(getStimulusPreviewUrl("p", "f", { timeS: timeS > 0 ? timeS : undefined }), "/api/projects/p/files/f/preview")
  }
  assert.equal(getStimulusPreviewUrl("p", "f", { timeS: 1.5 }), "/api/projects/p/files/f/preview?time_s=1.5")
})
