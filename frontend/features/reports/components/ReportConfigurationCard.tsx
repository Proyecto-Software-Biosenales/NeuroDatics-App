import { Card } from "@/components/ui/Card"
import { SensorBadge } from "@/features/projects/components/SensorBadge"
import type { SensorType } from "@/features/projects/types"
import type { ReportMode } from "@/features/reports/types"

interface ReportConfigurationCardProps {
  reportMode: ReportMode
  onReportModeChange: (mode: ReportMode) => void
  availableSensors: SensorType[]
  selectedSensor: SensorType | null
  onSensorChange: (sensor: SensorType) => void
}

const reportOptions = [
  {
    id: "comparative" as const,
    title: "Informe comparativo",
    description:
      "Incluye las metricas y visualizaciones ejecutivas disponibles para todos los sensores del proyecto.",
  },
  {
    id: "by-sensor" as const,
    title: "Informe por sensor",
    description:
      "Limita el informe a un unico sensor y sus metricas asociadas.",
  },
]

export const ReportConfigurationCard = ({
  reportMode,
  onReportModeChange,
  availableSensors,
  selectedSensor,
  onSensorChange,
}: ReportConfigurationCardProps) => {
  return (
    <Card className="p-8 transition-all duration-300">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <span className="text-lg font-semibold text-foreground">3</span>
        </div>
        <div className="flex-1">
          <h2 className="mb-2 text-xl font-semibold text-foreground">
            Configuracion del reporte
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Define si el informe sera comparativo o enfocado en un sensor.
          </p>
        </div>
      </div>

      <div className="space-y-3 pl-14">
        {reportOptions.map((option) => (
          <div key={option.id}>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-all duration-200 ${
                reportMode === option.id
                  ? "border-foreground/40 bg-muted"
                  : "hover:bg-muted/50"
              }`}
            >
              <input
                type="radio"
                name="report-mode"
                value={option.id}
                checked={reportMode === option.id}
                onChange={() => onReportModeChange(option.id)}
                className="mt-1 h-4 w-4 accent-gray-950"
              />
              <div className="flex-1">
                <h3 className="mb-1 text-sm font-semibold text-foreground">
                  {option.title}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {option.description}
                </p>
              </div>
            </label>

            {reportMode === "by-sensor" && option.id === "by-sensor" ? (
              <div className="mt-3 ml-7 rounded-xl border border-border bg-muted/50 p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <p className="mb-3 text-xs font-medium text-foreground">
                  Selecciona exactamente un sensor:
                </p>
                <div className="space-y-2">
                  {availableSensors.map((sensor) => (
                    <label
                      key={sensor}
                      className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-background"
                    >
                      <input
                        type="radio"
                        name="report-sensor"
                        checked={selectedSensor === sensor}
                        onChange={() => onSensorChange(sensor)}
                        className="h-4 w-4 accent-neutral-900"
                      />
                      <SensorBadge sensor={sensor} size="sm" />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  )
}
