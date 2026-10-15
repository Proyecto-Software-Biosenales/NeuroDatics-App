# EEG: métodos y reproducibilidad

Cómo calcula la aplicación cada resultado de EEG y con qué límites. La política de escalas por grabación y por
canal, las unidades vacías y su procedencia están en [escalas-por-grabacion.md](escalas-por-grabacion.md).

## Alcance y procedencia

La entrada son los voltajes exportados por canal en los instantes registrados. Los canales de cuero cabelludo
son F3, F4, C3, C4, P3 y P4. LE se conserva para inspección y PSD, pero se excluye de los mapas y de la
correlación EEG agrupada; TRG es un marcador. La aplicación no re-referencia, interpola, filtra, elimina
componentes ni clasifica artefactos sin decirlo.

Las unidades de voltaje explícitas se convierten a µV. Una unidad vacía conserva la suposición histórica de µV,
con aviso. La escala de visualización `kilo` del fabricante se multiplica por 1.000, respaldada por la
comparación con el archivo de adquisición, con la misma salvedad sobre la unidad física. Las unidades desconocidas
se guardan, pero se excluyen de los arreglos cuantitativos de EEG. Los metadatos acompañan a los Parquet de
usuario y de escenario y a las respuestas de la API. Un Parquet antiguo sin esos metadatos requiere verificar su
origen.

## Tiempo y tramos válidos

Sea t_i el tiempo en segundos y x_c,i el valor de un canal. La frecuencia de trabajo es

    fs = 1 / mediana(t[i+1] - t[i]), con los intervalos finitos y positivos.

Es la **estimación de la rejilla de exportación**, no una prueba de la frecuencia del conversor. Si el reloj no se
puede estimar, no se inventa una frecuencia. Las marcas de tiempo duplicadas o invertidas vuelven ambigua la
cronología y suprimen los resultados espectrales y de topografía.

Un tramo termina en una marca de tiempo no finita, en un cambio de escenario o en un intervalo que se desvía más
de un 5 % de la mediana. Esa tolerancia es una política de ingeniería para la precisión de las marcas de tiempo,
no un estándar universal de EEG; las exportaciones de referencia son uniformes muy por debajo de ella. La
fluctuación por debajo del umbral se trata como una rejilla aproximadamente uniforme y se declara en los
metadatos. Los voltajes ausentes de un canal parten los tramos de PSD y de suavizado e invalidan las ventanas
afectadas del espectrograma y la topografía. Los valores a uno y otro lado de un hueco nunca se concatenan ni se
interpolan: se excluyen los tramos inválidos en lugar de fabricar observaciones
([tratamiento de tramos malos en MNE](https://mne.tools/stable/auto_tutorials/preprocessing/20_rejecting_bad_data.html)).

## Visualización temporal y estadísticas

La vista inicial muestra los valores crudos. El suavizado opcional es una media móvil rectangular centrada
dentro de un tramo válido, con soporte truncado en los bordes. Para L muestras, su respuesta en amplitud es
|sin(π f L/fs) / (L sin(π f/fs))|. Una ventana de 0,2 s puede atenuar mucho los ritmos del EEG; es solo una
ayuda visual de tendencia.

Recuento, media, desviación estándar muestral (denominador N−1), mediana, mínimo, máximo y RMS se calculan con
las muestras finitas antes de reducir la gráfica. RMS = sqrt(media(x²)); incluye los desplazamientos y no es
automáticamente potencia oscilatoria neural. Cada modo tiene sus propias estadísticas. Un subconjunto ordenado
de percentiles bajos no es una línea base previa al estímulo, así que las antiguas columnas Base/Pico % se
retiraron; una línea base exigiría un intervalo experimental explícito
([convenciones de línea base en MNE](https://mne.tools/stable/generated/mne.baseline.rescale.html)).

El tope de la gráfica selecciona muestras, no crea una señal nueva para analizar. Las uniones que cruzan un
hueco se cortan. Esta vista previa puede producir aliasing u omitir picos; para estudiar la morfología, usa una
ventana de tiempo más estrecha. La PSD y las estadísticas usan siempre las muestras originales.

## PSD de Welch e integración por bandas

Para cada canal seleccionado se buscan los tramos finitos contiguos. La longitud común de segmento es el tramo
válido más largo, con un tope de 1.024 muestras; se necesitan al menos ocho. Un canal que no llega a llenar esa
ventana se informa como incompleto, en lugar de acortar la ventana de los demás: dejar que un canal corto la fijara
movía la potencia total de los otros entre −9,6 % y −47,4 % sin tocar sus datos. El mínimo de ocho muestras es
computacional, no garantiza una resolución útil en bajas frecuencias. La resolución es fs/L y se informa.

Cada segmento resta su propia media, usa una ventana **Hann periódica** con solapamiento del 50 % y devuelve una
densidad de un lado. Las estimaciones de los tramos se combinan ponderadas por su número de ventanas de Welch, no
por igual. Ninguna ventana atraviesa un hueco. Para x real, cada bin que no es DC ni Nyquist se duplica, con
normalización por fs por la suma de los cuadrados de los pesos de la ventana. Las unidades son µV²/Hz cuando la
calibración de entrada es válida
([definición de Welch en SciPy](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.welch.html)).

Nivel mostrado = 10 log10(max(P, 10^-12) / (1 µV²/Hz)). El suelo evita un valor infinito para potencia cero; no
se suma a las estimaciones físicas. Los arreglos lineales conservan la precisión de coma flotante. La suma de
todos los bins por el espaciado en frecuencia da el cuadrado medio normalizado por la energía de la ventana
(Parseval).

Las bandas son convenciones declaradas: delta 0,5–4, theta 4–8, alfa 8–13, beta 13–30 y gamma 30–45 Hz. Las
integrales usan interpolación lineal por tramos de la PSD en los bordes exactos e integración trapezoidal. Una
banda por encima de Nyquist o más estrecha que un bin no está disponible (null); nunca se trunca sin avisar. Son
potencias de banda absolutas y descriptivas, no diagnósticos ni medidas relativas a una línea base. Las
diferencias en la longitud de ventana o en la cobertura válida limitan las comparaciones; conserva el número de
ventanas y la resolución.

## Espectrograma

Por defecto: ventanas Hann periódicas de 1,5 s, solapamiento del 75 %, resta de la media del segmento, escala de
densidad, sin normalización y sin suavizado gaussiano. Una sola ventana completa es válida. El límite de 25 Hz de
la vista es una elección de visualización; no dice nada sobre si las frecuencias más altas son neurales o
musculares. El tablero pide al menos 120 ventanas (`min_time_bins`); si un tramo corto tiene menos, el salto se
acorta, la longitud de ventana y la resolución no cambian, y `metadata.hop_s` registra el salto usado.

Cada canal se evalúa sobre un conjunto común de centros de ventana reales. Sus ventanas inválidas quedan en null
sin borrar datos válidos de otro canal. La interfaz relaciona cada píxel con el tiempo real y deja en blanco los
tramos no disponibles. Los percentiles de color controlan solo la escala de color; no modifican los valores
devueltos ([espectrograma en SciPy](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.spectrogram.html)).

`freq_demean` se conserva por compatibilidad de la API, pero resta la **mediana** temporal de cada frecuencia y
canal; en dB es un cociente logarítmico respecto a ese nivel mediano, no una línea base experimental.
`freq_zscore` estandariza cada frecuencia con su media temporal y su desviación poblacional. El suavizado
gaussiano opcional usa unidades de bin de frecuencia y tiempo y se limita a tramos válidos ininterrumpidos. Son
transformaciones de visualización: promediar sus píxeles no es potencia integrada.

## Mapa de potencia por sensor

Por defecto: ventanas de 2 s con solapamiento del 50 %. Para cada canal y ventana completos,

    q[c,k] = suma(w[n]^2 * (x[c,k,n] - media(x[c,k,:]))^2) / suma(w[n]^2)

donde w es una Hann simétrica; `remove_dc=false` omite la resta. Un fotograma necesita al menos tres canales de
cuero cabelludo válidos. Los canales ausentes no se rellenan en el tiempo. Las posiciones del esquema usan una
escala fija, independiente de los canales seleccionados. La interpolación por distancia inversa del navegador es
una visualización esquemática de los sensores, no una solución inversa ni una estimación de fuentes corticales,
que exigirían un modelo de cabeza y la geometría de los electrodos
([localización de fuentes en MNE](https://mne.tools/stable/auto_tutorials/inverse/70_eeg_mri_coords.html)).

## Correlación e indicadores de calidad

La correlación EEG usa las desviaciones cuadráticas medias de cada canal dentro de cada intervalo de 250 ms, luego
promedia un conjunto fijo de canales en unidades lineales y lo convierte a dB. Un intervalo necesita al menos
max(8, ceil(0,8 fs × 0,25)) muestras, todas finitas en cada canal incluido y sin cortes de reloj ni de condición.
Un canal ausente invalida el intervalo; nunca cambia el montaje que se promedia. Esta característica de
intervalo rectangular es distinta de la topografía con Hann y es explícitamente descriptiva, sin desfase.

Los metadatos de calidad cuentan valores ausentes, valores adyacentes repetidos, constantes, cortes de reloj y
posibles saltos. Se marca un salto por encima de min(500, max(100, 20 × 1,4826 × MAD(primeras diferencias))) µV
supuestos: el techo de 500 evita que un canal muy ruidoso deje pasar un transitorio evidente.
Esta heurística, deliberadamente conservadora, **no** es un clasificador de artefactos validado y no elimina
nada: investiga los eventos marcados y decide exclusiones o filtros a partir de la evidencia de la adquisición.
Submuestrear sin un filtro paso bajo adecuado puede producir aliasing, y filtrar después no recupera esa pérdida
([remuestreo en MNE](https://mne.tools/stable/auto_tutorials/preprocessing/30_filtering_resampling.html)).

## Reproducir

Desde la raíz del repositorio, en PowerShell, con una carpeta local de grabaciones de referencia (datos privados
que no viajan en el repositorio):

```powershell
.venv/Scripts/python.exe -X utf8 backend/scripts/audit_eeg_references.py `
  <carpeta de grabaciones> --report output/eeg-reference-audit.json
# La figura de validacion.md sale de ese mismo JSON.
.venv/Scripts/python.exe -X utf8 backend/scripts/plot_eeg_audit.py `
  output/eeg-reference-audit.json docs/tecnica/eeg/evidencia/diagnostics.png
./verify.ps1
cd frontend
npx playwright test tests/e2e/eeg-dashboard.spec.ts --workers=1
```

El JSON de la auditoría contiene el SHA-256 de cada archivo, índices de bloque anónimos, la evidencia de escala
en origen y en almacenamiento, resúmenes por canal, diagnósticos del formato nativo y la disponibilidad de los
servicios por escenario. Nunca contiene códigos de participante ni arreglos de muestras.
