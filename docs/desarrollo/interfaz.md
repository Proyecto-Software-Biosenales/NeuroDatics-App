# Convenciones de UI del frontend

## Fuente única

Los controles generales se importan desde `@/components/ui`. Se usa shadcn con el estilo `radix-nova`, Radix, Lucide y los tokens de `app/globals.css`.

- Antes de crear un control, revisar los componentes instalados. Si falta una base estándar, incorporarla desde el registro de shadcn correspondiente a Radix.
- Conservar `cn` de `@/lib/utils`. Revisar los imports y dependencias generados por el CLI antes de aceptar una incorporación; no instalar otra utilidad para concatenar clases.
- No importar Radix directamente desde páginas o features. No recrear botones, selects, radios, sliders, tablas, etiquetas o desplegables con HTML y manejadores propios.
- Usar nombres de archivo e imports con el mismo casing. Las bases usan minúsculas (`card`, `select`); los componentes de dominio usan PascalCase.
- Crear composiciones solamente para una necesidad de dominio o presentación repetida. El estado y las peticiones siguen en los controladores existentes.

## Controles y estilos

| Necesidad | Base o composición |
| --- | --- |
| Acción principal, envío, descarga | `Button`, variante `default`; declarar `type="submit"` para enviar formularios |
| Acción secundaria | `Button`, variante `outline` |
| Acción discreta o icono | `Button`, variante `ghost`, tamaño `icon-*` y nombre accesible |
| Acción destructiva | `Button` / `DropdownMenuItem`, variante `destructive` |
| Activar/desactivar una vista | `Button`, variante `selection`, con `aria-pressed` |
| Campos y etiquetas | `Input`, `Textarea`, `Label`; asociar etiquetas con `htmlFor`/`id` |
| Opciones múltiples / exclusivas | `Checkbox` / `RadioGroup` + `RadioGroupItem` |
| Selector simple | `Select`; no añadir búsqueda a los selectores existentes |
| Pestañas de analítica | `AnalyticsTabs`, compuesto con `Tabs` de shadcn |
| Desplegables | `Collapsible`; conservar el estado controlado cuando pertenece a la pantalla |
| Ventanas y menús | `Dialog`, `AlertDialog`, `DropdownMenu`, `Popover`, `Tooltip` |
| Tablas | `Table` y sus subcomponentes; `Table` ya incorpora un contenedor con scroll |
| Indicadores | `Badge`, `Skeleton`, `Progress` |
| Canales y modos de analítica | `EegChannelSelector`, `AnalyticsModeSelector` |
| Progreso de creación/edición | `ProjectSaveProgress` |
| Secciones de un formulario de proyecto (crear y editar) | `features/projects/components/SectionTabs`, dentro de `Tabs` |
| Subsecciones dentro de una sección («Antes» / «Después» / «Respuestas») | `features/projects/components/SubTabs` |
| Explicación de un campo, opción o sección | `components/FieldHint` junto a la etiqueta; nunca letra pequeña debajo |
| Definición breve de un modo, una vista o un sensor | `components/HintTooltip` alrededor del control, sin cambiar su aspecto; en `AnalyticsModeSelector` y `AnalyticsTabs`, mediante `hint` de cada opción |
| Cuestionarios de antes y después | `PlanningQuestionnaires` (crear y editar los comparten) |
| Pasos de reportes | `ReportStepCard` |
| KPI y estadísticas | `features/analytics/components/KpiCard` y `StatisticsTable` |
| Salvedad, aviso o salto junto a una gráfica | `features/analytics/components/InfoChip`; en gráficas Recharts, mediante `notes` de `AnalyticsChartShell`; en vistas canvas, en la fila de la barra de color |

Las variantes definen colores, foco y estados deshabilitados. Los consumidores añaden principalmente distribución y dimensiones. Evitar copiar las clases internas de una base en cada pantalla.

Las superficies de interfaz usan `background`, `card`, `muted`, `foreground`, `border`, `primary` y `destructive`. Se conservan las escalas de color científicas, colores de canales y AOIs, y fondos necesarios para que los logotipos sean legibles.

## Consistencia visual

Lo mismo se ve igual en toda la aplicación. Estas reglas existen por errores que ya pasaron:

- **Una función, un componente.** Crear y editar un proyecto usan las mismas pestañas (`SectionTabs`) y
  las mismas secciones (`Planning*`, `CreateProjectStep2/3/4`). Si una pantalla nueva necesita algo que
  ya existe en otra, se reutiliza o se extrae a un componente compartido; no se copia con otras clases.
- **Una entrada por acción.** Un objeto se edita desde un solo lugar. No se añaden al menú dos opciones
  que llevan a configurar lo mismo (antes había «Editar» y «Pre-experimento y cuestionarios»).
- **Tarjetas de una cuadrícula.** La tarjeta es `flex flex-col` y su pie lleva `mt-auto`, para que la
  línea del pie quede a la misma altura en todas las tarjetas de una fila aunque una no tenga sensores.
  Las filas que pueden quedar vacías reservan su altura (`min-h-*`). Los botones que ocupan el mismo
  lugar en tarjetas distintas tienen el mismo tamaño y variante (`size="sm" variant="outline"`).
- **Encabezado de página.** `app-page-header` con el nombre del objeto como título (no una etiqueta
  genérica como «Pre-experimento») y su descripción debajo, si la tiene. Las acciones de navegación van
  a la derecha del título.
- **Espacio.** Un formulario con muchas partes se divide en pestañas arriba, no en una lista vertical
  de desplegables. Los desplegables (`Collapsible`, `PlanningSection`) se usan solo dentro de una
  sección, para elementos repetidos (participantes, escenarios, respuestas). Los formularios de página
  usan `max-w-6xl`; el contenido de una sección no lleva un título que repita el de su pestaña.
- **Pie de guardado.** Una página editable termina con una sola barra: el aviso «Hay cambios sin
  guardar» a la izquierda y **Descartar cambios** / **Guardar cambios** a la derecha.
- **Filas de campos.** Los campos de una misma fila empiezan a la misma altura: la fila de la etiqueta
  mide `h-5` lleve o no `FieldHint` (el icono mide más que la etiqueta y empuja su campo 2 px). Los
  datos cortos de una fila comparten columnas iguales, y el texto libre va debajo, con los mismos
  bordes que la fila. Una tarjeta tiene el mismo margen
  interior arriba que a los lados, también cuando empieza con pestañas. Las pestañas de `SectionTabs`
  reservan siempre la línea de estado para que iconos y nombres queden en la misma línea.
- **Pestañas que no caben.** Una tira de pestañas que puede desbordarse se desplaza en horizontal y se
  alinea al inicio (`justify-start`): la base `TabsList` centra, y un contenido centrado que se desborda
  deja las primeras pestañas fuera de alcance.

Para comprobarlo, se mira la pantalla, no solo el código: con la API simulada en Playwright (como en
`tests/e2e/screen-settings.spec.ts`), se fotografía a 1536×730 (un portátil habitual) y a 390 px,
y se miden las alineaciones que importan (por ejemplo, la altura de la línea del pie de cada tarjeta) y
que no haya scroll horizontal del documento.

### Adaptaciones deliberadas

- `Card` mantiene la densidad anterior mediante espaciado compartido, títulos semánticos y ausencia de recorte de contenido.
- `Select` abre en modo `popper`, alineado al inicio. Los valores nulos de dominio se traducen a cadena vacía en los consumidores.
- `Slider` propaga el nombre accesible al thumb. Sus callbacks entregan valores numéricos, no eventos de inputs nativos.
- `AnalyticsTabs` usa activación manual por teclado y un único contenedor de contenido para conservar el estado de EEG entre vistas.
- Las tarjetas KPI tienen un botón real para seleccionar y otro independiente para el tooltip; no simulan botones con `div` y eventos de teclado.
- `InfoChip` es un `Button` outline `xs` con `Tooltip`. Con `onClick` actúa (por ejemplo, salta a una sección y le pasa el foco); sin acción, un clic o un toque abre su explicación, porque el tooltip de Radix no se abre en pantallas táctiles. Las explicaciones junto a una gráfica van en fichas, no en párrafos ni cajas ámbar; los avisos completos de una pestaña la cierran, y la ficha de la gráfica lleva hasta ellos.
- En pantallas menores de 768 px, Dashboard inicia con el panel compacto. El proyecto sigue desplegado en su estado interno y el sensor está seleccionado. Expandir el panel muestra los proyectos por encima del contenido. La navegación superior usa `DropdownMenu`.

## Excepciones

1. El input oculto `type="file"` de `CreateProjectStep1` conserva `webkitdirectory`/`mozdirectory`, referencias y eventos de selección de carpetas. El área de arrastre es una interacción especializada y cuenta con un `Button` accesible para abrir el selector.
2. Recharts, canvas, SVG de estímulos, geometría AOI, escalas científicas y su interacción permanecen en sus componentes especializados. Sus controles externos usan las bases compartidas.
3. Los contenedores de distribución, regiones, leyendas y agrupaciones de datos pueden usar HTML semántico. No representan una alternativa a los controles de shadcn.
4. Las imágenes de estímulos conservan sus medidas naturales y coordenadas; esta refactorización no cambia su estrategia de carga.

ESLint restringe controles nativos e imports de primitivas fuera de `components/ui`. La excepción para inputs de archivo está explícita en la configuración.

## Validación

Ejecutar desde `frontend`:

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run test:browser
npm run test:e2e
npm run build
```

Las pruebas cubren selección inicial de Dashboard, preservación del estado EEG, comparativas, scroll de tablas, formularios de proyectos, carga/cancelación, selectores en diálogos, radios de reportes, exportación, teclado y foco.

`tests/e2e/ui-consistency.spec.ts` recorre Inicio, login con Google, proyectos, reportes configurados y Dashboard a 390, 768, 1366 y 1920 px, con temas claro y oscuro. Comprueba errores de navegador, contenido esperado y ausencia de scroll horizontal del documento. Se recorre sin sesión en login y con sesión en el resto.

```powershell
npx playwright test tests/e2e/ui-consistency.spec.ts
```

El punto de partida tenía seis advertencias de ESLint sobre imágenes de estímulos (`no-img-element`), sin errores. No se ocultan esas advertencias.

## Inventario de migraci?n

Controles HTML identificados en la primera pasada, agrupados por consumidor. Los nombres siguientes son las bases de destino; algunas se integraron despu?s en las composiciones anteriores. Las sustituciones manuales adicionales se resumen al final.

| Consumidor (ruta relativa a frontend) | Bases reutilizadas |
| --- | --- |
| `app/dashboard/page.tsx` | Button |
| `components/layout/NavBar.tsx` | Button |
| `features/analytics/comparison/ComparisonStatistics.tsx` | Table, TableBody, TableCell, TableHead, TableHeader, TableRow |
| `features/analytics/comparison/ComparisonTab.tsx` | Button |
| `features/analytics/comparison/CorrelationMatrixSection.tsx` | Skeleton, Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow |
| `features/analytics/comparison/SpatialPanels.tsx` | Skeleton |
| `features/analytics/comparison/VisualizationSelector.tsx` | Label |
| `features/analytics/components/AnalyticsSidebar.tsx` | Button |
| `features/analytics/components/AoiComparisonTab.tsx` | Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow |
| `features/analytics/components/AoiOverlay.tsx` | Button, Skeleton |
| `features/analytics/components/ChartDragZoom.tsx` | Button |
| `features/analytics/components/DeviceDistanceTab.tsx` | Button, Skeleton |
| `features/analytics/components/eeg/EegPsdView.tsx` | Button, Skeleton |
| `features/analytics/components/eeg/EegSpectrogramView.tsx` | Button, Skeleton |
| `features/analytics/components/eeg/EegStatsTables.tsx` | Table, TableBody, TableCell, TableHead, TableHeader, TableRow |
| `features/analytics/components/eeg/EegTimeseriesView.tsx` | Button, Skeleton |
| `features/analytics/components/eeg/EegTopographyView.tsx` | Button, Skeleton |
| `features/analytics/components/FixationDurationControl.tsx` | Label |
| `features/analytics/components/FixationHistogramTab.tsx` | Button, Skeleton, Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow |
| `features/analytics/components/GazePointTab.tsx` | Button, Skeleton |
| `features/analytics/components/GsrTab.tsx` | Button, Skeleton |
| `features/analytics/components/HeatmapTab.tsx` | Button, Skeleton |
| `features/analytics/components/KpiCard.tsx` | Skeleton |
| `features/analytics/components/PupilDilationTab.tsx` | Button, Skeleton |
| `features/analytics/components/ScanpathTab.tsx` | Button, Skeleton |
| `features/analytics/components/StatisticsTable.tsx` | Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow |
| `features/analytics/components/StimulusFixationCard.tsx` | Button, Skeleton |
| `features/analytics/components/TimeWindowControls.tsx` | Button, Input, Label, Popover |
| `features/auth/components/LoginForm.tsx` | Button |
| `features/projects/components/EditProjectDialog.tsx` | Button |
| `features/projects/components/ProjectsGrid.tsx` | Button, Skeleton |
| `features/projects/components/ViewProjectDialog.tsx` | Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow |
| `features/projects/create-project/components/AoiEditor.tsx` | Button, Input, Label |
| `features/projects/create-project/CreateProjectDialog.tsx` | Button |
| `features/projects/create-project/CreateProjectStep1.tsx` | Button |
| `features/projects/create-project/CreateProjectStep2.tsx` | Button |
| `features/projects/create-project/CreateProjectStep3.tsx` | Button |
| `features/projects/create-project/CreateProjectStep4.tsx` | Button |
| `features/reports/components/ExportOptionsCard.tsx` | Button, Label |
| `features/reports/components/ReportConfigurationCard.tsx` | Label |
| `features/reports/components/ReportScopeCard.tsx` | Label |

Migraciones adicionales: `Combobox` ? `Select` en filtros y selecci?n de proyectos/reportes; radios y casillas en reportes y asistente; `Slider` en scanpath/topograf?a; `Collapsible` en proyectos, participantes, escenarios y comparativas; `Popover` en selecci?n de visualizaciones; controles KPI accesibles; `Badge` en sensores; panel de progreso compartido.
