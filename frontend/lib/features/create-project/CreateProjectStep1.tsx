"use client"

import { Upload, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface CreateProjectStep1Props {
  projectName: string
  folderPath: string
  onProjectNameChange: (name: string) => void
  onFolderPathChange: (path: string) => void
}

export const CreateProjectStep1 = ({
  projectName,
  onProjectNameChange,
}: CreateProjectStep1Props) => {
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
            Carpeta del experimento
          </Label>
          <div className="border-2 border-dashed border-gray-300 rounded-xl bg-gradient-to-br from-gray-50 to-white transition-all duration-300 hover:border-gray-600">
            <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
              <div className="mb-5 relative">
                <div className="absolute inset-0 bg-gray-200 rounded-full blur-xl opacity-50" />
                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center shadow-sm">
                  <Upload size={20} />
                </div>
              </div>

              <h3 className="text-base font-medium text-gray-900 mb-2">
                Arrastra la carpeta aquí o haz clic para seleccionar
              </h3>

              <p className="text-gray-500 text-base leading-relaxed max-w-xl mb-4">
                Soporta imágenes, vídeos y archivos de datos
              </p>
              <Button variant="outline" type="button">
                Seleccionar carpeta
              </Button>
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
