import { Brain, Zap, Eye } from "lucide-react"
import type { SensorType } from "@/features/projects/types"
import { cn } from "@/lib/utils"

export type { SensorType }

interface SensorBadgeProps {
  sensor: SensorType
  size?: "sm" | "md"
  variant?: "default" | "secondary"
}

const sensorConfig = {
  EEG: { icon: Brain, label: "EEG" },
  GSR: { icon: Zap, label: "GSR" },
  EyeTracker: { icon: Eye, label: "Eye tracker" },
}

const variantStyles = {
  default: "font-medium text-gray-700 bg-gray-100 group-hover:bg-gray-200",
  secondary: "font-normal text-white bg-gray-950",
}

export const SensorBadge = ({
  sensor,
  size = "md",
  variant = "default",
}: SensorBadgeProps) => {
  const config = sensorConfig[sensor]
  const Icon = config.icon

  const sizeClasses =
    size === "md" ? "px-2.5 py-1.5 text-xs gap-2" : "px-2 py-1 text-xs gap-1.5"

  const iconSize = size === "sm" ? 12 : 14

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full",
        variantStyles[variant],
        sizeClasses
      )}
    >
      <Icon size={iconSize} />
      {config.label}
    </span>
  )
}
