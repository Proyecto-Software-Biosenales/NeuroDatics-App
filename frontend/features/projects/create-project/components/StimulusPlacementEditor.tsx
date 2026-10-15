"use client"

import { useState } from "react"
import { AlertCircle, Check, ChevronDown, Copy, Monitor } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FieldHint } from "@/components/FieldHint"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useScreenSettings } from "@/features/settings/screenSettings"
import type { FixationScreenGeometryInput } from "../types"
import {
  describeStimulusPlacementIssue,
  type StimulusPlacementDraft,
} from "../stimulusPlacement"

interface StimulusPlacementEditorProps {
  placements: StimulusPlacementDraft[]
  fixationGeometry?: FixationScreenGeometryInput
  disabled?: boolean
  onChange: (sourceEntryPath: string, update: Partial<StimulusPlacementDraft>) => void
}

type DisplayMode = StimulusPlacementDraft["displayMode"]

const displayModes: Array<{ value: DisplayMode; label: string; hint: string }> = [
  {
    value: "contain",
    label: "Completo",
    hint: "El estímulo se mostró completo, con márgenes alrededor.",
  },
  {
    value: "cover",
    label: "Cubre",
    hint: "El estímulo cubrió toda la región visible y se recortó por los bordes.",
  },
  {
    value: "crop",
    label: "Recorte",
    hint: "Solo se mostró una región recortada del estímulo.",
  },
  {
    value: "fullscreen",
    label: "Pantalla completa",
    hint: "El estímulo ocupó exactamente toda la pantalla. Las medidas se rellenan solas.",
  },
]

const stimulusFields: Array<{
  key: keyof StimulusPlacementDraft
  label: string
  positive?: boolean
}> = [
  { key: "stimulusLeftPx", label: "X (izquierda)" },
  { key: "stimulusTopPx", label: "Y (arriba)" },
  { key: "stimulusWidthPx", label: "Ancho", positive: true },
  { key: "stimulusHeightPx", label: "Alto", positive: true },
]

const viewportFields: Array<{
  key: keyof StimulusPlacementDraft
  label: string
  nonNegative?: boolean
  positive?: boolean
}> = [
  { key: "viewportLeftPx", label: "X (izquierda)", nonNegative: true },
  { key: "viewportTopPx", label: "Y (arriba)", nonNegative: true },
  { key: "viewportWidthPx", label: "Ancho", positive: true },
  { key: "viewportHeightPx", label: "Alto", positive: true },
  { key: "scrollXPx", label: "Desplazamiento X", nonNegative: true },
  { key: "scrollYPx", label: "Desplazamiento Y", nonNegative: true },
]

const num = (value: string | undefined): number | null => {
  if (!value || value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const slug = (path: string) =>
  path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase()

const splitPath = (path: string) => {
  const cut = path.lastIndexOf("/")
  return { folder: cut >= 0 ? path.slice(0, cut + 1) : "", name: path.slice(cut + 1) }
}

/** Compact schematic of screen / visible region / stimulus so the numbers read at a glance. */
const PlacementPreview = ({ placement }: { placement: StimulusPlacementDraft }) => {
  const screenWidth = num(placement.screenWidthPx)
  const screenHeight = num(placement.screenHeightPx)
  const left = num(placement.stimulusLeftPx)
  const top = num(placement.stimulusTopPx)
  const width = num(placement.stimulusWidthPx)
  const height = num(placement.stimulusHeightPx)

  if (!screenWidth || !screenHeight || screenWidth <= 0 || screenHeight <= 0) {
    return (
      <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-border px-3 text-center text-xs text-muted-foreground">
        Indica el tamaño de la pantalla para ver el esquema.
      </div>
    )
  }

  const viewport = placement.viewportEnabled
    ? {
        left: num(placement.viewportLeftPx) ?? 0,
        top: num(placement.viewportTopPx) ?? 0,
        width: num(placement.viewportWidthPx) ?? screenWidth,
        height: num(placement.viewportHeightPx) ?? screenHeight,
      }
    : null

  const hasStimulus = left !== null && top !== null && !!width && !!height && width > 0 && height > 0

  return (
    <figure className="space-y-1">
      <svg
        viewBox={`0 0 ${screenWidth} ${screenHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full rounded-lg border border-border bg-background"
        role="img"
        aria-label={`Esquema de la pantalla de ${screenWidth} por ${screenHeight} píxeles${
          hasStimulus ? ` con el estímulo en ${left}, ${top} y tamaño ${width} por ${height}` : ""
        }`}
      >
        <rect x={0} y={0} width={screenWidth} height={screenHeight} className="fill-muted" />
        {viewport && (
          <rect
            x={viewport.left}
            y={viewport.top}
            width={Math.max(viewport.width, 0)}
            height={Math.max(viewport.height, 0)}
            className="fill-background stroke-muted-foreground/60"
            strokeDasharray="4 3"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {hasStimulus && (
          <rect
            x={left}
            y={top}
            width={width}
            height={height}
            className="fill-primary/25 stroke-primary"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <figcaption className="text-[11px] leading-tight text-muted-foreground">
        Pantalla {screenWidth}×{screenHeight}
        {viewport ? " · región visible en trazo discontinuo" : ""}
      </figcaption>
    </figure>
  )
}

export const StimulusPlacementEditor = ({
  placements,
  fixationGeometry,
  disabled = false,
  onChange,
}: StimulusPlacementEditorProps) => {
  const [sectionOpen, setSectionOpen] = useState(() => placements.some((p) => p.enabled))
  const [openPath, setOpenPath] = useState<string | null>(null)
  const globalScreen = useScreenSettings()?.screen

  if (placements.length === 0) return null

  const enabledCount = placements.filter((placement) => placement.enabled).length
  const issues = new Map(
    placements.map((placement) => [placement.sourceEntryPath, describeStimulusPlacementIssue(placement)]),
  )
  const incompleteCount = placements.filter(
    (placement) => placement.enabled && issues.get(placement.sourceEntryPath),
  ).length

  // The acquisition screen is one physical screen, so it is edited once and mirrored
  // into every draft instead of asking for it file by file.
  const sharedScreenWidth =
    placements.find((placement) => placement.screenWidthPx)?.screenWidthPx ?? ""
  const sharedScreenHeight =
    placements.find((placement) => placement.screenHeightPx)?.screenHeightPx ?? ""
  const geometryWidth = fixationGeometry?.widthPx ?? ""
  const geometryHeight = fixationGeometry?.heightPx ?? ""
  const canCopyGeometry =
    !!geometryWidth && !!geometryHeight &&
    (geometryWidth !== sharedScreenWidth || geometryHeight !== sharedScreenHeight)
  // A screen not typed yet starts from the other screen typed in Step 1, else from Configuración.
  const startWidth = geometryWidth || (globalScreen ? String(globalScreen.width_px) : "")
  const startHeight = geometryHeight || (globalScreen ? String(globalScreen.height_px) : "")

  const applyScreenSize = (width: string, height: string) => {
    placements.forEach((placement) => {
      const update: Partial<StimulusPlacementDraft> = {
        screenWidthPx: width,
        screenHeightPx: height,
      }
      if (placement.displayMode === "fullscreen") {
        Object.assign(update, {
          stimulusLeftPx: "0",
          stimulusTopPx: "0",
          stimulusWidthPx: width,
          stimulusHeightPx: height,
        })
      }
      onChange(placement.sourceEntryPath, update)
    })
  }

  const togglePlacement = (placement: StimulusPlacementDraft, enabled: boolean) => {
    if (enabled && !sharedScreenWidth && !sharedScreenHeight && startWidth && startHeight) {
      applyScreenSize(startWidth, startHeight)
    }
    onChange(placement.sourceEntryPath, { enabled })
    setOpenPath(enabled ? placement.sourceEntryPath : null)
  }

  const toggleAll = (enabled: boolean) => {
    if (enabled && !sharedScreenWidth && !sharedScreenHeight && startWidth && startHeight) {
      applyScreenSize(startWidth, startHeight)
    }
    placements.forEach((placement) => onChange(placement.sourceEntryPath, { enabled }))
    setOpenPath(enabled ? placements[0]?.sourceEntryPath ?? null : null)
  }

  const changeMode = (placement: StimulusPlacementDraft, displayMode: DisplayMode) => {
    const update: Partial<StimulusPlacementDraft> = { displayMode }
    const screenWidth = placement.screenWidthPx || sharedScreenWidth
    const screenHeight = placement.screenHeightPx || sharedScreenHeight
    if (displayMode === "fullscreen") {
      Object.assign(update, {
        stimulusLeftPx: "0",
        stimulusTopPx: "0",
        stimulusWidthPx: screenWidth,
        stimulusHeightPx: screenHeight,
        viewportEnabled: false,
      })
    } else if (displayMode === "cover" || displayMode === "crop") {
      Object.assign(update, {
        viewportEnabled: true,
        viewportLeftPx: placement.viewportLeftPx || "0",
        viewportTopPx: placement.viewportTopPx || "0",
        viewportWidthPx: placement.viewportWidthPx || screenWidth,
        viewportHeightPx: placement.viewportHeightPx || screenHeight,
      })
    }
    onChange(placement.sourceEntryPath, update)
  }

  const centerStimulus = (placement: StimulusPlacementDraft) => {
    const screenWidth = num(placement.screenWidthPx)
    const screenHeight = num(placement.screenHeightPx)
    const width = num(placement.stimulusWidthPx)
    const height = num(placement.stimulusHeightPx)
    if (!screenWidth || !screenHeight || !width || !height) return
    onChange(placement.sourceEntryPath, {
      stimulusLeftPx: String(Math.round((screenWidth - width) / 2)),
      stimulusTopPx: String(Math.round((screenHeight - height) / 2)),
    })
  }

  const copyToOthers = (source: StimulusPlacementDraft) => {
    const geometry: Partial<StimulusPlacementDraft> = {
      enabled: true,
      displayMode: source.displayMode,
      screenWidthPx: source.screenWidthPx,
      screenHeightPx: source.screenHeightPx,
      stimulusLeftPx: source.stimulusLeftPx,
      stimulusTopPx: source.stimulusTopPx,
      stimulusWidthPx: source.stimulusWidthPx,
      stimulusHeightPx: source.stimulusHeightPx,
      viewportEnabled: source.viewportEnabled,
      viewportLeftPx: source.viewportLeftPx,
      viewportTopPx: source.viewportTopPx,
      viewportWidthPx: source.viewportWidthPx,
      viewportHeightPx: source.viewportHeightPx,
      scrollXPx: source.scrollXPx,
      scrollYPx: source.scrollYPx,
    }
    placements
      .filter((placement) => placement.sourceEntryPath !== source.sourceEntryPath)
      .forEach((placement) => onChange(placement.sourceEntryPath, geometry))
  }

  const summary = (placement: StimulusPlacementDraft) => {
    if (!placement.enabled) return "Sin registrar"
    const mode = displayModes.find((option) => option.value === placement.displayMode)?.label ?? ""
    const width = num(placement.stimulusWidthPx)
    const height = num(placement.stimulusHeightPx)
    if (!width || !height) return mode
    return `${mode} · ${width}×${height}`
  }

  return (
    <Collapsible
      open={sectionOpen}
      onOpenChange={setSectionOpen}
      className="rounded-xl border border-border bg-muted/30"
      asChild
    >
      <section>
        <CollapsibleTrigger className="flex w-full min-w-0 items-center gap-3 p-3 text-left">
          <span className="shrink-0 rounded-lg bg-background p-1.5 text-muted-foreground">
            <Monitor size={16} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">
              Ubicación del estímulo en pantalla
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {enabledCount === 0
                ? `${placements.length} archivo(s) sin geometría registrada`
                : `${enabledCount} de ${placements.length} archivo(s) con geometría registrada`}
            </span>
          </span>
          {incompleteCount > 0 ? (
            <Badge variant="destructive" className="shrink-0">
              <AlertCircle aria-hidden />
              {incompleteCount} incompleto{incompleteCount > 1 ? "s" : ""}
            </Badge>
          ) : enabledCount > 0 ? (
            <Badge variant="outline" className="shrink-0">
              <Check aria-hidden />
              Listo
            </Badge>
          ) : (
            <Badge variant="ghost" className="shrink-0 text-muted-foreground">
              Opcional
            </Badge>
          )}
          <ChevronDown
            size={16}
            aria-hidden
            className={cn(
              "shrink-0 text-muted-foreground transition-transform",
              sectionOpen && "rotate-180",
            )}
          />
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3 border-t border-border p-3">
          <div className="space-y-2 rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs font-medium text-foreground">
                  Pantalla de la adquisición (px)
                </Label>
                <FieldHint>Se aplica a todos los archivos del experimento.</FieldHint>
              </div>
              {canCopyGeometry && !disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => applyScreenSize(geometryWidth, geometryHeight)}
                >
                  Usar {geometryWidth}×{geometryHeight} de la otra pantalla
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="placement-screen-width"
                type="number"
                min="1"
                step="1"
                placeholder={startWidth || "1280"}
                aria-label="Ancho de la pantalla en píxeles"
                value={sharedScreenWidth}
                onChange={(event) => applyScreenSize(event.target.value, sharedScreenHeight)}
                disabled={disabled}
              />
              <span className="text-sm text-muted-foreground">×</span>
              <Input
                id="placement-screen-height"
                type="number"
                min="1"
                step="1"
                placeholder={startHeight || "1024"}
                aria-label="Alto de la pantalla en píxeles"
                value={sharedScreenHeight}
                onChange={(event) => applyScreenSize(sharedScreenWidth, event.target.value)}
                disabled={disabled}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Checkbox
                id="placement-toggle-all"
                checked={enabledCount === placements.length}
                onCheckedChange={(checked) => toggleAll(checked === true)}
                disabled={disabled}
              />
              <Label
                htmlFor="placement-toggle-all"
                className="cursor-pointer text-xs font-medium text-foreground"
              >
                Registrar todos los archivos
              </Label>
              <FieldHint>
                Registra cómo se mostró cada imagen o vídeo durante la adquisición. Si lo omites, los
                resultados de mirada mostrarán una advertencia.
              </FieldHint>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {enabledCount}/{placements.length}
              </span>
            </div>

            <ul className="divide-y divide-border">
              {placements.map((placement, index) => {
                const id = `${index}-${slug(placement.sourceEntryPath)}`
                const { folder, name } = splitPath(placement.sourceEntryPath)
                const isOpen = openPath === placement.sourceEntryPath
                const issue = issues.get(placement.sourceEntryPath) ?? null
                const fullscreen = placement.displayMode === "fullscreen"

                return (
                  <li key={placement.sourceEntryPath}>
                    <Collapsible
                      open={placement.enabled && isOpen}
                      onOpenChange={(open) => {
                        if (open && !placement.enabled) {
                          if (!disabled) togglePlacement(placement, true)
                          return
                        }
                        setOpenPath(open ? placement.sourceEntryPath : null)
                      }}
                    >
                      <div className="flex items-center gap-2 px-3 py-1.5">
                        <Checkbox
                          id={`placement-${id}`}
                          checked={placement.enabled}
                          onCheckedChange={(checked) => togglePlacement(placement, checked === true)}
                          disabled={disabled}
                          aria-label={`Registrar la ubicación de ${placement.sourceEntryPath}`}
                        />
                        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left">
                          <span
                            className="min-w-0 flex-1 truncate text-sm"
                            title={placement.sourceEntryPath}
                          >
                            <span className="text-muted-foreground">{folder}</span>
                            <span className="text-foreground">{name}</span>
                          </span>
                          <span
                            className={cn(
                              "shrink-0 text-[11px]",
                              issue ? "text-destructive" : "text-muted-foreground",
                            )}
                          >
                            {issue ? "Incompleto" : summary(placement)}
                          </span>
                          {placement.enabled && (
                            <ChevronDown
                              size={14}
                              aria-hidden
                              className={cn(
                                "shrink-0 text-muted-foreground transition-transform",
                                isOpen && "rotate-180",
                              )}
                            />
                          )}
                        </CollapsibleTrigger>
                      </div>

                      <CollapsibleContent className="space-y-3 border-t border-border bg-muted/30 px-3 py-3">
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,170px)]">
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <Label htmlFor={`placement-mode-${id}`} className="text-xs">
                                  ¿Cómo se mostró?
                                </Label>
                                <FieldHint>
                                  {displayModes.map((option) => (
                                    <span key={option.value} className="block">
                                      <span className="font-medium">{option.label}:</span> {option.hint}
                                    </span>
                                  ))}
                                </FieldHint>
                              </div>
                              <Select
                                value={placement.displayMode}
                                onValueChange={(value) => changeMode(placement, value as DisplayMode)}
                                disabled={disabled}
                              >
                                <SelectTrigger id={`placement-mode-${id}`} className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {displayModes.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {!fullscreen && (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <Label className="text-xs">Rectángulo mostrado (px)</Label>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => centerStimulus(placement)}
                                    disabled={disabled}
                                  >
                                    Centrar
                                  </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  {stimulusFields.map((field) => (
                                    <div key={field.key} className="space-y-1">
                                      <Label
                                        htmlFor={`placement-${field.key}-${id}`}
                                        className="text-[11px] text-muted-foreground"
                                      >
                                        {field.label}
                                      </Label>
                                      <Input
                                        id={`placement-${field.key}-${id}`}
                                        type="number"
                                        min={field.positive ? "0.000001" : undefined}
                                        step="any"
                                        value={String(placement[field.key] ?? "")}
                                        onChange={(event) =>
                                          onChange(placement.sourceEntryPath, {
                                            [field.key]: event.target.value,
                                          } as Partial<StimulusPlacementDraft>)
                                        }
                                        disabled={disabled}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <PlacementPreview placement={placement} />
                        </div>

                        {!fullscreen && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`placement-viewport-${id}`}
                                checked={placement.viewportEnabled}
                                onCheckedChange={(checked) =>
                                  onChange(placement.sourceEntryPath, {
                                    viewportEnabled: checked === true,
                                  })
                                }
                                disabled={
                                  disabled ||
                                  placement.displayMode === "cover" ||
                                  placement.displayMode === "crop"
                                }
                              />
                              <Label
                                htmlFor={`placement-viewport-${id}`}
                                className="cursor-pointer text-xs leading-tight"
                              >
                                Se mostró dentro de una región con desplazamiento
                              </Label>
                              <FieldHint>El origen del estímulo ya incluye el desplazamiento.</FieldHint>
                            </div>

                            {placement.viewportEnabled && (
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {viewportFields.map((field) => (
                                  <div key={field.key} className="space-y-1">
                                    <Label
                                      htmlFor={`placement-${field.key}-${id}`}
                                      className="text-[11px] text-muted-foreground"
                                    >
                                      {field.label}
                                    </Label>
                                    <Input
                                      id={`placement-${field.key}-${id}`}
                                      type="number"
                                      min={
                                        field.positive
                                          ? "0.000001"
                                          : field.nonNegative
                                            ? "0"
                                            : undefined
                                      }
                                      step="any"
                                      value={String(placement[field.key] ?? "")}
                                      onChange={(event) =>
                                        onChange(placement.sourceEntryPath, {
                                          [field.key]: event.target.value,
                                        } as Partial<StimulusPlacementDraft>)
                                      }
                                      disabled={disabled}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {issue && (
                          <p className="flex items-start gap-1.5 text-xs text-destructive">
                            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
                            {issue}
                          </p>
                        )}

                        {placements.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => copyToOthers(placement)}
                            disabled={disabled}
                          >
                            <Copy aria-hidden />
                            Aplicar a los otros {placements.length - 1} archivo(s)
                          </Button>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  </li>
                )
              })}
            </ul>
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}
