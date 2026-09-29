# Recuperación de incapacidades — requisito de 4 semanas cotizadas (solo EPS)

**Solicitud:** RRHH, 2026-09-29. Decisiones confirmadas por el usuario el mismo día.
**Migración:** `supabase/migrations/20260929221301_incapacidades_requisito_de_cuatro_semanas_cotizadas_para_cobrar_a_la_eps.sql`
**Código:** `src/lib/incapacidades/semanas-reglas.ts` (puro) · `semanas.ts` (acreditación) · `radicacion-reglas.ts`
(impedimento y pestañas) · `[id]/semanas-panel.tsx` · bandeja, bandeja de cobro y tablero.

## La regla

La EPS reconoce la incapacidad de origen común solo si el trabajador cotizó **4 semanas ininterrumpidas y completas
antes de su inicio** (Decreto 780 de 2016, art. 2.2.3.2.1, modificado por el Decreto 1427 de 2022). Sin ese requisito
la EPS no paga y el costo lo asume la empresa: radicarla solo crea una cartera que no se recupera. El expediente
entra al módulo igual (para llevar el control), pero **no se habilita para cobro**.

| Paga | Requisito |
|---|---|
| **ARL** (origen AT o EL) | **No aplica** (`no_aplica`). No se le mira la antigüedad; su cobro sigue igual. |
| **EPS** (origen común, 3 días o más) | Días entre la vinculación y el inicio ≥ `semanas_min_cotizacion_eps` × 7 (4 × 7 = 28). |

Resultado (`vw_incapacidad_expedientes.requisito_semanas`): `no_aplica` · `cumple` · `acreditado` · `no_cumple` ·
`sin_dato`. Los dos últimos bloquean el cobro.

## De dónde sale la fecha

Gestivo no tiene semanas cotizadas; se **presume** con la fecha de vinculación del maestro con el que el expediente
resolvió a la persona (`persona_fuente`):

- `conductores`: la más reciente entre `fecha_ingreso` y `fecha_reingreso` que no pase del inicio (un reingreso
  interrumpe la cotización). Si el conductor no tiene fechas, la de `employees`.
- `employees`: `hire_date` (caso del 72179171, que no está en conductores).
- `sin_resolver`: sin dato → bloquea.

**Prórroga:** cuenta el inicio de la incapacidad **inicial** de la cadena (previa del mismo empleado que termina el
día anterior, `incapacidad_inicio_cadena`).

## Acreditación de RRHH

Si la persona venía cotizando con otro empleador sin interrupción, la EPS sí paga. RRHH carga el certificado de semanas
de la EPS en Soportes y en el bloque «Semanas cotizadas antes del inicio» del expediente lo elige y escribe el motivo
(mínimo 10 caracteres). Queda `acreditado` mientras ese soporte no se anule; si se anula, vuelve a bloquear. Se puede
retirar con motivo. Todo queda en la bitácora (`semanas_acreditadas`, `semanas_acreditacion_retirada`) y en la
auditoría del módulo.

## Qué cambia en pantalla

- **Radicar / marcar radicada:** impedimento «La EPS no paga esta incapacidad…». La excepción escrita de 12.17 no lo
  salta: `bajoUmbral` mira solo `cumple_umbral`, y `cobrable` pasa a ser umbral **y** semanas.
- **Bandeja:** KPI «EPS sin 4 semanas» con el valor liquidado que la EPS no paga; etiqueta en la fila; filtro «EPS sin
  4 semanas cotizadas»; columna «Semanas EPS» en el exportable.
- **Bandeja de cobro:** sin radicar → «No cobrables» con el motivo; **ya radicada o solicitada → «Con incidencias»**
  («anular o acreditar»). Nada se anula solo.
- **Tablero:** tarjeta «EPS sin 4 semanas» y dos columnas en el exportable. Lo que la EPS no paga deja de sumar en
  «Reclamado» y «sin radicar» (salvo que ya esté radicado).

## Aplicar y comprobar

1. Correr la migración entera en el SQL Editor.
2. Comprobación (a): las siete filas con `ok = true` (27 días no cumple; 28 y 29 cumplen; ARL siempre `no_aplica`).
3. Comprobación (b), medido el 2026-09-29: 12 vigentes → **2 `no_cumple`** (78746062 SALUD TOTAL, 11 días, recibido;
   1007349264 EPS SURA, 17 días, **ya radicado**), 6 `cumple`, 4 `no_aplica`, 0 `sin_dato`.
4. `npx tsx work/verificar-semanas-cotizadas.mts` (solo lectura) reproduce la regla en JS y, con la migración
   aplicada, la coteja fila por fila con la vista.
5. Regenerar el diccionario: `npm run diccionario:generar`.

Sin la migración la app sigue funcionando como antes: la columna no llega y no se bloquea nada.

## Pendiente de RRHH

- **1007349264 (EPS SURA):** ya radicado sin el requisito. Decidir si se anula la radicación o se acredita con el
  certificado de la EPS.
