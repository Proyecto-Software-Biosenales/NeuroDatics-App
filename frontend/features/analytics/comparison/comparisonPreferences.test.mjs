import assert from "node:assert/strict"
import test from "node:test"
import {
  COMPARISON_PREFERENCES_KEY_PREFIX,
  comparisonPreferencesKey,
  loadComparisonPreferences,
  saveComparisonPreferences,
} from "./comparisonPreferences.ts"

function memoryStorage(entries = []) {
  const values = new Map(entries)
  return {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, value)
    },
    values,
  }
}

function storePayload(storage, userId, projectId, payload) {
  storage.setItem(
    comparisonPreferencesKey(userId, projectId),
    JSON.stringify(payload)
  )
}

test("saves and restores a selection under the versioned user/project key", () => {
  const storage = memoryStorage()

  assert.equal(
    comparisonPreferencesKey("user-7", "project-3"),
    `${COMPARISON_PREFERENCES_KEY_PREFIX}:user-7:project-3`
  )
  assert.equal(
    saveComparisonPreferences(storage, "user-7", "project-3", [
      "gaze",
      "pupil",
    ]),
    true
  )
  assert.deepEqual(
    JSON.parse(
      storage.getItem(comparisonPreferencesKey("user-7", "project-3"))
    ),
    { version: 1, selectedIds: ["pupil", "gaze"] }
  )
  assert.deepEqual(
    loadComparisonPreferences(storage, "user-7", "project-3", [
      "pupil",
      "gaze",
    ]),
    ["pupil", "gaze"]
  )
})

test("isolates preferences by both user and project", () => {
  const storage = memoryStorage()
  saveComparisonPreferences(storage, "user-a", "project-a", ["pupil"])
  saveComparisonPreferences(storage, "user-a", "project-b", ["distance"])
  saveComparisonPreferences(storage, "user-b", "project-a", ["gaze"])

  assert.deepEqual(
    loadComparisonPreferences(storage, "user-a", "project-a", [
      "pupil",
      "distance",
      "gaze",
    ]),
    ["pupil"]
  )
  assert.deepEqual(
    loadComparisonPreferences(storage, "user-a", "project-b", [
      "pupil",
      "distance",
      "gaze",
    ]),
    ["distance"]
  )
  assert.deepEqual(
    loadComparisonPreferences(storage, "user-b", "project-a", [
      "pupil",
      "distance",
      "gaze",
    ]),
    ["gaze"]
  )
  assert.equal(
    loadComparisonPreferences(storage, "user-b", "project-b", ["pupil"]),
    null
  )
})

test("preserves an explicitly empty applied selection", () => {
  const storage = memoryStorage()
  assert.equal(
    saveComparisonPreferences(storage, "user", "project", []),
    true
  )
  assert.deepEqual(
    loadComparisonPreferences(storage, "user", "project", ["pupil"]),
    []
  )
})

test("deduplicates and restores views in canonical registry order", () => {
  const storage = memoryStorage()
  storePayload(storage, "user", "project", {
    version: 1,
    selectedIds: ["aoi", "gaze", "pupil", "gaze", "distance"],
  })

  assert.deepEqual(
    loadComparisonPreferences(storage, "user", "project", [
      "aoi",
      "distance",
      "gaze",
      "pupil",
    ]),
    ["pupil", "distance", "gaze", "aoi"]
  )
})

test("filters unknown IDs while retaining compatible known views", () => {
  const storage = memoryStorage()
  storePayload(storage, "user", "project", {
    version: 1,
    selectedIds: ["future-view", "gsr", "not-a-view", "gsr"],
  })

  assert.deepEqual(
    loadComparisonPreferences(storage, "user", "project", ["gsr"]),
    ["gsr"]
  )
})

test("filters views for removed sensors and falls back when none remain", () => {
  const storage = memoryStorage()
  storePayload(storage, "user", "partly-compatible", {
    version: 1,
    selectedIds: ["pupil", "gsr", "eeg_timeseries"],
  })
  storePayload(storage, "user", "fully-incompatible", {
    version: 1,
    selectedIds: ["pupil", "distance"],
  })

  assert.deepEqual(
    loadComparisonPreferences(storage, "user", "partly-compatible", [
      "gsr",
      "eeg_timeseries",
    ]),
    ["gsr", "eeg_timeseries"]
  )
  assert.equal(
    loadComparisonPreferences(storage, "user", "fully-incompatible", [
      "gsr",
    ]),
    null
  )
})

test("returns null for absent, corrupt, wrong-version, or malformed data", () => {
  const storage = memoryStorage()
  storage.setItem(comparisonPreferencesKey("user", "corrupt"), "{")
  storePayload(storage, "user", "wrong-version", {
    version: 2,
    selectedIds: ["pupil"],
  })
  storePayload(storage, "user", "malformed", {
    version: 1,
    selectedIds: "pupil",
  })
  storePayload(storage, "user", "non-string-id", {
    version: 1,
    selectedIds: ["pupil", null],
  })
  storePayload(storage, "user", "unknown-only", {
    version: 1,
    selectedIds: ["future-view"],
  })

  for (const projectId of [
    "absent",
    "corrupt",
    "wrong-version",
    "malformed",
    "non-string-id",
    "unknown-only",
  ]) {
    assert.equal(
      loadComparisonPreferences(storage, "user", projectId, ["pupil"]),
      null
    )
  }
})

test("contains read and write exceptions", () => {
  const readFailure = {
    getItem() {
      throw new Error("storage blocked")
    },
    setItem() {},
  }
  const writeFailure = {
    getItem() {
      return null
    },
    setItem() {
      throw new Error("quota exceeded")
    },
  }

  assert.equal(
    loadComparisonPreferences(readFailure, "user", "project", ["pupil"]),
    null
  )
  assert.equal(
    saveComparisonPreferences(writeFailure, "user", "project", ["pupil"]),
    false
  )
})
