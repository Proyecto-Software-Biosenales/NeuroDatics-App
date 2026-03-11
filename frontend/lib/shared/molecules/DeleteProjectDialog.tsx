"use client"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
  onDelete: (id: string) => Promise<void> | void
}

export const DeleteProjectDialog = ({
  projectId,
  projectName,
  onDelete,
}: DeleteProjectDialogProps) => {
  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()

    try {
      await onDelete(projectId)
      toast.success(`Proyecto "${projectName}" eliminado correctamente.`)
    } catch (error) {
      console.error(error)
      toast.error(`No se pudo eliminar el proyecto "${projectName}".`)
    }
  }

  return (
    <AlertDialog>
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
          <AlertDialogTitle>¿Eliminar proyecto?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. Se eliminará el proyecto{" "}
            <span className="font-semibold text-foreground">
              "{projectName}"
            </span>
            .
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
            Cancelar
          </AlertDialogCancel>

          <AlertDialogAction
            onClick={(handleDelete)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}