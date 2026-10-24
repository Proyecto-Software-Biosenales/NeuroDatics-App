"use client"

import { getStimulusImageUrl, getStimulusPreviewUrl } from "@/features/projects/api/stimulusUrls"
import { isVideoScenario } from "../components/stimulusState"
import { useAnalyticsScenarios } from "./useAnalyticsData"

/** A video has no single picture; its still is the frame the project view shows too. */
export const VIDEO_STILL_TIME_S = 0.5

/**
 * Where a scenario's stimulus is drawn from as one still picture: the image
 * itself, or a frame of a video (the image route answers 400 for a video).
 * `null` while there is no file or its kind is still being read.
 */
export function useStimulusStillUrl(projectId: string, fileId: string | null): string | null {
  const { scenarios, loading } = useAnalyticsScenarios(fileId ? projectId : null)
  if (!fileId || loading) return null
  const scenario = Array.isArray(scenarios) ? scenarios.find((item) => item.file_id === fileId) : undefined
  return scenario && isVideoScenario(scenario)
    ? getStimulusPreviewUrl(projectId, fileId, { timeS: VIDEO_STILL_TIME_S })
    : getStimulusImageUrl(projectId, fileId)
}
