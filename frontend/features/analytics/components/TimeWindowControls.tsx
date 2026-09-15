"use client"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export type TimeWindow = {
  start: number | null
  end: number | null
}

export type TimeWindowDraft = {
  start: string
  end: string
}

export const EMPTY_TIME_WINDOW: TimeWindow = { start: null, end: null }
export const EMPTY_TIME_WINDOW_DRAFT: TimeWindowDraft = { start: "", end: "" }

export function parseTimeWindowValue(value: string): number | null {
  const trimmed = value.trim().replace(",", ".")
  if (!trimmed) return null

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function formatWindowBound(value: number | null, fallback: string) {
  return value == null ? fallback : `${value.toFixed(2)} s`
}

export function validateTimeWindowDraft(draft: TimeWindowDraft): { window: TimeWindow | null; error: string | null } {
  const start = parseTimeWindowValue(draft.start)
  const end = parseTimeWindowValue(draft.end)

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { window: null, error: "Usa valores numéricos válidos para la ventana temporal." }
  }

  if ((start != null && start < 0) || (end != null && end < 0)) {
    return { window: null, error: "Los segundos deben ser mayores o iguales a 0." }
  }

  if (start != null && end != null && end <= start) {
    return { window: null, error: "El segundo final debe ser mayor que el segundo inicial." }
  }

  return {
    window: {
      start: start == null ? null : Number(start.toFixed(4)),
      end: end == null ? null : Number(end.toFixed(4)),
    },
    error: null,
  }
}

export function TimeWindowControls({
  draftStart,
  draftEnd,
  appliedWindow,
  error,
  loading,
  onDraftStartChange,
  onDraftEndChange,
  onApply,
  onReset,
}: {
  draftStart: string
  draftEnd: string
  appliedWindow: TimeWindow
  error: string | null
  loading?: boolean
  onDraftStartChange: (value: string) => void
  onDraftEndChange: (value: string) => void
  onApply: () => void
  onReset: () => void
}) {
  const hasWindow = appliedWindow.start != null || appliedWindow.end != null

  return (
    <div className="mb-5 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Label className="block space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Inicio
            </span>
            <Input
              type="number"
              min={0}
              step="0.1"
              value={draftStart}
              onChange={(event) => onDraftStartChange(event.target.value)}
              placeholder="20"
              className="h-9 w-28"
            />
          </Label>

          <Label className="block space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Fin
            </span>
            <Input
              type="number"
              min={0}
              step="0.1"
              value={draftEnd}
              onChange={(event) => onDraftEndChange(event.target.value)}
              placeholder="25"
              className="h-9 w-28"
            />
          </Label>

          <div className="flex items-center gap-2">
            <Button size="lg"
              type="button"
              onClick={onApply}
              disabled={loading}
            >
              Aplicar
            </Button>
            <Button variant="outline" size="lg"
              type="button"
              onClick={onReset}
              disabled={loading || !hasWindow}
            >
              Restablecer
            </Button>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">
            {hasWindow ? "Ventana activa" : "Todo el experimento"}
          </span>
          {hasWindow ? (
            <span>
              {" "}
              {formatWindowBound(appliedWindow.start, "inicio")} - {formatWindowBound(appliedWindow.end, "fin")}
            </span>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-2 text-sm font-medium text-destructive">{error}</p> : null}
    </div>
  )
}
