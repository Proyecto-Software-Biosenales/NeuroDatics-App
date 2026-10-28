'use client'

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeftRight, ChevronDown, LoaderCircle, Menu, Moon, Settings, Sun, User } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { IS_LOCAL_MODE, SIGN_IN_PATH } from '@/lib/appMode'
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
  { path: '/reportes', label: 'Informes', protected: true },
]

export const NavBar = () => {
  const pathname = usePathname()
  const router = useRouter()
  const { currentUser, loading, signOut } = useAuth()
  const isLoginPage = pathname.replace(/\/$/, '') === SIGN_IN_PATH
  // Creating the first profile is a gate: links that only lead back to it would be noise.
  const bareHeader = IS_LOCAL_MODE && isLoginPage && !loading && !currentUser

  const handleProtectedNavigation = (event: React.MouseEvent<HTMLAnchorElement>, item: NavItem) => {
    if (item.protected && !currentUser) {
      event.preventDefault()
      toast.error(IS_LOCAL_MODE ? 'Elige un perfil para continuar.' : 'Inicia sesión para acceder a esta sección.')
      router.push(SIGN_IN_PATH)
    }
  }

  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('Sesión cerrada.')
      router.push('/')
      router.refresh()
    } catch {
      toast.error('No se pudo cerrar la sesión.')
    }
  }

  return (
    <header className="sticky top-0 z-50 h-[var(--app-nav-height)] backdrop-blur-md bg-background/90 border-b border-border">
      <div className="mx-auto h-full max-w-[var(--app-page-max-width)] px-4 sm:px-5 lg:px-6 2xl:px-8">
        <div className="flex h-full items-center justify-between">
          <div className="flex min-w-0 items-center gap-4 2xl:gap-10">
            <Link href="/" className="group flex shrink-0 items-center gap-3">
              <Image
                src="/assets/NeuroDatics-logo.png"
                alt="Logotipo de NeuroDatics"
                width={30}
                height={32}
                className="h-8 w-auto transition-transform group-hover:scale-105 2xl:h-10"
              />
              <span className="text-base font-semibold tracking-tight text-foreground 2xl:text-lg">
                NeuroDatics
              </span>
            </Link>

            <nav aria-label="Navegación principal" className={cn('hidden min-w-0 items-center gap-0.5 2xl:gap-1', !bareHeader && 'md:flex')}>
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  href={item.path}
                  aria-current={pathname === item.path ? "page" : undefined}
                  onClick={(event) => handleProtectedNavigation(event, item)}
                  className={`relative shrink-0 px-3 py-2 text-sm font-medium transition-all duration-200 2xl:px-4 ${
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className={cn('md:hidden', bareHeader && 'hidden')} aria-label="Abrir navegación"><Menu /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {navItems.map((item) => (
                  <DropdownMenuItem key={item.path} asChild>
                    <Link href={item.path} aria-current={pathname === item.path ? "page" : undefined} onClick={(event) => handleProtectedNavigation(event, item)}>{item.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="icon-sm" variant="ghost"
              type="button"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="text-muted-foreground"
              aria-label="Cambiar tema"
            >
              {mounted && resolvedTheme === 'dark' ? <Sun className="h-4 w-4 2xl:h-5 2xl:w-5" /> : <Moon className="h-4 w-4 2xl:h-5 2xl:w-5" />}
            </Button>
            {currentUser ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Menú de usuario"
                    className="h-auto gap-2 bg-muted px-2.5 py-1.5 font-normal text-muted-foreground hover:text-foreground 2xl:px-3 2xl:py-2"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    <span className="hidden max-w-36 truncate sm:inline 2xl:max-w-44">{currentUser.name ?? currentUser.email ?? 'Usuario'}</span>
                    <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                {/* Sized to its items with a floor, not to the trigger: a short profile name would squeeze them. */}
                <DropdownMenuContent align="end" className="w-auto min-w-[max(12rem,var(--radix-dropdown-menu-trigger-width))]">
                  {/* The trigger hides the name on phones. */}
                  <DropdownMenuLabel className="max-w-56 truncate sm:hidden">
                    {currentUser.name ?? currentUser.email ?? 'Usuario'}
                  </DropdownMenuLabel>
                  {IS_LOCAL_MODE ? (
                    <DropdownMenuItem asChild>
                      <Link href="/perfiles" aria-current={pathname === '/perfiles' ? 'page' : undefined}>
                        <ArrowLeftRight aria-hidden="true" />
                        Cambiar de perfil
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem asChild>
                    <Link href="/configuracion" aria-current={pathname === '/configuracion' ? 'page' : undefined}>
                      <Settings aria-hidden="true" />
                      Configuración
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            {loading ? (
              <div className="p-2 text-muted-foreground">
                <LoaderCircle className="h-5 w-5 animate-spin" />
              </div>
            ) : currentUser ? (
              // The local edition changes profile from the menu; there is nothing to sign out of.
              IS_LOCAL_MODE ? null : (
                <Button variant="outline"
                  type="button"
                  onClick={handleSignOut}
                  className="gap-2"
                >
                  Salir
                </Button>
              )
            ) : bareHeader ? null : (
              <Link
                href={SIGN_IN_PATH}
                aria-label={IS_LOCAL_MODE ? 'Perfiles' : undefined}
                className={cn(
                  'p-2 rounded-lg transition-all duration-200',
                  isLoginPage
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
