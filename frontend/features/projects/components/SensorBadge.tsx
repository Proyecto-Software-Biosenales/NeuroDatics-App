import { Brain, Zap, Eye } from "lucide-react"
import type { SensorType } from "@/features/projects/types"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

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
    <Badge
      variant={variant === "default" ? "secondary" : "default"}
      className={cn(
        "rounded-full",
        sizeClasses
      )}
    >
      <Icon size={iconSize} />
      {config.label}
    </Badge>
  )
}
