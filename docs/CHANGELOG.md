# Cambios de NeuroDatics

Qué cambió en la aplicación, de lo más reciente a lo más antiguo, en lenguaje de quien la usa: qué se
puede hacer ahora que antes no se podía, o qué dejó de fallar. Las entradas nuevas van arriba, bajo
**Sin publicar**.

Este archivo no es una bitácora de trabajo. Las notas de las campañas de desarrollo que lo
precedieron —rendimiento, limpieza, auditoría de EEG, entregas— salieron del repositorio el 12 de
octubre de 2026 y quedaron en el historial de Git bajo el tag `docs-archive-pre-release`. Para leer
cualquiera de esos archivos:

```powershell
git show docs-archive-pre-release:docs/perf/ejecucion/RESULTADOS.md
```

Lo que de esas campañas sigue siendo cierto hoy se rescató a documentos vivos:
[arquitectura.md](arquitectura.md), [rendimiento.md](rendimiento.md),
[comparar-participantes.md](comparar-participantes.md), [UPLOAD_PIPELINE.md](UPLOAD_PIPELINE.md),
[FIXATION_V2.md](FIXATION_V2.md), [REPORTS.md](REPORTS.md) y
[eeg-audit/METHODS.md](eeg-audit/METHODS.md).

---

## Entrega: lo que falta por decidir

Tres asuntos siguen abiertos y no son técnicos; se arrastran sin cambios desde la versión 0.2 del
paquete de estudiantes:

1. **Licencia de ffmpeg.** El ejecutable de ffmpeg que viaja en el paquete es GPLv3. Qué implica eso
   para distribuir NeuroDatics Estudiantes está planteado, sin resolver, en
   [LICENCIAMIENTO.md](LICENCIAMIENTO.md).
2. **Prueba en un portátil real.** El paquete nunca se ha ejecutado en una máquina de estudiante:
   SmartScreen, Smart App Control, el antivirus, un equipo sin herramientas de desarrollo y memoria
   de gama baja siguen sin comprobarse. El guion de esa prueba está en
   [student/LAPTOP-TEST.md](student/LAPTOP-TEST.md).
3. **Gobernanza de los datos crudos.** Falta decidir quién custodia las grabaciones de los
   participantes, bajo qué permiso y por cuánto tiempo.

### Paquete de estudiantes

| Versión | SHA-256 del zip |
| --- | --- |
| 0.5 | `7F478A9BF63B6A8BB2AFF9E0B747971004872B56FC555115DE7D7E11EF5CF772` |
| 0.4 | `ADCBD4C0258DBFD24E73D44C2CCD0A474C69F493DF8E60EF27411D5FFA6009E7` |
| 0.3 | `25B5815F720555F3D4205EF68207D197785AF86426B546267A3CAE1782F8E8A5` |
| 0.2 | `6D8AE82E…0C945` (el registro histórico solo guardó el valor abreviado) |

La carpeta del programa muestra únicamente `neurodatics-estudiantes.exe` y `LEEME.txt`; todo lo demás
viaja en una carpeta oculta junto al ejecutable.

---

## Sin publicar

### 2026-10-12 — La documentación del repositorio queda legible

- La documentación de las campañas de desarrollo sale del repositorio y queda en el historial bajo el
  tag `docs-archive-pre-release`. Para leer cualquier archivo retirado:
  `git show docs-archive-pre-release:<ruta>`.
- Aparecen cuatro documentos nuevos: [arquitectura.md](arquitectura.md), que explica la aplicación
  completa a alguien que llega por primera vez; `CONTRIBUTING.md`, con cómo trabajar en el
  repositorio; [rendimiento.md](rendimiento.md), con lo que la campaña de rendimiento dejó en el
  código; y [comparar-participantes.md](comparar-participantes.md), con cómo funciona esa vista.
- **Privacidad:** los códigos de participante reales que aparecían como ejemplo en la documentación
  se reemplazaron por códigos ficticios, y un archivo con datos personales salió del control de
  versiones.
- Se retiró andamiaje muerto: archivos, scripts y referencias que ya no servían a nada.
- **Paquete de estudiantes 0.5.** Reconstruido porque el cambio toca `backend/src` y `frontend/`.
  SHA-256 del zip: `7F478A9BF63B6A8BB2AFF9E0B747971004872B56FC555115DE7D7E11EF5CF772` (251,5 MiB,
  4081 archivos, 631,4 MiB al extraer). Pasaron todas sus puertas: autoprueba, PostgreSQL embebido
  (plantilla, contraseña en loopback, migraciones a la cabeza, parada limpia, caída y recuperación,
  adopción de un servidor en marcha, copia interrumpida), adopción de un servidor huérfano, servicio
  real sobre HTTP en un perfil nuevo (las diez etapas, incluidas subida, analítica, medios, informe y
  borrado), navegador **4 de 4** sobre el paquete en marcha, y el arranque simultáneo de dos
  instancias. Cero conexiones fuera de loopback en 49 muestras, cero procesos de PostgreSQL
  residuales y el guard offline no tuvo que bloquear nada. El zip extraído arrancó desde una ruta con
  acentos en 18,3 s. La carpeta del programa muestra solo el ejecutable y `LEEME.txt`.
- Los tres asuntos de entrega listados arriba siguen abiertos, sin cambios.

### 2026-10-11 — Configuración está en el menú de usuario

*Configuración* ya no es un enlace de la barra de navegación. El nombre del usuario, arriba a la
derecha, es ahora un botón que abre un menú con *Configuración*. Funciona a cualquier ancho de
pantalla, incluido el teléfono, donde el nombre no se ve. Con este cambio se publicó el paquete de
estudiantes **0.4**.

### 2026-10-08 — Crear un pre-experimento, paso por paso

- Se puede registrar un proyecto **antes** de tener datos: participantes, información de pantalla y
  cuestionarios de antes y después. Los datos del experimento se agregan luego. Ver
  [PRE_EXPERIMENTO.md](PRE_EXPERIMENTO.md).
- El diálogo de creación pasó de un formulario largo con secciones plegadas a cuatro pestañas
  (Proyecto, Participantes, Pantalla, Cuestionarios). Cada pestaña dice en qué estado está
  («Opcional», «Listo», «2 agregados», «Revisar»). Solo el nombre es obligatorio y «Crear
  pre-experimento» funciona desde cualquier pestaña; si falta algo, se abre la pestaña que lo pide y
  se explica por qué.
- *Configuración* usa los mismos editores que el diálogo, así que un participante o una pregunta se
  ven y se editan igual en los dos sitios.
- **Arreglado:** en la tarjeta de un proyecto sin carpeta, el pie «Agregar carpeta» tapaba el enlace
  «Configuración» en pantallas anchas.
- Con este cambio se publicó el paquete de estudiantes **0.3**.

### 2026-10-03 — Comparativas trae sus estadísticas con las gráficas

Seleccionar las cinco vistas temporales a la vez ahora hace una sola consulta en lugar de seis. Las
tablas dicen lo mismo que antes —mediana, desviación, línea base, pico, unidades— y si una señal
falla, las demás siguen apareciendo.

### 2026-09-29 — La ingesta de un proyecto es varias veces más rápida

- En equipos modestos un proyecto tardaba minutos en procesarse mientras un solo núcleo trabajaba.
  Ahora los bloques de participante del CSV se reparten entre varios procesos. En una grabación de
  prueba de seis bloques y 232 759 líneas, el procesamiento pasó de 51 s a 10 s con ocho núcleos.
- La detección de fijaciones, que era la mitad de ese tiempo, es 5,8 veces más rápida **con el mismo
  resultado**: los archivos generados son idénticos byte a byte a los de antes del cambio.
- El número de procesos se ajusta solo a la máquina y a su memoria disponible. En la edición de
  servidor el valor por defecto se mantiene conservador.

### 2026-09-28 — «Comparar participantes»: la línea marcada aparece en todas las tarjetas

Un clic en la gráfica de una tarjeta dibuja la línea punteada en todas, también cuando el eje es
«Tiempo de la grabación». Antes solo se compartía con el eje alineado al inicio del estímulo. Las
tarjetas cuya grabación no contiene ese segundo no dibujan nada, y el panel lateral dice qué segundo
marca la línea.

### 2026-09-28 — La pestaña de áreas de interés permite sacar conclusiones

Después de la gráfica de distribución aparecen *Hallazgos clave* (qué área atrajo la mirada primero,
dónde están las fijaciones más largas, qué área se revisita más, dónde está la mayor respuesta de
pupila, qué conexión es la más transitada, qué áreas no recibieron ninguna fijación), una *Secuencia
de atención* que muestra el recorrido fijación por fijación, una sola tabla de *Métricas por AOI* y
las *Transiciones* con sus tres conexiones principales. El tiempo hasta la primera fijación se mide
desde el inicio del escenario, no desde el inicio de la grabación, igual que en el informe PDF.

### 2026-09-28 — EEG: abre suavizado, avisos al final, espectrograma continuo

- La vista *EEG por canal* abre con la señal suavizada, y «Cruda» y «Ambas» están a un clic. Los
  avisos de calidad y las advertencias de unidades ya no aparecen sobre las gráficas: están reunidos
  en una tarjeta, «Calidad y alcance de EEG», que cierra la pestaña.
- **Arreglado:** el espectrograma de un escenario de unos cinco segundos se dibujaba como diez
  columnas anchas de franjas, mientras los escenarios largos se veían continuos. Ahora el paso de la
  ventana se reduce hasta que caben unas cien columnas. La ventana, las frecuencias y los valores de
  cada ventana no cambian; los informes y las demás vistas se ven igual que antes.

### 2026-09-27 — El mapa de recorridos se lee como la gráfica de referencia

Los nodos del recorrido eran translúcidos y sus anillos blancos se apilaban en los grupos densos, lo
que hacía la gráfica web más difícil de seguir que la de Python de la misma grabación. Ahora los nodos
son opacos, el contorno es fino y los números llevan borde negro, como en la gráfica de referencia.

### 2026-09-24 — Las advertencias de EEG se explican sin estorbar

- Cada advertencia de una gráfica es ahora un chip con su explicación: eje recortado, eventos
  marcados, suavizado, envolvente, escala del montaje, ventanas marcadas de la PSD, canales sin PSD.
  Un toque o un clic abren la explicación, así que también funcionan en pantalla táctil.
- Los tramos con artefactos se agrupan: una lista de diecisiete filas pasó a dos chips, cada uno con
  un salto a su lugar en la gráfica.
- **Arreglado:** el aviso «Eje recortado» salía en toda grabación, incluso en una limpia, porque el
  rango dibujado dejaba siempre un 1 % de muestras fuera. Ahora solo avisa cuando hay algo realmente
  fuera del rango.
- **Arreglado:** en modo oscuro, el marcador de tiempo seleccionado y la rejilla de las gráficas
  seguían en grises claros.

### 2026-09-22 — El tablero cabe en la pantalla de un portátil

Un portátil de 1920×1080 al 125 % de escala equivale a 1536×730 píxeles, y recibía las tarjetas más
grandes: en *EEG por canal* solo un 32 % de la gráfica quedaba sobre el pliegue, y nada a 1366×640.
Ahora las tarjetas, los espacios y los títulos son compactos por defecto y solo crecen en pantallas
que además son altas. En las cuatro resoluciones medidas la gráfica de EEG pasó a verse completa o
casi completa sin desplazarse. Las pantallas grandes se ven como antes.

### 2026-09-21 — Los informes llevan el logo de NeuroDatics

El logo aparece en la portada del informe y en el encabezado de cada página, junto a la palabra
«NeuroDatics».

### 2026-09-21 — NeuroDatics Estudiantes: la aplicación funciona sin internet

Se puede entregar la aplicación completa como un programa para Windows que no necesita instalación,
cuenta, internet ni Docker:

- Al abrirlo arranca su propia base de datos, aplica sus migraciones y abre el navegador en la
  aplicación. Los datos se guardan en el perfil del usuario, no junto al programa, porque una carpeta
  en Descargas o el Escritorio suele sincronizarse con OneDrive y eso corrompe una base de datos en
  uso.
- No hay inicio de sesión ni nada de Google: el análisis, los informes y los archivos funcionan en el
  equipo. Abrirlo dos veces trae al frente la ventana que ya estaba corriendo.
- Trae su guía en español, `LEEME.txt`, con los pasos, qué hacer con el aviso de SmartScreen, dónde
  quedan los datos y qué enviar si algo falla.
- Comprobado con el equipo sin resolución de nombres salvo para `127.0.0.1`: el flujo completo
  —subir la carpeta del experimento, demografía, imágenes de estímulo, analítica de EEG, GSR y eye
  tracker, borrar— no hace ni una conexión fuera de la máquina.
- Los tres asuntos de entrega listados arriba siguen abiertos.

### 2026-09-19 — La base de datos y sus migraciones quedan en orden

- La configuración privada del backend apuntaba a una base de datos distinta de la del proyecto, con
  otra contraseña, otro puerto y sin TLS explícito; quedó sincronizada.
- **Arreglado:** la migración 004 podía afectar restricciones que no le correspondían. Ahora toca
  solo la que debe, y la cadena completa de migraciones se verificó de principio a fin, con bajada y
  nueva subida, conservando los datos.

### 2026-09-18 — Instalador de Windows en español

- La entrega para un equipo con Docker es una carpeta con `INSTALAR.bat` e `INICIAR.bat`. El
  instalador comprueba la versión de PowerShell, la huella de cada archivo, Windows de 64 bits, la
  memoria, el disco, la virtualización, WSL y Docker Compose antes de hacer nada, instala Docker
  Desktop verificando su firma, y después de reiniciar continúa donde iba.
- Genera credenciales locales al azar si no hay configuración previa, y respeta la que ya exista.
- Nueva página **Configuración** con el estado de la conexión a Google Drive, que pide confirmación
  antes de reconectar una cuenta compartida. La pantalla de éxito del permiso de Google está en
  español.

### 2026-09-17 — Un informe PDF por dispositivo

El informe ejecutivo único se reemplazó por un informe por dispositivo, para un participante o para
el grupo. En modo comparativo se recibe un PDF por dispositivo dentro de un ZIP. Los valores del PDF
usan las mismas definiciones que el tablero, así que no pueden discrepar. Ver
[REPORTS.md](REPORTS.md).

### 2026-09-15/16 — Auditoría científica de EEG y sus correcciones

- **Arreglado, y es importante:** las exportaciones marcan un canal con un multiplicador `kilo` que
  se estaba ignorando, lo que dejaba la amplitud mil veces más pequeña y la potencia 60 dB por
  debajo. La importación ahora aplica el multiplicador y registra de dónde salió.
- **Arreglado:** las muestras ausentes se descartaban, se interpolaban o se rellenaban con ceros. Hoy
  se conservan como ausentes y el cálculo se hace solo sobre tramos válidos contiguos.
- **Arreglado:** el filtro de 0,2 s que se aplicaba por defecto cancelaba los 10 Hz, es decir,
  escondía el ritmo alfa. La vista por defecto pasó a mostrar valores crudos y el suavizado quedó
  como opción etiquetada.
- La importación valida unidades y relojes, la correlación cubre todo el montaje, y la interfaz
  muestra la calidad de los datos en lugar de métricas de línea base ficticias.
- **Acción necesaria:** los proyectos que ya estaban cargados hay que **volver a ingestarlos** para
  que tomen la escala corregida.
- Métodos y reproducibilidad en [eeg-audit/METHODS.md](eeg-audit/METHODS.md).

### 2026-09-12 → 09-15 — Las gráficas cargan mucho más rápido

- Las series de pupila, mirada, distancia y GSR devolvían todas las muestras: 33,6 MB de datos para
  una sesión de 300 000 filas. Ahora vienen acotadas.
- Las lecturas de archivos salieron del hilo que atiende las solicitudes, se indexaron las búsquedas
  por proyecto, y una imagen que no cambió se responde sin volver a leerla del disco.
- Volver a un proyecto ya visto es casi instantáneo, porque los resultados calculados y los archivos
  descargados se reutilizan mientras sigan siendo válidos.
- Lo que se midió y lo que quedó en el código está en [rendimiento.md](rendimiento.md).

### 2026-09-12 — Resubir un experimento ya no puede dejar el proyecto a medias

Cada subida prepara sus datos aparte y los publica en una sola operación: si algo falla —la red, el
navegador, el servidor—, el proyecto conserva los datos que ya tenía en lugar de quedar roto. Los
límites de tamaño y el control de cuántas subidas corren a la vez se aplican antes de recibir el
archivo, así que una subida demasiado grande se corta en el momento en vez de consumir el equipo. Si
el servidor se cae a mitad de una subida, al volver cierra lo que quedó abierto. Cancelar desde el
navegador detiene de verdad el trabajo del servidor. Ver [UPLOAD_PIPELINE.md](UPLOAD_PIPELINE.md).

### 2026-09-03/04 — Correcciones de comportamiento y red de seguridad

- **Arreglado:** al cambiar de participante o de escenario, las gráficas se quedaban mostrando los
  datos, el error o el estado de carga de la selección anterior.
- **Arreglado:** el diálogo de editar proyecto aplicaba datos de una carga ya descartada.
- **Arreglado:** la importación no normalizaba las unidades declaradas antes de detectar y guardar.
  Ahora convierte a segundos y milímetros primero. Los archivos escritos antes de este cambio no se
  reescriben: **hay que reimportar** los que venían en metros o centímetros.
- Los casos en que la aplicación recurría a un valor de respaldo en silencio ahora dejan una
  advertencia en el registro.
- `./verify.ps1` quedó como la única puerta de verificación del repositorio, con un corpus de prueba
  y valores de referencia protegidos: un cambio que altere un número calculado se detecta en vez de
  pasar inadvertido.
