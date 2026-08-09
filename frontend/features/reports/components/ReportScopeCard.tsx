import { Users } from "lucide-react"
import { Card } from "@/components/ui/Card"
import {
  Combobox,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox"
import type { AnalyticsParticipant } from "@/features/analytics/types"
import type { ReportScopeKind } from "@/features/reports/types"

interface ReportScopeCardProps {
  participants: AnalyticsParticipant[]
  selectedParticipant: string
  scopeKind: ReportScopeKind
  onScopeKindChange: (scope: ReportScopeKind) => void
  onParticipantChange: (participantCode: string) => void
  loading: boolean
}

export const ReportScopeCard = ({
  participants,
  selectedParticipant,
  scopeKind,
  onScopeKindChange,
  onParticipantChange,
  loading,
}: ReportScopeCardProps) => {
  const hasParticipants = participants.length > 0

  return (
    <Card className="p-8 transition-all duration-300">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <span className="text-lg font-semibold text-foreground">2</span>
        </div>
        <div className="flex-1">
          <h2 className="mb-2 text-xl font-semibold text-foreground">
            Alcance del informe
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Selecciona un participante o genera un resumen agregado del grupo.
          </p>
        </div>
      </div>

      <div className="space-y-3 pl-14">
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-all duration-200 ${
            scopeKind === "participant"
              ? "border-foreground/40 bg-muted"
              : "hover:bg-muted/50"
          }`}
        >
          <input
            type="radio"
            name="report-scope"
            checked={scopeKind === "participant"}
            onChange={() => onScopeKindChange("participant")}
            className="mt-1 h-4 w-4 accent-gray-950"
          />
          <div className="min-w-0 flex-1">
            <h3 className="mb-1 text-sm font-semibold text-foreground">
              Un participante
            </h3>
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
              Genera el informe ejecutivo para un solo sujeto.
            </p>
            {scopeKind === "participant" ? (
              <Combobox
                value={selectedParticipant}
                onValueChange={(val) => val && onParticipantChange(val)}
                disabled={loading || !hasParticipants}
              >
                <ComboboxTrigger className="flex w-full max-w-md items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50">
                  <ComboboxValue placeholder={loading ? "Cargando..." : "Selecciona un participante"} />
                </ComboboxTrigger>
                <ComboboxContent>
                  <ComboboxList>
                    {participants.map((participant) => (
                      <ComboboxItem
                        key={participant.participant_code}
                        value={participant.participant_code}
                      >
                        {`Sujeto ${participant.participant_code}`}
                      </ComboboxItem>
                    ))}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            ) : null}
          </div>
        </label>

        <label
          className={`flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-all duration-200 ${
            scopeKind === "all-participants"
              ? "border-foreground/40 bg-muted"
              : "hover:bg-muted/50"
          }`}
        >
          <input
            type="radio"
            name="report-scope"
            checked={scopeKind === "all-participants"}
            onChange={() => onScopeKindChange("all-participants")}
            disabled={!hasParticipants}
            className="mt-1 h-4 w-4 accent-gray-950 disabled:opacity-50"
          />
          <div className="flex-1">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Users className="h-4 w-4" />
              Resumen de todos los participantes
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Promedia metricas por participante y agrupa mapas por escenario.
            </p>
          </div>
        </label>
      </div>
    </Card>
  )
}

