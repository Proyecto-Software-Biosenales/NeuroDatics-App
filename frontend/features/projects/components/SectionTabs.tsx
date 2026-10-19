"use client"
import type { LucideIcon } from "lucide-react"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"

export type SectionTab = {
  id: string
  label: string
  icon: LucideIcon
  /** The section needs attention after a failed save: its name turns red and a dot marks it. */
  invalid?: boolean
}

/** The strip of sections at the top of the project forms: creating and editing share it so they look alike.
 *  Every tab is an icon and a name; they share the width, none narrower than its name, and sit on one line
 *  on wide screens. On a phone the strip scrolls sideways instead of cutting names.
 *  Render it inside a `Tabs` whose `value` is the open section. */
export function SectionTabs({
  label,
  tabs,
  disabled = false,
}: {
  label: string
  tabs: SectionTab[]
  disabled?: boolean
}) {
  return (
    <TabsList
      aria-label={label}
      className="grid h-auto w-full auto-cols-[minmax(max-content,1fr)] grid-flow-col justify-start gap-1 overflow-x-auto rounded-xl p-1 group-data-horizontal/tabs:h-auto"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        return (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            disabled={disabled}
            className={`h-auto min-w-0 flex-col gap-1.5 rounded-lg px-2 py-2.5 xl:flex-row xl:gap-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm ${
              tab.invalid ? "text-destructive data-[state=active]:text-destructive" : ""
            }`}
          >
            <Icon aria-hidden className="size-4" />
            <span className="text-xs whitespace-nowrap sm:text-sm">{tab.label}</span>
            {tab.invalid && (
              <>
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-destructive max-xl:absolute max-xl:top-2 max-xl:right-2" />
                <span className="sr-only">: Revisar</span>
              </>
            )}
          </TabsTrigger>
        )
      })}
    </TabsList>
  )
}
