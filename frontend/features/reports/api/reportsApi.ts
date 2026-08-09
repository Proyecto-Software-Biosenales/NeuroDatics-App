import { apiFetchBlob } from "@/lib/api/apiFetch"
import type { ExecutiveReportPayload } from "../types"

export const ReportsApi = {
  generateExecutiveReport: (payload: ExecutiveReportPayload) =>
    apiFetchBlob("/api/reports/executive", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      timeoutMs: 5 * 60_000,
    }),
}

