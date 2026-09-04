"use client"

interface EegTooltipPayloadEntry {
  value: number
  name: string
  color: string
}

interface EegTooltipProps {
  active?: boolean
  payload?: EegTooltipPayloadEntry[]
  label?: number
}

export function EegTooltip({ active, payload, label }: EegTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="max-w-[280px] rounded-lg bg-gray-800 px-3 py-2 text-xs text-white shadow-lg">
      {typeof label === "number" && (
        <p className="mb-1 font-medium text-gray-300">{label.toFixed(2)}s</p>
      )}
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="truncate">
              {entry.name}: {Number(entry.value).toFixed(4)} uV
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PsdTooltip({
  active,
  payload,
  label,
  unit,
}: EegTooltipProps & { unit: string }) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="max-w-[280px] rounded-lg bg-gray-800 px-3 py-2 text-xs text-white shadow-lg">
      {typeof label === "number" && (
        <p className="mb-1 font-medium text-gray-300">{label.toFixed(2)} Hz</p>
      )}
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="truncate">
              {entry.name}: {Number(entry.value).toFixed(4)} {unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
