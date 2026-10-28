'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Image from 'next/image'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDeletionDialog } from '@/components/ConfirmDeletionDialog'
import { FieldHint } from '@/components/FieldHint'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LocalSessionUnavailable } from '@/features/auth/components/LocalSessionUnavailable'
import {
  createLocalProfile,
  deleteLocalProfile,
  listLocalProfiles,
  openLocalProfile,
  projectCountLabel,
  type LocalProfile,
} from '@/features/auth/localProfiles'
import { clearStoredAuthSession } from '@/lib/auth/sessionStore'
import { useAuth } from '@/lib/providers/AuthProvider'

// A full page load on purpose: it drops every in-memory cache of the previous profile.
// eslint-disable-next-line @next/next/no-location-assign-relative-destination
const enterProfile = () => window.location.assign('/proyectos')

function NewProfileForm({ submitLabel, welcome = false }: { submitLabel: string; welcome?: boolean }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('Escribe el nombre del perfil.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createLocalProfile(name)
      enterProfile()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo crear el perfil.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="profile-name">Nombre</Label>
          <FieldHint label="Qué es un perfil">
            Cada perfil tiene sus propios proyectos. Si varias personas usan este computador, crea uno para cada una.
          </FieldHint>
        </div>
        <Input
          id="profile-name"
          value={name}
          maxLength={60}
          autoComplete="off"
          autoFocus={welcome}
          disabled={saving}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
        />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className={welcome ? 'w-full' : 'w-full sm:w-auto'} disabled={saving}>
        {saving ? 'Creando…' : submitLabel}
      </Button>
    </form>
  )
}

function ProfileRow({
  profile,
  current,
  onDelete,
}: {
  profile: LocalProfile
  current: boolean
  onDelete: (profile: LocalProfile) => void
}) {
  const [opening, setOpening] = useState(false)

  const open = async () => {
    setOpening(true)
    try {
      await openLocalProfile(profile.id)
      enterProfile()
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : 'No se pudo abrir el perfil.')
      setOpening(false)
    }
  }

  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{profile.name}</p>
        <p className="text-sm text-muted-foreground">{projectCountLabel(profile.project_count)}</p>
      </div>
      <div className="flex w-24 justify-center">
        {current ? (
          <Badge variant="secondary">En uso</Badge>
        ) : (
          <Button variant="outline" size="sm" className="w-full" disabled={opening} onClick={() => void open()}>
            {opening ? 'Abriendo…' : 'Abrir'}
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-destructive"
        aria-label={`Eliminar el perfil «${profile.name}»`}
        onClick={() => onDelete(profile)}
      >
        <Trash2 aria-hidden />
      </Button>
    </li>
  )
}

/**
 * The local edition's replacement for signing in: who is using the program. With no profile it only
 * asks for a name; otherwise it lists the profiles to open one, create another or delete one.
 */
export function LocalProfiles() {
  const { currentUser } = useAuth()
  const [profiles, setProfiles] = useState<LocalProfile[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [deleting, setDeleting] = useState<LocalProfile | null>(null)

  const load = useCallback(async () => {
    try {
      setProfiles(await listLocalProfiles())
      setUnavailable(false)
    } catch {
      setUnavailable(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const remove = async (profile: LocalProfile) => {
    setDeleting(null)
    const loadingToastId = toast.loading(`Eliminando el perfil «${profile.name}»…`)
    try {
      await deleteLocalProfile(profile.id)
      if (profile.id === currentUser?.id) clearStoredAuthSession()
      toast.success(`Perfil «${profile.name}» eliminado.`)
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : `No se pudo eliminar el perfil «${profile.name}».`)
    } finally {
      toast.dismiss(loadingToastId)
      await load()
    }
  }

  if (unavailable || (profiles !== null && profiles.length === 0)) {
    return (
      <section className="app-page-shell px-4 py-8 sm:px-6 lg:px-8 2xl:py-12">
        <div className="mx-auto flex min-h-[calc(100svh-var(--app-nav-height)-4rem)] max-w-6xl items-center justify-center">
          {unavailable ? (
            <LocalSessionUnavailable />
          ) : (
            <Card className="w-full max-w-[26.5rem]">
              <CardHeader className="space-y-4 text-center">
                <div className="mx-auto rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
                  <Image src="/assets/NeuroDatics-logo.svg" alt="NeuroDatics" width={160} height={48} className="h-12 w-auto" priority />
                </div>
                <div className="space-y-2">
                  <CardTitle>Crea tu perfil</CardTitle>
                  <CardDescription className="text-balance text-muted-foreground">
                    Escribe tu nombre para empezar. Tus proyectos se guardarán en tu perfil.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <NewProfileForm submitLabel="Crear perfil" welcome />
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    )
  }

  if (profiles === null) {
    return (
      <div className="app-page-shell flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    )
  }

  return (
    <div className="app-page-shell">
      <div className="app-page-container max-w-3xl">
        <div className="app-page-header">
          <div>
            <h1 className="app-page-title">Perfiles</h1>
            <p className="app-page-description">Cada perfil tiene sus propios proyectos.</p>
          </div>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>En este computador</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {profiles.map((profile) => (
                  <ProfileRow
                    key={profile.id}
                    profile={profile}
                    current={profile.id === currentUser?.id}
                    onDelete={setDeleting}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Nuevo perfil</CardTitle>
            </CardHeader>
            <CardContent>
              <NewProfileForm submitLabel="Crear y abrir" />
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDeletionDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="¿Eliminar perfil?"
        description={
          deleting ? (
            <>
              Esta acción no se puede deshacer. Se eliminará el perfil{' '}
              <span className="font-semibold text-foreground">«{deleting.name}»</span>
              {deleting.project_count === 0
                ? '.'
                : deleting.project_count === 1
                  ? ' y se borrará de este computador su proyecto, con todos sus datos.'
                  : ` y se borrarán de este computador sus ${deleting.project_count} proyectos, con todos sus datos.`}
            </>
          ) : null
        }
        confirmLabel="Eliminar perfil"
        onConfirm={() => {
          if (deleting) void remove(deleting)
        }}
      />
    </div>
  )
}
