interface GoogleLoginUrlResponse {
	authorization_url: string
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

async function requestGoogleLoginUrl(redirectUri: string): Promise<string> {
	const params = new URLSearchParams({ redirect_uri: redirectUri })
	const response = await fetch(`/api/auth/google/login-url?${params.toString()}`, {
		cache: 'no-store',
	})

	if (!response.ok) {
		const message = await readErrorMessage(response)
		throw new Error(message || 'No se pudo iniciar sesion con Google.')
	}

	const data = (await response.json()) as GoogleLoginUrlResponse
	if (!data.authorization_url) {
		throw new Error('El backend no retorno la URL de autorizacion de Google.')
	}

	return data.authorization_url
}

export async function redirectToGoogleAuth() {
	if (typeof window === 'undefined') {
		throw new Error('La redireccion a Google solo puede ejecutarse en el navegador.')
	}

	const redirectUri = `${window.location.origin}/authorize`
	const authorizationUrl = await requestGoogleLoginUrl(redirectUri)
	window.location.assign(authorizationUrl)
}
