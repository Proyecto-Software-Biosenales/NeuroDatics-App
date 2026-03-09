# Google Login with Supabase

**Branch:** `google-login-implementation`
**Description:** Implement Google OAuth authentication using Supabase on the frontend, protecting app routes and displaying user info in the NavBar.

## Goal

Add a fully functional Google login flow powered by `@supabase/supabase-js` (already installed). Users who are not authenticated are redirected to a login page; after successful Google OAuth they land on the dashboard. The NavBar shows the logged-in user's name/avatar and a logout button.

> **Note:** This implementation is frontend-only. The backend is currently a placeholder and is not modified in this PR.

---

## Prerequisites

- You must be on branch `google-login-implementation`.
- You need a Supabase project. Add your credentials to `frontend/.env.local` (see Step 1).
- In the Supabase Dashboard → Authentication → URL Configuration, add the following to **Redirect URLs**:
  - `http://localhost:5173/auth/callback`
- In Supabase Dashboard → Authentication → Providers, enable **Google** and configure your Google OAuth credentials.

---

## Implementation Steps

### Step 1: Supabase Client & Environment Variables

**Files:**
- `frontend/.env.local` _(create — gitignored by default with Vite)_
- `frontend/src/shared/utils/supabase.ts` _(create)_

**What:** Create a `.env.local` file with placeholder slots for the Supabase URL and anonymous key, then instantiate and export the typed Supabase client from a shared utility module.

**Testing:**
- App starts without errors (`npm run dev` inside `NeuroDatics/`).
- No TypeScript errors on `supabase.ts`.
- Console shows no "missing environment variable" errors.

---

### Step 2: Auth Types & AuthProvider

**Files:**
- `frontend/src/shared/types/auth.ts` _(create)_
- `frontend/src/app/providers/AuthProvider.tsx` _(create)_
- `frontend/src/app/main.tsx` _(update — wrap `<App />` with `<AuthProvider>`)_

**What:** Define TypeScript types for the auth context. Create a React context that listens to Supabase's `onAuthStateChange` event, exposes `{ user, session, signInWithGoogle, signOut, loading }`, and wraps the entire component tree. Update `main.tsx` so every component has access to auth state.

**Testing:**
- `useAuth()` hook returns without throwing.
- `loading` is `true` briefly on page load then resolves to `false`.
- No console errors.

---

### Step 3: Login Page & OAuth Callback Component

**Files:**
- `frontend/src/features/auth/LoginPage.tsx` _(create)_
- `frontend/src/features/auth/AuthCallback.tsx` _(create)_

**What:** Build the `LoginPage` — a centered card with the NeuroDatics logo, a heading, and a "Continuar con Google" button that calls `signInWithGoogle()`. Build `AuthCallback` — a minimal component that waits for Supabase to exchange the OAuth code and then redirects to `/dashboard`.

**Testing:**
- Visiting `/login` renders the login card without errors.  
- Clicking "Continuar con Google" redirects to Google's consent screen.
- After granting access, the browser lands on `/auth/callback` and then immediately redirects to `/dashboard`.

---

### Step 4: Protected Routes, App Wiring & NavBar Update

**Files:**
- `frontend/src/app/routes/ProtectedRoute.tsx` _(create)_
- `frontend/src/app/App.tsx` _(update — replace inline `LoginButton`, add all routes)_
- `frontend/src/shared/components/NavBar.tsx` _(update — show user avatar/name, logout button)_

**What:** Create a `ProtectedRoute` component that redirects unauthenticated users to `/login`. Update `App.tsx` to replace the temporary `LoginButton` component with the real `LoginPage`, add `/auth/callback` and `/login` routes, and protect `/proyectos`, `/dashboard`, and `/reportes`. Update `NavBar` to display the logged-in user's avatar (from Google profile) or initials alongside a logout button that calls `signOut()`.

**Testing:**
- Opening `http://localhost:5173/` as an unauthenticated user → redirects to `/login`.
- After Google login → redirects to `/dashboard`.
- NavBar shows user name/avatar and a "Salir" button.
- Clicking "Salir" → signs out, NavBar resets, user is redirected to `/login`.
- Navigating directly to `/proyectos` while logged in → renders without redirect.
- Navigating directly to `/proyectos` while logged out → redirected to `/login`.
