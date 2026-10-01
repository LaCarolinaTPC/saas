# Revisión de timbradas (Tesorería → Revisión cartulina)

La revisión diaria de timbradas que Tesorería hacía por fuera de Gestivo (cuatro exportes de GEMA más el script
`work/Revisión Timbradas/generar_informe_timbradas.py`) ahora la calcula Gestivo con las tablas que ya sincroniza.
La pestaña **Revisión del día** es la principal. El mapa de calor anterior quedó sin cambios en la pestaña **Mapa de
calor** (`/tesoreria/revision-cartulina/mapa`).

## Fuentes

| Exporte que se descargaba | Tabla de Gestivo | Cruce con el despacho |
|---|---|---|
| Histórico de Despacho | `historico_despacho` | base del día (`fecha_viaje`) |
| Puntos Virtuales (Base = 1) | `puntos_virtuales` con `is_base = true`: solo TERMINAL LA CAROLINA, `cod_pv` 1 | placa + día + evento de geocerca más cercano a la hora de salida y de llegada |
| Viajes Recaudados | `viajes_recaudados` (Tim R = `timbradas_real`, Dcto = `descuento`) | `numero` |
| Timbradas Descontadas | `timbradas_descontadas` (`motivo_descuento`, `tim_descuento`) | vuelta del día (`num_viaje`) + placa + `fecha_viaje` |

El 2026-09-27, Supabase tenía 679 salidas y 676 entradas a la geocerca del terminal, igual que el CSV de GEMA.

## Reglas

`src/lib/tesoreria/revision-timbradas-reglas.ts` es una traducción 1:1 de `procesar_dia()`:
- **Siete estados**, ordenados por prioridad.
- **Tabla de descuentos anterior al 2026-08-13**, con sensores nuevos y viejos.
- **Tabla vigente desde el 2026-08-13:**
  - Lunes a sábado: 60–89→1, 90–119→2, 120–149→3, 150+→4.
  - Domingos y festivos, rutas EXPRESS: 30–49→1, 50–69→2, 70+→3.
  - Domingos y festivos, otras rutas: 40–69→1, 70–99→2, 100+→3.
  - Los festivos siguen la Ley Emiliani; se usa `esFestivo` de `calendario-pago.ts`.
- **Cortesía nocturna:** despacho desde las 18:00 con estado DESPACHADO. Acepta `Tim R = Ac.Sub + 1` y el descuento
  `VENTA ADICIONAL`.
- **Observaciones:** las mismas del informe HTML.

Un cambio de política futuro entra como tabla nueva con su fecha de corte; las tablas anteriores no se tocan.

Pendiente heredado (§8.3 de las instrucciones del informe): **«POR VENTA» no suma al TD Dcto**. Sigue igual que en el
script hasta que Tesorería decida.

## Paridad con el script

- **Lógica:** `work/verificar-revision-timbradas.mts` toma las entradas que Python leyó de los exportes del 2026-09-30
  y las pasa por `procesarDia`. El resultado es el mismo en los 526 viajes, en estado, cifras y observación.
- **Fuentes:** `work/verificar-revision-timbradas-dias.mts` compara viaje por viaje los informes HTML del 23 al 30 de
  septiembre con Gestivo calculado hoy desde Supabase. Coincide entre el 97,0 % y el 99,8 % de los viajes.

Todas las diferencias son datos que GEMA completó después del exporte:

| Cambio | Causa |
|---|---|
| Sin recaudo → Diferencia / OK / Cartulina | el recaudo se liquidó después del exporte (p. ej. el 1843012 se recaudó el 1-oct 12:44) |
| Datos incompletos → No despachado | GEMA cerró el viaje como no despachado |
| Sin datos PV → Cartulina con PV | los eventos de geocerca están hoy en Supabase |
| Diferencia: cambia la observación | descuentos SENSOR registrados después del exporte (1842596 y 1843012, 1-oct 08:18 y 08:23) |

Por eso la revisión en Gestivo de un día ya cerrado es más completa que el informe del mismo día descargado a primera
hora.

## Evidencia de revisión

Migración `20261001182315_revision_de_timbradas_evidencia.sql`, tabla `tesoreria_revision_timbradas`:
- **Una fila por viaje revisado** (la fila existe = check marcado), con el resultado opcional (lista del informe HTML), la nota opcional, quién revisó, cuándo y el estado
  calculado en ese momento.
- **Si GEMA cambia los datos después**, la pantalla avisa que el estado actual ya no es el que tenía al revisarse.
- **Cada marca o desmarca** queda también en `tesoreria_audit_log` (`timbrada_revisada`, `timbrada_revision_quitada`).
- **Sin la migración** la pantalla calcula y exporta igual, y avisa que no se pueden marcar viajes.

## Revisión en pantalla

- **Check por registro:** la primera columna de cada viaje es una casilla. Un clic lo marca como revisado y se guarda al
  instante con el usuario y la hora; otro clic lo desmarca, y si tenía resultado o nota pide confirmación. El resultado
  y la nota son opcionales y se registran desde el detalle del viaje.
- **Orden por columna:** clic en el título ordena ascendente, luego descendente y luego vuelve al orden de prioridad.
  Los vacíos siempre van al final.
- **Filtro por columna:** la fila bajo el título filtra; las columnas se combinan entre sí y con los indicadores y las
  etiquetas.
  - Texto: contiene, sin distinguir mayúsculas ni tildes.
  - Números: `>10`, `>=10`, `<0`, `5`, `!=0`, `10..20`, `±10` (diferencia de 10 o más hacia cualquier lado) y `vacío`.
  - Listas (Revisado, Ruta, Vuelta, Estado del despacho, Estado): uno de los valores presentes.
- **Ejemplo:** Estado = Diferencia y Revisado = Pendiente deja solo lo que falta por revisar.
- **Barra de cada tabla:**
  - **Columnas:** elige qué columnas se ven. Al ocultar una columna se quitan su filtro y su orden.
  - **Compacto:** filas bajas y observación en una línea.
  - **Ampliar:** la tabla ocupa toda la pantalla; Esc para salir.
  - Columnas y compacto se recuerdan en el navegador por tabla.

## Consolidado y cierre del día

Pestaña **Consolidado** (`/tesoreria/revision-cartulina/consolidado`). Muestra el avance de la revisión de un periodo,
de máximo 62 días, a partir del 2026-09-30 (`INICIO_REVISION_GESTIVO`), primer día revisado en Gestivo.

- **Qué cuenta como revisado:** un viaje con check que sigue por revisar en el último cálculo.
  - Un check en un viaje que GEMA ya resolvió (quedó OK o no despachado) se conserva, pero no suma.
  - Un viaje que entra a revisión después del cierre queda como «nuevo tras cierre» y reabre el día.
- **Foto diaria** (`tesoreria_revision_timbradas_dias`): guarda conteos y la lista de viajes por revisar de cada día,
  así el consolidado no recalcula GEMA.
  - La pantalla del día la reescribe al abrirse.
  - El cron `/api/cron/revision-timbradas` (09:30 UTC, después de la sincronización) recalcula los últimos 10 días.
  - A mano: `?desde=&hasta=` carga fotos de hasta 62 días.
- **Estados del día:** Sin calcular · Nada por revisar · Sin revisar · En curso · Completo · Cerrado · Reabierto.
- **Cerrar día** (`tesoreria_revision_timbradas_cierres`):
  - solo se habilita al 100 % y nunca para el día en curso;
  - recalcula el día con lo último de GEMA antes de cerrar;
  - guarda quién, cuándo y qué viajes había;
  - no se borra: un nuevo cierre después de una reapertura queda como historial.
- **Vistas:** avance por día (clic en un día abre sus pendientes), por estado y por revisor, todas con filtro y orden por
  columna. Excel y acta del periodo.

Migraciones:
- `20261001191332`: resultado opcional; arregla el error del check.
- `20261001192117`: fotos y cierres.

## Exportes

- **Excel** (`/api/tesoreria/revision-timbradas/export?fecha=`): hojas Resumen, Detalle, Por revisar y Alertas, con los
  colores del informe original y las columnas de la revisión.
- **Acta imprimible:** muestra los viajes revisados y deja espacio para las firmas.
