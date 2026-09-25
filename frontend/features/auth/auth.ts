export interface AppUser {
  id: string
  email: string | null
  name: string | null
}

export interface AuthSession {
  accessToken: string
  tokenType: string
  expiresAt: string | null
}

export interface AuthContextType {
  currentUser: AppUser | null
  session: AuthSession | null
  loading: boolean
  signOut: () => Promise<void>
}
