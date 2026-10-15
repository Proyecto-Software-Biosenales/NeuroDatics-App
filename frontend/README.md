# NeuroDatics Frontend

Interfaz de NeuroDatics: Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn sobre Radix y Recharts.
El mismo código sirve a las dos ediciones; lo que cambia entre ellas se decide con `IS_LOCAL_MODE`
(`lib/appMode.ts`), que se fija al compilar a partir de `NEXT_PUBLIC_APP_MODE`.

| | Edición servidor | NeuroDatics Estudiantes |
| --- | --- | --- |
| Cómo se sirve | Servidor de Next en su propio contenedor del [stack Docker](../README.md) | Exportación estática (`frontend/.next-local`) que sirve el backend |
| Llamadas a la API | `/api` en el mismo origen; Next las reenvía al backend interno (`NEXT_INTERNAL_API_BASE_URL`) | `/api` en el mismo origen, atendido directamente por el backend |
| Sesión | Inicio de sesión con Google; el callback es `/authorize` | Sin cuenta: una sesión local fija |

## Estructura

```text
app/          páginas: inicio, proyectos (y su editor), dashboard, reportes, configuracion, login, authorize
features/     módulos por función: analytics, auth, home, projects, reports, settings
components/   controles compartidos (components/ui) y ayudas como FieldHint y HintTooltip
lib/          cliente de API, sesión, modo de la aplicación y proveedores
public/       logo y fuentes (Poppins se sirve desde aquí en las dos ediciones)
tests/        pruebas de hooks y componentes en Chromium, Playwright (e2e) y la prueba sin conexión (local)
```

Las convenciones de interfaz están en [docs/desarrollo/interfaz.md](../docs/desarrollo/interfaz.md).

## Comandos

```powershell
npm ci                          # instalar dependencias
npm run dev                     # servidor de desarrollo (necesita un backend en marcha)
npm test                        # typecheck + pruebas unitarias + pruebas en navegador
npm run lint                    # ESLint
npm run test:e2e                # Playwright con la API simulada
$env:NEXT_PUBLIC_APP_MODE = 'local'; npx next build   # exportación estática de la edición de estudiantes
```

La verificación completa del repositorio es `./verify.ps1` desde la raíz; el detalle de cada prueba está en
[CONTRIBUTING.md](../CONTRIBUTING.md).
