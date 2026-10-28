'use client'

import Image from 'next/image'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

/** Shown in the student edition when the local session cannot be started: there is no sign-in to offer. */
export function LocalSessionUnavailable() {
  return (
    <Card className="w-full max-w-[26.5rem]">
      <CardHeader className="space-y-4 text-center">
        <Image src="/assets/NeuroDatics-logo.png" alt="Logotipo de NeuroDatics" width={52} height={56} className="mx-auto h-14 w-auto" priority />
        <div className="space-y-2">
          <CardTitle>NeuroDatics no está disponible</CardTitle>
          <CardDescription className="text-balance text-muted-foreground">
            No se pudo conectar con el programa. Comprueba que la ventana negra de NeuroDatics siga abierta; si la cerraste, ábrelo de nuevo.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Button className="w-full" onClick={() => window.location.reload()}>
          Reintentar
        </Button>
      </CardContent>
    </Card>
  )
}
