'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AppUser, AuthContextType } from '@/features/auth/auth'
import { IS_LOCAL_MODE } from '@/lib/appMode'
import { ensureLocalSession } from '@/lib/auth/localAuth'
import { setAnalyticsSession } from '@/features/analytics/analyticsCache'
import {
  clearStoredAuthSession,
  getAuthSessionChangedEventName,
  readStoredAuthSession,
} from '@/lib/auth/sessionStore'

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null)
  const [session, setSession] = useState<AuthContextType['session']>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const bootstrap = () => {
      const storedAuth = readStoredAuthSession()
      setAnalyticsSession(storedAuth?.user.id ?? null, storedAuth?.session.accessToken ?? null, storedAuth?.session.expiresAt ?? null)
      setCurrentUser(storedAuth?.user ?? null)
      setSession(storedAuth?.session ?? null)
      setLoading(false)
    }

    const eventName = getAuthSessionChangedEventName()
    window.addEventListener(eventName, bootstrap)

    if (IS_LOCAL_MODE) {
      // No sign-in in the local edition: the local backend reopens this browser's profile, every
      // time, since another tab may have deleted it. Without one the app asks for a profile.
      ensureLocalSession().catch(() => undefined).finally(bootstrap)
    } else {
      bootstrap()
    }

    return () => {
      window.removeEventListener(eventName, bootstrap)
    }
  }, [])

  const signOut = async () => {
    clearStoredAuthSession()
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        session,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/** The session when there is a provider above, or null (components rendered on their own). */
export function useOptionalAuth(): AuthContextType | null {
  return useContext(AuthContext)
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
