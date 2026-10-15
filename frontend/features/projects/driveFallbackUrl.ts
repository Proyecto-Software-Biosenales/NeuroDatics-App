import { IS_LOCAL_MODE } from "@/lib/appMode"

type DriveFileLinks = {
  drive_web_view_link?: string | null
  drive_download_link?: string | null
  external_id?: string | null
}

const extractDriveFileId = (url?: string | null): string | null => {
  if (!url) return null
  const filePathMatch = url.match(/\/d\/([^/]+)/i)
  if (filePathMatch?.[1]) return filePathMatch[1]
  const queryMatch = url.match(/[?&]id=([^&]+)/i)
  if (queryMatch?.[1]) return queryMatch[1]
  return null
}

/**
 * Where a stimulus image can be fetched from Google Drive when the backend's own image route
 * fails. The student edition has no Drive and no network, so a failed local read must show the
 * usual "image unavailable" state rather than turn into a request to Google.
 */
export const resolveScenarioImageUrl = (file?: DriveFileLinks): string | null => {
  if (!file || IS_LOCAL_MODE) return null
  if (file.drive_download_link) return file.drive_download_link
  const driveFileId = file.external_id || extractDriveFileId(file.drive_web_view_link)
  if (driveFileId) {
    return `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w2000`
  }
  return file.drive_web_view_link ?? null
}
