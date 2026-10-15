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
| 0.19 | `6149ABA556E558E6F19B0D460CC8DB42ED2D889F94B415B44687F163F3E45E85` |
| 0.18 | `1A4E869D33AA4BFBF57BF0B5ADAC4239DDD02EC3AE060CDC6E073E79630B9BE0` |
| 0.17 | `264A5C2715B61FF09A5F7B995632F53FAEA878E45585784629E9A8CF3D4B0C58` |
| 0.16 | `7B864880A0FB72A1C4249125E742367E0710B88E97F45947D3B23D28D24AB615` |
| 0.15 | `2809D2B626F82D58D3242845D70B550D40D4D6E5F13164BAC662DBEA5F61933A` |
| 0.13 | `751AB33677ACBD750AC6F37978EB0F81200CC9D611DD2C03AC682213C4A68EA9` |
| 0.12 | `080C72A07DC9F6FDE0C38C1208D79097F472D56B43FD34FCB12532927D3E7BC7` |
| 0.11 | `3237DBECB5239CC782A0538F4BAB2FE29FC17F3E01170DBB60B5BECE4C9E67A0` |
| 0.11 | `4171716F31DC7A2A0CE99D77B58471E2FC7DA48D562203347879A21EFB5BC41E` |
| 0.10 | `32FE56E7A95C1BA8140E9C8F1D966453ADA4F93C5C5EA997009A61947AB0711E` |
| 0.9 | `54DBC7699A93D7E31F1A5BB551AEE3C4F481FA9AFFD48F1ACEBEC5B67A494A45` |
| 0.8 | `4324631BC22141DC2FE5B8A647F5D12B3DFB852F106AD093E779603382C43EAF` |
| 0.7 | `174204D03B7CA43237042B65757E5A742CA994252FD8EBB7226200056E4AA6DC` |
| 0.6 | `65B50E0162234F5EAB0A01E9E360F18AB57D8380BA37981F0465CDCC3DAB0613` |
| 0.5 | `7F478A9BF63B6A8BB2AFF9E0B747971004872B56FC555115DE7D7E11EF5CF772` |
| 0.4 | `ADCBD4C0258DBFD24E73D44C2CCD0A474C69F493DF8E60EF27411D5FFA6009E7` |
| 0.3 | `25B5815F720555F3D4205EF68207D197785AF86426B546267A3CAE1782F8E8A5` |
| 0.2 | `6D8AE82E…0C945` (el registro histórico solo guardó el valor abreviado) |

La carpeta del programa muestra únicamente `neurodatics-estudiantes.exe` y `LEEME.txt`; todo lo demás
viaja en una carpeta oculta junto al ejecutable.

---

## Sin publicar

### 2026-10-14 — Los modos y las vistas de análisis se explican al pasar el ratón

- **Definiciones breves sin cambiar la pantalla.** Al pasar el ratón por Suavizada, Cruda y Ambas
  (EEG y GSR), Superpuesta y Montaje, Eje X y Eje Y, Escala común y Escalas propias, las pestañas de
  cada sensor (Densidad espectral, Espectrograma, Topografía, Mapa de calor, Mapa de recorridos…),
  los sensores del panel lateral, AOIs, Filtro violeta y el botón «Usar» de un umbral de fijación,
  aparece una frase que dice qué es.
- **Paquete de estudiantes 0.19, reconstruido y entregado.** `./verify.ps1` en verde (navegador 70,
  ESLint 0 errores y 6 advertencias). SHA-256 del zip:
  `6149ABA556E558E6F19B0D460CC8DB42ED2D889F94B415B44687F163F3E45E85` (252 MiB, 4099 archivos,
  632,8 MiB al extraer). `run-frozen.ps1`: PostgreSQL embebido (ocho etapas), servicio real sobre
  HTTP, navegador **5 de 5** `passed` (incluye el tooltip de «Suavizada»), arranque simultáneo de dos
  instancias, 0 conexiones fuera de loopback y 0 procesos de PostgreSQL residuales. El zip extraído
  arrancó desde una ruta con acentos en 13 s.

### 2026-10-14 — El editor del proyecto, más ordenado

- **Participantes más ordenados.** Nombre, documento, sexo y edad comparten una fila de columnas
  iguales y las notas van debajo, con los mismos bordes; antes cada campo tenía un ancho distinto.
- **Campos alineados.** Nombre y Documento ya no quedan 2 px por debajo de Sexo y Edad por llevar el
  icono de ayuda.
- **Pestañas centradas en su recuadro.** La tira de pestañas tiene el mismo margen arriba que a los
  lados (antes tocaba el borde de la tarjeta), y sus iconos y nombres quedan en la misma línea tengan
  o no un resumen debajo.
- **Paquete de estudiantes 0.18, reconstruido y entregado** (la 0.17 tenía las notas a la derecha de
  los datos). `./verify.ps1` en verde (navegador 70, ESLint 0 errores y 6 advertencias). SHA-256 del
  zip: `1A4E869D33AA4BFBF57BF0B5ADAC4239DDD02EC3AE060CDC6E073E79630B9BE0` (252 MiB, 4099 archivos,
  632,8 MiB al extraer). `run-frozen.ps1`: autoprueba, PostgreSQL embebido (ocho etapas), servicio
  real sobre HTTP, navegador **5 de 5** `passed`, arranque simultáneo de dos instancias, 0 conexiones
  fuera de loopback y 0 procesos de PostgreSQL residuales. El zip extraído arrancó desde una ruta con
  acentos en 12,6 s.

### 2026-10-14 — Un solo «Editar» por proyecto, con sus secciones en pestañas

- **Un solo editor.** El menú de la tarjeta ya no tiene «Editar» y «Pre-experimento y cuestionarios»
  por separado: **Editar** abre la misma página para cualquier proyecto, tenga carpeta o no
  (`/proyectos/editar?proyecto=<id>`; la ruta `/proyectos/pre-experimento` y el diálogo «Editar
  proyecto» de cuatro pasos desaparecen).
- **Encabezado con el proyecto.** La página se titula con el nombre del proyecto y muestra su
  descripción, en vez de «Pre-experimento».
- **Pestañas arriba, no una lista larga.** Las mismas pestañas que al crear un pre-experimento:
  Proyecto, Participantes, Cuestionarios, Pantalla y Notas. Un proyecto con carpeta añade
  **Dispositivos**, **Áreas de interés** y **Carpeta** (reemplazarla). Los cuestionarios se dividen en
  Antes, Después y **Respuestas**, donde están «Responder cuestionario», el historial y la descarga.
  En un proyecto con carpeta, Participantes separa **Del experimento** y **Para cuestionarios**.
- **Un solo guardado.** «Guardar cambios» envía solo lo que cambió; si una parte falla, las que ya se
  guardaron no se repiten. Un nombre repetido se informa como tal y ya no se confunde con un cambio
  hecho en otra sesión.
- **Tarjetas alineadas.** La línea del pie queda a la misma altura en todas las tarjetas de una fila,
  aunque una no tenga sensores, y el botón del pie tiene el mismo tamaño en todas.
- **Móvil.** Las pestañas que no caben se desplazan en horizontal; antes, las primeras quedaban fuera
  de alcance.
- **Instrucciones de agentes.** `AGENTS.md` y `docs/frontend-ui.md` tienen reglas de consistencia
  visual: reutilizar componentes, una sola entrada por acción, pies de tarjeta alineados, comprobar en
  pantalla a 1536×730 y 390 px.
- **Paquete de estudiantes 0.16, reconstruido y entregado.** `./verify.ps1` en verde (backend 1225,
  unitarias 104, navegador 70, contratos 3/3, ESLint 0 errores y 6 advertencias). SHA-256 del zip:
  `7B864880A0FB72A1C4249125E742367E0710B88E97F45947D3B23D28D24AB615` (252 MiB, 4099 archivos, 632,8 MiB
  al extraer). `run-frozen.ps1`: autoprueba, PostgreSQL embebido (ocho etapas), servicio real sobre
  HTTP, navegador **5 de 5** `passed`, arranque simultáneo de dos instancias, 0 conexiones fuera de
  loopback y 0 procesos de PostgreSQL residuales. El zip extraído arrancó desde una ruta con acentos en
  13,9 s. E2E con API simulada: `screen-settings` y `ui-consistency`, 12 de 12. El recorrido completo
  con datos reales de `student-offline.spec.ts` (que ahora abre el editor y sus pestañas) no se corrió:
  necesita `STUDENT_RAW_FOLDER`.

### 2026-10-14 — La tarjeta del pre-experimento es como las demás, y toda tarjeta se abre con un clic

- **Misma tarjeta.** El pre-experimento ya no lleva un pie propio («Sin carpeta todavía» / «Agregar
  carpeta»): tiene el mismo tamaño, la misma elevación al pasar el cursor y el mismo pie que el resto.
  Su botón dice **Subir** y abre el paso de la carpeta.
- **Clic en la tarjeta.** Un pre-experimento abre su edición; un borrador continúa el proceso; un
  proyecto activo abre su dashboard (`/dashboard?proyecto=<id>`, que ahora selecciona ese proyecto en
  vez del primero). «Ver proyecto» sigue abriendo la ficha. Los clics en el menú, los botones y los
  diálogos no activan la tarjeta.
- **Paquete de estudiantes 0.15, reconstruido y entregado.** `./verify.ps1` en verde (navegador 67,
  ESLint 6/6). SHA-256 del zip: `2809D2B626F82D58D3242845D70B550D40D4D6E5F13164BAC662DBEA5F61933A`
  (252 MiB, 4098 archivos, 632,7 MiB al extraer). `run-frozen.ps1`: autoprueba, PostgreSQL embebido (ocho
  etapas), servicio real sobre HTTP, navegador **5 de 5** `passed`, arranque simultáneo de dos
  instancias, 0 conexiones fuera de loopback y 0 procesos de PostgreSQL residuales. El zip extraído
  arrancó desde una ruta con acentos en 13,9 s. No se corrieron los e2e con API simulada.

### 2026-10-14 — Pre-experimento: sexo en un desplegable, notas con título y la pantalla después de los cuestionarios

- **Participantes.** El sexo se elige en un desplegable (Masculino, Femenino, Otro) en vez de tres
  casillas, y Nombre, Documento, Sexo y Edad caben en una sola fila.
- **Notas con título.** Cada nota tiene un título arriba y su texto debajo, con el mismo aspecto que los
  grupos de la pantalla. Una nota sin título ni texto no se guarda.
- **Orden de las pestañas.** Proyecto, Participantes, Cuestionarios, Pantalla y Notas: la pantalla va
  después de los cuestionarios. En la página del pre-experimento, «Pantalla y datos relevantes» también
  pasa a ir después de los cuestionarios.
- **Paquete de estudiantes 0.13, reconstruido y entregado.** `./verify.ps1` en verde (backend 1225,
  navegador 67, ESLint 6/6). SHA-256 del zip: `751AB33677ACBD750AC6F37978EB0F81200CC9D611DD2C03AC682213C4A68EA9`
  (252 MiB, 4098 archivos, 632,7 MiB al extraer). `run-frozen.ps1`: autoprueba (siete etapas),
  PostgreSQL embebido (ocho etapas), servicio real sobre HTTP (diez etapas), navegador **5 de 5**
  `passed`, arranque simultáneo de dos instancias, 0 conexiones fuera de loopback y 0 procesos de
  PostgreSQL residuales. El zip extraído arrancó desde una ruta con acentos en 12,7 s. No se corrieron
  los e2e con API simulada.

### 2026-10-14 — Pre-experimento: participantes como en un proyecto con carpeta, notas del proyecto y distancia de respaldo

- **Participantes.** Tienen los mismos campos que al crear un proyecto con su carpeta: Nombre, Documento,
  Sexo y Edad, más sus notas. Desaparece el «Código»: lo reemplaza el documento de identificación, que
  ahora es obligatorio. El nombre pasa a ser opcional; si falta, se muestra el documento. El sexo se
  elige con un clic (Masculino, Femenino, Otro) en vez de escribirse.
- **Sin documentos repetidos.** Dos participantes del mismo proyecto no pueden tener el mismo documento
  (sin distinguir mayúsculas ni espacios): la tarjeta marca «Documento repetido» al escribirlo y no se
  puede crear ni guardar así. El servidor también lo rechaza. Los pre-experimentos guardados con códigos
  se siguen abriendo y piden el documento al guardarlos de nuevo; sus respuestas conservan cómo eran.
- **Notas.** Nueva pestaña «Notas» junto a «Cuestionarios» (y su sección en la página del
  pre-experimento) para apuntar lo que haya que recordar del proyecto, una nota por tarjeta. Las notas
  vacías no se guardan. Las notas de pantalla y los datos relevantes siguen donde estaban.
- **Corregido: la página del pre-experimento no tomaba la pantalla de Configuración.** Solo el
  formulario de creación la copiaba. Ahora, en los dos, la resolución y el tamaño físico vacíos se
  completan con los de Configuración sin contar como cambio sin guardar.
- **Distancia a la pantalla.** Su icono de ayuda explica que solo se usa si falla el registro de
  distancia del eye tracker, que es más preciso. Y ahora es cierto: al agregar la carpeta, si se conoce
  el tamaño físico de la pantalla, la distancia del pre-experimento rellena las muestras donde ese
  registro falló (o todas, si el archivo no lo trae). Antes no la leía nada.
- **Paquete de estudiantes 0.12, reconstruido y entregado.** `./verify.ps1` en verde (backend 1225,
  navegador 67, ESLint 6/6). SHA-256 del zip: `080C72A07DC9F6FDE0C38C1208D79097F472D56B43FD34FCB12532927D3E7BC7`
  (252 MiB, 4098 archivos, 632,7 MiB al extraer). `run-frozen.ps1`: autoprueba (siete etapas),
  PostgreSQL embebido (ocho etapas), servicio real sobre HTTP (diez etapas), navegador **5 de 5**
  `passed`, arranque simultáneo de dos instancias, 0 conexiones fuera de loopback y 0 procesos de
  PostgreSQL residuales. El zip extraído arrancó desde una ruta con acentos en 15,1 s. De los e2e con
  API simulada solo se corrió `screen-settings.spec.ts` (4 de 4).

### 2026-10-14 — Las explicaciones de los campos pasan a un icono de ayuda

- La letra pequeña bajo campos y opciones ocupaba altura y rompía la armonía de los formularios.
  Ahora cada explicación vive en un icono ⓘ junto a la etiqueta: se lee al pasar el ratón, al
  enfocarlo con el teclado o al pulsarlo (pantallas táctiles), y pulsarlo no marca la opción.
- **Crear y editar proyecto.** Datos del participante: «Nombre» y «Documento» llevan su explicación en
  el icono; desaparecen «(opcional)», «Ej: Ana Pérez» y «Ej: 25». Paso 1: sin «Ej: Publicidad
  Coca-cola», sin la frase que repetía la casilla de otra pantalla y sin el párrafo de la zona de la
  carpeta. Sensores y áreas de interés: la definición de cada sensor y la del paso van al icono.
  Ubicación del estímulo: los modos de presentación, «Se aplica a todos los archivos», la nota del
  desplazamiento y la explicación de la sección van al icono.
- **Pre-experimento.** Pantalla, medidas y notas ya no repiten bajo el título lo que dicen sus
  campos; participantes sin «Ej: P01», «Opcional» ni la frase sobre campos obligatorios (ya los marca
  el asterisco); selección múltiple sin la frase «podrá marcar una o varias opciones»; la nota de las
  respuestas guardadas va al icono.
- **Informes.** Los pasos ya no llevan un subtítulo que repite el título; la descripción de cada
  alcance, dispositivo y opción del PDF va al icono.
- Siguen visibles los mensajes de estado: errores, «Cargando…» y por qué no se puede responder un
  cuestionario todavía.
- **Corregido: el aviso «Revisa la configuración de pantalla» podía desaparecer solo** nada más
  aparecer, en un equipo cargado o lento. Al abrir la aplicación se pedía cerrar el aviso antes de que
  existiera; sonner aplica ese cierre dos fotogramas después y se llevaba el aviso recién creado. La
  prueba del paquete congelado lo reprodujo dos veces seguidas. Ahora solo se cierra un aviso que se
  llegó a mostrar.
- **Paquete de estudiantes 0.11, reconstruido y entregado.** `./verify.ps1` en verde (navegador 67).
  SHA-256 del zip: `3237DBECB5239CC782A0538F4BAB2FE29FC17F3E01170DBB60B5BECE4C9E67A0` (252 MiB,
  4098 archivos, 632,7 MiB al extraer). `run-frozen.ps1`: autoprueba (siete etapas), PostgreSQL
  embebido (ocho etapas), servicio real sobre HTTP (diez etapas), navegador **5 de 5** `passed`,
  arranque simultáneo de dos instancias, 0 conexiones fuera de loopback y 0 procesos de PostgreSQL
  residuales. El zip extraído arrancó desde una ruta con acentos en 15,1 s. No se corrieron los e2e
  de Playwright con API simulada.

### 2026-10-14 — Crear proyecto pregunta si se usó otra pantalla, no si usar la geometría

- La casilla «Usar geometría física para la detección ocular» ya no existe: la aplicación ya conoce la
  pantalla (Configuración) y la distancia (la mide el eye tracker). Ahora toda carga de datos usa la
  pantalla de Configuración si tiene ancho y alto físicos; sin ellos, las fijaciones se detectan en
  coordenadas normalizadas, como antes.
- En su lugar, **«Pantalla distinta a la configuración»**: al marcarla aparecen la
  resolución y el tamaño físico, que parten de los de Configuración. Vale solo para ese
  experimento. En ubicación del estímulo, el atajo pasa a «Usar N×M de la otra pantalla».
- Solo cambia el frontend (crear y editar proyecto); el backend recibe la misma geometría de siempre.
- **Paquete de estudiantes 0.11, reconstruido y entregado** (reemplaza al 0.10, que traía el texto
  anterior de la casilla). `./verify.ps1` en verde (backend 1222, 25 snapshots sin regenerar,
  navegador 67). SHA-256 del zip: `4171716F31DC7A2A0CE99D77B58471E2FC7DA48D562203347879A21EFB5BC41E`
  (252 MiB, 4098 archivos, 632,7 MiB al extraer). `run-frozen.ps1`: autoprueba (siete etapas),
  PostgreSQL embebido (ocho etapas), servicio real sobre HTTP (diez etapas), navegador **5 de 5**
  `passed`, arranque simultáneo de dos instancias, 0 conexiones fuera de loopback en 60 muestras y 0
  procesos de PostgreSQL residuales. El zip extraído arrancó desde una ruta con acentos en 12,9 s.
  No se corrieron los e2e de Playwright con API simulada.

### 2026-10-14 — La aplicación dice cada cosa una vez y en español

- **Cuestionarios del pre-experimento.** Ya no hay casilla «Usar cuestionario antes/después»: un
  cuestionario existe en cuanto tiene una pregunta. El botón es **Agregar pregunta**, sin «antes» ni
  «después», porque eso ya lo dice la pestaña. Cada pregunta muestra su número una sola vez. Se
  quitaron la etiqueta «Enunciado», el campo de título (se usa el del momento) y las frases que
  repetían el tipo de respuesta. Un guardado antiguo con preguntas en un cuestionario desactivado se
  abre como activo.
- **Crear proyecto.** Las pestañas del pre-experimento ya no dicen «Opcional»: muestran lo que
  contienen («2 participantes», «3 preguntas»). Se quitaron el encabezado que repetía la pestaña,
  las tarjetas que duplicaban las pestañas y el subtítulo repetido. «Crear nuevo proyecto» pasa a
  «Crear proyecto», y «Con carpeta» a «Con datos». **Crear pre-experimento** se queda.
- **Página del pre-experimento.** **Guardar cambios**, **Descartar cambios**, **Comenzar**,
  **Descargar respuestas**. Se fueron «Versión guardada: N» y el botón «Recargar información».
- **Mensajes sin jerga.** Desaparecen «backend», «ingesta», «ZIP», «Timeout de la peticion» y
  «Regresa al Paso 1». También se quitan «correctamente» y «por el usuario» de los avisos.
- **Un nombre por cosa.** «Informes» en lugar de mezclar informe y reporte; «Eye tracker»,
  «Sensor galvánico», «Histograma de fijaciones», «Distancia al dispositivo». Lo que quedaba en
  inglés pasa a español: «Punto de mirada», «Mirada X (%)», «Permanencia», «Intervalos». En
  ubicación del estímulo, «Completo / Cubre / Recorte» y «Desplazamiento».
- **Analítica.** Las tarjetas de cifras ya no repiten tres veces lo mismo (etiqueta, descripción y
  ayuda). Las pestañas Punto de mirada y Distancia ya no dicen «punto de dilatación pupilar». El
  punto sobre el estímulo se explica con «Mirada en el segundo N · valor».
- **Inicio.** Se reescribió el texto roto de la portada y se quitaron promesas que la aplicación no
  cumple: métricas en tiempo real, emoción agregada e informe «por sensor o publicación completa».
- Tildes corregidas en la interfaz y en los mensajes del servidor: «máximo», «Posición (%)»,
  «Información general», «sesión», «desarchivar»…
- **Paquete de estudiantes 0.9, reconstruido y entregado.** `./verify.ps1` en verde (backend 1222,
  25 snapshots sin regenerar, navegador 104 y 67). Además pasaron los 47 e2e de Playwright, tras
  enseñar al mock de `single-signal-dashboard` la lectura del proyecto que el tablero hace desde
  el 8 de octubre. SHA-256 del zip:
  `54DBC7699A93D7E31F1A5BB551AEE3C4F481FA9AFFD48F1ACEBEC5B67A494A45` (252 MiB, 4098 archivos,
  632,6 MiB al extraer). `run-frozen.ps1`: autoprueba, PostgreSQL embebido (ocho etapas), servicio
  real sobre HTTP (diez etapas), arranque simultáneo y cero procesos de PostgreSQL residuales. En
  la primera ejecución el navegador dio 3 de 5: el aviso de pantalla se desprendió mientras la
  prueba lo pulsaba, y la prueba del pre-experimento cayó en cadena porque espera la pantalla
  guardada en la primera. Repetida la etapa `serve`, el navegador dio **5 de 5** `passed`, con 0
  conexiones fuera de loopback. El zip extraído arrancó desde una ruta con acentos en 12,3 s.

### 2026-10-14 — La pantalla ya no pide datos que habría que inventar

- **Configuración > Pantalla** pide solo la resolución y, si se conocen, el ancho y el alto físicos.
  Se retiraron **Modelo de pantalla** (un texto que nada usaba) y **Distancia a la pantalla**. Lo
  que ya estuviera guardado se conserva; esos dos campos simplemente se ignoran.
- La distancia ojo-pantalla sale ahora de la grabación: el eye tracker la mide por muestra (columna
  `Distance` del CSV). Al crear o editar un proyecto con geometría física basta con el ancho y el
  alto; las fijaciones se calculan en grados con la distancia medida, y las muestras sin distancia
  toman la mediana de ese participante. Si el CSV no trae distancia, las fijaciones se detectan en
  coordenadas normalizadas, como en cualquier proyecto sin medidas físicas, en lugar de usar un
  número escrito a mano.
- El **pre-experimento** conserva el modelo y la distancia como notas del protocolo (dónde se
  sentará el participante); no entran en ningún cálculo.
- **Paquete de estudiantes 0.8, reconstruido y entregado.** `./verify.ps1` en verde (backend 1222,
  25 snapshots sin regenerar, navegador 104 y 67). SHA-256 del zip:
  `4324631BC22141DC2FE5B8A647F5D12B3DFB852F106AD093E779603382C43EAF` (252 MiB, 4098 archivos,
  632,6 MiB al extraer). Pasaron todas las puertas de `run-frozen.ps1`: autoprueba (siete etapas),
  PostgreSQL embebido (ocho etapas), adopción del servidor huérfano, servicio real sobre HTTP (diez
  etapas), navegador **5 de 5** `passed` y arranque simultáneo de dos instancias. Cero conexiones
  fuera de loopback en 54 muestras y cero procesos de PostgreSQL residuales. El zip extraído arrancó
  desde una ruta con acentos en 10,8 s.

### 2026-10-13 — El aviso de pantalla sale una vez por inicio

- «Revisa la configuración de pantalla» volvía a salir cada vez que la persona salía de
  Configuración sin guardar, justo después de haberla revisado. Ahora, si lo cierra o entra en
  Configuración, no vuelve a salir hasta el siguiente inicio de la aplicación (una ventana nueva);
  al guardar la pantalla desaparece para siempre, como antes. Aplica a las dos ediciones.
- **Paquete de estudiantes 0.8, reconstruido y entregado.** `./verify.ps1` en verde; las 5 pruebas
  del navegador sobre el paquete congelado pasaron, 0 conexiones fuera de loopback y 0 procesos
  postgres al salir. SHA-256 del zip:
  `B77D91CD5BA071188921CB44D701F1D0F18B94C45B4E4411FD99EF2EA4C29986` (252 MiB). Se construyó antes
  de los cambios a la tarjeta de pantalla de las 20:54 (campos en cm), que no van en este paquete.

### 2026-10-13 — NeuroDatics Estudiantes arranca en un Windows sin Visual C++

- En un Windows limpio (probado en Windows Sandbox) la base de datos no arrancaba: «postgres.exe —
  MSVCP140.dll was not found». `icuuc67.dll`, del zip de PostgreSQL, importa `msvcp140.dll`, y el
  paquete solo llevaba `vcruntime140*.dll`. En la máquina de desarrollo no se notaba porque el
  Visual C++ Redistributable está en System32. Le pasaba a cualquier estudiante sin ese
  Redistributable instalado.
- `run-frozen.ps1 -Assemble` copia ahora junto a PostgreSQL el runtime de C++ completo y de una sola
  versión (`msvcp140*.dll`, `vcruntime140*.dll`, `concrt140.dll`) desde la carpeta de
  redistribución de Visual Studio (14.44), o desde System32 si no la encuentra (`-VcRuntime` la
  cambia). No hace falta instalar nada ni permisos de administrador.
- Puerta nueva, `student/check-pe-imports.py`: lee las importaciones de los 177 binarios de
  PostgreSQL y falla si alguno necesita una DLL de C++ que no viaja en el paquete. Sobre el 0.6
  señala `msvcp140.dll`; sobre el 0.7 pasa. `package.ps1` exige además `msvcp140.dll` en el zip
  extraído.
- Dos pruebas dependían del idioma de Windows y fallaban en una máquina en español: la de calidad
  por canal del EEG esperaba `1,216` (ahora fija `en-US` en su navegador) y la lectura del estado
  del clúster de `pg_controldata` buscaba el texto en inglés (ahora la pide con `LC_MESSAGES=C`).
  La aplicación no usaba esa lectura; solo las puertas.
- **Paquete de estudiantes 0.7, reconstruido y entregado.** `./verify.ps1` en verde (backend 1218,
  25 snapshots sin regenerar, navegador 104 y 67). SHA-256 del zip:
  `174204D03B7CA43237042B65757E5A742CA994252FD8EBB7226200056E4AA6DC` (252 MiB, 4098 archivos,
  632,6 MiB al extraer). Pasaron todas las puertas de `run-frozen.ps1`: autoprueba (siete etapas),
  PostgreSQL embebido (ocho etapas, cabeza `028`), adopción del servidor huérfano, servicio real
  sobre HTTP (diez etapas), navegador **5 de 5** `passed` y arranque simultáneo de dos instancias.
  Cero conexiones fuera de loopback en 66 muestras y cero procesos de PostgreSQL residuales. El zip
  extraído arrancó desde una ruta con acentos en 14,5 s. Falta repetir la prueba en Windows Sandbox:
  es la única que reproduce un equipo sin el Redistributable.

### 2026-10-12 — Participantes con nombre y documento editable

- En *Datos del participante* (crear y editar proyecto) cada persona aparece como **Participante 1,
  2, 3…**. Dentro hay dos casillas nuevas: **Nombre** (opcional) y
  **Documento**, que viene relleno con el valor detectado en la grabación y se puede corregir. Sexo
  y edad siguen siendo lo único obligatorio.
- Si un participante tiene nombre, el Dashboard lo muestra en el filtro de participante y en la
  comparación entre participantes (selector, tarjetas y búsqueda). Sin nombre, se ve como antes:
  «Participante <documento>». *Ver proyecto* muestra las columnas Nombre y Documento.
- El código detectado en los datos sigue siendo la clave interna: los análisis, las cachés y los
  archivos no cambian al corregir el documento. Migración `027` añade `participants.name` y
  `participants.document` (solo guarda correcciones). Un cliente que no envía estos campos no los
  borra. Reportes y PDF siguen usando el código detectado.
- Verificado: `./verify.ps1` en verde (backend 1217 pruebas y 25 snapshots sin regenerar; el
  contrato de `/analytics/participants` comprueba los campos nuevos aparte, como en las versiones
  anteriores). Se actualizaron las pruebas de navegador del paso 3 y del asistente, y la prueba local
  `student-offline.spec.ts` (encabezados genéricos, documento relleno y el nombre en el filtro del
  Dashboard). La prueba e2e simulada `single-signal-dashboard.spec.ts` ya fallaba antes de este
  cambio por una petición sin simular (`/api/projects/signal-project`); los pasos nuevos sí pasan.
- **Paquete de estudiantes 0.6, reconstruido y entregado.** Antes de empacar se detuvieron la copia a
  `delivery/` que había quedado colgada y la instancia abierta desde esa carpeta (PostgreSQL con
  `pg_ctl stop -m fast`, sin perder datos). Se volvió a pasar `./verify.ps1` en verde (backend 1218)
  y se compiló de nuevo desde el árbol actual, que incluye también «Configuración es global».
  SHA-256 del zip: `65B50E0162234F5EAB0A01E9E360F18AB57D8380BA37981F0465CDCC3DAB0613` (251,5 MiB,
  4092 archivos, 631,4 MiB al extraer). Pasaron todas las puertas de `run-frozen.ps1`:
  - autoprueba (siete etapas);
  - PostgreSQL embebido (las ocho etapas, migraciones hasta la cabeza `028`) y adopción del
    servidor huérfano;
  - servicio real sobre HTTP en un perfil nuevo (las diez etapas);
  - navegador **5 de 5** `passed`, incluido el flujo completo con nombre de participante en el
    filtro del Dashboard;
  - arranque simultáneo de dos instancias.

  Cero conexiones fuera de loopback en 54 muestras y cero procesos de PostgreSQL residuales. El zip
  extraído arrancó desde una ruta con acentos en 13,4 s. `delivery/NeuroDatics-Estudiantes` muestra
  solo el ejecutable y `LEEME.txt`, y trae las migraciones `027` y `028`.

### 2026-10-12 — Configuración es global: la pantalla del experimento

- **Configuración** ya no edita proyectos. Guarda ajustes que comparten todos los experimentos de una
  persona; hoy, la pantalla donde se presentan los estímulos: modelo, resolución y, opcionalmente,
  ancho y alto físicos y distancia. Por defecto es la del laboratorio, **1280×1024**. En la edición
  servidor siguen ahí la sesión y Google Drive.
- Los proyectos nuevos parten de esa pantalla: la pestaña *Pantalla* del pre-experimento, la geometría
  física al activarla en el paso 1 y la pantalla de la ubicación de estímulos. En cada proyecto se
  puede cambiar.
- Mientras una persona no haya guardado su pantalla, cada visita muestra el aviso «Revisa la
  configuración de pantalla», que no bloquea la página; *Ir a Configuración* lleva allí. Se puede
  cerrar, y deja de salir al guardar (aunque se conserven los valores por defecto).
- El editor de pre-experimento y cuestionarios pasa a su propia página,
  `/proyectos/pre-experimento?proyecto=<id>`: se abre con **Editar** en la tarjeta del pre-experimento
  y, en proyectos con carpeta, desde los tres puntos > *Pre-experimento y cuestionarios*.
- Backend: `GET` y `PUT /api/settings/screen`, por usuario, sobre la tabla `user_settings`
  (migración **028**, que sigue a la 027 aún sin confirmar).
- **Arreglado en la edición de estudiantes:** el servidor local solo encontraba los datos de página de
  rutas de un nivel; los de una ruta anidada como `/proyectos/pre-experimento` daban 404 y la
  navegación caía a una recarga completa. Ahora traduce cualquier profundidad
  (`backend/src/neurodatics/local/static_frontend.py`).
- Verificado: `./verify.ps1` en verde (backend 1217, contratos 3 de 3, frontend 104 + 67, ESLint
  0/6). Pruebas e2e con API simulada: las nuevas de `screen-settings.spec.ts` y las de
  `drive-configuration.spec.ts` pasan; los mocks estrictos de los demás specs aprendieron la ruta
  nueva.
- **Paquete de estudiantes 0.6.** SHA-256 del zip:
  `A6A52D9EFC384179F9A6C7DB1F7F59A9753A787CC4C8461BB0C9A2067F956CA9` (251,5 MiB, 4092 archivos, 631,4
  MiB al extraer). Pasaron todas las puertas de `run-frozen.ps1`: autoprueba, PostgreSQL embebido
  (las ocho etapas), adopción del servidor huérfano, servicio real sobre HTTP en un perfil nuevo (las
  diez etapas), navegador **5 de 5** (incluidos el aviso de pantalla y la página del
  pre-experimento), arranque simultáneo de dos instancias, cero conexiones fuera de loopback en 43
  muestras y cero procesos de PostgreSQL residuales. El zip extraído arrancó desde una ruta con
  acentos en 13,6 s. Incluye también los cambios sin confirmar de otra sesión (migración 027,
  nombre y documento de participante).
- **Carpeta del programa no actualizada (resuelto).** `package.ps1` escribió el zip 0.6 en
  `delivery/`, pero no pudo reflejar `delivery/NeuroDatics-Estudiantes` porque una instancia abierta
  desde esa carpeta tenía sus archivos en uso. Después se cerró esa instancia y el paquete 0.6 se
  reconstruyó y entregó completo; el hash vigente del zip es el de la tabla y de la entrada
  «Participantes con nombre y documento editable». El zip `A6A52D9E…` ya no existe.

### 2026-10-12 — NeuroDatics App: dos botones, INSTALAR e INICIAR

- La carpeta de la entrega Docker muestra solo **INSTALAR.bat**, **INICIAR.bat**, **DETENER.bat** y
  **LEEME-PRIMERO.txt**. Todo lo demás viaja en `_internal`, que INSTALAR oculta. El `.env` privado
  sigue en la raíz, para que actualizar `_internal` nunca lo sustituya.
- **INICIAR** es el uso diario, sin Docker Desktop de por medio: si la aplicación ya responde, abre el
  navegador; si Docker está apagado, lo enciende y espera; comprueba las imágenes por ID contra el
  manifiesto, sin volver a calcular huellas; arranca o recrea los contenedores sin borrar volúmenes;
  abre el navegador y la ventana se cierra sola. Solo se queda abierta si algo falla, con el motivo
  en español. Nunca pide permisos de administrador ni modifica `.env`, y si la instalación está
  incompleta pide abrir INSTALAR.
- **INSTALAR** crea el icono «NeuroDatics» del escritorio (uno solo; no toca un acceso ajeno con ese
  nombre), instala Docker Desktop aceptando su licencia (lo avisa LEEME-PRIMERO) y, tras reiniciar,
  continúa INSTALAR en vez de INICIAR. Funciona abierto normalmente o «como administrador» desde la
  misma cuenta; con otra cuenta se detiene. Docker Desktop y el navegador nunca se abren elevados.
- Una carpeta con la estructura anterior se ordena sola al instalar: se retiran solo los archivos de
  la entrega antigua que siguen intactos según su manifiesto, y nunca `.env`. Los datos viven en
  volúmenes `neurodatics_*`, que no dependen de la carpeta.
- **Arreglado:** la imagen del backend no se podía construir desde que `pyproject.toml` exige Python
  3.12. `backend/Dockerfile` pasa a `python:3.12-slim` y Poetry 2.3.3 (la versión que escribe el
  lock), y `poetry.lock` se regeneró sin cambiar ninguna versión: solo salieron 24 variantes para
  Python anterior a 3.12. Solo afecta a la edición servidor; el paquete de estudiantes no se
  reconstruye (no cambian `backend/src`, `backend/migrations`, `frontend/` ni `student/`).
- Verificado: `deployment/tests/instalador.Tests.ps1`, **91 de 91** (incluye INICIAR sin
  instalación, motor apagado, imágenes distintas, aplicación activa, RunOnce antiguo y otra cuenta);
  `deployment/tests/smoke.ps1`, correcta (migración 026). INICIAR medido en la copia aislada: 3 s con
  la aplicación activa, 36 s con los contenedores detenidos, 38 s sin contenedores y **31 s con Docker
  apagado**, con el navegador abierto. La entrega `delivery/NeuroDatics-App` se regeneró con
  `package.ps1` (commit base `6e5d476` más estos cambios sin confirmar).
- Ensayo con el `.env` real de esta máquina: DETENER 2 s; INICIAR con Docker apagado y encendido
  enciende Docker y llega al arranque, pero el backend no pasa su comprobación de salud porque la base
  configurada (Supabase) responde «tenant/user not found», el mismo fallo que ya tenía el stack del
  repositorio. INICIAR se detiene a los 45 s y 11 s con su mensaje y la ventana abierta. Los volúmenes
  y el `.env` quedaron idénticos. Pendiente: corregir `DATABASE_URL` y repetir el ensayo.
- `./verify.ps1` no cubre `deployment/`. Sigue pendiente la instalación en una máquina virtual Windows
  limpia, igual que la ejecución real elevada (cubierta solo con simulaciones).

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
