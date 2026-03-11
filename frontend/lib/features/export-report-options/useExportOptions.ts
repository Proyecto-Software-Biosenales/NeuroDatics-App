"use client"

import { useState } from "react"
import type { ExportOptions } from "@/lib/entities/report/types"

export const useExportOptions = () => {
  const [options, setOptions] = useState<ExportOptions>({
    includeCover: true,
    includeMetadata: true,
  })

  const toggleOption = (key: keyof ExportOptions) => {
    setOptions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  return {
    options,
    toggleOption,
  }
}
