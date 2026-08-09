import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface CardProps {
  children: ReactNode
  className?: string
}

export const Card = ({ children, className }: CardProps) => {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow-sm",
        className
      )}
    >
      {children}
    </div>
  )
}

export const CardHeader = ({ children, className }: CardProps) => (
  <div className={cn("flex flex-col space-y-1.5 p-4 2xl:p-5", className)}>{children}</div>
)

export const CardContent = ({ children, className }: CardProps) => (
  <div className={cn("p-4 pt-0 2xl:p-5 2xl:pt-0", className)}>{children}</div>
)

export const CardTitle = ({ children, className }: CardProps) => (
  <h3 className={cn("text-lg font-semibold leading-none tracking-tight 2xl:text-xl", className)}>
    {children}
  </h3>
)

export const CardDescription = ({ children, className }: CardProps) => (
  <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>
)
