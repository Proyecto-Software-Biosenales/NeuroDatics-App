"use client"
import { Check, type LucideIcon } from "lucide-react"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"

export type SectionTab = {
  id: string
  label: string
  icon: LucideIcon
  /** The section already holds something: a check marks it. */
  filled?: boolean
  /** The section needs attention: a red mark and "Revisar" replace the status. */
  invalid?: boolean
  /** What the section holds, under its name ("3 participantes"); empty sections show nothing. */
  status?: string | null
}

/** The strip of sections at the top of the project forms: creating and editing share it so they look alike.
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
      className="grid h-auto w-full auto-cols-[minmax(5rem,1fr)] grid-flow-col justify-start gap-1 overflow-x-auto rounded-xl p-1 group-data-horizontal/tabs:h-auto"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        const status = tab.invalid ? "Revisar" : tab.status
        return (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            disabled={disabled}
            className="h-auto min-w-0 flex-col gap-1 rounded-lg px-1 py-2 whitespace-normal data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <span className="relative">
              <Icon aria-hidden className="size-4" />
              {(tab.invalid || tab.filled) && (
                <span
                  aria-hidden
                  className={`absolute -top-1.5 -right-2 flex size-3 items-center justify-center rounded-full ${
                    tab.invalid ? "bg-destructive" : "bg-foreground text-background"
                  }`}
                >
                  {!tab.invalid && <Check className="size-2" strokeWidth={4} />}
                </span>
              )}
            </span>
            <span className="max-w-full truncate text-[10px] sm:text-sm">{tab.label}</span>
            {/* The status line is always there, empty or not, so icons and names line up across the strip. */}
            <span
              aria-hidden={!status}
              className={`hidden h-4 text-[11px] leading-4 font-normal sm:block ${
                tab.invalid ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {status}
            </span>
          </TabsTrigger>
        )
      })}
    </TabsList>
  )
}
