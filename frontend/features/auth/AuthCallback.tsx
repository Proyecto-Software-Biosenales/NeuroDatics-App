'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { completeGoogleSignIn } from '@/lib/auth/googleAuth'

const FALLBACK_ERROR = 'No se pudo completar el inicio de sesión con Google.'

export function AuthCallback() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const handledRef = useRef(false)

  useEffect(() => {
    if (handledRef.current) {
      return
    }
    handledRef.current = true

    const failWith = (message: string) => {
      toast.error(message)
      router.replace('/login')
    }

    if (searchParams.get('error')) {
      // Closing Google's account chooser is a choice, not a failure worth alarming about.
      if (searchParams.get('error') === 'access_denied') {
        router.replace('/login')
        return
      }
      failWith(searchParams.get('error_description') ?? FALLBACK_ERROR)
      return
    }

    const code = searchParams.get('code')
    if (!code) {
      failWith('Google no devolvió un código de autorización.')
      return
    }

    completeGoogleSignIn(code, searchParams.get('state'))
      .then(() => router.replace('/dashboard'))
      .catch((error: unknown) => failWith(error instanceof Error && error.message ? error.message : FALLBACK_ERROR))
  }, [router, searchParams])

  return (
    <div className="app-page-shell flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
        <p className="text-sm text-muted-foreground">Iniciando sesión…</p>
      </div>
    </div>
  )
}
