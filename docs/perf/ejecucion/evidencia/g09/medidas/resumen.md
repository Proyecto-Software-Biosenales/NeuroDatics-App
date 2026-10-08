# Medición G09

Entorno comparable: Python 3.14.3, SQLAlchemy instalado del `.venv`, SQLite 3.50.4 in-memory, base nueva por caso, mismo proceso/script y payload de altas. El hook `before_cursor_execute` contó SQL real cuyo texto comienza por `SELECT`. La implementación previa se cargó desde `output/perf-g09/base`; la final desde el árbol de trabajo.

| Repositorio | n | Antes | Después |
|---|---:|---:|---:|
| participantes | 10 | 20 | 2 |
| participantes | 100 | 200 | 2 |
| participantes | 1.000 | 2.000 | 2 |
| AOIs | 10 | 22 | 3 |
| AOIs | 100 | 202 | 3 |
| AOIs | 1.000 | 2.002 | 3 |

Todos los casos devolvieron exactamente n elementos en orden. Fuentes: [sql-before.json](../sql-before.json), [sql-after.json](../sql-after.json) y [benchmark_sql_reads.py](../benchmark_sql_reads.py).

El probe determinista adicional que cuenta llamadas `execute(SELECT)` + `refresh` reproduce 20/200/2.000→2 para participantes y 22/202/2.002→3 para AOIs; se conserva como corroboración, no como sustituto de SQL real, en `medidas-before.json`, `medidas-after.json` y `benchmark_batch_reads.py`.

No se midieron escrituras como O(1): INSERT/UPDATE/DELETE y procesamiento ORM crecen con los elementos. No se midió latencia ni RSS; los contadores SQL son la señal de aceptación.

PostgreSQL no estuvo disponible: existe CLI Docker pero el daemon no está activo, y no hay `psql`, `initdb` ni `pg_ctl`. Las pruebas compilan el DDL AOI con dialecto PostgreSQL y comprueban el constraint nombrado; ejecución transaccional, concurrencia y constraints en un engine PostgreSQL real quedan para G12/infra disponible. SQLite sólo valida la parte portable y no se presenta como equivalencia de motor.
