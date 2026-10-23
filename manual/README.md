# Manual de uso

El manual de uso se escribe en Markdown, en `fuentes/` (un archivo por capítulo, de `00-inicio.md` a
`12-glosario.md`), y se convierte en un documento de Word con el estilo de las guías de instalación. Las figuras están
en `figuras/` y las fuentes tipográficas (Old Standard TT y PT Serif) en `estilo/fuentes/`; instálalas en Windows
antes de abrir el documento en Word. El .docx y el PDF no se guardan en git: se generan y se entregan como adjuntos.

## Figuras

Las toma Playwright sobre la interfaz con la API simulada y datos sintéticos, sin servidor ni cuenta de Google. Cada
figura es un `test` de `frontend/tests/manual/manual_figures.spec.ts`, con el id de la figura en su nombre:

```powershell
cd frontend
npx playwright test -c playwright.manual.config.ts manual_figures
npx playwright test -c playwright.manual.config.ts manual_figures -g "5-4 "
```

Sobrescriben `manual/figuras/<id>.png` y dejan el recorte en `output/manual/figuras/<id>.json`. Las simulaciones
están en `manualMocks.ts` (proyectos y asistente) y `manualDashboardMocks.ts` (Dashboard); las llamadas rojas, en
`manualAnnotate.ts`. Con `-g`, termina el id con un espacio para no rehacer también 5-10, 5-11…

## Documento

Necesita el entorno de `output/manual/toolchain` (docx-js, un venv con lxml y `render.ps1`) y Word instalado:

```powershell
node manual\construir_manual.js
& .\output\manual\toolchain\render.ps1 -Docx output\manual\build\NeuroDatics-Manual-de-uso.docx -Dpi 100
```

El primero escribe `output/manual/build/NeuroDatics-Manual-de-uso.docx` y avisa de referencias o figuras que
falten. El segundo lo abre en Word (en una instancia propia), actualiza el índice y los números de página, lo guarda,
exporta el PDF y deja una imagen por página en `output/manual/build/NeuroDatics-Manual-de-uso-render/` para revisarlo.
Ejecútalo desde PowerShell 7: lanzado con Windows PowerShell desde Bash, Word se queda colgado.

La sintaxis de las fuentes (referencias `[[ref:…]]`, figuras `![[fig:…|pie|w=5.3]]`, avisos `::: nota`, etiquetas
`{servidor}` y `{estudiantes}`, anchos de tabla) está descrita al principio de `construir_manual.js`.

## Versión anterior

`manual_usuario_neurodatics.md`, `assets/screenshots/` y `build_manual_pdf.py` son la primera versión del manual
(Markdown y PDF con reportlab, capturas con `npm run capture:manual`). Quedan hasta que se decida retirarlos.
