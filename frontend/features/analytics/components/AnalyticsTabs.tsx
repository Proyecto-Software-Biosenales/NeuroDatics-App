"use client"

import type { ReactNode } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface AnalyticsTabsProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  options: ReadonlyArray<{ key: T; label: string }>
  label: string
  children: ReactNode
}

export function AnalyticsTabs<T extends string>({ value, onValueChange, options, label, children }: AnalyticsTabsProps<T>) {
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as T)} activationMode="manual" className="min-w-0 gap-0">
      <div className="min-w-0 overflow-x-auto border-b border-border px-2 [scrollbar-width:none] 2xl:px-5">
        <TabsList variant="line" aria-label={label} className="h-auto min-h-10 justify-start py-0 group-data-horizontal/tabs:h-auto">
          {options.map((option) => (
            <TabsTrigger key={option.key} value={option.key} className="h-auto flex-none px-3 py-2.5 after:bottom-0">
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {/* Keep one content host so switching EEG views preserves their local state. */}
      <TabsContent value={value} className="min-w-0">{children}</TabsContent>
    </Tabs>
  )
}
