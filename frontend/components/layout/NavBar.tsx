'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LoaderCircle, Moon, Sun, User } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
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

  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

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
    <header className="sticky top-0 z-50 backdrop-blur-md bg-background/90 border-b border-border">
      <div className="max-w-7xl mx-auto px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-10">
            <Link href="/" className="flex items-center gap-3 group">
              <img
                src="assets/NeuroDatics-logo.png"
                alt="NeuroDatics Logo"
                className="h-10 w-auto transition-transform group-hover:scale-105"
              />
              <span className="text-lg font-semibold text-foreground tracking-tight">
                NeuroDatics
              </span>
            </Link>

            <nav className="flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={(event) => handleProtectedNavigation(event, item)}
                  className={`px-4 py-2 text-sm font-medium transition-all duration-200 relative ${
                    pathname === item.path
                      ? 'text-foreground after:absolute after:bottom-0 after:left-4 after:right-4 after:h-px after:bg-foreground after:rounded-full'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Cambiar tema"
            >
              {mounted && resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            {currentUser ? (
              <div className="hidden items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground sm:flex">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="max-w-44 truncate">{currentUser.name ?? currentUser.email ?? 'Usuario'}</span>
              </div>
            ) : null}

            {loading ? (
              <div className="p-2 text-muted-foreground">
                <LoaderCircle className="h-5 w-5 animate-spin" />
              </div>
            ) : currentUser ? (
              <button
                type="button"
                onClick={handleSignOut}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground',
                )}
              >
                Salir
              </button>
            ) : (
              <Link
                href="/login"
                className={cn(
                  'p-2 rounded-lg transition-all duration-200',
                  isAuthPage
                    ? 'text-foreground bg-muted'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
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
