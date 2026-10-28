"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { LocalProfiles } from "@/features/auth/components/LocalProfiles"
import { IS_LOCAL_MODE } from "@/lib/appMode"

/** Profiles exist only in the local edition; the network edition signs in with Google instead. */
export default function PerfilesPage() {
  const router = useRouter()

  useEffect(() => {
    if (!IS_LOCAL_MODE) router.replace("/login")
  }, [router])

  return IS_LOCAL_MODE ? <LocalProfiles /> : null
}
