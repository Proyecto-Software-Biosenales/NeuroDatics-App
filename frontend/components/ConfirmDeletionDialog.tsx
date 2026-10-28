"use client"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ConfirmDeletionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** What will be lost; shown first, before asking to type the confirmation word. */
  description: ReactNode
  confirmLabel: string
  onConfirm: () => void
}

const CONFIRMATION_WORD = "eliminar"

/** Two steps for anything that cannot be undone: read what will be lost, then type «eliminar». */
export function ConfirmDeletionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: ConfirmDeletionDialogProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [confirmationText, setConfirmationText] = useState("")
  const confirmed = confirmationText.trim().toLowerCase() === CONFIRMATION_WORD

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setStep(1)
      setConfirmationText("")
    }
  }

  const handleContinue = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setStep(2)
  }

  const handleConfirm = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (!confirmed) {
      toast.error(`Debes escribir "${CONFIRMATION_WORD}" para confirmar.`)
      return
    }
    onConfirm()
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{step === 1 ? title : "Confirma la eliminación"}</AlertDialogTitle>
          {step === 1 ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : (
            <div className="space-y-2">
              <AlertDialogDescription>
                Para confirmar, escribe <span className="font-semibold text-foreground">{CONFIRMATION_WORD}</span> en el campo.
              </AlertDialogDescription>
              <Input
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder={`Escribe "${CONFIRMATION_WORD}"`}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            </div>
          )}
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
            Cancelar
          </AlertDialogCancel>
          {step === 1 ? (
            <Button type="button" onClick={handleContinue} className="hover:bg-destructive/90">
              Continuar
            </Button>
          ) : (
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={!confirmed}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {confirmLabel}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
