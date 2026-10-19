
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { User, Users } from "lucide-react"
import { ReportStepCard } from "./ReportStepCard"
import { ReportOptionTitle } from "./ReportOptionTitle"
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
    <ReportStepCard step={2} title="Alcance del informe">
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
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <ReportOptionTitle
              icon={User}
              hint="Gráficas y estadísticas completas de un solo participante en cada escenario."
            >
              <Label htmlFor="report-scope-participant" className="inline cursor-pointer leading-5 font-semibold">
                Un participante
              </Label>
            </ReportOptionTitle>
            {scopeKind === "participant" ? (
              <div className="mt-3">
              <Select
                value={selectedParticipant}
                onValueChange={(val) => val && onParticipantChange(val)}
                disabled={loading || !hasParticipants}
              >
                <SelectTrigger className="flex w-full max-w-md items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50">
                  {/* Radix renders the selected item's own label; passing children here
                      would make the trigger both a portal container and a text node. */}
                  <SelectValue placeholder={loading ? "Cargando…" : "Selecciona un participante"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {participants.map((participant) => (
                      <SelectItem
                        key={participant.participant_code}
                        value={participant.participant_code}
                      >
                        {`Participante ${participant.participant_code}`}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              </div>
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
            className="mt-0.5"
          />
          <ReportOptionTitle
            icon={Users}
            hint="Compara a todos los participantes: mapas agregados, tablas por participante y media del grupo."
          >
            Resumen de todos los participantes
          </ReportOptionTitle>
        </Label>
      </RadioGroup>
    </ReportStepCard>
  )
}
