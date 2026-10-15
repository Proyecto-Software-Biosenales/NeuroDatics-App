"use client"

import { useState, type ReactNode } from "react"
import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** The explanation of a field, option or section, kept out of the layout: an
 *  info icon beside its label instead of a line of small print under it.
 *
 *  The tooltip opens on hover and focus, and also on click, which is the only way
 *  to read it on a touch screen. The click is kept from reaching an enclosing
 *  label, so it never toggles the checkbox or radio it sits next to. With `id`,
 *  the text also stays in the DOM for the control's `aria-describedby`. */
export function FieldHint({
  children,
  id,
  label = "Más información",
  className,
}: {
  children: ReactNode
  id?: string
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <TooltipProvider delayDuration={120}>
        <Tooltip open={open} onOpenChange={setOpen}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={label}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setOpen(true)
              }}
              className={cn(
                "inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full align-middle font-normal text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                className
              )}
            >
              <Info aria-hidden className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" collisionPadding={8} className="max-w-xs text-left leading-snug">
            {children}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {id && (
        <span id={id} className="sr-only">
          {children}
        </span>
      )}
    </>
  )
}
