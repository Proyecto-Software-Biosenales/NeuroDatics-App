# Instrucción de implementación: comparar participantes

Implementa en NeuroDatics la comparación de una misma gráfica entre participantes. Entrega la funcionalidad operativa y verificada; no te limites a proponer un plan.

## Resultado requerido

- Añade un botón pequeño «Comparar participantes» arriba a la derecha del encabezado de las gráficas analíticas, sin interferir con zoom ni exportación. Usa una integración reutilizable en las vistas individuales y los paneles de la comparativa existente.
- Al pulsarlo, abre un diálogo que ocupe el área completa de la aplicación. Presenta una cuadrícula similar a la comparativa actual, con **una tarjeta por participante y el mismo tipo de gráfica en todas**. No superpongas participantes en una única gráfica.
- Incluye título de gráfica, escenario, selector con búsqueda, «Seleccionar todos», «Quitar selección» y contador. Selecciona inicialmente todos los participantes del proyecto; utiliza sus códigos reales y un orden estable.
- Conserva los parámetros de la gráfica de origen: escenario, canales, unidades, suavizado, normalización y demás filtros aplicables. Cada tarjeta debe identificar al participante y mostrar individualmente carga, ausencia de datos o error con reintento. Una falla no bloquea las demás.
- Cierra mediante botón y Escape, gestiona el foco y restaura la vista original sin perder su selección, filtros, zoom ni desplazamiento. Evita abrir comparaciones anidadas desde las tarjetas. Mantén textos en español, diseño adaptable y estilos del proyecto.

## Contexto técnico comprobado

La interfaz usa React/Next.js y Recharts, con renderizadores específicos para algunas vistas. Consulta principalmente:

- `frontend/features/analytics/comparison/{ComparisonTab.tsx,ComparisonCharts.tsx,useComparisonData.ts,registry.ts}`.
- `frontend/features/analytics/components/AnalyticsChartShell.tsx`, los componentes `*Tab.tsx`, `components/eeg/` y `frontend/components/ui/dialog.tsx`.
- `frontend/features/analytics/{api/analyticsApi.ts,hooks/useAnalyticsData.ts,types.ts}`.
- `backend/src/neurodatics/modules/analytics/api/routes.py`, `application/services/comparison_chart_config.py` e `infrastructure/{parquet_cache.py,redis_cache.py}`.

Las consultas actuales reciben un participante. El endpoint `comparison/charts` acepta visualizaciones y `max_points`; las series temporales usan habitualmente 5.000 puntos. Hay caché de archivos y resultados en backend y cancelación de peticiones en frontend. `useComparisonData` puede solicitar tanto configuraciones como series de una misma señal: no lo multipliques indiscriminadamente por participante ni montes pestañas completas que carguen información ajena a la gráfica elegida.

Reutiliza renderizadores y contratos vigentes. Cubre las visualizaciones existentes que admitan comparación individual, incluidas las variantes EEG; el registro de comparación no incluye necesariamente todas las vistas individuales. Explica en la interfaz cualquier restricción real, como un mapa espacial que requiere un escenario concreto. No amplíes esta tarea a nuevas métricas o análisis estadísticos.

## Rendimiento y fidelidad

- Con el diálogo cerrado, no debe haber consultas adicionales de comparación ni gráficas adicionales montadas. Carga el módulo bajo demanda si su peso lo justifica.
- Todos seleccionados no significa todos cargados: consulta y monta solamente las tarjetas visibles y un margen cercano. Desmonta las lejanas manteniendo espacio estable; limita también la memoria de resultados retenidos.
- Usa una cola con concurrencia acotada —por ejemplo, cuatro consultas activas como punto inicial—. Cancela o descarta trabajo obsoleto al cerrar, deseleccionar o cambiar contexto. Protege frente a respuestas tardías y a duplicación de solicitudes.
- Reutiliza resultados con una caché acotada cuya clave incluya proyecto, participante, gráfica, escenario y parámetros. Respeta los mecanismos existentes de invalidación tras reprocesar datos; no reutilices resultados de otro contexto.
- Ajusta el presupuesto de puntos a las tarjetas. La reducción visual debe preservar picos y huecos relevantes, sin modificar estadísticas ni el procesamiento científico. No presupongas que el muestreo uniforme actual conserva extremos. Evita animaciones costosas y cualquier solicitud masiva sin límite.
- Favorece escalas comparables para la misma magnitud. Identifica claramente las escalas independientes cuando sean necesarias; no presentes rangos parciales como globales. Conserva el significado de colores, unidades y normalizaciones existentes.
- Para comparar tiempos relativos, usa el inicio real del mismo estímulo y conserva la referencia temporal original. No alinees por el primer dato válido ni sincronices tiempos absolutos de grabaciones diferentes. No inventes equivalencias para «Todos los escenarios»; explicita esa limitación. Conserva las transformaciones espaciales vigentes.

## Verificación y entrega

Comprueba apertura/cierre, selección, aislamiento de contexto, errores parciales, cancelación y ausencia de cargas mientras está cerrado. Prueba suficientes participantes para demostrar el límite de consultas y de gráficas montadas al desplazarse. Reutiliza `frontend/tests/e2e/comparison-dashboard.spec.ts` y las pruebas de hooks como referencia; añade pruebas del comportamiento nuevo, especialmente respuestas fuera de orden.

Ejecuta typecheck, lint pertinente y pruebas afectadas; añade pruebas backend si cambias sus contratos o algoritmos. Inspecciona visualmente escritorio y pantalla estrecha. Mide apertura inicial, desplazamiento y reapertura con un conjunto representativo, indicando cantidad de participantes, tipo de gráfica y caché fría/caliente. Distingue simulaciones de mediciones con datos reales; no prometas tiempos no medidos.

El checkout ya contiene cambios ajenos en EEG, pupila, scanpath, comparativa, editores y documentación. Inspecciona `git status` y preserva ese trabajo, incluidos archivos sin seguimiento. No reviertas ni publiques cambios ajenos. Registra archivos modificados, verificaciones, limitaciones y cualquier siguiente acción en un documento de entrega del proyecto.

Configuración sugerida: mantener el modelo seleccionado tanto en Claude como en Codex, con esfuerzo alto por la coordinación de datos y la fidelidad científica. Verifica proporcionalmente los riesgos anteriores, sin repetir comprobaciones que ya pasaron salvo cambios relevantes.
