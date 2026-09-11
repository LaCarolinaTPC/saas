# Recuperación de incapacidades — Fase 5: recaudos, aplicaciones, ajustes y conciliación

**Plan:** `docs/Plan_desarrollo_incapacidades_GESTIVO.md`, sección 11, fase 5, y decisiones 12.5 y 12.6.
**Migración:** `supabase/migrations/20260911211305_incapacidades_recaudos_aplicaciones_ajustes_y_conciliacion.sql`
(requiere `20260911201033_…` y `20260911205408_…`; las tres siguen **pendientes de aplicar**, en ese orden).
**Código:** `src/lib/incapacidades/recaudo-reglas.ts` (puro) · `recaudos.ts` (servidor) ·
`src/app/(dashboard)/incapacidades/{recaudos,conciliacion}/` · `[id]/saldo-panel.tsx` · tolerancia en `parametros/`.
**Pruebas:** `npm run test:incapacidades` (46 pruebas).

## Cómo aplicar la migración

Con las dos anteriores aplicadas, pegar entera esta en el SQL Editor. Comprobación al final: existen
`incapacidad_recaudos`, `incapacidad_recaudo_aplicaciones` e `incapacidad_ajustes`; la vista tiene
`abonos_aplicados`, `ajustes_saldo`, `saldo_operativo` y `cerrado_at`; `incapacidad_parametros` tiene
`tolerancia_conciliacion = 0`.

## Vocabulario (plan, sección 16)

| Concepto | Legado Excel | GESTIVO |
|---|---|---|
| Pago | `S = SI` si `X > 1` | Un **recaudo** (giro real de la entidad) **aplicado** a un expediente |
| Pendiente | `V = Q` si `S = NO`, sin restar lo pagado | **Saldo operativo** = reclamado − abonos aplicados − ajustes que extinguen |
| Conciliación | `Y` contra lo cobrado, sin tolerancia | Estado derivado con **tolerancia** aprobada (parámetro) |

## Decisiones asumidas mientras 12.5 y 12.6 siguen por confirmar

- **Base exigible** = `valor_reclamado` del expediente. La vista y las pantallas muestran siempre los tres
  componentes por separado, así cambiar la base después no obliga a rehacer nada.
- **Tolerancia** = parámetro `tolerancia_conciliacion`, semilla **0** (exacto, como el libro). La cambia el
  administrador en Parámetros y queda auditada.
- **Tipos de ajuste**: glosa aceptada, descuento de la entidad, diferencia de redondeo, corrección, nota
  informativa. El **signo** lo da el valor (positivo reduce el saldo; negativo lo aumenta); si **extingue
  saldo** lo dice la fila (la nota informativa no). No se editan: se anulan con motivo y se registra otro.
- **Autorización**: todo lo opera `rrhh` (decisión 12.9). Cerrar con saldo fuera de la tolerancia exige una
  **excepción escrita** de ≥ 10 caracteres y el expediente queda marcado `cierre_por_excepcion`.

## Qué hace

| Operación | Dónde | Qué exige | Qué produce |
|---|---|---|---|
| **Registrar giro** | `/incapacidades/recaudos` | Entidad, fecha, valor > 0. Referencia única por entidad | Fila en `incapacidad_recaudos`; queda **sin aplicar** hasta repartirlo |
| **Aplicar a un expediente** | misma pantalla, giro seleccionado | Expediente `radicado`/`con_recaudo` con radicación **radicada** ante la **misma entidad**; valor ≤ lo que queda del giro (trigger en la base) | Fila en `incapacidad_recaudo_aplicaciones`; el expediente pasa a `con_recaudo` o `conciliado` según el saldo |
| **Anular aplicación / giro** | expediente o recaudos | Motivo ≥ 5; un giro solo se anula sin aplicaciones vigentes | Anulación con rastro; el estado del expediente se recalcula |
| **Ajuste monetario** | panel del expediente | Expediente radicado o posterior; tipo, valor ≠ 0, motivo | Fila en `incapacidad_ajustes`; recalcula estado |
| **Cerrar** | panel del expediente | Saldo dentro de la tolerancia, o excepción ≥ 10 | `cerrado` con quién, cuándo, motivo y si fue por excepción |
| **Reabrir** | panel del expediente | Motivo ≥ 5 | Vuelve a `radicado` y se recalcula |
| **Conciliación** | `/incapacidades/conciliacion` | — | Vistas: sin recaudo, abono parcial, diferencia por ajustes, sobrepago, conciliados sin cerrar, cerrados; totales por entidad |

**Un abono parcial nunca cierra**: `X = T − 0,01` sigue «Abono parcial» con tolerancia 0 (prueba de 13.2).
El **sobrepago** (la entidad giró más) se permite al aplicar y queda visible en violeta, no se bloquea.

## Verificación de salida de la fase (plan, 11)

| Criterio | Cómo se verificó |
|---|---|
| Abono parcial **no** cierra | Pruebas `un abono parcial no cierra…` y `validarCierre` exige excepción |
| Σ aplicaciones ≤ recaudo | Prueba `validarAplicacion` + trigger `incapacidad_aplicacion_no_excede` con `FOR UPDATE` para dos personas a la vez |
| Sobrepago visible | Estado `sobrepago` en `calcularSaldo`; chip violeta en panel y conciliación |
| tsc, eslint, 46 pruebas | limpios |
| UX | vista previa temporal bajo `/docs` + Playwright a 1440/800: panel sin recaudo, con abono parcial y glosa, cerrado; borrada antes del commit |

## Comprobación manual tras aplicar las tres migraciones

1. Recaudos: registrar un giro de EPS SURA por 300.000 con referencia TRF-1. Registrar otro con la misma
   referencia → rechazado.
2. Seleccionarlo y aplicar 200.000 a un expediente radicado ante EPS SURA con reclamado 237.250 → el expediente
   pasa a `con_recaudo`, saldo 37.250, «Abono parcial»; el giro muestra 100.000 sin aplicar.
3. Intentar aplicar 150.000 más → rechazado por la base («supera lo que queda del recaudo»).
4. Ajuste «glosa aceptada» por 37.250 con motivo → saldo 0, estado `conciliado`. Cerrar sin motivo → cerrado, no
   por excepción.
5. En otro expediente con saldo, «Cerrar» sin excepción → rechazado; con excepción de 10 caracteres → cerrado
   por excepción, visible en Conciliación › Cerrados.
6. Parámetros: tolerancia 100 → un expediente con saldo 50 pasa a «Conciliado».

## Lo que la fase 5 no hace

Soportes adjuntos, exportaciones de recaudos y conciliación, tablero y submódulo de consulta (fase 6);
endurecimiento y rendimiento (fase 7).
