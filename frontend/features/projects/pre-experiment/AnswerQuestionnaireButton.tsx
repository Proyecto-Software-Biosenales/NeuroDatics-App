"use client"
import { MessageSquareText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** «Responder cuestionario», a shade darker than the outline buttons around it so it stands out
 *  the same way in every questionnaire tab. */
export function AnswerQuestionnaireButton({
  className,
  disabled,
  onClick,
}: {
  className?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "w-full bg-foreground/8 hover:bg-foreground/14 dark:bg-foreground/12 dark:hover:bg-foreground/18",
        className
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <MessageSquareText aria-hidden />
      Responder cuestionario
    </Button>
  )
}
