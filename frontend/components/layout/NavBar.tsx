'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LoaderCircle, LogOut, User } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/providers/AuthProvider'
import { cn } from '@/lib/utils'

type NavItem = {
  path: string
  label: string
  protected: boolean
}

const navItems: NavItem[] = [
  { path: '/', label: 'Inicio', protected: false },
  { path: '/proyectos', label: 'Proyectos', protected: true },
  { path: '/dashboard', label: 'Dashboard', protected: true },
  { path: '/reportes', label: 'Reportes', protected: true },
]

export const NavBar = () => {
  const pathname = usePathname()
  const router = useRouter()
  const { currentUser, loading, signOut } = useAuth()
  const isLoginPage = pathname === "/login"
  const isRegisterPage = pathname === '/register'
  const isAuthPage = isLoginPage || isRegisterPage

  const handleProtectedNavigation = (event: React.MouseEvent<HTMLAnchorElement>, item: NavItem) => {
    if (item.protected && !currentUser) {
      event.preventDefault()
      toast.error('Debes iniciar sesion para acceder a esta seccion.')
      router.push('/login')
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('Sesion cerrada correctamente.')
      router.push('/')
      router.refresh()
    } catch {
      toast.error('No se pudo cerrar sesion.')
    }
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50 backdrop-blur-sm bg-white/95">
      <div className="max-w-7xl mx-auto px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-10">
            <Link href="/" className="flex items-center gap-3 group">
              <img
                src="/assets/NeuroDatics-logo.svg"
                alt="NeuroDatics Logo"
                className="h-12 w-auto transition-transform group-hover:scale-105"
              />
              <span className="text-xl font-semibold text-gray-900 tracking-tight">
                NeuroDatics
              </span>
            </Link>

            <nav className="flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={(event) => handleProtectedNavigation(event, item)}
                  className={`px-4 py-2 text-base font-medium rounded-lg transition-all duration-200 ${
                    pathname === item.path
                      ? 'text-gray-900 bg-gray-100'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {currentUser ? (
              <div className="hidden items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 sm:flex">
                <User className="h-4 w-4" />
                <span className="max-w-44 truncate">{currentUser.name ?? currentUser.email ?? 'Usuario'}</span>
              </div>
            ) : null}

            {loading ? (
              <div className="p-2 text-gray-500">
                <LoaderCircle className="h-5 w-5 animate-spin" />
              </div>
            ) : currentUser ? (
              <button
                type="button"
                onClick={handleSignOut}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50',
                )}
              >
                <LogOut className="h-4 w-4" />
                Salir
              </button>
            ) : (
              <Link
                href="/login"
                className={cn(
                  'p-2 rounded-lg transition-all duration-200',
                  isAuthPage
                    ? 'text-gray-900 bg-gray-100'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
                )}
              >
                <User className="h-6 w-6" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
