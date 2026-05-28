"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { scenaries } from "./types"
import { AoiEditor } from "./components/AoiEditor"

interface CreateProjectStep4Props {
  scenaries: scenaries[]
  onScenaryAoisChange?: (scenaryId: string, aois: scenaries["aois"]) => void
}

export const CreateProjectStep4 = ({
  scenaries,
  onScenaryAoisChange,
}: CreateProjectStep4Props) => {
  const imageScenaries = scenaries.filter((scenary) => (scenary.type || "image") === "image")
  const [openScenaryId, setOpenScenaryId] = useState<string>(imageScenaries[0]?.id || "")

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-xl font-semibold text-foreground">
          Areas de Interes (AOIs)
        </h3>
        <p className="text-sm text-muted-foreground">
          Delimita las zonas relevantes de cada escenario para analizarlas en Eye Tracker.
        </p>
      </div>

      <div className="space-y-3">
        {imageScenaries.map((scenary) => {
          const isOpen = openScenaryId === scenary.id
          const scenaryAois = scenary.aois || []

          return (
            <div
              key={scenary.id}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <button
                type="button"
                onClick={() => setOpenScenaryId(isOpen ? "" : scenary.id)}
                className="flex w-full items-center justify-between p-4 transition-colors hover:bg-muted/50"
              >
                <span className="font-medium text-foreground">{scenary.name}</span>
                {isOpen ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
              </button>

              {isOpen && (
                <div className="border-t border-border px-4 pb-4">
                  <div className="pt-4">
                    <AoiEditor
                      projectId={scenary.projectId}
                      fileId={scenary.fileId}
                      fallbackUrl={scenary.imageUrl}
                      scenarioName={scenary.name}
                      aois={scenaryAois}
                      onAoisChange={(nextAois) => onScenaryAoisChange?.(scenary.id, nextAois)}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {imageScenaries.length === 0 && (
          <div className="rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
            No hay escenarios de imagen disponibles para definir AOIs.
          </div>
        )}
      </div>
    </div>
  )
}
