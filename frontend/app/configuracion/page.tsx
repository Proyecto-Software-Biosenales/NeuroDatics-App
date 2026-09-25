"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AuthGuard } from "@/features/auth/components/AuthGuard"
import { apiFetch } from "@/lib/api/apiFetch"
import { IS_LOCAL_MODE } from "@/lib/appMode"
import { useAuth } from "@/lib/providers/AuthProvider"

type DriveConnection = {
  connected: boolean
  account_email: string | null
  oauth_configured: boolean
}

const CONNECTION_PATH = "/api/integrations/google-drive/connection"

function DriveConfiguration() {
  const { currentUser } = useAuth()
  const [connection, setConnection] = useState<DriveConnection | null>(null)
  const [checking, setChecking] = useState(true)
  const [authorizing, setAuthorizing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null)
  const [confirmReconnect, setConfirmReconnect] = useState(false)
  const request = useRef<AbortController | null>(null)
  const returningFromGoogle = useRef(false)

  const refreshConnection = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setChecking(true)
    setError(null)
    try {
      const result = await apiFetch<DriveConnection>(CONNECTION_PATH, {
        signal: controller.signal,
        timeoutMs: 15_000,
      })
      if (!controller.signal.aborted) setConnection(result)
    } catch {
      if (!controller.signal.aborted) {
        setConnection(null)
        setError("No se pudo comprobar la conexión de Google Drive. Comprueba que NeuroDatics esté iniciado en Docker Desktop y vuelve a intentarlo.")
      }
    } finally {
      if (!controller.signal.aborted) setChecking(false)
    }
  }, [])

  useEffect(() => {
    void refreshConnection()
    const onFocus = () => { if (returningFromGoogle.current) void refreshConnection() }
    window.addEventListener("focus", onFocus)
    return () => {
      request.current?.abort()
      window.removeEventListener("focus", onFocus)
    }
  }, [refreshConnection])

  const authorize = async () => {
    // Open during the click so popup blockers do not discard the OAuth tab.
    const authorizationTab = window.open("about:blank", "_blank")
    if (authorizationTab) authorizationTab.opener = null
    setAuthorizing(true)
    setAuthorizationUrl(null)
    setError(null)
    try {
      const result = await apiFetch<{ authorization_url: string }>(
        "/api/integrations/google-drive/authorize",
        { timeoutMs: 15_000 },
      )
      const url = new URL(result.authorization_url)
      if (url.protocol !== "https:" || url.hostname !== "accounts.google.com") {
        throw new Error("La dirección de autorización no corresponde a Google.")
      }
      setAuthorizationUrl(url.href)
      returningFromGoogle.current = true
      if (authorizationTab) authorizationTab.location.href = url.href
    } catch {
      authorizationTab?.close()
      setError("No se pudo abrir la autorización de Google Drive. Comprueba la conexión a Internet y la configuración de Google de esta instalación; después vuelve a intentarlo.")
    } finally {
      setAuthorizing(false)
    }
  }

  return (
    <div className="app-page-shell">
      <div className="app-page-container max-w-3xl">
        <div className="app-page-header">
          <div>
            <h1 className="app-page-title">Configuración</h1>
            <p className="app-page-description">
              Conecta el almacenamiento de tus experimentos antes de subir el primer proyecto.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Sesión de NeuroDatics</CardTitle>
              <CardDescription className="break-words">
                Has iniciado sesión como {currentUser?.email || currentUser?.name || "usuario de Google"}.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              El inicio de sesión y el permiso para guardar archivos en Google Drive se completan por separado.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Google Drive</CardTitle>
              <CardDescription>
                Esta conexión se comparte entre los usuarios de la misma base de datos de NeuroDatics.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div role="status" aria-live="polite" className="space-y-2 text-sm">
                {checking ? (
                  <p className="flex items-center gap-2"><Loader2 aria-hidden="true" className="size-4 animate-spin" />Comprobando conexión…</p>
                ) : connection?.connected ? (
                  <>
                    <p className="flex items-center gap-2 font-medium"><CheckCircle2 aria-hidden="true" className="size-4" />Conexión guardada</p>
                    <p className="break-words">Cuenta de almacenamiento: {connection.account_email || "cuenta de Google autorizada"}.</p>
                    <p className="text-muted-foreground">Si la aplicación indica que el permiso expiró o fue revocado, reconecta la misma cuenta para recuperar el acceso a los archivos.</p>
                  </>
                ) : connection ? (
                  <p>Google Drive todavía no está conectado. Autoriza la cuenta donde se guardarán los archivos de los proyectos.</p>
                ) : null}
              </div>

              {connection && !connection.oauth_configured && (
                <p role="alert" className="text-sm text-destructive">
                  Falta la configuración de Google de esta instalación. Solicita a quien te entregó NeuroDatics que complete esa configuración y vuelva a iniciar la aplicación.
                </p>
              )}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

              {authorizationUrl && (
                <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                  <p>Completa el permiso en la pestaña de Google. Al finalizar, vuelve aquí y pulsa «Comprobar conexión».</p>
                  <p className="text-muted-foreground">Cuando veas «Google Drive conectado», el permiso quedó guardado y puedes cerrar esa pestaña.</p>
                  <Button asChild variant="outline">
                    <a href={authorizationUrl} target="_blank" rel="noopener noreferrer">
                      Abrir autorización de Google <ExternalLink aria-hidden="true" />
                    </a>
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={checking || authorizing || !connection?.oauth_configured}
                  onClick={() => connection?.connected ? setConfirmReconnect(true) : void authorize()}
                >
                  {authorizing && <Loader2 aria-hidden="true" className="animate-spin" />}
                  {connection?.connected ? "Reconectar Google Drive" : "Conectar Google Drive"}
                </Button>
                <Button variant="outline" disabled={checking || authorizing} onClick={() => void refreshConnection()}>
                  <RefreshCw aria-hidden="true" className={checking ? "animate-spin" : undefined} />
                  Comprobar conexión
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-sm text-muted-foreground">
              Para el uso diario, inicia el grupo «neurodatics» desde Docker Desktop y abre la aplicación. La conexión de Drive se conserva.
            </p>
            <Button asChild variant="outline"><Link href="/proyectos">Ir a proyectos</Link></Button>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmReconnect} onOpenChange={setConfirmReconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reconectar la cuenta compartida</AlertDialogTitle>
            <AlertDialogDescription>
              Ya existe una conexión{connection?.account_email ? ` con ${connection.account_email}` : ""}.
              El permiso nuevo se aplicará a todos los usuarios de esta base de datos.
              Selecciona la misma cuenta en Google; otra cuenta podría no tener acceso a los archivos existentes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void authorize()}>Continuar con la reconexión</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// The student edition has no Google Drive to connect; anyone who lands here goes to their projects.
function LeaveForProjects() {
  const router = useRouter()
  useEffect(() => { router.replace("/proyectos") }, [router])
  return null
}

export default function ConfiguracionPage() {
  if (IS_LOCAL_MODE) return <LeaveForProjects />
  return <AuthGuard><DriveConfiguration /></AuthGuard>
}
