# Análisis Quincenal — identificación de conductores RETIRADOS

**Fecha:** 23-jul-2026
**Origen:** audio de Néstor Molina (tesorería): *"¿Podría haber alguna forma de
identificar los que son retirados dentro del análisis quincenal? Porque no logro
determinarlo… llega información de un día posterior, encuentro que no trae
datos, y no veo si está retirado o no."*
**Antecedente:** `docs/devengados-caso-amador-y-retirados.md` (punto 2): los
retirados con pago ya se incluyen en el análisis, pero quedaban indistinguibles
de un activo sin producción.

---

## 1. El problema

El Análisis Quincenal arma sus filas desde dos fuentes: los **cierres de
producción** (GEMA) y las **entregas** (pagos de caja). Ninguna de las dos dice
si el conductor sigue vinculado. Resultado: una fila con producción $0 y pago
registrado podía ser…

- un **retirado** al que se le pagó su liquidación de excedentes, o
- un **activo** cuya producción aún no llega (GEMA reporta con atraso).

…y en pantalla se veían idénticas. Tesorería no tenía forma de decidir si esa
fila era un caso a revisar o solo un atraso de datos.

## 2. Cómo se abordó

El dato ya existía: la maestra `conductores` tiene las columnas **`estado`**
(`ACTIVO` / `RETIRADO`) y **`fecha_retiro`**, alimentadas por el módulo de
Rotación. La solución fue **cruzar** las cédulas del análisis contra esa maestra
en el servidor, sin tocar la base de datos (cero migraciones) y sin alterar
ningún número calculado — es un dato informativo que viaja junto a cada fila.

### Cambio en datos — `getAnalisisQuincena` (`src/lib/devengados/data.ts`)

1. Se arma el mapa de conductores de la quincena como siempre (cierres +
   entregas).
2. Con las cédulas resultantes se consulta `conductores` **en lotes de 500**
   (límite prudente para el `IN` de PostgREST):

   ```ts
   const { data: conds } = await supabase
     .from("conductores")
     .select("cedula, estado, fecha_retiro")
     .in("cedula", cedulas.slice(i, i + 500));
   ```

3. Cada fila del análisis (`FilaAnalisis`) sale ahora con dos campos nuevos:

   ```ts
   export interface FilaAnalisis {
     cedula: string;
     codigo: string | null;
     nombre: string | null;
     retirado: boolean;        // ← estado === "RETIRADO" en la maestra
     fechaRetiro: string | null; // ← fecha_retiro (YYYY-MM-DD) o null
     resumen: ResumenQuincena;
   }
   ```

**Caso borde:** filas viejas de cierres sin cédula se agrupan por código de
conductor y no cruzan con la maestra. Para ellas `retirado` queda en `false` y
**no se pinta chip**: no se afirma nada que no se sepa.

### Cambio en pantalla — `analisis-client.tsx`

- **Chip "RETIRADO dd/mm/aaaa"** (ámbar) junto al nombre del conductor, con la
  fecha de retiro si la maestra la tiene.
- **Checkbox "Solo retirados (N)"** junto a "Solo alertas", con el conteo de la
  quincena. Se combina con los demás filtros (búsqueda, estado, alertas).

### Cambio en reportes

| Reporte | Qué se agregó |
|---|---|
| **Cruce producción (Excel)**, hoja "Producción por conductor" | Columna **"Situación"** (`ACTIVO` / `RETIRADO dd/mm/aaaa`), en negrilla ámbar si es retirado. |
| **Entrega (Excel)** | Misma columna "Situación" entre Nombre y Disponible. |
| **Reporte de entrega (PDF)** | El nombre lleva el sufijo **"(RETIRADO dd/mm/aaaa)"** en negrilla. |

Los reportes respetan el filtro en pantalla: con "Solo retirados" activo, el
Excel/PDF sale solo con retirados.

## 3. Cómo se usa

**Caso típico de tesorería** — "llegó información de un día posterior y esta
fila no trae datos, ¿está retirado?":

1. Entrar a **Tesorería → Devengados → Análisis quincenal**.
2. Buscar al conductor (nombre, cédula o código). Si junto al nombre aparece el
   chip ámbar **RETIRADO**, está desvinculado desde la fecha que indica el chip;
   si no aparece, está activo y lo más probable es que su producción venga con
   atraso de GEMA.
3. Para revisar **todos** los retirados de la quincena de una vez: marcar el
   checkbox **"Solo retirados"**. La tabla queda solo con ellos y se puede ver
   qué se les pagó (columna Entregado) y si quedaron sobregirados
   (Entregado > liberado ⇒ estado "Retenido – déficit").
4. Para soporte fuera de pantalla: exportar **Entrega (Excel)** o **Cruce
   producción (Excel)** — la columna "Situación" viaja en el archivo — o
   imprimir el **Reporte (PDF)**.

**Para el desarrollador** — la función se consume igual que antes:

```ts
const { baseDiaria, quincena, filas } = await getAnalisisQuincena("2026-07-20");
// filas[i].retirado    → true si la maestra lo marca RETIRADO
// filas[i].fechaRetiro → "2026-07-15" | null
```

No hay parámetros nuevos ni migraciones. Cualquier pantalla futura que use
`FilaAnalisis` recibe la situación sin trabajo adicional.

## 4. Qué NO cambia

- Ningún cálculo de la quincena (producción, base, liberado, disponible,
  entregado): el cruce es solo informativo.
- El origen del estado sigue siendo la maestra de `conductores` (Rotación); el
  análisis no marca ni desmarca retirados, solo lo refleja.

## 5. Verificación (23-jul-2026)

- `tsc --noEmit` sin errores.
- Cruce probado contra la base real: 95 conductores con pago en Q2 de julio,
  los 95 existen en la maestra y hoy **0** están retirados (coincide con lo
  reportado el 22-jul: "los 92 conductores con pago están ACTIVO"). El chip
  aparecerá automáticamente cuando Rotación marque el retiro.
