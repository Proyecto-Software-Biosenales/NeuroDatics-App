
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { ReportStepCard } from "./ReportStepCard"
import type { ExportOptions } from "@/features/reports/types"

interface ExportOptionsCardProps {
  enabled: boolean
  options: ExportOptions
  onToggleOption: (key: keyof ExportOptions) => void
  onDownload: () => void
  canDownload: boolean
  loading?: boolean
  downloadLabel?: string
}

const exportOptions = [
  {
    key: "includeCover" as keyof ExportOptions,
    title: "Incluir portada",
    description: "Página inicial con el dispositivo, el proyecto y el alcance del informe",
  },
  {
    key: "includeMetadata" as keyof ExportOptions,
    title: "Incluir fecha y nombre del proyecto",
    description: "Fecha de generación y proyecto en la portada y el pie de página",
  },
]

export const ExportOptionsCard = ({
  enabled,
  options,
  onToggleOption,
  onDownload,
  canDownload,
  loading = false,
  downloadLabel = "Descargar reporte PDF",
}: ExportOptionsCardProps) => {
  return (
    <ReportStepCard step={4} title="Opciones de exportación" description="Personaliza la portada y los metadatos del documento PDF" disabled={!enabled}>


      <div className="sm:pl-14 space-y-3">
        {exportOptions.map((option) => (
          <Label
            key={option.key}
            htmlFor={`export-${option.key}`}
            className={`flex items-start gap-3 p-4 border border-border rounded-xl cursor-pointer transition-all duration-200 ${
              enabled
                ? options[option.key]
                  ? "border-foreground/40 bg-muted"
                  : "hover:border-border hover:bg-muted/50"
                : ""
            }`}
          >
            <Checkbox
              id={`export-${option.key}`}
              checked={options[option.key]}
              onCheckedChange={() => onToggleOption(option.key)}
              disabled={!enabled}
              className="mt-1"
            />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground mb-1">
                {option.title}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {option.description}
              </p>
            </div>
          </Label>
        ))}

        <Button size="lg"
          onClick={onDownload}
          disabled={!canDownload || loading}
          className="mt-6 w-full"
        >
          <Download className={`w-5 h-5 ${loading ? "animate-pulse" : ""}`} />
          {loading ? "Generando informe..." : downloadLabel}
        </Button>
      </div>
    </ReportStepCard>
  )
}
