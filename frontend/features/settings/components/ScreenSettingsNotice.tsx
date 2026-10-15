"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import { useScreenSettings } from "../screenSettings"

const NOTICE_ID = "screen-settings-notice"
const HANDLED_KEY = "neurodatics.screen-notice-handled"

// The tab's sessionStorage lives as long as one launch of the app; the variable covers a browser
// that refuses storage, so the notice still stays away until the next page load.
let handledInMemory = false

function wasHandled(): boolean {
  if (handledInMemory) return true
  try {
    return window.sessionStorage.getItem(HANDLED_KEY) === "1"
  } catch {
    return false
  }
}

function markHandled() {
  handledInMemory = true
  try {
    window.sessionStorage.setItem(HANDLED_KEY, "1")
  } catch {
    // Storage refused: the in-memory flag is enough for this page load.
  }
}

/**
 * Until a person saves their screen once, each launch of the app reminds them to check it. The toast
 * does not block the page and, once closed or once they reach Configuración, stays away for the rest
 * of that launch even if they leave without saving.
 */
export function ScreenSettingsNotice() {
  const settings = useScreenSettings()
  const pathname = usePathname()
  const router = useRouter()
  const onConfiguration = pathname?.startsWith("/configuracion") ?? false
  const pending = settings?.confirmed === false && !onConfiguration
  const shown = useRef(false)

  useEffect(() => {
    if (onConfiguration) markHandled()
    if (!pending || wasHandled()) {
      // Sonner applies a dismissal two animation frames later. Dismissing a toast that was never
      // shown (settings still loading) could then remove the one created right after it.
      if (shown.current) toast.dismiss(NOTICE_ID)
      shown.current = false
      return
    }
    shown.current = true
    toast.warning("Revisa la configuración de pantalla", {
      id: NOTICE_ID,
      description: "Asegúrate de que las dimensiones de la pantalla del experimento sean correctas.",
      duration: Infinity,
      closeButton: true,
      onDismiss: markHandled,
      action: { label: "Ir a Configuración", onClick: () => router.push("/configuracion") },
    })
  }, [onConfiguration, pending, router])

  return null
}
