# Google Login with Supabase — Implementation

## Goal
Wire up Google OAuth authentication using the already-installed `@supabase/supabase-js` library on the frontend: protect all app routes, redirect unauthenticated users to a login page, and show the user's Google avatar and a logout button in the NavBar.

## Prerequisites
Make sure you are currently on the `google-login-implementation` branch before beginning.
If not, run:
```bash
git checkout google-login-implementation
```
If the branch does not exist, create it from main:
```bash
git checkout main
git checkout -b google-login-implementation
```

Before starting Step 1, do the following in your **Supabase Dashboard**:
- Go to **Authentication → Providers → Google** and enable Google OAuth. Configure your Google Cloud OAuth Client ID and Secret.
- Go to **Authentication → URL Configuration** and add `http://localhost:5173/auth/callback` to the **Redirect URLs** list.

---

### Step-by-Step Instructions

---

#### Step 1: Supabase Client & Environment Variables

- [ ] Inside `NeuroDatics/frontend/`, create a new file called `.env.local` and copy the content below. Replace the placeholder values with your real credentials from the Supabase Dashboard (Settings → API):

```
VITE_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL_HERE
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY_HERE
```

> `.env.local` is automatically ignored by Git (Vite adds `*.local` to `.gitignore`). Never commit this file.

- [x] Create the file `NeuroDatics/frontend/src/shared/utils/supabase.ts` and copy the code below into it:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in frontend/.env.local'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

##### Step 1 Verification Checklist
- [ ] Run `npm run dev` from the `NeuroDatics/` directory — app starts without errors.
- [ ] No TypeScript errors in `supabase.ts` shown in VS Code.
- [ ] Browser console shows no "Missing Supabase environment variables" error.

#### Step 1 STOP & COMMIT
**STOP & COMMIT:** Stage and commit with message `feat: add supabase client and env config`.

---

#### Step 2: Auth Types, AuthProvider & main.tsx

- [x] Create the file `NeuroDatics/frontend/src/shared/types/auth.ts` and copy the code below into it:

```typescript
import type { Session, User } from '@supabase/supabase-js'

export interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}
```

- [x] Create the file `NeuroDatics/frontend/src/app/providers/AuthProvider.tsx` and copy the code below into it:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../shared/utils/supabase'
import type { AuthContextType } from '../../shared/types/auth'

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Resolve the initial session (also handles OAuth PKCE code exchange on /auth/callback)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Keep auth state in sync across tabs and token refreshes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithGoogle, signOut }}>
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

- [x] Replace the entire contents of `NeuroDatics/frontend/src/app/main.tsx` with the code below:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './providers/AuthProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
```

##### Step 2 Verification Checklist
- [ ] No TypeScript errors in `AuthProvider.tsx`, `auth.ts`, or `main.tsx`.
- [ ] App still loads in the browser without errors.
- [ ] Browser console shows no errors on page load.

#### Step 2 STOP & COMMIT
**STOP & COMMIT:** Stage and commit with message `feat: add auth types and AuthProvider context`.

---

#### Step 3: Login Page & OAuth Callback Component

- [x] Create the directory `NeuroDatics/frontend/src/features/auth/` (create the folders if they don't exist).

- [x] Create the file `NeuroDatics/frontend/src/features/auth/LoginPage.tsx` and copy the code below into it:

```tsx
import { useAuth } from '../../app/providers/AuthProvider'
import logoSvg from '../../assets/NeuroDatics-logo.svg'

export function LoginPage() {
  const { signInWithGoogle, loading } = useAuth()

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-80px)] bg-gray-50">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <img src={logoSvg} alt="NeuroDatics Logo" className="h-14 w-auto" />
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">NeuroDatics</h1>
          <p className="text-sm text-gray-500 text-center">Inicia sesión para continuar</p>
        </div>

        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {/* Google "G" logo SVG – no external dependency needed */}
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continuar con Google
        </button>
      </div>
    </div>
  )
}
```

- [x] Create the file `NeuroDatics/frontend/src/features/auth/AuthCallback.tsx` and copy the code below into it:

```tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../app/providers/AuthProvider'

export function AuthCallback() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    // AuthProvider's getSession() call handles the PKCE code exchange automatically.
    // Once loading resolves we know whether the exchange succeeded.
    if (!loading) {
      navigate(user ? '/dashboard' : '/login', { replace: true })
    }
  }, [user, loading, navigate])

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-blue-600 animate-spin" />
        <p className="text-sm text-gray-500">Iniciando sesión…</p>
      </div>
    </div>
  )
}
```

##### Step 3 Verification Checklist
- [ ] Navigating to `http://localhost:5173/login` shows the login card with the NeuroDatics logo and "Continuar con Google" button.
- [ ] No TypeScript errors in `LoginPage.tsx` or `AuthCallback.tsx`.
- [ ] Clicking "Continuar con Google" opens Google's consent screen / account picker in the browser.

#### Step 3 STOP & COMMIT
**STOP & COMMIT:** Stage and commit with message `feat: add login page and auth callback component`.

---

#### Step 4: Protected Routes, App Wiring & NavBar Update

- [x] Create the file `NeuroDatics/frontend/src/app/routes/ProtectedRoute.tsx` and copy the code below into it:

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'

export function ProtectedRoute() {
  const { user } = useAuth()
  // Loading is always false here because AppRoutes renders a full-screen
  // spinner until loading resolves, so this check is safe.
  return user ? <Outlet /> : <Navigate to="/login" replace />
}
```

- [x] Replace the entire contents of `NeuroDatics/frontend/src/app/App.tsx` with the code below:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { NavBar } from '../shared/components/NavBar'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { LoginPage } from '../features/auth/LoginPage'
import { AuthCallback } from '../features/auth/AuthCallback'
import { useAuth } from './providers/AuthProvider'

function AppRoutes() {
  const { user, loading } = useAuth()

  // Prevent a flash-of-redirect while Supabase resolves the initial session
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-blue-600 animate-spin" />
      </div>
    )
  }

  return (
    <>
      <NavBar />
      <main className="max-w-7xl mx-auto px-8 py-6">
        <Routes>
          {/* Public routes */}
          <Route
            path="/login"
            element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />}
          />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Root redirect based on auth state */}
          <Route
            path="/"
            element={<Navigate to={user ? '/dashboard' : '/login'} replace />}
          />

          {/* Protected routes — require authentication */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div className="text-gray-700">Dashboard</div>} />
            <Route path="/proyectos" element={<div className="text-gray-700">Proyectos</div>} />
            <Route path="/reportes" element={<div className="text-gray-700">Reportes</div>} />
          </Route>

          {/* Fallback — redirect any unknown path to root */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
```

- [x] Replace the entire contents of `NeuroDatics/frontend/src/shared/components/NavBar.tsx` with the code below:

```tsx
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, User } from 'lucide-react'
import logoSvg from '../../assets/NeuroDatics-logo.svg'
import { useAuth } from '../../app/providers/AuthProvider'

export const NavBar = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()

  const navItems = [
    { path: '/dashboard', label: 'Inicio' },
    { path: '/proyectos', label: 'Proyectos' },
    { path: '/reportes', label: 'Reportes' },
  ]

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  // Derive display info from Google user metadata
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined
  const fullName = user?.user_metadata?.full_name as string | undefined
  const firstName = fullName?.split(' ')[0]
  const initials = fullName
    ? fullName
        .split(' ')
        .map((n: string) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : (user?.email?.[0]?.toUpperCase() ?? '?')

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50 backdrop-blur-sm bg-white/95">
      <div className="max-w-7xl mx-auto px-8 py-4">
        <div className="flex items-center justify-between">
          {/* Left: logo + nav links */}
          <div className="flex items-center gap-10">
            <Link to="/" className="flex items-center gap-3 group">
              <img
                src={logoSvg}
                alt="NeuroDatics Logo"
                className="h-12 w-auto transition-transform group-hover:scale-105"
              />
              <span className="text-xl font-semibold text-gray-900 tracking-tight">
                NeuroDatics
              </span>
            </Link>

            {/* Only show navigation links when logged in */}
            {user && (
              <nav className="flex items-center gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-4 py-2 text-base font-medium rounded-lg transition-all duration-200 ${
                      location.pathname === item.path
                        ? 'text-gray-900 bg-gray-100'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          {/* Right: user info + logout OR guest icon */}
          {user ? (
            <div className="flex items-center gap-3">
              {/* Avatar + first name */}
              <div className="flex items-center gap-2">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={fullName ?? 'User avatar'}
                    className="h-9 w-9 rounded-full object-cover ring-2 ring-gray-200"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold select-none">
                    {initials}
                  </div>
                )}
                {firstName && (
                  <span className="text-sm font-medium text-gray-700 hidden sm:block">
                    {firstName}
                  </span>
                )}
              </div>

              {/* Logout button */}
              <button
                onClick={handleSignOut}
                title="Salir"
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <LogOut size={16} />
                <span className="hidden sm:block">Salir</span>
              </button>
            </div>
          ) : (
            <button className="p-2.5 hover:bg-gray-100 rounded-xl transition-colors">
              <User size={20} className="text-gray-700" />
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
```

##### Step 4 Verification Checklist
- [ ] No TypeScript or build errors (`npm run dev` runs cleanly).
- [ ] Visiting `http://localhost:5173/` as a logged-out user → redirected to `/login`.
- [ ] Visiting `http://localhost:5173/proyectos` as a logged-out user → redirected to `/login`.
- [ ] Clicking "Continuar con Google" → Google consent screen → returns to `/auth/callback` → brief spinner → redirected to `/dashboard`.
- [ ] After login, NavBar shows the user's Google profile photo (or initials) and their first name.
- [ ] Clicking "Salir" logs out, NavBar returns to the User icon placeholder, browser redirects to `/login`.
- [ ] Visiting `http://localhost:5173/proyectos` while logged in → renders "Proyectos" page without redirect.
- [ ] Refreshing any protected route while logged in stays on that route (no redirect).

#### Step 4 STOP & COMMIT
**STOP & COMMIT:** Stage and commit with message `feat: add protected routes, update App routing and NavBar with user info`.
