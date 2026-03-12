'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { AppUser, AuthContextType, LocalDevAdminSession } from '@/features/auth/auth'
import { devAdminConfig, matchesDevAdmin } from '@/lib/config/devAdmin'
import { supabase } from '@/lib/utils/supabase'

const AuthContext = createContext<AuthContextType | null>(null)
const LOCAL_DEV_SESSION_KEY = 'neurodatics-dev-session'

function getSupabaseDisplayName(user: User): string | null {
  const metadata = user.user_metadata as Record<string, unknown> | undefined
  const fullName = typeof metadata?.full_name === 'string' ? metadata.full_name : null
  const name = typeof metadata?.name === 'string' ? metadata.name : null
  return fullName ?? name
}

function toSupabaseAppUser(user: User): AppUser {
  return {
    id: user.id,
    email: user.email ?? null,
    name: getSupabaseDisplayName(user),
    authSource: 'supabase',
  }
}

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
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const localSessionRef = useRef<LocalDevAdminSession | null>(null)

  const syncCurrentUser = (nextSession: Session | null, nextLocalSession: LocalDevAdminSession | null) => {
    if (nextSession?.user) {
      setCurrentUser(toSupabaseAppUser(nextSession.user))
      return
    }

    setCurrentUser(nextLocalSession?.user ?? null)
  }

  useEffect(() => {
    let isMounted = true

    const bootstrap = async () => {
      const nextLocalSession =
        typeof window === 'undefined' ? null : parseLocalDevSession(window.localStorage.getItem(LOCAL_DEV_SESSION_KEY))
      localSessionRef.current = nextLocalSession

      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession()

      if (!isMounted) {
        return
      }

      if (initialSession?.user) {
        localSessionRef.current = null
        persistLocalDevSession(null)
      }

      setSession(initialSession)
      syncCurrentUser(initialSession, localSessionRef.current)
      setLoading(false)
    }

    bootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return
      }

      if (nextSession?.user) {
        localSessionRef.current = null
        persistLocalDevSession(null)
      }

      setSession(nextSession)
      syncCurrentUser(nextSession, localSessionRef.current)
      setLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

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

      localSessionRef.current = localSession
      persistLocalDevSession(localSession)
      setSession(null)
      syncCurrentUser(null, localSession)
      setLoading(false)
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (error) {
      setLoading(false)
      throw error
    }

    localSessionRef.current = null
    persistLocalDevSession(null)
    setSession(data.session ?? null)
    syncCurrentUser(data.session ?? null, null)
    setLoading(false)
  }

  const signUpWithPassword = async (fullName: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: fullName,
        },
      },
    })

    if (error) {
      throw error
    }

    return {
      requiresEmailConfirmation: !data.session,
    }
  }

  const signOut = async () => {
    setLoading(true)
    persistLocalDevSession(null)
    localSessionRef.current = null
    setCurrentUser(null)
    setSession(null)

    const { error } = await supabase.auth.signOut()
    setLoading(false)

    if (error && !error.message.toLowerCase().includes('auth session missing')) {
      throw error
    }
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        session,
        loading,
        signInWithGoogle,
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
