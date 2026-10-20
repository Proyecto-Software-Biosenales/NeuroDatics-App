import { IS_LOCAL_MODE } from "@/lib/appMode"

const DEFAULT_FAILURE = "No se pudieron guardar los cambios del proyecto."

/** The text of a failed request without its transport wrapping ("API 400: {"detail": ...}"). */
export const toFriendlyErrorMessage = (error: unknown, fallback = DEFAULT_FAILURE): string => {
  const raw = error instanceof Error ? error.message : ""
  if (!raw) return fallback

  // Payloads like: API 400: {"detail":"..."}
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (typeof parsed?.detail === "string" && parsed.detail.trim()) return parsed.detail
    } catch {
      // Fall through to the prefix cleanup below.
    }
  }

  return raw
    .replace(/^API\s*\d+\s*:\s*/i, "")
    .replace(/^Error subiendo archivo:\s*/i, "")
    .trim()
}

const isGoogleSessionExpiredError = (message: string): boolean =>
  /google drive|oauth|invalid_grant|refresh token|token has expired|no se pudo configurar google drive/i.test(message)

/**
 * The message to show for a failed save or upload; cancelling is not an error. The Google Drive
 * notice only exists in the server edition: the student edition has no Drive to renew.
 */
export function describeFailure(error: unknown, fallback = DEFAULT_FAILURE) {
  const friendly = toFriendlyErrorMessage(error, fallback)
  const cancelled = /cancelad|abort/i.test(friendly)
  const needsDriveRenewal = !IS_LOCAL_MODE && isGoogleSessionExpiredError(friendly)
  const message = needsDriveRenewal
    ? `${friendly}. La conexión con Google Drive necesita renovarse: avisa a quien administra NeuroDatics.`
    : friendly
  return { cancelled, message, needsDriveRenewal }
}
