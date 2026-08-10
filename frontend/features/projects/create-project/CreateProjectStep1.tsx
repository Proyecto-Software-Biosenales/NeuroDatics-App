"use client"

import { useRef, useState } from "react"
import { FolderOpen, AlertCircle, X, CheckCircle, HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { UploadedProjectZip } from "@/features/projects/types"
import type { FixationScreenGeometryInput } from "./types"
import { StimulusPlacementEditor } from "./components/StimulusPlacementEditor"
import {
  selectedStimulusPaths,
  type StimulusPlacementDraft,
} from "./stimulusPlacement"
import {
  analyzeFolderStructure,
  buildStructureQuestions,
  emptyFolderSelection,
  filterRelevantFiles,
  getBlockingStructureError,
  getFileRelativePath,
  resolveSelection,
  type FolderSelection,
  type FolderStructure,
  type FolderStructureQuestion,
} from "./folderStructure"

interface CreateProjectStep1Props {
  projectName: string
  description: string
  folderPath: string
  uploadedZip?: UploadedProjectZip | null
  onProjectNameChange: (name: string) => void
  onDescriptionChange: (description: string) => void
  onFolderPathChange: (path: string) => void
  onFolderSelected: (files: File[] | null) => void
  onSelectionChange?: (selection: FolderSelection | null) => void
  fixationGeometry?: FixationScreenGeometryInput
  onFixationGeometryChange?: (geometry: FixationScreenGeometryInput) => void
  stimulusPlacements?: StimulusPlacementDraft[]
  onStimulusPathsChange?: (paths: string[]) => void
  onStimulusPlacementChange?: (
    sourceEntryPath: string,
    update: Partial<StimulusPlacementDraft>,
  ) => void
  zipRequired?: boolean
  isEditMode?: boolean
  shouldUpdateFolder?: boolean
  onShouldUpdateFolderChange?: (shouldUpdate: boolean) => void
}

export const CreateProjectStep1 = ({
  projectName,
  description,
  folderPath,
  uploadedZip,
  onProjectNameChange,
  onDescriptionChange,
  onFolderPathChange,
  onFolderSelected,
  onSelectionChange,
  fixationGeometry,
  onFixationGeometryChange,
  stimulusPlacements = [],
  onStimulusPathsChange,
  onStimulusPlacementChange,
  zipRequired = true,
  isEditMode = false,
  shouldUpdateFolder = false,
  onShouldUpdateFolderChange,
}: CreateProjectStep1Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [structure, setStructure] = useState<FolderStructure | null>(null)
  const [selection, setSelection] = useState<FolderSelection>(emptyFolderSelection())

  const pickFile = () => fileInputRef.current?.click()

  const pendingQuestions: FolderStructureQuestion[] = structure
    ? buildStructureQuestions(structure, selection)
    : []

  /**
   * The folder is only handed upstream once every ambiguity is resolved, so the
   * wizard can never start a packaging run that the backend would answer 409 to.
   */
  const publishSelection = (
    nextStructure: FolderStructure,
    nextSelection: FolderSelection,
    files: File[],
    rootFolderName: string
  ) => {
    const questions = buildStructureQuestions(nextStructure, nextSelection)
    if (questions.length > 0) {
      onFolderSelected(null)
      onSelectionChange?.(null)
      onStimulusPathsChange?.([])
      return
    }

    const resolved = resolveSelection(nextStructure, nextSelection)
    const relevantFiles = filterRelevantFiles(files, rootFolderName)
    onFolderSelected(relevantFiles)
    onSelectionChange?.(resolved)
    onStimulusPathsChange?.(selectedStimulusPaths(relevantFiles, rootFolderName, resolved))
  }

  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [pendingRoot, setPendingRoot] = useState<string>("")

  const answerQuestion = (field: keyof FolderSelection, value: string | boolean) => {
    const nextSelection = { ...selection, [field]: value } as FolderSelection
    setSelection(nextSelection)
    if (structure) {
      publishSelection(structure, nextSelection, pendingFiles, pendingRoot)
    }
  }

  const handleFolder = (files: File[]) => {
    const resetFolder = (message: string) => {
      setFileError(message)
      setStructure(null)
      setSelection(emptyFolderSelection())
      setPendingFiles([])
      setPendingRoot("")
      onFolderSelected(null)
      onSelectionChange?.(null)
      onStimulusPathsChange?.([])
      onFolderPathChange("")
    }

    if (files.length === 0) {
      resetFolder("No se encontraron archivos en la carpeta")
      return
    }

    const filteredFiles = files.filter((file) => {
      const relativePath = getFileRelativePath(file)
      return !file.name.startsWith(".") && !relativePath.includes("__MACOSX/")
    })

    const totalSize = filteredFiles.reduce((sum, file) => sum + file.size, 0)
    const maxSize = 500 * 1024 * 1024
    if (totalSize > maxSize) {
      resetFolder("La carpeta es demasiado grande. Máximo 500MB.")
      return
    }

    const folderName = getFileRelativePath(files[0]).split("/")[0]
    const nextStructure = analyzeFolderStructure(filteredFiles, folderName)

    const blockingError = getBlockingStructureError(nextStructure)
    if (blockingError) {
      resetFolder(blockingError)
      return
    }

    const nextSelection = emptyFolderSelection()
    setFileError(null)
    setStructure(nextStructure)
    setSelection(nextSelection)
    setPendingFiles(filteredFiles)
    setPendingRoot(folderName)
    onFolderPathChange(folderName)
    publishSelection(nextStructure, nextSelection, filteredFiles, folderName)
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    handleFolder(files)
  }

  const readAllEntries = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> => {
    return new Promise((resolve, reject) => {
      const results: FileSystemEntry[] = []
      const readBatch = () => {
        reader.readEntries((entries) => {
          if (entries.length === 0) {
            resolve(results)
          } else {
            results.push(...entries)
            readBatch()
          }
        }, reject)
      }
      readBatch()
    })
  }

  const readDirectoryEntries = async (dirEntry: FileSystemDirectoryEntry, basePath = ""): Promise<File[]> => {
    const reader = dirEntry.createReader()
    const entries = await readAllEntries(reader)
    const files: File[] = []
    for (const entry of entries) {
      if (entry.isFile) {
        if (entry.name.startsWith(".")) continue
        const file = await new Promise<File>((resolve, reject) => {
          ;(entry as FileSystemFileEntry).file(resolve, reject)
        })
        // Store reconstructed relative path for drag-drop files.
        const relativePath = basePath ? `${basePath}/${entry.name}` : `${dirEntry.name}/${entry.name}`
        ;(file as any)._relativePath = relativePath
        files.push(file)
      } else if (entry.isDirectory) {
        if (entry.name.startsWith(".")) continue
        const subPath = basePath ? `${basePath}/${entry.name}` : `${dirEntry.name}/${entry.name}`
        const subFiles = await readDirectoryEntries(entry as FileSystemDirectoryEntry, subPath)
        files.push(...subFiles)
      }
    }
    return files
  }

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    if (isEditMode && !shouldUpdateFolder) return

    const item = e.dataTransfer.items?.[0]
    if (!item) return
    const entry = item.webkitGetAsEntry?.()
    if (!entry?.isDirectory) {
      setFileError("Por favor arrastra una carpeta, no un archivo suelto")
      return
    }

    try {
      const files = await readDirectoryEntries(entry as FileSystemDirectoryEntry)
      handleFolder(files)
    } catch {
      setFileError("Error al leer la carpeta arrastrada")
    }
  }

  const clearFolder = () => {
    setFileError(null)
    setStructure(null)
    setSelection(emptyFolderSelection())
    setPendingFiles([])
    setPendingRoot("")
    onFolderSelected(null)
    onSelectionChange?.(null)
    onStimulusPathsChange?.([])
    onFolderPathChange("")
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const ingestionStatus = uploadedZip?.ingestion_status ?? null
  const ingestionReady = ingestionStatus === "READY"
  const disableProjectMetadataEditing =
    uploadedZip?.ingestion_status === "PROCESSING" ||
    uploadedZip?.ingestion_status === "PENDING"
  const ingestionFailed = ingestionStatus === "FAILED"
  const geometry = fixationGeometry ?? {
    enabled: false,
    widthPx: "",
    heightPx: "",
    widthCm: "",
    heightCm: "",
    viewingDistanceCm: "",
  }
  const geometryDisabled =
    disableProjectMetadataEditing || (isEditMode && !shouldUpdateFolder)
  const updateGeometry = (
    field: keyof FixationScreenGeometryInput,
    value: string | boolean,
  ) => {
    onFixationGeometryChange?.({ ...geometry, [field]: value })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nombre-proyecto" className="text-base">
            Nombre del proyecto
          </Label>
          <Input
            id="nombre-proyecto"
            name="nombre-proyecto"
            placeholder="Ej: Publicidad Coca-cola"
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            disabled={disableProjectMetadataEditing}
          />
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="usar-geometria-pantalla"
              checked={geometry.enabled}
              onCheckedChange={(checked) => updateGeometry("enabled", checked === true)}
              disabled={geometryDisabled}
              className="mt-0.5 cursor-pointer border-gray-400"
            />
            <div className="space-y-1">
              <Label htmlFor="usar-geometria-pantalla" className="cursor-pointer text-base">
                Usar geometría física para la detección ocular
              </Label>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Actívala si conoces la pantalla usada en el experimento. Permite calcular
                velocidad visual en grados. Si la dejas desactivada, se usará el detector
                normalizado, que no necesita estas medidas.
              </p>
            </div>
          </div>

          {geometry.enabled && (
            <div className="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="screen-width-px">Resolución horizontal (px)</Label>
                <Input
                  id="screen-width-px"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="1920"
                  value={geometry.widthPx}
                  onChange={(event) => updateGeometry("widthPx", event.target.value)}
                  disabled={geometryDisabled}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="screen-height-px">Resolución vertical (px)</Label>
                <Input
                  id="screen-height-px"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="1080"
                  value={geometry.heightPx}
                  onChange={(event) => updateGeometry("heightPx", event.target.value)}
                  disabled={geometryDisabled}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="screen-width-cm">Ancho físico (cm)</Label>
                <Input
                  id="screen-width-cm"
                  type="number"
                  min="0.1"
                  step="0.1"
                  placeholder="53.1"
                  value={geometry.widthCm}
                  onChange={(event) => updateGeometry("widthCm", event.target.value)}
                  disabled={geometryDisabled}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="screen-height-cm">Alto físico (cm)</Label>
                <Input
                  id="screen-height-cm"
                  type="number"
                  min="0.1"
                  step="0.1"
                  placeholder="29.9"
                  value={geometry.heightCm}
                  onChange={(event) => updateGeometry("heightCm", event.target.value)}
                  disabled={geometryDisabled}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <Label htmlFor="viewing-distance-cm">Distancia ojo-pantalla (cm)</Label>
                <Input
                  id="viewing-distance-cm"
                  type="number"
                  min="0.1"
                  step="0.1"
                  placeholder="62"
                  value={geometry.viewingDistanceCm}
                  onChange={(event) => updateGeometry("viewingDistanceCm", event.target.value)}
                  disabled={geometryDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  Se usa como respaldo si el CSV no trae Distance.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="descripcion-proyecto" className="text-base">
            Descripción
          </Label>
          <Textarea
            className="h-20 max-h-20 w-full max-w-full resize-none overflow-y-auto overflow-x-hidden break-all [overflow-wrap:anywhere] [field-sizing:fixed]"
            id="descripcion-proyecto"
            name="descripcion-proyecto"
            wrap="hard"
            placeholder="Describe brevemente el objetivo del proyecto"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            disabled={disableProjectMetadataEditing}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="carpeta-experimento" className="text-base">
            Carpeta del experimento{zipRequired || isEditMode ? "" : " (opcional)"}
          </Label>

          {isEditMode && (
            <div className="mb-4 flex items-center gap-3 bg-muted border border-border rounded-lg p-3 hover:bg-accent transition-colors">
              <Checkbox
                id="actualizar-carpeta"
                checked={shouldUpdateFolder}
                onCheckedChange={(checked) => onShouldUpdateFolderChange?.(checked === true)}
                className="cursor-pointer border-gray-400"
              />
              <Label htmlFor="actualizar-carpeta" className="text-sm cursor-pointer">
                Actualizar carpeta del experimento
              </Label>
            </div>
          )}

          {/* input oculto */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={onInputChange}
            {...({ webkitdirectory: "", mozdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
          />

          <div
            onClick={(isEditMode && !shouldUpdateFolder) || disableProjectMetadataEditing ? undefined : pickFile}
            onDragOver={(e) => {
              if (isEditMode && !shouldUpdateFolder) return
              if (disableProjectMetadataEditing) return
              e.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              if (isEditMode && !shouldUpdateFolder) return
              if (disableProjectMetadataEditing) return
              onDrop(e)
            }}
            className={`border-2 border-dashed rounded-xl bg-card transition-all duration-300 ${
              (isEditMode && !shouldUpdateFolder) || disableProjectMetadataEditing
                ? "cursor-not-allowed opacity-50 border-border bg-muted"
                : "cursor-pointer"
            } ${
              isDragOver
                ? "border-foreground bg-muted"
                : fileError
                ? "border-red-300 hover:border-red-400"
                : "border-border hover:border-foreground/60"
            }`}
          >
            <div className="flex flex-col items-center justify-center px-5 py-8 text-center xl:px-8 xl:py-12">
              <div className="mb-5 relative">
                <div className="absolute inset-0 bg-muted rounded-full blur-xl opacity-50" />
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center shadow-sm">
                  <FolderOpen size={20} />
                </div>
              </div>

              <h3 className="text-base font-medium text-foreground mb-2">
                Arrastra la carpeta aquí o haz clic para seleccionar
              </h3>

              <p className="mb-4 max-w-xl text-sm leading-relaxed text-muted-foreground xl:text-base">
                Selecciona la carpeta del experimento con imágenes, vídeos y CSV.
              </p>

              <Button 
                variant="outline" 
                type="button" 
                onClick={(e) => {
                  e.stopPropagation()
                  pickFile()
                }}
                disabled={(isEditMode && !shouldUpdateFolder) || disableProjectMetadataEditing}
              >
                Seleccionar carpeta
              </Button>

              {/* mostrar nombre */}
              {folderPath && !fileError && (
                <div className="mt-4 flex items-center gap-2 text-sm text-foreground">
                  <span>Carpeta seleccionada: <span className="font-medium">{folderPath}</span></span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearFolder()
                    }}
                    disabled={disableProjectMetadataEditing}
                    className="h-6 w-6 p-0 hover:bg-accent"
                  >
                    <X size={14} />
                  </Button>
                </div>
              )}

              {/* mostrar resultado del ZIP upload procesado */}
              {uploadedZip && (
                <div className={`mt-6 rounded-lg p-4 space-y-3 border ${
                  ingestionFailed ? "border-red-500/30 bg-red-500/10" : "border-green-500/30 bg-green-500/10"
                }`}>
                  <div className="flex items-start gap-2">
                    <CheckCircle
                      size={18}
                      className={`flex-shrink-0 mt-0.5 ${ingestionFailed ? "text-red-600" : "text-green-600"}`}
                    />
                    <div>
                      <h4 className={`font-medium ${ingestionFailed ? "text-red-500" : "text-green-400"}`}>
                        {ingestionFailed ? "Ingesta con errores" : "Carpeta procesada"}
                      </h4>
                      <p className={`text-xs mt-1 ${ingestionFailed ? "text-red-400" : "text-green-300 dark:text-green-400"}`}>
                        {uploadedZip.zip_file?.filename ?? folderPath}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {typeof uploadedZip.manifest?.total_detected === "number" && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Detectados:</span>
                        <span className="font-medium text-foreground">{uploadedZip.manifest.total_detected}</span>
                      </div>
                    )}
                    
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subidos:</span>
                      <span className="font-medium text-foreground">{uploadedZip.counts.files_uploaded}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Imágenes:</span>
                      <span className="font-medium text-foreground">{uploadedZip.counts.images}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Videos:</span>
                      <span className="font-medium text-foreground">{uploadedZip.counts.videos}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CSV:</span>
                      <span className="font-medium text-foreground">{uploadedZip.counts.csv}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CSV procesados:</span>
                      <span className={`font-medium ${uploadedZip.csv_processing.failed > 0 ? "text-amber-500" : "text-foreground"}`}>
                        {uploadedZip.csv_processing.processed}/{uploadedZip.csv_processing.detected}
                      </span>
                    </div>

                    {uploadedZip.drive_root_folder_name && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-muted-foreground">Carpeta raíz:</span>
                        <span className="font-medium text-foreground">{uploadedZip.drive_root_folder_name}</span>
                      </div>
                    )}

                    <div className="flex justify-between col-span-2">
                      <span className="text-muted-foreground">Estado:</span>
                      <span
                        className={`font-medium ${
                          ingestionReady
                            ? "text-green-400"
                            : ingestionFailed
                            ? "text-red-400"
                            : "text-amber-400"
                        }`}
                      >
                        {ingestionStatus || "PROCESSING"}
                      </span>
                    </div>

                    {uploadedZip.drive_root_folder_id && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-muted-foreground">Drive root:</span>
                        <span className="font-medium text-foreground">{uploadedZip.drive_root_folder_id}</span>
                      </div>
                    )}
                  </div>

                  {uploadedZip.drive_root_folder_url && (
                    <a
                      href={uploadedZip.drive_root_folder_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                      Abrir carpeta raíz en Google Drive
                    </a>
                  )}
                </div>
              )}

              {/* mostrar error */}
              {fileError && (
                <div className="mt-4 text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
                  {fileError}
                </div>
              )}
            </div>
          </div>

          {/* Preguntas de aclaración sobre la estructura de la carpeta */}
          {pendingQuestions.length > 0 && (
            <div
              className="mt-4 space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-2">
                <HelpCircle size={18} className="mt-0.5 flex-shrink-0 text-amber-500" />
                <div>
                  <h4 className="font-medium text-amber-500">Necesitamos una confirmación</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    La estructura de la carpeta es ambigua. Responde para continuar.
                  </p>
                </div>
              </div>

              {pendingQuestions.map((question) => (
                <div key={question.code} className="space-y-2">
                  <p className="text-sm text-foreground">{question.message}</p>

                  {question.kind === "choice" ? (
                    <div className="space-y-1">
                      {question.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => answerQuestion(question.field, option)}
                          className="w-full break-all rounded-lg border border-border bg-card px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-foreground/60 hover:bg-accent"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => answerQuestion(question.field, true)}
                      >
                        Sí, continuar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={clearFolder}
                      >
                        No, elegir otra carpeta
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Resumen de lo que se procesará una vez resueltas las preguntas */}
          {structure && pendingQuestions.length === 0 && !uploadedZip && (
            <div className="mt-4 space-y-1 rounded-xl border border-border bg-muted p-4 text-xs">
              <p className="text-foreground">
                <span className="text-muted-foreground">CSV a procesar: </span>
                <span className="break-all font-medium">
                  {resolveSelection(structure, selection).selectedCsvPath ?? "—"}
                </span>
              </p>
              <p className="text-foreground">
                <span className="text-muted-foreground">Imágenes: </span>
                <span className="break-all font-medium">
                  {resolveSelection(structure, selection).selectedImagesFolder ?? "sin imágenes"}
                </span>
              </p>
              <p className="text-foreground">
                <span className="text-muted-foreground">Vídeos: </span>
                <span className="break-all font-medium">
                  {resolveSelection(structure, selection).selectedVideosFolder ?? "sin vídeos"}
                </span>
              </p>
              {structure.acquisitionRecordings.length > 0 && (
                <p className="text-foreground">
                  <span className="text-muted-foreground">Acquisition: </span>
                  <span className="font-medium">
                    {structure.acquisitionRecordings.length} grabación(es) detectada(s) — se usarán
                    como valores por defecto, no se almacenan
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <StimulusPlacementEditor
        placements={stimulusPlacements}
        fixationGeometry={fixationGeometry}
        disabled={disableProjectMetadataEditing || (isEditMode && !shouldUpdateFolder)}
        onChange={(sourceEntryPath, update) =>
          onStimulusPlacementChange?.(sourceEntryPath, update)
        }
      />

      <div className="flex items-center gap-3 rounded-xl bg-muted px-4 py-3 xl:gap-4 xl:px-5 xl:py-4">
        <div className="shrink-0 rounded-lg bg-black p-1.5 text-white">
          <AlertCircle size={20} />
        </div>
        <p className="flex-1 text-xs text-foreground leading-relaxed">
          Recuerda poner un nombre descriptivo a las imágenes y vídeos
          utilizados, que coincida con lo que se obtiene en los datos.
        </p>
      </div>
    </div>
  )
}
