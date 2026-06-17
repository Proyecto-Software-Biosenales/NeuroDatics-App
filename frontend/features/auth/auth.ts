export type AuthSource = 'google-oauth' | 'local-dev-admin'

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

export interface AuthSession {
  accessToken: string
  tokenType: string
  expiresAt: string | null
}

export interface SignUpResult {
  requiresEmailConfirmation: boolean
}

export interface AuthContextType {
  currentUser: AppUser | null
  session: AuthSession | null
  loading: boolean
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUpWithPassword: (fullName: string, email: string, password: string) => Promise<SignUpResult>
  signOut: () => Promise<void>
}


