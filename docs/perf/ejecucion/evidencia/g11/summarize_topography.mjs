import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const evidence = path.dirname(fileURLToPath(import.meta.url))
const base = JSON.parse(fs.readFileSync(path.join(evidence, "profile-base-fresh.json"), "utf8"))
const candidate = JSON.parse(fs.readFileSync(path.join(evidence, "profile-candidate.json"), "utf8"))
if (base.results.length !== candidate.results.length) throw new Error("case count differs")

const comparisons = base.results.map((before, index) => {
  const after = candidate.results[index]
  const identity = ["logical_size_css_px", "dpr", "scenario", "backing_width_px", "backing_height_px"]
  for (const field of identity) {
    if (before[field] !== after[field]) throw new Error(`case mismatch at ${index}: ${field}`)
  }
  return {
    logical_size_css_px: before.logical_size_css_px,
    dpr: before.dpr,
    scenario: before.scenario,
    backing_px: `${before.backing_width_px}x${before.backing_height_px}`,
    base_frame_ms: before.frame_sync_ms,
    candidate_frame_ms: after.frame_sync_ms,
    candidate_cold_frame_ms: after.candidate_cold_frame_ms,
    median_change_percent: (after.frame_sync_ms.median / before.frame_sync_ms.median - 1) * 100,
    candidate_cache_rebuilds_in_5_frames: after.cache_rebuilds_measured,
    candidate_retained_geometry_bytes: after.retained_geometry_bytes,
    image_data_rgba_bytes: before.image_data_rgba,
    canvas_backing_lower_bound_bytes: before.canvas_backing_lower_bound,
  }
})
const stable = comparisons.filter((row) => row.scenario !== "mask_change")
const sortedChanges = stable.map((row) => row.median_change_percent).sort((a, b) => a - b)
const representative = comparisons.filter((row) =>
  [
    "320/1/complete", "640/2/complete", "960/3/complete",
    "640/2/values_change", "960/3/values_change",
    "640/2/mask_change", "960/3/mask_change",
    "960/3/missing", "960/3/nan",
  ].includes(`${row.logical_size_css_px}/${row.dpr}/${row.scenario}`),
)

const output = {
  generated_at: new Date().toISOString(),
  protocol: "same Windows/Node/Playwright Chromium; base then candidate; warmup=1, n=5; min/median/max and raw samples retained",
  decision: "discard candidate and restore received product byte-for-byte",
  reason: "stable-mask median improvement is small and inconsistent; complete-channel and mask-change cases overlap noise or regress, so the benefit does not justify retained geometry or invalidation complexity",
  cases: comparisons.length,
  stable_mask_summary: {
    cases: stable.length,
    improved_cases: stable.filter((row) => row.median_change_percent < 0).length,
    regressed_cases: stable.filter((row) => row.median_change_percent > 0).length,
    median_change_percent: sortedChanges[Math.floor(sortedChanges.length / 2)],
    best_change_percent: sortedChanges[0],
    worst_change_percent: sortedChanges.at(-1),
  },
  explicit_memory: {
    formula_current_frame_bytes_lower_bound: "image_data_rgba_bytes + canvas_backing_lower_bound_bytes = pixels * 8; browser internals excluded",
    max_current_frame_lower_bound_bytes: Math.max(...comparisons.map((row) => row.image_data_rgba_bytes + row.canvas_backing_lower_bound_bytes)),
    candidate_budget_bytes: 1024 * 1024,
    max_candidate_retained_geometry_bytes_observed: Math.max(...comparisons.map((row) => row.candidate_retained_geometry_bytes)),
    candidate_rebuild_transient_bound: "up to two 1 MiB geometries per panel while replacing the ref, plus JS metadata and the current image/canvas; multiple mounted panels would add per-instance budgets",
    rss: "not observable in this browser harness; performance.memory snapshots are in raw profiles and include decomposition allocations, so they are not an operation peak",
  },
  representative,
  comparisons,
}
fs.writeFileSync(path.join(evidence, "measurement-summary.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8")
console.log(JSON.stringify({ cases: comparisons.length, decision: output.decision }))
