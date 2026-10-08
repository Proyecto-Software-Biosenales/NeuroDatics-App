"use client"

import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
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
}

const ComparisonContext = createContext<ComparisonContextValue>({
  available: false,
  nested: false,
  participantCount: 0,
  open: () => {},
})

// The dialog, its renderers and its queue load on the first click only.
const ParticipantComparisonDialog = lazy(() => import("./ParticipantComparisonDialog"))

export function useParticipantComparison() {
  return useContext(ComparisonContext)
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
  for (let element = trigger?.parentElement ?? null; element; element = element.parentElement) {
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
  generation,
  children,
}: {
  projectId: string | null
  participantCodes: string[]
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

  const value = useMemo<ComparisonContextValue>(
    () => ({
      available: Boolean(projectId),
      nested: false,
      participantCount: participantCodes.length,
      open,
    }),
    [open, participantCodes.length, projectId]
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
