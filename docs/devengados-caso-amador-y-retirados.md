# Devengados — caso AMADOR, retirados y solicitudes de contabilidad

**Fecha:** 22-jul-2026
**Contexto:** consultas de Néstor Molina (tesorería) y de la persona de
contabilidad, por WhatsApp (4 audios + 2 imágenes).

---

## Transcripción de los audios

**Audio 11:16** — *"En Análisis Quincenal hay que colocar una segmentación por
fecha para que ella pueda ver la producción acumulada día a día, porque hoy no
lo puede ver. Eso le dificulta cuadrar el movimiento que viene desde cierre de
LM a Gestivo. Mostrar por fecha cuánto es la producción acumulada, porque ese es
el valor que es la base para liquidar todo."*

**Audio 15:48** — *"A los que ya desactivaron porque se retiraron, aquí no me
los están mostrando, para revisar qué se les ha pagado… Y ese caso que te mandé:
hay dos días que le pagaron, el tercer día no le alcanzó el producido y aún así
sigue pendiente… según eso le deben entregar 4.789 pero el día anterior quedó
con un pendiente de 16 mil, entonces ¿dónde se lo descuenta? Porque en el 20
parece que no se lo está descontando."*

**Audio 17:34** — *"La presentación de la información no está mostrando el pago.
¿Existe manera de reconfigurar esa parte donde vea el pago dentro de la
operación? O sea, cuando muestre el detalle de cada [conductor], ver el pago que
se hizo."*

**Audio 18:36** — *"El tema de los retirados lo veo bien, la solución está bien.
Pero no veo la solución de lo otro: verificar el saldo en pantalla. Que cuando
yo verifique no se meta el saldo, sino que haya una transacción que me muestre
el saldo."*

---

## 1. Caso AMADOR BARAJAS WILMER — el "$16" SÍ se descuenta (no es error)

**Cédula:** 72245229 · **Quincena:** 2026-07 Q2 · **Base diaria:** $85.000

Néstor cree que el déficit de $16 mil del día 18 **no se está descontando** en
el 20. **Sí se descuenta** — pero se descuenta el **18**, no el 20. Por eso al
mirar solo el día 20 parece que falta.

### Cómo se libera el excedente (corte a corte)

El sistema no suma "excedentes por día" sueltos. Usa **producción acumulada −
base acumulada**. La base acumulada cuenta **$85.000 por cada día**, haya
producido o no. Así, un día flojo entra completo en la base y **jala hacia abajo**
el excedente liberado:

| Día | Producción | Prod. acum | Base acum | **Liberado acum** | Δ del día |
|-----|-----------:|-----------:|----------:|------------------:|----------:|
| 16  |   $121.234 |   $121.234 |   $85.000 |         $36.234   | +$36.234  |
| 17  |   $143.983 |   $265.217 |  $170.000 |         $95.217   | +$58.983  |
| 18  |    $68.855 |   $334.072 |  $255.000 |         $79.072   | **−$16.145** |
| 20  |    $89.789 |   $423.861 |  $340.000 |         $83.861   | +$4.789   |

**El déficit del 18 ($85.000 − $68.855 = $16.145) es exactamente la CAÍDA del
liberado del 17 al 18** ($95.217 → $79.072). Ahí ya quedó descontado.

### Por qué no se ve en el 20

Del 18 al 20 el liberado **sube** $4.789 (el excedente del día 20). El descuento
del déficit ocurrió un corte antes. Si se volviera a restar el $16.145 en el 20,
se estaría **descontando dos veces**.

### La cuenta final

```
Excedente días buenos (16+17+20)   $100.006
Déficit del 18                      −$16.145
--------------------------------   ---------
Liberado neto de la quincena         $83.861
Entregado (16-jul 36.234
           + 18-jul 42.838)          $79.072
--------------------------------   ---------
Pendiente por pagar                   $4.789   ✅
```

**Conclusión:** el sistema está bien. Se le debe pagar **$4.789** y el déficit de
$16.145 ya está absorbido (descontado el 18). Es un tema de **explicación**, no
de corrección.

> El pago del 18 ($42.838) confirma que el sistema hizo lo correcto: aunque el 17
> "autorizaba" $58.983, la caja pagó solo $42.838, porque el déficit del 18 ya
> había reducido el acumulado. La diferencia $58.983 − $42.838 = **$16.145** es,
> otra vez, el mismo déficit.

---

## 2. Retirados no aparecen (APROBADO por Néstor) — ajuste en código

### Problema

El Análisis Quincenal arma la lista de conductores **solo desde la producción
(cierres)**. Un **retirado que ya no produce pero que recibió pago** no tiene
cierres → **desaparece del análisis** y con él lo que se le entregó.

### Dónde

`src/lib/devengados/data.ts`, `getAnalisisQuincena` (~línea 416):

```js
for (const e of entRows ?? []) {
  const acc = porConductor.get(e.cedula_conductor);
  if (acc) acc.entregado += Number(e.valor_entregado ?? 0);
  //  ^^^ si no tiene cierres, no está en el mapa y su entregado se descarta.
}
```

### Solución

Si el conductor de una entrega **no existe** en el mapa, **crear su fila**
(producción $0, nombre/código de la entrega) en vez de descartarlo. Aparecería
con producción $0 y su entregado visible, para ver qué se le pagó y si quedó
**sobregirado**.

- No cambia ningún número de los que ya aparecen.
- Sin migración de base de datos.
- Estado hoy: los 92 conductores con pago están ACTIVO, así que aún no se pierde
  plata en los totales, pero el defecto es real y hay que cerrarlo.

---

## 3. Producción acumulada día a día en el Análisis (nueva petición)

**Audio 11:16.** Contabilidad necesita ver, por conductor, la **producción
acumulada día por día**, porque ese es el valor base para liquidar y para cuadrar
contra el cierre de GEMA/LM. Hoy el Análisis muestra solo el total por conductor,
no el desglose por fecha.

**Nota:** la pantalla de **Caja** ya muestra ese desglose diario (columna "PROD.
ACUMULADA") al buscar un conductor. La petición es tenerlo también accesible
desde el **Análisis Quincenal**, que es donde trabaja contabilidad.

---

## 4. Ver el pago y el saldo en el detalle del conductor (nueva petición)

**Audios 17:34 y 18:36.** Al abrir el detalle de un conductor, contabilidad
quiere ver **el pago (la entrega) que efectivamente se hizo** y que el **saldo**
aparezca respaldado por una **transacción/movimiento**, no como un número suelto
en pantalla.

Hoy el detalle diario muestra el "entregar hoy" **teórico**, pero no lista las
**entregas reales** (fecha, valor, cajero). Se pide agregar esos movimientos.

### Propuesta unificada para 3 y 4: "Estado de cuenta del conductor"

Un detalle por conductor (extracto / kardex) que, día a día, muestre en una sola
tabla:

| Fecha | Producción | Base | Prod. acumulada | Liberado acum | **Pago real (entrega)** | **Saldo** |
|-------|-----------|------|-----------------|---------------|-------------------------|-----------|

- Resuelve **producción acumulada día a día** (columna 4).
- Resuelve **ver el pago dentro de la operación** (columna 6: las entregas
  reales con su fecha y valor).
- Resuelve **saldo respaldado por transacción** (columna 7: saldo corriente =
  liberado − entregado hasta esa fecha, renglón por renglón).
- Es la vista con la que contabilidad puede **cuadrar contra GEMA** sin pedir
  soporte.

---

## Resumen ejecutivo

| # | Tema | ¿Error? | Acción |
|---|------|---------|--------|
| 1 | "Los $16" de AMADOR | **No** | Explicar: el déficit del 18 ($16.145) ya se descuenta el **18** (el liberado baja de $95.217 a $79.072), no el 20. Pendiente correcto: **$4.789**. |
| 2 | Retirados no aparecen | Sí (latente) | `getAnalisisQuincena`: incluir conductores con entregas aunque no tengan cierres. **Aprobado.** |
| 3 | Prod. acumulada día a día | Mejora | Desglose diario en el Análisis (ya existe en Caja). |
| 4 | Ver pago y saldo en el detalle | Mejora | "Estado de cuenta" por conductor: producción diaria + entregas reales + saldo corriente. |

**Orden sugerido:** 2 (aprobado, rápido, sin migración) → 4 (estado de cuenta,
que de paso cubre 3) → 1 es solo comunicación a contabilidad.
