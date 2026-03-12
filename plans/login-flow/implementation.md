# Login Flow Implementation

## Goal
Implement a stable, end-to-end frontend authentication flow that supports temporary local admin email/password login and Google OAuth with Supabase, with unified auth state, session restore on refresh, protected navigation, and predictable redirects.

## Technology Stack and Dependencies
- Next.js App Router 16.1.6
- React 19.2.4
- TypeScript 5.9.3
- Supabase JS 2.99.0
- Sonner 2.0.7
- Tailwind CSS 4.1.18

## Build/Test Commands
Run from [frontend](frontend):

```bash
npm install
npm run lint
npm run typecheck
npm run build
```

## Prerequisites
Make sure the branch is [login-implementation](plans/login-flow/plan.md).

- [ ] Check current branch:

```bash
git branch --show-current
```

- [ ] If not on login-implementation, switch to it:

```bash
git switch login-implementation
```

- [ ] If the branch does not exist locally, create it from main:

```bash
git fetch origin
git switch main
git pull
git switch -c login-implementation
```

### Step-by-Step Instructions

#### Step 1: Define Unified Auth Types and Dev Admin Config
- [ ] Update [frontend/features/auth/auth.ts](frontend/features/auth/auth.ts) with unified app user/session types.
- [ ] Copy and paste code below into [frontend/features/auth/auth.ts](frontend/features/auth/auth.ts):

```ts
import type { Session } from '@supabase/supabase-js'

export type AuthSource = 'supabase' | 'local-dev-admin'

export interface AppUser {
  id: string
  email: string | null
  name: string | null
  authSource: AuthSource
}

export interface LocalDevAdminSession {
  user: AppUser
  issuedAt: string
}

export interface SignUpResult {
  requiresEmailConfirmation: boolean
}

export interface AuthContextType {
  currentUser: AppUser | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUpWithPassword: (fullName: string, email: string, password: string) => Promise<SignUpResult>
  signOut: () => Promise<void>
}
```

- [ ] Create the dev admin config module.
- [ ] Copy and paste code below into [frontend/lib/config/devAdmin.ts](frontend/lib/config/devAdmin.ts):

```ts
interface DevAdminConfig {
  email: string
  password: string
  displayName: string
}

const devAdminEmail = process.env.NEXT_PUBLIC_DEV_ADMIN_EMAIL?.trim() ?? ''
const devAdminPassword = process.env.NEXT_PUBLIC_DEV_ADMIN_PASSWORD?.trim() ?? ''

export const devAdminConfig: DevAdminConfig | null =
  devAdminEmail && devAdminPassword
    ? {
        email: devAdminEmail,
        password: devAdminPassword,
        displayName: 'Administrador NeuroDatics',
      }
    : null

export function matchesDevAdmin(email: string, password: string): boolean {
  if (!devAdminConfig) {
    return false
  }

  return email.trim().toLowerCase() === devAdminConfig.email.toLowerCase() && password === devAdminConfig.password
}
```

- [ ] Add temporary dev admin env vars in [frontend/.env.local](frontend/.env.local).
- [ ] Add these variables (keep your existing Supabase values untouched):

```env
NEXT_PUBLIC_DEV_ADMIN_EMAIL=admin@neurodatics.dev
NEXT_PUBLIC_DEV_ADMIN_PASSWORD=change-this-local-password
```

##### Step 1 Verification Checklist
- [ ] `npm run typecheck` passes.
- [ ] `matchesDevAdmin('admin@neurodatics.dev', 'change-this-local-password')` evaluates to true during runtime.
- [ ] `matchesDevAdmin` returns false for invalid credentials.

#### Step 1 STOP & COMMIT
STOP & COMMIT: Agent must stop here and wait for the user to test, stage, and commit the change.

#### Step 2: Implement Unified AuthProvider with Local and Supabase Sessions
- [ ] Replace provider internals so auth state can come from either Supabase or local dev admin session.
- [ ] Copy and paste code below into [frontend/lib/providers/AuthProvider.tsx](frontend/lib/providers/AuthProvider.tsx):

```tsx
'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { AppUser, AuthContextType, LocalDevAdminSession } from '@/features/auth/auth'
import { matchesDevAdmin, devAdminConfig } from '@/lib/config/devAdmin'
import { supabase } from '@/lib/utils/supabase'

const AuthContext = createContext<AuthContextType | null>(null)
const LOCAL_DEV_SESSION_KEY = 'neurodatics-dev-session'

function getSupabaseDisplayName(user: User): string | null {
  const metadata = user.user_metadata as Record<string, unknown> | undefined
  const fullName = typeof metadata?.full_name === 'string' ? metadata.full_name : null
  const name = typeof metadata?.name === 'string' ? metadata.name : null
  return fullName ?? name
}

function toSupabaseAppUser(user: User): AppUser {
  return {
    id: user.id,
    email: user.email ?? null,
    name: getSupabaseDisplayName(user),
    authSource: 'supabase',
  }
}

function parseLocalDevSession(raw: string | null): LocalDevAdminSession | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as LocalDevAdminSession

    if (!parsed || !parsed.user || parsed.user.authSource !== 'local-dev-admin') {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function persistLocalDevSession(session: LocalDevAdminSession | null) {
  if (typeof window === 'undefined') {
    return
  }

  if (!session) {
    window.localStorage.removeItem(LOCAL_DEV_SESSION_KEY)
    return
  }

  window.localStorage.setItem(LOCAL_DEV_SESSION_KEY, JSON.stringify(session))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const localSessionRef = useRef<LocalDevAdminSession | null>(null)

  const syncCurrentUser = (nextSession: Session | null, nextLocalSession: LocalDevAdminSession | null) => {
    if (nextSession?.user) {
      setCurrentUser(toSupabaseAppUser(nextSession.user))
      return
    }

    setCurrentUser(nextLocalSession?.user ?? null)
  }

  useEffect(() => {
    let isMounted = true

    const initializeAuth = async () => {
      const localSession = parseLocalDevSession(window.localStorage.getItem(LOCAL_DEV_SESSION_KEY))
      localSessionRef.current = localSession

      const { data, error } = await supabase.auth.getSession()

      if (!isMounted) {
        return
      }

      if (error) {
        console.error('Could not restore Supabase session', error)
      }

      const restoredSession = data.session ?? null
      setSession(restoredSession)
      syncCurrentUser(restoredSession, localSession)
      setLoading(false)
    }

    void initializeAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return
      }

      setSession(nextSession)
      syncCurrentUser(nextSession, localSessionRef.current)
      setLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  const signInWithPassword = async (email: string, password: string) => {
    const normalizedEmail = email.trim()

    if (!matchesDevAdmin(normalizedEmail, password)) {
      throw new Error('Invalid credentials')
    }

    const localSession: LocalDevAdminSession = {
      user: {
        id: 'local-dev-admin',
        email: devAdminConfig?.email ?? normalizedEmail,
        name: devAdminConfig?.displayName ?? 'Administrador',
        authSource: 'local-dev-admin',
      },
      issuedAt: new Date().toISOString(),
    }

    persistLocalDevSession(localSession)
    localSessionRef.current = localSession
    setSession(null)
    setCurrentUser(localSession.user)
    setLoading(false)
  }

  const signUpWithPassword = async (fullName: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: fullName,
        },
      },
    })

    if (error) {
      throw error
    }

    return {
      requiresEmailConfirmation: !data.session,
    }
  }

  const signOut = async () => {
    persistLocalDevSession(null)
    localSessionRef.current = null
    setCurrentUser(null)
    setSession(null)

    const { error } = await supabase.auth.signOut()

    if (error && error.message !== 'Auth session missing!') {
      throw error
    }
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        session,
        loading,
        signInWithGoogle,
        signInWithPassword,
        signUpWithPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
```

##### Step 2 Verification Checklist
- [ ] `npm run typecheck` passes.
- [ ] Local dev admin sign in sets localStorage key `neurodatics-dev-session`.
- [ ] Page refresh restores local dev admin `currentUser`.
- [ ] Google sign-in still redirects to Supabase OAuth screen.

#### Step 2 STOP & COMMIT
STOP & COMMIT: Agent must stop here and wait for the user to test, stage, and commit the change.

#### Step 3: Update Login UI for Dual Auth Path and Stable Errors
- [ ] Update login form to align with the unified auth model and remove dead route links.
- [ ] Copy and paste code below into [frontend/features/auth/components/LoginForm.tsx](frontend/features/auth/components/LoginForm.tsx):

```tsx
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

export function LoginForm() {
  const fieldClassName =
    'h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base shadow-sm transition-colors focus-visible:border-gray-400 focus-visible:ring-0'
  const primaryButtonClassName =
    'h-12 w-full rounded-2xl bg-gray-900 text-base font-semibold text-white shadow-sm hover:bg-gray-800'
  const secondaryButtonClassName =
    'h-12 w-full rounded-2xl border border-gray-200 bg-white text-base font-semibold text-gray-900 shadow-sm hover:bg-gray-50'

  const router = useRouter()
  const { loading, signInWithGoogle, signInWithPassword } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isBusy = loading || isSubmitting

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      await signInWithPassword(email, password)
      toast.success('Sesion iniciada correctamente.')
      router.push('/dashboard')
      router.refresh()
    } catch (error) {
      const fallbackMessage = 'No se pudo iniciar sesion.'
      const message = error instanceof Error ? error.message : fallbackMessage

      if (message === 'Invalid credentials') {
        toast.error('Credenciales invalidas. Usa la cuenta de administrador de desarrollo.')
      } else {
        toast.error(message)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true)

    try {
      await signInWithGoogle()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar sesion con Google.'
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
            Inicia sesion para gestionar tus proyectos y analisis de biosenales.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Acceso temporal para desarrollo: usa las credenciales de administrador configuradas en variables de entorno.
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Correo electronico</Label>
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
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="password">Contrasena</Label>
              <span className="text-sm text-muted-foreground">Ruta de recuperacion no disponible aun.</span>
            </div>
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
                aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
          </div>

          <Button type="submit" className={primaryButtonClassName} disabled={isBusy}>
            {isSubmitting ? 'Iniciando sesion...' : 'Continuar'}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">O continua con</span>
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
          No tienes una cuenta?{' '}
          <Link href="/register" className="font-medium text-foreground transition-colors hover:underline">
            Crear cuenta
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
```

##### Step 3 Verification Checklist
- [ ] Entering incorrect credentials shows a clear invalid-credentials toast.
- [ ] Correct dev admin credentials redirect to /dashboard.
- [ ] Google button still starts OAuth redirect.
- [ ] `npm run lint` passes for this file.

#### Step 3 STOP & COMMIT
STOP & COMMIT: Agent must stop here and wait for the user to test, stage, and commit the change.

#### Step 4: Add Route Guards for Protected and Public-Only Pages
- [ ] Create a reusable client-side guard for protected pages.
- [ ] Copy and paste code below into [frontend/features/auth/components/AuthGuard.tsx](frontend/features/auth/components/AuthGuard.tsx):

```tsx
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

  if (loading || !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          <p className="text-sm text-gray-500">Validando sesion...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
```

- [ ] Protect dashboard route.
- [ ] Copy and paste code below into [frontend/app/dashboard/page.tsx](frontend/app/dashboard/page.tsx):

```tsx
'use client'

import { AuthGuard } from '@/features/auth/components/AuthGuard'

export default function DashboardPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-6xl px-8 py-10">
          <h1 className="mb-4 text-3xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Visualiza tus estadisticas</p>
        </div>
      </div>
    </AuthGuard>
  )
}
```

- [ ] Protect proyectos route.
- [ ] Copy and paste code below into [frontend/app/proyectos/page.tsx](frontend/app/proyectos/page.tsx):

```tsx
'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AuthGuard } from '@/features/auth/components/AuthGuard'
import { ProjectsEmptyContainer } from '@/features/projects/components/ProjectsEmptyContainer'
import { ProjectsGrid } from '@/features/projects/components/ProjectsGrid'
import { CreateProjectDialog, useProjectsStorage } from '@/features/projects/create-project'

export default function ProyectosPage() {
  const { projects, addProject, removeProject } = useProjectsStorage()
  const hasProjects = projects.length > 0

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-6xl px-8 py-10">
          <div className="mb-10 flex items-start justify-between">
            <div>
              <h1 className="mb-3 text-3xl font-semibold tracking-tight text-gray-900">Proyectos</h1>
              <p className="text-lg leading-relaxed text-gray-600">
                Gestiona tus experimentos de neuromarketing y analisis de biosenales.
              </p>
            </div>

            {hasProjects && (
              <CreateProjectDialog
                onProjectCreated={addProject}
                trigger={
                  <Button className="gap-2 rounded-lg bg-black px-6 py-5 text-sm font-medium text-white transition-colors duration-200 hover:bg-gray-700">
                    <Plus className="h-5 w-5" />
                    Crear nuevo proyecto
                  </Button>
                }
              />
            )}
          </div>

          {hasProjects ? (
            <ProjectsGrid projects={projects} onDelete={removeProject} />
          ) : (
            <div className="transition-all duration-300">
              <ProjectsEmptyContainer onProjectCreated={addProject} />
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
```

- [ ] Protect reportes route.
- [ ] Copy and paste code below into [frontend/app/reportes/page.tsx](frontend/app/reportes/page.tsx):

```tsx
'use client'

import { ProjectSelectionCard } from '@/features/projects/components/ProjectSelectionCard'
import { ReportConfigurationCard } from '@/features/reports/components/ReportConfigurationCard'
import { ReportContentCard } from '@/features/reports/components/ReportContentCard'
import { ReportsEmptyContainer } from '@/features/reports/components/ReportsEmptyContainer'
import { ReportPreview } from '@/features/reports/components/ReportPreview'
import { ExportOptionsCard } from '@/features/reports/components/ExportOptionsCard'
import { useSelectedProject } from '@/features/projects/select-project/useSelectedProject'
import { useExportOptions } from '@/features/reports/export-report-options/useExportOptions'
import { useReportContent } from '@/features/reports/select-report-content/useReportContent'
import { useSelectedSensors } from '@/features/reports/select-sensors/useSelectedSensors'
import { useReportType } from '@/features/reports/select-report-type/useReportType'
import { AuthGuard } from '@/features/auth/components/AuthGuard'
import type { Project } from '@/features/projects/types'

const mockProjects: Project[] = [
  {
    id: '1',
    name: 'Publicidad Coca-cola',
    createdAt: '28/11/2025',
    sensors: ['EEG', 'GSR', 'EyeTracker'],
  },
  {
    id: '2',
    name: 'Helados Colombianos',
    createdAt: '15/10/2025',
    sensors: ['EyeTracker'],
  },
  {
    id: '3',
    name: 'Experimento atardecer',
    createdAt: '03/12/2025',
    sensors: ['GSR', 'EyeTracker'],
  },
]

export default function ReportesPage() {
  const { selectedProject, selectProject, hasSelection } = useSelectedProject(mockProjects)
  const { reportType, setReportType, hasReportType } = useReportType()
  const { content, toggleContent, selectedCount, hasContent } = useReportContent()
  const { options, toggleOption } = useExportOptions()
  const { selectedSensors, toggleSensor, clearSensors } = useSelectedSensors()

  const handleReportTypeChange = (type: typeof reportType) => {
    setReportType(type)
    if (type !== 'by-sensor') {
      clearSensors()
    }
  }

  const handleDownload = () => {
    console.log('Descargando reporte PDF...', {
      project: selectedProject?.name,
      reportType,
      selectedSensors,
      content,
      options,
    })
  }

  const canDownload = hasReportType && (reportType !== 'by-sensor' || selectedSensors.length > 0)

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-6xl px-8 py-10">
          <div className="mb-10">
            <h1 className="mb-3 text-3xl font-semibold tracking-tight text-gray-900">Reportes</h1>
            <p className="text-lg leading-relaxed text-gray-600">
              Genera y descarga reportes en PDF de tus proyectos, incluyendo graficas, estadisticas y analisis de sensores.
            </p>
          </div>

          <div className="mb-8">
            <ProjectSelectionCard
              projects={mockProjects}
              selectedProject={selectedProject}
              onProjectChange={selectProject}
            />
          </div>

          {hasSelection && (
            <div className="mb-8 animate-in slide-in-from-top-4 fade-in duration-300">
              <ReportConfigurationCard
                reportType={reportType}
                onReportTypeChange={handleReportTypeChange}
                availableSensors={selectedProject?.sensors || []}
                selectedSensors={selectedSensors}
                onSensorToggle={toggleSensor}
              />
            </div>
          )}

          {hasReportType && (
            <div className="mb-8 animate-in slide-in-from-top-4 fade-in duration-300">
              <ReportContentCard enabled={hasReportType} content={content} onToggleContent={toggleContent} />

              {hasContent && (
                <div className="pl-14 pr-8">
                  <ReportPreview selectedCount={selectedCount} />
                </div>
              )}
            </div>
          )}

          {hasReportType && (
            <div className="mb-8 animate-in slide-in-from-top-4 fade-in duration-300" style={{ animationDelay: '100ms' }}>
              <ExportOptionsCard
                enabled={hasReportType}
                options={options}
                onToggleOption={toggleOption}
                onDownload={handleDownload}
                canDownload={canDownload}
              />
            </div>
          )}

          {!hasSelection && (
            <div className="transition-all duration-300">
              <ReportsEmptyContainer />
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
```

- [ ] Add reverse guard on login page.
- [ ] Copy and paste code below into [frontend/app/login/page.tsx](frontend/app/login/page.tsx):

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoginPage } from '@/features/auth/LoginPage'
import { useAuth } from '@/lib/providers/AuthProvider'

export default function Page() {
  const { currentUser, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && currentUser) {
      router.replace('/dashboard')
    }
  }, [currentUser, loading, router])

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-81px)] items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
    )
  }

  if (currentUser) {
    return null
  }

  return <LoginPage />
}
```

- [ ] Add reverse guard on register page.
- [ ] Copy and paste code below into [frontend/app/register/page.tsx](frontend/app/register/page.tsx):

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { useAuth } from '@/lib/providers/AuthProvider'

export default function Page() {
  const { currentUser, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && currentUser) {
      router.replace('/dashboard')
    }
  }, [currentUser, loading, router])

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-81px)] items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
    )
  }

  if (currentUser) {
    return null
  }

  return <RegisterPage />
}
```

##### Step 4 Verification Checklist
- [ ] Unauthenticated visit to /dashboard redirects to /login.
- [ ] Unauthenticated visit to /proyectos redirects to /login.
- [ ] Unauthenticated visit to /reportes redirects to /login.
- [ ] Authenticated user opening /login is redirected to /dashboard.
- [ ] Authenticated user opening /register is redirected to /dashboard.
- [ ] `npm run typecheck` passes.

#### Step 4 STOP & COMMIT
STOP & COMMIT: Agent must stop here and wait for the user to test, stage, and commit the change.

#### Step 5: Make NavBar Auth-Aware and Guard Protected Navigation Clicks
- [ ] Update NavBar to read auth state, redirect unauthenticated users to login from protected links, and show logout when authenticated.
- [ ] Copy and paste code below into [frontend/components/layout/NavBar.tsx](frontend/components/layout/NavBar.tsx):

```tsx
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

  const isLoginPage = pathname === '/login'

  const getNavItemClassName = (isActive: boolean) =>
    cn(
      'rounded-lg px-4 py-2 text-base font-medium transition-all duration-200',
      isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
    )

  const handleProtectedNavigation = (targetPath: string) => {
    if (loading) {
      return
    }

    if (!currentUser) {
      router.push('/login')
      return
    }

    router.push(targetPath)
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('Sesion cerrada correctamente.')
      router.push('/')
      router.refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cerrar sesion.'
      toast.error(message)
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-10">
            <Link href="/" className="group flex items-center gap-3">
              <img
                src="assets/NeuroDatics-logo.svg"
                alt="NeuroDatics Logo"
                className="h-12 w-auto transition-transform group-hover:scale-105"
              />
              <span className="text-xl font-semibold tracking-tight text-gray-900">NeuroDatics</span>
            </Link>

            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.path

                if (!item.protected) {
                  return (
                    <Link key={item.path} href={item.path} className={getNavItemClassName(isActive)}>
                      {item.label}
                    </Link>
                  )
                }

                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => handleProtectedNavigation(item.path)}
                    className={getNavItemClassName(isActive)}
                  >
                    {item.label}
                  </button>
                )
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {loading ? (
              <LoaderCircle className="h-5 w-5 animate-spin text-gray-500" />
            ) : currentUser ? (
              <>
                <div className="hidden rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 sm:block">
                  {currentUser.name ?? currentUser.email ?? 'Usuario autenticado'}
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-100 hover:text-gray-900"
                >
                  <LogOut className="h-4 w-4" />
                  Salir
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className={cn(
                  'rounded-lg p-2 transition-all duration-200',
                  isLoginPage ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
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
```

##### Step 5 Verification Checklist
- [ ] From homepage while unauthenticated, click Dashboard and confirm redirect to /login.
- [ ] From homepage while unauthenticated, click Proyectos and confirm redirect to /login.
- [ ] After login, protected links navigate directly to the target route.
- [ ] Authenticated navbar shows user chip and Salir button.
- [ ] Logout clears session and returns to /.

#### Step 5 STOP & COMMIT
STOP & COMMIT: Agent must stop here and wait for the user to test, stage, and commit the change.

#### Step 6: Improve OAuth Callback Error Handling
- [ ] Update callback handler to surface OAuth errors and keep redirects deterministic.
- [ ] Copy and paste code below into [frontend/features/auth/AuthCallback.tsx](frontend/features/auth/AuthCallback.tsx):

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/lib/providers/AuthProvider'

export function AuthCallback() {
  const { currentUser, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const hasHandled = useRef(false)

  useEffect(() => {
    if (loading || hasHandled.current) {
      return
    }

    hasHandled.current = true

    if (currentUser) {
      router.replace('/dashboard')
      return
    }

    const errorCode = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    if (errorCode) {
      toast.error(errorDescription ?? 'No se pudo completar el inicio de sesion con Google.')
    }

    router.replace('/login')
  }, [currentUser, loading, router, searchParams])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
        <p className="text-sm text-gray-500">Iniciando sesion...</p>
      </div>
    </div>
  )
}
```

##### Step 6 Verification Checklist
- [ ] Simulate callback failure with `/auth/callback?error=access_denied&error_description=Denied` and confirm toast + redirect to /login.
- [ ] Complete real Google OAuth and confirm redirect to /dashboard.
- [ ] Refresh while authenticated with Google and confirm session stays authenticated.
- [ ] Refresh while authenticated with local dev admin and confirm session stays authenticated.
- [ ] `npm run lint`, `npm run typecheck`, and `npm run build` all pass.

#### Step 6 STOP & COMMIT
STOP & COMMIT: Agent must stop here and wait for the user to test, stage, and commit the change.

## Supabase Dashboard Configuration Required
- [ ] In Supabase Authentication URL settings, set Site URL to `http://localhost:3000`.
- [ ] Add redirect URL `http://localhost:3000/auth/callback`.
- [ ] Add equivalent production redirect URL(s) when deploying.

## Final Acceptance Checklist
- [ ] User can log in via temporary admin email/password without Supabase.
- [ ] User can log in via Google through Supabase.
- [ ] OAuth callback restores session and redirects correctly.
- [ ] Refresh keeps authenticated state for both local admin and Google sessions.
- [ ] Protected routes do not flash inconsistent content during auth loading.
- [ ] Header protected links redirect unauthenticated users to login.
- [ ] Login and register pages redirect authenticated users to dashboard.
- [ ] Temporary local login implementation is isolated and replaceable later.