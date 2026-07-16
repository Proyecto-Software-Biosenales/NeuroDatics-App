import type { ReactNode } from "react"
import { Icon } from "../../../components/ui/Icon"

interface EmptyStateProps {
  title: string
  description: string
  icon?: "folder" | "chevron-down" | "user" | "folder-open"
  action?: ReactNode
}

export const EmptyState = ({
  title,
  description,
  icon = "folder",
  action,
}: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-10 text-center xl:px-8 xl:py-16">
      <div className="relative mb-4 xl:mb-5">
        <div className="absolute inset-0 bg-muted rounded-full blur-xl opacity-50" />
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted shadow-sm xl:h-20 xl:w-20">
          <Icon name={icon} size={34} className="text-foreground xl:size-10" />
        </div>
      </div>

      <h3 className="mb-2 text-lg font-semibold text-foreground xl:mb-3 xl:text-xl">{title}</h3>

      <p className="max-w-xl text-base leading-relaxed text-muted-foreground xl:text-lg">
        {description}
      </p>

      {action && (
        <div className="mt-6 opacity-100 visible xl:mt-10">{action}</div>
      )}
    </div>
  )
}
