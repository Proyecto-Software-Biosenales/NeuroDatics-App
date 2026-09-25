'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AppUser, AuthContextType } from '@/features/auth/auth'
import { IS_LOCAL_MODE } from '@/lib/appMode'
import { ensureLocalSession } from '@/lib/auth/localAuth'
import {
  clearStoredAuthSession,
  getAuthSessionChangedEventName,
  isAccessTokenExpired,
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
      setCurrentUser(storedAuth?.user ?? null)
      setSession(storedAuth?.session ?? null)
      setLoading(false)
    }

    const eventName = getAuthSessionChangedEventName()
    window.addEventListener(eventName, bootstrap)

    if (IS_LOCAL_MODE && (!readStoredAuthSession() || isAccessTokenExpired())) {
      // No sign-in in the student edition: the local backend issues the one user's session.
      // A failure leaves the user signed out and the login page explains what to do.
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

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
