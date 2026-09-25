import { FileArchive, FileText } from "lucide-react"
import type { SensorType } from "@/features/projects/types"
import { DEVICE_REPORTS, deviceSections } from "@/features/reports/reportContents"
import type { ReportScopeKind } from "@/features/reports/types"

interface ReportPreviewProps {
  devices: SensorType[]
  scopeKind: ReportScopeKind
  participantLabel: string
  participantCount: number
  scenarioCount: number
  omittedVideoScenarios?: number
  includeCover: boolean
}

export const ReportPreview = ({
  devices,
  scopeKind,
  participantLabel,
  participantCount,
  scenarioCount,
  omittedVideoScenarios = 0,
  includeCover,
}: ReportPreviewProps) => {
  if (devices.length === 0) return null

  const zipped = devices.length > 1
  const scope =
    scopeKind === "participant"
      ? participantLabel
        ? `Participante ${participantLabel}`
        : "Un participante"
      : `Grupo de ${participantCount} ${participantCount === 1 ? "participante" : "participantes"}`
  const Icon = zipped ? FileArchive : FileText

  return (
    <section
      aria-label="Contenido del informe"
      className="rounded-xl border border-border bg-muted/30 p-5 animate-in fade-in duration-300 sm:p-6"
    >
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background shadow-sm">
          <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground">
            {zipped ? `${devices.length} informes PDF en un archivo ZIP` : `Informe PDF de ${DEVICE_REPORTS[devices[0]].title}`}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {scope} · {scenarioCount} {scenarioCount === 1 ? "escenario" : "escenarios"}
            {omittedVideoScenarios > 0
              ? ` · se ${omittedVideoScenarios === 1 ? "omite 1 escenario" : `omiten ${omittedVideoScenarios} escenarios`} de video`
              : ""}
          </p>
        </div>
      </div>

      <div className={`mt-5 grid gap-4 ${zipped ? "lg:grid-cols-3" : ""}`}>
        {devices.map((device) => (
          <div key={device} className="rounded-lg border border-border bg-background p-4">
            <p className="text-sm font-semibold text-foreground">{DEVICE_REPORTS[device].title}</p>
            <ol className="mt-3 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              {includeCover ? <li>Portada</li> : null}
              <li>Índice con enlaces a cada sección</li>
              <li>Resumen: tabla y gráfica comparativa de escenarios</li>
              <li>
                Por cada escenario:
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {deviceSections(device, scopeKind).map((section) => (
                    <li key={section}>{section}</li>
                  ))}
                </ul>
              </li>
              <li>Metodología y glosario</li>
            </ol>
          </div>
        ))}
      </div>
    </section>
  )
}
