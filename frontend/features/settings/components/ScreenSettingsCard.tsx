"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Monitor, Ruler } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/providers/AuthProvider"
import { LAB_SCREEN, loadScreenSettings, saveScreenSettings, type ScreenSettings } from "../screenSettings"

type Draft = Record<keyof ScreenSettings, string>

const toDraft = (screen: ScreenSettings): Draft => ({
  width_px: String(screen.width_px),
  height_px: String(screen.height_px),
  width_cm: screen.width_cm === null ? "" : String(screen.width_cm),
  height_cm: screen.height_cm === null ? "" : String(screen.height_cm),
})

function parseDraft(draft: Draft): ScreenSettings | string {
  const width = Number(draft.width_px)
  const height = Number(draft.height_px)
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0)
    return "La resolución debe ser un número entero de píxeles mayor que cero."
  const optional = (value: string) => (value.trim() === "" ? null : Number(value))
  const physical = {
    width_cm: optional(draft.width_cm),
    height_cm: optional(draft.height_cm),
  }
  if (Object.values(physical).some((value) => value !== null && (!Number.isFinite(value) || value <= 0)))
    return "Las medidas físicas deben ser positivas o quedar vacías."
  return { width_px: width, height_px: height, ...physical }
}

/** The one global setting: the screen every experiment is presented on. */
export function ScreenSettingsCard() {
  const { currentUser } = useAuth()
  const userId = currentUser?.id ?? ""
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const result = await loadScreenSettings(userId)
      setDraft(toDraft(result.screen))
      setConfirmed(result.confirmed)
    } catch {
      setLoadError("No se pudo cargar la configuración de pantalla.")
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const change = (key: keyof ScreenSettings, value: string) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
    setError(null)
    setNotice(null)
  }

  const save = async () => {
    if (!draft) return
    const screen = parseDraft(draft)
    if (typeof screen === "string") {
      setError(screen)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await saveScreenSettings(userId, screen)
      setDraft(toDraft(result.screen))
      setConfirmed(result.confirmed)
      setNotice("Configuración de pantalla guardada.")
    } catch (failure) {
      setError(failure instanceof Error ? `No se pudo guardar: ${failure.message}` : "No se pudo guardar.")
    } finally {
      setSaving(false)
    }
  }

  const measure = (key: keyof ScreenSettings, label: string, unit: string) => (
    <Label className="block space-y-1.5 text-sm">
      <span>{label}</span>
      <div className="relative">
        <Input
          type="number"
          min={key.endsWith("_px") ? 1 : 0.1}
          step={key.endsWith("_px") ? 1 : "any"}
          className="pr-10"
          value={draft?.[key] ?? ""}
          onChange={(event) => change(key, event.target.value)}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground"
        >
          {unit}
        </span>
      </div>
    </Label>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pantalla</CardTitle>
        <CardDescription>
          La pantalla donde se presentan los estímulos. Los proyectos nuevos parten de estos valores; en cada
          proyecto puedes cambiarlos si usaste otra.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loadError && (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>Reintentar</Button>
          </div>
        )}
        {!draft && !loadError && <p role="status" className="text-sm">Cargando configuración…</p>}
        {draft && (
          <fieldset disabled={saving} className="min-w-0 space-y-5">
            <legend className="sr-only">Configuración de pantalla</legend>
            {confirmed ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 aria-hidden className="size-4 text-emerald-600" />
                Configuración revisada.
              </p>
            ) : (
              <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
                Comprueba que estos valores correspondan a tu pantalla y guárdalos. Por defecto se usa la del
                laboratorio ({LAB_SCREEN.width_px}×{LAB_SCREEN.height_px} px).
              </p>
            )}
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <Monitor aria-hidden className="size-4" /> Monitor
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {measure("width_px", "Ancho (px)", "px")}
                {measure("height_px", "Alto (px)", "px")}
              </div>
            </section>
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <Ruler aria-hidden className="size-4" /> Medidas físicas (opcionales)
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {measure("width_cm", "Ancho (cm)", "cm")}
                {measure("height_cm", "Alto (cm)", "cm")}
              </div>
            </section>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {notice && <p role="status" className="text-sm">{notice}</p>}
            <Button onClick={() => void save()}>
              {saving ? "Guardando…" : "Guardar configuración de pantalla"}
            </Button>
          </fieldset>
        )}
      </CardContent>
    </Card>
  )
}
