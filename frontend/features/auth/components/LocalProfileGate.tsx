'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { IS_LOCAL_MODE, SIGN_IN_PATH } from '@/lib/appMode'
import { useAuth } from '@/lib/providers/AuthProvider'

/** In the local edition every page belongs to a profile, so without one the app asks for it first. */
export function LocalProfileGate() {
  const { currentUser, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const onProfilesPage = pathname.replace(/\/$/, '') === SIGN_IN_PATH

  useEffect(() => {
    if (IS_LOCAL_MODE && !loading && !currentUser && !onProfilesPage) {
      router.replace(SIGN_IN_PATH)
    }
  }, [currentUser, loading, onProfilesPage, router])

  return null
}
