# Biométrico: poner la cédula de Gestivo en el «N.º de identificación»

El biométrico (ZKAccess 3.5, base `Access.mdb`) identifica a cada persona solo
por **badge** y **nombre escrito a mano en el equipo**. El campo
«N.º de identificación» (`USERINFO.CardNo`) venía vacío en 788 de las 790
personas, y `USERINFO.SSN` en su valor de fábrica `"0"` en las 790, así que
cualquier cruce con Gestivo había que hacerlo por nombre: frágil, y con un
92 % de acierto en el mejor de los casos.

Este flujo escribe la cédula de Gestivo en ese campo. Desde entonces el cruce
es exacto y no hay que volver a adivinar.

La cédula se escribe en **las dos columnas**, `CardNo` y `SSN`, con el mismo
valor. `CardNo` es el campo que muestra la interfaz como «N.º de tarjeta»; `SSN`
es el que otras herramientas de ZK leen como documento. Tenerlo duplicado hace
que cualquiera de los dos sirva, y el agente manda las dos crudas para que el
servidor tome la que valga.

### La tarjeta vive en dos tablas

ZKAccess guarda el número de tarjeta en **dos sitios**, y la interfaz escribe
los dos:

| Tabla | Qué es |
|---|---|
| `USERINFO.CardNo` | La copia que muestra la pantalla de Personal. |
| `personnel_issuecard` | El registro de la tarjeta entregada: `UserID_id`, `cardno`, `isvalid`, `cardstatus`, quién la entregó y cuándo. |

Se comprobó con las dos únicas personas que ya tenían tarjeta antes de todo
esto, y las dos filas calzan exactamente:

| USERID | badge | `USERINFO.CardNo` | `personnel_issuecard.cardno` | creada por la interfaz |
|---|---|---|---|---|
| 634 | 1 | `4149901` | `4149901` | 2022-08-10 |
| 1585 | 940 | `72250850` | `72250850` | 2026-02-02 |

**Escribir solo `USERINFO.CardNo` deja la tarjeta sin registrar**, así que el
script escribe las dos en la misma transacción. `-NoRegistrarTarjeta` lo
desactiva, y el registro se omite solo si `CardNo` no está entre `-Columnas`
(sin `CardNo` no tiene sentido).

Las filas que escribe el script quedan **idénticas en forma** a las que crea la
interfaz; se comparó columna por columna. Dos detalles que hubo que igualar:

- `id` es autonumérico: se omite y Jet lo asigna.
- **`issuedate` tiene un valor por omisión en el esquema** (`2011-07-15`) que se
  cuela si no se nombra la columna. La interfaz la deja nula, así que el
  `INSERT` nombra explícitamente `issuedate`, `effectivenessdate` y
  `failuredate` con `NULL`, y `change_operator` / `delete_operator` con `''`.
- `create_operator = 25`, que en `auth_user` es `admin` (Super Admin), el único
  operador de esta instalación.

**El badge no sirve como llave.** Se comprobó: de los 732 cruces seguros,
**cero** coinciden con `conductores.codigo` ni con `employees.gema_codigo`. La
numeración del biométrico es suya y no tiene relación con la de GEMA. La cédula
es lo único que comparten los dos sistemas.

## El flujo, en cuatro pasos

```
1. biometrico-exportar-zk.ps1   Access.mdb  ->  %TEMP%\gestivo-biometrico\zk.json
2. npm run biometrico:cruce     zk.json + Gestivo  ->  cruce-biometrico-<fecha>.xlsx
   ... una persona llena la columna azul de las filas pendientes ...
3. npm run biometrico:resolver  el Excel  ->  correspondencias.json
4. biometrico-aplicar-ssn-zk.ps1  correspondencias.json  ->  UPDATE USERINFO.CardNo + .SSN
```

Los pasos 2 y 3 necesitan Node y las llaves de Supabase: se corren en el equipo
de desarrollo. Los pasos 1 y 4 son PowerShell puro y se corren **donde esté la
base** (no necesitan Node, ni red, ni Supabase).

Todas las salidas van a `%TEMP%\gestivo-biometrico`: llevan nombres y cédulas,
así que **nada de esto va al repositorio**.

## Solo importa quien sigue trabajando

El 74 % de las personas del biométrico ya está retirada (528 de los 732
cruces). Decisión del usuario (2026-10-19): **si la persona ya no está, su
historial antiguo no interesa.**

Por eso el biométrico no sirve para saber quién está activo —su `USERINFO` no
guarda estado ni fecha de retiro— y se usa la **última marcación** como única
señal: «sigue marcando» = marcó en los últimos **90 días** (`DIAS_ACTIVO` en
`scripts/biometrico-cruce-excel.mts`).

Consecuencias prácticas:

- De las 58 filas que no cruzan solas, solo **12** son de gente que sigue
  marcando. Esas 12 son el único trabajo manual.
- Las otras **46 se descartan**: quedan con `SSN = "0"` a propósito. El
  resolvedor las reporta y no las exige.
- La hoja **Conflictos** solo lista los de gente que sigue marcando. Los demás
  se cuentan en el Resumen y nada más.

## Las rutas: copie los scripts junto al `Access.mdb`

Los dos `.ps1` **buscan los archivos en la carpeta desde la que se ejecutan**
(y, si no, en la carpeta del propio script, porque con «Ejecutar con
PowerShell» del Explorador la carpeta actual no siempre es esa). Así que lo
normal es copiar junto al `Access.mdb`:

| Archivo | Para qué |
|---|---|
| `biometrico-exportar-zk.ps1` | Paso 1 |
| `biometrico-aplicar-ssn-zk.ps1` | Paso 4 |
| `correspondencias.json` | Lo que el paso 4 escribe (solo para la pasada de aplicar) |

Abra una consola ahí y ejecute **sin parámetros**. Si falta algo, el script
dice qué buscaba y dónde, y sale con código 1 — no pregunta ni adivina.

`-Mdb` y `-Correspondencias` siguen funcionando para correrlo desde otra
carpeta, y aceptan la ruta **entre comillas** tal como la entrega «Copiar como
ruta de acceso» del Explorador.

## Paso 1 — Exportar la base

```powershell
# En la carpeta del Access.mdb
powershell -ExecutionPolicy Bypass -File .\biometrico-exportar-zk.ps1

# O desde otra parte
powershell -ExecutionPolicy Bypass -File scripts\biometrico-exportar-zk.ps1 -Mdb "C:\ruta\Access.mdb"
```

Solo lee; se puede correr con ZKAccess abierto. Imprime la marcación más
reciente: **si no es de hoy, esa no es la base viva.**

Las marcaciones salen de `acc_monitor_log` con `event_type = 14` agrupadas por
`pin`, **no de `CHECKINOUT`**. Es lo que hacía el exportador original: para el
badge 1, `CHECKINOUT` da 41 registros y `acc_monitor_log` sin filtro da 54,
pero con `event_type = 14` da los 14 correctos.

## Paso 2 — Generar el Excel

```bash
npm run biometrico:cruce
```

La regla del cruce: **el nombre de Gestivo debe contener todos los apellidos
del biométrico más su primer nombre de pila.** No por igualdad, porque el
equipo guarda un solo nombre («Jair») y Gestivo el legal («JAIR ENRIQUE DONADO
BARRIOS»): por igualdad cruzaba el 18 %, por contención el 92 %.

Nunca resuelve con más de un candidato: eso lo decide una persona.

El Excel trae cuatro hojas:

| Hoja | Para qué |
|---|---|
| **Maestro Gestivo** | Los 1.601 conductores y empleados. Es la fuente del desplegable. |
| **Correspondencias** | Una fila por persona del biométrico. Las pendientes de gente que sigue marcando van **primero**. |
| **Conflictos** | Lo que hay que verificar antes de confiar en el cruce. |
| **Resumen** | Las cifras y qué hacer. |

## Paso 2b — Llenar las pendientes

En la hoja **Correspondencias**, columna **«Nombre en Gestivo (corregir aquí)»**
(la azul): elija el nombre del desplegable. Están al principio, con `SI` en
«Sigue marcando».

**Cuando el desplegable no alcanza, escriba la cédula en esa misma celda.**
Hace falta cuando el nombre está repetido en Gestivo — y pasa seguido, porque
hay registros duplicados con la cédula mal digitada:

| Nombre | Una cédula | La otra |
|---|---|---|
| IVAN ANTONIO MARTINEZ HOYOS | `724432641` | `72432641` (un dígito menos) |
| DAVID ENRIQUE MANOTAS MARTINEZ | `852700636` | `8527063` |
| ERWIN ALFREDO JIMENEZ CANTILLO | `8803158` | `8803185` (transpuesta) |

El resolvedor **detiene todo** si el nombre elegido tiene un gemelo con las
palabras en otro orden y otra cédula: elegir del desplegable no distingue cuál
es la buena. Hay que averiguarlo y escribir la cédula.

La columna «Cédula corregida (automática)» es solo una ayuda visual. El
resolvedor **la recalcula y no confía en ella**, justamente porque su fórmula
`INDEX/MATCH` toma el primer nombre que coincide.

### La hoja Conflictos

| Tipo | Qué significa |
|---|---|
| `CEDULA EN DOS BADGES` | La persona está enrolada dos veces en el equipo. Los dos badges reciben la misma cédula (correcto), pero su asistencia está partida: decida si borra el enrolamiento viejo en ZKAccess. |
| `NOMBRE REPETIDO EN GESTIVO` | Dos registros distintos con el mismo nombre y cédulas que se parecen. Casi siempre es **un duplicado con la cédula mal digitada en Gestivo**: arréglelo allá. |
| `POSIBLE ERRATA EN ZK` | El nombre del equipo parece el mismo mal escrito («RICAHRD» por «RICHARD»). Corregirlo en ZKAccess arregla el dato en origen. |
| `DOS BADGES, MISMA PERSONA?` | Mismos apellidos y primer nombre en dos badges, escritos distinto. |
| `PIN BORRADO CON HISTORIA` | Tiene marcaciones pero ya no está en `USERINFO`: lo borraron del equipo. Sin nombre no hay forma de cruzarlo. |

## Paso 3 — Resolver

```bash
npm run biometrico:resolver
# o, si el Excel llega por otra ruta:
npm run biometrico:resolver -- --excel "C:\ruta\cruce-biometrico-2026-10-19.xlsx"
```

Toma el `cruce-biometrico-*.xlsx` más reciente de `%TEMP%\gestivo-biometrico`.
No toca Supabase: las cédulas salen de la hoja «Maestro Gestivo» del mismo
libro, que es la lista de la que eligió la persona.

**Si hay un solo error, no escribe nada.** Los errores posibles:

- `NO ENCONTRADO` — el nombre escrito no está en el maestro.
- `AMBIGUO` — el nombre corresponde a varias personas: escriba la cédula.
- `NOMBRE DUPLICADO EN GESTIVO` — el gemelo con las palabras al revés.
- `CEDULA NO VALIDA` — un UUID en vez de cédula: ese empleado no tiene número
  de documento en Gestivo, corríjalo allá.
- `BADGE REPETIDO` — el Excel se editó mal (filas copiadas).
- `CORRECCION de un cruce automático` — se cambió una fila que ya cruzaba. Si
  es correcto, repita con `--aceptar-correcciones`.

Banderas:

| Bandera | Qué hace |
|---|---|
| `--excel <ruta>` | Usa ese Excel en vez del más reciente. |
| `--aceptar-correcciones` | Permite cambiar cruces automáticos. |
| `--incluir-inactivos` | Exige también las 46 filas de gente que ya no marca (por defecto se descartan). |

## Paso 4 — Aplicar

**Es el único script que escribe. Sin `-Aplicar` no toca nada.**

En la carpeta donde están el `Access.mdb` y el `correspondencias.json`:

```powershell
# Ensayo: imprime exactamente lo que haría
powershell -ExecutionPolicy Bypass -File .\biometrico-aplicar-ssn-zk.ps1

# Piloto de dos personas
powershell -ExecutionPolicy Bypass -File .\biometrico-aplicar-ssn-zk.ps1 -Badges 27,89 -Aplicar

# Todo
powershell -ExecutionPolicy Bypass -File .\biometrico-aplicar-ssn-zk.ps1 -Aplicar
```

Las guardas, en orden:

1. **Rechaza** si hay `Access.ldb` / `.laccdb` (ZKAccess tiene la base abierta).
   En ensayo solo avisa.
2. **Respaldo** con fecha y hora en `<carpeta del MDB>\respaldos`, verificando
   el tamaño, antes de abrir para escribir.
3. **Transacción**: si un `UPDATE` no afecta exactamente 1 fila, revierte todo
   y sale con código 2.
4. **Compara el nombre** del equipo contra el del JSON. Si no coincide, **salta
   esa fila y sigue**. Es lo que permite resolver el Excel sobre una copia y
   aplicarlo después a la base viva.
5. **No pisa** un valor que ya exista y sea distinto, salvo `-Sobrescribir`.
   `"0"` y vacío cuentan como sin cédula.
6. **Re-lee y verifica** cada celda escrita, y cuenta `acc_monitor_log` y
   `CHECKINOUT` antes y después para probar que no se movió nada más.

La decisión es **por celda, no por fila**: a quien ya tenga `CardNo` puesto y
`SSN` vacío solo se le escribe `SSN`, y el `UPDATE` de esa fila no menciona
`CardNo`. Por eso el resumen cuenta filas y celdas aparte.

Categorías del resumen: `Por actualizar`, `Ya tenían la cédula` (todas las
columnas pedidas; una re-ejecución es inofensiva), `Badge que ya no existe`,
`Nombre distinto (saltado)`, `Ya tenía otro valor`.

Códigos de salida: **0** bien · **1** rechazado antes de tocar nada ·
**2** revertido.

| Parámetro | Para qué |
|---|---|
| `-Badges 27,89` | Piloto: solo esos badges. |
| `-Sobrescribir` | Pisar valores que ya existen. |
| `-Columnas CardNo` | Escribir en una sola columna. Por defecto son `CardNo,SSN`. `identitycard` también vale. |
| `-NoRegistrarTarjeta` | No tocar `personnel_issuecard`. Deja la tarjeta sin registrar: ver «La tarjeta vive en dos tablas». |
| `-Proveedor` | Forzar el proveedor OLE DB. |
| `-Respaldos`, `-Log` | Cambiar dónde quedan. |

## Runbook del equipo donde corre ZKAccess

1. Copiar **a la carpeta del `Access.mdb`**: `biometrico-exportar-zk.ps1`,
   `biometrico-aplicar-ssn-zk.ps1` y el `correspondencias.json`. **Node no hace
   falta.** El JSON lleva cédulas: bórrelo de ese equipo al terminar.
2. Confirmar que ese `Access.mdb` **es la base viva** (ZKAccess 3.5 también
   puede correr sobre SQL Server): corra el exportador y mire la marcación más
   reciente que imprime.
3. **Cerrar ZKAccess en todos los PC.** Confirmar que no queda `Access.ldb`.
4. **No regenere el Excel.** Aplique el JSON ya resuelto: la guarda de nombre
   salta cualquier badge que haya cambiado, y los badges nuevos simplemente no
   están en el JSON.
5. Secuencia:
   - ensayo → leer el resumen;
   - `-Badges <dos badges> -Aplicar`;
   - abrir ZKAccess → Personal → **confirmar que «N.º de identificación»
     muestra la cédula** en esos dos;
   - **editar y guardar uno desde la interfaz**, para ver si ZKAccess se queja
     de cédulas repetidas (ver «Riesgos»);
   - cerrar ZKAccess → `-Aplicar` completo → reabrir → revisar un Operativo, un
     Administrativo y los dos badges de una cédula repetida.
6. Segunda vuelta, para lo que quedó: exportar la base viva, traer el
   `zk.json`, `npm run biometrico:cruce`, entregar el Excel nuevo, resolver y
   aplicar otra vez. Es idempotente: lo que ya tiene cédula sale como «ya
   tenían la cédula».
7. Dejar el respaldo un par de semanas junto al MDB.

## Si falla por el proveedor de Access

ZKAccess 3.5 es de 32 bits, así que su equipo puede tener solo el proveedor de
32 bits. Los dos scripts lo autodetectan (ACE 16 → ACE 12 → Jet 4.0) y, si no
encuentran ninguno, dicen qué hacer:

```
%windir%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -File <el script> ...
```

Los scripts son compatibles con **Windows PowerShell 5.1**: sin `??` ni
ternarios, y los mensajes en ASCII.

## Riesgos conocidos

1. ~~**`SSN` o `identitycard`.**~~ **Resuelto: es `CardNo`.** Dos señales
   independientes lo confirmaron. El badge 940 ya traía `72250850` en `CardNo`,
   que es **exactamente** la cédula que el cruce por nombre le asignó, y el
   badge 1 traía `4149901`, una cédula vieja de siete dígitos; nadie había
   escrito nunca en `SSN`, que estaba en `"0"` en las 790. En este equipo no se
   usan tarjetas RFID, así que `CardNo` está libre. Hoy se escriben las dos
   columnas, y `identitycard` sigue disponible con `-Columnas`.
2. **Cédulas repetidas.** Diez cédulas quedan en dos badges (la persona está
   enrolada dos veces). La base no impone unicidad ni en `CardNo` ni en `SSN`
   —no tienen índice— pero no se sabe si la **interfaz** de ZKAccess se queja.
   Por eso el piloto incluye editar y guardar uno desde la interfaz. Si se
   queja, la decisión es del usuario: dejar el segundo badge vacío, o borrar el
   enrolamiento duplicado. Para Gestivo no es problema: dos pines con la misma
   cédula se agrupan por cédula en la pantalla.
3. **Normalizadores en dos lenguajes.** `tokens()`/`claveNombre()` en
   `scripts/biometrico-comun.mts` y `Clave()` en
   `biometrico-aplicar-ssn-zk.ps1` **deben dar el mismo resultado**: de eso
   depende la guarda de nombre. Casos de prueba, con sus tildes:
   `Muñoz Varela`, `Cepeda Meriño`, `GUERRA  ACUÑA`, `Guadaño De la hoz`.
4. **Los 261 pines borrados** tienen 38.454 marcaciones y ya no están en
   `USERINFO`. No tienen nombre en ninguna parte: no hay forma de cruzarlos.

## Archivos

| Archivo | Qué hace |
|---|---|
| `scripts/biometrico-comun.mts` | Piezas compartidas: entorno, lector de Supabase, normalizador de nombres, tipos. |
| `scripts/biometrico-exportar-zk.ps1` | Base → `zk.json`. Solo lee. |
| `scripts/biometrico-cruce-excel.mts` | `zk.json` + Gestivo → Excel. Solo lee. |
| `scripts/biometrico-resolver-correspondencias.mts` | Excel → `correspondencias.json`. Toda la validación. |
| `scripts/biometrico-aplicar-ssn-zk.ps1` | `correspondencias.json` → `UPDATE`. El único que escribe. |

## Para qué sirvió

Con la cédula en el equipo, Gestivo puede atribuir cada marcación de huella a
una persona sin adivinar por nombre. Eso es lo que hace el módulo de
**marcaciones**: ver cada día quién debía venir y no marcó. Ver
[biometrico-marcaciones.md](biometrico-marcaciones.md).
