import { Download } from "lucide-react"
import { Card } from "../atoms/Card"
import type { ExportOptions } from "@/lib/entities/report/types"

interface ExportOptionsCardProps {
  enabled: boolean
  options: ExportOptions
  onToggleOption: (key: keyof ExportOptions) => void
  onDownload: () => void
  canDownload: boolean
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
}: ExportOptionsCardProps) => {
  return (
    <Card
      className={`p-8 transition-all duration-300 ${
        enabled ? "opacity-100" : "opacity-50 pointer-events-none"
      }`}
    >
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
          <span className="text-gray-800 font-semibold text-lg">4</span>
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Opciones de exportación
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Personaliza el formato y metadatos del documento PDF
          </p>
        </div>
      </div>

      <div className="pl-14 space-y-3">
        {exportOptions.map((option) => (
          <label
            key={option.key}
            className={`flex items-start gap-3 p-4 border border-gray-200 rounded-xl cursor-pointer transition-all duration-200 ${
              enabled
                ? options[option.key]
                  ? "border-gray-500 bg-gray-100"
                  : "hover:border-gray-300 hover:bg-gray-50"
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
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                {option.title}
              </h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                {option.description}
              </p>
            </div>
          </label>
        ))}

        <button
          onClick={onDownload}
          disabled={!canDownload}
          className={`w-full mt-6 flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-semibold text-white transition-all duration-200 ${
            canDownload
              ? "bg-gray-950 hover:bg-gray-700 hover:scale-[1.02] active:scale-[0.98]"
              : "bg-gray-400 cursor-not-allowed"
          }`}
        >
          <Download className="w-5 h-5" />
          Descargar reporte PDF
        </button>
      </div>
    </Card>
  )
}
