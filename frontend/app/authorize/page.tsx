// Network edition only (Google sign-in). NeuroDatics ships only the local edition, which never
// shows this; it is kept for self-hosting: docs/tecnica/alojamiento-en-red.md.

import { Suspense } from 'react'
import { AuthCallback } from '@/features/auth/AuthCallback'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AuthCallback />
    </Suspense>
  )
}
