"use client"

import { useId, useMemo, useState } from "react"
import { ChevronDown, Search, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { filterParticipants, participantDisplay, type ParticipantLabels } from "./spec"

export function ParticipantSelector({
  participants,
  labels,
  selected,
  sourceParticipant,
  onChange,
  size = "sm",
  className,
  colorOf,
}: {
  participants: string[]
  /** Visible text by code (name or document). */
  labels?: ParticipantLabels
  selected: ReadonlySet<string>
  sourceParticipant: string | null
  onChange: (next: Set<string>) => void
  /** The filters bar uses the default size, level with its selects. */
  size?: "sm" | "default"
  className?: string
  /** A colour swatch per participant, when the chart draws one colour each. */
  colorOf?: (code: string) => string | undefined
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const searchId = useId()
  const listId = useId()
  const visible = useMemo(() => filterParticipants(participants, query, labels), [participants, query, labels])
  const filtering = query.trim().length > 0

  const toggle = (code: string, checked: boolean) => {
    const next = new Set(selected)
    if (checked) next.add(code)
    else next.delete(code)
    onChange(next)
  }

  // With a search, both actions apply to the matching participants only.
  const selectAll = () => onChange(new Set([...selected, ...(filtering ? visible : participants)]))
  const clearSelection = () => {
    if (!filtering) {
      onChange(new Set())
      return
    }
    const next = new Set(selected)
    for (const code of visible) next.delete(code)
    onChange(next)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size={size} className={cn("gap-2 bg-card", className)} aria-label={`Participantes: ${selected.size} de ${participants.length} seleccionados`}>
          <Users aria-hidden="true" />
          Participantes
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground tabular-nums">
            {selected.size}/{participants.length}
          </span>
          <ChevronDown aria-hidden="true" className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={16}
        aria-label="Seleccionar participantes"
        className="flex max-h-[min(28rem,var(--radix-popover-content-available-height))] w-[min(22rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0"
      >
        <div className="space-y-2 border-b border-border p-3">
          <Label htmlFor={searchId} className="sr-only">
            Buscar participante
          </Label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre o documento"
              aria-controls={listId}
              className="pl-8"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="xs" variant="outline" onClick={selectAll} title={filtering ? "Selecciona los participantes que coinciden con la búsqueda" : undefined}>
              Seleccionar todos
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={clearSelection} title={filtering ? "Quita los participantes que coinciden con la búsqueda" : undefined}>
              Quitar selección
            </Button>
            <span aria-live="polite" className="ml-auto text-xs text-muted-foreground tabular-nums" data-testid="participant-selection-count">
              {selected.size} de {participants.length} seleccionados
            </span>
          </div>
        </div>
        <div id={listId} role="group" aria-label="Participantes" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
          {visible.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">Ningún participante coincide con la búsqueda.</p>
          ) : (
            visible.map((code) => (
              <Label key={code} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-normal hover:bg-muted/70">
                <Checkbox checked={selected.has(code)} onCheckedChange={(value) => toggle(code, value === true)} aria-label={participantDisplay(code, labels)} />
                {colorOf?.(code) ? (
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(code) }} />
                ) : null}
                <span className="min-w-0 flex-1 truncate" title={participantDisplay(code, labels)}>{participantDisplay(code, labels)}</span>
                {code === sourceParticipant ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">Vista de origen</span>
                ) : null}
              </Label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
