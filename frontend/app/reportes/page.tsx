"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { AuthGuard } from "@/features/auth/components/AuthGuard"
import { ProjectSelectionCard } from "@/features/projects/components/ProjectSelectionCard"
import { ProjectsApi, type ApiProject } from "@/features/projects/api/projectsApi"
import type { Project, SensorType } from "@/features/projects/types"
import {
  useAnalyticsParticipants,
  useAnalyticsScenarios,
} from "@/features/analytics/hooks/useAnalyticsData"
import type { AnalyticsScenario } from "@/features/analytics/types"
import { ReportsApi } from "@/features/reports/api/reportsApi"
import { ReportsEmptyContainer } from "@/features/reports/components/ReportsEmptyContainer"
import { ReportScopeCard } from "@/features/reports/components/ReportScopeCard"
import { ReportConfigurationCard } from "@/features/reports/components/ReportConfigurationCard"
import { ReportPreview } from "@/features/reports/components/ReportPreview"
import { ExportOptionsCard } from "@/features/reports/components/ExportOptionsCard"
import { useExportOptions } from "@/features/reports/export-report-options/useExportOptions"
import type {
  ExecutiveReportPayload,
  ReportMode,
  ReportScopeKind,
} from "@/features/reports/types"

function normalizeSensor(sensor: string): SensorType | null {
  const compact = sensor.toLowerCase().replace(/[\s_-]/g, "")
  if (compact === "eyetracker" || compact === "eye") return "EyeTracker"
  if (compact === "gsr" || compact.includes("galvan")) return "GSR"
  if (compact === "eeg" || compact.includes("electroencef")) return "EEG"
  return null
}

function isVideoScenario(scenario: AnalyticsScenario) {
  const type = String(scenario.type || "").trim().toLowerCase()
  const name = String(scenario.name || "").trim().toLowerCase()
  return (
    type.includes("video") ||
    ["mp4", "mov", "webm", "avi", "mkv", "m4v"].includes(type) ||
    [".mp4", ".mov", ".webm", ".avi", ".mkv", ".m4v"].some((extension) =>
      name.endsWith(extension)
    )
  )
}

function formatProjectDate(value?: string) {
  if (!value) return "Sin fecha"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function mapProject(project: ApiProject): Project {
  const sensors = (project.sensors ?? [])
    .map((sensor) => normalizeSensor(sensor.sensor_type))
    .filter((sensor): sensor is SensorType => sensor != null)
  const uniqueSensors = Array.from(new Set(sensors))

  return {
    id: project.id,
    name: project.name,
    description: project.description ?? undefined,
    status:
      project.status === "draft" ||
      project.status === "active" ||
      project.status === "archived"
        ? project.status
        : undefined,
    ingestionStatus:
      project.ingestion_status === "PENDING" ||
      project.ingestion_status === "PROCESSING" ||
      project.ingestion_status === "READY" ||
      project.ingestion_status === "FAILED"
        ? project.ingestion_status
        : undefined,
    createdAt: formatProjectDate(project.created_at),
    updatedAt: project.updated_at,
    sensors: uniqueSensors,
    participants: project.participants_count,
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function safeFilename(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "proyecto"
  )
}

export default function ReportesPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [scopeKind, setScopeKind] = useState<ReportScopeKind>("participant")
  const [selectedParticipant, setSelectedParticipant] = useState("")
  const [reportMode, setReportMode] = useState<ReportMode>("comparative")
  const [selectedSensor, setSelectedSensor] = useState<SensorType | null>(null)
  const [generating, setGenerating] = useState(false)
  const { options, toggleOption } = useExportOptions()

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )
  const selectedProjectKey = selectedProject?.id ?? null
  const { participants, loading: participantsLoading } =
    useAnalyticsParticipants(selectedProjectKey)
  const { scenarios, loading: scenariosLoading } =
    useAnalyticsScenarios(selectedProjectKey)
  const availableSensors = useMemo(
    () => selectedProject?.sensors ?? [],
    [selectedProject]
  )
  const reportableScenarios = useMemo(
    () => scenarios.filter((scenario) => !isVideoScenario(scenario)),
    [scenarios]
  )
  const omittedVideoScenarios = scenarios.length - reportableScenarios.length

  useEffect(() => {
    let cancelled = false
    setProjectsLoading(true)
    ProjectsApi.list()
      .then((items) => {
        if (!cancelled) setProjects(items.map(mapProject))
      })
      .catch((error) => {
        if (!cancelled) {
          setProjects([])
          toast.error(
            error instanceof Error
              ? error.message
              : "No se pudieron cargar los proyectos."
          )
        }
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setScopeKind("participant")
    setSelectedParticipant("")
    setReportMode("comparative")
    setSelectedSensor(null)
  }, [selectedProjectId])

  useEffect(() => {
    if (!participants.length) {
      setSelectedParticipant("")
      return
    }
    if (
      !selectedParticipant ||
      !participants.some(
        (participant) =>
          participant.participant_code === selectedParticipant
      )
    ) {
      setSelectedParticipant(participants[0].participant_code)
    }
  }, [participants, selectedParticipant])

  useEffect(() => {
    if (reportMode !== "by-sensor") return
    if (selectedSensor && availableSensors.includes(selectedSensor)) return
    setSelectedSensor(availableSensors[0] ?? null)
  }, [availableSensors, reportMode, selectedSensor])

  const hasSelection = Boolean(selectedProject)
  const hasParticipants = participants.length > 0
  const hasScenarios = reportableScenarios.length > 0
  const hasValidScope =
    scopeKind === "all-participants" ? hasParticipants : Boolean(selectedParticipant)
  const hasValidMode =
    reportMode === "comparative" ? availableSensors.length > 0 : Boolean(selectedSensor)
  const canDownload =
    hasSelection &&
    hasValidScope &&
    hasValidMode &&
    hasScenarios &&
    !participantsLoading &&
    !scenariosLoading &&
    !generating

  const buildPayload = (): ExecutiveReportPayload | null => {
    if (!selectedProject) return null
    if (reportMode === "by-sensor" && !selectedSensor) return null
    if (scopeKind === "participant" && !selectedParticipant) return null

    return {
      project_id: selectedProject.id,
      scope:
        scopeKind === "participant"
          ? { kind: "participant", participant_code: selectedParticipant }
          : { kind: "all_participants" },
      mode:
        reportMode === "comparative"
          ? { kind: "comparative" }
          : { kind: "sensor", sensor: selectedSensor as SensorType },
      scenario_scope: "all_by_sections",
      include_cover: options.includeCover,
      include_metadata: options.includeMetadata,
    }
  }

  const handleDownload = async () => {
    const payload = buildPayload()
    if (!payload || !selectedProject) return

    const toastId = toast.loading("Generando informe ejecutivo...")
    setGenerating(true)
    try {
      const blob = await ReportsApi.generateExecutiveReport(payload)
      downloadBlob(
        blob,
        `informe-ejecutivo-${safeFilename(selectedProject.name)}.pdf`
      )
      toast.success("Informe ejecutivo generado.", { id: toastId })
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo generar el informe ejecutivo.",
        { id: toastId }
      )
    } finally {
      setGenerating(false)
    }
  }

  return (
    <AuthGuard>
      <div className="app-page-shell">
        <div className="app-page-container">
          <div className="app-page-header">
            <div>
            <h1 className="app-page-title">
              Reportes
            </h1>
            <p className="app-page-description">
              Genera informes ejecutivos en PDF con mapas, AOIs, metricas y
              senales temporales resumidas por escenario.
            </p>
            </div>
          </div>

          <div className="mb-6 2xl:mb-8">
            <ProjectSelectionCard
              projects={projects}
              selectedProject={selectedProject}
              onProjectChange={setSelectedProjectId}
            />
            {projectsLoading ? (
              <p className="mt-3 pl-14 text-sm text-muted-foreground">
                Cargando proyectos...
              </p>
            ) : null}
          </div>

          {hasSelection ? (
            <>
              <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-300 2xl:mb-8">
                <ReportScopeCard
                  participants={participants}
                  selectedParticipant={selectedParticipant}
                  scopeKind={scopeKind}
                  onScopeKindChange={setScopeKind}
                  onParticipantChange={setSelectedParticipant}
                  loading={participantsLoading}
                />
              </div>

              <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-300 2xl:mb-8">
                <ReportConfigurationCard
                  reportMode={reportMode}
                  onReportModeChange={setReportMode}
                  availableSensors={availableSensors}
                  selectedSensor={selectedSensor}
                  onSensorChange={setSelectedSensor}
                />
              </div>

              <div className="mb-6 pl-0 sm:pl-8 sm:pr-4 2xl:mb-8 2xl:pl-14 2xl:pr-8">
                <ReportPreview
                  reportMode={reportMode}
                  scopeKind={scopeKind}
                  selectedSensor={selectedSensor}
                  scenarioCount={reportableScenarios.length}
                  participantCount={participants.length}
                  omittedVideoScenarios={omittedVideoScenarios}
                />
                {!hasScenarios && !scenariosLoading ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    El proyecto no tiene escenarios de imagen disponibles para
                    seccionar el informe.
                  </p>
                ) : null}
              </div>

              <div
                className="mb-6 animate-in fade-in slide-in-from-top-4 duration-300 2xl:mb-8"
                style={{ animationDelay: "100ms" }}
              >
                <ExportOptionsCard
                  enabled={hasSelection}
                  options={options}
                  onToggleOption={toggleOption}
                  onDownload={handleDownload}
                  canDownload={canDownload}
                  loading={generating}
                />
              </div>
            </>
          ) : (
            <div className="transition-all duration-300">
              <ReportsEmptyContainer />
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
