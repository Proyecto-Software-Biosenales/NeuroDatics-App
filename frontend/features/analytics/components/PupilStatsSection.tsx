import { TrendingDown, TrendingUp } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card"
import { MetricCard } from "@/components/ui/MetricCard"
import { PeaksTable } from "@/components/ui/PeaksTable"
import type { PupilStatistics } from "../types"

interface GazePosition {
  gx: number | null
  gy: number | null
}

export interface PupilStatsSectionProps {
  stats: PupilStatistics | null
  loading?: boolean
  maxTime: number | null
  minTime: number | null
  maxGaze: GazePosition | null
  minGaze: GazePosition | null
}

const METRIC_CONFIG = [
  {
    key: "mean" as const,
    label: "MEDIA",
    borderColorClass: "border-l-indigo-400",
    borderCardClass: "border-indigo-100",
    labelColorClass: "text-indigo-500",
    bgColorClass: "bg-gradient-to-br from-indigo-50 to-white",
  },
  {
    key: "min" as const,
    label: "MÍNIMO",
    borderColorClass: "border-l-violet-400",
    borderCardClass: "border-violet-100",
    labelColorClass: "text-violet-500",
    bgColorClass: "bg-gradient-to-br from-violet-50 to-white",
  },
  {
    key: "max" as const,
    label: "MÁXIMO",
    borderColorClass: "border-l-blue-400",
    borderCardClass: "border-blue-100",
    labelColorClass: "text-blue-500",
    bgColorClass: "bg-gradient-to-br from-blue-50 to-white",
  },
  {
    key: "std" as const,
    label: "DESV. ESTÁNDAR",
    borderColorClass: "border-l-sky-400",
    borderCardClass: "border-sky-100",
    labelColorClass: "text-sky-500",
    bgColorClass: "bg-gradient-to-br from-sky-50 to-white",
  },
  {
    key: "median" as const,
    label: "MEDIANA",
    borderColorClass: "border-l-purple-400",
    borderCardClass: "border-purple-100",
    labelColorClass: "text-purple-500",
    bgColorClass: "bg-gradient-to-br from-purple-50 to-white",
  },
  {
    key: "baseline" as const,
    label: "LÍNEA BASE",
    borderColorClass: "border-l-gray-300",
    borderCardClass: "border-gray-100",
    labelColorClass: "text-gray-400",
    bgColorClass: "bg-gradient-to-br from-gray-50 to-white",
  },
] as const

/**
 * Domain-level statistics panel for the pupil dilation dashboard.
 *
 * Wires real analytics data into the generic MetricCard and PeaksTable
 * primitives and presents them inside a labeled Card. Add this component
 * anywhere you want to surface pupil statistics; pass new props to adapt it
 * to a different participant/scenario without touching the primitives.
 */
export function PupilStatsSection({
  stats,
  loading = false,
  maxTime,
  minTime,
  maxGaze,
  minGaze,
}: PupilStatsSectionProps) {
  const peakRows = [
    {
      id: "max",
      badge: (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-400 px-3 py-1 text-sm font-semibold text-blue-500">
          <TrendingUp className="h-3 w-3" /> Max
        </span>
      ),
      second: maxTime != null ? Math.round(maxTime) : null,
      posX: maxGaze?.gx != null ? Math.round(maxGaze.gx) : null,
      posY: maxGaze?.gy != null ? Math.round(maxGaze.gy) : null,
      value: stats?.max ?? null,
      valueColorClass: "text-blue-500",
      hoverBgClass: "hover:bg-blue-50/50",
    },
    {
      id: "min",
      badge: (
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-violet-50 border-violet-400 px-3 py-1 text-sm font-semibold text-violet-500">
          <TrendingDown className="h-3 w-3" /> Min
        </span>
      ),
      second: minTime != null ? Math.round(minTime) : null,
      posX: minGaze?.gx != null ? Math.round(minGaze.gx) : null,
      posY: minGaze?.gy != null ? Math.round(minGaze.gy) : null,
      value: stats?.min ?? null,
      valueColorClass: "text-violet-500",
      hoverBgClass: "hover:bg-violet-50/50",
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Estadísticas</CardTitle>
        <CardDescription>
          Resumen numérico de la señal: tendencia, variabilidad y extremos.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-2 gap-8">
          {/* ── Left column: variability metrics ─────────────────── */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-purple-500" />
              <h4 className="text-sm font-semibold text-gray-700">
                Variabilidad de dilatación pupilar promedio
              </h4>
            </div>

            {loading || !stats ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {METRIC_CONFIG.map((m) => (
                  <MetricCard
                    key={m.key}
                    label={m.label}
                    value={stats[m.key]}
                    borderColorClass={m.borderColorClass}
                    borderCardClass={m.borderCardClass}
                    labelColorClass={m.labelColorClass}
                    bgColorClass={m.bgColorClass}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Right column: peaks table ─────────────────────────── */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <h4 className="text-sm font-semibold text-gray-700">
                Ubicación y valores de picos de dilatación
              </h4>
            </div>

            <PeaksTable rows={peakRows} loading={loading || !stats} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
