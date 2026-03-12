# Login Flow Implementation

**Branch:** `login-implementation`
**Description:** Implement a complete, stable authentication flow supporting a temporary dev admin email/password login and Google OAuth via Supabase, with route guards, session persistence, and auth-aware navigation.

---

## What Is Currently Broken

| # | Severity | Issue |
|---|---|---|
| 1 | **Critical** | No route protection — `/dashboard`, `/proyectos`, `/reportes` are fully accessible to unauthenticated users |
| 2 | **Critical** | NavBar ignores auth state entirely — logged-in users see no logout option; unauthenticated users can click protected nav links and enter |
| 3 | **High** | No temporary email/password login path — `signInWithPassword` in `AuthProvider` calls `supabase.auth.signInWithPassword`, which requires a real Supabase user record |
| 4 | **Medium** | OAuth PKCE failure is silent — `AuthCallback` silently bounces to `/login` with no error feedback |
| 5 | **Medium** | `/login` and `/register` pages have no redirect guard for already-authenticated users |
| 6 | **Low** | `LoginForm` links to `/forgot-password` which does not exist |

**What already works correctly:**
- Google OAuth is wired end-to-end: `signInWithOAuth` → Google → `/auth/callback` → PKCE exchange → `onAuthStateChange` → redirect. The structure is sound.
- `AuthProvider` correctly hydrates session on page load from Supabase `localStorage` and subscribes to `onAuthStateChange`.
- Session persistence across refresh works for Google sessions (localStorage-backed Supabase client).

---

## Goal

Replace the broken/missing pieces of the auth flow with a unified, stable implementation that supports:
1. A temporary dev admin email/password login (no Supabase, credentials from env vars)
2. Google OAuth login via Supabase
3. Route protection for `/dashboard`, `/proyectos`, `/reportes`
4. Auth-aware NavBar with navigation guards and logout
5. Session persistence for both auth modes
6. No flicker during auth loading

---

## Architecture Decisions

### Unified Auth State Model

`AuthProvider` will expose a `currentUser: AppUser | null` synthesized from either source:
- **Google/Supabase session** → `AppUser` built from `supabase.auth.User`
- **Local dev admin session** → `AppUser` built from the stored local session

Both auth modes work under the same auth context interface. The rest of the app always reads `currentUser` and does not need to know the auth source.

### Local Dev Admin Session Storage

Dev admin credentials are read from `NEXT_PUBLIC_DEV_ADMIN_EMAIL` and `NEXT_PUBLIC_DEV_ADMIN_PASSWORD` (env vars). On successful credential match, a lightweight session object is saved to `localStorage` under the key `neurodatics-dev-session`. On init, `AuthProvider` reads this key alongside the Supabase session.

> **Why `NEXT_PUBLIC_`?** Auth is entirely client-side in this app. The dev admin credentials must be readable in the browser to perform the comparison. These are test-only credentials and must never be set in a production deployment. This is documented explicitly in the code.

### Route Protection Strategy

Since all pages are `'use client'` and the Supabase client uses `localStorage` (no SSR session), a Next.js `middleware.ts` cannot see the session. The correct strategy is a shared `AuthGuard` client component that:
1. Renders a loading state while `loading === true`
2. Redirects to `/login` if `currentUser === null` once loading completes
3. Renders children if authenticated

Protected pages wrap their content in `<AuthGuard>`.

---

## Implementation Steps

### Step 1: Extend Auth Types and Add Dev Admin Config

**Files:**
- `frontend/features/auth/auth.ts`
- `frontend/lib/config/devAdmin.ts` *(new)*

**What:**
Extend `auth.ts` with:
- `AppUser` interface — a minimal unified user shape `{ id, email, name, authSource: 'supabase' | 'local-dev-admin' }` used across the entire app
- `LocalDevAdminSession` interface — stores the local session shape persisted to `localStorage`
- Updated `AuthContextType` replacing `user: User | null` with `currentUser: AppUser | null`, keeping `session: Session | null` for Supabase-only consumers

Create `frontend/lib/config/devAdmin.ts` — reads `NEXT_PUBLIC_DEV_ADMIN_EMAIL` and `NEXT_PUBLIC_DEV_ADMIN_PASSWORD`, exports a `devAdminConfig` object and a `matchesDevAdmin(email, password)` function. Returns `null` if env vars are not set (so the dev path is a no-op in production).

**Testing:**
- `devAdminConfig` is `null` when env vars are absent, defined when set
- `matchesDevAdmin` returns `true` only for exact credential match

---

### Step 2: Rewrite AuthProvider for Unified Auth State

**Files:**
- `frontend/lib/providers/AuthProvider.tsx`

**What:**
Rewrite the `AuthProvider` implementation (keep the same context shape exported):

1. **Init/hydration** — on mount:
   - Read `neurodatics-dev-session` from `localStorage` → if valid, set `localAdminSession`
   - Call `supabase.auth.getSession()` → if session, set `supabaseSession`
   - Derive `currentUser` from whichever source is present (Supabase takes precedence if both somehow exist)
   - Set `loading = false`

2. **`signInWithPassword(email, password)`** — now a local-only check:
   - Call `matchesDevAdmin(email, password)` from the config module
   - On match: create a `LocalDevAdminSession` object, save to `localStorage` under `neurodatics-dev-session`, update state
   - On no match: throw an error `'Invalid credentials'` (never calls Supabase)
   - Add a clear `// TEMP: replace with backend auth call` comment

3. **`signInWithGoogle()`** — unchanged, still calls `supabase.auth.signInWithOAuth`

4. **`signOut()`** — clears both: removes `neurodatics-dev-session` from localStorage AND calls `supabase.auth.signOut()` (with error handling)

5. **`onAuthStateChange`** subscription — only fires for Supabase events; clear `currentUser` on `SIGNED_OUT` event

6. Export `currentUser: AppUser | null` derived from either source

**Testing:**
- Sign in with dev admin credentials → `currentUser` is set, `loading` is false, session survives refresh
- Sign out → `currentUser` is null, localStorage key is cleared
- Sign in with wrong credentials → error is thrown (toast shown by LoginForm)

---

### Step 3: Update LoginForm for the Dual Auth Flow

**Files:**
- `frontend/features/auth/components/LoginForm.tsx`

**What:**
- Replace usages of `user: User` with `currentUser: AppUser`
- The `handleSubmit` already calls `signInWithPassword` — no change needed to the call itself (the provider now handles the local check); just ensure error handling for the new error shape
- Remove the `/forgot-password` dead link (replace with a `<span>` or a `TODO` comment)
- Tighten error display: show a specific message for `'Invalid credentials'`
- After successful `signInWithPassword`, redirect to `/dashboard` (already present, verify it works)

**Testing:**
- Enter correct dev admin credentials → toast success → redirect to `/dashboard`
- Enter wrong credentials → toast error `"Invalid credentials"`
- Google button → opens OAuth flow

---

### Step 4: Create AuthGuard Component and Protect Routes

**Files:**
- `frontend/features/auth/components/AuthGuard.tsx` *(new)*
- `frontend/app/dashboard/page.tsx`
- `frontend/app/proyectos/page.tsx`
- `frontend/app/reportes/page.tsx`
- `frontend/app/login/page.tsx` *(add reverse guard)*
- `frontend/app/register/page.tsx` *(add reverse guard)*

**What:**
Create `AuthGuard`:
```
'use client'
useAuth() → { currentUser, loading }
if loading → render full-page spinner (reuse app loading pattern)
if !currentUser → useEffect redirect to /login
render children
```

In each protected page (`dashboard`, `proyectos`, `reportes`): wrap page content with `<AuthGuard>`. Keep route pages thin (only composition).

Add reverse guard to `/login/page.tsx` and `/register/page.tsx`: if `currentUser` exists and `!loading`, redirect to `/dashboard`.

**Testing:**
- Unauthenticated: visit `/dashboard` → spinner briefly → redirect to `/login`
- Authenticated: visit `/dashboard` → page renders immediately
- Already logged in: visit `/login` → redirect to `/dashboard`
- Refresh on protected page while authenticated → page stays (hydration from localStorage)

---

### Step 5: Make NavBar Auth-Aware

**Files:**
- `frontend/components/layout/NavBar.tsx`

**What:**
- Add `useAuth()` call: read `currentUser`, `loading`, `signOut`
- Right side conditionally renders:
  - While `loading`: show nothing or a small spinner
  - If `currentUser`: show user name/email + Logout button (calls `signOut`, then `router.push('/')`)
  - If not `currentUser`: show Login link as today (no change for unauthenticated state)
- Protected nav links (`/dashboard`, `/proyectos`, `/reportes`): wrap click handlers so that if `!currentUser && !loading`, `router.push('/login')` instead of navigating. This handles the "unauthenticated user clicks protected nav item from the homepage" requirement.
  - The simplest implementation: instead of `<Link href="/dashboard">` for protected routes, use `<button onClick={() => currentUser ? router.push('/dashboard') : router.push('/login')}>` styled as a nav link using existing `cn` utility.

**Testing:**
- Unauthenticated: click "Dashboard" in nav → redirected to `/login`
- Authenticated: click "Dashboard" in nav → goes to `/dashboard`
- Authenticated: logout button appears, clicking it signs out and returns to `/`
- No flicker: loading state is handled gracefully

---

### Step 6: Fix AuthCallback Error Handling

**Files:**
- `frontend/features/auth/AuthCallback.tsx`

**What:**
- After `loading` is false, if `user` is null and there is an `error` query param in the URL (Supabase sets `?error=...&error_description=...` on OAuth failure), extract and display the error before redirecting
- Use `sonner` `toast.error` for this
- After showing the error, redirect to `/login`

**Testing:**
- Simulate failed OAuth (visit `/auth/callback?error=access_denied`) → toast error shown → redirect to `/login`
- Normal success path → redirect to `/dashboard` as before

---

## Required Environment Variables

Add to `frontend/.env.local` (and document in `frontend/.env.local.example` if it exists):

```env
# Supabase (existing)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Temporary dev admin login (NEVER set in production)
NEXT_PUBLIC_DEV_ADMIN_EMAIL=admin@neurodatics.dev
NEXT_PUBLIC_DEV_ADMIN_PASSWORD=<choose a local dev password>
```

---

## Required Supabase Dashboard Configuration

In the Supabase project dashboard → Authentication → URL Configuration:
- **Site URL:** `http://localhost:3000` (for local dev)
- **Redirect URLs:** add `http://localhost:3000/auth/callback`
- For production, add the production domain equivalents

---

## Final Flow Summary

### Temporary Dev Admin Login
1. User enters credentials in `LoginForm`
2. `signInWithPassword` is called on `AuthProvider`
3. `matchesDevAdmin()` checks against env var credentials
4. On match: creates `LocalDevAdminSession`, saves to `localStorage`, sets `currentUser`
5. `LoginForm` receives resolved promise → `router.push('/dashboard')`
6. `AuthGuard` on dashboard sees `currentUser` is set → renders page

### Google OAuth Login
1. User clicks Google button in `LoginForm`
2. `signInWithGoogle()` → `supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: origin + '/auth/callback' })`
3. Browser navigates to Google → user authenticates → Google redirects to `/auth/callback?code=...`
4. `AuthProvider` on mount calls `getSession()` which exchanges the PKCE code
5. `onAuthStateChange` fires `SIGNED_IN` → `currentUser` is set from Supabase user
6. `AuthCallback` sees `currentUser !== null` + `loading === false` → `router.push('/dashboard')`

### Session Persistence (Refresh)
- Dev admin: `AuthProvider` reads `neurodatics-dev-session` from `localStorage` on every mount → `currentUser` restored before any page renders
- Google: Supabase client reads its own `localStorage` token on every mount via `getSession()` → `currentUser` restored

### Logout
- `signOut()` clears `neurodatics-dev-session` from `localStorage` AND calls `supabase.auth.signOut()`  
- `currentUser` set to `null` → all guards redirect to `/login` → NavBar shows Login link

### Header Nav Guards (Unauthenticated)
- Protected nav links in `NavBar` check `currentUser` on click
- If not authenticated → navigate to `/login` instead of the target route

### Redirect After Login
- Both login methods end with `router.push('/dashboard')`
- If user is already authenticated and visits `/login` → redirect guard sends them to `/dashboard`

---

## What Is Temporary and Will Be Replaced Later

The entire `signInWithPassword` path in `AuthProvider` is a temporary shim:
- It checks credentials against env vars and creates a local in-memory (localStorage-backed) session
- It is isolated in a clearly commented block with `// TEMP: replace with backend auth call`
- The `matchesDevAdmin` function returns `null` when env vars are absent (safe no-op in production)
- The `LocalDevAdminSession` type and `devAdmin.ts` config module are the only pieces that need to be replaced when real backend auth is ready
- The `AppUser` unified interface is designed to be populated from a backend JWT response just as easily as from a Supabase or local session

**Replacement path (future):** swap `matchesDevAdmin` + localStorage session creation in `signInWithPassword` with a `POST /auth/login` call to the real backend, parse the JWT response into an `AppUser`, and store the token in the same way.

---

## Files Modified / Created

| Status | File |
|---|---|
| Modified | `frontend/features/auth/auth.ts` |
| **New** | `frontend/lib/config/devAdmin.ts` |
| Modified | `frontend/lib/providers/AuthProvider.tsx` |
| Modified | `frontend/features/auth/components/LoginForm.tsx` |
| **New** | `frontend/features/auth/components/AuthGuard.tsx` |
| Modified | `frontend/app/dashboard/page.tsx` |
| Modified | `frontend/app/proyectos/page.tsx` |
| Modified | `frontend/app/reportes/page.tsx` |
| Modified | `frontend/app/login/page.tsx` |
| Modified | `frontend/app/register/page.tsx` |
| Modified | `frontend/components/layout/NavBar.tsx` |
| Modified | `frontend/features/auth/AuthCallback.tsx` |
