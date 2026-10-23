// Simulated analytics API for the Dashboard figures (chapter 5 and the cover). All numbers come from
// deterministic formulas: nothing here is real or comes from SAIO. It is installed AFTER installMocks, so
// its routes answer first and anything it does not know falls back to the general simulation.
import type { Browser, Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { dataParticipants, demoScenarios } from "./manualMocks"
import { HEATMAP_DIR } from "./manualAssets"

type Json = Record<string, unknown>

// ---------- tiny deterministic noise ----------

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Smooth value noise in [-1, 1] at time t. */
function wobble(t: number, seed: number, period: number) {
  const x = t / period
  const i = Math.floor(x)
  const f = x - i
  const a = rng(seed * 7919 + i)() * 2 - 1
  const b = rng(seed * 7919 + i + 1)() * 2 - 1
  const s = f * f * (3 - 2 * f)
  return a + (b - a) * s
}

const r = (value: number, digits = 3) => Number(value.toFixed(digits))

// ---------- scenarios and time ----------

export const SCENARIO_RANGES: Record<string, [number, number]> = {
  "Página principal": [4, 34],
  "Oferta destacada": [34, 64],
  "Video de campaña": [64, 94],
}
const ALL_RANGE: [number, number] = [0, 94]
const FILE_OF: Record<string, string> = { "Página principal": "file-home", "Oferta destacada": "file-offer", "Video de campaña": "file-video" }
const TYPE_OF: Record<string, string> = { "Página principal": "image", "Oferta destacada": "image", "Video de campaña": "video" }

export const SCENARIO_HOME = "Página principal"

function rangeFor(scenario: string): [number, number] {
  return SCENARIO_RANGES[scenario] ?? ALL_RANGE
}

function scenarioAt(t: number): string | null {
  for (const [name, [a, b]] of Object.entries(SCENARIO_RANGES)) if (t >= a && t < b) return name
  return null
}

const participantIndex = (code: string | null) => Math.max(0, dataParticipants.findIndex((p) => p.participant_code === code))

function timeAxis(scenario: string, params: URLSearchParams, rate: number) {
  const [a, b] = rangeFor(scenario)
  const start = params.get("start_time_s") != null ? Math.max(a, Number(params.get("start_time_s"))) : a
  const end = params.get("end_time_s") != null ? Math.min(b, Number(params.get("end_time_s"))) : b
  const n = Math.max(2, Math.round((end - start) * rate) + 1)
  return Array.from({ length: n }, (_, k) => r(start + k / rate, 3))
}

// ---------- fixations (the same list feeds gaze, fixations, heatmap, scanpath and AOIs) ----------

type Waypoint = { x: number; y: number; weight: number }

const WAYPOINTS: Record<string, Waypoint[]> = {
  "Página principal": [
    { x: 0.1, y: 0.07, weight: 1 }, { x: 0.91, y: 0.07, weight: 1 },
    { x: 0.2, y: 0.26, weight: 4 }, { x: 0.33, y: 0.31, weight: 3 },
    { x: 0.27, y: 0.42, weight: 2 }, { x: 0.2, y: 0.5, weight: 1.5 },
    { x: 0.81, y: 0.35, weight: 5 }, { x: 0.79, y: 0.42, weight: 2 },
    { x: 0.2, y: 0.78, weight: 2 }, { x: 0.5, y: 0.78, weight: 2 }, { x: 0.8, y: 0.78, weight: 1.5 },
  ],
  "Oferta destacada": [
    { x: 0.2, y: 0.28, weight: 5 }, { x: 0.12, y: 0.12, weight: 1 }, { x: 0.18, y: 0.62, weight: 2 },
    { x: 0.12, y: 0.82, weight: 2 }, { x: 0.57, y: 0.5, weight: 3 }, { x: 0.78, y: 0.5, weight: 2 },
    { x: 0.58, y: 0.82, weight: 2 }, { x: 0.89, y: 0.19, weight: 1.5 },
  ],
  "Video de campaña": [
    { x: 0.35, y: 0.28, weight: 4 }, { x: 0.3, y: 0.52, weight: 2 }, { x: 0.78, y: 0.47, weight: 3 }, { x: 0.5, y: 0.93, weight: 1 },
  ],
}

export type Fixation = { x_norm: number; y_norm: number; time_s: number; duration_s: number; t_end_s: number }

const fixationCache = new Map<string, Fixation[]>()

/** Every detected fixation of a scenario (200 ms and longer are kept by the API; here shorter ones also exist). */
export function fixationsOf(scenario: string, participant: string | null): Fixation[] {
  const key = `${scenario}|${participant}`
  const cached = fixationCache.get(key)
  if (cached) return cached
  const [a, b] = rangeFor(scenario)
  const waypoints = WAYPOINTS[scenario] ?? WAYPOINTS["Página principal"]
  const total = waypoints.reduce((sum, w) => sum + w.weight, 0)
  const random = rng(101 + participantIndex(participant) * 31 + (scenario.length * 7))
  const list: Fixation[] = []
  let t = a + 0.35
  while (t < b - 1.2) {
    let pick = random() * total
    let way = waypoints[0]
    for (const w of waypoints) { pick -= w.weight; if (pick <= 0) { way = w; break } }
    const duration = Math.min(1.35, 0.12 + -Math.log(1 - random() * 0.97) * 0.34)
    list.push({
      x_norm: r(Math.min(0.98, Math.max(0.02, way.x + (random() - 0.5) * 0.06)), 4),
      y_norm: r(Math.min(0.98, Math.max(0.02, way.y + (random() - 0.5) * 0.05)), 4),
      time_s: r(t, 3), duration_s: r(duration, 3), t_end_s: r(t + duration, 3),
    })
    t += duration + 0.05 + random() * 0.04
  }
  fixationCache.set(key, list)
  return list
}

function filtered(scenario: string, participant: string | null, minMs: number) {
  return fixationsOf(scenario, participant).filter((f) => f.duration_s * 1000 >= minMs)
}

// ---------- continuous signals ----------

function fixationAtTime(t: number, participant: string | null) {
  const name = scenarioAt(t)
  if (!name) return null
  const list = fixationsOf(name, participant)
  let current = list[0]
  for (const f of list) { if (f.time_s <= t) current = f; else break }
  return { fixation: current, name }
}

function gazeAtTime(t: number, participant: string | null): { gx: number | null; gy: number | null; scenario: string | null } {
  const hit = fixationAtTime(t, participant)
  if (!hit) return { gx: null, gy: null, scenario: null }
  // Short blinks: no gaze.
  if (wobble(t, 91, 6.5) > 0.93) return { gx: null, gy: null, scenario: hit.name }
  return {
    gx: r(hit.fixation.x_norm * 100 + wobble(t, 5, 0.12) * 0.7, 2),
    gy: r(hit.fixation.y_norm * 100 + wobble(t, 6, 0.12) * 0.7, 2),
    scenario: hit.name,
  }
}

function pupilBase(t: number, pi: number, eye: number) {
  const bumps = [[8, 0.5], [12, 0.45], [19, -0.3], [27, -0.34], [41, 0.5], [53, 0.38], [70, -0.3], [83, 0.5]] as const
  let v = 3.38 + pi * 0.06 + eye * 0.05
  v += 0.1 * Math.sin(t * (0.37 + pi * 0.05) + pi * 2) + 0.06 * Math.sin(t * 1.3 + eye + pi)
  for (const [c, a] of bumps) v += a * (1 - 0.18 * pi) * Math.exp(-((t - c - pi * 2.3) ** 2) / 8)
  return v
}

function pupilData(scenario: string, params: URLSearchParams, participant: string | null) {
  const pi = participantIndex(participant)
  const time = timeAxis(scenario, params, 10)
  const left: number[] = []
  const right: number[] = []
  const sl: number[] = []
  const sr: number[] = []
  time.forEach((t) => {
    const l = pupilBase(t, pi, 0)
    const rr = pupilBase(t, pi, 1)
    left.push(r(l + wobble(t, 11, 0.1) * 0.03, 3))
    right.push(r(rr + wobble(t, 12, 0.1) * 0.03, 3))
    sl.push(r(l, 3))
    sr.push(r(rr, 3))
  })
  const average = left.map((v, i) => r((v + right[i]) / 2, 3))
  return { time, left, right, average, smooth_left: sl, smooth_right: sr }
}

function distanceData(scenario: string, params: URLSearchParams, participant: string | null) {
  const pi = participantIndex(participant)
  const time = timeAxis(scenario, params, 10)
  const distance_cm = time.map((t) => r(62 + pi * 1.5 + 2.4 * Math.sin(t * 0.21 + pi) + 1.2 * wobble(t, 3, 4) + 0.2 * wobble(t, 4, 0.1), 2))
  return { time, distance_cm }
}

function gsrData(scenario: string, params: URLSearchParams, participant: string | null) {
  const pi = participantIndex(participant)
  const time = timeAxis(scenario, params, 10)
  const gsr_smooth = time.map((t) => {
    let v = 4.1 + pi * 0.3 + t * 0.012 + 0.25 * Math.sin(t * 0.15)
    for (const [c, a] of [[14, 1.3], [29, 0.8], [47, 1.5], [66, 0.9], [85, 1.2]] as const) v += a * Math.exp(-((t - c) ** 2) / 14)
    return r(v, 4)
  })
  const gsr = gsr_smooth.map((v, i) => r(v + wobble(time[i], 21, 0.2) * 0.05, 4))
  return { time, gsr, gsr_smooth }
}

function summary(values: number[]) {
  const sorted = [...values].sort((x, y) => x - y)
  const n = values.length
  const mean = values.reduce((s, v) => s + v, 0) / n
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n)
  const median = sorted[Math.floor(n / 2)]
  const baseline = sorted[Math.floor(n * 0.1)]
  return { mean, min: sorted[0], max: sorted[n - 1], std, median, baseline }
}

// ---------- EEG ----------

export const EEG_CHANNELS = ["le", "f4", "c4", "p4", "p3", "c3", "f3"]
const TOPO_CHANNELS = ["f3", "f4", "c3", "c4", "p3", "p4"]
const TOPO_POSITIONS: Record<string, number[]> = Object.fromEntries(Object.entries({
  f3: [-0.5, 0.6], f4: [0.5, 0.6], c3: [-0.6, 0], c4: [0.6, 0], p3: [-0.5, -0.6], p4: [0.5, -0.6],
}).map(([k, v]) => [k, v.map((n) => r(n * 1.0897, 4))]))

function eegParts(channel: string, t: number, pi: number) {
  const c = EEG_CHANNELS.indexOf(channel)
  const alpha = (6 + (channel.startsWith("p") ? 5 : 0) + (c % 3)) * Math.sin(2 * Math.PI * (9.6 + 0.2 * c) * t + c)
  const theta = 4 * Math.sin(2 * Math.PI * 5.5 * t + c * 2) * (0.6 + 0.4 * Math.sin(t * 0.3))
  const beta = 1.2 * Math.sin(2 * Math.PI * (19 + c) * t) + 0.8 * Math.sin(2 * Math.PI * 23.3 * t + pi)
  const slow = 6 * Math.sin(t * 0.7 + c) + 5 * wobble(t, 40 + c, 1.5)
  const fast = alpha * (0.7 + 0.3 * Math.sin(t * 0.5)) * 0.45 + beta + 1 * wobble(t, 60 + c, 0.03)
  return { smooth: slow + theta * 0.12, raw: slow + theta + fast }
}


function eegStats(values: number[]) {
  const s = summary(values)
  return {
    count: values.length * 25, mean: r(s.mean, 3), std: r(s.std, 3), median: r(s.median, 3), min: r(s.min, 3), max: r(s.max, 3),
    rms: r(Math.sqrt(values.reduce((a, v) => a + v * v, 0) / values.length), 3),
  }
}

const qualityOf = (channel: string, flagged: boolean) => ({
  transient_candidates: flagged ? 3 : 0,
  transient_step_threshold_uV_assumed: 75,
  max_absolute_step: flagged ? 112.4 : 18.2,
  median_offset: r(0.4 + EEG_CHANNELS.indexOf(channel) * 0.1, 2),
  valid_samples: 23_480, missing_samples: flagged ? 36 : 0, repeated_adjacent_samples: 0,
  quantization_step_uV: 0.0625, constant: false,
  amplitude_outlier_samples: flagged ? 12 : 0, amplitude_z_max: flagged ? 6.8 : 3.1, amplitude_z_threshold: 6,
  step_threshold_ceiling_uV_assumed: 200, peak_to_peak_window_s: 1,
  peak_to_peak_max_uV: flagged ? 188 : 61, peak_to_peak_threshold_uV_assumed: 150,
  peak_to_peak_excursions: flagged ? 2 : 0,
})

function eegTimeseries(scenario: string, params: URLSearchParams, participant: string | null) {
  const pi = participantIndex(participant)
  const requested = (params.get("channels") ?? "").split(",").filter(Boolean)
  const channels = (requested.length ? requested : EEG_CHANNELS).filter((c) => EEG_CHANNELS.includes(c))
  const time = timeAxis(scenario, params, 40)
  const raw: Record<string, number[]> = {}
  const smooth: Record<string, number[]> = {}
  const statistics = { raw: {} as Record<string, unknown>, smooth: {} as Record<string, unknown> }
  for (const channel of channels) {
    raw[channel] = time.map((t) => r(eegParts(channel, t, pi).raw, 2))
    smooth[channel] = time.map((t) => r(eegParts(channel, t, pi).smooth, 2))
    statistics.raw[channel] = eegStats(raw[channel])
    statistics.smooth[channel] = eegStats(smooth[channel])
  }
  const [a] = rangeFor(scenario)
  const spans = scenario === "all" ? [] : [
    { channel: "f4", start_s: a + 11.2, end_s: a + 11.6, peak_uV: 118.5, z: 6.9, detector: "amplitude" },
    { channel: "f4", start_s: a + 19.4, end_s: a + 19.6, peak_uV: null, z: null, detector: "step" },
    { channel: "f3", start_s: a + 11.2, end_s: a + 11.5, peak_uV: 102.2, z: 6.2, detector: "amplitude" },
  ]
  return {
    time, channels, available_channels: EEG_CHANNELS, sampling_rate_hz: 250,
    metadata: {
      version: "eeg-v2", warnings: [], reference: "LE",
      channels: Object.fromEntries(EEG_CHANNELS.map((c) => [c, qualityOf(c, c === "f4" || c === "f3")])),
      artifact_spans: spans, artifact_spans_total: spans.length,
      display_reduction: "none", hop_s: 1,
    },
    raw, smooth, statistics,
  }
}

function eegPsd(scenario: string, params: URLSearchParams) {
  const requested = (params.get("channels") ?? "").split(",").filter(Boolean)
  const channels = (requested.length ? requested : EEG_CHANNELS).filter((c) => EEG_CHANNELS.includes(c))
  const maxFreq = Number(params.get("max_freq_hz") ?? 40) || 40
  const frequency = Array.from({ length: Math.round(maxFreq * 2) }, (_, k) => r((k + 1) / 2, 1))
  const power: Record<string, number[]> = {}
  channels.forEach((channel) => {
    const c = EEG_CHANNELS.indexOf(channel)
    const posterior = channel.startsWith("p") ? 6 : 0
    power[channel] = frequency.map((f) => r(
      -4 - 9 * Math.log10(f + 0.5) * 1.6 + (1.2 + posterior) * Math.exp(-((f - (9.8 + c * 0.1)) ** 2) / 3.5) * 2.6
      + 1.1 * Math.exp(-((f - 5.5) ** 2) / 5) + 0.8 * Math.exp(-((f - 20) ** 2) / 18) + wobble(f, 70 + c, 1.2) * 0.9, 2))
  })
  void scenario
  return {
    frequency, channels, available_channels: EEG_CHANNELS, sampling_rate_hz: 250, use_db: true, unit: "dB",
    metadata: { version: "eeg-v2", warnings: [], windows_total: { le: 46 }, windows_flagged: { le: 2 } },
    power,
  }
}

function eegSpectrogram(scenario: string, params: URLSearchParams) {
  const requested = (params.get("channels") ?? "").split(",").filter(Boolean)
  const channels = (requested.length ? requested : EEG_CHANNELS).filter((c) => EEG_CHANNELS.includes(c))
  const [a, b] = rangeFor(scenario)
  const start = params.get("start_time_s") != null ? Math.max(a, Number(params.get("start_time_s"))) : a
  const end = params.get("end_time_s") != null ? Math.min(b, Number(params.get("end_time_s"))) : b
  const hop = Math.max(0.25, (end - start) / 120)
  const time = Array.from({ length: Math.round((end - start) / hop) }, (_, k) => r(start + k * hop, 2))
  const frequency = Array.from({ length: 50 }, (_, k) => r(0.5 + k * 0.5, 1))
  const power: Record<string, number[][]> = {}
  channels.forEach((channel) => {
    const c = EEG_CHANNELS.indexOf(channel)
    const posterior = channel.startsWith("p") ? 5 : 0
    power[channel] = frequency.map((f) => time.map((t) => r(
      -3 - 11 * Math.log10(f + 0.5)
      + (12 + posterior) * Math.exp(-((f - 10) ** 2) / 4) * (0.65 + 0.35 * Math.sin(t * 0.35 + c))
      + 3 * Math.exp(-((f - 5.5) ** 2) / 6) * (0.5 + 0.5 * Math.sin(t * 0.21 + 1))
      + 2.2 * Math.exp(-((f - 19) ** 2) / 20) * (0.5 + 0.5 * Math.sin(t * 0.5 + c))
      + (rng(Math.round(t * 20) * 977 + Math.round(f * 2) * 31 + c)() - 0.5) * 3.2, 2)))
  })
  return {
    time, frequency, channels, available_channels: EEG_CHANNELS, sampling_rate_hz: 250, use_db: true, normalize: "none", unit: "dB",
    metadata: { version: "eeg-v2", warnings: [], hop_s: hop, channels: Object.fromEntries(EEG_CHANNELS.map((c) => [c, qualityOf(c, false)])) },
    power, color_domain: { min: -28, max: 0 },
  }
}

function eegTopography(scenario: string, params: URLSearchParams) {
  const requested = (params.get("channels") ?? "").split(",").filter(Boolean)
  const channels = (requested.length ? requested : TOPO_CHANNELS).filter((c) => TOPO_CHANNELS.includes(c))
  const [a, b] = rangeFor(scenario)
  const frames = Math.max(1, Math.floor((b - a - 2) / 1) + 1)
  const time = Array.from({ length: frames }, (_, k) => r(a + k * 1, 2))
  const power: Record<string, number[]> = {}
  channels.forEach((channel, c) => {
    const frontal = channel.startsWith("f")
    power[channel] = time.map((t, k) => r(
      (frontal ? 9 : channel.startsWith("p") ? 16 : 11) + 4 * Math.sin(t * 0.3 + c) + 2 * wobble(k, 90 + c, 3), 2))
  })
  return {
    time, channels, available_channels: EEG_CHANNELS, sampling_rate_hz: 250,
    metadata: { version: "eeg-v2", warnings: [], hop_s: 1 },
    unit: "µV²", positions: TOPO_POSITIONS, power, color_domain: { min: 2, max: 26 }, window_s: 2, overlap_ratio: 0.5, remove_dc: true,
  }
}

// ---------- fixation-derived answers ----------

const HOME_AOIS = demoScenarios[0].aois

function insideAoi(aoi: (typeof HOME_AOIS)[number], x: number, y: number) {
  const s = aoi.shape
  if (aoi.shape_type === "circle") {
    const rx = s.width / 2
    const ry = s.height / 2
    return ((x - (s.x + rx)) ** 2) / rx ** 2 + ((y - (s.y + ry)) ** 2) / ry ** 2 <= 1
  }
  return x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height
}

function histogram(scenario: string, participant: string | null, minMs: number) {
  const list = scenario === "all"
    ? Object.keys(SCENARIO_RANGES).flatMap((name) => filtered(name, participant, minMs))
    : filtered(scenario, participant, minMs)
  const durations = list.map((f) => f.duration_s * 1000)
  const edges = [minMs, minMs + 100, minMs + 200, minMs + 300, minMs + 400, minMs + 600, minMs + 800, minMs + 1100]
  const bins = edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1]
    const inBin = durations.filter((d) => d >= lo && (i === edges.length - 2 ? d <= hi + 5000 : d < hi))
    return {
      rango_min: lo, rango_max: hi, label: `${lo}-${hi}`, conteo: inBin.length,
      porcentaje: r(durations.length ? (inBin.length / durations.length) * 100 : 0, 1),
      promedio_ms: r(inBin.length ? inBin.reduce((s, v) => s + v, 0) / inBin.length : 0, 1),
    }
  })
  const s = summary(durations.length ? durations : [0])
  return {
    bins, n_fixations: durations.length, total_duration_ms: r(durations.reduce((x, y) => x + y, 0), 1),
    mean_duration_ms: r(s.mean, 1), min_duration_ms: r(s.min, 1), max_duration_ms: r(s.max, 1), min_fixation_duration_ms: minMs,
  }
}

function sensitivity(scenario: string, participant: string | null) {
  const name = scenario === "all" ? SCENARIO_HOME : scenario
  const everything = fixationsOf(name, participant)
  const totalAll = everything.reduce((s, f) => s + f.duration_s * 1000, 0)
  return {
    default_min_fixation_duration_ms: 200,
    available_min_fixation_durations_ms: [100, 150, 200, 250, 300],
    points: [100, 150, 200, 250, 300].map((ms) => {
      const kept = everything.filter((f) => f.duration_s * 1000 >= ms).map((f) => f.duration_s * 1000)
      const s = summary(kept.length ? kept : [0])
      const total = kept.reduce((x, y) => x + y, 0)
      return {
        min_fixation_duration_ms: ms, n_fixations: kept.length, total_duration_ms: r(total, 1), mean_duration_ms: r(s.mean, 1),
        median_duration_ms: r(s.median, 1), max_duration_ms: r(s.max, 1), retained_dwell_percent: r((total / totalAll) * 100, 1),
      }
    }),
  }
}

function scanpath(scenario: string, participant: string | null, minMs: number) {
  const spread: Fixation[] = []
  for (const f of filtered(scenario, participant, minMs)) {
    if (spread.every((g) => Math.hypot(f.x_norm - g.x_norm, (f.y_norm - g.y_norm) * 0.6) > 0.12)) spread.push(f)
    if (spread.length >= 12) break
  }
  const list = spread
  const cap = 2000
  const objectives = list.map((f, i) => ({
    id: i + 1, cx: f.x_norm, cy: f.y_norm, duration_s: f.duration_s,
    radius_norm: r(Math.sqrt(Math.min(1, (f.duration_s * 1000) / cap)), 4), t_start: f.time_s, t_end: f.t_end_s, n_points: Math.round(f.duration_s * 60),
  }))
  let distance = 0
  for (let i = 1; i < objectives.length; i++) distance += Math.hypot((objectives[i].cx - objectives[i - 1].cx) * 1920, (objectives[i].cy - objectives[i - 1].cy) * 1080)
  return {
    objectives, n_objectives: objectives.length, total_distance_px: r(distance, 1),
    avg_duration_s: r(list.length ? list.reduce((s, f) => s + f.duration_s, 0) / list.length : 0, 3),
    total_duration_s: r(list.reduce((s, f) => s + f.duration_s, 0), 3),
    radius_scale: { version: "absolute-area-v1", encoding: "area", cap_ms: cap },
    scenario_file_id: FILE_OF[scenario] ?? null, min_fixation_duration_ms: minMs,
  }
}

function fixationAnswer(scenario: string, participant: string | null, minMs: number) {
  const list = filtered(scenario, participant, minMs)
  return {
    fixations: list.map((f) => ({ x_norm: f.x_norm, y_norm: f.y_norm, time_s: f.time_s, t_end_s: f.t_end_s, duration_s: f.duration_s })),
    stats: {
      n_fixations: list.length,
      max_duration_s: r(Math.max(0, ...list.map((f) => f.duration_s)), 3),
      avg_duration_s: r(list.length ? list.reduce((s, f) => s + f.duration_s, 0) / list.length : 0, 3),
    },
    scenario_file_id: FILE_OF[scenario] ?? null, cache_generation: 3, min_fixation_duration_ms: minMs, coordinate_transform: null,
  }
}

function aoiAnswer(scenario: string, participant: string | null, minMs: number) {
  const aois = scenario === SCENARIO_HOME ? HOME_AOIS : []
  const list = filtered(scenario, participant, minMs)
  const totalMs = list.reduce((s, f) => s + f.duration_s * 1000, 0)
  const first = (aoi: (typeof HOME_AOIS)[number]) => list.findIndex((f) => insideAoi(aoi, f.x_norm * 100, f.y_norm * 100))
  const metrics = aois.map((aoi, k) => {
    const inside = list.filter((f) => insideAoi(aoi, f.x_norm * 100, f.y_norm * 100))
    const dwell = inside.reduce((s, f) => s + f.duration_s * 1000, 0)
    const idx = first(aoi)
    return {
      id: aoi.id, name: aoi.name, color: aoi.color, shape_type: aoi.shape_type, shape: aoi.shape,
      fixation_count: inside.length, total_dwell_time_ms: r(dwell, 1), total_dwell_time_percent: r((dwell / totalMs) * 100, 1),
      avg_fixation_duration_ms: r(inside.length ? dwell / inside.length : 0, 1),
      ttff_ms: idx >= 0 ? r(list[idx].time_s * 1000, 1) : null,
      hit_rate_percent: r((dwell / totalMs) * 100 * 1.04, 1), fixations_to_target: idx >= 0 ? idx + 1 : null,
      pupil_sample_count: Math.round(dwell / 100), avg_pupil_mm: r(3.52 + k * 0.08, 3), pupil_delta_from_baseline_mm: r(0.14 + k * 0.07, 3),
      pupil_delta_percent: r(4.2 + k * 2.1, 1), distance_sample_count: Math.round(dwell / 100), avg_distance_cm: r(63.4 - k * 0.9, 2),
      distance_delta_from_baseline_cm: r(-0.8 - k * 0.5, 2), distance_delta_percent: r(-1.3 - k * 0.8, 1),
    }
  })
  const names = metrics.map((m) => m.name)
  const counts: Record<string, Record<string, number>> = Object.fromEntries(names.map((n) => [n, Object.fromEntries(names.map((m) => [m, 0]))]))
  let previous: string | null = null
  for (const f of list) {
    const hit = aois.find((aoi) => insideAoi(aoi, f.x_norm * 100, f.y_norm * 100))
    if (!hit) continue
    if (previous && previous !== hit.name) counts[previous][hit.name] += 1
    previous = hit.name
  }
  const transitions = names.map((n) => ({ from_aoi: n, counts: counts[n], total: Object.values(counts[n]).reduce((s, v) => s + v, 0) }))
  const pupil = pupilData(scenario, new URLSearchParams(), participant)
  const events = [] as Json[]
  const at = (t: number) => gazeAtTime(t, participant)
  const pushEvent = (metric: string, kind: "min" | "max", value: number, unit: string, label: string, t: number) => {
    const g = at(t)
    const aoi = g.gx != null && g.gy != null ? aois.find((a) => insideAoi(a, g.gx as number, g.gy as number)) : undefined
    events.push({
      id: `${metric}-${kind}`, label, metric, kind, value: r(value, 2), unit, time_s: t, gx: g.gx, gy: g.gy,
      aoi_id: aoi?.id ?? null, aoi_name: aoi?.name ?? null, aoi_color: aoi?.color ?? null,
    })
  }
  const pi = pupil.time.map((t, i) => [t, pupil.average[i]] as const)
  const [tMin, vMin] = pi.reduce((m, c) => (c[1] < m[1] ? c : m))
  const [tMax, vMax] = pi.reduce((m, c) => (c[1] > m[1] ? c : m))
  pushEvent("pupil", "min", vMin, "mm", "Pupila mínima", tMin)
  pushEvent("pupil", "max", vMax, "mm", "Pupila máxima", tMax)
  pushEvent("distance", "min", 58.9, "cm", "Distancia mínima", 12.4)
  pushEvent("distance", "max", 66.3, "cm", "Distancia máxima", 26.1)
  pushEvent("gaze_x", "min", 8.4, "%", "Mirada X mínima", 6.2)
  pushEvent("gaze_x", "max", 93.1, "%", "Mirada X máxima", 30.2)
  pushEvent("gaze_y", "min", 5.1, "%", "Mirada Y mínima", 5.0)
  pushEvent("gaze_y", "max", 81.6, "%", "Mirada Y máxima", 22.4)
  const observedMs = metrics.reduce((s, m) => s + m.total_dwell_time_ms, 0)
  return {
    scenario, scenario_file_id: FILE_OF[scenario] ?? null, aois: metrics, transitions, events,
    total_fixations: list.length, total_dwell_time_ms: r(totalMs, 1), observed_aoi_dwell_time_ms: r(observedMs, 1),
    observed_aoi_dwell_time_percent: r((observedMs / totalMs) * 100, 1), min_fixation_duration_ms: minMs,
  }
}

// ---------- comparison and correlations ----------

function comparisonCharts(scenario: string, params: URLSearchParams, participant: string | null) {
  const wanted = (params.get("visualizations") ?? "").split(",").filter(Boolean)
  const makeLine = (id: string, title: string, yLabel: string, key: string, label: string, color: string, unit: string, values: (t: number) => number) => {
    const time = timeAxis(scenario, new URLSearchParams(), 4)
    return {
      chart: {
        id, title, x_label: "Tiempo (s)", y_label: yLabel, time_basis: "absolute" as const, x_domain: [time[0], time[time.length - 1]] as [number, number],
        data: time.map((t) => ({ time: t, sourceTime: t, [key]: r(values(t), 3) })),
        series: [{ key, label, color, unit }], legend: [{ label, color }], peaks: [], annotations: [], synchronized: true, height: 260,
      },
      stats: (() => {
        const v = time.map(values)
        const s = summary(v)
        return {
          visualization_id: id, status: "ok" as const,
          source: { endpoint: id, resolution: "legacy_timeseries_display_samples" as const, source_samples: v.length, selected_samples: v.length, parameters: {}, chart_resolution: "comparison_chart_display_samples" as const, relationship: "same" },
          series: [{ key, label, unit, summary: { count: v.length, mean: r(s.mean, 3), median: r(s.median, 3), std: r(s.std, 3), min: r(s.min, 3), max: r(s.max, 3), baseline: r(s.baseline, 3), peak: r(s.max, 3) } }],
          error: null,
        }
      })(),
    }
  }
  const pi = participantIndex(participant)
  const all = [
    makeLine("pupil", "Dilatación pupilar", "Diámetro (mm)", "pupil_avg_mm", "Pupila promedio", "#00A878", "mm", (t) => (pupilBase(t, pi, 0) + pupilBase(t, pi, 1)) / 2),
    makeLine("distance", "Distancia al dispositivo", "Distancia (cm)", "distance_cm", "Distancia", "#2563EB", "cm", (t) => 62 + pi * 1.5 + 2.4 * Math.sin(t * 0.21 + pi) + 1.2 * wobble(t, 3, 4)),
    makeLine("gaze", "Punto de mirada", "Posición (%)", "gaze_x_pct", "Mirada horizontal", "#F59E0B", "%", (t) => gazeAtTime(t, participant).gx ?? 50),
    makeLine("gsr", "Respuesta galvánica", "Conductancia (µS)", "gsr_smoothed_us", "GSR suavizada", "#7C3AED", "µS", (t) => gsrData(scenario, new URLSearchParams(), participant).gsr_smooth[Math.min(Math.round((t - rangeFor(scenario)[0]) * 10), 100)] ?? 4.5),
  ]
  const selected = wanted.length ? all.filter((x) => wanted.includes(x.chart.id)) : all
  return {
    contract_version: "comparison-charts-v3", statistics_schema_version: "comparison-statistics-v1",
    charts: selected.map((x) => x.chart), statistics: selected.map((x) => x.stats),
  }
}

function correlations(scenario: string, participant: string | null) {
  const ids = [
    ["pupil_avg_mm", "Pupila promedio", "mm"], ["gaze_x_pct", "Mirada horizontal", "%"], ["gaze_y_pct", "Mirada vertical", "%"],
    ["distance_cm", "Distancia al dispositivo", "cm"], ["gsr_smoothed_us", "GSR suavizada", "µS"], ["eeg_broadband_power_db", "Potencia EEG", "dB"],
  ] as const
  const coefficient = (i: number, j: number) => (i === j ? 1 : [0.42, -0.18, 0.31, -0.27, 0.12, 0.55, -0.34, 0.08, 0.21, -0.46, 0.17, 0.29, -0.05, 0.38, -0.22][(i * 5 + j * 3) % 15])
  const cache: Record<string, number> = {}
  const coef = (i: number, j: number) => {
    const key = i < j ? `${i}-${j}` : `${j}-${i}`
    return (cache[key] ??= coefficient(Math.min(i, j), Math.max(i, j)))
  }
  return {
    participant_code: participant ?? "", scenario, method: "pearson", time_basis: "scenario_relative", bin_size_s: 1, min_pair_samples: 10, duration_s: 30, total_bins: 30,
    signals: ids.map(([id, label, unit]) => ({ id, label, unit, available: true, valid_bins: 30, coverage: 1, source_columns: [id], unavailable_reason: null })),
    matrix: ids.map(([x], i) => ids.map(([y], j) => ({
      signal_x: x, signal_y: y, coefficient: r(coef(i, j), 3), n_samples: 30, coverage: 1, status: "ok",
    }))),
  }
}

// ---------- heatmap overlay (RGBA PNG drawn once from the same fixations) ----------

const heatmapFile = (participant: string | null) => path.join(HEATMAP_DIR, `mapa-de-calor-${participant}.png`)

/** Draws a transparent heatmap per participant for the main page, from the fixation list the API also serves. */
export async function ensureHeatmaps(browser: Browser) {
  fs.mkdirSync(HEATMAP_DIR, { recursive: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.setContent("<canvas id=c width=1280 height=720></canvas>")
  for (const participant of dataParticipants) {
    const points = fixationsOf(SCENARIO_HOME, participant.participant_code).filter((f) => f.duration_s >= 0.2)
      .map((f) => ({ x: f.x_norm * 1280, y: f.y_norm * 720, w: f.duration_s }))
    const dataUrl = await page.evaluate((pts) => {
      const canvas = document.getElementById("c") as HTMLCanvasElement
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D
      const W = canvas.width
      const H = canvas.height
      const density = new Float32Array(W * H)
      const sigma = 46
      for (const p of pts) {
        const reach = Math.ceil(sigma * 3)
        for (let y = Math.max(0, Math.floor(p.y) - reach); y < Math.min(H, Math.floor(p.y) + reach); y++) {
          for (let x = Math.max(0, Math.floor(p.x) - reach); x < Math.min(W, Math.floor(p.x) + reach); x++) {
            density[y * W + x] += p.w * Math.exp(-(((x - p.x) ** 2 + (y - p.y) ** 2) / (2 * sigma * sigma)))
          }
        }
      }
      let max = 0
      for (let i = 0; i < density.length; i++) if (density[i] > max) max = density[i]
      const image = ctx.createImageData(W, H)
      const ramp = [[0, 40, 255], [0, 200, 255], [30, 220, 90], [255, 230, 0], [255, 120, 0], [230, 20, 20]]
      for (let i = 0; i < density.length; i++) {
        const v = density[i] / max
        if (v < 0.06) continue
        const f = Math.min(1, v) * (ramp.length - 1)
        const k = Math.min(ramp.length - 2, Math.floor(f))
        const u = f - k
        for (let c = 0; c < 3; c++) image.data[i * 4 + c] = Math.round(ramp[k][c] + (ramp[k + 1][c] - ramp[k][c]) * u)
        const u2 = Math.min(1, Math.max(0, (v - 0.06) / 0.4))
        image.data[i * 4 + 3] = Math.round(255 * 0.95 * u2 * u2 * (3 - 2 * u2))
      }
      ctx.putImageData(image, 0, 0)
      return canvas.toDataURL("image/png")
    }, points)
    fs.writeFileSync(heatmapFile(participant.participant_code), Buffer.from(dataUrl.split(",")[1], "base64"))
  }
  await context.close()
}

// ---------- install ----------

export type DashboardMock = { unhandled: string[] }

export async function installDashboardMocks(page: Page): Promise<DashboardMock> {
  const unhandled: string[] = []
  await page.route("**/api/projects/*/analytics/**", async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/\/+$/, "")
    const params = url.searchParams
    const participant = params.get("participant_code") ?? dataParticipants[0].participant_code
    const scenario = params.get("scenario") ?? "all"
    const minMs = Number(params.get("min_fixation_duration_ms") ?? 200)
    const tail = path.replace(/^\/api\/projects\/[^/]+\/analytics\//, "")

    if (tail === "participants") {
      return route.fulfill({ json: dataParticipants.map((p, i) => ({ participant_code: p.participant_code, user_index: i + 1, name: p.name, document: p.document })) })
    }
    if (tail === "scenarios") {
      return route.fulfill({ json: demoScenarios.map((s) => ({ name: s.name, type: s.type, file_id: s.file_id })) })
    }
    if (tail === "timeseries/pupil") return route.fulfill({ json: pupilData(scenario, params, participant) })
    if (tail === "timeseries/gaze") {
      const time = timeAxis(scenario, params, 10)
      const g = time.map((t) => gazeAtTime(t, participant))
      return route.fulfill({ json: { time, gx_clean: g.map((v) => v.gx), gy_clean: g.map((v) => v.gy) } })
    }
    if (tail === "statistics/gaze") {
      const time = timeAxis(scenario, params, 10)
      const g = time.map((t) => gazeAtTime(t, participant))
      const gx = summary(g.map((v) => v.gx).filter((v): v is number => v != null))
      const gy = summary(g.map((v) => v.gy).filter((v): v is number => v != null))
      return route.fulfill({
        json: {
          gx_mean: r(gx.mean, 2), gx_min: r(gx.min, 2), gx_max: r(gx.max, 2), gx_std: r(gx.std, 2), gx_median: r(gx.median, 2), gx_baseline: r(gx.baseline, 2),
          gy_mean: r(gy.mean, 2), gy_min: r(gy.min, 2), gy_max: r(gy.max, 2), gy_std: r(gy.std, 2), gy_median: r(gy.median, 2), gy_baseline: r(gy.baseline, 2),
        },
      })
    }
    if (tail === "timeseries/distance") return route.fulfill({ json: distanceData(scenario, params, participant) })
    if (tail === "statistics/distance") {
      const s = summary(distanceData(scenario, params, participant).distance_cm)
      return route.fulfill({ json: { mean: r(s.mean, 2), min: r(s.min, 2), max: r(s.max, 2), std: r(s.std, 2), median: r(s.median, 2), baseline: r(s.baseline, 2) } })
    }
    if (tail === "timeseries/gsr") return route.fulfill({ json: gsrData(scenario, params, participant) })
    if (tail === "statistics/gsr") {
      const d = gsrData(scenario, params, participant)
      const s = summary(d.gsr_smooth)
      const raw = summary(d.gsr)
      return route.fulfill({
        json: {
          mean: r(s.mean, 4), min: r(s.min, 4), max: r(s.max, 4), std: r(s.std, 4), median: r(s.median, 4), baseline: r(s.baseline, 4),
          raw_mean: r(raw.mean, 4), raw_min: r(raw.min, 4), raw_max: r(raw.max, 4), raw_std: r(raw.std, 4), raw_median: r(raw.median, 4), raw_baseline: r(raw.baseline, 4),
        },
      })
    }
    if (tail === "gaze-at") {
      const t = Number(params.get("t_s") ?? 0)
      const g = gazeAtTime(t, participant)
      const name = g.scenario ?? (scenario !== "all" ? scenario : null)
      return route.fulfill({
        json: {
          requested_time_s: t, nearest_time_s: r(t, 2), scenario: name, gx: g.gx, gy: g.gy,
          scenario_file_id: name ? FILE_OF[name] : null, scenario_type: name ? TYPE_OF[name] : null,
          scenario_time_s: name ? r(t - rangeFor(name)[0], 2) : null,
        },
      })
    }
    if (tail === "scenario-timing") {
      const [a, b] = rangeFor(scenario)
      return route.fulfill({ json: { scenario, time_basis: scenario === "all" ? "recording" : "scenario_onset", onset_s: a, end_s: b, gsr_origin_s: null } })
    }
    if (tail === "fixations/sensitivity") return route.fulfill({ json: sensitivity(scenario, participant) })
    if (tail === "fixations/histogram") return route.fulfill({ json: histogram(scenario, participant, minMs) })
    if (tail === "fixations") return route.fulfill({ json: fixationAnswer(scenario, participant, minMs) })
    if (tail === "heatmap") return route.fulfill({ status: 200, contentType: "image/png", body: fs.readFileSync(heatmapFile(participant)) })
    if (tail === "scanpath") return route.fulfill({ json: scanpath(scenario, participant, minMs) })
    if (tail === "aois") return route.fulfill({ json: aoiAnswer(scenario, participant, minMs) })
    if (tail === "timeseries/eeg") return route.fulfill({ json: eegTimeseries(scenario, params, participant) })
    if (tail === "psd/eeg") return route.fulfill({ json: eegPsd(scenario, params) })
    if (tail === "spectrogram/eeg") return route.fulfill({ json: eegSpectrogram(scenario, params) })
    if (tail === "topography/eeg") return route.fulfill({ json: eegTopography(scenario, params) })
    if (tail === "comparison/charts") return route.fulfill({ json: comparisonCharts(scenario, params, participant) })
    if (tail === "correlations") return route.fulfill({ json: correlations(scenario, participant) })

    unhandled.push(`${route.request().method()} ${path}`)
    return route.fallback()
  })
  return { unhandled }
}
