# Medidas G07

Probe `g07_reports.py`, runtime recibido Python 3.14.3/pandas 2.3.3/NumPy 2.4.4/PyArrow 25.0.0. Fixture G00 large exact: 4 participantes ×102.400 filas, 17.366.952 B Parquet y 161.056.772 B profundos/frame. Cada phase/state corrió en **proceso separado**, warmup1+n5; mismo archivo/runtime/generación. Frío añade 20 ms por descarga sintética sin vaciar page cache del SO. Sólo carga de grupo; collect y render están separados/excluidos. Los frames devueltos conservan orden, columnas, filas y sumas time/GSR; los JSON after validan misma fixture/runtime que before.

| Estado | Antes mediana [rango] ms | Después mediana [rango] ms | CPU mediana ms | Consultas candidato/OAuth | Descargas/reads |
|---|---:|---:|---:|---:|---:|
| frío | 318,08 [305,20–339,21] | 264,51 [254,58–276,51] | 812,50→703,12 | 4/4→1/1 | 4/4→4/4 |
| caliente | 231,92 [220,15–264,02] | 212,94 [197,46–243,57] | 687,50→687,50 | 0/0→1/1 | 0/4→0/4 |

La mejora observada final es −16,8% fría y −8,2% caliente. Las cuatro descargas científicamente necesarias no se omiten; la reducción fría determinista es la lista de candidatos/OAuth por lote. Caliente añade 1 candidatos/OAuth para fijar identidad y permitir recovery DB-free si el path desaparece; es el coste explícito de corregir la carrera de sweep. Imágenes repetidas concurrentes: 5 consumidores→1 descarga y el acceso caliente siguiente→0, cubierto por test de la capa compartida.

RAM medida (sampling 1 ms), no estimada como bound: máximo RSS absoluto del proceso 900,89→979,62 MiB frío (+8,7%) y 941,98→958,12 MiB caliente (+1,7%). Está por debajo del umbral de incremento experimental 20% y muy por debajo del probe 5 GiB, por eso se adopta 2. El allocator reutiliza memoria tras warmup y algunos deltas por muestra son cero; se reporta el máximo absoluto por proceso/caso, no se presenta `deep_bytes` ni peak acumulado como pico operativo certificado. Fixture construction puede fijar parte del peak lifetime antes de warmup. No se extrapola a nube/contenedor ni a varios informes simultáneos.

Evidencia cruda: `before-cold.json`, `before-warm.json`, `after-cold.json`, `after-warm.json`. Sin PostgreSQL/Drive/Redis real ni datos usuarios.
