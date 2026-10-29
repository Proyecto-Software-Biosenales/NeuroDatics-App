"use client"

import { SelectGroup, SelectItem, SelectLabel, SelectSeparator } from "@/components/ui/select"
import { ParticipantSelector } from "../participantComparison/ParticipantSelector"
import { useGroupMode } from "./GroupModeProvider"
import { GROUP_MODE_LABELS, type GroupMode } from "./groupSupport"

/**
 * Values of the group options in the participant select. Participant codes
 * are trimmed, non-empty strings from the data; none starts with a space, so
 * these can never collide with one.
 */
export const GROUP_SELECT_VALUES: Record<GroupMode, string> = {
  overlay: " grupo:superposicion",
  average: " grupo:promedio",
}

export function groupModeFromSelectValue(value: string): GroupMode | null {
  if (value === GROUP_SELECT_VALUES.overlay) return "overlay"
  if (value === GROUP_SELECT_VALUES.average) return "average"
  return null
}

const OPTION_HINTS: Record<GroupMode, string> = {
  overlay: "Una sola gráfica con todos los participantes elegidos, cada uno con su color.",
  average: "La gráfica media de los participantes elegidos; sus cifras son el promedio de las de cada uno.",
}

/** «Varios participantes»: the group modes the open view offers, at the end of the participant select. */
export function GroupModeSelectItems() {
  const group = useGroupMode()
  if (group.participants.length < 2 || group.modes.length === 0) return null
  return (
    <>
      <SelectSeparator />
      <SelectGroup>
        <SelectLabel>Varios participantes</SelectLabel>
        {group.modes.map((mode) => (
          <SelectItem key={mode} value={GROUP_SELECT_VALUES[mode]} title={OPTION_HINTS[mode]}>
            {GROUP_MODE_LABELS[mode]}
          </SelectItem>
        ))}
      </SelectGroup>
    </>
  )
}

/** «Participantes n/N» beside the select while a group mode is on. */
export function GroupParticipantsPicker() {
  const group = useGroupMode()
  if (!group.active) return null
  return (
    <ParticipantSelector
      participants={group.participants.map((item) => item.code)}
      labels={group.labels}
      selected={group.selectedCodes}
      sourceParticipant={null}
      onChange={group.setSelected}
      size="default"
      className="shrink-0 bg-background"
      colorOf={(code) => group.styleOf(code)?.color}
    />
  )
}
