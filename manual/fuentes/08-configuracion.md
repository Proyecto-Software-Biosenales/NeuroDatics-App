# Configuración {#cap-configuracion}

Configuración guarda los ajustes que comparten todos tus proyectos. Tiene un solo ajuste: la pantalla donde se presentan los estímulos. Este capítulo explica también el aviso que pide revisarla, el cambio de tema y, en la edición servidor, Google Drive.

## Revisar la pantalla del laboratorio {#config-pantalla}

NeuroDatics necesita saber el tamaño de la pantalla en la que los participantes vieron los estímulos para situar la mirada sobre ellos. Los proyectos nuevos parten de los valores que guardes aquí; en cada proyecto puedes cambiarlos si usaste otra pantalla ([[ref:cargar-carpeta]], [[ref:pantalla-proyecto]]).

Antes de empezar, averigua la resolución de la pantalla del laboratorio en píxeles y, si puedes, su ancho y alto visibles en centímetros.

1. Haz clic en tu nombre, arriba a la derecha de la barra superior (**Menú de usuario**).
   - {estudiantes} El botón dice **Estudiante**.
2. Haz clic en **Configuración**, como en la [[fig:8-1]].
   Se abre la página «Configuración» con la tarjeta «Pantalla».
3. Comprueba o escribe el **Ancho (px)** y el **Alto (px)** de la pantalla, señalados con (1) en la [[fig:8-2]].
4. Escribe el **Ancho (cm)** y el **Alto (cm)** si los conoces; puedes dejarlos vacíos.
5. Haz clic en **Guardar configuración de pantalla**, señalado con (2) en la [[fig:8-2]].

![[fig:8-1|Menú de usuario abierto, con la opción que lleva a Configuración.|w=5.3]]

La [[fig:8-2]] muestra la tarjeta «Pantalla».

![[fig:8-2|Tarjeta Pantalla de Configuración: resolución del monitor y botón para guardar.|w=5.3]]

Al terminar, aparece «Configuración de pantalla guardada.» y, en la tarjeta, «Configuración revisada.».

Mientras no la hayas guardado nunca, la tarjeta muestra en ámbar «Comprueba que estos valores correspondan a tu pantalla y guárdalos. Por defecto se usa la del laboratorio (1280×1024 px).». Si esos valores ya son los correctos, guárdalos sin cambiarlos: también cuenta como revisada.

::: consejo
Rellena las medidas en centímetros si las conoces. Sin ellas, NeuroDatics calcula las fijaciones sin saber el tamaño real de la pantalla.
:::

### Si algo sale mal

<!-- anchos: 45 55 -->
| Mensaje | Qué hacer |
| --- | --- |
| «La resolución debe ser un número entero de píxeles mayor que cero.» | Escribe el ancho y el alto en píxeles como números enteros, sin decimales y sin dejarlos vacíos. |
| «Las medidas físicas deben ser positivas o quedar vacías.» | Corrige los centímetros o déjalos vacíos. |
| «No se pudo cargar la configuración de pantalla.» | Haz clic en **Reintentar**. |
| «No se pudo guardar…» | Revisa los valores y vuelve a guardar. Ver [[ref:problemas-edicion]]. |

## El aviso «Revisa la configuración de pantalla» {#aviso-pantalla}

Mientras no hayas guardado la pantalla en Configuración, NeuroDatics muestra un aviso emergente con el título «Revisa la configuración de pantalla» y el texto «Asegúrate de que las dimensiones de la pantalla del experimento sean correctas.». Suele salir la primera vez que usas la aplicación. No bloquea la página: puedes seguir trabajando.

La [[fig:8-3]] muestra el aviso.

![[fig:8-3|Aviso emergente que pide revisar la pantalla, con el botón que lleva a Configuración.|w=5.3]]

1. Haz clic en **Ir a Configuración** en el aviso.
2. Revisa y guarda la pantalla. Ver [[ref:config-pantalla]].

Al terminar, el aviso no vuelve a aparecer.

Si cierras el aviso sin guardar la pantalla, desaparece por ahora, pero vuelve a salir más adelante:

- {servidor} al abrir NeuroDatics en otra pestaña del navegador.
- {estudiantes} cada vez que vuelvas a abrir NeuroDatics.

## Cambiar entre tema claro y oscuro {#tema}

NeuroDatics se abre con el tema claro. Si prefieres fondos oscuros, haz clic en **Cambiar tema**, el botón con la luna o el sol en la barra superior.

Al terminar, toda la aplicación cambia de tema. Vuelve a hacer clic para regresar al anterior.

::: consejo
También puedes cambiar el tema con la tecla **D**, siempre que no estés escribiendo en un campo.
:::

## Google Drive {#drive}

{servidor} En la edición servidor, los archivos de los proyectos se guardan en Google Drive, en una cuenta que conecta quien administra NeuroDatics. No tienes que configurar nada en la aplicación: Configuración no tiene ninguna opción de Drive.

{servidor} Si al cargar una carpeta o al guardar un proyecto aparece un mensaje que termina en «La conexión con Google Drive necesita renovarse: avisa a quien administra NeuroDatics.», avísale. Hasta que renueve la conexión no podrás cargar carpetas.

{estudiantes} En la edición estudiantes no se usa Google Drive: los archivos se guardan en tu computador y no hace falta internet.
