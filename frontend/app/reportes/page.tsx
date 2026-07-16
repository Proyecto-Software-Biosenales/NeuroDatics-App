"use client"

import { ProjectSelectionCard } from "@/features/projects/components/ProjectSelectionCard"
import { ReportsEmptyContainer } from "@/features/reports/components/ReportsEmptyContainer"
import { ReportConfigurationCard } from "@/features/reports/components/ReportConfigurationCard"
import { ReportContentCard } from "@/features/reports/components/ReportContentCard"
import { ReportPreview } from "@/features/reports/components/ReportPreview"
import { ExportOptionsCard } from "@/features/reports/components/ExportOptionsCard"
import { useSelectedProject } from "@/features/projects/select-project/useSelectedProject"
import { useReportType } from "@/features/reports/select-report-type/useReportType"
import { useReportContent } from "@/features/reports/select-report-content/useReportContent"
import { useExportOptions } from "@/features/reports/export-report-options/useExportOptions"
import { useSelectedSensors } from "@/features/reports/select-sensors/useSelectedSensors"
import { AuthGuard } from "@/features/auth/components/AuthGuard"
import type { Project } from "@/features/projects/types"

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
    <AuthGuard>
      <div className="min-h-[calc(100vh-var(--app-nav-height))] bg-gray-50 dark:bg-black">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 xl:px-8 xl:py-10">
          <div className="mb-6 xl:mb-10">
            <h1 className="mb-2 text-2xl font-semibold text-foreground tracking-tight xl:mb-3 xl:text-3xl">
              Reportes
            </h1>
            <p className="max-w-4xl text-base text-muted-foreground leading-relaxed xl:text-lg">
              Genera y descarga reportes en PDF de tus proyectos, incluyendo
              gráficas, estadísticas y análisis de sensores.
            </p>
          </div>

          <div className="mb-6 xl:mb-8">
            <ProjectSelectionCard
              projects={mockProjects}
              selectedProject={selectedProject}
              onProjectChange={selectProject}
            />
          </div>

          {hasSelection && (
            <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-300 xl:mb-8">
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
            <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-300 xl:mb-8">
              <ReportContentCard
                enabled={hasReportType}
                content={content}
                onToggleContent={toggleContent}
              />

              {hasContent && (
                <div className="pl-8 pr-4 xl:pl-14 xl:pr-8">
                  <ReportPreview selectedCount={selectedCount} />
                </div>
              )}
            </div>
          )}

          {hasReportType && (
            <div
              className="mb-6 animate-in fade-in slide-in-from-top-4 duration-300 xl:mb-8"
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
    </AuthGuard>
  )
}
