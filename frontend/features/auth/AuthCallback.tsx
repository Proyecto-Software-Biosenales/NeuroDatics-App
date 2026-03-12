'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/lib/providers/AuthProvider'

export function AuthCallback() {
  const { currentUser, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const errorHandledRef = useRef(false)

  useEffect(() => {
    const error = searchParams.get('error')
    if (error && !errorHandledRef.current) {
      errorHandledRef.current = true
      const errorDescription = searchParams.get('error_description')
      const message = errorDescription ? decodeURIComponent(errorDescription) : 'No se pudo completar la autenticacion con Google.'
      toast.error(message)
      router.replace('/login')
      return
    }

    if (!loading) {
      router.replace(currentUser ? '/dashboard' : '/login')
    }
  }, [currentUser, loading, router, searchParams])

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-blue-600 animate-spin" />
        <p className="text-sm text-gray-500">Iniciando sesión…</p>
      </div>
    </div>
  )
}
