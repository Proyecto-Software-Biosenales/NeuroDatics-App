
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Users } from "lucide-react"
import { ReportStepCard } from "./ReportStepCard"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
    <ReportStepCard step={2} title="Alcance del informe" description="Selecciona un participante o genera un resumen agregado del grupo.">


      <RadioGroup value={scopeKind} onValueChange={(value) => onScopeKindChange(value as ReportScopeKind)} aria-label="Alcance del informe" className="space-y-3 sm:pl-14">
        <div
          className={`flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-all duration-200 ${
            scopeKind === "participant"
              ? "border-foreground/40 bg-muted"
              : "hover:bg-muted/50"
          }`}
        >
          <RadioGroupItem
            id="report-scope-participant"
            value="participant"
            className="mt-1"
          />
          <div className="min-w-0 flex-1">
            <Label htmlFor="report-scope-participant" className="mb-1 font-semibold">
              Un participante
            </Label>
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
              Genera el informe ejecutivo para un solo sujeto.
            </p>
            {scopeKind === "participant" ? (
              <Select
                value={selectedParticipant}
                onValueChange={(val) => val && onParticipantChange(val)}
                disabled={loading || !hasParticipants}
              >
                <SelectTrigger className="flex w-full max-w-md items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50">
                  <SelectValue placeholder={loading ? "Cargando..." : "Selecciona un participante"}>
                    {selectedParticipant || undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {participants.map((participant) => (
                      <SelectItem
                        key={participant.participant_code}
                        value={participant.participant_code}
                      >
                        {`Sujeto ${participant.participant_code}`}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </div>

        <Label
          htmlFor="report-scope-all"
          className={`flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-all duration-200 ${
            scopeKind === "all-participants"
              ? "border-foreground/40 bg-muted"
              : "hover:bg-muted/50"
          }`}
        >
          <RadioGroupItem
            id="report-scope-all"
            value="all-participants"
            disabled={!hasParticipants}
            className="mt-1"
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
        </Label>
      </RadioGroup>
    </ReportStepCard>
  )
}
