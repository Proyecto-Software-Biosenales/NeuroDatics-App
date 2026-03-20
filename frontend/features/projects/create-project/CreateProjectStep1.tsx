"use client"

import { useRef, useState } from "react"
import { Upload, AlertCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface CreateProjectStep1Props {
  projectName: string
  folderPath: string
  onProjectNameChange: (name: string) => void
  onFolderPathChange: (path: string) => void
  onZipSelected: (file: File | null) => void
}

export const CreateProjectStep1 = ({
  projectName,
  folderPath,
  onProjectNameChange,
  onFolderPathChange,
  onZipSelected,
}: CreateProjectStep1Props) => {
  const fileRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  const pickFile = () => fileRef.current?.click()

  const handleFile = (file: File | null) => {
    setFileError(null)
    
    if (!file) {
      onZipSelected(null)
      onFolderPathChange("")
      return
    }

    // Validación: solo zip
    const isZip =
      file.type === "application/zip" ||
      file.name.toLowerCase().endsWith(".zip")

    if (!isZip) {
      setFileError("Por favor selecciona un archivo .zip válido")
      onZipSelected(null)
      onFolderPathChange("")
      return
    }

    // Validación: tamaño máximo (100MB)
    const maxSize = 100 * 1024 * 1024 // 100MB
    if (file.size > maxSize) {
      setFileError("El archivo es demasiado grande. Máximo 100MB.")
      onZipSelected(null)
      onFolderPathChange("")
      return
    }

    onZipSelected(file)
    onFolderPathChange(file.name) // mostramos nombre en UI
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    handleFile(file)
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0] ?? null
    handleFile(file)
  }

  const clearFile = () => {
    setFileError(null)
    onZipSelected(null)
    onFolderPathChange("")
    if (fileRef.current) {
      fileRef.current.value = ""
    }
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
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="carpeta-experimento" className="text-base">
            Carpeta del experimento (ZIP)
          </Label>

          {/* input oculto */}
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={onInputChange}
          />

          <div
            onClick={pickFile}
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-xl bg-gradient-to-br from-gray-50 to-white transition-all duration-300 cursor-pointer ${
              isDragOver
                ? "border-gray-700 bg-gray-50"
                : fileError
                ? "border-red-300 hover:border-red-400"
                : "border-gray-300 hover:border-gray-600"
            }`}
          >
            <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
              <div className="mb-5 relative">
                <div className="absolute inset-0 bg-gray-200 rounded-full blur-xl opacity-50" />
                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center shadow-sm">
                  <Upload size={20} />
                </div>
              </div>

              <h3 className="text-base font-medium text-gray-900 mb-2">
                Arrastra el ZIP aquí o haz clic para seleccionar
              </h3>

              <p className="text-gray-500 text-base leading-relaxed max-w-xl mb-4">
                Sube un archivo .zip con imágenes, vídeos y CSV del experimento.
              </p>

              <Button variant="outline" type="button" onClick={pickFile}>
                Seleccionar ZIP
              </Button>

              {/* mostrar nombre */}
              {folderPath && !fileError && (
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-700">
                  <span>Archivo seleccionado: <span className="font-medium">{folderPath}</span></span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearFile()
                    }}
                    className="h-6 w-6 p-0 hover:bg-gray-200"
                  >
                    <X size={14} />
                  </Button>
                </div>
              )}

              {/* mostrar error */}
              {fileError && (
                <div className="mt-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  {fileError}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-xl bg-gray-100 py-4 px-5">
        <div className="shrink-0 rounded-lg bg-black p-1.5 text-white">
          <AlertCircle size={20} />
        </div>
        <p className="flex-1 text-xs text-gray-900 leading-relaxed">
          Recuerda poner un nombre descriptivo a las imágenes y vídeos
          utilizados, que coincida con lo que se obtiene en los datos.
        </p>
      </div>
    </div>
  )
}