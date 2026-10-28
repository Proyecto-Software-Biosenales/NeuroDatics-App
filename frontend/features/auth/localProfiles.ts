import { storeLocalSession, type LocalSessionResponse } from '@/lib/auth/localAuth'

export interface LocalProfile {
  id: string
  name: string
  project_count: number
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json' } })
  } catch {
    throw new Error('No se pudo conectar con NeuroDatics.')
  }
  if (!response.ok) {
    const detail = await response.json().then((body) => body?.detail, () => null)
    throw new Error(typeof detail === 'string' ? detail : `Error ${response.status}`)
  }
  return response.json() as Promise<T>
}

export const listLocalProfiles = () => request<LocalProfile[]>('/api/auth/profiles')

export async function createLocalProfile(name: string) {
  storeLocalSession(await request<LocalSessionResponse>('/api/auth/profiles', { method: 'POST', body: JSON.stringify({ name }) }))
}

export async function openLocalProfile(profileId: string) {
  storeLocalSession(
    await request<LocalSessionResponse>('/api/auth/local-session', {
      method: 'POST',
      body: JSON.stringify({ profile_id: profileId }),
    }),
  )
}

export const deleteLocalProfile = (profileId: string) =>
  request<{ deleted_projects: number }>(`/api/auth/profiles/${encodeURIComponent(profileId)}`, { method: 'DELETE' })

export const projectCountLabel = (count: number) =>
  count === 0 ? 'Sin proyectos' : `${count} proyecto${count === 1 ? '' : 's'}`
