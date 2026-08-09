'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/providers/AuthProvider'

interface AuthGuardProps {
  children: ReactNode
  redirectTo?: string
}

export function AuthGuard({ children, redirectTo = '/login' }: AuthGuardProps) {
  const { currentUser, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !currentUser) {
      router.replace(redirectTo)
    }
  }, [currentUser, loading, redirectTo, router])

  if (loading) {
    return (
      <div className="app-page-shell flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    )
  }

  if (!currentUser) {
    return null
  }

  return <>{children}</>
}
