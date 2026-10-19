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
los 30 minutos y rojo a los 120** sin noticias. Eso importa: si el agente lleva
dos horas caído, alguien que sí marcó puede aparecer como «sin marcación».

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

Si no hay programación sincronizada para esa fecha, el respaldo es todo conductor
en plantilla ese día (chip **Plantilla**), y la pantalla lo dice.

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

## La pantalla: Ausentismo › Marcaciones

`/ausentismo/marcaciones`. Permiso: el del módulo `ausentismo` (no tiene clave
propia); el botón «Registrar novedad» exige además poder editar.

### Las cinco fichas

| Ficha | Qué cuenta |
|---|---|
| **Se esperaban** | Conductores deducidos de la programación (o de la plantilla) |
| **Marcaron** | De los esperados, cuántos pasaron la huella |
| **Sin marcación** | No marcó, GEMA **no** lo despachó y **no** tiene novedad: lo que hay que revisar |
| **Trabajó sin marcar** | GEMA lo despachó pero no hay huella. **No es una ausencia**: es el uso del biométrico |
| **Sin maestro** | Marcaron sin estar en la lista: pin sin cédula en el equipo, o no esperados (relevos, ruleta, administrativos) |

Cada esperado cae en **exactamente una** de: marcaron, sin marcación, trabajó
sin marcar, o con novedad. Las sumas cuadran siempre.

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
cuándo no aparece» son barridos de un solo índice. Cuando el SSN del equipo se
llena después, la función `biometrico_reresolver_cedulas()` reatribuye las
marcaciones viejas de ese pin sola, sin recargar nada.

### Data API y MCP

`biometrico_marcaciones` se expone **solo lectura** a quien tenga el módulo
`ausentismo`, con su documentación en el catálogo del MCP (advertencias
incluidas: una marcación que falta no es una ausencia, contar filas no es contar
personas, hay diez personas con dos pines). `biometrico_personas` y
`biometrico_envios` no se exponen.

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
| `src/lib/biometrico/esperados.ts` | La cascada de quién debía venir |
| `src/lib/biometrico/data.ts` | Lecturas de la pantalla |
| `src/app/api/biometrico/{estado,marcaciones}/route.ts` | Los dos endpoints |
| `src/app/(dashboard)/ausentismo/marcaciones/` | La pantalla |
| `src/app/(dashboard)/ausentismo/registro-form.tsx` | El formulario, compartido con Registro del día |
| `ops/agente-biometrico/` | La aplicación del PC (ver su `README.md`) |

Pruebas: `npm run test:biometrico`.
