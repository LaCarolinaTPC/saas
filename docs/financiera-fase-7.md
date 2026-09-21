# Financiera · Gestión de flota — Fase 7: histórico, cotejo y umbrales

**Plan:** `docs/Plan_desarrollo_financiera_GESTIVO.md`, sección 10 y sección 9, fase 7.
**Sin migración.** Escribe en `financiera_contable_mes` a través del cargador de la fase 4.
**Código:** `src/lib/financiera/historico.ts` (puro, 15 pruebas) ·
`scripts/financiera-historico.mts` · `scripts/financiera-recalibrar-umbrales.mts`.

## Estado: la herramienta está lista, faltan los datos

Todo lo que se podía construir y verificar sin el aplicativo de Lovable delante está hecho y probado.
Lo único que falta es **el volcado de `fleet_records`**, que solo puede conseguir el administrador del
aplicativo. Sin él no hay histórico que cargar ni paralela que correr.

Para conseguirlo, cualquiera de los dos caminos de la sección 10 del plan:

1. **Llave de la API.** Generar una llave activa en la pestaña API del aplicativo y ponerla en
   `.env.local` junto con la URL de la Edge Function `fleet-api`:
   ```
   FLOTA_API_URL=https://<proyecto>.supabase.co/functions/v1/fleet-api
   FLOTA_API_KEY=<la llave generada>
   ```
2. **Exportación a Excel** desde el propio aplicativo, y pasarla con `--excel`.

## Cómo se usa

```bash
# 1. Traer y revisar. No escribe nada.
npm run financiera:historico -- --api --cotejar

# 2. Generar el archivo de 8 columnas para cargarlo desde la pantalla
npm run financiera:historico -- --api --csv exports/contable-historico.csv

# 3. O cargarlo directo, con rastro en la bitácora
npm run financiera:historico -- --api --cargar
```

También acepta `--excel <archivo>`, `--json <archivo>`, `--periodo-desde` y `--periodo-hasta`.

**Del aplicativo solo se traen los seis rubros contables** (decisión 15 del acta): la parte operativa
ya está en el espejo y se consolidó en la fase 3. Las otras veinte columnas sirven para el cotejo.

## El cotejo, que es la mitad del valor

`--cotejar` compara las **doce medidas que Gestivo obtiene de GEMA** (viajes, timbradas, ingresos y los
nueve rubros de cartulina y descuento) con las que tenía el aplicativo, vehículo a vehículo y mes a mes,
con la tolerancia del acta (±1 COP por partida, ±0,01 puntos en rentabilidad). Si esas doce cuadran, las
dos herramientas están mirando la misma operación y entonces sí tiene sentido comparar la utilidad.

La utilidad y la rentabilidad **solo se cotejan donde Gestivo ya tiene los rubros contables**. Antes de
cargarlos, el informe lo dice en vez de fingir que cuadran.

Al final imprime el **criterio de aceptación del punto 12**: tres meses o más, cero diferencias, cero
filas sueltas en cualquiera de las dos herramientas y la utilidad cotejada en todas. Mientras no se
cumpla, lista exactamente qué falta.

## Verificación

No se puede probar contra el aplicativo sin sus datos, así que se probó con un volcado sintético armado
desde el consolidado real de junio a agosto de 2026 (`work/fin-simular-volcado.mts`), con rubros
contables inventados y **tres discrepancias metidas a propósito**:

| Lo que se inyectó | Lo que reportó el cotejo |
|---|---|
| +12.345 en `admon` de un vehículo | `2026-06 vehículo 1027: admon 695.615 vs 683.270 (Δ 12.345)` |
| Un vehículo que no existe en GEMA | `2026-06 vehículo 999999: solo en el aplicativo` |
| El vehículo que ese reemplazó | `2026-06 vehículo 1056: solo en Gestivo` |
| Una utilidad alterada | No se reporta, y el veredicto explica por qué: los 457 vehículo-mes «no se pudieron cotejar en utilidad» porque Gestivo aún no tiene sus rubros contables |

**455 de 457 vehículo-mes cuadraron exactamente** en las doce medidas de GEMA. Eso no es una prueba de
paridad con el aplicativo real, pero sí confirma que el cotejo compara lo que debe y que la
consolidación de la fase 3 reproduce las cifras de las que partiría el aplicativo.

El archivo generado se pasó por el cargador de la fase 4 en modo previsualización, sin escribir nada:
456 filas válidas, la del vehículo inexistente rechazada con su motivo, y el delta de utilidad por mes.
**Los tres meses estaban cerrados y sin archivo, así que la carga entra**: es exactamente el caso para
el que se ajustó la regla de meses cerrados en la fase 4. Con la regla literal del plan, migrar el
histórico habría exigido veinte reaperturas.

## Recalibración de umbrales

`npm run financiera:umbrales` mide la operación real y propone cortes. Corrido el 2026-09-21 sobre los
3.053 vehículo-mes de los 21 meses consolidados:

**Productividad (exacta, se puede decidir hoy).** Media de 75,3 viajes por vehículo-mes; mediana 80;
P75 86.

| Umbral | 🟢 | 🟡 | 🔴 |
|---|---|---|---|
| 90 / 80 (vigente, heredado) | 14 % | 38 % | 48 % |
| 85 / 70 | 33 % | 43 % | 24 % |
| 80 / 65 | 52 % | 30 % | 18 % |
| **85 / 76 (P70 / P35)** | **33 %** | **32 %** | **35 %** |

Con el umbral vigente casi la mitad de la flota está en rojo de forma permanente, que es tanto como no
tener semáforo. La propuesta 85 / 76 reparte en tercios y deja el verde en algo alcanzable pero exigente.
**La decisión es de Subgerencia Financiera**; se cambia en Parámetros sin tocar código.

**Rentabilidad y gasto por timbrada: todavía no se pueden recalibrar.** Sin el archivo contable la
rentabilidad que se ve es un techo (44,01 % ponderado) y el gasto por timbrada un piso (1.734 COP, el
56 % del ingreso por timbrada de 3.097 COP). Derivar umbrales de esas cifras los dejaría inservibles.
El script lo dice y no propone nada. Cuando el histórico esté cargado, el mismo comando los propone.

Sigue en pie la observación 6.3.1 del plan: los umbrales de gasto por timbrada están en pesos fijos y el
pasaje subió ~10 % en 2026, así que envejecen solos. Conviene decidir si se expresan como porcentaje del
ingreso por timbrada.

## Lo que falta para cerrar el módulo

1. **Conseguir el volcado** y correr el cotejo. Es lo único que bloquea.
2. **Cargar el histórico** y volver a correr `financiera:umbrales` para los otros dos indicadores.
3. **Aceptar la paralela** (punto 12): tres meses cerrados cuadrando al 100 % en utilidad neta. El
   script emite el veredicto; la aceptación es de negocio.
4. **Antes del apagado** (puntos 13 a 15, todos de negocio, ninguno de código):
   - mapear las 8 cuentas del aplicativo a tipos de usuario de Gestivo;
   - revisar en `external_api_keys` del aplicativo si alguien externo consume `fleet-api`;
   - respaldar `fleet_records` y `data_upload_audit` en `exports/`, dejar el aplicativo en solo lectura,
     avisar en su URL y dar de baja el proyecto.

La verificación de `DESPACHO` (fase 0) sigue esperando las credenciales de GEMA. Si apareciera en GEMA,
el rubro saldría del archivo contable y habría que rehacer el volcado con cinco columnas en vez de seis.
