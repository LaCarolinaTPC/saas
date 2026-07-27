# Informe — Simulador de devengados: timbradas CU y detalle por ruta en rango

**Fecha:** 27 de julio de 2026 (tarde)
**Origen:** WhatsApp de Nestor (13:15–13:22) con dos capturas del reporte
**Devengados · Simulador → Rendimiento del día**.
**Commit:** `3ef2209` — desplegado en producción.

---

## Reclamo 1 — "Las timbradas no coinciden"

### Lo que se veía

Consultando el **22/07/2026**, cód. **2149** (veh. 544):

| Dónde | Timbradas CU |
|---|---|
| Tabla verde (consulta del cierre GEMA) | **273,80** ❌ |
| Detalle por ruta (referencia) | 242,48 |
| GEMA (prom. 61 × 4 viajes) | **≈ 244** ✅ |

### Diagnóstico

El ajuste de la mañana ("caso 1") cambió la derivación de la TIMB. CU a
`bruto ÷ tarifa`, usando la columna `bruto` que sincroniza GEMA. Al verificar
contra la base de datos resultó que **ese `bruto` es un valor GRUPAL**, no el
bruto individual del conductor: es un monto fijo por viaje que comparten
decenas de conductores distintos (p. ej. el 16/07 hay conductores con 5, 4 y
3 viajes y brutos de $1.024.580, $819.664 y $614.748 = **$204.916 × viajes**
en todos los casos).

Se revisaron los **1.000 cierres del 16 al 23 de julio**: en el 100 % de las
filas `bruto ÷ tarifa` no cuadra con lo liquidado (queda ~10 % inflado).

### Solución

La TIMB. CU vuelve a derivarse **del salario liquidado**, como el 24-jul:

```
TIMB. CU = salario bruto día ÷ %pago ÷ tarifa   (acumulando todos los decimales)
```

Verificado contra la base:

| Caso | Antes | Ahora | GEMA |
|---|---|---|---|
| Cód. 2149 — 22/07 | 273,80 | **244,20** | prom 61 × 4 ≈ 244 ✅ |
| Cód. 2783 — 22/07 (validado con el Excel) | 256,27 | **244,82** | 244,82 ✅ dígito a dígito |
| Cód. 2149 — rango 16 al 23/07 | 1.208,29 | **1.081,23** | lo liquidado ✅ |

La columna **BRUTO** sigue mostrando el valor de la base de GEMA tal cual
(eso sí quedó bien en el cambio de la mañana).

> **Nota:** el detalle por ruta de abajo puede seguir difiriendo en decimales
> (p. ej. 242,48 vs 244,20): es la **referencia** del cálculo con nuestra
> partición superior/inferior, que puede variar levemente frente a la de
> GEMA. El valor oficial siempre es el de la tabla verde (cierre), y la
> pantalla lo aclara.

---

## Reclamo 2 — "En rango de más de un día no sale la venta por ruta"

### Lo que se veía

Consultando **16/07 al 23/07** aparecía la tabla verde del cierre, pero
ningún bloque de **detalle por ruta**.

### Diagnóstico

No era un error de datos: el detalle estaba **deshabilitado a propósito** en
rango, porque la partición SUPERIOR/INFERIOR de GEMA es diaria y no estaba
definido cómo agregarla.

### Solución

Nueva función `getRendimientoRango`: el detalle se calcula **día por día**
(cada día con su propia partición y su propio promedio de segmento, igual
que liquida GEMA) y se **suman** los resultados por ruta/flota y conductor:

- Columnas: Vjs R, Vjs L, Timb. IND y **Timb. CU** (suma de las CU diarias).
- En rango **no** se muestra la división superior/inferior (solo tiene
  sentido por día) y el filtro de segmento se oculta.
- La nota de la pantalla aclara: *"cada día se calcula por separado y se
  suma"*.

Probado con el rango exacto de la captura (16–23 jul): el cód. 2149 aparece
en **EXPRESS · GN** con sus 21 viajes en los vehículos 514 y 544
(Timb. IND 1.096 · Timb. CU 1.031,73 de referencia; la oficial del cierre
es 1.081,23).

---

## Reclamo 3 (14:53) — "Timbradas CU no coinciden" (detalle vs tabla)

### Lo que se veía

Cód. **2584** del **23/07**: tabla verde CU **170,32**, detalle por ruta
**126,26** (Timb IND 127).

### Diagnóstico

El 170,32 **sí es lo que GEMA liquidó** (85,16 timb/viaje × 2). GEMA tiene
varios modos de liquidar según el tipo de cierre:

- `CU (RUTAS,GRUPOS,PROM)` → paga cerca del promedio propio/segmento del
  conductor (así fue el 22/07).
- `CU (RUTAS,GRUPOS)` → paga al **promedio de la RUTA**: el 23/07, 2584
  (prom propio 63,5) y 2783 (prom propio 84,7) rodaron la misma ruta y
  ambos quedaron liquidados a 85,16 timb/viaje.

Nuestra reconstrucción superior/inferior desde los viajes nunca va a cuadrar
con todos los modos de GEMA.

### Solución

Cuando hay cierre, el **detalle por ruta se reagrupa del propio cierre**
(cada fila de `cierres_diarios` trae la ruta): Vjs, Timb IND y TIMB. CU del
detalle son los valores liquidados → **coinciden dígito a dígito** con la
tabla principal. Verificado: diferencia 0,00 entre tabla y detalle en los
120 conductores del 23/07 (2584 ahora muestra 170,32 en ambas). La
reconstrucción con partición superior/inferior queda solo para el modo
ESTIMADO (día sin cierre de GEMA), que es donde aplica.

---

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `src/lib/devengados/rendimiento.ts` | CU derivada del salario; `getRendimientoRango` (cálculo diario agregado) |
| `.../simulador/page.tsx` | Carga el detalle también en rango |
| `.../simulador/rendimiento-client.tsx` | Segmento "RANGO" sin sub-encabezado, filtro de segmento oculto en rango, notas actualizadas |
| `docs/cambios-2026-07-27.md` | Puntos 5 y 6 (correcciones de la tarde) |

**Verificación:** `tsc --noEmit` y ESLint sin errores; fórmulas contrastadas
contra `cierres_diarios` y `viajes_recaudados` en la base real.
