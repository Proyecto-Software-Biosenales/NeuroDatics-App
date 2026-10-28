import { clearStoredAuthSession, readStoredAuthSession, writeStoredAuthSession } from '@/lib/auth/sessionStore'

export interface LocalSessionResponse {
  access_token: string | null
  token_type: string
  expires_in: number
  user: {
    id: string
    email: string | null
    name: string | null
  } | null
}

/** Stores the profile's session exactly where a Google session would be; no user means no profile. */
export function storeLocalSession(data: LocalSessionResponse) {
  if (!data.user || !data.access_token) {
    clearStoredAuthSession()
    return
  }
  writeStoredAuthSession({
    user: { id: data.user.id, email: data.user.email, name: data.user.name },
    session: {
      accessToken: data.access_token,
      tokenType: data.token_type,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    },
  })
}

let inflight: Promise<void> | null = null

/**
 * The local edition has no sign-in: the browser works on one of this computer's profiles. The local
 * backend reopens the profile this browser remembers, or the last one used when it remembers none;
 * without a profile the session is cleared and the app asks for one. Concurrent callers share one
 * request.
 */
export function ensureLocalSession(): Promise<void> {
  inflight ??= (async () => {
    const response = await fetch('/api/auth/local-session', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: readStoredAuthSession()?.user.id ?? null }),
    })
    if (!response.ok) {
      throw new Error('No se pudo iniciar la sesión local de NeuroDatics.')
    }

    storeLocalSession((await response.json()) as LocalSessionResponse)
  })().finally(() => {
    inflight = null
  })

  return inflight
}
