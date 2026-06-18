'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/providers/AuthProvider'
import { redirectToGoogleAuth } from '@/lib/providers/customAuthProvider'

export function LoginForm() {
  const fieldClassName =
    'h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base shadow-sm transition-colors focus-visible:border-gray-400 focus-visible:ring-0'
  const primaryButtonClassName =
    'h-12 w-full rounded-2xl bg-gray-900 text-base font-semibold text-white shadow-sm hover:bg-gray-800'
  const secondaryButtonClassName =
    'h-12 w-full rounded-2xl border border-gray-200 bg-white text-base font-semibold text-gray-900 shadow-sm hover:bg-gray-50'

  const router = useRouter()
  const { loading, signInWithPassword } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isBusy = loading || isSubmitting

  const resolveLoginError = (error: unknown): string => {
    const fallbackMessage = 'No se pudo iniciar sesion.'
    if (!(error instanceof Error)) {
      return fallbackMessage
    }

    const rawMessage = error.message.toLowerCase()
    if (rawMessage.includes('invalid login credentials') || rawMessage.includes('invalid_credentials')) {
      return 'Credenciales invalidas. Verifica tu correo y contrasena.'
    }

    return error.message || fallbackMessage
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      await signInWithPassword(email, password)
      toast.success('Sesión iniciada correctamente.')
      router.push('/dashboard')
      router.refresh()
    } catch (error) {
      toast.error(resolveLoginError(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true)

    try {
      await redirectToGoogleAuth()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar sesión con Google.'
      toast.error(message)
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-[26.5rem] rounded-[2rem] border border-gray-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
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
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="w-full space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              placeholder="nombre@empresa.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className={fieldClassName}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className={`${fieldClassName} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
          </div>

          <Button type="submit" className={primaryButtonClassName} disabled={isBusy}>
            {isSubmitting ? 'Iniciando sesión...' : 'Continuar'}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">O continúa con</span>
          </div>
        </div>

        <Button variant="outline" className={secondaryButtonClassName} type="button" disabled={isBusy} onClick={handleGoogleSignIn}>
          <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continuar con Google
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          ¿No tienes una cuenta?{' '}
          <Link href="/register" className="font-medium text-foreground transition-colors hover:underline">
            Crear cuenta
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
