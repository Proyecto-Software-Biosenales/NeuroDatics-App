# Notas del coordinador G06

Esta ejecución CLI es efímera y nueva; el heartbeat sigue siendo nativo del chat raíz. El coordinador revisará la entrega antes de G07. No crear autorepeat, otros agentes ni chats.

Modelo real confirmado: GPT-5.6 Sol/high; GPT-6.1 Sol fue rechazado por el servidor CLI, sin cambio de autenticación. Declarar configuración real en la entrega.

Los archivos de ejecución `evidencia/g06/agente-cli.jsonl`, `agente-cli.stderr.log` y `respuesta-agente.txt` son propios del runner G06 y pueden seguir cambiando hasta que salga. Conservarlos y los diagnósticos launch1/launch2. No contarlos como trabajo ajeno protegido ni afirmar huella final mientras el runner siga escribiéndolos; documentar su carácter operativo. ORQUESTACION.md, ASIGNACION-G06.md y este archivo son del coordinador.

Por ahora no hay preocupación de implementación; seguir sólo el bloque asignado. Leer este archivo antes del cierre.

Revisión inicial root del producto/API: _mask_for_shape, reutilización/asignación y _cadence_by_segment no muestran preocupación científica pendiente. Correcciones documentales antes del cierre: medidas.md dice Pandas3.0.1 pero before.json y G00–G05 indican pandas2.3.3; usa versión efectiva de JSON, sin reejecutar producto por typo. API.md declara ≤26 bytes/F + ≤25 bytes/S como presupuesto persistente aproximado, pero deja fuera first_*_assignment/inside_indices/lista inside y temporales/filtrados: retirar la desigualdad como cota, describir sólo buffers principales/O(F+S) y temporales lineales, sin bound de bytes/RSS no probado. No requiere nuevo algoritmo ni tests. Regenerar patch/manifiesto propios si esas correcciones cambian entrega.
