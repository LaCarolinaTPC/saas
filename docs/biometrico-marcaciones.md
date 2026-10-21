# Marcaciones del biométrico en Gestivo

El biométrico de la entrada (ZKAccess 3.5) registra cada huella válida en una
base Access del PC donde corre. Este módulo trae esas marcaciones a Gestivo para
que RRHH vea **cada día quién debía venir y no marcó**, y registre la novedad
desde ahí.

**Nada se crea solo.** Las rachas de descargos (4 días) y terminación (5) del
módulo de Ausentismo cuentan días **calendario**, así que convertir «no marcó» en
falta automática inventaría ausencias cada descanso y dispararía citaciones
falsas. La pantalla arma la lista; la decisión es de una persona.

Trabajo previo relacionado: [biometrico-identificacion.md](biometrico-identificacion.md),
que puso la cédula de Gestivo en el campo «N.º de identificación» del equipo. Sin
eso, atribuir una marcación a una persona exigiría adivinar por nombre.

## Cómo funciona

```
                                  PC de ZKAccess (red interna)        Gestivo (Vercel)
                                 ┌──────────────────────────┐        ┌──────────────────────┐
  MA500  ──TCP 4370, SDK──────►  │                          │        │ GET  /…/estado       │
  192.168.0.253                  │  Gestivo.AgenteBiometrico│ HTTPS  │ POST /…/marcaciones  │
  (guarda en su memoria)         │  .exe  (en la bandeja)   │ ─────► │                      │
         │                       │                          │        │ biometrico_marcaciones│
         │  descarga MANUAL      │   cede la conexión si     │        │ biometrico_personas  │
         └──► ZKAccess 3.5 ──►   │   Access.exe está abierto │        │ biometrico_envios    │
                  Access.mdb ──► │                          │        └──────────────────────┘
                                 └──────────────────────────┘         Ausentismo › Marcaciones
```

Gestivo está en internet y **no alcanza la red de la empresa**, así que el PC
empuja. Y lo hace por **dos vías a la vez**.

### Las dos vías

| | de dónde | cuándo llega | identidad de la huella |
|---|---|---|---|
| **equipo** | el lector, directo por el SDK de ZK | al instante, enviando cada ~60 s | `(device_sn, pin, momento)` |
| **Access** | `acc_monitor_log` del `Access.mdb` | cada 15 min, pero solo lo ya descargado | `acc_monitor_log.id` |

La vía Access existía primero y tiene un límite que no se puede quitar: esa tabla
**solo crece cuando alguien abre ZKAccess y descarga a mano**. Así que Gestivo iba
con horas o días de atraso y la pantalla de Marcaciones pasaba el día sin su
columna «Huella». La vía equipo arregla eso hablando con el lector; la de Access
se queda como **historia autoritativa** y como respaldo cuando el equipo o el PC
fallan.

**La misma huella llegada por las dos puertas es una sola fila.** La identidad
real de una huella es `(equipo, pin, momento)`:

- llega del equipo primero → fila nueva, `origen = equipo`, `id_zk` nulo;
- llega de Access después → **se le completa el `id_zk`** a esa misma fila, no se
  duplica. La respuesta del POST lo dice en `completadas`, que es la señal de que
  las dos vías están cruzando bien.

Por número de serie y **no** por `device_id`, que es justamente lo que cambia
cada vez que alguien vuelve a registrar el mismo lector en ZKAccess — y eso ya
pasó cuatro veces con este equipo, dejando 57.577 filas repetidas en el histórico.

Para que la llave colapse de verdad, las dos vías tienen que escribir la serie
**igual**. Desde el 2026-10-21 el servidor la guarda **sin espacios y en
mayúsculas**, y si una fila de la vía Access llega sin serie la completa con la
vigente de su `device_id` (migración `20261021144343`). El agente hace lo mismo
de su lado. El **pin no se toca**: en ZKAccess es texto, y «027» y «27» son dos
personas.

Cada vía se enciende por separado en Configuración. Lo normal es tener las dos
en el PC de ZKAccess; en **otro PC** de la red se puede correr solo la vía
equipo (ver «Instalar el agente en otro PC»).

### Qué pasa con ZKAccess

Nada: se sigue usando igual. El agente está hecho para no estorbarle.

1. **Nunca escribe** en `Access.mdb`; lo abre en modo solo lectura.
2. Mientras `Access.exe` esté abierto el agente **suelta la conexión** y espera;
   al cerrarlo, a los 15 s la retoma y se pone al día con lo que pasó mientras
   tanto, que el equipo guardó. En la bandeja eso se ve **ámbar**.

   Medido en sitio el 2026-10-20: **el equipo SÍ admite varias sesiones** por el
   SDK pull, así que ceder no es imprescindible; se mantiene por prudencia. Para
   que el tiempo real no se pause nunca, se vacía el campo «Ceder la conexión a»
   en Configuración. **Solo ve los procesos de su propio PC**: un agente en otro
   PC no sabe si ZKAccess está abierto en la portería (lo avisa en la bitácora al
   arrancar) y, por lo medido, no estorba.
3. **Leer no consume nada en el equipo**: los registros quedan donde están, y
   ZKAccess los puede descargar igual. Por el SDK pull **no hace falta
   desactivar el lector** para descargar: la gente puede seguir marcando
   mientras. (El -101 que se vio al principio venía de leer este lector con el
   SDK clásico, que traduce mal la consulta; ver «Lo que ya NO es un límite».)
4. Lo único que sí le afecta es **vaciar la memoria del lector**: lo que se borre,
   ZKAccess ya no lo podrá descargar. Por eso eso nunca pasa solo (ver abajo).

### Si el PC está apagado

No se pierden huellas: **el lector las guarda en su memoria** (del orden de
100.000 registros) y el agente, al volver, le pide lo que pasó desde la última
que Gestivo conoce. Lo único que se pierde con el PC apagado es la inmediatez.

El riesgo real es otro: esa memoria **nunca se ha vaciado** —la prueba es que
ZKAccess descargó la misma huella hasta cuatro veces— y si se llena, el equipo
deja de guardar. Con el agente conectado no se perdería nada (el evento llega
igual), pero con el PC apagado sí. La ventana de Estado muestra el conteo y avisa
por encima del 80 %.

### Vaciar la memoria del lector

El SDK **no sabe borrar por fecha**: `ClearGLog` borra todo el log y no hay
alternativa (lo único con rango de fechas es el borrado de fotos). Así que:

- **Nunca es automático.** No hay umbral ni horario. Lo dispara una persona, con
  el botón «Vaciar memoria del equipo…» de Configuración, que antes muestra
  cuántos registros hay y pide confirmación.
- La secuencia es fija: **leer la memoria completa → mandarla a Gestivo y
  comprobar que la recibió ENTERA → solo entonces borrar.** Si la cuenta no
  cierra exacta, se aborta y no se borra nada.
- Una huella que caiga entre la lectura y el borrado llega igual, porque la
  suscripción a eventos sigue viva.
- Antes del **primer** vaciado conviene una descarga completa en ZKAccess, para
  que el `.mdb` también quede completo hasta ese día. Después, las descargas de
  ZKAccess ya no traerán lo anterior al vaciado (Gestivo sí lo tiene).
- Si se vacía **desde ZKAccess** también sirve: el agente ya le cedió la conexión
  mientras está abierto, y al retomarla se pone al día desde la marca de Gestivo.

### El ciclo de la vía Access

Cada 15 minutos:

1. `GET /api/biometrico/estado` → `{ ultimo_id }`.
2. `SELECT TOP 2000 … FROM acc_monitor_log WHERE event_type = 14 AND id > ? ORDER BY id`
   (en **modo solo lectura**: se puede leer con ZKAccess abierto).
3. `POST /api/biometrico/marcaciones` con ese lote y el espejo de `USERINFO`.
4. Repite hasta quedarse sin filas o alcanzar el máximo de lotes del ciclo.

En el mismo ciclo lee `Machines` y le pasa la lista de lectores a la vía equipo,
que así se entera de un lector nuevo sin abrir la base por su cuenta. Si la lista
cambió, la **guarda en `config.json`**: es el respaldo para cuando la base no
abra, y lo que se importa en otro PC. A las filas que llegan sin serie les pone
la de su `device_id`, sacada del propio histórico.

### El ciclo de la vía equipo

Al conectarse a un lector:

1. le pregunta a Gestivo hasta dónde llegó **ese** lector
   (`ultimo_momento_equipo`, por número de serie) y le resta 10 minutos de
   margen;
2. se suscribe a los eventos en vivo;
3. le pide la memoria desde esa fecha y encola lo que traiga.

Después, cada huella llega como evento y se manda con lo acumulado cada ~60 s. Si
el lector deja de responder, se suelta y se reintenta con esperas crecientes
(10 s, 30, 60, 120, 300).

**La marca de avance vive en Gestivo, no en el PC**, en las dos vías. Un ciclo
que muere a mitad no deja nada adelantado, reinstalar el PC no pierde nada y la
carga histórica es reanudable sola. Y reenviar lo mismo es inofensivo: la llave
natural `(device_sn, pin, momento)` lo colapsa y se cuenta como «repetida».

### Si no hay conexión

No se pierde nada y no hay que hacer nada. El ciclo falla, queda en la bitácora,
el icono se pone rojo y el siguiente ciclo vuelve a preguntar hasta dónde llegó
Gestivo y manda lo acumulado. Si el PC estuvo tres días apagado son ~400
marcaciones: un solo lote. El respaldo real es el propio `Access.mdb`, que
conserva las 216.000 desde 2022 — y, detrás de él, la memoria del propio lector.

La vía equipo aguanta igual: las huellas se quedan en una cola en memoria y
salen cuando vuelva la red. Si la cola pasara de 10.000 sin poder mandarse, se
suelta y se anota desde dónde releer el equipo, que sigue teniéndolo todo.

Del lado de Gestivo, la caja «Estado del agente» de la pantalla pasa a **ámbar a
los 30 minutos y rojo a los 120** sin noticias. Desde que la presencia sale del
despacho eso ya **no puede inventar una ausencia**: lo único que queda
incompleto es la columna «Huella», que es informativa.

### De dónde salen las marcaciones

De `acc_monitor_log` con `event_type = 14` (verificación válida), **no de
`CHECKINOUT`**. Comprobado: para el badge 1, `CHECKINOUT` da 41 registros y
`acc_monitor_log` sin filtrar 54, pero con `event_type = 14` da los 14 reales.

El equipo tiene **un solo punto de acceso** («Entrada-1») y no distingue entrada
de salida, así que no se pueden calcular horas trabajadas: solo si la persona
apareció y a qué hora.

## Quién debía venir: la cascada

GEMA programa **buses, no conductores**. Su procedimiento
`pa_ext_get_ProgramacionByFecha` devuelve una columna `conductor_asignado` y la
trae **siempre en null** (85.104 filas en Gestivo, 0 con conductor; verificado
contra el procedimiento el 2026-10-19). Y Gestivo no tiene turnos ni
programación de personal.

Así que para cada bus programado ese día, el conductor esperado se busca en
cascada (`src/lib/biometrico/esperados.ts`):

| # | Origen | Qué es | Chip en la pantalla |
|---|---|---|---|
| 1 | `despacho` | Quien sacó ese bus ese día (`historico_despacho`) | **Despacho** |
| 2 | `historico` | Conductor dominante del bus en los 45 días previos | **Habitual** (`?` si manda menos de la mitad de los días) |
| 3 | `vehiculo` | Conductor fijo del bus en el maestro (`vehiculos.cedula_conductor`) | **Maestro bus** |
| 4 | — | Nada resuelve: el bus se reporta aparte, sin inventar cédula | — |

**Y a eso se suma la plantilla**: todo conductor activo ese día que no haya
salido por ningún bus (chip **Plantilla**). Sin ese paso la pantalla no sirve
para lo que se pidió, y conviene entender por qué: si los esperados salen del
despacho, entonces **todos fueron despachados, luego todos trabajaron**, y «sin
marcación» da cero siempre. Medido sobre octubre de 2026: con solo la cascada de
buses, **0 ausencias cada día**; con la plantilla aparecen los 39-41 activos
diarios que ni manejaron ni marcaron, que son los candidatos de verdad.

Esa lista **incluye los descansos** —Gestivo no tiene calendario de turnos— y por
eso lo que se registra solo entra como «pendiente por clasificar» y no cuenta
como falta: son filas a revisar, no ausencias confirmadas.

Medido sobre octubre de 2026:

- Días con despacho sincronizado (06-14 y 19): **los 147-150 buses programados
  salieron todos**; el escalón 1 resuelve el 100 %.
- Días sin sincronizar (15-18): el histórico fuerte resuelve ~82 % (122/147,
  119/142, 125/150), el débil ~15 %, el maestro del vehículo 1 %, y **ninguno
  queda sin resolver**.
- `vehiculos.cedula_conductor` coincide con el dominante del histórico en ~80 %
  (117/146): el histórico es mejor fuente, y por eso va antes.

Cuando GEMA entregue `conductor_asignado`, se agrega como escalón 0 en esa misma
función y no hay que tocar nada más.

**Toda esta regla vive en el servidor** (`src/lib/biometrico/esperados.ts`), no
en el agente. El agente solo manda marcaciones en crudo: no sabe de conductores,
turnos ni ausencias. Cambiar la regla —o la ventana de 45 días, o el umbral de
confianza— es tocar una función de Gestivo y desplegar; **el programa del PC del
biométrico no se vuelve a instalar ni se recompila**.

## La pantalla: Ausentismo › Marcaciones

`/ausentismo/marcaciones`. Permiso: el del módulo `ausentismo` (no tiene clave
propia); el botón «Registrar novedad» exige además poder editar.

### El despacho del día se refresca al abrir la pantalla

El cron de GEMA corre **una vez al día**, a las 03:00 de Colombia, cuando el día
operativo no ha empezado: el primer viaje sale a las **03:55** y el último a las
**16:40**. Sin nada más, la pantalla de hoy estaría vacía toda la jornada.

Y no se arregla con otro cron: el plan Hobby de Vercel admite dos y los dispara
una vez al día. Así que hay dos caminos, los dos sobre
`src/lib/gema/despacho-al-dia.ts`:

- **Automático**: al abrir la pantalla del día, si el despacho tiene más de 15
  minutos se vuelve a traer. Y mientras la pantalla siga abierta **se relee sola
  cada 5 minutos**, lo que de paso hace que el refresco de GEMA ocurra cada 15
  sin nada más: el cliente solo pide los datos; la ventana de 15 minutos la
  decide el servidor.
- **A mano**: el botón **«Actualizar desde GEMA»** de la caja de arriba, que
  fuerza y no espera esa ventana — para quien acaba de despachar un bus y quiere
  verlo reflejado.

El relojito del cliente **se detiene con la pestaña oculta** (diez pestañas
olvidadas no deben estar releyendo toda la tarde) y se pone al día al volver a
mirarla.

### Varias pestañas abiertas: el candado

Es el riesgo real de releer cada 5 minutos. Si tres pestañas coinciden cuando el
dato está vencido, las tres pasarían la guarda y llamarían a GEMA en paralelo —y
`gema_reemplazar_dia` **borra el día y lo reinserta**, así que una puede borrar
lo que otra acaba de meter.

Por eso el refresco **se gana**: un solo `UPDATE` con condición adelanta
`last_run_at` solo si nadie lo tocó en los últimos 20 segundos, y quien no gane
se va diciendo «lo está trayendo otro». Probado con cinco llamadas forzadas
simultáneas: **ganó exactamente una** y las 534 filas del día quedaron intactas.

Si GEMA falla, el candado **se devuelve**: si no, un corte del origen bloquearía
los reintentos los siguientes 15 minutos. Probado apuntando a un host
inalcanzable — `last_run_at` volvió a su valor anterior, los datos quedaron
intactos y no se lanzó ninguna excepción.

**Solo trae `historico_despacho`** (dos días), que es la única tabla que cambia
durante la jornada y la única de la que sale la presencia. La `programacion` se
publica por adelantado y el cron de las 03:00 ya la tiene; los maestros y el
resto de lo operacional son asunto del cron.

Cuesta **~2 a 3 s**, y solo en la primera carga de cada 15 minutos. Bloquea a
propósito: el sentido de la pantalla es decidir ausencias, y un dato viejo
mostrado rápido es peor que uno correcto que tarda dos segundos. La caja de
arriba dice cuándo se trajo, hace cuántos minutos, y si se acaba de actualizar.

Hay además **`GET /api/gema/despacho`**, el mismo refresco por HTTP, autenticado
con `BIOMETRICO_SECRET` (`?forzar=1` salta la ventana). Es lo que tendría que
llamar un cron cada 15 minutos el día que el plan lo permita; mientras tanto
sirve para el Programador de tareas de Windows, un cron externo o `pg_cron` del
Supabase autoalojado. Es idempotente: si el dato está fresco no toca GEMA y
responde en ~100 ms.

Si GEMA está caída **no se rompe la página**: se pinta lo último guardado y se
dice en rojo que puede faltar gente que ya salió a rodar. Y `reemplazarPorDia`
se niega a borrar un día si GEMA devuelve un rango vacío, así que un fallo del
origen no deja el día en blanco.

Un día pasado no se refresca (lo cubre la ventana de 45 días del cron).

### La presencia sale del DESPACHO, no de la huella

Decidido el 2026-10-19. **Si la cédula del conductor aparece en
`historico_despacho` con un viaje que salió a rodar, se asume que no está
ausente**, y ese primer viaje es la prueba que se muestra (hora, bus, turno,
viaje, ruta). La huella queda como una **columna de estado**, informativa, que
no cambia ninguna conclusión: hoy solo la mitad de los conductores despachados
pasa por el biométrico, así que como medida de asistencia todavía no sirve.

La regla vive en `src/lib/biometrico/despacho.ts` y **no basta con que exista la
fila**. Medido sobre las 6.560 filas del 6 al 19 de octubre de 2026:

| estado | filas | hora real | con llegada | con timbradas |
|---|---|---|---|---|
| `DESPACHADO` | 4886 | 4886 | 4515 | 4775 |
| `NO_DESPACHADO` | 1274 | 1255 | 18 | **0** |
| `POR_DESPACHAR` | 273 | 0 | 0 | **0** |
| `NO_FINALIZADO` | 105 | 105 | 101 | 102 |
| `PENDIENTE` | 13 | 13 | 13 | 13 |
| `POR_LIQUIDAR` | 9 | 9 | 7 | 0 |

Dos trampas que salieron de ahí:

1. **`POR_DESPACHAR` trae `hora_despacho = 00:00:00`**: es el relleno de los
   turnos de más tarde del mismo día.
2. **`NO_DESPACHADO` trae hora real** (1.255 de 1.274) y aun así no rodó: esa
   hora es la **planeada**. Fiarse de la hora habría dado por presentes 1.255
   viajes que nunca salieron.

Lo que de verdad separa un viaje que rodó es la evidencia física: las
**timbradas**. De ahí la regla: la lista de estados (`DESPACHADO`,
`NO_FINALIZADO`, `PENDIENTE`, `POR_LIQUIDAR`) **o** timbradas > 0. Hoy la
segunda no cambia ningún número —0 filas entran solo por ella— y está como red:
si GEMA agrega un estado nuevo para un viaje que sí rodó, se cuenta igual en vez
de salir como una ausencia falsa.

### Quién entra a la lista del día

Son **dos preguntas distintas**, y confundirlas costó un error:

- La **plantilla** decide quién **puede faltar**.
- El **despacho** decide quién **vino**.

Por eso **quien rodó ese día entra siempre**, aunque hoy no esté en la
plantilla. Sin ese paso, alguien que trabajó pero que hoy ya no está activo
desaparecía de la pantalla **en los cuatro buckets**, porque el resumen recorre
los esperados. Medido sobre los 45 días previos al 2026-10-19: eran **31
personas y 360 apariciones** — 29 `RETIRADO` con `fecha_retiro` *posterior* a
los días que rodaron (una se retiró el 17 de octubre habiendo rodado 34 días) y
una `ACTIVO` pero reubicada que rodó 11 días.

Es seguro por construcción: quien rodó cae en «Trabajaron», así que esto no
puede inventar un candidato a ausencia. Y evita tener que reconstruir la
plantilla histórica, que es la otra forma de arreglarlo.

### Quién entra a la plantilla

El maestro es `conductores`, que **viene de GEMA**: lo refresca a diario el cron
`/api/cron/sync-gema` desde la vista `vst_ext_get_conductores`, y de ahí salen
tanto `estado` como `reubicado`. No hay otra tabla de conductores:
`employees` (`vst_ext_get_empleados`) son 313 filas de personal administrativo
y **no contiene ni un conductor**.

Ojo con el upsert: el sync **no borra filas**, así que alguien que GEMA deje de
reportar conserva en Gestivo su último estado conocido.

Filtro: `src/lib/biometrico/plantilla.ts`, **estado `ACTIVO` y sin reubicar**.

### Las fichas que GEMA nunca confirmó

Contratación crea la ficha del conductor al contratar con la cédula escrita en
el proceso, contando con que GEMA la complete en el siguiente sync. **Si la
cédula va mal digitada, GEMA nunca la reconoce** —el upsert es por cédula y el
sync no borra— y la ficha se queda en `ACTIVO` para siempre: un conductor que no
existe, indistinguible de uno real.

Había **19 así** el 2026-10-19, las 19 en `ACTIVO` y ninguna con un viaje desde
junio. Salían como candidatas a ausencia todos los días. Ejemplo del caso que lo
destapó: `100191507 ALEJANDRO GONZALEZ` es `1001915077 GONZALEZ GONZALEZ
ALEJANDRO ARNALDO` sin el último dígito, retirado desde febrero.

La señal es `codigo` (el `codigo_personal` de GEMA): lo tienen los 1.270 que
GEMA conoce y ninguna de las 19. Con **30 días de gracia**, porque una ficha
recién creada tampoco lo tiene todavía — calibrado con los datos: las 19
fantasmas tienen 66 días o más y un conductor real recibe su código en 3 a 10.

Detalle y reglas en `src/lib/conductores/confirmacion.ts`. Para listarlas con la
cédula real propuesta: **`npm run conductores:revisar-altas`**. En la base
`estado` solo tiene `ACTIVO` (200) y `RETIRADO` (1.089), y `reubicado` es `null`
(1.269) o `"SI"` (20) — no existe el valor `"0"`, así que «reubicado en 0» es el
nulo. De los 16 activos reubicados, **ninguno** aparece rodando: siguen en la
empresa pero no manejan. Se excluye además a quien no había ingresado a esa
fecha.

El criterio es el estado de **hoy**, no el de la fecha mirada (hay 12 `ACTIVO`
con `fecha_retiro` puesta, dato contradictorio del origen, y el estado gana). La
consecuencia es que una fecha pasada se lee con la plantilla de hoy.

Y se excluyen dos **cédulas de relleno que no son personas**, las dos `ACTIVO`
y sin reubicar en el maestro:

| cédula | en `conductores` | en el despacho |
|---|---|---|
| `99999999` | `NO DEFINIDO NO DEFINIDO…` | 130 filas en 14 días como `CONDUCTOR  SIN .`, **0 rodó** |
| `999999991` | `CONDUCTOR  SIN .` | no aparece |

`99999999` es el relleno de un viaje sin conductor asignado, y el taller la usa.
Sin el filtro entraban a la plantilla y salían como candidatas a ausencia
**todos los días**. Se filtran en los dos lados: no entran a la plantilla y no
cuentan como presencia, porque un bus despachado sin conductor no es alguien que
vino. No es un filtro por prefijo: son esos dos valores concretos, porque hay
cédulas de verdad que empiezan por 9 (`91076062`, `91252285`).

### Las cinco fichas

| Ficha | Qué cuenta |
|---|---|
| **Se esperaban** | La plantilla: conductores activos y sin reubicar |
| **Trabajaron** | Tienen un viaje que salió a rodar. **No están ausentes** |
| **Turno sin empezar** | Tienen viajes de hoy que todavía no salen. **No es una ausencia** |
| **Sin despacho** | Ni viaje que haya salido, ni turno pendiente, ni novedad: lo que hay que revisar |
| **Con novedad** | Su día ya está explicado. **Fuera de las otras cuentas** |

Cada esperado cae en **exactamente una** de: con novedad, trabajaron, turno sin
empezar, o sin despacho. Las sumas cuadran siempre, y hay una auditoría contra
datos reales que lo comprueba (ver «Verificación»).

**La novedad manda sobre todo**, incluso sobre un viaje que salió a rodar
(decidido el 2026-10-20). El razonamiento: esta pantalla sirve para encontrar a
quién hay que registrarle algo, y a quien ya tiene su permiso, su incapacidad o
sus vacaciones no hay nada que preguntarle — dejarlo en las cuentas solo estorba.
Después va el viaje que salió, después el turno que no ha empezado, y lo que
queda es el candidato.

### Con huella pero sin despacho: esa persona vino

Es la distinción más útil de la lista de candidatos, y la que evita el error más
caro: **registrarle una falta a alguien que sí vino**.

Si alguien no tiene viaje pero **pasó la huella**, estuvo en la empresa. No es
una ausencia: es que no le dieron bus. Así que la sección «Sin despacho» los
pone **primero y aparte**, en dos grupos:

| Grupo | Qué significa | Qué hacer |
|---|---|---|
| **Vinieron y no los despacharon** | Huella sí, viaje no | Averiguar por qué no se les dio bus. **No registrar una falta** |
| **Sin rastro del día** | Ni huella ni viaje | El candidato de verdad. Puede ser un descanso |

No es un caso raro: medido sobre doce días de octubre de 2026, de los 2-8
candidatos diarios **0 a 4 tenían huella**, y varios días eran la mitad de la
lista. La ficha «Sin despacho» dice cuántos son.

Por dentro **sigue siendo un solo bucket**: la huella no decide la presencia
—eso lo hace el despacho— y así las sumas y las invariantes de la auditoría no
cambian. Lo único que cambia es el orden (huella primero) y cómo lo pinta la
pantalla.

### La contradicción: novedad y además rodó

Si alguien tiene novedad registrada **y** GEMA le registró un viaje que salió,
alguna de las dos cosas está mal, y eso **no puede desaparecer** por haberlo
sacado de las cuentas. La pantalla lo avisa arriba, con nombre, hora, bus y
cuántos viajes, y dice qué hacer: o la novedad quedó mal puesta —se corrige en
Ausentismo › Registro del día— o el viaje se le cargó en GEMA a otra persona.
En la tabla «Con novedad» va además marcado en ámbar.

Es una excepción, no ruido: medido sobre siete días de octubre de 2026, **2
casos** (uno el 19 y uno el 20) contra 14-25 novedades diarias.

La huella de los que rodaron queda en una línea aparte, en chico: no decide
nada.

A quien se le cayeron **todos** los viajes (`NO_DESPACHADO`) **no** se le
esconde en «turno sin empezar»: sale como candidato. El bus se pudo varar, pero
también pudo no presentarse, y eso hay que mirarlo.

### El chip de huella trae la hora

Donde hay huella, el chip verde muestra la **hora de la primera del día**
(`06:42`) en vez de un «Sí»; el título añade la última, cuántas fueron y, si la
persona está enrolada con dos pines, cuáles. Sale de `resumen.marcaron`, que ya
traía primera, última y cantidad: no cuesta ninguna consulta más.

### El filtro de huella

Sobre la tabla «Trabajaron» hay un filtro **Todos · Con huella · Sin huella**,
para ver de un golpe quiénes rodaron sin pasar por el biométrico. Es la lista
para insistir en el uso del equipo; no es una lista de ausencias.

### «Sin despacho» incluye los descansos

Gestivo **no tiene calendario de turnos**, así que la lista incluye a quien
simplemente descansaba. Medido con la regla ya puesta:

| | lun–vie | domingo y festivo |
|---|---|---|
| Plantilla | 155–163 | 160–162 |
| Trabajaron | 129–142 | 67–68 |
| Turno sin empezar | 0 en días cerrados · 10 en el día en curso | 0 |
| Con novedad ya registrada | 9–23 | 0–9 |
| Sin despacho | **4–13** | **83–94** |

Los candidatos de día hábil empezaron en 52–60 y quedaron en 4–13. La diferencia
es toda gente que no debía estar en la lista: 16 reubicados, 2 cédulas de
relleno, 19 fichas que GEMA nunca confirmó, y las novedades ya registradas.

Por eso lo que se automatiza es la **digitación**, no el juicio (ver abajo). La
columna «último día que rodó» es la que separa un descanso de alguien que no
aparece desde hace semanas.

### Lo que Gestivo registra solo: «pendiente por clasificar»

Antes había que abrir el formulario uno por uno. Hoy, **a las 09:00** (hora
cambiable en la misma pantalla), Gestivo deja escritos los registros del grupo
«sin rastro del día» y así nadie los teclea.

Entran con tipo **`pendiente`** («Pendiente por clasificar»), `origen =
'automatico'` y firmados `gestivo (automático)`. Y **no cuentan para nada**:

- `cuenta_reincidencia = false` en el catálogo, así que no suman a reincidentes;
- no son `no_justificada`, que es el único tipo que escala — cuatro seguidas
  notifican descargos y cinco la terminación (`DIAS_DESCARGOS`,
  `DIAS_TERMINACION`). Crear «no justificada» sola habría metido a decenas de
  conductores en un disciplinario por haber descansado un puente: son 83–94 por
  domingo o festivo.

Reglas, todas en `src/lib/biometrico/auto-pendientes.ts` (puro, con pruebas):

| | Regla |
|---|---|
| A quién | Solo «sin despacho» **y sin huella**. Quien pasó la huella **vino**: no se le registra nada. |
| Cuándo | Solo el **día en curso** y solo si ya pasó la hora. Nunca hacia atrás: aparecer registros de días que nadie miraba sería una sorpresa fea en un módulo con consecuencias laborales. |
| Qué días | Solo **hábiles** (`esDiaHabil`, Ley Emiliani). Domingo y festivo no, por los 83–94. |
| A quién no | Quien ya tenga cualquier registro ese día, y la misma cédula dos veces (hay gente enrolada con dos pines). |
| Si está apagado | Nada. Se apaga desde la pantalla o poniendo `no` en `app_settings` → `ausentismo.pendientes_auto_activo`. |

Se dispara **al leerse la pantalla**, no por un cron: el plan Hobby de Vercel
solo da dos al día. Y nunca lanza: si falla, la pantalla se sigue viendo y lo
dice en la caja gris de la sección.

**El botón «Registrar novedad» desaparece solo donde sobra**: en «sin rastro del
día» cuando Gestivo sí va a escribir ese día. Si está apagado, es un día pasado,
es domingo o festivo, o falló el intento, el botón vuelve — si no, quedaría gente
sin ninguna forma de registrarla. En los otros dos grupos (vinieron y no los
despacharon · turno sin empezar) el botón está siempre: a esos nunca se les
registra nada solo.

**El registrado sigue en la lista hasta que se clasifique.** Un «pendiente» no
resuelve el día: nadie ha decidido nada. Así que esa persona **no sale** de «sin
despacho» al crearse el registro —si saliera, la automatización habría escondido
justo lo que hay que resolver—, su fila dice «lo registró Gestivo» y el botón
pasa a ser **«Clasificar»**, que abre el **mismo** registro en modo edición. Sale
de la lista cuando el concepto deja de ser «pendiente». El motivo de la
modificación viene precargado («Clasificación del pendiente que dejó Gestivo»)
porque el módulo lo exige y a mano serían trece veces al día.

**Dónde se ve que lo puso Gestivo**: en Ausentismo › Registro del día, la fila
lleva el distintivo **«automático»** (con el porqué en el título) además del
concepto «Pendiente por clasificar», y en la bitácora queda un «creado» firmado
`gestivo (automático)` con `user_id` nulo.

Migración: `20261021030119_registros_de_ausentismo_creados_por_gestivo_origen_y_pendiente_por_clasificar.sql`
(columna `origen`, índice único parcial sobre los automáticos, y el concepto en
el catálogo). Mientras no se aplique, la pantalla dice exactamente qué falta.

### Registrar la novedad

El botón abre **el mismo formulario** de Ausentismo › Registro del día, con la
fecha, el conductor y el concepto «No justificada» ya puestos (cambiable). Se
guarda con la misma acción `crearRegistro`, así que se aplican igual las
validaciones: un registro por conductor y día, nada dentro de un periodo de
vacaciones abierto, y solo conceptos activos.

### Lo que avisa la pantalla

- **Estado del agente**: último envío, cuántas marcaciones hay, la última
  marcación y el último error completo.
- **Despacho de GEMA sincronizado hasta…**: si es anterior al día que se está
  viendo, los esperados salen del histórico de cada bus y se dice.
- **Buses sin conductor deducible**: los que no resolvió ningún escalón.

## Instalar el agente en el PC de ZKAccess

### 1. Publicar

En el equipo de desarrollo, dentro de `ops/agente-biometrico`:

```
publicar.cmd
```

Deja la carpeta `publicar\` con el `.exe`, sus DLL y las seis del SDK pull
(`plcommpro` y compañía): **unos 2,4 MB, sin instalador**. Se copia entera.

Es **.NET Framework 4.8, x86**, a propósito: ZKAccess 3.5 es una aplicación de 32
bits que usa el proveedor **Jet 4.0 de 32 bits** (ver su `Access.exe.config`), y
compilando a x86 ese proveedor se ve sin trucos. 4.8 ya viene en Windows 10
1903+ y en 11, así que no hay que instalar ningún runtime.

### 2. Copiar y configurar

1. Copie la carpeta al PC, por ejemplo a `C:\Gestivo\AgenteBiometrico\`.
2. Ejecute `Gestivo.AgenteBiometrico.exe`. La primera vez abre la ventana de
   **Configuración** sola.
3. Llene:
   - **URL de Gestivo** — la de producción. *Esto es lo que se cambia cuando se
     mude el servidor: solo esta ventana, sin reinstalar.*
   - **Secreto** — el mismo valor de `BIOMETRICO_SECRET` del servidor.
   - **Base del biométrico** — el `Access.mdb` (botón Examinar).
   - **Contraseña de la base** — solo si la pide.
4. Pulse **Probar conexión**: dice si Gestivo responde, hasta qué id tiene y si
   la base abre (con qué proveedor y cuántas marcaciones faltan).
5. Marque **Iniciar con Windows** y guarde.

### 3. Carga histórica (una vez)

Son ~215.000 marcaciones, unos 108 lotes:

1. Configuración → **Máximo de lotes por envío = 500** → Guardar.
2. Menú de la bandeja → **Sincronizar ahora**. En **Estado…** se ve el avance
   («Lote 37/500 · faltan ~142.000»).
3. Al terminar, vuelva a dejarlo en **10**.

### 4. Encender la lectura directa del equipo

La vía equipo viene **apagada**, así que copiar esta versión no cambia nada hasta
que se haga esto. Este lector va por el **SDK pull** (`Machines.DevSDKType = 1`):
no hay COM que registrar ni hace falta cerrar ZKAccess.

1. Configuración → **«Probar equipo…»** → **Ejecutar**. Son siete pasos con sus
   tiempos y **no hay que poner el dedo**: el método de verificación sale de los
   registros que el equipo ya tiene, y el paso 7 escucha 30 s el canal en vivo.
   Al final imprime un resumen pensado para copiar y pegar: **cópielo** si algo
   falla. El paso 6 dice también cuántas filas descartó por no ser huellas de
   alguien (sucesos de puerta, pin 0).
2. Marque **«Leer las huellas directo del lector (tiempo real)»** → Guardar.
3. Ponga un dedo en el lector. En ≤ 60 s debe aparecer en Gestivo:

   ```sql
   SELECT pin, cedula, momento, origen, recibido_at
     FROM biometrico_marcaciones
    WHERE fecha = current_date AND origen = 'equipo'
    ORDER BY momento DESC LIMIT 5;
   ```

4. Abra ZKAccess: el icono debe pasar a **ámbar** y Estado decir «cedido a
   ZKAccess». Descargue en ZKAccess y ciérrelo: a los 15 s el agente reconecta y
   lee el tramo.
5. Menú → **Sincronizar ahora**: ese envío de Access debe traer
   **`completadas > 0`** y `nuevas = 0` para el tramo que ya había mandado el
   equipo. Es la prueba de que las dos vías cruzan.

Al día siguiente, el cruce de verdad:

```sql
-- Cómo se reparten las dos vías
SELECT origen, count(*) total, count(id_zk) con_id_zk, count(*) - count(id_zk) solo_equipo
  FROM biometrico_marcaciones WHERE fecha >= current_date - 1 GROUP BY origen;

-- Tras una descarga COMPLETA en ZKAccess, esto debería dar 0 filas.
-- Si quedan, la hora o el pin no coinciden entre las dos vías: hay que mirarlo.
SELECT pin, momento FROM biometrico_marcaciones
 WHERE origen = 'equipo' AND id_zk IS NULL AND fecha = current_date - 1;

-- Latencia real y desfase del reloj del lector
SELECT avg(recibido_at - momento), min(recibido_at - momento), max(recibido_at - momento)
  FROM biometrico_marcaciones WHERE origen = 'equipo' AND fecha = current_date;
```

**Para volver atrás** basta desmarcar la casilla: la vía equipo para y la de
Access sigue igual. El servidor acepta los dos formatos, así que no hay que
revertir nada allá.

## Instalar el agente en otro PC (solo la vía equipo)

Para cuando el PC de ZKAccess no puede tener el agente, o se quiere el tiempo
real desde otro computador. Basta con que **esté en la misma red y llegue al
lector** (`192.168.0.253:4370`); desde fuera de la red no hay forma, porque la
IP del lector es privada. No necesita ZKAccess ni el `.mdb`.

1. Copie la carpeta `publicar\` **entera**: trae las seis DLL del SDK pull junto
   al `.exe`. (Si «Acerca de» dice «Lectura directa: NO», faltan.)
2. En el PC de ZKAccess, con el agente 1.2.0 o posterior ya corriendo al menos
   un ciclo, copie `%LOCALAPPDATA%\Gestivo\AgenteBiometrico\config.json` (lo abre
   la bandeja con «Abrir carpeta de datos»). Lleva la lista de lectores; el
   secreto va cifrado para esa cuenta y **no** sirve en otro PC.
3. En el PC nuevo, Configuración:
   - pestaña **Gestivo**: URL y secreto (hay que escribirlo de nuevo);
   - pestaña **Biométrico**: **desmarque** «Sincronizar desde el Access.mdb»;
   - pestaña **Lectura directa del equipo**: marque la casilla y pulse
     **«Importar de config.json…»** con el archivo del paso 2. Si no lo tiene,
     escriba el lector a mano (nombre, IP, puerto 4370, nº 1; la serie es
     opcional, el equipo la dice al conectar) y **«Agregar lector»**.
4. Guarde. La bitácora avisa una vez que este PC no puede saber si ZKAccess está
   abierto en la portería: es lo esperado.
5. Estado → el bloque del equipo debe decir **conectado**. Ponga un dedo y
   compruebe con la consulta del paso 3 de arriba.

Si en la portería **también** corre el agente con la vía equipo, los dos leen el
mismo lector y mandan las mismas huellas: es inofensivo, Gestivo las colapsa por
`(serie, pin, momento)` y las cuenta como `repetidas`. Pero no aporta nada; lo
razonable es dejar la vía equipo en un solo PC.

### El icono de la bandeja

| Color | Qué significa |
|---|---|
| 🟢 Verde | Todo al día: el último ciclo salió bien y el equipo está conectado |
| 🟠 Ámbar | La vía Access va bien, pero el equipo no está dando tiempo real: o se la cedió a ZKAccess, o perdió la conexión. **No es un error** —las huellas llegarán con el próximo ciclo de Access— pero tampoco es «todo al día» |
| 🔵 Azul | Enviando ahora |
| 🔴 Rojo | El último ciclo falló — abra **Estado…**, el error está completo |
| ⚪ Gris | Falta configurar algo, o (solo vía equipo) el lector aún no conecta |

El tooltip resume las dos vías: `Gestivo 06:40 · equipo 06:42 (3 en cola)`, o
`… · equipo→ZKAccess` cuando está cedido. Tiene un tope duro de 63 caracteres,
así que el detalle vive en **Estado…**, que trae un bloque por lector con su
serie, firmware, desfase de reloj, última huella, cuántas van hoy y cuántas
quedan en cola.

Sin vía Access el tooltip dice `Gestivo · solo equipo …` y el color es solo el
del lector.

Menú: **Estado…**, **Sincronizar ahora**, **Reconectar equipo ahora**,
**Configuración…**, **Iniciar con Windows**, **Abrir bitácora**, **Abrir carpeta
de datos**, **Acerca de**, **Salir**. En el pie de Configuración, **«Abrir
bitácoras»** abre la carpeta de los logs para copiar el de cualquier día y
mandarlo. Doble clic abre Estado. El globo de aviso
sale solo cuando el estado **cambia** (a rojo, y al volver a verde), no en cada
fallo repetido.

### Dónde quedan las cosas

```
%LOCALAPPDATA%\Gestivo\AgenteBiometrico\config.json
%LOCALAPPDATA%\Gestivo\AgenteBiometrico\logs\agente-AAAAMMDD.log   (30 días)
```

`config.json` trae además la lista de lectores (`Equipos`), copiada de
`Machines`, sin la clave de comunicación: es lo único de ese archivo que sirve en
otro PC.

El secreto y la contraseña de la base se guardan **cifrados con DPAPI** del
usuario actual: copiar el `config.json` a otro PC o a otra cuenta de Windows no
sirve para eso, hay que volver a escribirlos. Era lo menos malo en un PC compartido —
pasar el secreto por la línea de comandos lo deja visible en el Programador de
tareas, y una variable de máquina la lee cualquier usuario.

Las bitácoras llevan nombres y cédulas: **no salen del PC**.

### Si falla por el proveedor de Access

El agente autodetecta ACE 16 → ACE 12 → **Jet 4.0** (el que instala ZKAccess y el
único que seguro está). Si no encuentra ninguno lo dice y se puede fijar a mano
en Configuración. En el PC de desarrollo, el único de 32 bits es
`Microsoft.Jet.OLEDB.4.0`, que abre el `.mdb` sin problema.

### El límite conocido

La bandeja necesita una **sesión de Windows abierta**. Si el PC se reinicia y
nadie inicia sesión, el agente no corre (igual que ZKAccess). Eso ya no pierde
huellas —el lector las guarda y el agente se pone al día al volver—, solo la
inmediatez. Si llegara a estorbar, tanto `Sincronizador` como `TiempoReal` son
independientes de la interfaz y se envuelven en un servicio de Windows sin tocar
el resto.

### Lo que ya NO es un límite

Antes, aquí decía que las huellas solo llegaban a Gestivo **cuando alguien abría
ZKAccess y descargaba a mano**, porque es lo único que hace crecer
`acc_monitor_log`. Eso lo resuelve la vía equipo: el agente habla directo con el
lector y las manda al instante. La vía Access sigue existiendo como respaldo y
como historia autoritativa, no como única fuente.

## El servidor

### Variable de entorno

```
BIOMETRICO_SECRET=        # openssl rand -hex 32
```

Se exige **siempre**. A diferencia de `CRON_SECRET` —que hoy solo se valida si
está definido—, sin esta variable los endpoints responden **503** y no entra ni
una marcación: son de escritura y están abiertos a internet.

### Endpoints

```
GET /api/biometrico/estado
  200 { ok, ultimo_id, ultimo_momento,
        ultimo_momento_equipo: { "AHID222860036": "2026-10-20T11:42:10+00:00", … },
        ultimo_momento_global, personas_actualizadas_at,
        ultimo_envio_at, servidor_at }

POST /api/biometrico/marcaciones
  { agente, personas?: [{ pin, userid, cardNo, nombre, apellido, departamentoId }],
    marcaciones: [{ id?, pin, momento, deviceId, deviceName, deviceSn,
                    verificado, punto, recibidoAt? }] }
  200 { ok, recibidas, nuevas, completadas, repetidas, ultimo_id, ultimo_momento, personas }
  400 lote rechazado (dice la fila y el id)
  401 secreto malo · 413 más de 2000 marcaciones · 503 sin secreto configurado
```

Hay **dos marcas de avance** porque las dos vías identifican las huellas de forma
distinta: `ultimo_id` para la de Access, y `ultimo_momento_equipo` **por número
de serie** para la del equipo (con `ultimo_momento_global` de respaldo para un
lector que nunca haya reportado). Por serie y no por `device_id`, que cambia cada
vez que alguien vuelve a registrar el mismo lector.

**`id` es opcional, y su ausencia es información.** Solo lo trae la vía Access; en
el lector ese número no existe. Sin `id`, el servidor sabe que la huella viene del
equipo y entonces **`deviceSn` es obligatorio**, porque la identidad pasa a ser
`(deviceSn, pin, momento)`. Un lote **no puede mezclar** las dos vías: el agente
nunca lo hace, y aceptarlo escondería un error suyo. `recibidoAt` (hora del PC)
es opcional y sirve para medir la latencia y el desfase del reloj del lector.

`completadas` son las huellas que **ya estaban** porque las trajo el equipo y a
las que este envío de Access les puso su `id_zk`. Es la señal de que las dos vías
cruzan bien: si tras una descarga en ZKAccess sale 0, algo no cuadra en la hora o
en el pin.

`marcaciones: []` es válido: sirve de latido y para subir el espejo de personas.

**El lote se acepta o se rechaza entero.** Si se aceptara a medias, el agente
—que pide «lo que siga del último id que tengas»— avanzaría por encima de la fila
mala y esa marcación se perdería para siempre. El origen es una tabla de esquema
fijo: una fila mal formada es un error a mirar, no un dato de negocio.

### Tablas

| Tabla | Qué guarda |
|---|---|
| `biometrico_marcaciones` | Una fila por huella. Identidad: **`(device_sn, pin, momento)`** |
| `biometrico_personas` | Espejo de `USERINFO`: pin → cédula, para atribuir |
| `biometrico_envios` | Un registro por llamada del agente (es lo que lee «Estado del agente») |

Migraciones: `20261019162914_marcaciones_del_biometrico_zkaccess.sql` y
`20261020164817_marcaciones_del_biometrico_llave_natural_y_origen_equipo.sql`.
**Se aplican a mano en el SQL Editor** (instancia autoalojada); traen su `SELECT`
de comprobación al final.

Columnas que conviene conocer:

- **`id`** — llave primaria sustituta (`BIGINT IDENTITY`). Existe porque el Data
  API externo y el catálogo MCP necesitan direccionar la fila por **una** columna
  no nula, y `id_zk` pasó a ser nulable.
- **`id_zk`** — `acc_monitor_log.id`, cuando la huella llegó o se completó por el
  `.mdb`. Nulo mientras solo la haya traído el lector. Es la marca de avance de
  la vía Access y **no sirve para contar**: el mismo lector se registró cuatro
  veces en ZKAccess y un mismo evento llegó a tener hasta cuatro `id_zk` (57.577
  filas de más entre 2022 y 2024, que la migración depura).
- **`device_sn`** — parte de la llave, así que nunca nulo. En las filas viejas que
  no lo traían se dedujo del `device_id` (4, 5, 6 y 7 → `AHID222860036`; 3 → el
  lector anterior `AHID211660104`).
- **`origen`** — quién la trajo PRIMERO: `equipo` o `access`. No cambia después:
  una fila del equipo conserva `origen = equipo` aunque luego Access le complete
  el `id_zk`.
- **`recibido_at`** — hora del PC del agente al captar el evento. Nulo en la vía
  Access. Contra `momento` da la latencia real y el desfase del reloj del lector.

La ingesta es una función, `biometrico_ingresar_marcaciones(jsonb, uuid)`, y no un
upsert de PostgREST: este solo sabe hacer `DO UPDATE SET col = EXCLUDED.col` para
todas las columnas, y aquí hace falta «rellena `id_zk` solo si estaba vacío y no
pises la cédula».

La `cedula` va **denormalizada** en las marcaciones: la consulta del día y «desde
cuándo no aparece» son barridos de un solo índice.

### Tocar el «N.º de identificación» arregla el historial solo

El agente manda el espejo de `USERINFO` **en cada ciclo**, así que cualquier
cambio en ZKAccess se propaga en menos de 15 minutos y
`biometrico_reresolver_cedulas()` reatribuye las marcaciones ya cargadas. No hay
que recargar nada ni reiniciar el agente. Probado con datos reales:

| Lo que se hace en ZKAccess | Qué pasa en Gestivo |
|---|---|
| Se escribe un `CardNo` donde no había | Sus marcaciones viejas quedan atribuidas (1.015 de 2022 en adelante, en la prueba) |
| Se corrige una cédula mal escrita | Las marcaciones pasan de la vieja a la nueva; la vieja queda en 0 |
| Se borra el `CardNo` | Sus marcaciones vuelven a quedar sin cédula |
| **Se enrola a una persona nueva** | Si su pin ya tenía marcaciones, se le atribuyen (es el caso de los 261 pines borrados que conservan 38.454 marcaciones sin dueño) |

Ese último caso tuvo un error: el código saltaba a las personas nuevas al contar
cambios, así que su historial se quedaba sin cédula para siempre. Corregido y
fijado con pruebas en `src/lib/biometrico/personas.test.ts`.

### Data API y MCP

`biometrico_marcaciones` se expone **solo lectura** a quien tenga el módulo
`ausentismo`, con su documentación en el catálogo del MCP (advertencias
incluidas: una marcación que falta no es una ausencia, contar filas no es contar
personas, hay diez personas con dos pines). `biometrico_personas` y
`biometrico_envios` no se exponen.

## Verificación

Dos capas, y hacen cosas distintas.

**Pruebas unitarias** (`npm run test:biometrico`, 68): fijan las reglas con casos
escritos a mano, incluidas las dos trampas de GEMA (`POR_DESPACHAR` con hora de
relleno y `NO_DESPACHADO` con hora real que no rodó) y los valores de
`estado` / `reubicado` tal como están en la base.

**Auditoría contra datos reales** (`npm run biometrico:auditar`): corre los
**mismos módulos** que la pantalla sobre `historico_despacho` y `conductores` de
verdad y comprueba, fecha por fecha:

1. Cada esperado cae en exactamente un bucket y nadie aparece en dos.
2. `trabajaron` y `porSalir` son disjuntos.
3. El primer viaje y el conteo, **recalculados de forma independiente** desde
   las filas crudas, coinciden con lo que devolvió el módulo.
4. **Nadie en «sin despacho» rodó de verdad** — la invariante que evita
   proponerle una falta a quien sí trabajó.
5. Toda cédula despachada existe en `conductores`.
6. Ningún retirado, reubicado ni cédula de relleno aparece como **candidato a
   ausencia** (no como esperado: quien rodó entra aunque no esté activo).
7. Ninguna hora de relleno (`00:00:00`) entre los que rodaron.
8. **Todo el que rodó aparece en pantalla** — la invariante que descubrió las 31
   personas invisibles. Y además: en «Trabajaron», o en «Con novedad» marcado
   como que rodó; **nunca como candidato a ausencia**, que sería proponerle una
   falta a quien trabajó. Al revés también: nadie marcado como que rodó en «Con
   novedad» puede no haber rodado.

Sale con código 1 si algo falla, así que sirve después de tocar la regla.
Acepta una fecha o un rango: `npm run biometrico:auditar -- 2026-10-01
2026-10-19`; sin argumentos, los últimos 14 días. **Solo lee.**

También reporta «reubicados activos que aparecen rodando»: si alguna vez deja de
ser 0, no es un error del código — significa que un reubicado sí maneja y el
filtro de la plantilla lo está dejando fuera sin razón.

**Vigilancia de duplicados** (en el SQL Editor, solo lee). Las dos deberían dar
0 filas:

```sql
-- La misma huella guardada con la serie escrita distinto (no debería existir
-- desde la migración 20261021144343).
SELECT upper(btrim(device_sn)), pin, momento, count(*)
  FROM biometrico_marcaciones GROUP BY 1, 2, 3 HAVING count(*) > 1;

-- Pines que solo se diferencian en ceros a la izquierda en el mismo segundo:
-- si alguna vez aparece algo aquí, una vía estaría escribiendo el pin distinto
-- y entonces sí habría que normalizarlo (hoy NO se toca: «027» y «27» son dos
-- personas en ZKAccess).
SELECT a.pin, b.pin, a.momento
  FROM biometrico_marcaciones a
  JOIN biometrico_marcaciones b
    ON a.device_sn = b.device_sn AND a.momento = b.momento AND a.pin < b.pin
   AND ltrim(a.pin, '0') = ltrim(b.pin, '0')
 WHERE a.fecha >= current_date - 30;
```

## Cosas que hay que saber

- **Diez cédulas están en dos pines.** La persona se enroló dos veces y su
  asistencia viene partida; la pantalla agrupa por cédula y marca «(2 badges)».
  Vale la pena borrar el enrolamiento viejo en ZKAccess.
- **261 pines borrados conservan 38.454 marcaciones** sin nombre en ninguna
  parte: salen en «sin cédula» y no hay forma de cruzarlos.
- **46 personas quedaron sin cédula a propósito** (retiradas) en el trabajo de
  identificación: también salen ahí.
- **La hora es la del reloj del equipo**, no la del servidor. Si el equipo está
  desajustado, las horas lo están; el atraso del agente sí se mide con la hora
  del servidor, y la pantalla muestra las dos cosas por separado.
- **Depurar el log de ZKAccess no rompe nada**: los ids solo crecen, así que
  borrar filas viejas no mueve la marca ni duplica.
- **Un badge reasignado a otra persona** haría que la re-resolución reatribuyera
  marcaciones viejas. Es raro; se vigila con `activo_en_zk` y `visto_at` de
  `biometrico_personas`.

## Archivos

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/20261019162914_…sql` | Las tres tablas y las dos funciones |
| `supabase/migrations/20261020164817_…sql` | Llave natural `(device_sn, pin, momento)`, depuración de los 57.577 repetidos, `origen`, y la función de ingesta que fusiona las dos vías |
| `supabase/migrations/20261021144343_…sql` | Serie sin espacios y en mayúsculas, y completada por `device_id` cuando falta; en lo guardado y en la función de ingesta |
| `src/lib/biometrico/lote.ts` | Validación del lote (puro, con pruebas) |
| `src/lib/biometrico/auth.ts` | El secreto compartido |
| `src/lib/biometrico/ingesta.ts` | Guardado, re-resolución y bitácora |
| `src/lib/biometrico/dia.ts` | Resumen del día (puro, con pruebas) |
| `src/lib/biometrico/despacho.ts` | **La regla de presencia**: qué viaje salió a rodar y cuál fue el primero (puro, con pruebas) |
| `src/lib/biometrico/plantilla.ts` | **Quién cuenta como conductor**: activo y sin reubicar (puro, con pruebas) |
| `src/lib/biometrico/esperados.ts` | La cascada de quién debía venir |
| `src/lib/biometrico/data.ts` | Lecturas de la pantalla |
| `scripts/biometrico-auditar-despacho.mts` | **Auditoría contra datos reales** (`npm run biometrico:auditar`). Solo lee |
| `src/app/api/biometrico/{estado,marcaciones}/route.ts` | Los dos endpoints |
| `src/app/(dashboard)/ausentismo/marcaciones/` | La pantalla |
| `src/app/(dashboard)/ausentismo/registro-form.tsx` | El formulario, compartido con Registro del día |
| `ops/agente-biometrico/` | La aplicación del PC (ver su `README.md`) |
| `ops/agente-biometrico/Dispositivo/` | La vía equipo: lista de lectores, mapeo, el SDK pull (`ClientePull`) y el clásico en su hilo |
| `ops/agente-biometrico/Lib/PullSdk/` | Las seis DLL x86 del SDK pull, que se publican junto al `.exe` |
| `ops/agente-biometrico/Sincronizacion/TiempoReal.cs` | El coordinador de la vía equipo |
| `ops/agente-biometrico/Pruebas/AutoPruebas.cs` | `--autopruebas` del agente |

Pruebas: `npm run test:biometrico` (servidor) y
`publicarGestivo.AgenteBiometrico.exe --autopruebas` (agente).
