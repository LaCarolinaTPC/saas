# Recuperación de incapacidades — qué entra al módulo

**Decisión:** Administración de Datos, 2026-09-14.
**Migración:** `supabase/migrations/20260914161822_incapacidades_umbral_de_entrada_eps_desde_3_dias_y_arl_todas.sql`
**Código:** `src/lib/ausentismo/matriz-reglas.ts` (`COBRO_EPS_DIAS_MIN`) · `src/lib/ausentismo/matriz.ts`
(umbral por entidad del informe de cobro) · `src/app/(dashboard)/incapacidades/radicacion/page.tsx`.

## La regla

| Paga | Entra al módulo |
|---|---|
| **EPS** (origen distinto de AT/EL) | Solo la incapacidad de **más de 2 días** (3 o más) |
| **ARL** (origen AT o EL) | **Todas**, sin condición de días |

El porqué es el mismo de la liquidación: en una incapacidad inicial de origen común el empleador asume los dos
primeros días (`DIAS_EMPLEADOR_EPS`) y la EPS paga desde el tercero, así que por debajo de tres días no hay nada
que reclamar. La ARL responde desde el primer día (regla operativa `gestivo-cobro-dias`).

Antes de esta decisión entraba **toda** incapacidad iniciada en el corte o después. La bandeja del piloto llegó
a 30 expedientes, de los cuales 24 eran de EPS de uno o dos días.

## Un solo umbral para entrar y para cobrar

No hay dos parámetros. El umbral por entidad de la decisión 12.17
(`ausentismo_catalogos.dias_min_cobro`, editable en **Incapacidades › Parámetros**) es el que decide las dos
cosas, y su semilla en las EPS baja de 4 a 3:

- **Puerta de entrada** (`incapacidad_entra_por_corte`): vigente, iniciada en el corte o después y, si la paga
  una EPS, con `dias_it_pagados >= ` el umbral de esa EPS. Si la entidad no está homologada o no tiene umbral
  propio, aplica `incapacidad_dias_min_defecto`: 3 para la EPS, 1 para la ARL.
- **Cobrable** (columna `cobrable` de `vw_incapacidad_expedientes`): el mismo umbral. Por eso lo que entra ya no
  necesita excepción escrita para radicarse.

Si una EPS exige más días, se le sube el umbral en Parámetros y la puerta de entrada lo respeta sin tocar código.

## Casos de borde

- **Sin fecha de fin** (`dias_it_pagados` nulo): de una EPS no entra todavía; entra sola cuando RRHH completa la
  fecha en la matriz, porque el trigger de actualización crea el expediente en cuanto la fila pasa a cumplir la
  regla. De una ARL entra de una vez: no se le miran los días.
- **Incapacidad que crece** (de 2 a 5 días por corrección de la fecha de fin): entra en ese momento. Si su
  expediente había sido retirado, el trigger lo **reingresa** (`expediente_reingresado` en la bitácora) en vez
  de dejarlo fuera para siempre.
- **Alta manual** (decisión 12.16): sigue mandando sobre la regla. RRHH puede incorporar una incapacidad que la
  puerta no dejaría entrar, con motivo de al menos 10 caracteres.

## Limpieza de lo que ya había entrado

La migración retira con **eliminación lógica y motivo** los expedientes que nacieron fuera del alcance. Solo
toca lo que nadie ha trabajado: estado `recibido` o `en_completar`, sin liquidación, sin radicación, sin recaudo
aplicado y sin soporte cargado, y nunca los de alta manual ni los que están sin fecha de fin. Quedan en
`ausentismo_log` con la acción `expediente_retirado_por_umbral` y se pueden reingresar uno a uno por alta
manual.

Medido en producción el 2026-09-14, antes de aplicar: 30 expedientes vigentes — 2 de ARL, 4 de EPS de más de
2 días y 24 de EPS de uno o dos días, todos estos en estado «recibido».

## Qué más cambia de sitio

El segmento **«Cobro EPS»** de la matriz de ausentismo comparte el umbral del catálogo, así que ahora lista
desde 3 días. Su etiqueta pasa de «más de 3 días» a «más de 2 días» (`SEGMENTOS_COBRO`). El filtro «Días
mínimos» escrito a mano sigue mandando sobre todo cuando se usa.

## Comprobación tras aplicar

La migración termina con dos consultas: el conteo de expedientes vigentes por clase con su columna `cobrable`
(no debe quedar ningún EPS vigente bajo umbral) y el umbral de cada entidad activa del catálogo (3 en las EPS,
1 en las ARL, salvo las que RRHH haya ajustado a propósito).
