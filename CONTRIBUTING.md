# Cómo contribuir a NeuroDatics

Este archivo explica cómo se verifica un cambio y qué reglas no se negocian. Las reglas de trabajo
completas, con el detalle de la edición de estudiantes, están en [AGENTS.md](AGENTS.md).

## Dos ediciones, un solo código

NeuroDatics se construye una vez y se entrega dos veces desde el mismo `backend/` y el mismo `frontend/`:
la **edición servidor** (Docker Compose, inicio de sesión con Google, archivos en Google Drive, Redis,
proxy) y **NeuroDatics Estudiantes** (`APP_MODE=local`, Windows, sin internet, backend congelado con
PyInstaller que sirve el frontend como exportación estática, PostgreSQL 16 embebido y ffmpeg incluidos).

**Todo cambio aplicable tiene que funcionar también en la edición de estudiantes.** Solo quedan exentos
el inicio de sesión con Google, Google Drive y su OAuth, Docker, Redis, el proxy y el despliegue en red.
Análisis, ingesta, informes, pre-experimentos, cuestionarios, migraciones e interfaz aplican siempre; si
dudas si algo aplica, asume que sí.

Lo mínimo que conviene recordar al escribir el cambio:

- Separa por edición solo lo que lo necesite: `IS_LOCAL_MODE` (`frontend/lib/appMode.ts`) en el frontend y
  `settings.is_local` en el backend. Nunca por la URL.
- Los archivos se leen y se escriben a través de `modules/integrations/storage_provider.py`; en local lo
  sustituye el almacenamiento en disco. Ninguna función importa el cliente de Drive.
- Sin red: nada de fuentes, scripts, CDNs ni telemetría remotos. En local, cualquier conexión fuera de
  `127.0.0.1` es un error, y el guard offline la detecta.
- Cada ajuste nuevo de `config/settings.py` necesita un valor por defecto que funcione en local, o fijarse
  en `apply_environment` (`backend/src/neurodatics/local/launcher.py`).
- El frontend local es una exportación estática: sin route handlers, middleware, server actions,
  `cookies()`/`headers()` ni segmentos dinámicos sin `generateStaticParams`; `useSearchParams` va dentro de
  `<Suspense>`.
- Las rutas de colección se llaman con barra final (`/api/projects/`) o se añaden a `API_PATH_ALIASES`
  (`backend/src/neurodatics/local/static_frontend.py`): el sitio estático atiende todo lo que no sea una
  ruta exacta.
- Una dependencia de Python nueva se fija en `student/requirements.txt` y `student/requirements-frozen.txt`;
  `student/check-pins.py` lo exige. Los datos, los plugins y los módulos importados dinámicamente necesitan
  su `--add-data`, `--collect-*` o `--hidden-import` en `student/build.ps1`.
- Si cambia algo que el estudiante ve o hace, actualiza `student/LEEME.txt` (español), nunca la copia que
  viaja en el paquete.

El detalle de la construcción y de las puertas del paquete está en [student/README.md](student/README.md).

## La verificación: `./verify.ps1`

**`./verify.ps1` desde la raíz es la puerta única.** No se declara verde nada que no haya pasado por ahí.
El entorno virtual de Python es el de la raíz (`.venv`); `backend\.venv` está incompleto. El navegador de
Playwright se instala una sola vez:

```powershell
cd frontend; npx playwright install chromium
cd ..; .\verify.ps1
```

El script se detiene en la primera puerta que falla. En orden:

| Puerta | Qué ejecuta | Qué significa que falle |
| --- | --- | --- |
| Pruebas del backend | `python -m pytest -q --disable-warnings` en `backend` | Una regresión de comportamiento, de contrato de API o de un golden. |
| Lint del backend | `ruff check src` (versión fijada) | Importaciones o variables sin usar, redefiniciones o código comentado (`F401`, `F811`, `F841`, `ERA001`). |
| Trinquete de código muerto | `vulture src tests vulture_whitelist.py --min-confidence 100` | Hay código inalcanzable nuevo, o algo vivo que necesita entrar en `vulture_whitelist.py` con su motivo. |
| Declaración de dependencias | `deptry .` | Una dependencia usada sin declarar, declarada sin usar o mal clasificada. |
| Arranque de la aplicación | importa `neurodatics.main` y cuenta las operaciones HTTP montadas | La aplicación no se importa: una ruta, un esquema o un ajuste rompe el arranque. |
| Contratos de importación | `lint-imports --no-cache` | Se cruzó uno de los límites de `backend/.importlinter` (abajo). |
| TypeScript | `tsc --noEmit` | Error de tipos en el frontend. |
| Pruebas unitarias del frontend | `npm run test:unit` | Una regresión en la lógica de `features/` (`node --test`). |
| Hooks y componentes en navegador | `npm run test:browser` | Un hook o un componente real falla en Chromium real; si el navegador no está instalado, instálalo con el comando de arriba. |
| Trinquete de ESLint | `eslint . --format json` | Se superó el umbral: **0 errores y como máximo 6 avisos**. |

El trinquete de ESLint no se sube para que pase un cambio. `verify.ps1` acepta `-MaxLintErrors` y
`-MaxLintWarnings` para poder bajarlo, no para relajarlo.

Las pruebas de Playwright (`frontend/tests/e2e/`) y la prueba de la edición estudiantes no forman parte de
`verify.ps1`; se ejecutan aparte (ver más abajo).

## Los contratos de `backend/.importlinter`

Tres límites que mantienen separadas las capas del backend:

- **`analytics-processing`**: `modules.analytics` no puede depender de `modules.projects.application`; la
  analítica lee datos, no orquesta el ciclo de vida de un proyecto.
- **`processing-analytics`**: `modules.projects.application.services` no puede depender de
  `modules.analytics`; la ingesta y el procesamiento no arrastran la analítica detrás.
- **`shared-neutral`**: `shared` no puede depender de ningún `modules`; los contratos compartidos se
  quedan neutros para que cualquier módulo pueda usarlos.

## Goldens y snapshots

Están protegidos. **Nunca se regenera un golden o un snapshot existente para que pase una prueba que
falla**: si el valor cambió, explica por qué o corrige el código.

- Snapshots de syrupy en `backend/tests/characterization/__snapshots__/` (archivos `.ambr`).
- Líneas base numéricas de pytest-regressions en
  `backend/tests/characterization/test_numeric_characterization/` (archivos `.csv`), calculadas sobre el
  corpus sintético de `backend/tests/fixtures/golden/`.
- El inventario de rutas de `backend/tests/fixtures/route_inventory.json` se comporta igual: una ruta nueva
  se añade a conciencia, no porque la prueba lo pida.

Syrupy 4.6.1 no tiene `--snapshot-update-new-only`, así que un snapshot nuevo se genera en un directorio
aislado sin líneas base previas, se revisa y se confirma aparte. Ninguna bandera de actualización entra en
la verificación.

## Ejecutar las pruebas por partes

Backend, desde `backend` y con el Python de la raíz:

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest                       # todo
..\.venv\Scripts\python.exe -m pytest tests/unit -q         # una carpeta
```

Frontend, desde `frontend`:

```powershell
npm test                        # typecheck + test:unit + test:browser, lo que mira verify.ps1
npm run test:unit               # node --test sobre features/
npm run test:browser            # node --test de hooks y componentes en Chromium real
npm run typecheck               # tsc --noEmit
npm run lint                    # eslint
npm run test:e2e                # Playwright sobre tests/e2e (levanta el servidor de desarrollo)
npm run test:e2e:comparison     # solo el panel de comparación
```

`npm test` agrupa las tres puertas de frontend que `verify.ps1` ejecuta sin navegador completo; el
trinquete de ESLint sigue siendo suyo porque cuenta avisos contra un umbral.

### Dónde vive cada prueba del frontend

Las dos ubicaciones no son dos convenciones para lo mismo: separan qué capa se prueba.

- **Co-locada junto al módulo** (`features/**/*.test.mjs`, la ejecuta `test:unit`): lógica pura en Node.
  La prueba transpila el módulo y lo ejecuta sin DOM ni React. Va aquí todo lo que se pueda decidir con
  entradas y salidas: cálculos, escalas, geometría, reducción de datos, formato de textos.
- **En `tests/hooks/` y `tests/components/`** (las ejecuta `test:browser`): hooks y componentes montados en
  Chromium real a través de `tests/browserBundle.mjs`. Va aquí lo que solo se puede comprobar con un
  renderizado de verdad: efectos, cancelación de peticiones, foco, teclado y comportamiento de los
  controles de Radix.

Un mismo asunto puede tener prueba en los dos sitios y ninguna sobra: la caché de analítica se decide en
`features/analytics/analyticsCache.test.mjs` y se monta en `tests/hooks/analytics-cache.test.mjs`, y lo que
deriva la vista de calidad EEG se calcula en `features/analytics/eegPresentation.test.mjs` mientras
`tests/components/eeg-quality-surface.test.mjs` comprueba los paneles con eventos reales.
Las pruebas de `tests/e2e/` son de Playwright sobre la aplicación en marcha y no entran en `verify.ps1`.

La prueba de la edición estudiantes, `frontend/tests/local/student-offline.spec.ts`, **no la ejecuta ningún
script de npm**: necesita el paquete real en marcha y la lanza `student/run-frozen.ps1` (puerta `serve`) con
`playwright.local.config.ts`. A mano, contra cualquier aplicación local ya iniciada:

```powershell
cd frontend
$env:STUDENT_BASE_URL = 'http://127.0.0.1:8765'
$env:STUDENT_RAW_FOLDER = '<carpeta de un experimento sin procesar>'   # sin ella se omite el flujo completo
npx playwright test -c playwright.local.config.ts
```

Si añades una función visible para el usuario y aplica a la edición local, cúbrela también en esa prueba.

## Convenciones de documentación

- `docs/` guarda documentación **técnica y de usuario que sigue siendo cierta**: cómo funciona una parte del
  sistema, cómo se usa una función, cómo se despliega. Su índice es [docs/README.md](docs/README.md) y la
  vista de conjunto, [docs/arquitectura.md](docs/arquitectura.md).
- La bitácora de campañas y los traspasos de tareas **ya no viven en el repositorio**. Si necesitas
  recuperar una nota retirada, está en el historial de Git.
- `docs/CHANGELOG.md` describe cambios observables por el usuario: qué cambió, por qué importa y cómo se
  comprobó. No es un registro de tareas ni de mediciones internas.
- Los números que envejecen (recuentos de pruebas, de avisos, cabezas de migración) no se fijan en la
  documentación: se explica cómo consultarlos.
- `README.md` presenta las dos ediciones y el arranque; `backend/README.md`, el backend;
  `student/README.md`, la construcción del paquete de estudiantes; `student/LEEME.txt`, la guía que lee el
  estudiante (en español).
