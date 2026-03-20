import type { AppUser, AuthSession } from '@/features/auth/auth'

const AUTH_SESSION_STORAGE_KEY = 'neurodatics-auth-session'
const AUTH_SESSION_CHANGED_EVENT = 'neurodatics-auth-session-changed'

export interface StoredAuthSession {
  user: AppUser
  session: AuthSession
}

function isBrowser() {
  return typeof window !== 'undefined'
}

function emitAuthSessionChanged() {
  if (!isBrowser()) {
    return
  }

  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT))
}

export function getAuthSessionStorageKey() {
  return AUTH_SESSION_STORAGE_KEY
}

export function getAuthSessionChangedEventName() {
  return AUTH_SESSION_CHANGED_EVENT
}

export function readStoredAuthSession(): StoredAuthSession | null {
  if (!isBrowser()) {
    return null
  }

  const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as StoredAuthSession
    if (!parsed?.user || !parsed?.session?.accessToken) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function writeStoredAuthSession(nextSession: StoredAuthSession) {
  if (!isBrowser()) {
    return
  }

  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(nextSession))
  emitAuthSessionChanged()
}

export function clearStoredAuthSession() {
  if (!isBrowser()) {
    return
  }

  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
  emitAuthSessionChanged()
}

export function getAccessToken(): string | null {
  return readStoredAuthSession()?.session.accessToken ?? null
}

export function isAccessTokenExpired(): boolean {
  const session = readStoredAuthSession()
  if (!session?.session?.expiresAt) {
    // Si no hay fecha de expiración, asumir expirado para ser seguro
    return true
  }

  const expiresAt = new Date(session.session.expiresAt).getTime()
  const now = Date.now()
  const timeBuffer = 30 * 1000 // 30 segundos de buffer para refrescar antes de la expiración real

  return now >= expiresAt - timeBuffer
}
