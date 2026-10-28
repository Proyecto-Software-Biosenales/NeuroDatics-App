<div align="center">

<img src="frontend/public/assets/NeuroDatics-logo.png" alt="NeuroDatics" width="96">

# NeuroDatics

**Análisis de bioseñales para estudios de neuromarketing**

Convierte la sesión cruda de un laboratorio —eye tracker, EEG y sensor galvánico— en analítica consultable:
fijaciones, mapas de calor, áreas de interés, espectros de EEG e informes en PDF.

![Versión](https://img.shields.io/badge/versión-2.0.0-0f766e)
![Python](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Licencia](https://img.shields.io/badge/licencia-todos%20los%20derechos%20reservados-lightgrey)

[Funciones](#qué-puede-hacer) · [Cómo se entrega](#cómo-se-entrega) · [Manuales](#manuales) ·
[Inicio rápido](#inicio-rápido) · [Documentación](#documentación) · [Desarrollo](#desarrollo)

<img src="docs/assets/proyectos.png" alt="Lista de proyectos de NeuroDatics" width="860">

</div>

## Qué es

En un estudio de neuromarketing, el software de adquisición exporta una carpeta por sesión: un CSV con las
grabaciones sincronizadas de todos los participantes y las imágenes y vídeos que se les mostraron. NeuroDatics
recibe esa carpeta, la valida, **recalcula las fijaciones desde la mirada cruda** en lugar de fiarse de las del
fabricante, lleva cada coordenada al sistema del estímulo y guarda el resultado en un formato columnar que se
consulta rápido. Encima de eso ofrece un tablero interactivo y genera informes por dispositivo.

Tres principios guían cada número que muestra: **nada se inventa** (un dato ausente sigue ausente y una
coordenada fuera de rango se rechaza, no se recorta), **la procedencia viaja con el resultado** (cada respuesta
dice qué algoritmo la produjo y con qué parámetros) y **la pantalla y el PDF no pueden discrepar**, porque usan
los mismos servicios.

## Qué puede hacer

| | |
| --- | --- |
| **Proyectos y pre-experimentos** | Registrar un estudio antes de tener datos: participantes, pantalla, cuestionarios de antes y después y notas. La carpeta del experimento se agrega cuando existe. |
| **Ingesta del experimento** | Sube la carpeta del laboratorio desde el navegador; interpreta CSV europeos multi-participante con distintas codificaciones y frecuencias de muestreo, y publica todo en una sola operación. |
| **Eye tracker** | Dilatación pupilar, punto de mirada, histograma de fijaciones, mapa de calor, recorrido de la mirada y distancia al dispositivo, sobre el estímulo real. |
| **Áreas de interés** | AOIs dibujadas sobre cada estímulo, con tiempo hasta la primera fijación, permanencia, revisitas, transiciones y hallazgos clave. |
| **EEG** | Señal por canal, densidad espectral (Welch), espectrograma y topografía, con avisos de calidad explícitos. |
| **Sensor galvánico** | Respuesta galvánica de la piel con sus estadísticas y su línea base. |
| **Comparar participantes** | Varias personas lado a lado, con el mismo instante marcado en todas las gráficas. |
| **Informes** | Un PDF por dispositivo, para un participante o para el grupo, con gráficas y tablas. |

<table>
  <tr>
    <td width="50%"><img src="docs/assets/pupila.png" alt="Dilatación pupilar en el tablero"></td>
    <td width="50%"><img src="docs/assets/eeg-espectrograma.png" alt="Espectrograma de EEG por canal"></td>
  </tr>
  <tr>
    <td align="center"><sub>Eye tracker: dilatación pupilar con sus estadísticas</sub></td>
    <td align="center"><sub>EEG: espectrograma de frecuencias por canal</sub></td>
  </tr>
</table>

<sub>Las capturas usan datos sintéticos.</sub>

## Cómo se entrega

NeuroDatics es un programa de Windows para el investigador, en su propio equipo:

| | |
| --- | --- |
| **Cómo se usa** | Se extrae un zip y se abre `neurodatics.exe`, sin instalación |
| **Cuenta** | Ninguna |
| **Archivos** | Una carpeta en el equipo (`%LOCALAPPDATA%\NeuroDatics`) |
| **Red** | Ninguna: todo ocurre en `127.0.0.1`, sin internet |

El repositorio conserva también una **edición en red**, con Docker, inicio de sesión con Google y archivos en
Google Drive, pensada para que un laboratorio comparta proyectos. **Hoy no se usa ni se mantiene**: necesita una
base de datos, un servicio de identificación y un almacenamiento en la nube que debe proveer quien la aloje.
[docs/tecnica/alojamiento-en-red.md](docs/tecnica/alojamiento-en-red.md) explica qué hace falta y dónde se conecta.

## Manuales

Los manuales para quien instala y usa NeuroDatics están en PDF en [manuales/](manuales):

| Manual | Para qué |
| --- | --- |
| [Manual de uso](manuales/NeuroDatics-Manual-de-uso.pdf) | Usar la aplicación paso a paso: proyectos, datos, tablero, pre-experimentos e informes. |
| [Guía de instalación](manuales/NeuroDatics-Guia-de-instalacion.pdf) | Descomprimir y abrir NeuroDatics en Windows. |
| [Guía de procesamiento](manuales/NeuroDatics-Guia-de-procesamiento.pdf) | Para investigadores: cómo se limpian, calculan y resumen las señales, y qué recalcular si tu objetivo es otro. |

## Inicio rápido

El investigador recibe un zip; al extraerlo ve solo `neurodatics.exe` y `LEEME.txt`. Al abrir el programa,
arranca su propia base de datos y abre el navegador. Los proyectos se guardan en `%LOCALAPPDATA%\NeuroDatics`,
así que borrar la carpeta del programa no los borra. La guía para el investigador es la
[guía de instalación](manuales/NeuroDatics-Guia-de-instalacion.pdf) (y, dentro del paquete,
[student/LEEME.txt](student/LEEME.txt)), y cómo se construye el paquete está en
[student/README.md](student/README.md).

<details>
<summary>Alojar la edición en red (sin uso actual)</summary>

Requisitos: Docker Desktop, Git y los servicios que describe
[docs/tecnica/alojamiento-en-red.md](docs/tecnica/alojamiento-en-red.md).

```powershell
git clone https://github.com/Proyecto-Software-Biosenales/NeuroDatics-App.git
cd NeuroDatics-App
Copy-Item .env.example .env      # rellena lo marcado «DEBES PROVEER»
docker compose up -d --build
```

La aplicación queda en **http://localhost:3000** (la API en `/api` y su documentación en `/docs`). El contenedor
del backend aplica las migraciones antes de arrancar. Si un servicio aparece como `unhealthy`, revisa
`docker compose logs --tail=200 backend` antes de borrar nada; `docker compose down -v` borra la base de datos y
las cachés. Para una red universitaria o corporativa, ver
[docs/tecnica/despliegue-en-red.md](docs/tecnica/despliegue-en-red.md).

</details>

## Cómo funciona

```mermaid
flowchart LR
    A["Carpeta del laboratorio<br/>CSV + imágenes + vídeos"] --> B["Validación<br/>y extracción"]
    B --> C["Parseo por participante<br/>detección de fijaciones"]
    C --> D[("Parquet por<br/>participante y escenario")]
    D --> E["Analítica<br/>con caché"]
    E --> F["Tablero"]
    E --> G["Informes PDF"]
```

El backend es **FastAPI** con SQLAlchemy asíncrono, pandas, NumPy, SciPy y PyArrow; los informes se componen con
**Typst**. El frontend es **Next.js** con React, TypeScript, Tailwind, shadcn/Radix y Recharts. Los datos
relacionales viven en **PostgreSQL 16** y los bytes (estímulos y Parquet) en disco. El recorrido
completo está en [docs/tecnica/arquitectura.md](docs/tecnica/arquitectura.md).

## Documentación

| Si quieres… | Lee |
| --- | --- |
| Entender la aplicación de un vistazo | [Arquitectura](docs/tecnica/arquitectura.md) |
| Saber qué cambió | [CHANGELOG](docs/CHANGELOG.md) |
| Usar la aplicación paso a paso | [Manual de uso (PDF)](manuales/NeuroDatics-Manual-de-uso.pdf) |
| Justificar los resultados en un estudio | [Guía de procesamiento (PDF)](manuales/NeuroDatics-Guia-de-procesamiento.pdf) |
| Preparar un estudio sin datos todavía | [Pre-experimento](docs/usuario/pre-experimento.md) |
| Interpretar la comparación entre participantes | [Comparar participantes](docs/usuario/comparar-participantes.md) |
| Conocer los algoritmos | [Fijaciones](docs/tecnica/deteccion-de-fijaciones.md) · [Coordenadas](docs/tecnica/coordenadas-pantalla-estimulo.md) · [EEG](docs/tecnica/eeg/metodos.md) · [Informes](docs/tecnica/informes.md) |
| Ver el índice completo | [docs/README.md](docs/README.md) |

## Estructura del repositorio

```text
backend/      API FastAPI: ingesta, analítica, informes, migraciones y el lanzador local
frontend/     interfaz Next.js
student/      construcción y comprobaciones del paquete de Windows, y su guía
deployment/   edición en red con Docker (sin uso actual)
docs/         documentación por público: usuario, técnica y desarrollo
manuales/     manual de uso y guías de instalación y de procesamiento, en PDF
verify.ps1    la puerta de verificación del repositorio
```

## Desarrollo

```powershell
cd frontend; npm ci; npx playwright install chromium; cd ..
.\verify.ps1
```

`verify.ps1` es la única puerta de verificación: pruebas del backend con resultados de referencia protegidos,
Ruff, Vulture, deptry, contratos de importación, arranque de la aplicación, TypeScript, pruebas del frontend en
Node y en Chromium real, y ESLint. Cómo preparar el entorno, las reglas para cambiar el código y el detalle de cada
prueba están en [CONTRIBUTING.md](CONTRIBUTING.md).

## Autores

Desarrollado por **Jacobo D'león** y **María Alejandra Muñoz**.

## Licencia

© 2026 Jacobo D'león y María Alejandra Muñoz. Todos los derechos reservados; ver [LICENSE](LICENSE). El
software de terceros incluido conserva sus propias licencias.
