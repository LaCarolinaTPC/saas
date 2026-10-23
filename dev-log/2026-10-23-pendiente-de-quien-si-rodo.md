# 2026-10-23 · El pendiente automático de quien sí rodó

Reporte: «este conductor salió a despacho y aún continúa en Registro del día —
11190 · OSPINO HINCAPIE MARCOS AURELIO, CC 72230081».

## Lo verificado (datos reales, solo lectura)

Con un script de un solo uso en `work/` (que no se versiona).

- Ficha: `ACTIVO`, no reubicado, ingreso 2026-08-12. Entra en plantilla.
- Despacho del 23-10, bus 566 turno 1: viaje 2 **`DESPACHADO` a las 08:44**;
  viajes 3, 4 y 5 en `POR_DESPACHAR`.
- Registro `95a329ed…`: tipo `pendiente`, origen `automatico`, creado
  **14:37:41 UTC = 09:37 de Bogotá**, firmado `gestivo (automático)`.
- Marcaciones del biométrico ese día: **0** (por eso entró a la lista de
  candidatos; esa parte de la regla funcionó).

**Rodó 53 minutos ANTES de que Gestivo le escribiera el pendiente.** Cuando
corrió la creación automática, la copia de `historico_despacho` no tenía aún
ese viaje como `DESPACHADO`: GEMA marca el viaje al cerrarlo, no al salir.

Contraprueba de que la regla acierta en general: el 13-10 y el 11-09 sus viajes
están `NO_DESPACHADO`, y ahí el candidato era correcto.

## La causa

**Gestivo decidía una sola vez y no volvía a mirar.** Había auto-limpieza para
quien sale de la plantilla (por el desfase de los retiros de GEMA), pero
ninguna para quien después resulta que **sí rodó**. La fila quedaba huérfana.

Agravante: esa limpieza solo se disparaba al abrir **Marcaciones**. El Registro
del día —la pantalla donde se vio el problema— no la ejecutaba.

## El arreglo

1. Regla pura `pendientesAAnularPorDespacho` en `auto-pendientes.ts`, hermana
   de `pendientesAAnular`.
2. `limpiarPendientesAutoFueraDePlantilla` → **`limpiarPendientesAutoHuerfanos`**,
   con los dos criterios en una sola pasada y el motivo en la bitácora
   (`datos_anteriores._motivo_anulacion`).
3. En `biometrico/data.ts` la limpieza pasa a correr **después** de leer, para
   poder usar `marco.trabajaron` (gratis). Se paga releer los registros solo en
   las pasadas que borran algo; antes se pagaba una limpieza en todas.
4. Se llama **también desde Ausentismo › Registro del día**. Sin el dato de
   quién rodó, consulta `historico_despacho` acotado a las cédulas con
   pendiente automático.

Frontera intacta: solo `origen = 'automatico'` **y** `tipo = 'pendiente'`. Lo
que clasificó una persona no se toca ni aunque rodara — eso es la contradicción
que Marcaciones ya pinta en ámbar y que alguien debe resolver.

## Lo que NO se hizo, y por qué

Forzar el refresco de GEMA antes de crear. Habría costado ~2,6 s y **no habría
servido en este caso**: a las 09:37 el retraso era de GEMA, no del refresco. El
arreglo de verdad es corregir después.

## Simulacro antes de desplegar

```
2026-10-23: 2 pendientes automáticos
  SE ANULARÍA 1 → [rodó] 11190 · OSPINO HINCAPIE (08:44 bus 566 DESPACHADO)
  SE QUEDA    1 → 3453 · VELEZ REALES (sin despacho que rodara)
```

El 21 y el 20 el criterio nuevo no toca nada: ahí solo actúa la regla vieja de
plantilla, que ya existía.

Script: `npm run biometrico:limpieza -- <fecha>` (solo lee).

## Archivos

```
src/lib/biometrico/auto-pendientes.ts        + pendientesAAnularPorDespacho
src/lib/biometrico/auto-pendientes.test.ts   + 3 pruebas (165 en total)
src/lib/biometrico/pendientes-auto.ts        limpiarPendientesAutoHuerfanos
src/lib/biometrico/data.ts                   reorden de la limpieza
src/app/(dashboard)/ausentismo/page.tsx      limpieza en el Registro del día
docs/biometrico-marcaciones.md               «Lo que Gestivo se retira solo»
scripts/biometrico-limpieza-pendientes.mts   simulacro por fecha (npm run biometrico:limpieza)
package.json                                 el script nuevo
```

Sin migración: no cambia el esquema.
