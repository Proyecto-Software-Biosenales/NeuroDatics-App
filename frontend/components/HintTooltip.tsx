"use client"

import type { ComponentProps, ReactElement, ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

/** A short definition of a control (a mode, a view, a sensor) shown on hover
 *  and keyboard focus, without changing how the control looks. The control keeps
 *  its own click; for an explanation that needs its own icon, use `FieldHint`.
 *
 *  The child must accept a ref and spread its props, like `Button`. Without
 *  `hint`, the child renders alone. */
export function HintTooltip({
  hint,
  side = "top",
  children,
}: {
  hint?: ReactNode
  side?: ComponentProps<typeof TooltipContent>["side"]
  children: ReactElement
}) {
  if (!hint) return children
  return (
    <TooltipProvider delayDuration={300}>
      {/* Closes as the pointer leaves, so neighbouring options never show two hints. */}
      <Tooltip disableHoverableContent>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} collisionPadding={8} className="max-w-xs text-left leading-snug">
          {hint}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
