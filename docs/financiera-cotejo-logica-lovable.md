# Financiera · Cotejo de la lógica de Lovable contra Gestivo (2026-09-23)

Revisión de toda la lógica de cálculo del aplicativo `lacarolinagestionflota`, en su **último
commit (`ee12314`)**, contra el módulo Financiera › Gestión Resultado Flota. El plan se había
escrito sobre `94c75e5`; desde entonces entraron 45 commits, y los que tocan lógica son
`fleetMetrics.ts` (las fórmulas de `fleetUtils.ts` movidas a un módulo puro, sin cambio), la API
externa y un servidor MCP nuevo. Ninguno cambia una fórmula.

## 1. Veredicto sobre el núcleo: se aplica bien

**Fórmulas idénticas.** `motor.ts` y la vista `vw_financiera_consolidado` reproducen literalmente
`excelParser.ts` y `fleetMetrics.ts`:

- gastos operativos = las 14 partidas, con repuestos netos (repuestos − desc. fondo-conductor);
- utilidad, rentabilidad (0 si no hay ingresos) y gasto por timbrada (0 si no hay timbradas);
- las tres vistas (operativa sin intereses, después de financiero, ambas con la operativa como
  principal) y la vista por defecto, después de financiero;
- los KPIs de flota ponderados (Σ utilidad / Σ ingresos);
- el semáforo inclusivo con los mismos cortes (15/5, 2.500/3.200, 90/80) y los grupos con promedio
  simple y brecha contra el umbral de excelente, como `calculateKPIGroups`;
- normalización de flota, acumulado enero → mes de corte, agrupación por código de vehículo.

Gestivo agrega dos conceptos que Lovable escribía a mano dentro de combustible y póliza
(combustible y póliza de vehículos nuevos). Suman igual.

**Comprobado con los datos, no solo leyendo código.** El cotejo vehículo-mes contra la utilidad que el
aplicativo guardó (`npm run financiera:historico -- --api --periodo-desde 2025-01 --cotejar`) da
**2.724 vehículo-mes idénticos** y utilidad cuadrando al peso en todos los meses donde las dos
herramientas tienen los mismos datos. Las diferencias que quedan son de datos (sección 5), no de
lógica.

## 2. Defecto heredado que hay que corregir

**Un bus sin timbradas sale en verde en gasto por timbrada.** Lovable y Gestivo calculan
`gasto / timbradas` como 0 cuando no hay timbradas, y 0 ≤ 2.500 es «Excelente». Caso real: el
**519 en 2025**, siete meses sin producir y 27,7 millones de gasto, clasificado como el mejor. En
2026 le pasa al 812. **Corregido el 2026-09-23 (fase A):** `tieneTimbradas()` en `analisis.ts` los saca del semáforo de
gasto por timbrada en la pantalla, la portada y el exporte, y la tabla los rotula «sin timbradas».
Siguen sumando su gasto al KPI de flota, que es Σ gastos / Σ timbradas.

## 3. Lo que Lovable tiene y Gestivo no

| # | Función en Lovable | Dónde | Estado en Gestivo |
|---|---|---|---|
| 3.1 | **Filtro por marca** (catálogo `vehiculo_marcas`) | `FleetDashboard.tsx` | Implementado en Gestivo con `vehiculos.marca` y segmentación visible en Rentabilidad. |
| 3.2 | **Histórico por buseta**: un vehículo, rango desde/hasta que cruza años, fila por mes, subtotal por año, total ponderado, mejor y peor mes, meses en pérdida | `ReportesTab.tsx`, `HistoricoBusetaReport.tsx` | Falta. Comparación con filtro de vehículo da la serie mensual, pero solo dentro de un año y sin esos totales |
| 3.3 | **Semáforo de mantenimiento** por % de ingresos: ≤ 10 % excelente, ≤ 15 % aceptable | `MantenimientoTab.tsx` L49-53 | Falta. Gestivo muestra el % pero sin semáforo |
| 3.4 | **Relación repuestos / mano de obra** con alertas: > 2 «alto en repuestos», < 0,5 «alto en mano de obra» | `MantenimientoTab.tsx` L170, L409 | Falta. Gestivo muestra el % de mano de obra, sin alerta |
| 3.5 | **Mantenimiento por antigüedad** (0-3, 4-6, 7-10, más de 10 años, por modelo) | `MantenimientoTab.tsx` L204-209 | Falta. El modelo sí está en la vista |
| 3.6 | **Comparación libre**: dos períodos cualesquiera, acumulado año contra año al mismo corte o mes contra mes | `ComparacionPeriodosTab.tsx` | Implementado en Gestivo: dos cortes independientes, modos Acumulado y Mes a mes, tarjetas, gráficos, resúmenes y detalle ordenable por vehículo. |

Los umbrales 10/15 y 2/0,5 estaban escritos a mano en la pestaña. Si se portan, van a
Financiera › Parámetros como los otros tres.

No se portan, por decisión del plan (sección 2.2): usuarios y contraseñas, activación de pestañas,
campana de notificaciones (solo avisaba cargas, nunca alertas de indicadores), el chat (lo reemplaza
el MCP de Gestivo) y los PDF de la pestaña Reportes (los reemplazan los exportes de cada pantalla).

## 4. Diferencias deliberadas: Gestivo se aparta porque Lovable estaba mal

Para confirmar que se quedan así.

| # | Regla | Lovable | Gestivo | Efecto |
|---|---|---|---|---|
| 4.1 | **Productividad con mes de corte** | viajes acumulados ÷ meses del corte, aunque el bus haya operado menos | viajes ÷ meses con movimiento; flota = Σ viajes ÷ vehículo-mes | 2026 ene–ago: **65,3 en Lovable, 72,7 en Gestivo**. 30 de 162 buses operaron menos meses (entradas y retiros) y Lovable los castiga. En 2025 casi no cambia (79,2 contra 79,9) |
| 4.2 | **Productividad sin mes** | cada vehículo-mes ÷ 12: la flota sale 12 veces más baja y casi todo en rojo | el año acumulado por vehículo | Defecto de Lovable |
| 4.3 | **Semáforo sin mes elegido** | clasifica vehículo-meses y los rotula «vehículos» | clasifica vehículos con el año acumulado | Con mes elegido las dos coinciden |
| 4.4 | **Mantenimiento en el PDF** | repuestos + mano de obra, sin restar el descuento fondo-conductor | siempre con repuestos netos | Defecto de Lovable |
| 4.5 | **Distintivo de viajes en la tabla y en el PDF** | compara los viajes acumulados contra 90 (540 viajes «excelente») | viajes por mes contra 90 | Defecto de Lovable |
| 4.6 | **«Ambas»** | operativa en Rentabilidad, financiero en la tabla detallada | operativa en todas partes | Incoherencia de Lovable |
| 4.7 | **Filtro de propietario** | el tablero filtra antes de consolidar, Reportes después y el MCP por subcadena | una sola regla: la fila entra si el dueño es uno de los del vehículo-mes | Tres reglas distintas en Lovable |
| 4.8 | **Comparación** | excluye filas sin placa; la variación de la rentabilidad es relativa sobre el porcentaje | no excluye; mismas filas que el resto | Los totales de Lovable no cuadraban entre pestañas |
| 4.9 | **Vehículos en pérdida** | utilidad acumulada < 0 sobre todos | la misma regla, solo sobre los que tienen el archivo contable completo | Sin archivo, la utilidad es un techo y no se puede afirmar |
| 4.10 | **Vista por defecto del MCP** | operativa (el tablero y la API usan financiero) | financiero | Incoherencia de Lovable |

## 5. Diferencias de datos que salieron del cotejo

- **2026-07**: el aplicativo tiene 30 de 31 días (fondo 15.000 contra 15.500) en 150 buses. Gestivo
  tiene el mes completo desde GEMA. Los rubros contables son los mismos.
- **2025-01**: ocho buses (520 a 528) con 0 timbradas en el aplicativo. Gestivo toma las de GEMA.
- **2025-12**: el bus 517 tiene 20 viajes en el aplicativo contra 80 en GEMA.
- **2026-04**: la póliza de vehículos nuevos de 1022, 1024 y 1025 está en Gestivo y ya no en el
  aplicativo (confirmado por el usuario).
- **1029, 1031 y 1033 en julio de 2026**: buses nuevos sin viajes con 72.000 de combustible escrito a
  mano, 213.494 en total. GEMA no crea la fila de un mes sin movimiento, igual que los buses parados.
- **1058 en julio de 2026**: el aplicativo le pone la placa LJO700, que en el maestro de GEMA es del
  **1057**. Son 18.328 de repuestos. Puede ser el mismo caso que el 903 → 972.

## 6. Plan propuesto

| Fase | Contenido | Migración |
|---|---|---|
| A | Gasto por timbrada: fuera del semáforo los vehículos sin timbradas, con marca «sin timbradas» (sección 2) | No |
| B | Mantenimiento: semáforo por % de ingresos, alerta repuestos/mano de obra y grupos por antigüedad, con los umbrales en Parámetros (3.3 a 3.5) | Sí: dos parámetros nuevos |
| C | Filtro por marca desde `vehiculos.marca` (3.1), implementado | No: se consulta el maestro directamente |
| D | Histórico por vehículo con rango que cruza años (3.2) | No |
| E | Comparación libre entre dos períodos (3.6), implementada | No |

**Decisión del usuario (2026-09-23):** inicialmente entró solo la fase A. Después se solicitó
la segmentación por marca (fase C) y la presentación de Comparación como en Lovable (fase E).
Gestivo conserva las diferencias deliberadas de la sección 4; las fases B y D siguen pendientes.
