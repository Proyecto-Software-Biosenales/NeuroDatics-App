"use client"

import type { CSSProperties } from "react"
import { formatScanpathObjectiveDetails, scanpathRadiusForDuration } from "../scanpathScale"
import { ACTIVE_SCANPATH_STYLE, SCANPATH_STYLES, scanpathGeometry, scanpathLabelFontSize } from "../scanpathStyle"
import type { ScanpathObjective } from "../types"
import type { ContainedImageBox } from "./stimulusGeometry"

// Switch presets in scanpathStyle.ts ("legacy" restores the previous look).
export const scanpathStyle = SCANPATH_STYLES[ACTIVE_SCANPATH_STYLE]

const labelStyle: CSSProperties = {
  paintOrder: "stroke",
  stroke: scanpathStyle.labelHalo,
  strokeWidth: scanpathStyle.labelHaloWidth,
  strokeLinejoin: scanpathStyle.labelHaloLineJoin,
}

/**
 * One scanpath drawn over the measured stimulus box: the lines between
 * consecutive objectives, then numbered nodes whose area follows duration on
 * the shared absolute scale. It returns SVG children; the caller owns the
 * `<svg>` (viewBox = the container size).
 *
 * `color` and `dash` paint one participant in a group overlay; without them
 * the tab's own preset is used.
 */
export function ScanpathLayer({
  objectives,
  box,
  radiusCapMs,
  color,
  dash,
  describe = formatScanpathObjectiveDetails,
  testId = (objective) => `scanpath-fixation-${objective.id}`,
}: {
  objectives: readonly ScanpathObjective[]
  box: ContainedImageBox
  radiusCapMs: number
  color?: string
  dash?: string
  describe?: (objective: ScanpathObjective) => string
  testId?: (objective: ScanpathObjective) => string
}) {
  const geometry = scanpathGeometry(scanpathStyle, box.renderedW, box.renderedH)
  const points = objectives.map((objective) => ({
    x: box.offsetX + objective.cx * box.renderedW,
    y: box.offsetY + objective.cy * box.renderedH,
  }))
  return (
    <>
      {points.slice(1).map((point, index) => (
        // No line across a gap between detector segments, as in the travelled distance.
        (objectives[index].segment_id ?? null) !== (objectives[index + 1].segment_id ?? null) ? null : <line
          key={`line-${objectives[index + 1].id}`}
          x1={points[index].x}
          y1={points[index].y}
          x2={point.x}
          y2={point.y}
          stroke={color ?? scanpathStyle.lineStroke}
          strokeOpacity={color ? 0.85 : undefined}
          strokeWidth={color ? geometry.lineWidth + 0.5 : geometry.lineWidth}
          strokeDasharray={dash}
          strokeLinecap="round"
        />
      ))}
      {objectives.map((objective, index) => {
        const point = points[index]
        const radius = scanpathRadiusForDuration(objective.duration_s, geometry.minRadius, geometry.maxRadius, radiusCapMs)
        const details = describe(objective)
        return (
          <g
            key={`node-${objective.id}`}
            data-testid={testId(objective)}
            data-duration-ms={Math.round(objective.duration_s * 1_000)}
            data-radius={radius}
            role="img"
            tabIndex={0}
            aria-label={details}
            className="group pointer-events-auto cursor-help focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <title>{details}</title>
            <circle
              cx={point.x}
              cy={point.y}
              r={radius}
              fill={color ?? scanpathStyle.nodeFill}
              fillOpacity={color ? 0.85 : undefined}
              stroke={scanpathStyle.nodeStroke}
              strokeWidth={geometry.nodeStrokeWidth}
              className={scanpathStyle.nodeClassName}
            />
            <text
              x={point.x}
              y={point.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill={scanpathStyle.labelFill}
              fontSize={scanpathLabelFontSize(scanpathStyle, radius)}
              fontWeight="bold"
              style={labelStyle}
            >
              {objective.id}
            </text>
          </g>
        )
      })}
    </>
  )
}
