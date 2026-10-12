"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { AuthGuard } from "@/features/auth/components/AuthGuard"
import { IS_LOCAL_MODE } from "@/lib/appMode"
import { DriveSettingsCards } from "@/features/settings/components/DriveSettingsCards"
import { PreExperimentSettings } from "@/features/projects/pre-experiment/PreExperimentSettings"

function Configuration() {
  return (
    <div className="app-page-shell">
      <div className="app-page-container max-w-3xl">
        <div className="app-page-header">
          <div>
            <h1 className="app-page-title">Configuración</h1>
            <p className="app-page-description">
              Organiza la información y los cuestionarios de tus proyectos.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <PreExperimentSettings />
          {!IS_LOCAL_MODE && <DriveSettingsCards />}

          {/* The Docker hint is server-only; the way back to the projects is not. */}
          <div className={`flex flex-wrap items-center gap-4 ${IS_LOCAL_MODE ? "justify-end" : "justify-between"}`}>
            {!IS_LOCAL_MODE && (
              <p className="max-w-xl text-sm text-muted-foreground">
                Para el uso diario, inicia el grupo «neurodatics» desde Docker Desktop y abre la aplicación. La conexión de Drive se conserva.
              </p>
            )}
            <Button asChild variant="outline"><Link href="/proyectos">Ir a proyectos</Link></Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ConfiguracionPage() {
  return <AuthGuard><Configuration /></AuthGuard>
}
