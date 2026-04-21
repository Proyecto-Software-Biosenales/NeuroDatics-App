import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface CreateProjectButtonProps extends React.ComponentProps<typeof Button> {
  compact?: boolean
  showIcon?: boolean
}

export const CreateProjectButton = ({
  compact = false,
  showIcon = true,
  className,
  type = "button",
  ...props
}: CreateProjectButtonProps) => {
  return (
    <Button
      type={type}
      className={cn(
        "bg-black text-white dark:bg-white dark:text-black rounded-lg hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors duration-200 font-medium",
        compact ? "px-6 py-5 text-sm gap-2" : "px-8 py-5 text-base",
        className,
      )}
      {...props}
    >
      {showIcon && <Plus className="w-5 h-5" />}
      Crear nuevo proyecto
    </Button>
  )
}
