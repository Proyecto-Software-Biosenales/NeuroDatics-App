# Comandos y alcance de verificación G08

- Before/after: `benchmark_video_preview.py {before|after} output/perf-g08/corpus/navigation.mp4 ...`; warmup+n=5. El primer intento before usó una ruta relativa equivocada y no produjo medida; se movió sólo el MP4 sintético al corpus raíz y se ejecutó de nuevo con éxito.
- Runtime normal: ocho archivos de pruebas afectados, **125 passed** (`logs/pytest-normal.txt`). Incluye límite ante exceso de proyectos, handoff real del lock y cancelación hasta settlement solicitados por la revisión final.
- Runtime soportado: Python 3.12.13/PyArrow 16.1.0, misma selección, **125 passed** (`logs/pytest-supported.txt`).
- Ruff sobre fuentes, configuración, tests y benchmark: exit 0 (`logs/ruff.txt`).
- Import Linter con `PYTHONPATH=src`: 3 contratos kept, 0 broken (`logs/import-contracts.txt`). La primera invocación sin `PYTHONPATH` no encontró el paquete y no se considera un pase.
- `git apply --reverse --check evidencia/g08/own.patch`: exit 0, sin mutar el checkout.

No se ejecutó gate global/frontend: G08 no cambia frontend y el gate integral está reservado para G12. No se tocó DB/Drive/Redis real, dependencias, venv, despliegue, migraciones, distribuciones ni datos de usuario.
