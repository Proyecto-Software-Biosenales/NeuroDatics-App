import { Card } from "../../../components/ui/Card"
import { SensorBadge } from "../../projects/components/SensorBadge"
import type { SensorType } from "@/features/projects/types"
import type { ReportType } from "@/features/reports/types"

interface ReportConfigurationCardProps {
  reportType: ReportType
  onReportTypeChange: (type: ReportType) => void
  availableSensors: SensorType[]
  selectedSensors: SensorType[]
  onSensorToggle: (sensor: SensorType) => void
}

const reportOptions = [
  {
    id: "complete" as const,
    title: "Reporte completo del proyecto",
    description:
      "Incluye todos los sensores y análisis disponibles del proyecto seleccionado",
  },
  {
    id: "by-sensor" as const,
    title: "Reporte por sensor",
    description:
      "Selecciona uno o más sensores específicos para incluir en el reporte",
  },
  {
    id: "comparative" as const,
    title: "Reporte comparativo",
    description: "Análisis comparativo entre sensores, gráficas y métricas",
  },
]

export const ReportConfigurationCard = ({
  reportType,
  onReportTypeChange,
  availableSensors,
  selectedSensors,
  onSensorToggle,
}: ReportConfigurationCardProps) => {
  return (
    <Card className="p-8 transition-all duration-300">
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
          <span className="text-gray-800 font-semibold text-lg">2</span>
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Configuración del reporte
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Define el tipo y alcance del reporte a generar
          </p>
        </div>
      </div>

      <div className="pl-14 space-y-3">
        {reportOptions.map((option) => (
          <div key={option.id}>
            <label
              className={`flex items-start gap-3 p-4 border border-gray-200 rounded-xl cursor-pointer transition-all duration-200 ${
                reportType === option.id
                  ? "border-gray-500 bg-gray-100"
                  : "hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="report-type"
                value={option.id}
                checked={reportType === option.id}
                onChange={() => onReportTypeChange(option.id)}
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

            {reportType === "by-sensor" &&
              option.id === "by-sensor" &&
              availableSensors.length > 0 && (
                <div className="ml-7 mt-3 p-4 bg-gray-50 rounded-xl border border-gray-200 animate-in fade-in slide-in-from-top-2 duration-300">
                  <p className="text-xs font-medium text-gray-700 mb-3">
                    Selecciona los sensores a incluir:
                  </p>
                  <div className="space-y-2">
                    {availableSensors.map((sensor) => (
                      <label
                        key={sensor}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-white transition-colors cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSensors.includes(sensor)}
                          onChange={() => onSensorToggle(sensor)}
                          className="w-4 h-4 accent-neutral-900"
                        />
                        <SensorBadge sensor={sensor} size="sm" />
                      </label>
                    ))}
                  </div>
                </div>
              )}
          </div>
        ))}
      </div>
    </Card>
  )
}
