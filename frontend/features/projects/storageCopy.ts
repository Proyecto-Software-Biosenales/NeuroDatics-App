import { IS_LOCAL_MODE } from "@/lib/appMode"

/**
 * What the save and delete flows call the place project files go. The server edition keeps them
 * in Google Drive; the student edition keeps them on the student's own disk.
 */
type StorageCopy = {
  cancellingUpload: string
  preparingSync: string
  finalizingSync: string
  syncing: (percent: number) => string
  progressFinalizing: string
  progressInProgress: string
  progressProcessing: string
  deletedWithFolder: (projectName: string) => string
  deletedFolderUnconfirmed: (projectName: string) => string
  deleteWarningTail: string
  rootIdLabel: string
}

const driveCopy: StorageCopy = {
  cancellingUpload: "Cancelando subida a Google Drive...",
  preparingSync: "Preparando sincronización en Google Drive...",
  finalizingSync: "Finalizando sincronización con Google Drive...",
  syncing: (percent) => `Sincronizando archivos en Google Drive... ${percent}%`,
  progressFinalizing: "Finalizando sincronización con Google Drive",
  progressInProgress: "Sincronizando con Google Drive",
  progressProcessing: "Procesando en Google Drive...",
  deletedWithFolder: (projectName) => `Proyecto "${projectName}" y carpeta de Drive eliminados correctamente.`,
  deletedFolderUnconfirmed: (projectName) => `Proyecto "${projectName}" eliminado. Carpeta de Drive no confirmada.`,
  deleteWarningTail: ", sus registros asociados y su carpeta en Google Drive.",
  rootIdLabel: "Drive root:",
}

const localCopy: StorageCopy = {
  cancellingUpload: "Cancelando la subida...",
  preparingSync: "Preparando el guardado de archivos...",
  finalizingSync: "Finalizando el guardado de archivos...",
  syncing: (percent) => `Guardando archivos... ${percent}%`,
  progressFinalizing: "Finalizando el guardado de archivos",
  progressInProgress: "Guardando archivos en este equipo",
  progressProcessing: "Procesando los datos...",
  deletedWithFolder: (projectName) => `Proyecto "${projectName}" y sus archivos eliminados correctamente.`,
  deletedFolderUnconfirmed: (projectName) => `Proyecto "${projectName}" eliminado. Archivos no confirmados.`,
  deleteWarningTail: ", sus registros asociados y sus archivos en este equipo.",
  rootIdLabel: "Carpeta interna:",
}

export const storageCopy: StorageCopy = IS_LOCAL_MODE ? localCopy : driveCopy
