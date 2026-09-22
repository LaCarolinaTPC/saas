# Financiera · Gestión de flota — Fase 5: pantallas

**Plan:** `docs/Plan_desarrollo_financiera_GESTIVO.md`, sección 8 (pantallas) y sección 9, fase 5.
**Sin migración:** todo se lee de `vw_financiera_consolidado`, `vw_financiera_flota_mes`,
`financiera_operativo_mes`, `financiera_periodos`, `financiera_cargas` y `financiera_parametros` (fase 2).
**Motor de análisis:** `src/lib/financiera/analisis.ts` (puro, 10 pruebas) · lectura en `consulta.ts` ·
carga común de pantalla en `pantalla.ts`.
**Pruebas:** `npm run test:financiera` — 48 casos (23 motor + 15 archivo contable + 10 análisis).

## Las pantallas

Todas viven bajo `/financiera/flota/…`, comparten encabezado, pestañas y barra de filtros
(`marco.tsx`), y cada una comprueba su sub-función antes de leer nada.

| Ruta | Pantalla | Sub-función | Qué muestra |
|---|---|---|---|
| `/financiera/flota` | Resumen (Gestión Resultado Flota) | `fin_tablero` | Portada: el resultado en cuatro cifras, el año anterior, la tendencia, el semáforo de los tres indicadores, las alertas y el resultado por flota |
| `…/rentabilidad` | Rentabilidad | `fin_tablero` | KPIs ponderados, reparto por semáforo, utilidad y rentabilidad mes a mes, tabla detallada |
| `…/timbrada` | Gasto por timbrada | `fin_tablero` | Gasto e ingreso por timbrada, margen, gasto sobre el ingreso, serie mensual y los 15 peores vehículos |
| `…/productividad` | Productividad | `fin_tablero` | Viajes por vehículo-mes, días con producción, timbradas por viaje, reparto y los 15 más bajos |
| `…/comparacion` | Comparación | `fin_analisis` | El rango frente al mismo rango del año anterior y cada mes frente al anterior |
| `…/perdida` | Vehículos en pérdida | `fin_analisis` | Los que cierran en pérdida, los que tuvieron meses malos y los que no se pueden clasificar |
| `…/mantenimiento` | Mantenimiento | `fin_analisis` | Repuestos netos contra mano de obra, por vehículo y por timbrada |
| `…/datos` | Datos de flota | `fin_datos` | Consolidación, archivo contable y bitácora (fases 3 y 4) |
| `…/auditoria` | Auditoría | `fin_auditoria` | Bitácora completa, versiones guardadas antes de reabrir y estado de cada período |
| `…/parametros` | Parámetros | `fin_parametros` | Umbrales de semáforo y reapertura de períodos cerrados |

`/financiera` redirige a la primera pantalla que el usuario puede ver. En el menú lateral, el grupo
**Financiera** es el departamento entero: **Gestión Resultado Flota**, que abre la portada y lleva las
demás pantallas como pestañas, y debajo los devengados de Tesorería (caja, análisis quincenal, entregas,
revisión cartulina, simulador, parámetros y auditoría). Son **dos módulos de permisos distintos**,
`financiera` y `tesoreria`: el menú filtra cada entrada por su href, así que quien solo tiene uno ve
únicamente sus pantallas. El proxy y cada pantalla filtran por sub-función.

La portada (`page.tsx` + `resumen-vista.tsx`, separados para poder verla sin sesión) tiene dos reglas
propias que no están en las demás:

- **Compara contra los mismos meses del año anterior**, no contra el año entero. Con nueve meses
  cargados de 2026 contra los doce de 2025, los ingresos caían un 28,9 % que no existe; con los mismos
  nueve, suben un 5,8 %.
- **Mantenimiento y cobertura usan el criterio de sus pantallas**, no el del semáforo. Basta un mes con
  archivo para contar mantenimiento, y la cobertura se mide en vehículo-mes (77,15 %, 1.016 de 1.317),
  no en vehículos con el rango completo, que en el año en curso son tres.

## Reglas del aplicativo que se conservan

- **Filtros en cascada** Año → Mes → Flota → Propietario → Vehículo. Cada uno reduce las opciones del
  siguiente y el estado vive en la URL, así que la pantalla se comparte por enlace. Chips removibles.
- **Acumulación al corte:** elegir un mes acumula desde enero hasta ese mes. El rótulo lo dice
  («Acumulado enero – agosto 2026»).
- **Agrupación por `codigo_vehiculo`, nunca por placa.**
- **Promedio ponderado** (Σ utilidad / Σ ingresos) en rentabilidad y gasto por timbrada, nunca el
  promedio de la columna. Hay una prueba que falla si alguien lo cambia por el promedio simple.
- **Selector de vista de rentabilidad** (Operativa sin intereses / Después de financiero / Ambas) en
  Rentabilidad, Gasto por timbrada, Comparación y Vehículos en pérdida. Con «Ambas» la tabla añade las
  dos columnas y la cifra principal es la operativa, como en `fleetUtils.ts`.
- **`Desc. Fondo-conductor` se resta de Repuestos**, nunca se suma como gasto.
- **Valores negativos siempre en rojo.**

## Lo que el módulo dice cuando falta el archivo contable

Es la decisión de presentación más importante de la fase. Sin los seis rubros que no existen en GEMA:

- La utilidad y la rentabilidad se muestran **en gris y con «≤»**: son un techo, no una cifra.
- El gasto por timbrada se muestra con **«≥»**: es un piso.
- El **semáforo de rentabilidad no clasifica** esos vehículos; dicen «sin dato» y quedan fuera del
  reparto, con el conteo a la vista para que nadie lea el reparto como si fuera toda la flota.
- **Vehículos en pérdida** los lista aparte: de ellos no se puede afirmar que no estén en pérdida.
- **Mantenimiento** directamente no los incluye, y lo dice: no es que gasten cero, es que no hay dato.
- **Productividad** es el único indicador exacto: sale entero de GEMA y no lleva ninguna advertencia.

Hoy, con `financiera_contable_mes` vacía, las 21 mensualidades consolidadas se ven así en todo el módulo.

## Advertencia sobre el umbral de productividad

La pantalla de Productividad avisa, con las cifras del rango a la vista, que el umbral heredado
(excelente ≥ 90, aceptable ≥ 80 viajes por vehículo-mes) es inalcanzable: en 2026 la flota va en 68–83
viajes por bus-mes y el 72–91 % de los vehículos queda en rojo. Es el hallazgo 6.3.1 del plan, y el
nuevo umbral sigue **por confirmar** con Subgerencia Financiera. Se cambia en Parámetros sin tocar código.

## Parámetros y reapertura

`fin_parametros` está en `SUBS_SOLO_ADMIN`, así que las dos cosas son del administrador:

- **Umbrales**: se validan contra la dirección del indicador (en gasto por timbrada, menor es mejor, así
  que excelente no puede ser mayor que aceptable) y el valor anterior queda en la bitácora.
- **Reabrir un período**: exige motivo de al menos 10 caracteres, guarda una copia de las cifras en
  `financiera_periodos_versiones` y vuelve a meter el mes en la corrida diaria. GEMA lo cierra de nuevo.
  Es lo que desbloquea reemplazar o reversar el archivo contable de un mes ya cerrado (fase 4).

## Verificación

- 10 pruebas nuevas del análisis: cascada de filtros con un bus de dos dueños, acumulación al corte,
  agrupación por vehículo, ponderado distinto del promedio simple, reparto por semáforo y mantenimiento.
- Revisión visual sin sesión con la vista previa temporal bajo `/docs` y Playwright, a 1440 y 800 px,
  con datos reales y con filtros aplicados (acumulado a agosto + flota AFILIADO + vista «Ambas»).
  La vista previa se borró antes del commit.
- La revisión visual encontró **un fallo que ni `tsc` ni ESLint ven**: `rotuloRango` vivía en
  `filtros.tsx`, que es un módulo de cliente, y las pantallas son de servidor. Next.js falla en
  ejecución con «Attempted to call rotuloRango() from the server». Se movió a `formato.ts`, que no
  lleva `"use client"`. **Cuidado al añadir utilidades compartidas: si la usa una pantalla, no puede
  vivir en un módulo de cliente.**

## Qué queda

- **Fase 6**: exportes a Excel (`exceljs`) y PDF (`jspdf`), alta de `financiera` en la API externa y en
  el catálogo MCP, y corrección de la documentación de `ingreso_tercero` con los hallazgos 3.6.1 a 3.6.3.
- **Fase 7**: cargar el histórico contable de Lovable, cotejar tres meses contra el aplicativo y
  recalibrar los umbrales de gasto por timbrada y rentabilidad.
- Punto 18 del plan (conservar las tres vistas de rentabilidad): **implementado**; queda confirmarlo con
  el usuario.
- Fase 0 sigue esperando las credenciales de GEMA.
