"use client"

import { useState } from "react"
import type { ReportContent, ContentType } from "@/lib/entities/report/types"

export const useReportContent = () => {
  const [content, setContent] = useState<ReportContent>({
    "individual-charts": false,
    statistics: false,
    "comparative-charts": false,
  })

  const toggleContent = (type: ContentType) => {
    setContent((prev) => ({
      ...prev,
      [type]: !prev[type],
    }))
  }

  const selectedCount = Object.values(content).filter(Boolean).length

  return {
    content,
    toggleContent,
    selectedCount,
    hasContent: selectedCount > 0,
  }
}
