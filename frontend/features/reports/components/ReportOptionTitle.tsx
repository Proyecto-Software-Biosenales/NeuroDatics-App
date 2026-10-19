import type { ComponentType, ReactNode } from "react"
import { FieldHint } from "@/components/FieldHint"

/** The title of a report option: its icon, its name and the explanation.
 *
 *  Every option lays out the same: the control and the icon sit on the first
 *  20 px line (the control with `mt-0.5`), and the info icon flows with the
 *  text, bound to its last word, so a name that wraps on a phone never leaves
 *  the icon alone on a line. */
export function ReportOptionTitle({
  icon: Icon,
  hint,
  children,
}: {
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  hint: ReactNode
  children: ReactNode
}) {
  const info = <FieldHint className="ml-1.5 -translate-y-px">{hint}</FieldHint>
  const split = typeof children === "string" ? children.lastIndexOf(" ") : -1
  return (
    <span className="flex min-w-0 flex-1 items-start gap-2 text-sm leading-5 font-semibold text-foreground">
      {Icon && <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />}
      <span className="min-w-0">
        {split > 0 ? (
          <>
            {(children as string).slice(0, split + 1)}
            <span className="whitespace-nowrap">
              {(children as string).slice(split + 1)}
              {info}
            </span>
          </>
        ) : (
          <>
            {children}
            {info}
          </>
        )}
      </span>
    </span>
  )
}
