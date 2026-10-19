"use client"

import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"
import { LoaderCircle } from "lucide-react"
import type { ParticipantComparisonSpec } from "./spec"

interface ComparisonContextValue {
  /** False outside the dashboard: the button renders nothing there. */
  available: boolean
  /** True inside the dialog, so a card can never open a nested comparison. */
  nested: boolean
  participantCount: number
  open: (spec: ParticipantComparisonSpec, trigger: HTMLElement | null) => void
  /** The open view's spec, offered by the button in the filters bar. */
  barSpec: BarSpec | null
  setBarSpec: Dispatch<SetStateAction<BarSpec | null>>
}

interface BarSpec {
  read: () => ParticipantComparisonSpec
}

const ComparisonContext = createContext<ComparisonContextValue>({
  available: false,
  nested: false,
  participantCount: 0,
  open: () => {},
  barSpec: null,
  setBarSpec: () => {},
})

// The dialog, its renderers and its queue load on the first click only.
const ParticipantComparisonDialog = lazy(() => import("./ParticipantComparisonDialog"))

export function useParticipantComparison() {
  return useContext(ComparisonContext)
}

/**
 * Offers this view's chart to "Comparar participantes" in the filters bar for
 * as long as the view is mounted. The spec is read at click time, so it always
 * carries the view's live filters. Inside the dialog it does nothing.
 */
export function useCompareParticipantsSpec(spec: (() => ParticipantComparisonSpec) | null) {
  const { nested, setBarSpec } = useContext(ComparisonContext)
  const latest = useRef(spec)
  useEffect(() => {
    latest.current = spec
  })
  const offered = spec != null && !nested
  useEffect(() => {
    if (!offered) return
    const entry: BarSpec = { read: () => latest.current!() }
    setBarSpec(entry)
    return () => setBarSpec((current) => (current === entry ? null : current))
  }, [offered, setBarSpec])
}

interface OpenSession {
  id: number
  spec: ParticipantComparisonSpec
  trigger: HTMLElement | null
  /** Scroll offsets of the trigger's scrollable ancestors, restored on close. */
  scroll: Array<{ element: Element; top: number; left: number }>
}

function scrollSnapshot(trigger: HTMLElement | null) {
  const snapshot: OpenSession["scroll"] = []
  const candidates = new Set<Element>()
  for (let element = trigger?.parentElement ?? null; element; element = element.parentElement) {
    candidates.add(element)
  }
  // The filters-bar trigger sits outside the scrolling dashboard, which must come back too.
  document.querySelectorAll("main").forEach((element) => candidates.add(element))
  for (const element of candidates) {
    if (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) {
      snapshot.push({ element, top: element.scrollTop, left: element.scrollLeft })
    }
  }
  const root = document.scrollingElement
  if (root) snapshot.push({ element: root, top: root.scrollTop, left: root.scrollLeft })
  return snapshot
}

export function ParticipantComparisonProvider({
  projectId,
  participantCodes,
  participantLabels,
  generation,
  children,
}: {
  projectId: string | null
  participantCodes: string[]
  /** Display text by participant code; codes without an entry show "Participante <code>". */
  participantLabels?: Readonly<Record<string, string>>
  generation: number | null
  children: ReactNode
}) {
  const [session, setSession] = useState<OpenSession | null>(null)
  const nextId = useRef(0)
  // A different project is a different context: never keep its dialog open.
  const [sessionProject, setSessionProject] = useState(projectId)
  if (sessionProject !== projectId) {
    setSessionProject(projectId)
    setSession(null)
  }

  const open = useCallback((spec: ParticipantComparisonSpec, trigger: HTMLElement | null) => {
    nextId.current += 1
    setSession({ id: nextId.current, spec, trigger, scroll: scrollSnapshot(trigger) })
  }, [])

  const close = useCallback(() => setSession(null), [])
  const [barSpec, setBarSpec] = useState<BarSpec | null>(null)

  const value = useMemo<ComparisonContextValue>(
    () => ({
      available: Boolean(projectId),
      nested: false,
      participantCount: participantCodes.length,
      open,
      barSpec,
      setBarSpec,
    }),
    [barSpec, open, participantCodes.length, projectId]
  )

  return (
    <ComparisonContext.Provider value={value}>
      {children}
      {session && projectId ? (
        <Suspense
          fallback={
            <div
              role="status"
              className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 text-sm text-muted-foreground"
            >
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Abriendo comparación…
            </div>
          }
        >
          <ParticipantComparisonDialog
            key={session.id}
            projectId={projectId}
            generation={generation}
            participantCodes={participantCodes}
            participantLabels={participantLabels}
            spec={session.spec}
            returnFocus={session.trigger}
            scrollSnapshot={session.scroll}
            onClose={close}
          />
        </Suspense>
      ) : null}
    </ComparisonContext.Provider>
  )
}

/** Wraps dialog content: any comparison button inside renders nothing. */
export function NestedComparisonBoundary({ children }: { children: ReactNode }) {
  const parent = useContext(ComparisonContext)
  const value = useMemo(() => ({ ...parent, nested: true }), [parent])
  return <ComparisonContext.Provider value={value}>{children}</ComparisonContext.Provider>
}
