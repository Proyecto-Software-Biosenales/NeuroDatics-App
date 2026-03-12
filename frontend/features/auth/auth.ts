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


