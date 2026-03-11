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
        "bg-white rounded-xl border border-gray-200 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  )
}
