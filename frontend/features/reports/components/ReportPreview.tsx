import { FileText } from "lucide-react"
import type { SensorType } from "@/features/projects/types"
import type { ReportMode, ReportScopeKind } from "@/features/reports/types"

interface ReportPreviewProps {
  reportMode: ReportMode
  scopeKind: ReportScopeKind
  selectedSensor: SensorType | null
  scenarioCount: number
  participantCount: number
  omittedVideoScenarios?: number
}

export const ReportPreview = ({
  reportMode,
  scopeKind,
  selectedSensor,
  scenarioCount,
  participantCount,
  omittedVideoScenarios = 0,
}: ReportPreviewProps) => {
  const modeLabel =
    reportMode === "comparative"
      ? "comparativo"
      : `por sensor${selectedSensor ? `: ${selectedSensor}` : ""}`
  const scopeLabel =
    scopeKind === "participant"
      ? "un participante"
      : `${participantCount} participantes agregados`

  return (
    <div className="mt-6 rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 animate-in fade-in duration-300">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted shadow-sm">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground">
          Vista previa ejecutiva
        </h3>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Se generara un informe {modeLabel} para {scopeLabel}, organizado en{" "}
          <span className="font-semibold text-foreground">{scenarioCount}</span>{" "}
          {scenarioCount === 1 ? "escenario" : "escenarios"} con mapas,
          AOIs, metricas y senales temporales resumidas.
        </p>
        {omittedVideoScenarios > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Se omitiran {omittedVideoScenarios}{" "}
            {omittedVideoScenarios === 1
              ? "escenario de video"
              : "escenarios de video"}
            .
          </p>
        ) : null}
      </div>
    </div>
  )
}
