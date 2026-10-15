"use client"

import { useLayoutEffect, useSyncExternalStore } from "react"
import { ProjectsApi } from "@/features/projects/api/projectsApi"
import { analyticsContextVersion, revalidateAnalyticsProject, subscribeAnalyticsContext } from "../analyticsCache"

export function useAnalyticsRevision() {
  return useSyncExternalStore(subscribeAnalyticsContext, analyticsContextVersion, () => 0)
}
/** Layout effect runs before data-hook subscriptions can reuse a cached result. */
export function useAnalyticsProjectContext(projectId: string | null) {
  useAnalyticsRevision()
  useLayoutEffect(() => {
    if (!projectId) return
    const refresh = () => revalidateAnalyticsProject(projectId, (signal) => ProjectsApi.get(projectId, signal))
    void refresh()
    window.addEventListener("focus", refresh)
    return () => { window.removeEventListener("focus", refresh) }
  }, [projectId])
}
