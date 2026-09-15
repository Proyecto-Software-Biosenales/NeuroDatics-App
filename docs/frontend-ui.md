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
| Pasos de reportes | `ReportStepCard` |
| KPI y estadísticas | `features/analytics/components/KpiCard` y `StatisticsTable` |

Las variantes definen colores, foco y estados deshabilitados. Los consumidores añaden principalmente distribución y dimensiones. Evitar copiar las clases internas de una base en cada pantalla.

Las superficies de interfaz usan `background`, `card`, `muted`, `foreground`, `border`, `primary` y `destructive`. Se conservan las escalas de color científicas, colores de canales y AOIs, y fondos necesarios para que los logotipos sean legibles.

### Adaptaciones deliberadas

- `Card` mantiene la densidad anterior mediante espaciado compartido, títulos semánticos y ausencia de recorte de contenido.
- `Select` abre en modo `popper`, alineado al inicio. Los valores nulos de dominio se traducen a cadena vacía en los consumidores.
- `Slider` propaga el nombre accesible al thumb. Sus callbacks entregan valores numéricos, no eventos de inputs nativos.
- `AnalyticsTabs` usa activación manual por teclado y un único contenedor de contenido para conservar el estado de EEG entre vistas.
- Las tarjetas KPI tienen un botón real para seleccionar y otro independiente para el tooltip; no simulan botones con `div` y eventos de teclado.
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
npm run test:comparison-click
npm run test:hooks
npm run test:e2e
npm run build
```

Las pruebas cubren selección inicial de Dashboard, preservación del estado EEG, comparativas, scroll de tablas, formularios de proyectos, carga/cancelación, selectores en diálogos, radios de reportes, exportación, teclado y foco.

`tests/e2e/ui-consistency.spec.ts` recorre Inicio, login, registro, proyectos, reportes configurados y Dashboard a 390, 768, 1366 y 1920 px, con temas claro y oscuro. Comprueba errores de navegador, contenido esperado y ausencia de scroll horizontal del documento. Las capturas son referencias de revisión humana, no snapshots que acepten diferencias automáticamente.

```powershell
$env:UI_CAPTURE='after'
npx playwright test tests/e2e/ui-consistency.spec.ts
```

Las imágenes se guardan en `.next/ui-refactor/after`; las referencias de esta migración están en `.next/ui-refactor/before`. Son artefactos locales y pueden regenerarse. Las capturas finales de autenticación se realizan sin sesión; las iniciales con sesión reflejaban su redirección a Dashboard.

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
| `features/analytics/components/TimeWindowControls.tsx` | Button, Input, Label |
| `features/auth/components/LoginForm.tsx` | Button |
| `features/auth/components/RegisterForm.tsx` | Button |
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
