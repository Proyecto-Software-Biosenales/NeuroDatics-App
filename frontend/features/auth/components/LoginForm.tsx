'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { startGoogleSignIn } from '@/lib/auth/googleAuth'

function GoogleLogo() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

export function LoginForm() {
  const [isRedirecting, setIsRedirecting] = useState(false)

  // Returning from Google with the Back button restores this page from the
  // back/forward cache, still disabled mid-redirect.
  useEffect(() => {
    const resetOnRestore = (event: PageTransitionEvent) => {
      if (event.persisted) setIsRedirecting(false)
    }
    window.addEventListener('pageshow', resetOnRestore)
    return () => window.removeEventListener('pageshow', resetOnRestore)
  }, [])

  const handleGoogleSignIn = async () => {
    setIsRedirecting(true)

    try {
      await startGoogleSignIn()
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : 'No se pudo iniciar sesión con Google.')
      setIsRedirecting(false)
    }
  }

  return (
    <Card className="w-full max-w-[26.5rem]">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
          <Image src="/assets/NeuroDatics-logo.svg" alt="NeuroDatics" width={160} height={48} className="h-12 w-auto" priority />
        </div>
        <div className="space-y-2">
          <CardTitle>Acceder a NeuroDatics</CardTitle>
          <CardDescription className="text-balance text-muted-foreground">
            Inicia sesión para gestionar tus proyectos y análisis de bioseñales.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          variant="outline"
          className="h-12 w-full gap-3 text-base font-semibold"
          disabled={isRedirecting}
          onClick={handleGoogleSignIn}
        >
          {isRedirecting ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <GoogleLogo />}
          {isRedirecting ? 'Redirigiendo a Google…' : 'Continuar con Google'}
        </Button>

        <p className="text-center text-xs text-balance text-muted-foreground">
          ¿Primera vez? Tu cuenta se crea automáticamente al continuar con Google.
        </p>
      </CardContent>
    </Card>
  )
}
