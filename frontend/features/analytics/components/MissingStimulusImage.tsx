import { cn } from "@/lib/utils"
import { getMissingStimulusDescriptor } from "./stimulusState"

export interface MissingStimulusImageProps {
  scenario: string | null
  gazeX?: number | null
  gazeY?: number | null
  showGazePoint?: boolean
  markerTone?: "cyan" | "rose"
  className?: string
}

const MARKER_COLORS = {
  cyan: "#06b6d4",
  rose: "#f43f5e",
} as const

function isValidGazeCoordinate(
  value: number | null | undefined
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  )
}

export function MissingStimulusImage({
  scenario,
  gazeX,
  gazeY,
  showGazePoint = true,
  markerTone = "cyan",
  className,
}: MissingStimulusImageProps) {
  const { category, displayLabel } = getMissingStimulusDescriptor(scenario)
  const label = displayLabel.toLocaleUpperCase("es")
  const showMarker =
    showGazePoint &&
    isValidGazeCoordinate(gazeX) &&
    isValidGazeCoordinate(gazeY)
  const markerColor = MARKER_COLORS[markerTone]
  const estimatedLabelWidth = label.length * 46

  return (
    <svg
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Pantalla genérica: ${label}`}
      data-stimulus-kind={category}
      className={cn(
        "mx-auto block aspect-video h-auto w-full max-w-[560px] bg-black",
        className
      )}
    >
      <rect width="1600" height="900" fill="#000000" />
      <text
        x="800"
        y="450"
        fill="#ffffff"
        fontFamily="sans-serif"
        fontSize="72"
        fontWeight="700"
        letterSpacing="4"
        textAnchor="middle"
        dominantBaseline="middle"
        textLength={estimatedLabelWidth > 1280 ? 1280 : undefined}
        lengthAdjust="spacingAndGlyphs"
      >
        {label}
      </text>
      {showMarker ? (
        <g
          transform={`translate(${gazeX * 16} ${gazeY * 9})`}
          aria-hidden="true"
          data-gaze-marker={markerTone}
          data-gaze-x={gazeX}
          data-gaze-y={gazeY}
          data-testid="missing-stimulus-gaze-marker"
        >
          <circle r="19" fill={markerColor} fillOpacity="0.4" />
          <circle r="11" fill={markerColor} stroke="#ffffff" strokeWidth="4" />
        </g>
      ) : null}
    </svg>
  )
}
