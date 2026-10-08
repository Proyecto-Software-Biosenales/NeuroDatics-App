# Matriz G03 — endpoints y columnas

Prefijo `/projects/{project_id}/analytics`. 24 endpoints inventariados; 11 proyectados, 11 full y 2 SQL.

| Endpoint | Perfil | Motivo/dependencia |
|---|---|---|
| `/participants` | no Parquet | SQL de participantes; no Parquet |
| `/scenarios` | no Parquet | SQL de escenarios; no Parquet |
| `/scenario-timing` | timing | time/scenario de todas filas + gsr para origen; no filtra filas por sensor |
| `/correlations` | full | Multisensor; incluye fijaciones y derivados, dependencias completas no acotadas en G03 |
| `/comparison/charts` | full | Selección variable de gráficas, transformación y sensores; conservar unión completa hasta G10 |
| `/timeseries/pupil` | pupil | time/scenario + ambas pupilas; promedio/suavizado/baseline preservados |
| `/statistics/pupil` | pupil | time/scenario + ambas pupilas; promedio/suavizado/baseline preservados |
| `/gaze-at` | full | Transformación persistida, máscara de validez, coords locales/raw y lookup temporal; G08 conserva referencia |
| `/timeseries/gaze` | full | Limpieza legacy/mixed y procedencia de transformación; full preserva todas columnas |
| `/statistics/gaze` | full | Limpieza legacy/mixed y procedencia de transformación; full preserva todas columnas |
| `/timeseries/distance` | distance | time/scenario + distance float64; conversión mm→cm intacta |
| `/statistics/distance` | distance | time/scenario + distance float64; conversión mm→cm intacta |
| `/timeseries/gsr` | gsr | time/scenario + gsr; smoothing/origen/baseline preservados |
| `/statistics/gsr` | gsr | time/scenario + gsr; smoothing/origen/baseline preservados |
| `/timeseries/eeg` | eeg | Siete canales presentes para available_channels/referencia; attrs adquisición/calidad/units y gaps intactos |
| `/psd/eeg` | eeg | Siete canales presentes para available_channels/referencia; attrs adquisición/calidad/units y gaps intactos |
| `/spectrogram/eeg` | eeg | Siete canales presentes para available_channels/referencia; attrs adquisición/calidad/units y gaps intactos |
| `/topography/eeg` | eeg | Siete canales presentes para available_channels/referencia; attrs adquisición/calidad/units y gaps intactos |
| `/scanpath` | full | Eventos, variantes duración, segmentos, coords y metadatos de transformación; G05 comparte resultado |
| `/fixations` | full | Eventos/variantes/duración/segmentos/coords y transformación completa |
| `/heatmap` | full | Eventos o gaze + dimensiones estímulo + transformación y cache image; preservar contrato |
| `/fixations/sensitivity` | full | Todas variantes de duración y calidad persistida, selección dinámica de columnas |
| `/fixations/histogram` | full | Eventos y reconstrucción legacy, variantes dinámicas y metadatos completos |
| `/aois` | full | Eventos/segmentos/coords/máscaras/transformación y metadatos completos; reutilización G05 |

Común opcional: `time, scenario, participant_code, user_index, segment_id`. Sensores opcionales: GSR/timing `gsr`; pupil `lx_pupil, rx_pupil`; distance `distance`; EEG `le, f4, c4, p4, p3, c3, f3`. Todos los attrs originales y el índice se conservan, sin categorías ni reducción de precisión. Los opcionales ausentes se omiten: el servicio conserva sus resultados vacíos/legacy; errores de esquema/corrupción no hacen fallback full.

Fuera de analytics: preview de medios (`projects/api/routes.py`, `_compute_video_frame_time_s`) conserva full por referencia temporal preexistente, pendiente G08. Informes (`executive_report_service._read_participant_frames`) conserva full por mezcla de sensores/eventos, pendiente G07. La descarga siempre transfiere el archivo completo; full sigue siendo el default de todos los helpers.

No se proyecta ninguna ruta que consuma transformación: full conserva status/version/fingerprint, gaze local/raw, is_valid_gaze, invalid_reason, dimensiones estímulo, segmentos y todas las variantes de fijación/calidad. Antes de migrarlas G05 debe comprobar la unión de columnas requeridas por eventos y procedencia.
