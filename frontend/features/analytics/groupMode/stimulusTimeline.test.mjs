import assert from "node:assert/strict"
import test from "node:test"
import { alignOnTimeline, alignsByStimulus, buildStimulusTimeline, placeCardResult, placeOnTimeline, SLOT_GAP_S, timelineToRecording } from "./stimulusTimeline.ts"

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)

const segment = (scenario, onset_s, end_s) => ({ scenario, onset_s, end_s })

// Two recordings of the same three stimuli: B started 15 s later and paused 7 s before the video.
const A = [segment("Instrucción", 10, 15), segment("Video", 16, 46), segment("Imagen", 46.1, 51)]
const B = [segment("Instrucción", 25, 30), segment("Video", 38, 68), segment("Imagen", 68.1, 73)]

test("every stimulus starts at the same second for every participant", () => {
  const timeline = buildStimulusTimeline(new Map([["A", A], ["B", B]]))
  assert.deepEqual(timeline.slots.map((slot) => slot.scenario), ["Instrucción", "Video", "Imagen"])
  close(timeline.slots[0].start, 0)
  close(timeline.slots[1].start, 5 + SLOT_GAP_S)
  close(timeline.slots[2].start, 35 + 2 * SLOT_GAP_S)

  // The lead-in and the pause are not on the axis; the video's 3rd second is the same instant.
  const a = placeOnTimeline(timeline, "A", [5, 12, 19, 46.5])
  const b = placeOnTimeline(timeline, "B", [20, 27, 34, 41, 68.6])
  assert.ok(Number.isNaN(a[0]))
  close(a[1], 2)
  close(a[2], timeline.slots[1].start + 3)
  close(a[3], timeline.slots[2].start + 0.4)
  assert.ok(Number.isNaN(b[0]))
  close(b[1], 2)
  assert.ok(Number.isNaN(b[2]), "a pause between stimuli is not drawn")
  close(b[3], timeline.slots[1].start + 3)
  close(b[4], timeline.slots[2].start + 0.5)
})

test("a group second maps back to each participant's own second and stimulus", () => {
  const timeline = buildStimulusTimeline(new Map([["A", A], ["B", B]]))
  const instant = timeline.slots[1].start + 3
  const a = timelineToRecording(timeline, "A", instant)
  const b = timelineToRecording(timeline, "B", instant)
  assert.equal(a.scenario, "Video")
  close(a.recordingTime, 19)
  close(b.recordingTime, 41)
  assert.equal(timelineToRecording(timeline, "C", instant), null)
  assert.equal(timelineToRecording(timeline, "A", -1), null)
})

test("stimuli shown in another order still share their slot; slots follow the usual order", () => {
  const swapped = [segment("Video", 0, 30), segment("Instrucción", 31, 36), segment("Imagen", 36.1, 41)]
  const timeline = buildStimulusTimeline(new Map([["A", A], ["B", B], ["C", swapped]]))
  assert.deepEqual(timeline.slots.map((slot) => slot.scenario), ["Instrucción", "Video", "Imagen"])
  close(placeOnTimeline(timeline, "C", [32])[0], 1)
  close(placeOnTimeline(timeline, "C", [3])[0], timeline.slots[1].start + 3)
})

test("a repeated stimulus fills two slots; names match whatever their spacing or case", () => {
  const repeated = [segment("Instrucción", 0, 5), segment("instrucción ", 6, 11)]
  const timeline = buildStimulusTimeline(new Map([["A", [segment("Instrucción", 0, 4)]], ["R", repeated]]))
  assert.equal(timeline.slots.length, 2)
  close(timeline.slots[0].end, 5, 1e-9)
  assert.equal(timeline.placements.get("A")[1], null)
  // The shorter recording ends early inside its slot.
  assert.equal(timelineToRecording(timeline, "A", 4.5), null)
})

test("without labelled scenarios there is no timeline", () => {
  assert.equal(buildStimulusTimeline(new Map([["A", []], ["B", []]])), null)
  const timeline = buildStimulusTimeline(new Map([["A", A], ["B", []]]))
  assert.equal(timeline.placements.has("B"), false)
})

test("card results keep only stimulus time, in order, with their recording time", () => {
  const timeline = buildStimulusTimeline(new Map([["A", A], ["B", B]]))
  const points = [5, 12, 20, 38, 41].map((time) => ({ time, sourceTime: time, left: time }))
  const result = { type: "temporal", points, keys: ["left"], channels: [], metadata: null, displayOffset: 0, recordingOffset: 0, aligned: false }
  const aligned = alignOnTimeline(result, timeline, "B")
  assert.equal(aligned.aligned, true)
  assert.deepEqual(aligned.points.map((point) => point.sourceTime), [38, 41])
  close(aligned.points[0].time, timeline.slots[1].start)
  assert.equal(alignOnTimeline({ ...result, points: points.slice(0, 1) }, timeline, "B"), null)

  const spectrogram = {
    type: "spectrogram",
    data: { time: [12, 20, 27], frequency: [1, 2], power: { F3: [[1, 2, 3], [4, 5, 6]] } },
    displayOffset: 0,
    recordingOffset: 0,
    aligned: false,
  }
  const windows = alignOnTimeline(spectrogram, timeline, "B")
  assert.deepEqual(windows.data.time, [2])
  assert.deepEqual(windows.data.power.F3, [[3], [6]])
})

test("only time views with «Todos los escenarios» line up by stimulus", () => {
  assert.equal(alignsByStimulus("pupil", "all"), true)
  assert.equal(alignsByStimulus("eeg_spectrogram", ""), true)
  assert.equal(alignsByStimulus("pupil", "Escena 1"), false)
  assert.equal(alignsByStimulus("eeg_psd", "all"), false)
  assert.equal(alignsByStimulus("heatmap", "all"), false)
})

test("a card that cannot be placed says why", () => {
  const timeline = buildStimulusTimeline(new Map([["A", A], ["B", []]]))
  const points = [{ time: 12, sourceTime: 12, left: 1 }]
  const result = { type: "temporal", points, keys: ["left"], channels: [], metadata: null, displayOffset: 0, recordingOffset: 0, aligned: false }
  assert.match(placeCardResult(result, timeline, "B").message, /no marca ningún escenario/)
  assert.match(placeCardResult({ ...result, points: [{ time: 5, sourceTime: 5, left: 1 }] }, timeline, "A").message, /durante los estímulos/)
  assert.equal(placeCardResult(result, timeline, "A").type, "temporal")
  const empty = { type: "empty", message: "Sin datos" }
  assert.equal(placeCardResult(empty, timeline, "A"), empty)
})
