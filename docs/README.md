# Documentación de NeuroDatics

Índice de lo que hay aquí. Si llegas por primera vez, empieza por
[arquitectura.md](arquitectura.md); si vas a programar, por
[../CONTRIBUTING.md](../CONTRIBUTING.md).

## Empezar

| Documento | Qué responde |
| --- | --- |
| [../README.md](../README.md) | Qué es NeuroDatics, sus dos ediciones y cómo se arranca cada una. |
| [arquitectura.md](arquitectura.md) | Cómo encajan backend, frontend y las dos ediciones; por dónde pasan los datos. |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Cómo se verifica un cambio, qué contratos existen y qué reglas no se negocian. |
| [CHANGELOG.md](CHANGELOG.md) | Qué cambió en la aplicación, en lenguaje de quien la usa. |

## Cómo funciona cada parte

| Documento | Qué responde |
| --- | --- |
| [UPLOAD_PIPELINE.md](UPLOAD_PIPELINE.md) | Qué hace una subida de experimento, en qué orden, qué garantiza y qué no. |
| [FIXATION_V2.md](FIXATION_V2.md) | Cómo se detectan las fijaciones desde la mirada cruda y cómo se mide su duración. |
| [SCREEN_TO_STIMULUS_TRANSFORM.md](SCREEN_TO_STIMULUS_TRANSFORM.md) | El contrato que lleva las coordenadas de pantalla al sistema del estímulo. |
| [REPORTS.md](REPORTS.md) | Los informes en PDF: qué contienen y de dónde salen sus números. |
| [comparar-participantes.md](comparar-participantes.md) | La vista de comparación entre participantes y qué significan sus estadísticas. |
| [PRE_EXPERIMENTO.md](PRE_EXPERIMENTO.md) | Registrar un proyecto antes de tener datos: participantes, pantalla y cuestionarios. |
| [frontend-ui.md](frontend-ui.md) | Convenciones de interfaz y cómo se comprueban. |
| [rendimiento.md](rendimiento.md) | Qué se midió, qué decisiones quedaron en el código y qué no promete. |

## Ciencia de los datos de EEG

| Documento | Qué responde |
| --- | --- |
| [eeg-audit/METHODS.md](eeg-audit/METHODS.md) | Cómo se auditaron las grabaciones de EEG y cómo se reproduce. |
| [eeg-audit/FINDINGS.md](eeg-audit/FINDINGS.md) | Qué se encontró, qué se corrigió y con qué evidencia. |
| [eeg-audit/ESCALAS-POR-GRABACION.md](eeg-audit/ESCALAS-POR-GRABACION.md) | Las escalas declaradas por grabación y sus consecuencias. |

`eeg-audit/reference-evidence.json` y `eeg-audit/diagnostics.png` son la evidencia
de esa auditoría: los archivos de origen aparecen desreferenciados (`csv-01`…`csv-08`)
y solo identificados por su SHA-256.

## Despliegue y entrega

| Documento | Qué responde |
| --- | --- |
| [NETWORK_DEPLOYMENT.md](NETWORK_DEPLOYMENT.md) | Poner la edición servidor en una red universitaria o corporativa. |
| [student/PLAN.md](student/PLAN.md) | Alcance y decisiones de NeuroDatics Estudiantes. |
| [student/LAPTOP-TEST.md](student/LAPTOP-TEST.md) | La prueba en un portátil real, que sigue pendiente. |
| [LICENCIAMIENTO.md](LICENCIAMIENTO.md) | Qué software de terceros se distribuye y qué falta decidir. |

La construcción y el empaquetado del paquete de estudiantes están en
[../student/README.md](../student/README.md); la entrega de la edición servidor, en
[../deployment/README.md](../deployment/README.md) y
[../deployment/MANTENIMIENTO.md](../deployment/MANTENIMIENTO.md).

## Material explicativo

`presentation/00-README.md` … `presentation/07-cheatsheet.md` son recorridos
detallados del pipeline, el parseo del CSV, la detección de fijaciones, la
transformación de coordenadas, los algoritmos de analítica y la pila técnica.
Se escribieron como repaso para una sustentación, así que su registro es más
coloquial que el del resto y alguna afirmación puntual quedó atrás respecto al
código; [arquitectura.md](arquitectura.md) es la versión verificada y resumida.

## Lo que ya no está aquí

Las notas de las campañas de desarrollo (rendimiento, limpieza, auditoría, traspasos
de entrega) salieron del repositorio el 12 de octubre de 2026. Siguen en el historial
de Git bajo el tag `docs-archive-pre-release`:

```powershell
git show docs-archive-pre-release:docs/perf/ejecucion/RESULTADOS.md
git show docs-archive-pre-release:docs/student/LEDGER.md
```

`docs/RefererenceExperiments/` contiene grabaciones reales de participantes y está en
`.gitignore`: no viaja en el repositorio.
