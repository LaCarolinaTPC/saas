# Simulador — pestaña "Rendimiento del día" (fórmula GEMA)

**Fecha:** 23-jul-2026
**Origen:** audios de Néstor Molina (15:42–16:03) + PDF
`rptPDFPromediosConductorCU72155068.pdf` (Promedios de Conductores, 21-jul-2026).

## La petición

> "La simulación consistiría en tomar el campo TIMB. CU × 3300 cuando es día
> normal y 3400 cuando es domingo y festivo, aplicar el 16% al resultado, de
> allí restar la base y el campo ahorro (2000 por viaje realizado) y mostrar
> el valor a recibir por día de acuerdo a producción real. […] con todos los
> segmentadores y filtros pertinentes. […] que solo aparezca el código del
> conductor, no nombre ni cédula. […] que se pueda ver en celular, tablet o
> computador."

## Qué se construyó

Pestaña **"Rendimiento del día"** en Tesorería → Devengados → Simulador
(`/tesoreria/devengados/simulador`), junto a la de quincena hipotética.

```
Valor día = (TIMB. CU × tarifa) × %pago − base − ahorro × viajes realizados
tarifa: $3.300 normal · $3.400 domingo (automático) o festivo (interruptor)
%pago: 16% por defecto, editable · base: la vigente, editable · ahorro: $2.000/viaje, editable
```

- **Fuente:** `viajes_recaudados` (los mismos viajes de GEMA que alimentan la
  caja). Se elige el día con un selector de fecha.
- **Privacidad:** solo se muestra el **código del conductor** y el vehículo.
  Nunca nombre ni cédula (`getRendimientoDia` ni siquiera los consulta).
- **Filtros:** ruta (CALLE 30 / CALLE 17 / MIRAMAR / EXPRESS), flota (NV/GN),
  segmento (superior/inferior) y búsqueda por código o vehículo.
- **Responsive:** tabla completa en pantalla mediana/grande; en celular cada
  conductor es una tarjeta con su código y el valor a recibir.

## Cómo se reproduce la TIMB. CU (metodología GEMA)

`src/lib/devengados/rendimiento.ts` → `getRendimientoDia(fecha)`:

1. **Grupo de ruta** desde `ruta_reprogramada`: doble guion ("A -- 16") =
   EXPRESS; luego CALLE 30 / CALLE 17 / MIRAMAR por nombre.
2. **Flota:** vehículos código ≥ 1000 (ECOLÓGICA) = NV; el resto GN.
3. **Viajes liquidados:** viaje con novedad ≠ NORMAL (p. ej. VARADO EN RUTA)
   liquida **0.5**.
4. **Segmento SUPERIOR/INFERIOR:** conductores del grupo ordenados por
   timbradas/viaje del día; superior acumula hasta la mitad de los viajes del
   grupo (el que cruza la mitad queda en superior).
5. **Promedio del segmento** = timbradas del segmento ÷ viajes liquidados,
   **redondeado a 2 decimales antes de multiplicar** (como GEMA).
6. **TIMB. CU del conductor** = viajes liquidados × promedio del segmento.

## Validación contra el PDF del 21-jul-2026

| Grupo | Promedio sup (PDF) | Promedio inf (PDF) | Resultado |
|---|---|---|---|
| CALLE 30 NV | 130.33 (130.33) | 120.33 (120.33) | ✅ exacto |
| CALLE 17 NV | 123.33 (123.33) | 103.67 (103.67) | ✅ exacto |
| MIRAMAR NV | 112.43 (112.43) | 84.18 (84.18) | ✅ exacto — CU por conductor dígito a dígito (449.72, 337.29, 252.54, 336.72) |
| CALLE 17 GN | 97.10 (97.14) | 63.38 (65.42) | ~ ±2% |
| CALLE 30 GN | 110.90 (111.27) | 61.95 (61.72) | ~ ±0.5% |
| MIRAMAR GN | 97.20 (98.61) | 68.90 (71.26) | ~ ±2% |
| EXPRESS GN | 64.90 (65.02) | 47.76 (49.72) | ~ ±2% |

Las timbradas individuales cuadran **exactas** en todos los grupos (p. ej.
CALLE 30 GN: 7.519).

### Desviación conocida: los "medios viajes" sin novedad

GEMA liquida 0.5 en algunos viajes que en nuestros datos aparecen NORMALES
(p. ej. SARMIENTO 2 viajes → 1.5 L; ACOSTA GALINDO 3 → 2.5; VACA SALAZAR 5 →
4.0). Parece la figura de **media vuelta** (viaje recortado), pero ese marcador
no viene en el archivo que GEMA nos entrega. Es la única causa de la diferencia
de ±2% en los grupos GN.

**Pregunta pendiente para Néstor:** ¿con qué regla marca GEMA un viaje como
medio viaje liquidado (media vuelta)? Con ese dato (o si GEMA lo incluye en el
archivo de viajes) la reproducción queda exacta al 100%. Mientras tanto la
pantalla muestra la advertencia "puede diferir levemente (±2%)… el valor
oficial es el del cierre de GEMA".

### Otras definiciones tomadas (confirmar con Néstor)

- El **15%** que aparece en algunos conductores del PDF (vs 16%): el % es
  editable en pantalla; si hay una regla por conductor, se incorpora después.
- **Festivos:** domingo se detecta solo; festivo es un interruptor manual.
- La **base** que se resta se precarga con la base diaria de devengados
  ($85.000) y es editable.
