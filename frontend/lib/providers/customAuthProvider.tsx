function getRequiredEnvVar(name: string, value: string | undefined): string {
	const nextValue = value?.trim()
	if (!nextValue) {
		throw new Error(`Falta la variable de entorno ${name} para iniciar sesion con Google.`)
	}

	return nextValue
}

export function ensureGoogleOAuthEnv() {
	return {
		googleClientId: getRequiredEnvVar('NEXT_PUBLIC_GOOGLE_CLIENT_ID', process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID),
	}
}

export function redirectToGoogleAuth() {
	if (typeof window === 'undefined') {
		throw new Error('La redireccion a Google solo puede ejecutarse en el navegador.')
	}

	const { googleClientId } = ensureGoogleOAuthEnv()
	const redirectUri = `${window.location.origin}/authorize`
	const state = crypto.randomUUID()

	const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
	authUrl.searchParams.set('client_id', googleClientId)
	authUrl.searchParams.set('redirect_uri', redirectUri)
	authUrl.searchParams.set('response_type', 'code')
	authUrl.searchParams.set('scope', 'openid email profile')
	authUrl.searchParams.set('state', state)
	authUrl.searchParams.set('prompt', 'consent')

	window.location.assign(authUrl.toString())
}
