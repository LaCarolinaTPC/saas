# Financiera · Gestión de flota — Fase 2: modelo de datos y motor

**Plan:** `docs/Plan_desarrollo_financiera_GESTIVO.md`, sección 9, fase 2 (y la parte SQL de la fase 3).
**Migración:** `supabase/migrations/20260921140156_modulo_financiera_consolidado_mensual_y_cargas.sql`
**Motor:** `src/lib/financiera/motor.ts` · pruebas `npm run test:financiera` (23 casos).
**Permisos:** módulo `financiera` y sub-funciones `fin_*` en `src/lib/permissions-shared.ts`.
**Pantallas:** ninguna todavía (fase 5). Entrar a `/financiera` da 404 hasta entonces.

## Cómo aplicar la migración

1. Abrir el SQL Editor del Studio autoalojado y pegar el archivo **entero**. Es idempotente: se puede
   volver a correr sin duplicar nada. Cada función lleva su propia etiqueta de dollar quoting
   (`$fin_consolidar$`, `$fin_cerrar$`…) para que un error señale el bloque exacto; si el editor se
   queja de una línea que en el archivo ya está bien, está corriendo el texto guardado de la pestaña,
   no el archivo (ver `docs/…` de incapacidades, mismo síntoma).
2. Al final imprime cuatro consultas de comprobación. Lo esperado:

   | Consulta | Esperado |
   |---|---|
   | tablas y vistas | 6 `BASE TABLE` (`financiera_cargas`, `_contable_mes`, `_operativo_mes`, `_parametros`, `_periodos`, `_periodos_versiones`) y 2 `VIEW` (`vw_financiera_consolidado`, `vw_financiera_flota_mes`) |
   | funciones | `financiera_cerrar_periodos_por_gema`, `_consolidar_abiertos`, `_consolidar_periodo`, `_reabrir_periodo`, `_tomar_version`, `_touch` |
   | parámetros | rentabilidad 15 / 5 (mayor es mejor) · gasto_timbrada 2500 / 3200 (menor es mejor) · productividad 90 / 80 |
   | `user_types` | `admin` con `tiene_financiera = true`; los demás `false` |

3. Las tablas de hechos quedan **vacías**. La primera consolidación se puede disparar ya mismo, en el
   mismo editor:

   ```sql
   SELECT financiera_consolidar_abiertos('sql-editor');
   ```

   Recorre los 21 meses del espejo (2025-01 → 2026-09), llena `financiera_operativo_mes` y cierra
   todos los meses cuyo último día ya pasó el marcador de GEMA (`gema_sync_state.last_synced_date`
   del dataset `ingreso_tercero`, hoy 2026-09-16): al 2026-09-21 deben quedar **20 cerrados y
   septiembre abierto**. Devuelve un JSON con vehículos, filas, ingresos y gastos GEMA por mes.

4. Cotejo contra el espejo, desde la máquina de trabajo:

   ```bash
   npx tsx --tsconfig tsconfig.json work/fin-cotejar-consolidado.mts 2026-03
   ```

   Consolida el mes en TypeScript con el mismo motor y compara vehículo a vehículo con la vista. Para
   marzo 2026 los totales deben ser los de la referencia del plan (sección 10): bruto 2.878.276.257,
   timbradas 875.411, viajes 11.060, admon 71.956.905, 137 vehículos. Antes de aplicar la migración
   el script imprime igual los totales del espejo y avisa que la vista no existe.

5. `anon` y `authenticated` no leen ninguna tabla ni vista nueva: RLS habilitada sin políticas y
   `REVOKE` explícito. Las funciones solo las ejecuta `service_role`.

## Qué crea

| Objeto | Para qué |
|---|---|
| `financiera_periodos` | Estado de cada mes: `abierto`, `cerrado` o `reabierto`. El cierre lo pone GEMA, no un usuario (acta 2026-09-18, punto 13). |
| `financiera_operativo_mes` | Producción y los 9 rubros de GEMA por **período + vehículo + propietario**. `ingresos = SUM(bruto)`, `admon = SUM(admon)` (2,5 %, **nunca** `cartu_admon`), `timbradas` (no `timbradas_cu`). `fet`, `valor_camb`, `incentivo_c`, `valor_descuentos` se guardan como información y no entran en la utilidad. |
| `financiera_contable_mes` | Los 6 rubros del archivo por **período + vehículo**: `despacho`, `intereses`, `otros_gastos`, `repuestos`, `mano_de_obra`, `desc_fondo_conductor` (se resta de repuestos). `celdas_vacias` cuenta los vacíos tomados como 0. La llena la fase 4. |
| `financiera_cargas` | Bitácora: `consolidar_gema`, `cerrar_periodo`, `reabrir_periodo`, `cargar_contable`, `reversar_contable`, `cambiar_parametro`, con totales en `detalle`. |
| `financiera_parametros` | Umbrales de semáforo, semilla de `fleetUtils.ts`. Un `CHECK` impide umbrales que contradigan la dirección. |
| `financiera_periodos_versiones` | Copia completa (resumen + filas) tomada antes de reabrir un período. |
| `vw_financiera_consolidado` | Vehículo-mes: suma los dueños del bus, une la contable y calcula `gastos_operativos_totales`, `utilidad_neta`, `rentabilidad`, `gastos_por_timbrada` y la vista operativa (sin intereses). `origen_contable = 'sin_dato'` marca la fila incompleta. |
| `vw_financiera_flota_mes` | Totales de flota por mes con KPIs **ponderados** y `productividad = viajes / vehículos`. |
| `financiera_consolidar_periodo(periodo, forzar, email)` | Agrega `ingreso_tercero` a mes; upsert por la llave; borra las filas GEMA que ya no están en el espejo; respeta cerrados salvo `forzar`. Idempotente. |
| `financiera_cerrar_periodos_por_gema()` | Cierra abiertos y reabiertos cuyo último día ≤ marcador del sync. |
| `financiera_consolidar_abiertos(email)` | La corrida diaria (04:00) y el botón «Consolidar ahora»: consolida todo lo no cerrado y luego cierra. |
| `financiera_reabrir_periodo(periodo, email, motivo)` | Solo administrador; motivo obligatorio; toma versión antes. El período se recalcula en la siguiente corrida y GEMA lo cierra otra vez. |

## Qué fija del acta y por qué importa

- **`ADMON` es `admon`, no `cartu_admon`.** Difieren ~426 M al mes (72 M vs 498 M en marzo 2026). El
  SQL no lee `cartu_admon` en ningún punto; el motor no tiene ese campo.
- **`liquido` no se usa.** No es reproducible (plan 3.6.4).
- **Los retirados entran.** La consolidación nunca filtra por `vehiculos.estado`; la vista expone
  `vehiculo_activo` como filtro opcional de pantalla.
- **Dos dueños en el mes → dos filas operativas, una contable.** Los indicadores se calculan al nivel
  del vehículo-mes; el costo contable no se prorratea.
- **Cierre automático.** Un mes se congela cuando el marcador del sync pasa su último día. Es lo que
  da estabilidad a lo reportado aunque la re-sincronización de 45 días mueva el espejo. Si en la
  fase 7 el cotejo muestra que los últimos días del mes cambian después del cierre, la palanca es
  un margen de días sobre el marcador en `financiera_cerrar_periodos_por_gema`.

## Motor (`src/lib/financiera/motor.ts`)

Funciones puras: `indicadores()`, `kpisFlota()` (ponderado), `nivelSemaforo()` y `gruposSemaforo()`
(mismas comparaciones inclusivas del aplicativo), `consolidarDias()` (transcripción de la función
SQL, para cotejar), `debeCerrarse()`, redondeo y tolerancias del cotejo (±1 COP, ±0,01 puntos).

Las pruebas usan como oráculo la transcripción literal de `parseExcelToFleetRecords` y de las
utilidades de vista de `fleetUtils.ts`: 200 filas generadas de forma determinista más los bordes de
la sección 12 del plan (ingresos 0, timbradas 0, descuento mayor que repuestos, flota vacía).

## Lo que queda de las fases 0 y 1 (no bloquea esta)

- **`DESPACHO`** (3.5.1): correr `work/gema-columnas-ingreso-tercero.mts` con las credenciales de GEMA
  (`.env.local`). Si GEMA lo devuelve, se añade al espejo y el archivo contable baja a 5 rubros: en
  esta migración eso es quitar una columna de `financiera_contable_mes` y una constante del motor.
- **Subconteo por llave repetida** (fase 1): también necesita GEMA, porque el descarte ocurre sobre
  el resultado crudo del procedimiento antes del upsert.
- **Cotejo de un mes del Excel** del aplicativo contra `vw_financiera_consolidado` (fase 0, punto 2).
