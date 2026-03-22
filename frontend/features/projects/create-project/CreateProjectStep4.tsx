"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, X } from "lucide-react"
import type { scenaries } from "./types"

interface CreateProjectStep4Props {
  scenaries: scenaries[]
}

export const CreateProjectStep4 = ({ scenaries }: CreateProjectStep4Props) => {
  const [openscenaries, setOpenscenaries] = useState<string>(
    scenaries[0]?.id || ""
  )

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Áreas de Interés (AOIs)
        </h3>
        <p className="text-sm text-gray-600">
          Dibuja rectángulos sobre la imagen para delimitar las áreas de interés
        </p>
      </div>

      <div className="space-y-3">
        {scenaries.map((scenary) => {
          const isOpen = openscenaries === scenary.id
          const scenaryAois = scenary.aois || []

          return (
            <div
              key={scenary.id}
              className="border border-gray-200 rounded-xl bg-white overflow-hidden"
            >
              <button
                type="button"
                onClick={() =>
                  setOpenscenaries(isOpen ? "" : scenary.id)
                }
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-gray-900">
                  {scenary.name}
                </span>
                {isOpen ? (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                )}
              </button>

              {isOpen && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  <div className="pt-4 space-y-4">
                    {/* Image placeholder with AOI rectangles */}
                    <div className="relative rounded-xl overflow-hidden bg-gray-200 aspect-video">
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
                        Vista previa del estímulo
                      </div>
                      {scenaryAois.map((aoi) => (
                        <div
                          key={aoi.id}
                          className="absolute border-4"
                          style={{
                            left: `${aoi.x}%`,
                            top: `${aoi.y}%`,
                            width: `${aoi.width}%`,
                            height: `${aoi.height}%`,
                            borderColor: "#3b82f6",
                          }}
                        />
                      ))}
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">
                        AOIs creadas ({scenaryAois.length})
                      </h4>
                      <div className="space-y-2">
                        {scenaryAois.map((aoi) => (
                          <div
                            key={aoi.id}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-4 h-4 rounded bg-blue-500" />
                              <span className="text-sm font-medium text-gray-900">
                                {aoi.name}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="p-1 hover:bg-gray-200 rounded transition-colors"
                            >
                              <X className="w-4 h-4 text-gray-500" />
                            </button>
                          </div>
                        ))}
                        {scenaryAois.length === 0 && (
                          <p className="text-sm text-gray-500">No hay AOIs registradas para este estímulo.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
