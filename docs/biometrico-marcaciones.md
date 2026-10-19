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
PC de ZKAccess (red interna)                      Gestivo (Vercel)
┌──────────────────────────────┐                  ┌────────────────────────────┐
│ Access.mdb                   │                  │ GET  /api/biometrico/estado│
│   acc_monitor_log            │   HTTPS, cada    │ POST /api/biometrico/      │
│   USERINFO                   │   15 minutos     │          marcaciones       │
│                              │ ───────────────► │                            │
│ Gestivo.AgenteBiometrico.exe │                  │ biometrico_marcaciones     │
│  (icono en la bandeja)       │                  │ biometrico_personas        │
└──────────────────────────────┘                  │ biometrico_envios          │
                                                  └────────────────────────────┘
                                                   Ausentismo › Marcaciones
```

Gestivo está en internet y **no alcanza la red de la empresa**, así que el PC
empuja. Cada ciclo:

1. `GET /api/biometrico/estado` → `{ ultimo_id }`.
2. `SELECT TOP 2000 … FROM acc_monitor_log WHERE event_type = 14 AND id > ? ORDER BY id`
   (en **modo solo lectura**: se puede leer con ZKAccess abierto).
3. `POST /api/biometrico/marcaciones` con ese lote y el espejo de `USERINFO`.
4. Repite hasta quedarse sin filas o alcanzar el máximo de lotes del ciclo.

**La marca de avance vive en Gestivo, no en el PC.** Un ciclo que muere a mitad
no deja nada adelantado, reinstalar el PC no pierde nada y la carga histórica es
reanudable sola. Y como `id_zk` es llave primaria con `ON CONFLICT DO NOTHING`,
reenviar lo mismo es inofensivo: se cuenta como «repetida».

### Si no hay conexión

No se pierde nada y no hay que hacer nada. El ciclo falla, queda en la bitácora,
el icono se pone rojo y el siguiente ciclo vuelve a preguntar hasta dónde llegó
Gestivo y manda lo acumulado. Si el PC estuvo tres días apagado son ~400
marcaciones: un solo lote. El respaldo real es el propio `Access.mdb`, que
conserva las 215.000 desde 2022.

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
eso nada se registra solo: son filas a revisar, no ausencias confirmadas.

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

### Quién entra a la plantilla

`src/lib/biometrico/plantilla.ts`: **estado `ACTIVO` y sin reubicar**. En la base
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
| **Trabajaron sin huella** | De los que rodaron, cuántos no pasaron el biométrico. **Solo informativo** |

Cada esperado cae en **exactamente una** de: trabajaron, turno sin empezar, con
novedad, o sin despacho. Las sumas cuadran siempre, y hay una auditoría contra
datos reales que lo comprueba (ver «Verificación»).

El orden de los buckets es el orden de la certeza: un viaje que salió manda
sobre todo lo demás —incluso sobre una novedad ya registrada, porque si rodó, la
novedad quedó mal puesta y hay que verlo—, después el turno que no ha empezado,
después la novedad, y lo que queda es el candidato.

A quien se le cayeron **todos** los viajes (`NO_DESPACHADO`) **no** se le
esconde en «turno sin empezar»: sale como candidato. El bus se pudo varar, pero
también pudo no presentarse, y eso hay que mirarlo.

### El filtro de huella

Sobre la tabla «Trabajaron» hay un filtro **Todos · Con huella · Sin huella**,
para ver de un golpe quiénes rodaron sin pasar por el biométrico. Es la lista
para insistir en el uso del equipo; no es una lista de ausencias.

### «Sin despacho» incluye los descansos

Gestivo **no tiene calendario de turnos**, así que la lista incluye a quien
simplemente descansaba. Medido con la regla ya puesta:

| | lun–vie | domingo y festivo |
|---|---|---|
| Plantilla | 172–181 | 178–181 |
| Trabajaron | 127–141 | 65–68 |
| Turno sin empezar | 0 en días cerrados · 10 en el día en curso | 0 |
| Con novedad ya registrada | 8–23 | 0–9 |
| Sin despacho | **23–31** | **102–113** |

Por eso **nada se registra solo**. La columna «último día que rodó» es la que
separa un descanso de alguien que no aparece desde hace semanas.

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

Deja la carpeta `publicar\` con el `.exe` y una DLL: **0,8 MB, sin instalador**.

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

### El icono de la bandeja

| Color | Qué significa |
|---|---|
| 🟢 Verde | El último ciclo salió bien |
| 🔵 Azul | Enviando ahora |
| 🔴 Rojo | El último ciclo falló — abra **Estado…**, el error está completo |
| ⚪ Gris | Falta configurar algo |

Menú: **Estado…**, **Sincronizar ahora**, **Configuración…**, **Iniciar con
Windows**, **Abrir bitácora**, **Abrir carpeta de datos**, **Acerca de**,
**Salir**. Doble clic abre Estado. El globo de aviso sale solo cuando el estado
**cambia** (a rojo, y al volver a verde), no en cada fallo repetido.

### Dónde quedan las cosas

```
%LOCALAPPDATA%\Gestivo\AgenteBiometrico\config.json
%LOCALAPPDATA%\Gestivo\AgenteBiometrico\logs\agente-AAAAMMDD.log   (30 días)
```

El secreto y la contraseña de la base se guardan **cifrados con DPAPI** del
usuario actual: copiar el `config.json` a otro PC o a otra cuenta de Windows no
sirve, hay que volver a escribirlos. Era lo menos malo en un PC compartido —
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
nadie inicia sesión, el agente no corre (igual que ZKAccess). Si eso llega a
estorbar, el mismo `Sincronizador` se envuelve en un servicio de Windows sin
tocar el resto.

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
  200 { ok, ultimo_id, ultimo_momento, personas_actualizadas_at,
        ultimo_envio_at, servidor_at }

POST /api/biometrico/marcaciones
  { agente, personas?: [{ pin, userid, ssn, nombre, apellido, departamentoId }],
    marcaciones: [{ id, pin, momento, deviceId, deviceName, deviceSn,
                    verificado, punto }] }
  200 { ok, recibidas, nuevas, repetidas, ultimo_id, personas }
  400 lote rechazado (dice la fila y el id)
  401 secreto malo · 413 más de 2000 marcaciones · 503 sin secreto configurado
```

`marcaciones: []` es válido: sirve de latido y para subir el espejo de personas.

**El lote se acepta o se rechaza entero.** Si se aceptara a medias, el agente
—que pide «lo que siga del último id que tengas»— avanzaría por encima de la fila
mala y esa marcación se perdería para siempre. El origen es una tabla de esquema
fijo: una fila mal formada es un error a mirar, no un dato de negocio.

### Tablas

| Tabla | Qué guarda |
|---|---|
| `biometrico_marcaciones` | Una fila por huella. Llave `id_zk` = `acc_monitor_log.id` |
| `biometrico_personas` | Espejo de `USERINFO`: pin → cédula, para atribuir |
| `biometrico_envios` | Un registro por llamada del agente (es lo que lee «Estado del agente») |

Migración: `20261019162914_marcaciones_del_biometrico_zkaccess.sql`. **Se aplica
a mano en el SQL Editor** (instancia autoalojada); trae su `SELECT` de
comprobación al final.

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
6. Ningún retirado ni reubicado se cuela en la plantilla.
7. Ninguna hora de relleno (`00:00:00`) entre los que rodaron.

Sale con código 1 si algo falla, así que sirve después de tocar la regla.
Acepta una fecha o un rango: `npm run biometrico:auditar -- 2026-10-01
2026-10-19`; sin argumentos, los últimos 14 días. **Solo lee.**

También reporta «reubicados activos que aparecen rodando»: si alguna vez deja de
ser 0, no es un error del código — significa que un reubicado sí maneja y el
filtro de la plantilla lo está dejando fuera sin razón.

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

Pruebas: `npm run test:biometrico`.
