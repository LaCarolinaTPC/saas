# Financiera · Gestión de flota — Fase 4: carga del archivo contable

**Plan:** `docs/Plan_desarrollo_financiera_GESTIVO.md`, sección 6.6 (contrato del archivo) y sección 9, fase 4.
**Sin migración:** escribe en `financiera_contable_mes` y `financiera_cargas` (fase 2).
**Código:** `src/lib/financiera/archivo-contable.ts` (lectura y validación, puro) ·
`src/lib/financiera/cargar-contable.ts` (contexto real, escritura por lotes, reversión, plantilla Excel) ·
`src/app/api/financiera/contable/route.ts` (POST previsualizar / cargar) ·
`src/app/api/financiera/plantilla/route.ts` (GET csv | xlsx) ·
`src/app/(dashboard)/financiera/flota/datos/` (`carga-contable.tsx`, `reversar-boton.tsx`, acción `reversarPeriodo`).
**Pruebas:** `npm run test:financiera` (23 del motor + 15 del archivo).

## Cómo se usa

1. En **Financiera → Datos de flota**, descargar la plantilla (Excel o CSV). Ocho columnas obligatorias:
   `periodo` (AAAA-MM), `vehiculo` (código GEMA), `despacho`, `intereses`, `otros_gastos`, `repuestos`,
   `mano_de_obra`, `desc_fondo_conductor`, y dos opcionales desde 2026-09-21:
   `combustible_vehiculos_nuevos` y `poliza_vehiculos_nuevos`
   (ver `docs/financiera-conceptos-vehiculos-nuevos.md`). La hoja «Instrucciones» del Excel repite las reglas.
2. Elegir el archivo y **Previsualizar**. No escribe nada. Muestra, por período: estado del mes, filas
   válidas, nuevas y reemplazadas, rechazadas, vehículos con archivo antes → después, gastos contables
   antes → después y utilidad del mes antes → después. Debajo, cada fila rechazada con su línea y motivo,
   y cuántas celdas vacías se tomaron como 0.
3. **Confirmar carga.** El servidor vuelve a leer y validar el archivo (el estado de un mes pudo cambiar
   entre la vista previa y el clic), escribe por lotes de 500 con upsert por `(periodo, vehiculo)` y deja
   la operación en la bitácora con el resumen.
4. **Reversar** (columna final de la tabla de períodos): borra los seis rubros de todos los vehículos del
   mes; lo que vino de GEMA no se toca y el mes vuelve a «Sin archivo contable».

## Reglas del archivo (lo que el código fija)

| Regla | Comportamiento |
|---|---|
| Cabecera | Debe traer las ocho columnas, en cualquier orden. Se toleran mayúsculas, tildes, espacios y los nombres del Excel original (`DESPACHO`, `OTROS GASTOS`, `Mano de Obra`, `Desc. Fondo - conductor`, `VEHI.`). Si falta una: **archivo rechazado entero**. |
| CSV | UTF-8 (con o sin BOM), separador `;` o `,` detectado por la cabecera; con `;` la coma es decimal, con `,` lo es el punto. Comillas RFC 4180. |
| Excel | Primera hoja, cabecera en la fila 1. Fechas de celda en `periodo` se aceptan y se llevan al mes. |
| Período | `2026-03`, `2026-3`, `2026/03`, `03/2026`, `15/03/2026`, `marzo 2026`, `mar-26`, `202603`. Inválido: fila rechazada. **Período que no existe en el consolidado: archivo rechazado entero** (consolidar primero desde GEMA). |
| Vehículo | Código GEMA; se aceptan `500`, `0500` y `500.0`. Sin movimiento en GEMA ese mes: **fila rechazada, el resto entra** (acta, punto 6-bis). |
| Números | `1.234.567,89`, `1,234,567.89`, `$ 950.000`, negativos con `-` o entre paréntesis. **Vacío = 0** y se cuenta. Texto que no es número: fila rechazada. |
| Repetidas | Mismo vehículo y período dos veces en el archivo: se conserva la primera, la segunda se rechaza. |
| Idempotencia | Volver a cargar un mes reemplaza sus rubros contables y no toca `financiera_operativo_mes`. |
| Tamaño | Hasta 20.000 filas y 5 MB (un año de la flota son ~1.900 filas). |

## Períodos cerrados: la decisión que hubo que tomar

La sección 6.6 del plan dice que el período «no debe estar cerrado» y la sección 12 que un período
cerrado rechaza el archivo entero. Pero el cierre lo pone GEMA pocos días después de terminar el mes
(acta, punto 13) y contabilidad entrega los rubros después de eso: **con la regla literal el módulo no
podría recibir el archivo de ningún mes**, y la fase 7 (histórico contable de 20 meses ya cerrados)
sería imposible sin 20 reaperturas.

Lo implementado, con `REEMPLAZO_EN_CERRADO_EXIGE_REAPERTURA = true` en `archivo-contable.ts`:

- **Mes cerrado sin archivo contable → la carga entra.** No cambia ninguna cifra reportada: hasta ese
  momento el mes mostraba la rentabilidad como techo («≤»), no como dato.
- **Mes cerrado que ya tiene archivo → archivo rechazado entero**, con el aviso de pedir al
  administrador que lo reabra. Reversar en un mes cerrado también exige reapertura.
- **Mes reabierto → admite reemplazo y reversión**, y GEMA lo cierra otra vez en la siguiente corrida.

Esto conserva el propósito del cierre (que lo reportado no se mueva sin rastro) y deja el flujo natural
de contabilidad. Si se prefiere la regla literal, basta cambiar la validación para rechazar también el
primer archivo de un mes cerrado; las pruebas que la cubren están en `archivo-contable.test.ts`.

## Verificación

- 15 pruebas nuevas: CSV y `.xlsx` con el mismo contenido dan el mismo resultado; `;` con decimal coma y
  `,` con decimal punto; vacío → 0 y contado; vehículo inexistente → fila rechazada sin abortar; período
  inexistente y cerrado-con-archivo → archivo rechazado; reabierto → admite; repetidas; cabecera
  incompleta; la plantilla se lee con el propio lector.
- Carga real de prueba sobre 2026-09 (mes abierto) con un archivo de dos vehículos y una fila inválida:
  previsualización, confirmación, tabla de períodos con «Contable parcial (2/152)» y reversión, todo
  verificado contra la base y con la pantalla capturada a 1440 y 800 px (vista previa temporal bajo
  `/docs`, borrada antes del commit).

## Qué queda

- **Fase 5**: tablero, análisis y la pantalla de Parámetros con **reabrir período** (la función SQL y
  `reabrirPeriodo()` ya existen).
- **Fase 7**: volcar los 6 rubros históricos del aplicativo de Lovable con este mismo cargador (un CSV por
  año cabe holgado) y cotejar contra el aplicativo.
- La verificación de `DESPACHO` (fase 0) sigue esperando las credenciales de GEMA; si aparece en GEMA, la
  columna sale del archivo: quitar `despacho` de `RUBROS_ARCHIVO`, de la tabla y del motor.
