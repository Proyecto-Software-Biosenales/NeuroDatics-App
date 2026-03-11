import { Card } from "../atoms/Card"
import type { ReportContent, ContentType } from "@/lib/entities/report/types"

interface ReportContentCardProps {
  enabled: boolean
  content: ReportContent
  onToggleContent: (type: ContentType) => void
}

const contentOptions = [
  {
    id: "individual-charts" as ContentType,
    title: "Gráficas individuales por sensor",
    description: "Visualizaciones detalladas de cada sensor seleccionado",
  },
  {
    id: "statistics" as ContentType,
    title: "Estadísticas resumidas",
    description: "Métricas cuantitativas y análisis estadístico",
  },
  {
    id: "comparative-charts" as ContentType,
    title: "Gráficas comparativas",
    description: "Análisis visual de correlaciones entre sensores",
  },
]

export const ReportContentCard = ({
  enabled,
  content,
  onToggleContent,
}: ReportContentCardProps) => {
  return (
    <Card
      className={`p-8 transition-all duration-300 ${
        enabled ? "opacity-100" : "opacity-50 pointer-events-none"
      }`}
    >
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
          <span className="text-gray-800 font-semibold text-lg">3</span>
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Contenido del reporte
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Selecciona los elementos a incluir en el documento final
          </p>
        </div>
      </div>

      <div className="pl-14 space-y-3">
        {contentOptions.map((option) => (
          <label
            key={option.id}
            className={`flex items-start gap-3 p-4 border border-gray-200 rounded-xl cursor-pointer transition-all duration-200 ${
              enabled
                ? content[option.id]
                  ? "border-gray-500 bg-gray-100"
                  : "hover:border-gray-300 hover:bg-gray-50"
                : ""
            }`}
          >
            <input
              type="checkbox"
              checked={content[option.id]}
              onChange={() => onToggleContent(option.id)}
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
      </div>
    </Card>
  )
}
