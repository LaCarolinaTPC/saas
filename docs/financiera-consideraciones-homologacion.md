# Financiera · Gestión de flota — Consideraciones abiertas tras la homologación

Lista de las definiciones que **todavía faltan** para especificar bien la migración del
aplicativo `lacarolinagestionflota` (Lovable) al módulo **Financiera**, opción **Gestión de
flota**, de Gestivo, y ponerlo en marcha sin sorpresas.

Cada punto sale de comparar el modelo del Excel que carga el aplicativo con el espejo
`ingreso_tercero` que Gestivo sincroniza de GEMA. Es un extracto autónomo de la sección 14
del plan completo: `docs/Plan_desarrollo_financiera_GESTIVO.md`.

Fecha: 2026-09-18. Cifras verificadas sobre los datos reales de `ingreso_tercero` (21 meses,
2025-01 a 2026-09) y una muestra del 2026-03-12.

---

## A. Qué modelo financiero reproduce el módulo

| # | Consideración | Evidencia | Quién decide |
|---|---|---|---|
| 1 | ~~`TIM.` puede ser `timbradas` o `timbradas_cu`~~ | Marzo 2026: `timbradas` 875.411 vs `timbradas_cu` 821.569,45 — 6 % de diferencia. | **RESUELTO 2026-09-18: `timbradas`.** `timbradas_cu` no entra en el módulo. El cotejo de un mes solo lo confirma. |
| 2 | ~~GEMA descuenta cosas que el Excel ignora~~ (`fet`, `valor_camb`, `incentivo_c`, `descuento`, `factor_calidad`, `anticipo`, `factura`, `valor_descuentos`). | Marzo 2026: `fet` 175.082.221 (6 % del bruto), `valor_camb` 17.464.449, `incentivo_c` 8.862.000. | **RESUELTO 2026-09-18: el modelo arranca de `bruto` = Ingresos y la utilidad resta solo las 15 partidas del Excel.** Las demás deducciones de GEMA **no entran** en la utilidad; se muestran como conceptos informativos con su monto por mes, sin afectar ningún indicador. |
| 3 | ~~`SITRA` siempre en 0~~ | 0 en los 21 meses. | **RESUELTO 2026-09-18: se homologa a `sitra` de GEMA.** El concepto ya no se cobra; la columna se conserva por paridad con el Excel. |
| 4 | ~~Redondeo y tolerancia de cotejo~~ | Muestra del 2026-03-12: `admon` 20.827,7; `rtica` 5.831,8. | **RESUELTO 2026-09-18.** Guardar con 2 decimales; **mostrar y exportar en pesos enteros**, rentabilidad con 2 decimales; cotejo con **±1 COP por partida y vehículo-mes**, ±0,01 puntos en rentabilidad. |

## B. Reglas de consolidación día → mes

| # | Consideración | Evidencia | Quién decide |
|---|---|---|---|
| 5 | ~~Atributos que cambian dentro del mes~~ | Marzo 2026: ningún vehículo cambió de placa, dueño ni tipo dentro del mes. | **RESUELTO 2026-09-18: el propietario se conserva tal como venía en el movimiento**, para guardar la integridad del dato. Un bus con dos dueños en el mes tiene **dos filas** en el consolidado, cada una con la producción de sus días. Llave: `(periodo, codigo_vehiculo, cedula_propietario)`. `tipo_propietario` sigue al dueño; `placa` la del último día, con marca si cambió. |
| 5-bis | ~~Reparto de los rubros contables cuando hay dos dueños en el mes~~ | Caso raro (0 en marzo 2026). | **RESUELTO 2026-09-18: no hay nada que repartir.** Los rubros contables **son del vehículo, no del dueño**: van en una tabla aparte por vehículo-mes y no se tocan por que la operativa tenga dos propietarios. Los indicadores se calculan al nivel del vehículo-mes. |
| 6 | **Universo de vehículos.** | 0 filas con `codigo_vehiculo = ''` en los 21 meses. `vehiculos`: 202 filas, 151 con `estado = 1`. | **RESUELTO en parte 2026-09-18: los retirados entran**; la consolidación nunca filtra por `estado`; «solo activos» es filtro opcional en pantalla. Códigos normalizados sin ceros a la izquierda. Queda 6-bis. |
| 6-bis | ~~Vehículo del archivo contable que no existe~~ | — | **RESUELTO 2026-09-18: el valor real es el que muestra `ingreso_tercero`.** El archivo contable se valida contra la operativa del mismo período, no contra el maestro. Bus sin movimiento ese mes → fila rechazada y reportada; el resto del archivo entra. |
| 7 | ~~Cuándo un mes es cerrable~~ | GEMA cierra con atraso y el sync re-sincroniza 45 días. | **RESUELTO 2026-09-18: el cierre lo marca la fecha de cierre de GEMA.** Un mes se cierra **automáticamente** cuando el marcador del sync pasó su último día; ahí se congela y el acumulado al corte parte de esa fecha. Sin botón ni rol de cierre. Reabre solo el administrador, con motivo y copia de las cifras anteriores. |
| 8 | ~~Orden y forma del cron~~ | El sync corre a las 03:00. El ingreso de tercero es el **cierre del día** de GEMA: llega diario. | **RESUELTO 2026-09-18: consolidación diaria a las 04:00**, solo meses abiertos, más «Consolidar ahora». Función SQL `financiera_consolidar_periodo`, no bucle en TypeScript. Financiera nunca muestra el día en curso. |

## C. Histórico y paridad con el aplicativo actual

| # | Consideración | Evidencia | Quién decide |
|---|---|---|---|
| 9 | ~~Meses anteriores a 2025-01~~ | — | **RESUELTO 2026-09-18: el aplicativo arranca en 2025**, igual que el espejo. Todo el histórico operativo ya está en `ingreso_tercero`; del aplicativo solo se traen los 6 rubros contables por vehículo-mes. Sin importador de 26 columnas. |
| 10 | ~~Propietarios por nombre vs por cédula~~ | — | **Se disuelve con el 9.** El propietario siempre llega de GEMA con cédula; no hay nombres libres que conciliar. El filtro muestra `cedula — nombre` desde el espejo. |
| 11 | **Umbrales de semáforo.** Extraídos de `fleetUtils.ts`: Rentabilidad 🟢 ≥ 15 % · 🟡 5–14,9 % · 🔴 < 5 %. Gasto/timbrada 🟢 ≤ 2.500 · 🟡 2.501–3.200 · 🔴 > 3.200. Productividad 🟢 ≥ 90 · 🟡 80–89 · 🔴 < 80 viajes por vehículo-mes. | **Reevaluados con datos reales (20 meses + julio 2026 por vehículo).** Productividad: **inalcanzable** — flota en 77 viajes/bus-mes, 0 de 20 meses en 🟢, 55 % de los buses en 🔴. Gasto/timbrada y rentabilidad: solo GEMA ya consume el 56 % del ingreso por timbrada; los 6 rubros contables deben caber en 764 COP/tim para 🟢. Pasaje +10 % en 2026. | **POR CONFIRMAR** el nuevo umbral de productividad (85/70 → 29/41/30 %; 80/65 → 45/31/24 %). **Medido de nuevo el 2026-09-21 sobre los 3.053 vehículo-mes de los 21 meses consolidados (`npm run financiera:umbrales`), base más ancha que la de julio 2026: vigente 90/80 → 14/38/48 %; 85/70 → 33/43/24 %; 80/65 → 52/30/18 %; **propuesta 85/76 (P70/P35) → 33/32/35 %**. Ver `docs/financiera-fase-7.md`.** Gasto/timbrada y rentabilidad se conservan para la paridad y se recalibran en la Fase 7 con el histórico contable. Detalle en la sección 6.3.1 del plan. |
| 18 | **Tres vistas de rentabilidad.** El aplicativo permite ver Operativa (sin intereses), Después de financiero (con intereses) o Ambas. `intereses` es el único rubro tratado como financiero. | `fleetUtils.ts` (`RentabilidadView`, `costosPorVista`) y `RentabilidadViewSelector.tsx`. No estaba en `FUNCIONALIDADES.md`. | **POR CONFIRMAR** si el módulo conserva las tres vistas (recomendado, por paridad). |
| 12 | **Corrida en paralelo con criterio de aceptación.** Sin esto el apagado es un salto de fe. | — | Negocio. Propuesta: **3 meses cerrados** comparados vehículo a vehículo con la tolerancia del punto 4; se acepta si el 100 % de los vehículos-mes cuadra en utilidad neta y los KPIs de flota coinciden a 2 decimales. Las diferencias se documentan con causa antes de aceptar. |

## D. Puesta en marcha y apagado

| # | Consideración | Evidencia | Quién decide |
|---|---|---|---|
| 13 | **Mapa de usuarios.** El aplicativo tiene 8 cuentas con roles propios; hay que decidir a qué tipo de usuario de Gestivo va cada una y crear los tipos que falten. | `FUNCIONALIDADES.md` §2.4: 2 administradores, 3 editores, 3 visualizadores (una inactiva). Varias cuentas (contabilidad, subgerencia financiera, tesorería) quizá no existen hoy en Gestivo. | Administrador de Gestivo. Equivalencia: Visualizador → `fin_tablero` + `fin_analisis`; Editor → + `fin_datos`; Administrador → todas. |
| 14 | **Consumidores de `fleet-api`.** Si alguien externo la usa, debe migrar a `/api/external/v1/financiera` antes del apagado. | Verificable en `external_api_keys.request_count` y `last_used_at` del aplicativo. | Administrador del aplicativo: exportar esa tabla en la Fase 0. |
| 15 | **Apagado ordenado.** Hay dos despliegues (Lovable y el espejo en Vercel) y una URL en uso. | `FUNCIONALIDADES.md` §1.1 y §13. | Al aceptar la paralela: (a) exportación completa de `fleet_records` y `data_upload_audit` como respaldo en `exports/`; (b) el aplicativo pasa a solo lectura; (c) redirección o aviso en su URL; (d) baja del proyecto en Vercel y en Lovable. **Nunca antes de la aceptación del punto 12.** |
| 16 | **Corrección de la documentación de `ingreso_tercero`.** El histórico real arranca en 2025-01 (no 2026-01); `total_cartulina` excluye la póliza; `admon` es el 2,5 % del bruto y `rtica` el 0,7 %. | Verificado el 2026-09-18. | Ya está en la Fase 6 del plan; aquí solo para que no se olvide en el cierre. |
| 17 | **Jerarquía de nombres.** Módulo **Financiera**, opción **Gestión de flota**. Deja espacio a otras opciones financieras sin renombrar nada. | Definido por el usuario el 2026-09-18. | Aplicado: rutas `/financiera/flota/…`; sub-funciones `fin_*` sin cambio. |

---

## E. Qué bloquea qué

| Bloquea… | Puntos |
|---|---|
| **Fase 2 — modelo de datos y motor** | Solo la verificación de `DESPACHO` (sección 3.5.1 del plan). Los puntos 1 a 5-bis quedaron resueltos el 2026-09-18 |
| **Fase 3 — consolidación** | Ninguno: 6, 6-bis, 7 y 8 resueltos el 2026-09-18 |
| **Fase 5 — pantallas** | 18 (vistas de rentabilidad) |
| **Fase 7 — histórico y corte** | 12 (9, 10 y 11 resueltos el 2026-09-18; el 11 solo espera confirmación de valores) |
| **Apagado del aplicativo** | 12, 13, 14, 15 |
| **Nada** | 3, 16, 17 |

Los puntos que bloquean la Fase 2 **se resuelven todos con el mismo cotejo de un mes más una
conversación con contabilidad**. Eso convierte a la **Fase 0 en el cuello de botella real del
proyecto**, y consiste en dos cosas concretas:

1. **Un volcado de un mes de `fleet_records`** — con una llave activa de `fleet-api` (la
   Edge Function ya existe, es de solo lectura y filtra por período) o exportado a mano
   desde el aplicativo. Con él se confirman `Ingresos` = `bruto`, `ADMON` = `admon`, se
   decide `TIM.` y se resuelve `SITRA`.
2. **Correr `work/gema-columnas-ingreso-tercero.mts` con las credenciales de GEMA**
   (`.env.local`; en `.env` están vacías). Dice si GEMA devuelve el `DESPACHO` y el espejo lo
   está descartando. Si aparece, el archivo contable baja de 6 rubros a 5.

```bash
npx tsx --tsconfig tsconfig.json work/gema-columnas-ingreso-tercero.mts 2026-03-12
```
