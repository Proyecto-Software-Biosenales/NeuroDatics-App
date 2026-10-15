# Documentación de NeuroDatics

Ordenada por quien la lee. Si llegas por primera vez, empieza por el [README del repositorio](../README.md) y
después por [arquitectura.md](tecnica/arquitectura.md).

## Para quien usa la aplicación

| Documento | Qué responde |
| --- | --- |
| [usuario/pre-experimento.md](usuario/pre-experimento.md) | Registrar un proyecto antes de tener datos: participantes, pantalla, cuestionarios y notas. |
| [usuario/comparar-participantes.md](usuario/comparar-participantes.md) | La vista de comparación entre participantes y qué significan sus estadísticas. |
| [CHANGELOG.md](CHANGELOG.md) | Qué cambió en cada versión. |

## Cómo funciona por dentro

| Documento | Qué responde |
| --- | --- |
| [tecnica/arquitectura.md](tecnica/arquitectura.md) | Cómo encajan backend, frontend y las dos ediciones; por dónde pasan los datos. |
| [tecnica/subida-de-experimentos.md](tecnica/subida-de-experimentos.md) | Qué hace una subida de experimento, en qué orden, qué garantiza y qué no. |
| [tecnica/deteccion-de-fijaciones.md](tecnica/deteccion-de-fijaciones.md) | Cómo se detectan las fijaciones desde la mirada cruda y cómo se mide su duración. |
| [tecnica/coordenadas-pantalla-estimulo.md](tecnica/coordenadas-pantalla-estimulo.md) | El contrato que lleva las coordenadas de pantalla al sistema del estímulo. |
| [tecnica/informes.md](tecnica/informes.md) | Los informes en PDF: qué contienen y de dónde salen sus números. |
| [tecnica/eeg/metodos.md](tecnica/eeg/metodos.md) | Cómo se calcula cada resultado de EEG y con qué límites. |
| [tecnica/eeg/validacion.md](tecnica/eeg/validacion.md) | La validación contra grabaciones reales: qué se encontró y qué se corrigió. |
| [tecnica/eeg/escalas-por-grabacion.md](tecnica/eeg/escalas-por-grabacion.md) | Las escalas declaradas por grabación y canal, y cómo se tratan. |
| [tecnica/despliegue-en-red.md](tecnica/despliegue-en-red.md) | Poner la edición servidor en una red universitaria o corporativa. |

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

## Entregas

- Edición servidor: [deployment/README.md](../deployment/README.md) (instalación en Windows) y
  [deployment/MANTENIMIENTO.md](../deployment/MANTENIMIENTO.md) (cómo se genera la entrega).
- NeuroDatics Estudiantes: [student/README.md](../student/README.md) (construcción y comprobaciones) y
  [student/LEEME.txt](../student/LEEME.txt) (la guía del estudiante).
