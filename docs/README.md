# Documentación de NeuroDatics

NeuroDatics se entrega como programa local para Windows. Quien la usa encuentra todo en los manuales en PDF;
esta carpeta explica cómo funciona por dentro. Si llegas por primera vez, empieza por el
[README del repositorio](../README.md) y después por [arquitectura.md](tecnica/arquitectura.md).

## Para quien usa la aplicación

| Manual | Qué responde |
| --- | --- |
| [Guía de instalación (PDF)](../manuales/NeuroDatics-Guia-de-instalacion.pdf) | Descomprimir y abrir NeuroDatics en Windows. |
| [Manual de uso (PDF)](../manuales/NeuroDatics-Manual-de-uso.pdf) | De crear un perfil y un proyecto a descargar los informes: datos, Dashboard, comparar participantes, pre-experimentos, cuestionarios y solución de problemas. |
| [Guía de procesamiento (PDF)](../manuales/NeuroDatics-Guia-de-procesamiento.pdf) | Cómo limpia, calcula y resume NeuroDatics cada señal, para justificar los resultados o recalcularlos. |
| [CHANGELOG.md](CHANGELOG.md) | Qué cambió en cada versión. |

## Cómo funciona por dentro

| Documento | Qué responde |
| --- | --- |
| [tecnica/arquitectura.md](tecnica/arquitectura.md) | Cómo encajan backend, frontend y las dos ediciones; por dónde pasan los datos. |
| [tecnica/subida-de-experimentos.md](tecnica/subida-de-experimentos.md) | Qué hace una subida de experimento, en qué orden, qué garantiza y qué no. |
| [tecnica/pre-experimento.md](tecnica/pre-experimento.md) | Cómo se guarda la preparación de un proyecto y qué expone la API de pre-experimentos. |
| [tecnica/deteccion-de-fijaciones.md](tecnica/deteccion-de-fijaciones.md) | Cómo se detectan las fijaciones desde la mirada cruda y cómo se mide su duración. |
| [tecnica/coordenadas-pantalla-estimulo.md](tecnica/coordenadas-pantalla-estimulo.md) | El contrato que lleva las coordenadas de pantalla al sistema del estímulo. |
| [tecnica/informes.md](tecnica/informes.md) | Los informes en PDF: qué contienen y de dónde salen sus números. |
| [tecnica/eeg/metodos.md](tecnica/eeg/metodos.md) | Cómo se calcula cada resultado de EEG y con qué límites. |
| [tecnica/eeg/validacion.md](tecnica/eeg/validacion.md) | La validación contra grabaciones reales: qué se encontró y qué se corrigió. |
| [tecnica/eeg/escalas-por-grabacion.md](tecnica/eeg/escalas-por-grabacion.md) | Las escalas declaradas por grabación y canal, y cómo se tratan. |

La carpeta `tecnica/eeg/evidencia/` guarda la evidencia de la validación de EEG; los archivos de origen aparecen
anonimizados (`csv-01`…`csv-08`) e identificados solo por su SHA-256.

## Para quien trabaja en el código

| Documento | Qué responde |
| --- | --- |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Entorno, verificación, contratos y reglas que no se negocian. |
| [desarrollo/interfaz.md](desarrollo/interfaz.md) | Convenciones de interfaz y cómo se comprueban. |
| [../backend/README.md](../backend/README.md) | El backend: rutas, configuración y estructura. |
| [../frontend/README.md](../frontend/README.md) | El frontend: estructura y comandos. |
| [../backend/benchmarks/README.md](../backend/benchmarks/README.md) | Cómo medir el rendimiento de las piezas del backend. |
| [../student/README.md](../student/README.md) | Cómo se construye y se comprueba el paquete de Windows; [LEEME.txt](../student/LEEME.txt) es la guía rápida que viaja en él. |

## Anexo: edición en red

El repositorio conserva una edición en red (Docker, inicio de sesión con Google y archivos en Google Drive) que
no se usa ni se mantiene. [tecnica/alojamiento-en-red.md](tecnica/alojamiento-en-red.md) resume qué ya está, qué
tendría que aportar quien quiera alojarla y qué falta. El instalador con Docker para Windows y su documentación
siguen en [deployment/](../deployment/README.md), sin generarse.
