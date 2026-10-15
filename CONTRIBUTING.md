# Cómo contribuir a NeuroDatics

Cómo se prepara el entorno, cómo se verifica un cambio y qué reglas no se negocian.

## Preparar el entorno

| Herramienta | Para qué |
| --- | --- |
| Python 3.12 o posterior, con un entorno virtual en la raíz (`.venv`) | Backend y sus pruebas. `backend\.venv`, si existe, no es el bueno. |
| Node.js 20 o posterior y `npm ci` en `frontend` | Frontend, sus pruebas y la exportación estática. |
| Chromium de Playwright (`cd frontend; npx playwright install chromium`) | Pruebas de hooks y componentes en navegador real. |
| Docker Desktop | Solo para levantar la edición servidor completa. |
| PowerShell 7 | `verify.ps1` y los scripts de `student/` y `deployment/`. |

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install poetry
$env:POETRY_VIRTUALENVS_CREATE = 'false'   # instala en .venv, no en un entorno propio de Poetry
cd backend; ..\.venv\Scripts\python.exe -m poetry install; cd ..
cd frontend; npm ci; npx playwright install chromium; cd ..
```

## Dos ediciones, un solo código

NeuroDatics se construye una vez y se entrega dos veces desde el mismo `backend/` y el mismo `frontend/`: la
**edición servidor** (Docker Compose, inicio de sesión con Google, archivos en Google Drive, Redis, proxy) y
**NeuroDatics Estudiantes** (`APP_MODE=local`, Windows, sin internet, backend congelado con PyInstaller que sirve
el frontend como exportación estática, PostgreSQL 16 embebido y ffmpeg incluidos).

**Todo cambio tiene que funcionar también en la edición de estudiantes.** Solo quedan exentos el inicio de sesión
con Google, Google Drive y su OAuth, Docker, Redis, el proxy y el despliegue en red. Análisis, ingesta, informes,
pre-experimentos, cuestionarios, migraciones e interfaz aplican siempre; si dudas, asume que aplica.

Al escribir el cambio:

1. **Separa por edición solo lo que lo necesita:** `IS_LOCAL_MODE` (`frontend/lib/appMode.ts`) en el frontend y
   `settings.is_local` en el backend, nunca la URL. Oculta en local únicamente la parte de Google, Drive o Docker,
   no lo que la rodea.
2. **Archivos:** se leen y se escriben a través de `modules/integrations/storage_provider.py`; en local lo
   sustituye el almacenamiento en disco. Ninguna función importa el cliente de Drive.
3. **Sin red:** nada de fuentes, scripts, CDNs ni telemetría remotos. En local, cualquier conexión fuera de
   `127.0.0.1` es un error; la detecta la guarda sin conexión y `student/build.ps1` falla si la exportación
   contiene una fuente o un script remotos.
4. **Configuración nueva:** cada ajuste de `config/settings.py` necesita un valor por defecto que funcione en
   local, o fijarse en `apply_environment` (`backend/src/neurodatics/local/launcher.py`).
5. **Exportación estática del frontend:** sin route handlers en `app/api`, middleware, server actions,
   `cookies()`/`headers()` ni segmentos dinámicos sin `generateStaticParams`; `useSearchParams` va dentro de
   `<Suspense>`.
6. **Rutas con barra final:** en local el sitio estático atiende todo lo que no sea una ruta exacta, así que una
   ruta de colección llamada sin barra da 404. Llámala con barra (`/api/projects/`) o añádela a
   `API_PATH_ALIASES` (`backend/src/neurodatics/local/static_frontend.py`).
7. **Migraciones:** el lanzador las ejecuta al iniciar sobre el PostgreSQL 16 embebido; no uses extensiones que no
   vengan en el zip de EDB.
8. **Empaquetado (PyInstaller, `student/build.ps1`):**
   - una dependencia de Python nueva se fija en `student/requirements.txt` y `student/requirements-frozen.txt`
     (`student/check-pins.py` lo exige); si trae datos o plugins, añade su `--collect-*`;
   - un archivo de datos nuevo fuera de `backend/migrations`, `reports/application/assets` y
     `reports/infrastructure/templates` necesita su `--add-data`;
   - un módulo importado dinámicamente necesita su `--hidden-import`;
   - lo que viaja en el paquete va dentro de `_internal`: junto al exe solo pueden estar
     `neurodatics-estudiantes.exe` y `LEEME.txt`.
9. **Pruebas de la edición local:** una función visible para el usuario que aplique a local se cubre también en
   `frontend/tests/local/student-offline.spec.ts`.
10. **Guía del estudiante:** si cambia algo que el estudiante ve o hace, actualiza `student/LEEME.txt`, nunca la
    copia que viaja en el paquete.

Si el cambio toca `backend/src`, `backend/migrations`, `frontend/` o `student/`, el paquete de estudiantes queda
desactualizado: el procedimiento para reconstruirlo y entregarlo está en [student/README.md](student/README.md).

## Interfaz: consistencia antes que novedad

La aplicación debe verse limpia, espaciosa e igual en todas sus pantallas. Antes de tocar la interfaz, lee
[docs/desarrollo/interfaz.md](docs/desarrollo/interfaz.md). En resumen:

1. **Reutiliza antes de crear:** `components/ui`, `FieldHint`, `SectionTabs`, `SubTabs`, `Planning*`,
   `CreateProjectStep*`, `ProjectSaveProgress`, `InfoChip` y las clases `app-page-*`. Si dos pantallas necesitan
   lo mismo, extráelo a un componente compartido.
2. **Una sola entrada por acción.** Un proyecto se edita en `/proyectos/editar?proyecto=<id>`, tenga carpeta o no.
3. **Alineación entre elementos hermanos:** en una cuadrícula de tarjetas, el pie va al fondo
   (`flex flex-col` + `mt-auto`) y los botones equivalentes comparten tamaño y variante.
4. **Nada apeñuscado:** divide en pestañas lo que sería una lista larga y explica con `FieldHint`, no con letra
   pequeña bajo los campos.
5. **Texto en español llano**, dicho una vez, sin «(opcional)», ejemplos en los campos ni palabras técnicas.
6. **Compruébalo en pantalla:** con la API simulada en Playwright, fotografía a 1536×730 y a 390 px y mide lo
   que debe coincidir. Que pasen las pruebas no basta.

## La verificación: `./verify.ps1`

**`./verify.ps1` desde la raíz es la puerta única.** No se declara verde nada que no haya pasado por ahí. Se
detiene en la primera puerta que falla. En orden:

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
| Hooks y componentes en navegador | `npm run test:browser` | Un hook o un componente real falla en Chromium real. |
| Trinquete de ESLint | `eslint . --format json` | Se superó el umbral: **0 errores y como máximo 6 avisos**. |

El trinquete de ESLint no se sube para que pase un cambio. `verify.ps1` acepta `-MaxLintErrors` y
`-MaxLintWarnings` para poder bajarlo, no para relajarlo.

Las pruebas de Playwright (`frontend/tests/e2e/`) y la prueba de la edición de estudiantes no forman parte de
`verify.ps1`; se ejecutan aparte (ver más abajo).

## Los contratos de `backend/.importlinter`

Tres límites que mantienen separadas las capas del backend:

- **`analytics-processing`**: `modules.analytics` no puede depender de `modules.projects.application`; la
  analítica lee datos, no orquesta el ciclo de vida de un proyecto.
- **`processing-analytics`**: `modules.projects.application` no puede depender de `modules.analytics`. Los tres
  cruces que existían al escribir el contrato están declarados en `ignore_imports` con su motivo: sirven para
  invalidar las cachés al publicar una generación nueva. No se añaden entradas nuevas sin discutirlo; lo que
  corresponde es un puerto en `shared`, como `storage_provider`.
- **`shared-neutral`**: `shared` no puede depender de ningún `modules`.

## Goldens y snapshots

Están protegidos. **Nunca se regenera un golden o un snapshot existente para que pase una prueba que falla**: si
el valor cambió, explica por qué o corrige el código.

- Snapshots de syrupy en `backend/tests/characterization/__snapshots__/` (archivos `.ambr`).
- Líneas base numéricas de pytest-regressions en
  `backend/tests/characterization/test_numeric_characterization/` (archivos `.csv`), calculadas sobre el corpus
  sintético de `backend/tests/fixtures/golden/`.
- El inventario de rutas de `backend/tests/fixtures/route_inventory.json` se comporta igual: una ruta nueva se
  añade a conciencia, no porque la prueba lo pida.

Syrupy 4.6.1 no tiene `--snapshot-update-new-only`, así que un snapshot nuevo se genera en un directorio aislado
sin líneas base previas, se revisa y se confirma aparte. Ninguna bandera de actualización entra en la
verificación.

## Antes de borrar algo

- **Un endpoint huérfano no es un módulo muerto.** `modules/integrations/google_drive/` es la vía por la que
  analítica, subidas, borrados e informes llegan a Drive a través de `storage_provider.py`.
- **El código atado a un framework nunca está muerto por recuento de referencias:** manejadores, esquemas de
  Pydantic, modelos de SQLAlchemy, archivos del App Router de Next.js y reexportaciones en `__init__`. Las pruebas
  E2E de Playwright usan una API simulada: protegen el renderizado, no el backend.
- **`shadcn` es dependencia de ejecución** (`globals.css` importa su CSS) y **`jszip` se carga con
  `await import()`**, así que no tiene import estático.
- **Busca las dos formas de cada ajuste:** `settings.x` y `getattr(settings, "x")`. Los decoradores de FastAPI
  ocupan varias líneas, así que analiza las rutas en multilínea.
- **Una versión entregada puede seguir llamando a una ruta** que el frontend actual ya no usa: antes de retirar
  una superficie de API, compruébalo contra las entregas vigentes.

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

### Dónde vive cada prueba del frontend

- **Junto al módulo** (`features/**/*.test.mjs`, la ejecuta `test:unit`): lógica pura en Node, sin DOM ni React.
  Va aquí todo lo que se decide con entradas y salidas: cálculos, escalas, geometría, reducción de datos, textos.
- **En `tests/hooks/` y `tests/components/`** (las ejecuta `test:browser`): hooks y componentes montados en
  Chromium real a través de `tests/browserBundle.mjs`. Va aquí lo que solo se comprueba con un renderizado de
  verdad: efectos, cancelación de peticiones, foco, teclado y comportamiento de los controles de Radix.
- **En `tests/e2e/`**: Playwright sobre la aplicación en marcha con la API simulada; no entra en `verify.ps1`.

La prueba de la edición de estudiantes, `frontend/tests/local/student-offline.spec.ts`, la lanza
`student/run-frozen.ps1` (comprobación `serve`) contra el paquete real. A mano, contra cualquier aplicación local
ya iniciada:

```powershell
cd frontend
$env:STUDENT_BASE_URL = 'http://127.0.0.1:8765'
$env:STUDENT_RAW_FOLDER = '<carpeta de un experimento sin procesar>'   # sin ella se omite el flujo completo
npx playwright test -c playwright.local.config.ts
```

## Convenciones de documentación

- `docs/` guarda documentación que sigue siendo cierta, ordenada por público: `usuario/` (cómo se usa),
  `tecnica/` (cómo funciona) y `desarrollo/` (cómo se trabaja en el código). Su índice es
  [docs/README.md](docs/README.md).
- `docs/CHANGELOG.md` describe cambios observables por quien usa la aplicación, agrupados por versión.
- Los números que envejecen (recuentos de pruebas, cabezas de migración) no se fijan en la documentación: se
  explica cómo consultarlos.
- Las guías que viajan dentro de un paquete viven junto a él: `deployment/` para la edición servidor y
  `student/LEEME.txt` para la de estudiantes.
