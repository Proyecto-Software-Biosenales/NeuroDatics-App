import assert from "node:assert/strict"
import test from "node:test"
import {
  DEVICE_REPORTS,
  deviceSections,
  filenameFromDisposition,
  reportDevices,
} from "./reportContents.ts"

test("one device reports itself; all devices expand to the project's sensors", () => {
  const available = ["EyeTracker", "EEG"]
  assert.deepEqual(reportDevices("EEG", available), ["EEG"])
  assert.deepEqual(reportDevices("all", available), ["EyeTracker", "EEG"])
  assert.deepEqual(reportDevices("GSR", available), [])
  assert.deepEqual(reportDevices(null, available), [])
})

test("the preview lists the sections of the chosen scope", () => {
  assert.deepEqual(deviceSections("GSR", "participant"), DEVICE_REPORTS.GSR.sections.individual)
  assert.deepEqual(deviceSections("GSR", "all-participants"), DEVICE_REPORTS.GSR.sections.group)
  for (const report of Object.values(DEVICE_REPORTS)) {
    assert.ok(report.sections.individual.length > 0 && report.sections.group.length > 0)
  }
})

test("downloads keep the server's filename and fall back when it is absent", () => {
  assert.equal(
    filenameFromDisposition('attachment; filename="informe-eeg-saio-grupo-20260917-1205.pdf"', "informe.pdf"),
    "informe-eeg-saio-grupo-20260917-1205.pdf"
  )
  assert.equal(
    filenameFromDisposition("attachment; filename*=UTF-8''informes%20saio.zip", "informe.zip"),
    "informes saio.zip"
  )
  assert.equal(filenameFromDisposition(null, "informe.zip"), "informe.zip")
  assert.equal(filenameFromDisposition("attachment", "informe.pdf"), "informe.pdf")
})
