import type { ComponentType } from "react"
import {
  Folder,
  FolderOpen,
  ChevronDown,
  User,
  type LucideProps,
} from "lucide-react"

export type IconName = "folder" | "folder-open" | "chevron-down" | "user"

interface IconProps {
  name: IconName
  className?: string
  size?: number
}

const iconMap: Record<IconName, ComponentType<LucideProps>> = {
  folder: Folder,
  "folder-open": FolderOpen,
  "chevron-down": ChevronDown,
  user: User,
}

export const Icon = ({ name, className = "", size = 24 }: IconProps) => {
  const LucideIcon = iconMap[name]
  return <LucideIcon size={size} className={className} />
}
