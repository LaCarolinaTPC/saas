# Recuperación de incapacidades — Fase 4: radicación y umbral

**Plan:** `docs/Plan_desarrollo_incapacidades_GESTIVO.md`, sección 11, fase 4, y decisiones 12.10 y 12.17.
**Migración:** `supabase/migrations/20260911205408_incapacidades_radicacion_ante_la_entidad_y_umbral_por_entidad.sql`
(requiere la de la fase 2, `20260911201033_…`, que sigue **pendiente de aplicar**; aplicar las dos en orden).
**Código:** `src/lib/incapacidades/radicacion-reglas.ts` (puro) · `radicacion.ts` (servidor) ·
`src/app/(dashboard)/incapacidades/[id]/radicacion-panel.tsx` · `src/app/(dashboard)/incapacidades/radicacion/page.tsx`
(bandeja de cobro) · `src/lib/ausentismo/matriz.ts` (umbral por entidad en el informe de cobro de la matriz).
**Pruebas:** `npm run test:incapacidades` (40 pruebas).

## Cómo aplicar la migración

1. Con la migración de la fase 2 ya aplicada, pegar entera esta en el SQL Editor. Idempotente.
2. Comprobación al final: existe `incapacidad_radicaciones`; la vista tiene `radicacion_id`, `cobrada` y
   `devoluciones`; los índices `ux_incapacidad_radicaciones_codigo` y `ux_incapacidad_radicaciones_activa`.

## Qué hace

| Operación | Quién | Qué exige | Qué produce |
|---|---|---|---|
| **Solicitar o radicar** | RRHH | Expediente `liquidado` (o `radicado` tras una devolución), liquidación vigente con valor, entidad homologada, ninguna radicación activa. Bajo el umbral de días de la entidad, excepción escrita de ≥ 10 caracteres | Fila en `incapacidad_radicaciones`: `solicitada` sin código, `radicada` con código y fecha. Con `radicada` el expediente pasa a `radicado` |
| **Marcar radicada** | RRHH | Radicación `solicitada`, código y fecha ≥ solicitud | `radicada`; expediente `radicado` |
| **Marcar devuelta** | RRHH | Radicación activa, motivo ≥ 5 | `devuelta`; expediente vuelve a `liquidado`; se puede radicar otra |
| **Anular** | RRHH | Cualquier estado salvo anulada, motivo ≥ 5 | `anulada` con quién y cuándo; la evidencia se conserva; si era la activa, el expediente vuelve a `liquidado` |

«Cobrada» ya no se captura: es **derivada** de que exista una radicación en estado radicada
(`vw_incapacidad_expedientes.cobrada`), como fija la sección 16 del plan.

## Reglas que fija

- **Código único por entidad** entre radicaciones no anuladas (índice parcial). Un código repetido devuelve
  «Ya existe una radicación con el código X ante esta entidad».
- **Una radicación activa por expediente** a la vez (índice parcial). Decisión 12.10 sigue abierta: esta es la
  cardinalidad asumida; una devolución permite radicar de nuevo y todo queda en el historial.
- **Umbral por entidad** (12.17): `cobrable` sale de `dias_min_cobro` de la entidad homologada (o 4/1 por clase
  si no está). Por debajo se puede radicar solo con excepción; la radicación queda marcada `bajo_umbral`.
- **Cambios en el expediente después de radicar**: en estado `radicado` el panel de la etapa 2 no admite cambios
  (12.12); la radicación conserva el `valor_reclamado` y la `liquidacion_id` con que se radicó.
- **Concurrencia**: los formularios llevan la `version` del expediente; el cambio de estado del expediente se
  rechaza si otra persona lo tocó.
- **Auditoría**: `radicacion_registrada`, `radicacion_radicada`, `radicacion_devuelta`, `radicacion_anulada` en
  Tesorería › Auditoría (módulo `incapacidades`) y en `ausentismo_log`.

## Bandeja de cobro (`/incapacidades/radicacion`)

Seis pestañas con conteo, cada expediente en una sola: **Por radicar** (liquidadas, cobrables, sin activa),
**Solicitadas**, **Radicadas**, **Devueltas**, **Con incidencias** (sin liquidar, sin homologar, sin persona,
cambios en la matriz, excepción) y **No cobrables por umbral**. Agrupa por entidad homologada (o por el pagador
recibido si no lo está) con incapacidades, días, días a cargo y valor reclamado; de mayor a menor valor.

## El informe de cobro de la matriz lee el umbral del catálogo

`getMatriz` con segmento de cobro y **sin** «Días mínimos» escrito: prefiltra en SQL por el menor umbral del
segmento y refina en memoria por el `dias_min_cobro` del pagador de cada fila (`getUmbralesCobro`,
`umbralDeFila`). Con «Días mínimos» escrito, ese valor manda para todas, como antes. Mientras las semillas sean
4 (EPS) y 1 (ARL), **los totales del informe no cambian**. Si la columna aún no existe (migración sin aplicar),
cae al umbral del segmento y avisa en el log del servidor. Las notas del informe y la barra de cobro dicen ahora
«umbral de cada entidad (por defecto N)».

## Verificación de salida de la fase (plan, 11)

| Criterio | Cómo se verificó |
|---|---|
| Duplicado de código rechazado | Índice parcial `ux_incapacidad_radicaciones_codigo` + mensaje traducido en `radicacion.ts`; comprobar en la base radicando dos expedientes con el mismo código ante la misma entidad |
| Anulación conserva evidencia | `anular` hace UPDATE a `anulada` con quién, cuándo y motivo; nunca DELETE. El historial del panel la muestra |
| El informe de cobro sigue dando los mismos totales | Semillas 4/1 = constantes anteriores; el filtro en memoria coincide con el `gte` previo. Comprobar en la matriz con el segmento EPS antes y después de aplicar la migración |
| tsc, eslint, 40 pruebas | limpios |
| UX | vista previa temporal bajo `/docs` + Playwright a 1440/800: bandeja con pestañas y grupos, panel sin activa, bajo umbral con excepción, radicada con historial; borrada antes del commit |

## Comprobación manual tras aplicar las dos migraciones

1. Expediente liquidado y cobrable: «Registrar» con fecha de solicitud y sin código → queda Solicitada; el
   expediente sigue `liquidado`; la bandeja lo muestra en Solicitadas.
2. «La entidad devolvió el código» con código y fecha → Radicada; expediente `radicado`; el panel de la etapa 2 deja de
   admitir cambios; la ficha dice «Cobrada: Sí · código».
3. Otro expediente de la misma entidad con el mismo código → rechazado.
4. Expediente de 2 días con EPS de umbral 4: el panel avisa «Por debajo del umbral» y no deja registrar sin
   excepción de 10 caracteres; con ella, la radicación queda marcada bajo umbral.
5. «Marcar devuelta» con motivo → Devuelta; expediente `liquidado`; pestaña Devueltas; se puede radicar otra.
6. «Anular» → Anulada; sigue en el historial con motivo.
7. Matriz EPS › segmento Cobro EPS sin «Días mínimos»: mismos totales que antes.

## Lo que la fase 4 no hace

Recaudos, aplicaciones y conciliación (fase 5); soportes adjuntos; exportación de la bandeja de cobro (fase 6).
