'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Image from 'next/image'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDeletionDialog } from '@/components/ConfirmDeletionDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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

  // The placeholder names the field; aria-label keeps that name once the placeholder is gone.
  const field = (
    <Input
      id="profile-name"
      aria-label="Nombre"
      placeholder="Nombre"
      value={name}
      maxLength={60}
      autoComplete="off"
      spellCheck={false}
      autoFocus={welcome}
      disabled={saving}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? 'profile-name-error' : undefined}
      className="h-11 px-3.5 md:text-base"
      onChange={(event) => {
        setName(event.target.value)
        setError(null)
      }}
    />
  )
  const errorMessage = error && <p id="profile-name-error" role="alert" className="text-sm text-destructive">{error}</p>
  const submitButton = (
    <Button type="submit" className={welcome ? 'h-11 w-full text-base' : 'h-11 w-full px-5 sm:w-auto'} disabled={saving}>
      {saving ? 'Creando…' : submitLabel}
    </Button>
  )

  // Welcome stacks field, message and button; the list puts the button beside the field.
  return welcome ? (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-3">
      <div className="space-y-2">
        {field}
        {errorMessage}
      </div>
      {submitButton}
    </form>
  ) : (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-2">
      <div className="flex flex-col gap-3 sm:flex-row">
        {field}
        {submitButton}
      </div>
      {errorMessage}
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
            // No card: a single centred column, set a little above the middle like most sign-up pages.
            <div className="w-full max-w-sm -translate-y-[6vh] text-center">
              <Image src="/assets/NeuroDatics-logo.png" alt="Logotipo de NeuroDatics" width={52} height={56} className="mx-auto h-12 w-auto" priority />
              <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">Crea tu perfil</h1>
              <p className="mt-2 text-sm text-muted-foreground">Escribe tu nombre para empezar.</p>
              <div className="mt-8 text-left">
                <NewProfileForm submitLabel="Crear" welcome />
              </div>
              <p className="mt-6 text-balance text-xs leading-relaxed text-muted-foreground">
                Cada perfil guarda sus propios proyectos, solo en este computador.
              </p>
            </div>
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
