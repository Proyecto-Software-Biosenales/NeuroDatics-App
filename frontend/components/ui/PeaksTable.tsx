import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface PeakRow {
  /** Unique key for React reconciliation. */
  id: string
  /** Badge node rendered in the first column (e.g. a styled <span> with icon). */
  badge: ReactNode
  /** Time in seconds at the peak. Pass null to show "—". */
  second: number | null
  /** Horizontal gaze position (0-100%). Pass null to show "—". */
  posX: number | null
  /** Vertical gaze position (0-100%). Pass null to show "—". */
  posY: number | null
  /** Numeric peak value. Pass null to show "—". */
  value: number | null
  /** Unit suffix for the value column. Defaults to "mm". */
  unit?: string
  /** Tailwind text-* class for the value cell. */
  valueColorClass?: string
  /** Tailwind hover:bg-* class applied on the row when hovered. */
  hoverBgClass?: string
}

export interface PeaksTableProps {
  rows: PeakRow[]
  loading?: boolean
  /** Override column header labels (left to right, exactly 5 items). */
  columnLabels?: [string, string, string, string, string]
}

/**
 * Reusable peaks table that displays extreme signal values alongside their
 * spatial coordinates. Used in the pupil dilation analytics panel and can
 * be reused in any signal-analysis view that exposes min/max peak data.
 */
export function PeaksTable({
  rows,
  loading = false,
  columnLabels = ["ESTÍMULO", "SEGUNDO", "POS X %", "POS Y %", "VALOR"],
}: PeaksTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md">
      <table className="w-full text-base">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {columnLabels.map((col) => (
              <th
                key={col}
                className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider text-gray-700"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-400">
                Cargando...
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr
                key={row.id}
                className={cn(
                  "transition-colors duration-150",
                  row.hoverBgClass ?? "hover:bg-gray-50/50",
                  idx < rows.length - 1 ? "border-b border-gray-50" : "",
                )}
              >
                <td className="px-4 py-4">{row.badge}</td>
                <td className="px-4 py-4 text-gray-700">
                  {row.second != null ? row.second : "—"}
                </td>
                <td className="px-4 py-4 text-gray-700">
                  {row.posX != null ? row.posX : "—"}
                </td>
                <td className="px-4 py-4 text-gray-700">
                  {row.posY != null ? row.posY : "—"}
                </td>
                <td className={cn("px-4 py-4 font-bold text-lg", row.valueColorClass ?? "text-gray-900")}>
                  {row.value != null ? (
                    <>
                      {row.value.toFixed(2)}{" "}
                      <span className="text-xs font-normal text-gray-400">{row.unit ?? "mm"}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
