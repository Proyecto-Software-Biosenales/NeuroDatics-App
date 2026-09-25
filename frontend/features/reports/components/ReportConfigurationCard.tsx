import { Brain, Eye, Files, Zap } from "lucide-react"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"
import type { SensorType } from "@/features/projects/types"
import { DEVICE_REPORTS } from "@/features/reports/reportContents"
import type { ReportDevice } from "@/features/reports/types"
import { ReportStepCard } from "./ReportStepCard"

interface ReportConfigurationCardProps {
  availableSensors: SensorType[]
  selectedDevice: ReportDevice | null
  onDeviceChange: (device: ReportDevice) => void
}

const DEVICE_ICONS = { EyeTracker: Eye, GSR: Zap, EEG: Brain } satisfies Record<SensorType, typeof Eye>

export const ReportConfigurationCard = ({
  availableSensors,
  selectedDevice,
  onDeviceChange,
}: ReportConfigurationCardProps) => {
  const options = [
    ...availableSensors.map((sensor) => ({
      id: sensor as ReportDevice,
      title: DEVICE_REPORTS[sensor].title,
      description: DEVICE_REPORTS[sensor].summary,
      Icon: DEVICE_ICONS[sensor],
    })),
    ...(availableSensors.length > 1
      ? [{
          id: "all" as ReportDevice,
          title: "Todos los dispositivos",
          description: "Un informe PDF por dispositivo, descargados juntos en un archivo ZIP.",
          Icon: Files,
        }]
      : []),
  ]

  return (
    <ReportStepCard
      step={3}
      title="Dispositivo"
      description="Cada dispositivo genera su propio informe, con sus gráficas y tablas de estadísticas por escenario."
    >
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground sm:pl-14">
          El proyecto no tiene dispositivos registrados.
        </p>
      ) : (
        <RadioGroup
          value={selectedDevice ?? ""}
          onValueChange={(value) => onDeviceChange(value as ReportDevice)}
          aria-label="Dispositivo del informe"
          className="grid gap-3 sm:grid-cols-2 sm:pl-14"
        >
          {options.map(({ id, title, description, Icon }) => (
            <Label
              key={id}
              htmlFor={`report-device-${id}`}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-all duration-200",
                selectedDevice === id ? "border-foreground/40 bg-muted" : "hover:bg-muted/50"
              )}
            >
              <RadioGroupItem id={`report-device-${id}`} value={id} className="mt-1" />
              <div className="min-w-0 flex-1">
                <span className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {title}
                </span>
                <span className="block text-xs leading-relaxed font-normal text-muted-foreground">
                  {description}
                </span>
              </div>
            </Label>
          ))}
        </RadioGroup>
      )}
    </ReportStepCard>
  )
}
