import type { Session, User } from '@supabase/supabase-js'

export interface SignUpResult {
  requiresEmailConfirmation: boolean
}

export interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUpWithPassword: (fullName: string, email: string, password: string) => Promise<SignUpResult>
  signOut: () => Promise<void>
}


