# Sincronización de MGX

MGX es el ERP del grupo: contabilidad, nómina e inventarios. Nos entregó un
usuario de **solo lectura** sobre su base ETL (`etl_00027`, PostgreSQL 17), que
replica cada noche a las **2:00 am**. Gestivo copia esa base en tablas propias
(`mgx_*`) para poder cruzarla con lo demás.

- **Pantalla:** Tesorería › Parámetros › «Sincronización con MGX» (solo administrador).
- **Consola:** `npm run mgx:sincronizar`.
- **Código:** `src/lib/mgx/`.

## Qué se copia

MGX organiza la base en un esquema por empresa y módulo: `emp{N}co` (contable),
`emp{N}no` (nómina), `emp{N}in` (inventarios) y `emp{N}rh` (empleados).

| Empresa | Código | Módulos |
|---|---|---|
| MET. TRANSP. LA CAROLINA SAS | `emp0` | co, no, in, rh |
| ANAYA GIRALDO S.A.S. | `emp2` | co, no, rh |
| NORMA SOFIA GIRALDO DE ANAYA | `emp3` | co, no, rh |
| SISTEMA METROPOLITANO DE RECAUDO S.A.S. | `emp8` | co, no, rh |
| WILFRED SMITH ANAYA ORTEGA | `emp10` | co (vacío) |
| SISTEMAS PRACTICOS SAS | `emp11` | co, no, rh |
| COMERCIALIZADORA Y DISTRIBUIDORA EL TAMARAL S.A.S. | `emp12` | co (vacío) |

El documento de MGX nombra **vistas** (`vemp0comovimientos`, `nomina`, …), pero
se copian las **tablas base** que hay debajo. La razón es práctica: las tablas
tienen `ide` (único, creciente en el tiempo) y fecha de edición, y con eso se
puede traer cada noche solo lo nuevo. Las vistas no tienen ninguna de las dos
cosas: `vemp0comovimientos` son 16 millones de filas que habría que releer
enteras cada vez.

- **31 tablas espejo**, una por tabla base: `mgx_<módulo>_<tabla>`, por ejemplo
  `mgx_co_cuerpo`. Cada una tiene las filas de **todas las empresas**, con una
  columna `empresa` (`emp0`…`emp12`) y la llave primaria `(empresa, ide)`. Si una
  columna existe solo en algunas empresas (`co.cuerpo.cantidad`), está en el
  espejo y vale NULL en las demás.
- **10 vistas** con los nombres del documento de MGX: `mgx_v_co_movimientos`,
  `mgx_v_co_cabeza`, `mgx_v_co_cuerpo`, `mgx_v_co_pri_cos`, `mgx_v_co_pri_cta`,
  `mgx_v_co_pri_ter`, `mgx_v_no_nomina`, `mgx_v_in_catalogo`, `mgx_v_in_bodegas`
  y `mgx_v_in_unidades`. Tienen la misma definición que en MGX, más `empresa`.
  `mgx_v_in_catalogo` cruza con LEFT JOIN: en MGX `vcatalogo` sale **vacía**,
  porque La Carolina no tiene líneas cargadas y la vista usa INNER JOIN.
- **`mgx_tablas`**: una fila por par (empresa, tabla), 109 en total. Guarda la
  estrategia, hasta dónde llegó y cómo terminó la última vez.
  `activa = false` saca un par de las corridas.
- **`mgx_corridas`**: la bitácora, una fila por corrida.

### Cómo llegan los datos

- **Textos sin relleno.** MGX guarda los `varchar` con espacios a la derecha y
  compara siempre con `rtrim`. El espejo los guarda sin esos espacios, así que
  las comparaciones son igualdades simples.
- **Fechas centinela en NULL.** «Sin fecha» en MGX es `0001-01-01`,
  `0100-01-01` o `1001-01-01`. Cualquier año anterior a 1900 queda NULL.
- **Números y fechas exactos.** Los numéricos viajan como texto, así que no se
  pierden decimales en los saldos. Las horas son las de MGX, en hora de Colombia
  y sin zona.
- **`llave_doc`.** Cabezas y cuerpos tienen esta columna generada,
  `ano|per|tip|num`, por la que cruzan.
- **`empresa_mgx`.** `rh.pri_epl` trae una columna `empresa` propia; en el espejo
  se llama `empresa_mgx`.

## Cómo se sincroniza cada tabla

La estrategia se decide al generar la migración, a partir de las columnas y el
tamaño de cada tabla, y queda en `mgx_tablas.estrategia`. **Se puede cambiar a
mano** en esa columna sin desplegar nada.

| Estrategia | Para qué | Cómo |
|---|---|---|
| `reemplazo` | Lo chico (< 50.000 filas): maestros, `pri_*`, y las empresas pequeñas | Borra las filas de esa empresa y las vuelve a cargar enteras. Refleja también lo que MGX borró. |
| `incremental_edicion` | Cabezas grandes (`emp0co.cabeza`, `emp8co.cabeza`, `emp0in.cabeza`) | Trae las filas con `ide` mayor que el último, y después las editadas, por `fhedicion` desde la última marca menos 24 horas. |
| `incremental_documento` | Cuerpos grandes (`co`, `no` e `in`) | Trae las filas con `ide` nuevo. Además vuelve a traer **enteros** los documentos cuya cabeza se editó: los borra y los inserta otra vez, así también desaparecen los ítems que MGX quitó. |

La primera vez cualquier tabla se trae completa. La marca de edición se fija en
la hora de MGX al **empezar**, y lo que se edite durante una carga larga lo trae
la corrida siguiente.

El progreso se guarda **después de cada lote**. Si una corrida se corta (se
acaba el tiempo, se cierra la pantalla o se cae la red), la siguiente sigue
desde donde quedó. La pantalla y la consola usan el mismo motor y continúan la
una el trabajo de la otra.

**Lo que el incremental no ve: los borrados.** Si MGX borra un documento entero,
su cabeza y su cuerpo se quedan en Gestivo hasta la reconciliación (más abajo).
Las tablas con `reemplazo` no tienen este problema.

### Estados en la pantalla

| Estado | Qué significa |
|---|---|
| **nunca** | No se ha sincronizado. |
| **al día** | La última corrida terminó bien. |
| **a medias** | Se acabó el tiempo del paso. La próxima corrida sigue desde ahí. |
| **sincronizando** | Hay una corrida trabajando en ella ahora. |
| **interrumpida** | Decía «sincronizando», pero lleva más de 15 minutos sin moverse: la corrida se cortó. La próxima la retoma. |
| **error** | Falló. El detalle aparece al pasar el mouse. Las demás tablas siguen. |
| ⚠ | MGX tiene columnas que el espejo no. Ver «Cuando MGX cambie sus tablas». |

Si dos corridas trabajaran a la vez se pisarían las marcas. Por eso, una corrida
activa (con señales en los últimos 15 minutos) **bloquea** otra, venga de la
pantalla o de la consola.

## Instalación

1. Variables en `.env.local` (y en Vercel): `MGX_DB_HOST`, `MGX_DB_PORT`,
   `MGX_DB_USER`, `MGX_DB_PASSWORD`, `MGX_DB_NAME` y `MGX_DB_SSL`. Las opcionales
   están documentadas en `.env.example`.
2. Aplicar la migración `supabase/migrations/20261021193546_tablas_espejo_de_mgx.sql`
   en el SQL Editor, entera y de una sola vez. Es idempotente.
3. **Prueba chica**: `npm run mgx:sincronizar -- --empresa=emp3`. Son unas 100 mil
   filas y tarda pocos minutos. Revisar en la pantalla que todo quede «al día».
4. **Carga grande**, por consola y en una ventana que pueda quedar abierta:
   - `npm run mgx:sincronizar -- --empresa=emp0 --modulo=co --tabla=cuerpo`
     (16,2 millones de filas, del orden de una hora);
   - luego `npm run mgx:sincronizar` para todo lo demás.
5. De ahí en adelante, la pantalla. Lo diario son unos cientos de documentos y
   tarda segundos.

**Espacio en disco.** El cuerpo contable de La Carolina ocupa del orden de
**6 a 8 GB** en Supabase, con sus tres índices. Conviene revisar el espacio
libre del servidor antes de la carga grande.

## Uso desde la pantalla

Se elige qué sincronizar:

- **Empresa**: todas o una.
- **Módulo**: todos o uno.
- **Tabla**: todas o una. Se puede elegir después de elegir el módulo.

**Sincronizar** trabaja por pasos de unos 3 minutos y vuelve a llamar sola hasta
terminar. **Detener** corta al terminar el paso en curso, sin perder lo hecho.
Cada corrida queda en Tesorería › Auditoría como «Sincronización MGX».

## Reconciliación de borrados (mensual)

```
npm run mgx:sincronizar -- --reconciliar --solo-informe    # cuenta, no borra
npm run mgx:sincronizar -- --reconciliar                   # borra lo que MGX ya no tiene
```

Compara los `ide` del espejo con los de MGX por rangos y borra los que sobran.
Tiene el mismo freno que el espejo de GEMA: si habría que borrar más del 10 %
de una tabla, no borra nada y lo informa.

## Cuando MGX cambie sus tablas

La migración la **genera** `scripts/mgx-generar-migracion.mts` a partir del
esquema de MGX, y una migración aplicada no se edita. Si MGX agrega columnas
(la pantalla lo avisa con ⚠):

```
npm run migracion:nueva -- "columnas nuevas de mgx"
npm run mgx:generar-migracion -- supabase/migrations/<archivo>.sql
```

Todo lo generado es `IF NOT EXISTS` / `OR REPLACE`, así que la migración nueva
solo agrega lo que falte. **Nunca borra columnas ni cambia tipos.** Si MGX
cambia el tipo de una columna, el generador se detiene y hay que decidir a mano.

Una tabla nueva en MGX hay que agregarla a `TABLAS` en `src/lib/mgx/catalogo.ts`
antes de generar.

## Cosas que hay que saber

- **Lo de hoy llega mañana.** MGX replica a las 2:00 am, y antes de esa hora la
  base ETL no tiene lo que se registró en el día.
- **`fhedicion` solo es fiable para lo reciente.** 200 mil cabezas contables
  tienen la fecha centinela. Por eso la primera carga va por `ide` y la edición
  se mira solo hacia adelante.
- **`no.cuerpo.fhe` no se actualiza desde 2016** y `rh.pri_epl.fhe` es
  centinela: ninguna de las dos sirve como marca (ver `EDICION_NO_FIABLE`).
- **1.149 filas de `emp0co.cuerpo` no tienen cabeza** en MGX. Se copian igual,
  pero no salen en `mgx_v_co_movimientos`, que cruza con la cabeza, igual que la
  vista de MGX.
- **La llave de documento de MGX no tiene separador**
  (`rtrim(ano)||rtrim(per)||rtrim(tip)||rtrim(num)`), así que dos documentos
  podrían dar el mismo texto. Se usa solo para aprovechar el índice de MGX; lo
  que llega se filtra con `llave_doc`, que sí tiene separador.
- **Una corrida grande no cabe en una función de Vercel** (300 s). Por eso la
  pantalla trabaja por pasos y la carga inicial se hace por consola.
- Las tablas `mgx_*` solo las lee y escribe `service_role`. No están expuestas
  en la API de datos ni en el MCP.
