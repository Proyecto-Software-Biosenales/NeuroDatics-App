"use client"

import { ProjectSelectionCard } from "@/lib/shared/organisms/ProjectSelectionCard"
import { ReportsEmptyContainer } from "@/lib/shared/organisms/ReportsEmptyContainer"
import { ReportConfigurationCard } from "@/lib/shared/organisms/ReportConfigurationCard"
import { ReportContentCard } from "@/lib/shared/organisms/ReportContentCard"
import { ReportPreview } from "@/lib/shared/organisms/ReportPreview"
import { ExportOptionsCard } from "@/lib/shared/organisms/ExportOptionsCard"
import { useSelectedProject } from "@/lib/features/select-project/useSelectedProject"
import { useReportType } from "@/lib/features/select-report-type/useReportType"
import { useReportContent } from "@/lib/features/select-report-content/useReportContent"
import { useExportOptions } from "@/lib/features/export-report-options/useExportOptions"
import { useSelectedSensors } from "@/lib/features/select-sensors/useSelectedSensors"
import type { Project } from "@/lib/entities/project/types"

const mockProjects: Project[] = [
  {
    id: "1",
    name: "Publicidad Coca-cola",
    createdAt: "28/11/2025",
    sensors: ["EEG", "GSR", "EyeTracker"],
  },
  {
    id: "2",
    name: "Helados Colombianos",
    createdAt: "15/10/2025",
    sensors: ["EyeTracker"],
  },
  {
    id: "3",
    name: "Experimento atardecer",
    createdAt: "03/12/2025",
    sensors: ["GSR", "EyeTracker"],
  },
]

export default function ReportesPage() {
  const { selectedProject, selectProject, hasSelection } =
    useSelectedProject(mockProjects)
  const { reportType, setReportType, hasReportType } = useReportType()
  const { content, toggleContent, selectedCount, hasContent } =
    useReportContent()
  const { options, toggleOption } = useExportOptions()
  const { selectedSensors, toggleSensor, clearSensors } = useSelectedSensors()

  const handleReportTypeChange = (type: typeof reportType) => {
    setReportType(type)
    if (type !== "by-sensor") {
      clearSensors()
    }
  }

  const handleDownload = () => {
    console.log("Descargando reporte PDF...", {
      project: selectedProject?.name,
      reportType,
      selectedSensors,
      content,
      options,
    })
  }

  const canDownload =
    hasReportType &&
    (reportType !== "by-sensor" || selectedSensors.length > 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-8 py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-semibold text-gray-900 mb-3 tracking-tight">
            Reportes
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed">
            Genera y descarga reportes en PDF de tus proyectos, incluyendo
            gráficas, estadísticas y análisis de sensores.
          </p>
        </div>

        <div className="mb-8">
          <ProjectSelectionCard
            projects={mockProjects}
            selectedProject={selectedProject}
            onProjectChange={selectProject}
          />
        </div>

        {hasSelection && (
          <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
            <ReportConfigurationCard
              reportType={reportType}
              onReportTypeChange={handleReportTypeChange}
              availableSensors={selectedProject?.sensors || []}
              selectedSensors={selectedSensors}
              onSensorToggle={toggleSensor}
            />
          </div>
        )}

        {hasReportType && (
          <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
            <ReportContentCard
              enabled={hasReportType}
              content={content}
              onToggleContent={toggleContent}
            />

            {hasContent && (
              <div className="pl-14 pr-8">
                <ReportPreview selectedCount={selectedCount} />
              </div>
            )}
          </div>
        )}

        {hasReportType && (
          <div
            className="mb-8 animate-in fade-in slide-in-from-top-4 duration-300"
            style={{ animationDelay: "100ms" }}
          >
            <ExportOptionsCard
              enabled={hasReportType}
              options={options}
              onToggleOption={toggleOption}
              onDownload={handleDownload}
              canDownload={canDownload}
            />
          </div>
        )}

        {!hasSelection && (
          <div className="transition-all duration-300">
            <ReportsEmptyContainer />
          </div>
        )}
      </div>
    </div>
  )
}
