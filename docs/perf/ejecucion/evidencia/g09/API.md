# Contrato G09 de persistencia por lote

## Participantes

`SQLParticipantRepository.upsert_participants(project_id, participants_data)` conserva la clave natural efectiva `(project_id, participant_code)` sin crear constraint ni UPSERT de motor. Carga en un solo `SELECT` las claves solicitadas, modifica el mapa en orden de entrada, hace un solo `flush`, captura PKs, confirma una vez y relee por PK en un único `SELECT`.

- La respuesta mantiene longitud y orden del request. Un código repetido en el input reutiliza la misma fila, aplica el último valor y aparece repetido en la respuesta.
- Si ya existen varias filas persistidas para una clave solicitada, se mantiene `MultipleResultsFound`; no se colapsan silenciosamente.
- El lote vacío conserva `[]` y el `commit` anterior, sin lecturas.
- La consulta y relectura incluyen `project_id`; una fila homónima de otro proyecto no participa.
- La relectura por PK devuelve defaults/auditoría materializados y no puede adoptar un duplicado natural concurrente.

## AOIs

`SQLscenariesRepository.upsert_aois(project_id, aois_data)` carga una vez escenarios del proyecto y una vez todas sus AOIs, muta el mapa `(scenaries_id, name)`, elimina las ausentes, hace un solo `flush`, captura PKs, confirma una vez y relee por PK en un único `SELECT`.

- Una AOI cuyo `scenaries_name` no existe se omite. Como antes, sus claves no entran en `incoming_keys`; AOIs no representadas se eliminan. Cada alta usa el `scenaries_id` de su clave preparada actual, por lo que un input inválido posterior no puede contaminar la FK de las altas válidas anteriores.
- Input vacío elimina todas las AOIs del proyecto y devuelve `[]`. AOIs de otros proyectos permanecen intactas.
- Una clave repetida en el input reutiliza la misma fila, aplica el último valor y repite la entidad en el orden de respuesta.
- Duplicados ya persistidos sólo provocan `MultipleResultsFound` cuando esa clave se solicita, igual que el `scalar_one_or_none` anterior. Duplicados omitidos se consideran ausentes y se borran; no bloquean el reemplazo.
- El `CheckConstraint aoi_shape_allowed` y el resto de constraints siguen actuando en el `flush/commit`; el caller debe hacer rollback tras error. No hay commits parciales.

`upsert_scenaries` ya era batch y no cambió: conserva validación previa, guardas de reprocesamiento, triestado de placement, commit único, relectura agrupada y orden del request.

## Rutas, respuestas e invalidación G02

No cambió el HTTP: `PUT /api/projects/{project_id}/participants`, `/scenaries` y `/aois` conservan schemas, autorización, lock de escritura y orden de respuesta. Los callers son `ProjectsApi.setParticipants`, `setScenaries` y `setAois`.

Los tres ya pasan por `analyticsMutation(projectId, ...)`: `invalidateAnalyticsProject` antes y después, barrera durante la mutación y revalidación de metadata al terminar. Participantes invalida el proyecto completo. Escenarios/AOIs además cambian el digest espacial G02, formado desde escenarios completos (orden, dimensiones, placement y AOIs), por lo que las claves espaciales se renuevan sin introducir otra política. No se modificó frontend.

## Presupuesto SQL

Para lotes no vacíos, participantes emite dos lecturas (carga y relectura) y AOIs tres (escenarios, AOIs existentes y relectura). Las escrituras, deletes y trabajo ORM siguen siendo proporcionales al lote; G09 no afirma escrituras O(1). No hay particionado explícito porque los lotes medidos de 1.000 caben en la infraestructura actual.
