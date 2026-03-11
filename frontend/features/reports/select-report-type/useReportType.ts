"use client"

import { useState } from "react"
import type { ReportType } from "@/features/reports/types"

export const useReportType = () => {
  const [reportType, setReportType] = useState<ReportType>(null)

  return {
    reportType,
    setReportType,
    hasReportType: reportType !== null,
  }
}
