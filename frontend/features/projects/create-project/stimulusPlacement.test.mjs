import assert from "node:assert/strict"
import test from "node:test"
import {
  createEmptyStimulusPlacementDraft,
  isStimulusPlacementDraftValid,
  selectedStimulusPaths,
  serializeStimulusPlacements,
} from "./stimulusPlacement.ts"

test("serializes the approved centered-square placement", () => {
  const draft = {
    ...createEmptyStimulusPlacementDraft("Images/square.png"),
    enabled: true,
    screenWidthPx: "1920",
    screenHeightPx: "1080",
    stimulusLeftPx: "420",
    stimulusTopPx: "0",
    stimulusWidthPx: "1080",
    stimulusHeightPx: "1080",
  }

  const [envelope] = serializeStimulusPlacements([draft])

  assert.equal(envelope.source_entry_path, "Images/square.png")
  assert.equal(envelope.placement.contract_version, "screen-stimulus-v1")
  assert.equal(envelope.placement.screen_width_px, 1920)
  assert.equal(envelope.placement.stimulus_left_px, 420)
  assert.equal(envelope.placement.viewport, undefined)
})

test("omitted placement remains an explicit legacy omission", () => {
  const draft = createEmptyStimulusPlacementDraft("Images/square.png")

  assert.equal(isStimulusPlacementDraftValid(draft), true)
  assert.deepEqual(serializeStimulusPlacements([draft]), [])
})

test("requires integer screen pixels and a complete positive displayed rectangle", () => {
  const draft = {
    ...createEmptyStimulusPlacementDraft("Images/square.png"),
    enabled: true,
    screenWidthPx: "1920.5",
    screenHeightPx: "1080",
    stimulusLeftPx: "420",
    stimulusTopPx: "0",
    stimulusWidthPx: "1080",
    stimulusHeightPx: "1080",
  }

  assert.equal(isStimulusPlacementDraftValid(draft), false)
  assert.throws(() => serializeStimulusPlacements([draft]))
})

test("discovers only media inside the selected Images and Videos folders", () => {
  const files = [
    { name: "a.png", _relativePath: "Experiment/Images/a.png" },
    { name: "notes.txt", _relativePath: "Experiment/Images/notes.txt" },
    { name: "b.mp4", _relativePath: "Experiment/Videos/b.mp4" },
    { name: "ignored.png", _relativePath: "Experiment/Other/ignored.png" },
  ]
  const selection = {
    selectedCsvPath: "data.csv",
    selectedImagesFolder: "Images",
    selectedVideosFolder: "Videos",
    selectedAcquisitionFolder: null,
    allowMissingImages: false,
    allowMissingVideos: false,
  }

  assert.deepEqual(
    selectedStimulusPaths(files, "Experiment", selection),
    ["Images/a.png", "Videos/b.mp4"],
  )
})

