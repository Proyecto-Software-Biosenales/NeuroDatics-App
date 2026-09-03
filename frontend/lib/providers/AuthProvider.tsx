'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AppUser, AuthContextType, LocalDevAdminSession } from '@/features/auth/auth'
import { devAdminConfig, matchesDevAdmin } from '@/lib/config/devAdmin'
import { clearStoredAuthSession, getAuthSessionChangedEventName, readStoredAuthSession } from '@/lib/auth/sessionStore'

const AuthContext = createContext<AuthContextType | null>(null)
const LOCAL_DEV_SESSION_KEY = 'neurodatics-dev-session'

function parseLocalDevSession(raw: string | null): LocalDevAdminSession | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as LocalDevAdminSession
    if (!parsed.user || parsed.user.authSource !== 'local-dev-admin') {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function persistLocalDevSession(session: LocalDevAdminSession | null) {
  if (typeof window === 'undefined') {
    return
  }

  if (!session) {
    window.localStorage.removeItem(LOCAL_DEV_SESSION_KEY)
    return
  }

  window.localStorage.setItem(LOCAL_DEV_SESSION_KEY, JSON.stringify(session))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null)
  const [session, setSession] = useState<AuthContextType['session']>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const bootstrap = () => {
      const nextLocalSession =
        typeof window === 'undefined' ? null : parseLocalDevSession(window.localStorage.getItem(LOCAL_DEV_SESSION_KEY))
      const storedAuth = readStoredAuthSession()

      if (storedAuth) {
        setCurrentUser(storedAuth.user)
        setSession(storedAuth.session)
      } else {
        setSession(null)
        setCurrentUser(nextLocalSession?.user ?? null)
      }

      setLoading(false)
    }

    bootstrap()
    const eventName = getAuthSessionChangedEventName()
    window.addEventListener(eventName, bootstrap)

    return () => {
      window.removeEventListener(eventName, bootstrap)
    }
  }, [])

  const signInWithPassword = async (email: string, password: string) => {
    const normalizedEmail = email.trim()
    setLoading(true)

    if (matchesDevAdmin(normalizedEmail, password) && devAdminConfig) {
      const localSession: LocalDevAdminSession = {
        user: {
          id: 'local-dev-admin',
          email: devAdminConfig.email,
          name: devAdminConfig.displayName,
          authSource: 'local-dev-admin',
        },
        issuedAt: new Date().toISOString(),
      }

      persistLocalDevSession(localSession)
      setSession(null)
      setCurrentUser(localSession.user)
      setLoading(false)
      return
    }

    setLoading(false)
    throw new Error('El inicio de sesion con correo y contrasena no esta disponible en este flujo.')
  }

  const signUpWithPassword: AuthContextType['signUpWithPassword'] = async () => {
    throw new Error('El registro con correo y contrasena no esta disponible en este flujo.')
  }

  const signOut = async () => {
    setLoading(true)
    persistLocalDevSession(null)
    clearStoredAuthSession()
    setCurrentUser(null)
    setSession(null)
    setLoading(false)
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        session,
        loading,
        signInWithPassword,
        signUpWithPassword,
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
