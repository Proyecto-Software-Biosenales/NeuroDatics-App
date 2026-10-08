# Checks G12 correction

| Check | Resultado |
|---|---|
| Directed normal | 33 passed, exit 0 |
| Directed isolated | 33 passed, exit 0; Python 3.12.13 / PyArrow 16.1.0 |
| Ruff directed | exit 0 |
| Global verify (single post-fix run) | exit 1; backend 1183 passed, then frontend TypeScript failed at `comparison-dashboard.spec.ts:627` |
| Reverse-check readonly | exit 0 |

La ruta solicitada `supported-env3.12/PyArrow16.1` no existe literalmente en el árbol recibido; se usó el runtime disponible `output/perf-g03/supported-env`, que reporta Python 3.12.13 y PyArrow 16.1.0.
