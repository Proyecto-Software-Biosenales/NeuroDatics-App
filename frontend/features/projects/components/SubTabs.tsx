"use client"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"

export type SubTab = {
  id: string
  label: string
  /** How many items the sub-section holds, shown as a pill after its name. */
  count?: number
  /** What the count counts, read by screen readers ("preguntas"). */
  unit?: string
  invalid?: boolean
}

/** The second row of tabs inside a section ("Antes del experimento" / "Después del experimento").
 *  Render it inside a `Tabs` whose `value` is the open sub-section. */
export function SubTabs({
  label,
  tabs,
  disabled = false,
}: {
  label: string
  tabs: SubTab[]
  disabled?: boolean
}) {
  return (
    <TabsList
      aria-label={label}
      className="grid h-auto w-full auto-cols-fr grid-flow-col gap-1 p-1 group-data-horizontal/tabs:h-auto"
    >
      {tabs.map((tab) => (
        <TabsTrigger
          key={tab.id}
          value={tab.id}
          disabled={disabled}
          className="h-auto min-w-0 flex-col gap-1 px-1 py-1.5 text-xs whitespace-normal sm:flex-row sm:gap-2 sm:text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={`rounded-full px-1.5 text-[11px] font-normal ${
                tab.invalid
                  ? "bg-destructive/10 text-destructive"
                  : tab.count
                    ? "bg-foreground text-background"
                    : "bg-muted-foreground/15"
              }`}
            >
              {tab.count}
              {tab.unit && <span className="sr-only"> {tab.unit}</span>}
            </span>
          )}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}
