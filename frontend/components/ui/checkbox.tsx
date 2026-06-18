"use client"

import * as React from "react"
import { Checkbox } from "radix-ui"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

function CheckboxInput({
  className,
  ...props
}: React.ComponentProps<typeof Checkbox.Root>) {
  return (
    <Checkbox.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded border border-input bg-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground",
        className
      )}
      {...props}
    >
      <Checkbox.Indicator className="flex items-center justify-center text-current">
        <Check className="size-3" />
      </Checkbox.Indicator>
    </Checkbox.Root>
  )
}

export { CheckboxInput as Checkbox }
