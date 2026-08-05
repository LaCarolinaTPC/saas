# Informe · Liquidación consolidada del conductor

**Fecha:** 5 de agosto de 2026
**Solicitado por:** Nestor Molina Salazar / Helmut (reunión del 29-jul-2026, Fathom)
**Implementado por:** Victor Sandoval
**Resumen:** Nuevo reporte `/liquidacion` — una sola línea por día con su saldo neto, transacciones explícitas de **Retiro** y el **Disponible** del rango destacado. Consulta solo por código de conductor, con fecha inicial y final, "adicional, igual como el de rendimiento".

---

## El problema

El reporte actual muestra demasiado detalle y los conductores no lo asimilan: "mirar arriba, visualizar abajo el detalle… se confunden entre qué es esto y qué es lo otro". Además el sistema **netea los pagos sin mostrarlos**, lo que genera la pregunta típica: "ayer mi saldo era 60 y hoy es 20, ¿por qué?". Nestor termina armando a mano en Excel un consolidado por día con las columnas de saldo y las filas de retiro (mockup `vstLiquidaciones72002779 (49).xlsx`).

## La solución

Nueva pantalla **Liquidación conductor** (`/liquidacion`):

- **Una línea por día**: todas las rutas y vehículos del día sumados (mismo porcentaje de pago). Cada fila muestra Fecha, Tipo de cierre, Viajes, Timb. CU, Bruto día, Ahorro, Neto día, Base, Saldo del día y Saldo corriente. La fila se expande para ver el detalle por ruta/vehículo (el detalle no desaparece, pero deja de ser lo primero que se ve).
- **Retiros visibles**: cada pago vigente (DÉBITO activo de `devengados_entregas`) aparece como fila propia resaltada en ámbar, con su fecha y monto en negativo, restando del saldo corriente.
- **El "grueso" destacado**: tarjeta grande con el **Disponible** del rango (verde) o el **Saldo pendiente/deuda** (rojo), junto a Producción neta, Base del período y Retiros.
- **Consulta solo por código** (coincidencia exacta, misma regla de `/rendimiento`) + rango de fechas; por defecto la quincena en curso hasta hoy. Sin listado inicial.
- **Homologación de tipos de cierre** (leyenda del Excel de Nestor, solo en presentación): `CU (RUTAS,GRUPOS)` → **CU Rutas**, `CU (…,PROM)` → **CU promedios**, `SEGURRUTAS…` → **Caja Única**, `INDIVIDUAL` → **Individual**.
- **Exportación a Excel** con el mismo layout (filas de retiro intercaladas, saldo final coloreado), registrada en la bitácora de reportes.

## Aritmética (mockup de Nestor)

```
saldo del día   = neto día − base diaria     (base solo en días con producción)
saldo corriente = Σ saldos de día − Σ retiros hasta esa fecha
saldo final     = con signo: positivo = disponible, negativo = deuda
```

A diferencia del disponible de caja (motor de devengados, piso 0 y regla de oro), aquí el saldo es aritmética simple con signo: es una **vista explicativa**, no habilita pagos.

## Fuente de datos

- `cierres_diarios` (procedimiento `pa_ext_get_IngresoConductorByFecha` de GEMA). El conteo de viajes es el campo **`viajes`** — el que admite decimales `.5` (medio viaje del conductor), confirmado en la reunión como el "Viajes C"; **no** `viajes B` (enteros, del propietario). Ya estaba sincronizado: no hizo falta migración de datos.
- `devengados_entregas` (DÉBITO, estado activa) para los retiros, cruzando el código con la cédula del cierre o de la maestra de conductores.
- Timb. CU derivada del salario liquidado, misma función del simulador (`timbCuDeFila`), validada contra GEMA.

## Permisos

Patrón de `/rendimiento`: módulo propio **`liquidacion`**, concedido tipo a tipo (nunca por defecto). La migración `044_modulo_liquidacion_conductor.sql`:

1. Agrega el módulo al tipo `admin`.
2. Crea el rol restringido **`liquidacion_conductor`** que solo ve esta pantalla.

> **Pendiente de aplicar** en Supabase → SQL Editor (el archivo es idempotente). Sin ella, el admin no ve la entrada del menú y nadie más puede entrar (fail-closed).

## Archivos

| Archivo | Cambio |
|---|---|
| `src/lib/devengados/liquidacion.ts` | Nuevo: datos + consolidación por día + retiros + saldos |
| `src/app/(dashboard)/liquidacion/page.tsx` | Nueva página (guard por módulo, rango por defecto) |
| `src/app/(dashboard)/liquidacion/liquidacion-client.tsx` | Nueva UI: tabla, detalle expandible, tarjetas, export Excel |
| `src/lib/devengados/rendimiento.ts` | `timbCuDeFila` exportada (misma derivación) |
| `src/lib/devengados/actions.ts` | La bitácora de reportes acepta el módulo `liquidacion` |
| `src/lib/permissions-shared.ts` | Módulo `liquidacion` (labels, home, hrefToModule) |
| `src/lib/constants.ts` | Entrada "Liquidación conductor" en el menú |
| `supabase/migrations/044_modulo_liquidacion_conductor.sql` | Módulo para admin + rol `liquidacion_conductor` |
