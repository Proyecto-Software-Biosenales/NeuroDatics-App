import assert from "node:assert/strict"
import test from "node:test"
import { SENSOR_TYPES, hasRealUpdate, isSensorType, toProject } from "./projectMapping.ts"

const api = (extra = {}) => ({
  id: "p1",
  name: "Estudio",
  created_at: "2026-10-05T12:00:00Z",
  sensors: [{ id: "s1", sensor_type: "EEG" }],
  ...extra,
})

test("every screen gets the same day/month/year date, with two digits", () => {
  assert.equal(toProject(api()).createdAt, "05/10/2026")
  assert.equal(toProject(api({ created_at: "2026-01-02T12:00:00Z" })).createdAt, "02/01/2026")
})

test("a missing date says so and an unreadable one is shown as it came", () => {
  assert.equal(toProject(api({ created_at: undefined })).createdAt, "Sin fecha")
  assert.equal(toProject(api({ created_at: "ayer" })).createdAt, "ayer")
})

test("the update time shows only when the project changed after it was created", () => {
  assert.equal(toProject(api({ updated_at: "2026-10-05T12:00:00.500Z" })).updatedAt, undefined)
  assert.match(toProject(api({ updated_at: "2026-10-06T12:00:00Z" })).updatedAt, /^06\/10\/2026, \d{2}:\d{2}$/)
  assert.equal(hasRealUpdate(undefined, "2026-10-05T12:00:00Z"), false)
  assert.equal(hasRealUpdate("2026-10-05T12:00:00Z", undefined), true)
})

test("only the known sensors are kept, once each", () => {
  const sensors = ["EEG", "Eye", "GSR", "EEG", "EyeTracker"].map((sensor_type, id) => ({ id: String(id), sensor_type }))
  assert.deepEqual(toProject(api({ sensors })).sensors, ["EEG", "GSR", "EyeTracker"])
  assert.deepEqual(toProject(api({ sensors: undefined })).sensors, [])
  assert.deepEqual([...SENSOR_TYPES], ["EEG", "GSR", "EyeTracker"])
  assert.equal(isSensorType("GSR"), true)
  assert.equal(isSensorType("gsr"), false)
  assert.equal(isSensorType(undefined), false)
})

test("status and ingestion are normalised and the counters default to zero", () => {
  const project = toProject(api({ status: "ARCHIVED", ingestion_status: "ready" }))
  assert.equal(project.status, "archived")
  assert.equal(project.ingestionStatus, "READY")
  assert.equal(toProject(api({ status: "otro" })).status, "active")
  assert.equal(toProject(api({ ingestion_status: "otro" })).ingestionStatus, undefined)
  assert.equal(project.participants, 0)
  assert.equal(project.planningParticipantsCount, 0)
  assert.equal(project.isPreExperiment, false)
  assert.equal(project.needsUpdate, false)
  assert.equal(toProject(api({ description: null })).description, undefined)
})
