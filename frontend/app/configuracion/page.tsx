"use client"

import { AuthGuard } from "@/features/auth/components/AuthGuard"
import { ScreenSettingsCard } from "@/features/settings/components/ScreenSettingsCard"

/**
 * Global settings only; everything about one project is edited from that project's card. The Google
 * Drive account that stores the files is chosen by the administrators on the server, never here.
 */
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
        </div>
      </div>
    </div>
  )
}

export default function ConfiguracionPage() {
  return <AuthGuard><Configuration /></AuthGuard>
}
