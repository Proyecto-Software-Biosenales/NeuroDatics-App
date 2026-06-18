interface DevAdminConfig {
  email: string
  password: string
  displayName: string
}

const devAdminEmail = process.env.NEXT_PUBLIC_DEV_ADMIN_EMAIL?.trim() ?? ''
const devAdminPassword = process.env.NEXT_PUBLIC_DEV_ADMIN_PASSWORD?.trim() ?? ''
const devAdminDisplayName = process.env.NEXT_PUBLIC_DEV_ADMIN_DISPLAY_NAME?.trim() || 'Administrador NeuroDatics'

export const devAdminConfig: DevAdminConfig | null =
  devAdminEmail && devAdminPassword
    ? {
        email: devAdminEmail,
        password: devAdminPassword,
        displayName: devAdminDisplayName,
      }
    : null

export function matchesDevAdmin(email: string, password: string): boolean {
  if (!devAdminConfig) {
    return false
  }

  return email.trim().toLowerCase() === devAdminConfig.email.toLowerCase() && password === devAdminConfig.password
}
