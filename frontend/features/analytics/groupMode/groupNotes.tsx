import { LoaderCircle, RotateCcw } from "lucide-react"
import type { AnalyticsChartNote } from "../components/AnalyticsChartShell"
import type { GroupData } from "./useGroupData"

/**
 * Chips for the participants still loading, those without data and those that
 * failed (clicking the last retries them). They go with the chart's legend.
 */
export function groupLoadNotes(data: GroupData): AnalyticsChartNote[] {
  const notes: AnalyticsChartNote[] = []
  if (data.loading) {
    notes.push({
      id: "group-loading",
      label: `Cargando ${data.settled} de ${data.total}`,
      Icon: LoaderCircle,
      detail: "La gráfica se completa a medida que llegan los datos de cada participante.",
    })
  }
  if (data.empties.length > 0) {
    notes.push({
      id: "group-empty",
      label: data.empties.length === 1 ? "1 sin datos" : `${data.empties.length} sin datos`,
      detail: (
        <>
          {data.empties.map((entry) => (
            <span key={entry.participant.code}>
              {entry.participant.label}: {entry.message}
            </span>
          ))}
        </>
      ),
    })
  }
  if (data.failures.length > 0) {
    notes.push({
      id: "group-failed",
      tone: "warning",
      Icon: RotateCcw,
      label: `${data.failures.length} sin cargar`,
      ariaLabel: `Reintentar ${data.failures.length} sin cargar`,
      onClick: data.retryFailed,
      detail: (
        <>
          <span className="font-medium">Haz clic para volver a intentarlo.</span>
          {data.failures.map((entry) => (
            <span key={entry.participant.code}>
              {entry.participant.label}: {entry.message}
            </span>
          ))}
        </>
      ),
    })
  }
  return notes
}
