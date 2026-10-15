"use client"

/**
 * The acquisition screen, a global setting of each person: every new project starts from it.
 * One request per person and page load is shared by everything that asks for it.
 */

import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/api/apiFetch"
import { useOptionalAuth } from "@/lib/providers/AuthProvider"

export type ScreenSettings = {
  width_px: number
  height_px: number
  width_cm: number | null
  height_cm: number | null
}

export type ScreenSettingsEnvelope = { screen: ScreenSettings; confirmed: boolean }

const SCREEN_PATH = "/api/settings/screen"

/** The laboratory monitor; the backend answers with it until the person saves their own. */
export const LAB_SCREEN: ScreenSettings = {
  width_px: 1280,
  height_px: 1024,
  width_cm: null,
  height_cm: null,
}

const isEnvelope = (value: unknown): value is ScreenSettingsEnvelope => {
  const candidate = value as ScreenSettingsEnvelope | null
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.confirmed === "boolean" &&
    typeof candidate.screen?.width_px === "number" &&
    typeof candidate.screen?.height_px === "number"
  )
}

let cached: { userId: string; request: Promise<ScreenSettingsEnvelope> } | null = null
const listeners = new Set<(value: ScreenSettingsEnvelope) => void>()

export function loadScreenSettings(userId: string): Promise<ScreenSettingsEnvelope> {
  if (cached?.userId !== userId) {
    const entry = {
      userId,
      request: apiFetch<unknown>(SCREEN_PATH).then((value) => {
        if (!isEnvelope(value)) throw new Error("Respuesta inesperada del servidor")
        return value
      }),
    }
    // A failed request is not remembered, so the next caller asks again.
    entry.request.catch(() => {
      if (cached === entry) cached = null
    })
    cached = entry
  }
  return cached.request
}

export async function saveScreenSettings(userId: string, screen: ScreenSettings): Promise<ScreenSettingsEnvelope> {
  const saved = await apiFetch<ScreenSettingsEnvelope>(SCREEN_PATH, {
    method: "PUT",
    body: JSON.stringify(screen),
  })
  cached = { userId, request: Promise.resolve(saved) }
  listeners.forEach((listener) => listener(saved))
  return saved
}

/** The signed-in person's screen, or null while it loads, without a session or when it could not be read. */
export function useScreenSettings(): ScreenSettingsEnvelope | null {
  const userId = useOptionalAuth()?.currentUser?.id ?? null
  const [value, setValue] = useState<{ userId: string; envelope: ScreenSettingsEnvelope } | null>(null)
  useEffect(() => {
    if (!userId) return
    let active = true
    loadScreenSettings(userId).then(
      (envelope) => active && setValue({ userId, envelope }),
      () => undefined,
    )
    const listener = (envelope: ScreenSettingsEnvelope) => setValue({ userId, envelope })
    listeners.add(listener)
    return () => {
      active = false
      listeners.delete(listener)
    }
  }, [userId])
  return value && value.userId === userId ? value.envelope : null
}
