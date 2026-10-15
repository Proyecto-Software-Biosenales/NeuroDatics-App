import {
  SCANPATH_DURATION_LEGEND,
  scanpathRadiusForDuration,
} from "../scanpathScale"

export function ScanpathDurationLegend({
  capMs,
  minRadius,
  maxRadius,
  color,
}: {
  capMs: number
  minRadius: number
  maxRadius: number
  color: string
}) {
  return (
    <div
      data-testid="scanpath-duration-legend"
      role="group"
      aria-label="Escala absoluta del tamaño de las fijaciones"
      className="flex flex-wrap items-end gap-x-4 gap-y-2"
    >
      <span className="self-center text-xs font-semibold text-foreground">
        Duración
      </span>
      {SCANPATH_DURATION_LEGEND.map((item) => {
        const radius = scanpathRadiusForDuration(
          item.durationMs / 1_000,
          minRadius,
          maxRadius,
          capMs
        )
        const size = Math.ceil(radius * 2 + 4)
        return (
          <span
            key={item.durationMs}
            className="inline-flex flex-col items-center gap-1 text-[11px] text-muted-foreground tabular-nums"
          >
            <svg
              aria-hidden="true"
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
            >
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill={color}
                fillOpacity="0.65"
                stroke="white"
                strokeWidth="2"
              />
            </svg>
            <span>{item.label}</span>
          </span>
        )
      })}
      <span className="basis-full text-[11px] text-muted-foreground">
        Escala absoluta: el mismo tamaño representa la misma duración entre
        participantes.
      </span>
    </div>
  )
}
