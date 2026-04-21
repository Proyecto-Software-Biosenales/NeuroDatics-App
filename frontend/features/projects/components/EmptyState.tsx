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
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="mb-5 relative">
        <div className="absolute inset-0 bg-muted rounded-full blur-xl opacity-50" />
        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center shadow-sm">
          <Icon name={icon} size={40} className="text-foreground" />
        </div>
      </div>

      <h3 className="text-xl font-semibold text-foreground mb-3">{title}</h3>

      <p className="text-muted-foreground text-lg leading-relaxed max-w-xl">
        {description}
      </p>

      {action && (
        <div className="mt-10 opacity-100 visible">{action}</div>
      )}
    </div>
  )
}
