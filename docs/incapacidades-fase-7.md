# Recuperación de incapacidades — Fase 7: endurecimiento

**Plan:** `docs/Plan_desarrollo_incapacidades_GESTIVO.md`, sección 11, fase 7.
**Migración:** `supabase/migrations/20260911215045_incapacidades_indices_de_lectura_y_retencion_de_soportes.sql`
(índices y retención; no crea tablas). Aplicar después de las tres anteriores, que ya están aplicadas.
**Script:** `npm run incapacidades:rendimiento`.
**Pruebas:** `npm run test:incapacidades` (49). **Diccionario:** `docs/diccionario-datos-gestivo.md` regenerado con
`npm run diccionario:generar` (89 tablas, 1.315 campos; 65 referencias a tablas `incapacidad_*`).

## Qué cambia

| Pieza | Qué | Por qué |
|---|---|---|
| **Paginación** | `listarRecaudos` y `expedientesAplicables` pasan de `limit(1000)` a la paginación con `range()` y orden estable (`todo`, exportado desde `expedientes.ts`) | `limit(1000)` devolvía exactamente 1.000 filas sin avisar cuando había más: la forma silenciosa en que PostgREST recorta. Ya ninguna lectura del módulo pide "todo" de una vez; las que llevan `limit(200)` son búsquedas o historiales acotados a propósito |
| **Índices** | `idx_incapacidad_expedientes_recibido` (orden de la bandeja), `idx_incapacidad_expedientes_cambio`, `idx_ausentismo_fecha_inicio` y `idx_ausentismo_cedula_inicio` (corte y alta manual), `idx_incapacidad_recaudos_vigentes`, `idx_ausentismo_log_registro_fecha` (historial de la ficha), `idx_tesoreria_audit_modulo_accion_usuario` (deduplicación de consultas) | La vista resuelve cuatro LATERAL por expediente; con miles de filas cada uno necesita un índice que case con su filtro parcial |
| **Retención de soportes** | Parámetro `retencion_soportes_dias` (semilla 1825 = 5 años) y vista `vw_incapacidad_soportes_depurables` con los soportes anulados que ya la cumplieron | Nada se borra solo: la depuración del bucket es una acción manual de Administración con la vista como lista. Los soportes vigentes no se depuran nunca |
| **Script de rendimiento** | Mide en memoria las agregaciones con 5.000 sintéticos y, contra la base real, el tiempo de la vista, la de recaudos y una ficha; comprueba que ninguna lista devuelva exactamente 1.000 en una sola página | Los sintéticos **no se insertan**: la base es producción |

## Resultado de la corrida del 2026-09-11 (tras aplicar las tres migraciones del módulo)

**En memoria, 5.000 expedientes sintéticos:**

| Agregación | ms |
|---|---|
| resumen de bandeja | 1,7 |
| pestañas de la bandeja de cobro | 2,6 |
| grupos por entidad | 2,0 |
| saldo de conciliación × 5.000 | 4,1 |
| tablero | 9,0 |
| faltantes para liquidar × 5.000 | 1,1 |
| **total de una carga** | **20,5** |

**Contra la base real (solo lecturas):**

| Lectura | ms | Filas |
|---|---|---|
| vista de expedientes completa (bandeja) | 976 | 26 en 1 página |
| vista de recaudos | 219 | 0 |
| ficha de un expediente (8 lecturas en paralelo) | 311 | — |

Los 976 ms de la bandeja con 26 filas son latencia de red y arranque de conexión, no cálculo: la parte de la
aplicación cuesta 20 ms con 5.000. Para que la vista siga por debajo de 2 s con miles de expedientes hace
falta que la base use los índices de esta migración: el `EXPLAIN ANALYZE` al final del script SQL debe mostrar
`idx_incapacidad_expedientes_recibido` y los índices parciales de los LATERAL, sin `Seq Scan` sobre las tablas
del módulo.

**Conteos reales:** 26 expedientes (los 23 del backfill más 3 incapacidades registradas en la matriz después de
aplicar la migración, creadas por el trigger), 0 liquidaciones, 0 radicaciones, 0 recaudos, 0 soportes. Parámetros:
corte 2026-09-01, tolerancia 0.

## Verificación de salida de la fase (plan, 11)

| Criterio | Resultado |
|---|---|
| 5.000 expedientes sintéticos: bandeja < 2 s | Agregaciones 20,5 ms en memoria; la lectura real de la vista 976 ms con 26 filas. El criterio se cumple hoy; con volumen depende de los índices de esta migración (comprobar con el EXPLAIN al aplicarla) |
| Ninguna lista truncada a 1.000 | Todas las lecturas del módulo paginan con `range()` u orden estable; el script avisa si una devuelve exactamente 1.000 en una página. Corrida: ninguna |
| tsc, eslint, 49 pruebas, verificador de migraciones | limpios |

## Comprobación manual al aplicar la migración

1. La primera consulta debe listar los siete índices.
2. `soportes_depurables` debe ser 0.
3. El `EXPLAIN (ANALYZE, BUFFERS)` de la bandeja: sin `Seq Scan` en `incapacidad_*`; `ausentismo` puede salir con
   Index Scan por la PK (JOIN por id).

## Cierre del plan

Con esta fase quedan en main las siete fases. Lo que sigue no es código sino operación del piloto:

- **Decisiones asumidas que RRHH y Administración deben confirmar con el uso:** 12.5 (base exigible = valor
  reclamado), 12.6 (tolerancia 0, cinco tipos de ajuste, autorización de RRHH), 12.10 (una radicación activa
  por expediente), 12.1 (factor de LM/LP/EL, con la primera licencia de maternidad real), 12.13 (los ocho
  estados del borrador).
- **Conteo de ajustes al cierre del piloto** (12.18): `SELECT campo, count(*) FROM incapacidad_ajustes_liquidacion
  GROUP BY campo` y por entidad vía el expediente. Si una sobrescritura se repite para una misma EPS o tipo, se
  corrige el parámetro (`dias_min_cobro`, reglas), no se sigue ajustando a mano.
- **Roles:** si Contabilidad o Revisoría entran, se les asigna el módulo o los submódulos `incap_*` desde
  Configuración → Usuarios, sin migración.
