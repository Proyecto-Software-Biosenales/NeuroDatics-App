"use client"

import { useState, type ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export type InfoChipTone = "neutral" | "warning"

export interface InfoChipProps {
  /** A few words; the explanation goes in `detail`. */
  label: ReactNode
  /** Shown on hover and on keyboard focus. */
  detail: ReactNode
  /** Required when `label` is not plain text. */
  ariaLabel?: string
  tone?: InfoChipTone
  Icon?: LucideIcon
  /** Leading marks, such as colour swatches, drawn before the label. */
  marks?: ReactNode
  onClick?: () => void
  pressed?: boolean
  className?: string
}

const TONE_CLASSES: Record<InfoChipTone, string> = {
  neutral: "text-muted-foreground",
  warning:
    "border-amber-500/60 bg-amber-50/70 text-amber-800 hover:bg-amber-100/80 hover:text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50 dark:hover:text-amber-200",
}

/** A caveat or a jump target that costs one short line: the explanation lives
 *  in the tooltip, so notes stop stacking up as paragraphs around a chart.
 *
 *  Radix tooltips open on hover and focus only, and a click closes them. A chip
 *  without an action opens its tooltip on click instead, which is also the only
 *  way to read it on a touch screen. */
export function InfoChip({
  label,
  detail,
  ariaLabel,
  tone = "neutral",
  Icon,
  marks,
  onClick,
  pressed,
  className,
}: InfoChipProps) {
  const [open, setOpen] = useState(false)
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="xs"
            aria-label={ariaLabel}
            aria-pressed={pressed}
            onClick={(event) => {
              if (onClick) return onClick()
              // Keeps Radix from closing what the click is meant to open.
              event.preventDefault()
              setOpen(true)
            }}
            className={cn(
              "font-normal",
              onClick ? "cursor-pointer" : "cursor-help",
              TONE_CLASSES[tone],
              pressed &&
                "border-foreground/40 bg-muted text-foreground dark:border-foreground/40 dark:bg-muted",
              className
            )}
          >
            {Icon ? <Icon aria-hidden="true" /> : null}
            {marks}
            {label}
          </Button>
        </TooltipTrigger>
        {/* gap, not space-y: margins would lift the absolutely placed arrow into the box. */}
        <TooltipContent side="top" collisionPadding={8} className="flex max-w-sm flex-col items-start gap-1 text-left leading-snug">
          {detail}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
