
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ReportStepCard } from "./ReportStepCard"
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
    <ReportStepCard step={3} title="Configuracion del reporte" description="Define si el informe sera comparativo o enfocado en un sensor.">


      <RadioGroup value={reportMode} onValueChange={(value) => onReportModeChange(value as ReportMode)} aria-label="Tipo de informe" className="space-y-3 sm:pl-14">
        {reportOptions.map((option) => (
          <div key={option.id}>
            <Label
              htmlFor={`report-mode-${option.id}`}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-all duration-200 ${
                reportMode === option.id
                  ? "border-foreground/40 bg-muted"
                  : "hover:bg-muted/50"
              }`}
            >
              <RadioGroupItem
                id={`report-mode-${option.id}`}
                value={option.id}
                className="mt-1"
              />
              <div className="flex-1">
                <h3 className="mb-1 text-sm font-semibold text-foreground">
                  {option.title}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {option.description}
                </p>
              </div>
            </Label>


          </div>
        ))}
      </RadioGroup>
      {reportMode === "by-sensor" ? (
              <div className="mt-3 ml-7 rounded-xl border border-border bg-muted/50 p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <p className="mb-3 text-xs font-medium text-foreground">
                  Selecciona exactamente un sensor:
                </p>
                <RadioGroup value={selectedSensor ?? ""} onValueChange={(value) => onSensorChange(value as SensorType)} aria-label="Sensor del informe" className="space-y-2">
                  {availableSensors.map((sensor) => (
                    <Label
                      key={sensor}
                      htmlFor={`report-sensor-${sensor}`}
                      className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-background"
                    >
                      <RadioGroupItem
                        id={`report-sensor-${sensor}`}
                        value={sensor}
                      />
                      <SensorBadge sensor={sensor} size="sm" />
                    </Label>
                  ))}
                </RadioGroup>
              </div>
            ) : null}
    </ReportStepCard>
  )
}
