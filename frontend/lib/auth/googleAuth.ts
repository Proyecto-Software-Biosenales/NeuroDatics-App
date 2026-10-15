import { writeStoredAuthSession } from '@/lib/auth/sessionStore'

const GOOGLE_REDIRECT_PATH = '/authorize'
const GOOGLE_STATE_STORAGE_KEY = 'neurodatics-google-oauth-state'

interface GoogleLoginUrlResponse {
  authorization_url: string
}

interface GoogleAuthorizeResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: {
    id: string
    email: string | null
    name: string | null
  }
}

function googleRedirectUri() {
  return `${window.location.origin}${GOOGLE_REDIRECT_PATH}`
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  if (!text) {
    return ''
  }

  try {
    const parsed = JSON.parse(text) as { detail?: unknown }
    return typeof parsed.detail === 'string' ? parsed.detail : text
  } catch {
    return text
  }
}

/** Sends the browser to Google's account chooser. Rejects if the redirect cannot start. */
export async function startGoogleSignIn() {
  const params = new URLSearchParams({ redirect_uri: googleRedirectUri() })
  const response = await fetch(`/api/auth/google/login-url?${params.toString()}`, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error((await readErrorMessage(response)) || 'No se pudo iniciar sesión con Google.')
  }

  const { authorization_url: authorizationUrl } = (await response.json()) as GoogleLoginUrlResponse
  if (!authorizationUrl) {
    throw new Error('El servidor no devolvió la URL de autorización de Google.')
  }

  // Remember the state the backend issued so the callback only accepts the
  // login this tab started, not a code planted by another site.
  const state = new URL(authorizationUrl).searchParams.get('state')
  if (state) {
    window.sessionStorage.setItem(GOOGLE_STATE_STORAGE_KEY, state)
  }

  window.location.assign(authorizationUrl)
}

/** Exchanges the code Google returned for a NeuroDatics session and stores it. */
export async function completeGoogleSignIn(code: string, state: string | null) {
  const expectedState = window.sessionStorage.getItem(GOOGLE_STATE_STORAGE_KEY)
  window.sessionStorage.removeItem(GOOGLE_STATE_STORAGE_KEY)

  if (!expectedState || state !== expectedState) {
    throw new Error('La sesión de Google no coincide. Vuelve a intentarlo.')
  }

  const response = await fetch('/api/auth/google/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: googleRedirectUri() }),
  })

  if (!response.ok) {
    throw new Error((await readErrorMessage(response)) || 'No se pudo completar el inicio de sesión con Google.')
  }

  const data = (await response.json()) as GoogleAuthorizeResponse

  writeStoredAuthSession({
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
    },
    session: {
      accessToken: data.access_token,
      tokenType: data.token_type,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    },
  })
}
