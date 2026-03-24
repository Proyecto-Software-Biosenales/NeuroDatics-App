"use client"
import { useState } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DeleteProjectResult } from "@/features/projects/api/projectsApi"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface DeleteProjectDialogProps {
  projectId: string
  projectName: string
  onDelete: (id: string) => Promise<DeleteProjectResult | void> | DeleteProjectResult | void
}

export const DeleteProjectDialog = ({
  projectId,
  projectName,
  onDelete,
}: DeleteProjectDialogProps) => {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [confirmationText, setConfirmationText] = useState("")

  const resetDialogState = () => {
    setStep(1)
    setConfirmationText("")
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      resetDialogState()
    }
  }

  const handleContinue = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setStep(2)
  }

  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()

    if (confirmationText.trim().toLowerCase() !== "eliminar") {
      toast.error('Debes escribir "eliminar" para confirmar.')
      return
    }

    try {
      const result = await onDelete(projectId)
      if (result?.drive_folder_found) {
        if (result.drive_folder_deleted) {
          toast.success(`Proyecto "${projectName}" y carpeta de Drive eliminados correctamente.`)
        } else {
          toast.success(`Proyecto "${projectName}" eliminado. Carpeta de Drive no confirmada.`)
        }
      } else {
        toast.success(`Proyecto "${projectName}" eliminado correctamente.`)
      }
      setOpen(false)
      resetDialogState()
    } catch (error) {
      console.error(error)
      toast.error(`No se pudo eliminar el proyecto "${projectName}".`)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={(e) => e.stopPropagation()}
          className="absolute top-4 right-4 h-8 w-8 opacity-0 transition-all duration-200 group-hover:opacity-100 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Eliminar proyecto ${projectName}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {step === 1 ? "¿Eliminar proyecto?" : "Confirmación final"}
          </AlertDialogTitle>
          {step === 1 ? (
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el proyecto{" "}
              <span className="font-semibold text-foreground">
                &quot;{projectName}&quot;
              </span>
              , sus registros asociados y su carpeta en Google Drive.
            </AlertDialogDescription>
          ) : (
            <div className="space-y-2">
              <AlertDialogDescription>
                Para confirmar, escribe <span className="font-semibold text-foreground">eliminar</span> en el campo.
              </AlertDialogDescription>
              <Input
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder='Escribe "eliminar"'
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
              onClick={handleDelete}
              disabled={confirmationText.trim().toLowerCase() !== "eliminar"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar proyecto
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}