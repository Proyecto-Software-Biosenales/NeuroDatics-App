# Datos {#cap-datos}

NeuroDatics analiza los datos que exporta el equipo de adquisición: un archivo `.csv` con las señales y las imágenes o vídeos que vieron los participantes. Este capítulo explica cómo preparar esa carpeta, cargarla en el primer paso del asistente y seguir su procesamiento. Los formatos completos están en [[ref:ref-formatos]].

## Preparar la carpeta del experimento {#preparar-carpeta}

NeuroDatics recibe una **carpeta** de tu computador, no un archivo `.zip`. Antes de cargarla, revisa que tenga esta forma:

<!-- anchos: 28 44 28 -->
| Elemento | Qué contiene | Si falta |
| --- | --- | --- |
| Un archivo `.csv` | Los datos del experimento: Eye tracker, EEG o GSR. | No se puede cargar la carpeta. |
| Carpeta `Images` | Una imagen por cada escenario de imagen. | Te pregunta si quieres continuar sin imágenes. |
| Carpeta `Videos` | Un vídeo por cada escenario de vídeo. | Te pregunta si quieres continuar sin vídeos. |
| Carpeta `Acquisition` | Las carpetas de grabación del equipo de adquisición, con nombres como `Sujet_P-001_Scenario_Inicio_Rec1`. | Nada: solo sirve de referencia. |

Ten en cuenta estas reglas:

- **El nombre de cada imagen o vídeo es el nombre del escenario.** Debe coincidir con el escenario que aparece en el `.csv`. No importan las mayúsculas, los espacios ni la extensión, pero sí las tildes: `Crem helado.jpeg` corresponde al escenario «Crem Helado», y `Bebe.jpg` no corresponde a «Bebé». No uses dos archivos con el mismo nombre aunque cambie la extensión.
- **Las carpetas `Images` y `Videos` pueden estar en cualquier nivel** y escribirse con mayúsculas o minúsculas. Si hay más de una, NeuroDatics te pide elegir.
- **Se procesa un solo `.csv`.** Si la carpeta tiene varios, eliges cuál usar. Los `.csv` que estén dentro de `Acquisition` no cuentan.
- **De `Acquisition` solo se leen los nombres de las carpetas de grabación.** Sirven para proponer los códigos de los participantes y los nombres de los escenarios; sus archivos no se guardan.
- **Lo demás se ignora.** Los archivos que no sean `.csv` ni estén en `Images`, `Videos` o `Acquisition` no se cargan.

::: nota
La carpeta completa no puede superar los 500 MB. Se cuenta todo lo que contiene, incluidos los archivos que luego se ignoran; solo quedan fuera los archivos ocultos. Si la carpeta tiene otros archivos pesados, cópiala sin ellos antes de cargarla.
:::

Las extensiones de imagen y vídeo aceptadas y las columnas que debe tener el `.csv` están en [[ref:ref-formatos]]. Los demás límites, en [[ref:ref-limites]].

## Cargar la carpeta {#cargar-carpeta}

La carpeta se carga en el paso 1 del asistente «Crear proyecto». Antes de empezar, prepárala ([[ref:preparar-carpeta]]) y usa un navegador que permita elegir carpetas completas.

La [[fig:4-1]] muestra la zona de carga con una carpeta ya elegida.

![[fig:4-1|Zona de carga del paso 1 con una carpeta elegida y el resumen de lo que se va a procesar.|w=5.3]]

Después de escribir el nombre del proyecto ([[ref:crear-proyecto]]):

1. Si la pantalla del experimento no es la de Configuración, marca **Pantalla distinta a la configuración** y escribe su **Ancho (px)**, **Alto (px)**, **Ancho (cm)** y **Alto (cm)**.
   Los campos vienen con los valores de Configuración. Todos deben ser mayores que cero.
2. Haz clic en **Seleccionar carpeta** (1) y elige la carpeta del experimento.
   Aparece «Carpeta seleccionada:» con su nombre. La X de al lado la quita.
   - También puedes arrastrar la carpeta a la zona punteada «Arrastra la carpeta aquí o haz clic para seleccionar».
3. Si aparece «Confirma la carpeta», responde sus preguntas. Ver [[ref:confirmar-carpeta]].
4. Revisa el resumen gris (2): **CSV a procesar**, **Imágenes** y **Vídeos** muestran lo que se va a cargar.
   Si hay carpeta `Acquisition`, el resumen dice cuántas grabaciones encontró.
5. Si la carpeta tiene imágenes o vídeos, registra cómo se mostraron en pantalla. Ver [[ref:ubicacion-estimulo]].
6. Haz clic en **Siguiente**.
   Empieza el procesamiento. Ver [[ref:procesamiento]].

Al terminar el procesamiento, el asistente pasa al paso 2 y muestra «Carpeta procesada.».

El recordatorio «Nombra las imágenes y vídeos igual que en los datos.» del pie del paso importa: una imagen cuyo nombre no coincide con un escenario del `.csv` no se relaciona con sus datos.

### Si algo sale mal

**Siguiente** solo se activa con el nombre escrito, la carpeta elegida sin preguntas pendientes, la pantalla válida y la ubicación del estímulo completa en los archivos marcados. Los errores de la carpeta aparecen en rojo bajo la zona de carga:

<!-- anchos: 45 55 -->
| Mensaje | Qué hacer |
| --- | --- |
| «La carpeta es demasiado grande. Máximo 500 MB.» | Quita de la carpeta los archivos que no hacen falta y vuelve a elegirla. |
| «La carpeta debe contener al menos un archivo .csv con los datos del experimento.» | Añade el `.csv` exportado por el equipo de adquisición. |
| «Arrastra una carpeta, no un archivo suelto.» | Arrastra la carpeta completa, no un archivo de dentro. |
| «No se encontraron archivos en la carpeta.» | Comprueba que elegiste la carpeta correcta y que no está vacía. |

Si el error sale después de hacer clic en **Siguiente**, ver [[ref:procesamiento]] y [[ref:problemas-datos]].

## Responder «Confirma la carpeta» {#confirmar-carpeta}

Cuando la carpeta admite más de una lectura, NeuroDatics te pregunta antes de procesarla. Las preguntas salen en una caja ámbar titulada «Confirma la carpeta», como en la [[fig:4-2]]. Hasta que respondas todas, **Siguiente** no se activa.

![[fig:4-2|Caja «Confirma la carpeta» con una pregunta sobre la carpeta de vídeos.|w=5.3]]

<!-- anchos: 45 55 -->
| Pregunta | Qué contestar |
| --- | --- |
| «La carpeta contiene … archivos .csv. Elige cuál usar.» | Haz clic en la ruta del `.csv` con los datos del experimento. |
| «La carpeta no contiene ninguna subcarpeta 'Images'. ¿Quieres continuar sin imágenes?» | **Sí, continuar** si el experimento no tenía imágenes. Si las tenía, **No, elegir otra carpeta** y corrige la carpeta. |
| «La carpeta no contiene ninguna subcarpeta 'Videos'. ¿Quieres continuar sin vídeos?» | **Sí, continuar** si el experimento no tenía vídeos; si no, **No, elegir otra carpeta**. |
| «La carpeta contiene … subcarpetas 'Images'. Elige cuál usar.» | Haz clic en la carpeta con las imágenes que se mostraron. |
| «La carpeta contiene … subcarpetas 'Videos'. Elige cuál usar.» | Haz clic en la carpeta con los vídeos que se mostraron. |
| «La carpeta contiene … subcarpetas 'Acquisition'. Elige cuál usar como referencia.» | Haz clic en la de este experimento. |

Al responder la última, la caja desaparece y se muestra el resumen gris.

::: nota
Si cambias la carpeta en el computador después de elegirla, al hacer clic en **Siguiente** puede volver un mensaje en rojo que empieza por «La carpeta necesita una confirmacion antes de procesarse.». Elige la carpeta otra vez y responde de nuevo.
:::

## Seguir el procesamiento {#procesamiento}

Al hacer clic en **Siguiente** en el paso 1, NeuroDatics lee el `.csv`, guarda imágenes y vídeos y crea participantes y escenarios. Puede tardar unos minutos. Bajo el formulario se ven, por orden, «Creando el proyecto…», «Preparando la carpeta…» y «Subiendo datos del experimento…» con su porcentaje. Después aparece el panel de progreso de la [[fig:4-3]].

![[fig:4-3|Panel de progreso: porcentaje, tiempo restante y botón para cancelar.|w=5.3]]

El panel muestra:

- La barra con el porcentaje completado (1) y los megabytes enviados del total.
- **VELOCIDAD**, **RESTANTE** (2) y **TRANSCURRIDO**.
- El botón **Cancelar** (3) del panel.

El título y los mensajes del panel cambian según la edición:

- {servidor} «Sincronizando con Google Drive», con la línea «Procesando en Google Drive…». Al final, «Finalizando sincronización con Google Drive».
- {estudiantes} «Guardando archivos en este equipo», con la línea «Procesando los datos…». Al final, «Finalizando el guardado de archivos».

Mientras tanto, abajo en el centro de la pantalla se ve el aviso «Procesando archivos de «…» · …%». Cuando todo termina, el panel dice «Sincronización completada» y el asistente pasa al paso 2.

::: nota
El porcentaje avanza cada vez que termina un archivo completo, así que puede parecer detenido con archivos grandes. Al llegar al 99 % se queda ahí mientras se terminan de guardar los datos. Es normal: espera.
:::

Para cancelar, haz clic en **Cancelar** en el panel. Verás un mensaje de cancelación y después «Subida cancelada.»:

- {servidor} «Cancelando la subida a Google Drive…»
- {estudiantes} «Cancelando la subida…»

El botón **Cancelar** del pie del diálogo no funciona mientras se procesa. Después de cancelar o de un error, puedes corregir lo necesario y hacer clic en **Siguiente** otra vez en el mismo diálogo.

::: importante
No cierres el diálogo mientras se procesa: cerrarlo detiene la carga y el borrador puede quedar en la lista solo con **Ver proyecto**. En ese caso, elimínalo y crea el proyecto de nuevo ([[ref:retomar]]).
:::

Solo puedes procesar una carpeta a la vez. Si aparece «Ya tienes una carga de experimento en curso. Espera a que termine antes de iniciar otra.», espera a que termine la otra.

### Si algo sale mal

Si el procesamiento falla, aparece un recuadro rojo que empieza por «Error:». Los mensajes más frecuentes:

<!-- anchos: 45 55 -->
| Mensaje | Qué hacer |
| --- | --- |
| «Ninguno de los … CSV del ZIP pudo procesarse; no se reemplazaron los datos previos del proyecto. Motivo: …» | El `.csv` no tiene el formato esperado; lo que sigue a «Motivo:» dice qué falla en cada archivo («ZIP» se refiere a tu carpeta). Revísalo con [[ref:ref-formatos]] y vuelve a intentarlo. |
| «La carpeta supera el máximo de 500 MB. Reduce su tamaño.» | Quita archivos que no hacen falta y vuelve a elegir la carpeta. |
| «La subida tardó demasiado.» o «No se pudo conectar con NeuroDatics durante la subida.» | Vuelve a hacer clic en **Siguiente**. Si sigue, ver [[ref:problemas-datos]]. |

{servidor} Si el mensaje termina en «La conexión con Google Drive necesita renovarse: avisa a quien administra NeuroDatics.», la carpeta no se puede guardar hasta que quien administra NeuroDatics renueve la conexión. Ver [[ref:drive]].

Para el resto de mensajes, ver [[ref:problemas-datos]].

## Retomar o continuar un borrador {#retomar}

Un proyecto que no terminó el asistente queda como **Borrador**. El botón del pie de su tarjeta dice qué falta ([[ref:tarjeta]]).

**Retomar** aparece con «Carpeta sin procesar»: la carpeta no terminó de cargarse.

1. En la tarjeta del borrador, haz clic en **Retomar**.
   Se abre el asistente en el paso 1 con el nombre y la descripción que ya tenía.
2. Elige otra vez la carpeta del experimento. Ver [[ref:cargar-carpeta]].
3. Haz clic en **Siguiente** y sigue el asistente.

**Continuar** aparece cuando la carpeta ya se procesó y falta terminar el asistente.

1. En la tarjeta del borrador, haz clic en **Continuar**.
   Se abre el asistente en el paso 2. **Anterior** no vuelve al paso 1: la carpeta ya no se puede cambiar.
2. Completa los pasos 2, 3 y 4 y haz clic en **Guardar proyecto**. Ver [[ref:crear-proyecto]].

Si la tarjeta solo ofrece **Ver proyecto**, la carga falló durante el procesamiento y no se puede retomar. Elimina el borrador ([[ref:eliminar]]) y crea el proyecto de nuevo con la carpeta corregida.

Para un pre-experimento, el botón es **Subir**. Ver [[ref:subir-preexperimento]].

## Registrar la ubicación del estímulo en pantalla {#ubicacion-estimulo}

Registra en qué parte de la pantalla y de qué tamaño se mostró cada imagen o vídeo durante la adquisición. Con este dato NeuroDatics sitúa la mirada sobre el estímulo con más precisión; si lo omites, los resultados de mirada mostrarán una advertencia.

La sección **Ubicación del estímulo en pantalla** está en el paso 1, bajo la carpeta, y solo aparece si hay imágenes o vídeos. A la derecha muestra **Opcional**, **Listo** o cuántos archivos están incompletos. La [[fig:4-4]] la muestra desplegada.

![[fig:4-4|Ubicación del estímulo: tamaño de la pantalla de la adquisición y forma en que se mostró cada archivo.|w=5.3]]

1. Haz clic en **Ubicación del estímulo en pantalla** para desplegarla.
2. En **Pantalla de la adquisición (px)** (1), comprueba el ancho y el alto en píxeles de la pantalla donde se mostraron los estímulos. Vienen con la pantalla guardada en Configuración; cámbialos si la adquisición usó otra.
   - Si aparece el botón **Usar … de la otra pantalla**, haz clic en él para copiar el tamaño que escribiste en **Pantalla distinta a la configuración**.
3. Marca **Registrar todos los archivos**, o solo la casilla de cada archivo que quieras registrar.
4. En cada archivo, elige en **¿Cómo se mostró?** (2) una de las cuatro formas de la tabla siguiente.
5. Salvo en **Pantalla completa**, completa **Rectángulo mostrado (px)**: **X (izquierda)**, **Y (arriba)**, **Ancho** y **Alto**. **Centrar** coloca el estímulo en el centro.
   - Si el estímulo se mostró dentro de una región con desplazamiento, marca **Se mostró dentro de una región con desplazamiento** y completa sus medidas, incluidos **Desplazamiento X** y **Desplazamiento Y**. Con **Cubre** y **Recorte** esta casilla se marca sola.
6. Si los demás archivos se mostraron igual, haz clic en **Aplicar a los otros … archivo(s)**.

<!-- anchos: 25 75 -->
| Opción | Cuándo elegirla |
| --- | --- |
| **Completo** | El estímulo se mostró completo, con márgenes alrededor. |
| **Cubre** | El estímulo cubrió toda la región visible y se recortó por los bordes. |
| **Recorte** | Solo se mostró una región recortada del estímulo. |
| **Pantalla completa** | El estímulo ocupó exactamente toda la pantalla. Las medidas se rellenan solas. |

Al terminar, si ningún archivo marcado está incompleto, la sección muestra **Listo**. Un esquema dibuja la pantalla y el estímulo para que compruebes la posición.

Un archivo marcado con datos incompletos o contradictorios muestra un mensaje bajo él y desactiva **Siguiente**; si no quieres registrarlo, desmarca su casilla. Los mensajes más frecuentes:

<!-- anchos: 50 50 -->
| Mensaje | Qué hacer |
| --- | --- |
| «Indica el tamaño de la pantalla usada en la adquisición.» | Completa **Pantalla de la adquisición (px)**. |
| «Completa la posición y el tamaño con el que se mostró el estímulo.» | Completa **X (izquierda)**, **Y (arriba)**, **Ancho** y **Alto**. |
| «“Cubre” y “Recorte” necesitan que definas la región visible.» | Deja marcada **Se mostró dentro de una región con desplazamiento** y completa sus medidas. |
| «La región visible debe quedar dentro de la pantalla.» | Revisa que la región no se salga del ancho y el alto de la pantalla. |
| «“Completo” exige que el estímulo quepa entero dentro de la región visible.» | Reduce el tamaño mostrado o elige otra opción. |

Si al procesar aparece un mensaje en inglés sobre la pantalla, ver [[ref:problemas-datos]].

## Asignar documento a los participantes del pre-experimento {#asignar-documento}

Al cargar la carpeta de un pre-experimento ([[ref:subir-preexperimento]]), el paso 3 del asistente une cada persona que registraste en la preparación con su documento en los datos, para que sus cuestionarios y notas queden con sus resultados.

En **Datos del participante** aparecen primero los participantes planificados, cada uno con el campo **Asignar documento**. NeuroDatics ya propone una pareja:

- Si el documento es igual en las dos listas, sin contar mayúsculas, espacios ni signos, los une.
- Si difiere en muy pocos caracteres, propone el más parecido.
- Si no encuentra ninguno parecido, deja la persona **Sin asignar**.

La [[fig:4-5]] muestra el paso con un participante sin asignar.

![[fig:4-5|Paso 3 de un pre-experimento: desplegable para asignar el documento e insignia de participante sin asignar.|w=5.3]]

1. Revisa cada participante planificado.
2. Si la pareja propuesta no es correcta, abre **Asignar documento** (1) y elige el documento con el que aparece en los datos.
   Los documentos se ordenan del más parecido al menos parecido. Cada documento de los datos solo se puede asignar a una persona.
3. Si la persona no participó, deja **Sin asignar** (2).
4. Completa el **Sexo** y la **Edad** de los participantes que solo están en los datos, que van al final.
5. Haz clic en **Siguiente**.

Al asignar un documento, el participante de los datos toma el documento, el nombre, el sexo y la edad que registraste en la preparación. Al hacer clic en **Guardar proyecto**, sus cuestionarios y notas quedan unidos a sus resultados.

::: importante
Quien queda «Sin asignar» sigue en el proyecto con sus cuestionarios y notas, pero no aparece en el Dashboard, los informes ni las estadísticas. El paso lo recuerda con un aviso como «1 participante del pre-experimento queda sin asignar.».
:::

Si el mismo documento queda en dos tarjetas, aparece «Hay dos participantes con el documento … Asigna ese documento a quien corresponde.» y **Siguiente** no se activa hasta que lo corrijas.

Si después descubres un error, puedes cambiar la asignación en el editor del proyecto. Ver [[ref:participantes]].
