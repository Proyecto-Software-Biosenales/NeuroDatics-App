# Licenciamiento: decisión pendiente

**Estado:** abierto. Documento preparado para discutirlo con los profesores del proyecto.
**No es asesoría legal.** Es un resumen técnico de qué software se distribuye, bajo qué
condiciones lo publica cada autor, y qué queda por decidir. La interpretación jurídica
corresponde a quien tenga esa competencia en la universidad.

---

## 1. Dos preguntas distintas

Conviene no mezclarlas, porque tienen respuestas independientes:

1. **¿Bajo qué licencia se publica el código de NeuroDatics?** Hoy no hay ningún archivo
   `LICENSE` en el repositorio. Sin licencia explícita, el código queda bajo derechos de
   autor por omisión: nadie más puede usarlo, modificarlo ni redistribuirlo legalmente,
   aunque tenga acceso al repositorio.
2. **¿Qué obligaciones traen los componentes de terceros que viajan dentro del paquete de
   estudiantes?** Esta pregunta **no depende** de la primera, y hoy tiene un punto sin
   resolver: ffmpeg.

## 2. Un repositorio privado no elimina la segunda pregunta

Es el malentendido más fácil de cometer. El repositorio es privado, así que el código no
se publica. Pero **el paquete de estudiantes sí se distribuye**: es un zip de 251 MB que se
entrega a terceros y que lleva dentro binarios de otros proyectos.

En términos de licencias, entregar ese zip a un estudiante **es distribución**. Las
obligaciones de los componentes que contiene se activan por esa entrega, no por publicar
el repositorio.

## 3. Qué hay dentro del paquete

Datos tomados de `output/student-m1/release/package-report.json` (versión 0.4,
2026-10-11) y de lo que genera `student/make-notices.py`:

| Componente | Dónde va | Licencia | Situación |
|---|---|---|---|
| **ffmpeg y ffprobe** | `_internal\tools\` | **GPL** (compilación con `--enable-gpl`) | **Punto abierto.** Ver §4 |
| PostgreSQL 16 (distribución EDB) | `_internal\pgsql\`, `pg-template\` | Licencia PostgreSQL (permisiva, tipo BSD/MIT) | Cubierto por los avisos |
| Runtime de Python y biblioteca estándar | `neurodatics-estudiantes.exe`, `_internal\` | Python Software Foundation License | Cubierto |
| Microsoft Visual C++ Redistributable | `vcruntime140*.dll`, `msvcp140*.dll` | Términos redistribuibles de Microsoft | Cubierto |
| Tipografía Poppins | `_internal\frontend\fonts\` | SIL Open Font License 1.1 (texto en `OFL.txt`) | Cubierto |
| Bibliotecas de Python (59 paquetes) | `_internal\` | Mayoritariamente permisivas (MIT, BSD, Apache) | Listadas en los avisos |
| Bibliotecas del frontend | `_internal\frontend\` | Declaradas en cada `package.json` | Listadas en los avisos |

El paquete ya incluye un `THIRD-PARTY-NOTICES.txt` que `student/make-notices.py` genera
leyendo los metadatos reales instalados, no una lista escrita a mano. Ese script ya
distingue si el ffmpeg presente es GPL o LGPL inspeccionando su banner de versión, y
escribe las obligaciones correspondientes. El andamiaje está bien hecho; lo que falta es
una decisión y un archivo.

## 4. El punto abierto: ffmpeg

### Qué dice el informe de empaquetado

`package-report.json` registra `"ffmpeg": "GPL build"` y lista este bloqueo de entrega:

> ffmpeg is a GPL build and `tools\` has no LICENSE file: add the license text that came
> with the build, or switch to an LGPL build (owner decision)

### Qué significa en la práctica

ffmpeg se publica por omisión bajo **LGPL 2.1 o posterior**. Cuando se compila activando
componentes que solo están disponibles bajo GPL (la opción `--enable-gpl`), el binario
resultante queda bajo **GPL**. El que viaja hoy en el paquete es de ese segundo tipo.

Las dos variantes imponen obligaciones distintas, y de ahí que el script las trate por
separado. En ambos casos, quien distribuye el binario debe acompañarlo del texto de la
licencia y poder facilitar el código fuente correspondiente. La GPL es la más exigente de
las dos.

### Un matiz técnico que conviene explicar

NeuroDatics **no se enlaza** contra ffmpeg: lo **arranca como un proceso aparte**, y solo
para dos cosas muy concretas — leer las dimensiones de un vídeo y extraer un fotograma.
Esa distinción está documentada en los avisos del paquete y es relevante en la discusión:
agregar un programa GPL a un paquete no es lo mismo que construir un programa derivado
de él. Cómo se califique exactamente esa relación es precisamente la parte que debe
revisar alguien con criterio legal, no nosotros.

### Las tres salidas posibles

| Opción | Qué implica | Coste |
|---|---|---|
| **A. Sustituir por una compilación LGPL** | Descargar una build sin `--enable-gpl`, ponerla en `tools\` y añadir `tools\LICENSE-ffmpeg.txt`. El script detecta el cambio solo y reescribe los avisos. Obligaciones más ligeras | Bajo. Hay que confirmar que la build LGPL cubre los formatos que usamos (lectura de dimensiones y extracción de fotograma: funciones básicas, muy probablemente sí) |
| **B. Conservar la GPL y cumplir sus condiciones** | Añadir `tools\LICENSE-ffmpeg.txt` con el texto completo, y poder entregar el código fuente correspondiente a quien lo pida (el sitio de la build lo publica; el script ya redacta el compromiso de tres años) | Bajo en esfuerzo, pero asume la obligación de disponibilidad del fuente |
| **C. Prescindir de ffmpeg** | Perderíamos la lectura de dimensiones de vídeo y la extracción de fotogramas, o habría que reimplementarlas | Alto. Afecta a funcionalidad que hoy existe |

Mi lectura técnica: **la opción A es la de menor fricción** si la build LGPL cubre nuestros
dos usos, que son elementales. La opción B es perfectamente viable y solo cuesta añadir un
archivo y aceptar el compromiso. La C no la recomiendo.

## 5. La primera pregunta: licencia del código propio

Para decidirla ayuda responder tres cosas con los profesores:

1. **¿De quién es el código?** En un proyecto de grado, la titularidad puede ser del
   estudiante, de la universidad, compartida, o estar regulada por el reglamento de
   propiedad intelectual de la institución. Esto condiciona todo lo demás.
2. **¿Qué se espera que pase después?** Si el proyecto va a continuar como software de uso
   interno, si otro grupo lo retomará, o si se pretende publicarlo, las respuestas difieren.
3. **¿Hay compromisos previos?** Convenios, financiación o acuerdos con terceros que ya
   determinen la licencia.

Panorama resumido de las opciones habituales, sin recomendar ninguna:

- **MIT / BSD**: permisivas y breves. Cualquiera puede usar y modificar, incluso en
  software cerrado, conservando el aviso de copyright.
- **Apache-2.0**: permisiva, más explícita en patentes y atribución.
- **GPL-3.0**: exige que los trabajos derivados se publiquen con la misma licencia.
- **Propietaria / «todos los derechos reservados»**: el estado de hecho actual. Es una
  opción válida, pero conviene que sea deliberada y escrita, no el resultado de no haber
  puesto un archivo.

Nótese que las opciones de esta sección y las de ffmpeg son independientes: elegir MIT
para nuestro código no entra en conflicto con distribuir ffmpeg bajo su propia licencia,
siempre que esta se respete.

## 6. Los otros dos bloqueos de entrega (no son de licencia)

`package-report.json` registra tres bloqueos. Para que no se confundan con este tema, los
otros dos son:

- **Sin prueba en un portátil real:** SmartScreen, Smart App Control, antivirus, runtimes
  ausentes y la RAM de la máquina del estudiante siguen sin verificarse. Procedimiento
  en `docs/student/LAPTOP-TEST.md`.
- **Gobernanza de los datos crudos de participantes** que se entregan a los estudiantes:
  sin confirmar. Este sí tiene una dimensión normativa (protección de datos personales) y
  conviene tratarlo en la misma conversación, aunque no sea una cuestión de licencias de
  software.

## 7. Qué decidir y en qué orden

1. **ffmpeg: A, B o C** (§4). Es la única que bloquea la entrega del paquete. Se resuelve
   en minutos una vez tomada.
2. **Titularidad del código** (§5.1). Condiciona la licencia; probablemente la respondan
   los profesores o la oficina correspondiente.
3. **Licencia del código propio**, una vez clara la titularidad. Crear el archivo
   `LICENSE` en la raíz del repositorio.
4. **Gobernanza de los datos de participantes** (§6), en paralelo.

Al cerrar cada punto, anotarlo aquí con la fecha y quién lo decidió, y actualizar
`docs/CHANGELOG.md`.

---

### Referencias dentro del repositorio

- `student/make-notices.py` — genera `THIRD-PARTY-NOTICES.txt` desde los metadatos reales;
  distingue GPL de LGPL leyendo el banner de ffmpeg.
- `output/student-m1/release/package-report.json` — informe de la versión 0.4, con los
  tres bloqueos de entrega.
- `docs/student/LAPTOP-TEST.md` — procedimiento de la prueba en portátil real.
- `student/README.md` — qué entra en el paquete y dónde.
