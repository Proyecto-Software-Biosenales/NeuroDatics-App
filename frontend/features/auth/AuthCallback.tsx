'use client'

import { useAuth } from '@/lib/providers/AuthProvider'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function AuthCallback() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      router.push(user ? '/dashboard' : '/login')
    }
  }, [user, loading, router])

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-blue-600 animate-spin" />
        <p className="text-sm text-gray-500">Iniciando sesión…</p>
      </div>
    </div>
  )
}
