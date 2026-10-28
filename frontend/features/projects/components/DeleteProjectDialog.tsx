"use client"
import { useState } from "react"
import { toast } from "sonner"
import { ConfirmDeletionDialog } from "@/components/ConfirmDeletionDialog"
import type { DeleteProjectResult } from "@/features/projects/api/projectsApi"
import { storageCopy } from "@/features/projects/storageCopy"

interface DeleteProjectDialogProps {
  projectId: string
  projectName: string
  onDelete: (id: string) => Promise<DeleteProjectResult | void> | DeleteProjectResult | void
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export const DeleteProjectDialog = ({
  projectId,
  projectName,
  onDelete,
  isOpen: controlledIsOpen,
  onOpenChange: controlledOnOpenChange,
}: DeleteProjectDialogProps) => {
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = controlledIsOpen ?? internalOpen
  const setIsOpen = (value: boolean) => {
    if (controlledOnOpenChange) {
      controlledOnOpenChange(value)
    } else {
      setInternalOpen(value)
    }
  }

  const handleDelete = async () => {
    const loadingToastId = toast.loading(`Eliminando «${projectName}»…`)

    try {
      const result = await onDelete(projectId)

      toast.dismiss(loadingToastId)

      if (result?.drive_folder_found) {
        if (result.drive_folder_deleted) {
          toast.success(storageCopy.deletedWithFolder(projectName))
        } else {
          toast.success(storageCopy.deletedFolderUnconfirmed(projectName))
        }
      } else {
        toast.success(`Proyecto «${projectName}» eliminado.`)
      }
      setIsOpen(false)
    } catch (error) {
      console.error(error)
      toast.dismiss(loadingToastId)
      toast.error(`No se pudo eliminar el proyecto «${projectName}».`)
    }
  }

  return (
    <ConfirmDeletionDialog
      open={isOpen}
      onOpenChange={setIsOpen}
      title="¿Eliminar proyecto?"
      description={
        <>
          Esta acción no se puede deshacer. Se eliminará el proyecto{" "}
          <span className="font-semibold text-foreground">
            «{projectName}»
          </span>
          {storageCopy.deleteWarningTail}
        </>
      }
      confirmLabel="Eliminar proyecto"
      onConfirm={() => void handleDelete()}
    />
  )
}
