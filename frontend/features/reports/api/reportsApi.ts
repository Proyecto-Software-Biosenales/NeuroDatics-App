import { apiFetchBlobWithHeaders } from "@/lib/api/apiFetch"
import { filenameFromDisposition } from "../reportContents"
import type { ExecutiveReportPayload, GeneratedReportFile } from "../types"

export const ReportsApi = {
  /** One device returns a PDF; every device (`mode.kind = "comparative"`) returns a ZIP. */
  generateReport: async (payload: ExecutiveReportPayload): Promise<GeneratedReportFile> => {
    const { blob, headers } = await apiFetchBlobWithHeaders("/api/reports/executive", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      timeoutMs: 10 * 60_000,
    })
    const extension = headers.get("Content-Type")?.includes("zip") ? "zip" : "pdf"
    return {
      blob,
      filename: filenameFromDisposition(headers.get("Content-Disposition"), `informe.${extension}`),
    }
  },
}
