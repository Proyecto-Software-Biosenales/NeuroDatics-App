import { Download } from "lucide-react"
import { Card } from "../../../components/ui/Card"
import type { ExportOptions } from "@/features/reports/types"

interface ExportOptionsCardProps {
  enabled: boolean
  options: ExportOptions
  onToggleOption: (key: keyof ExportOptions) => void
  onDownload: () => void
  canDownload: boolean
  loading?: boolean
}

const exportOptions = [
  {
    key: "includeCover" as keyof ExportOptions,
    title: "Incluir portada",
    description: "Página inicial con logo y título del proyecto",
  },
  {
    key: "includeMetadata" as keyof ExportOptions,
    title: "Incluir fecha y nombre del proyecto",
    description: "Metadatos en encabezado y pie de página",
  },
]

export const ExportOptionsCard = ({
  enabled,
  options,
  onToggleOption,
  onDownload,
  canDownload,
  loading = false,
}: ExportOptionsCardProps) => {
  return (
    <Card
      className={`p-8 transition-all duration-300 ${
        enabled ? "opacity-100" : "opacity-50 pointer-events-none"
      }`}
    >
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-shrink-0 w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
          <span className="text-foreground font-semibold text-lg">4</span>
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Opciones de exportación
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Personaliza el formato y metadatos del documento PDF
          </p>
        </div>
      </div>

      <div className="pl-14 space-y-3">
        {exportOptions.map((option) => (
          <label
            key={option.key}
            className={`flex items-start gap-3 p-4 border border-border rounded-xl cursor-pointer transition-all duration-200 ${
              enabled
                ? options[option.key]
                  ? "border-foreground/40 bg-muted"
                  : "hover:border-border hover:bg-muted/50"
                : ""
            }`}
          >
            <input
              type="checkbox"
              checked={options[option.key]}
              onChange={() => onToggleOption(option.key)}
              disabled={!enabled}
              className="mt-1 w-4 h-4 accent-gray-950"
            />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground mb-1">
                {option.title}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {option.description}
              </p>
            </div>
          </label>
        ))}

        <button
          onClick={onDownload}
          disabled={!canDownload || loading}
          className={`w-full mt-6 flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-semibold text-white transition-all duration-200 ${
            canDownload && !loading
              ? "bg-gray-950 hover:bg-gray-700 hover:scale-[1.02] active:scale-[0.98]"
              : "bg-gray-400 cursor-not-allowed"
          }`}
        >
          <Download className={`w-5 h-5 ${loading ? "animate-pulse" : ""}`} />
          {loading ? "Generando PDF..." : "Descargar reporte PDF"}
        </button>
      </div>
    </Card>
  )
}
