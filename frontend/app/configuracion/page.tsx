"use client"

import { AuthGuard } from "@/features/auth/components/AuthGuard"
import { IS_LOCAL_MODE } from "@/lib/appMode"
import { DriveSettingsCards } from "@/features/settings/components/DriveSettingsCards"
import { ScreenSettingsCard } from "@/features/settings/components/ScreenSettingsCard"

/** Global settings only; everything about one project is edited from that project's card. */
function Configuration() {
  return (
    <div className="app-page-shell">
      <div className="app-page-container max-w-3xl">
        <div className="app-page-header">
          <div>
            <h1 className="app-page-title">Configuración</h1>
            <p className="app-page-description">
              Ajustes que comparten todos tus experimentos.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <ScreenSettingsCard />
          {!IS_LOCAL_MODE && <DriveSettingsCards />}
          {!IS_LOCAL_MODE && (
            <p className="max-w-xl text-sm text-muted-foreground">
              Para el uso diario, inicia el grupo «neurodatics» desde Docker Desktop y abre la aplicación. La conexión de Drive se conserva.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ConfiguracionPage() {
  return <AuthGuard><Configuration /></AuthGuard>
}
