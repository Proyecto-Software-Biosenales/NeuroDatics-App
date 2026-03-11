import { FileText } from "lucide-react"

interface ReportPreviewProps {
  selectedCount: number
}

export const ReportPreview = ({ selectedCount }: ReportPreviewProps) => {
  return (
    <div className="mt-6 p-8 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 animate-in fade-in duration-300">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4 shadow-sm">
          <FileText className="w-8 h-8 text-gray-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Vista previa del reporte
        </h3>
        <p className="text-sm text-gray-600">
          El reporte incluirá{" "}
          <span className="font-semibold text-gray-900">{selectedCount}</span>{" "}
          {selectedCount === 1 ? "tipo de contenido" : "tipos de contenido"}
        </p>
      </div>
    </div>
  )
}
