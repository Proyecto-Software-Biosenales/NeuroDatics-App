import { writeStoredAuthSession } from '@/lib/auth/sessionStore'

interface LocalSessionResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: {
    id: string
    email: string | null
    name: string | null
  }
}

let inflight: Promise<void> | null = null

/**
 * The student edition has no sign-in: the local backend hands out the one fixed user's session
 * on request, and it is stored exactly where a Google session would be, so the rest of the app
 * reads it the way it always does. Concurrent callers share one request.
 */
export function ensureLocalSession(): Promise<void> {
  inflight ??= (async () => {
    const response = await fetch('/api/auth/local-session', { method: 'POST', cache: 'no-store' })
    if (!response.ok) {
      throw new Error('No se pudo iniciar la sesión local de NeuroDatics.')
    }

    const data = (await response.json()) as LocalSessionResponse
    writeStoredAuthSession({
      user: { id: data.user.id, email: data.user.email, name: data.user.name },
      session: {
        accessToken: data.access_token,
        tokenType: data.token_type,
        expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      },
    })
  })().finally(() => {
    inflight = null
  })

  return inflight
}
