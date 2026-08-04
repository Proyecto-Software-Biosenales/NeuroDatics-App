"use client"

import { useState } from "react"
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import {
  VISUALIZATION_GROUPS,
  VISUALIZATION_REGISTRY,
  type VisualizationId,
} from "./registry"

interface VisualizationSelectorProps {
  appliedIds: VisualizationId[]
  availableIds: VisualizationId[]
  onApply: (ids: VisualizationId[]) => void
}

function ordered(ids: Set<VisualizationId>) {
  return VISUALIZATION_REGISTRY.filter((item) => ids.has(item.id)).map(
    (item) => item.id
  )
}

export function VisualizationSelector({
  appliedIds,
  availableIds,
  onApply,
}: VisualizationSelectorProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Set<VisualizationId>>(
    () => new Set(appliedIds)
  )
  const available = new Set(availableIds)
  const applied = new Set(appliedIds)
  const hasChanges =
    draft.size !== applied.size ||
    Array.from(draft).some((id) => !applied.has(id))

  const handleOpenChange = (nextOpen: boolean) => {
    setDraft(new Set(appliedIds))
    setOpen(nextOpen)
  }

  const toggle = (id: VisualizationId, checked: boolean) => {
    if (!available.has(id)) return
    setDraft((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const apply = () => {
    if (!hasChanges) return
    onApply(ordered(draft))
    setOpen(false)
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-w-[210px] justify-between bg-card"
        >
          <span className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            <span className="truncate">Gráficas a comparar</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground tabular-nums">
              {open ? draft.size : appliedIds.length}
            </span>
          </span>
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          />
        </Button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          avoidCollisions
          sticky="always"
          aria-label="Seleccionar gráficas a comparar"
          className="z-50 flex max-h-[var(--radix-popover-content-available-height)] w-[min(360px,var(--radix-popover-content-available-width))] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl outline-none"
        >
          <div className="shrink-0 border-b border-border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Visualizaciones</p>
              <span
                aria-live="polite"
                className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums"
              >
                {draft.size} {draft.size === 1 ? "selección" : "selecciones"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Los cambios se muestran al aplicar la selección.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {VISUALIZATION_GROUPS.map((group) => (
              <section
                key={group.id}
                aria-labelledby={`comparison-group-${group.id}`}
              >
                <p
                  id={`comparison-group-${group.id}`}
                  className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
                >
                  {group.label}
                </p>
                {VISUALIZATION_REGISTRY.filter(
                  (item) => item.group === group.id
                ).map((item) => {
                  const enabled = available.has(item.id)
                  const checked = draft.has(item.id)
                  return (
                    <label
                      key={item.id}
                      className={cn(
                        "flex items-start gap-3 rounded-lg px-2 py-2",
                        enabled
                          ? "cursor-pointer hover:bg-muted/70"
                          : "cursor-not-allowed opacity-45"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={!enabled}
                        onCheckedChange={(value) =>
                          toggle(item.id, value === true)
                        }
                        aria-label={item.label}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <item.Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {item.label}
                        </span>
                        {!enabled ? (
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            Sensor no disponible en este proyecto
                          </span>
                        ) : null}
                      </span>
                    </label>
                  )
                })}
              </section>
            ))}
          </div>

          <div className="grid shrink-0 gap-2 border-t border-border bg-muted/25 p-3 sm:grid-cols-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDraft(new Set(availableIds))}
              className="w-full"
            >
              Seleccionar disponibles
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDraft(new Set())}
              className="w-full"
            >
              Limpiar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={apply}
              disabled={!hasChanges}
              className="w-full sm:col-span-2"
            >
              <Check className="h-3.5 w-3.5" />
              Aplicar selección
            </Button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
