# Recuperación de incapacidades — Fase 3: completar, homologar, ajustar y liquidar

**Plan:** `docs/Plan_desarrollo_incapacidades_GESTIVO.md`, sección 11, fase 3, y decisiones 12.4, 12.18 y 12.19.
**Migración:** ninguna nueva. Usa las tablas de la fase 2 (`20260911201033_…`), que sigue **pendiente de
aplicar**; la vista `vw_incapacidad_expedientes` de esa migración se amplió con `observaciones` antes de
aplicarse.
**Código:** `src/lib/incapacidades/liquidacion-reglas.ts` (puro) · `liquidacion.ts` (servidor) ·
`src/app/(dashboard)/incapacidades/[id]/{gestion.tsx,actions.ts,page.tsx}`.
**Pruebas:** `npm run test:incapacidades` (35 pruebas: motor + etapa 2).

## Qué hace RRHH en el expediente

El panel «Gestión del expediente · etapa 2» aparece bajo la ficha para los tipos de usuario con permiso de
edición, mientras el expediente esté en `recibido`, `en_completar` o `liquidado` y la incapacidad no esté
eliminada en la matriz.

| Operación | Qué exige | Qué produce |
|---|---|---|
| **Completar datos** | Nada. Cambiar un salario o vigencia ya diligenciados exige motivo | Responsable, salario base con vigencia y fuente, observaciones, próxima acción. Estado `recibido` → `en_completar` |
| **Usar la sugerencia de empleados** | Que `employees` tenga salario para la cédula | Mismo camino que completar, con `salario_fuente = employees`. Es el salario *actual*, y la pantalla lo dice |
| **Homologación** | Tipo del catálogo ORIGEN y entidad EPS/ARL activa. Cambiar algo ya homologado, o la modalidad que trae la matriz, exige motivo | `tipo_homologado`, `entidad_catalogo_id`, `modalidad_ajustada`; `pendiente_homologacion` se apaga cuando hay tipo y entidad |
| **Sobrescribir el cálculo** | Motivo siempre, también para quitar una sobrescritura. Días a cargo ≤ días totales | `dias_entidad_ajustados`, `valor_reclamado_ajustado` |
| **Liquidar / recalcular** | Salario, persona resuelta, entidad y tipo homologados, modalidad, fechas y días de la matriz | Una fila nueva en `incapacidad_liquidaciones` con la regla operativa; la anterior deja de ser vigente. `valor_reclamado` propuesto; estado `liquidado` |

Cada ajuste queda en `incapacidad_ajustes_liquidacion` con campo, nivel (`entrada` o `sobrescritura`),
valor anterior, valor nuevo, motivo y quién. Si el expediente ya estaba liquidado, **cualquier ajuste
recalcula** y enlaza los ajustes con la liquidación que produjeron. Si tras el ajuste faltan datos, la
liquidación anterior sigue vigente y la pantalla lo avisa.

## Reglas que fija

- **Liquidar sin salario devuelve error por campo**, nunca un cero (`faltantesParaLiquidar`).
- **Los días calculados deben coincidir con los de la matriz** (12.19): la entrada del motor lleva
  `diasInformados = dias_it_pagados`; si las fechas no cuadran el motor lanza `dias_no_coinciden` y no se
  liquida.
- **La regla operativa se lee de la base** (`incapacidad_reglas.operativa`) y se valida su forma
  (`reglaDesdeFila`); una regla mal guardada no liquida.
- **La clase de la entidad manda**: si la entidad homologada es ARL, la ARL responde por todos los días
  aunque el tipo diga otra cosa. El tipo homologado prevalece sobre el origen crudo de la matriz.
- **Sobrescrituras**: días a cargo por encima de los días totales bloquea; valor reclamado por encima
  del valor total avisa sin bloquear (decisión 12.18).
- **Concurrencia optimista**: cada formulario lleva la `version` leída; la escritura hace
  `WHERE version = :leida` y, si no afecta filas, devuelve «Otra persona modificó el expediente…». El
  trigger de la fase 2 incrementa `version` y `updated_at`.
- **Auditoría**: `expediente_completado`, `expediente_homologado`, `ajuste_liquidacion` y
  `liquidacion_calculada` en Tesorería › Auditoría con módulo `incapacidades`; la bitácora fila a fila
  en `ausentismo_log` con antes y después.

## Verificación de salida de la fase (plan, 11)

| Criterio | Cómo se verificó |
|---|---|
| Liquidar sin salario devuelve error por campo | Prueba `liquidar sin salario devuelve error por campo, no un cero` |
| Con datos completos reproduce el caso 13.2 elegido | Prueba `con datos completos reproduce el caso 13.2 de cinco días EG…` (N = 3, Q = 130.000) |
| Recalcular deja historial | Por diseño en `liquidarExpediente`: `UPDATE … es_vigente = false` + `INSERT`; se comprueba en la base tras aplicar la migración: dos filas en `incapacidad_liquidaciones` para el mismo expediente, una vigente |
| tsc, eslint, 35 pruebas | limpios |
| UX | vista previa temporal bajo `/docs` + Playwright a 1440/800 con el panel lleno, con faltantes y con conflicto de versión; borrada antes del commit |

## Comprobación manual tras aplicar la migración

1. Abrir un expediente `recibido`. Pulsar «Liquidar» debe estar deshabilitado y listar «Falta el salario…».
2. Guardar salario 1.300.000 y vigencia; homologar si hace falta. «Liquidar» se habilita.
3. Liquidar: el expediente pasa a `liquidado`, la ficha muestra la liquidación vigente y `valor_reclamado`.
4. Cambiar el salario **sin motivo**: debe rechazar. Con motivo: guarda, registra el ajuste y recalcula; en
   `incapacidad_liquidaciones` hay dos filas, una vigente.
5. Sobrescribir días a cargo por encima de los días totales: debe rechazar.
6. Abrir el mismo expediente en dos pestañas, guardar en una y luego en la otra: la segunda debe decir que
   otra persona lo modificó.

## Lo que la fase 3 no hace

Radicar (fase 4), recaudos y conciliación (fase 5), soportes (subir archivos al bucket) y la revisión CI.
