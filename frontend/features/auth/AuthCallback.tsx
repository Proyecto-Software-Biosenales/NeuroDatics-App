'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { writeStoredAuthSession } from '@/lib/auth/sessionStore'

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

export function AuthCallback() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const errorHandledRef = useRef(false)

  useEffect(() => {
    if (errorHandledRef.current) {
      return
    }

    const error = searchParams.get('error')
    if (error) {
      errorHandledRef.current = true
      const errorDescription = searchParams.get('error_description')
      const message = errorDescription ? decodeURIComponent(errorDescription) : 'No se pudo completar la autenticacion con Google.'
      toast.error(message)
      router.replace('/login')
      return
    }

    const code = searchParams.get('code')
    if (!code) {
      errorHandledRef.current = true
      toast.error('No se recibio el codigo de autorizacion de Google.')
      router.replace('/login')
      return
    }

    errorHandledRef.current = true

    const authorizeWithBackend = async () => {
      try {
        const redirectUri = `${window.location.origin}/authorize`
        const response = await fetch('/api/auth/google/authorize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code, redirect_uri: redirectUri }),
        })

        if (!response.ok) {
          const message = await response.text()
          throw new Error(message || 'No se pudo autorizar el login con Google en el backend.')
        }

        const data = (await response.json()) as GoogleAuthorizeResponse
        const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()

        writeStoredAuthSession({
          user: {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            authSource: 'google-oauth',
          },
          session: {
            accessToken: data.access_token,
            tokenType: data.token_type,
            expiresAt,
          },
        })

        router.replace('/dashboard')
      } catch (authError) {
        const message = authError instanceof Error ? authError.message : 'No se pudo completar la autenticacion con Google.'
        toast.error(message)
        router.replace('/login')
      }
    }

    void authorizeWithBackend()
  }, [router, searchParams])

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-blue-600 animate-spin" />
        <p className="text-sm text-gray-500">Iniciando sesión…</p>
      </div>
    </div>
  )
}
