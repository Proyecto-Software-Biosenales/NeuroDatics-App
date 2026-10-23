"use client"

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react"
import { orderParticipants, participantDisplay, type ParticipantLabels } from "../participantComparison/spec"
import { groupSeriesStyle, type GroupMode } from "./groupSupport"

export interface GroupParticipant {
  code: string
  label: string
  /** Position in the project's full, naturally ordered list: it fixes the colour. */
  index: number
  color: string
  dash: string | undefined
}

export interface GroupModeValue {
  /** True while «Superposición» or «Promedio» is chosen. */
  active: boolean
  mode: GroupMode | null
  projectId: string | null
  generation: number | null
  /** Every participant of the project, in natural order. */
  participants: GroupParticipant[]
  /** The chosen participants, in natural order. */
  selected: GroupParticipant[]
  selectedCodes: ReadonlySet<string>
  labels: ParticipantLabels
  setMode: (mode: GroupMode | null) => void
  setSelected: (codes: ReadonlySet<string>) => void
  /** Back to the individual view of the reference participant. */
  leave: () => void
  styleOf: (code: string) => GroupParticipant | undefined
}

const EMPTY: GroupModeValue = {
  active: false,
  mode: null,
  projectId: null,
  generation: null,
  participants: [],
  selected: [],
  selectedCodes: new Set(),
  labels: {},
  setMode: () => {},
  setSelected: () => {},
  leave: () => {},
  styleOf: () => undefined,
}

const GroupModeContext = createContext<GroupModeValue>(EMPTY)

export function useGroupMode(): GroupModeValue {
  return useContext(GroupModeContext)
}

/**
 * Group-mode state lives in the dashboard page (it decides what each view
 * renders); this provider turns it into ordered participants with stable
 * colours for every view below it.
 *
 * `selection` null means "every participant": the default, and it follows
 * the project's list as it loads.
 */
export function GroupModeProvider({
  projectId,
  generation,
  participantCodes,
  labels,
  mode,
  selection,
  onModeChange,
  onSelectionChange,
  children,
}: {
  projectId: string | null
  generation: number | null
  participantCodes: readonly string[]
  labels: ParticipantLabels
  mode: GroupMode | null
  selection: readonly string[] | null
  onModeChange: (mode: GroupMode | null) => void
  onSelectionChange: (codes: string[] | null) => void
  children: ReactNode
}) {
  const participants = useMemo<GroupParticipant[]>(
    () =>
      orderParticipants(participantCodes).map((code, index) => ({
        code,
        label: participantDisplay(code, labels),
        index,
        ...groupSeriesStyle(index),
      })),
    [labels, participantCodes]
  )
  const selectedCodes = useMemo<ReadonlySet<string>>(
    () => new Set(selection == null ? participants.map((item) => item.code) : selection),
    [participants, selection]
  )
  const selected = useMemo(() => participants.filter((item) => selectedCodes.has(item.code)), [participants, selectedCodes])
  const byCode = useMemo(() => new Map(participants.map((item) => [item.code, item])), [participants])

  const setSelected = useCallback(
    (codes: ReadonlySet<string>) => {
      const all = participants.length > 0 && participants.every((item) => codes.has(item.code))
      onSelectionChange(all ? null : participants.filter((item) => codes.has(item.code)).map((item) => item.code))
    },
    [onSelectionChange, participants]
  )
  const leave = useCallback(() => onModeChange(null), [onModeChange])
  const styleOf = useCallback((code: string) => byCode.get(code), [byCode])

  const value = useMemo<GroupModeValue>(
    () => ({
      active: mode != null && projectId != null,
      mode,
      projectId,
      generation,
      participants,
      selected,
      selectedCodes,
      labels,
      setMode: onModeChange,
      setSelected,
      leave,
      styleOf,
    }),
    [generation, labels, leave, mode, onModeChange, participants, projectId, selected, selectedCodes, setSelected, styleOf]
  )

  return <GroupModeContext.Provider value={value}>{children}</GroupModeContext.Provider>
}
