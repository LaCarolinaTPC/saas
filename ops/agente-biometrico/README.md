# Agente del biométrico

Aplicación de escritorio que corre en el PC donde está instalado **ZKAccess 3.5**,
vive en la bandeja del sistema y manda las marcaciones de huella a Gestivo.

Trae las huellas por **dos vías a la vez**:

| | de dónde | cuándo | identidad de la huella |
|---|---|---|---|
| **Access** | `acc_monitor_log` del `Access.mdb` | cada `IntervaloMin` (15 min) | `acc_monitor_log.id` |
| **equipo** | el lector, directo por el SDK de ZK | al instante, enviando cada ~60 s | `(device_sn, pin, momento)` |

La vía Access solo ve lo que alguien ya descargó a mano en ZKAccess, así que
Gestivo iba con horas o días de atraso. La vía equipo da la inmediatez; la de
Access sigue siendo la **historia autoritativa** y el respaldo cuando el equipo
o el PC fallan. La misma huella llegada por las dos puertas es **una sola fila**
en Gestivo, porque la llave natural es la misma.

La vía equipo viene **apagada** (`EquipoHabilitado = false`): desplegar esta
versión no cambia nada hasta que alguien marque la casilla, y volver atrás es
desmarcarla.

El runbook de instalación y el funcionamiento completo están en
[`docs/biometrico-marcaciones.md`](../../docs/biometrico-marcaciones.md). Este
archivo es para quien tenga que compilarla o cambiarla.

## Compilar y publicar

```
publicar.cmd
```

Equivale a `dotnet publish -c Release -o publicar`. Deja en `publicar\` el `.exe`
y `Newtonsoft.Json.dll`: **0,8 MB en total, sin instalador**. Esa carpeta se copia
tal cual al PC del biométrico.

Para compilar sin publicar: `dotnet build -c Release`.

`bin/`, `obj/` y `publicar/` están en `.gitignore`.

`publicar.cmd` corre además las **autopruebas** sobre el `.exe` publicado y no
publica si fallan (ver abajo).

### El SDK del lector: `LibInterop.zkemkeeper.dll`

La vía equipo habla con el lector por `zkemkeeper`, el SDK clásico de ZK, que es
un **COM de 32 bits**. Hacen falta dos cosas distintas:

- **para compilar**, el interop (`LibInterop.zkemkeeper.dll`, versionado en el
  repositorio);
- **para ejecutar**, el COM registrado en 32 bits, que en el PC de ZKAccess ya lo
  está porque es lo que usa ZKAccess. Si no (`reg query HKCRzkemkeeper.ZKEM` no
  devuelve nada), se registra con
  `C:WindowsSysWOW64egsvr32.exe "C:ZKTecoZKAccess3.5zkemkeeper.dll"`.

El interop **no hay que generarlo**: ZKAccess 3.5 ya trae `Interop.zkemkeeper.dll`
en su carpeta de instalación (`C:ZKTecoZKAccess3.5` o
`C:Program Files (x86)ZKTecoZKAccess3.5`). Ese es el que conviene usar, y no
uno descargado: es el que ZKTeco generó de su propio SDK y el que lleva años
hablando con este equipo. COM enlaza por IID de interfaz, así que un interop de
otra compilación puede fallar **en ejecución** y solo se vería en la portería.

Si algún día hubiera que generarlo desde el `zkemkeeper.dll` nativo:

```
"C:Program Files (x86)Microsoft SDKsWindows10.0AinNETFX 4.8 ToolsTlbImp.exe" ^
  zkemkeeper.dll /out:LibInterop.zkemkeeper.dll /namespace:zkemkeeper /machine:x86
```

**El SDK es opcional al compilar.** `DispositivoClienteZk.Com.cs` y
`DispositivoClienteZk.SinSdk.cs` definen la misma clase y el `.csproj` compila
uno u otro según exista el interop. Sin él, el agente entero —incluida la vía
Access, que es la que funciona hoy— se compila y se prueba en cualquier PC, y la
vía equipo queda deshabilitada diciendo qué falta en vez de reventar.
`publicar.cmd` avisa fuerte si publicó sin el SDK, porque eso sería un retroceso
silencioso.

## Por qué .NET Framework 4.8 y x86

No es conservadurismo: es lo que exige el entorno.

- **x86** — ZKAccess 3.5 es una aplicación de 32 bits que usa el proveedor
  **Jet 4.0 de 32 bits** (está en su `Access.exe.config`). Compilando a x86 ese
  proveedor se ve sin instalar nada. En x64 habría que instalar el *Access
  Database Engine* de 64 bits en un PC que nadie quiere tocar. Comprobado: en el
  PowerShell de 32 bits el único proveedor de Access disponible es
  `Microsoft.Jet.OLEDB.4.0`.
- **net48** — viene de fábrica en Windows 10 1903+ y en Windows 11, y para 7/8
  hay un instalador offline de Microsoft. Con .NET 8 habría que instalar un
  runtime (o publicar ~70 MB autocontenidos) en un PC que puede ser viejo.

Una sola dependencia: `Newtonsoft.Json` (4.8 no trae serializador JSON usable).
DPAPI, OLE DB y el registro vienen en el framework.

## Estructura

```
Program.cs                      instancia única (Mutex) y arranque
app.manifest                    sin elevación, consciente de DPI
App/Bandeja.cs                  el icono, el menú y el temporizador
App/FormConfiguracion.cs        la ventana de configuración (sin diseñador)
App/FormEstado.cs               diagnóstico del último ciclo
Nucleo/Configuracion.cs         config.json en %LOCALAPPDATA%
Nucleo/Secretos.cs              cifrado DPAPI del secreto y la clave de la base
Nucleo/Bitacora.cs              un log por día, 30 días
Nucleo/Autoinicio.cs            «Iniciar con Windows» (HKCU\…\Run)
Datos/Proveedor.cs              ACE 16 → ACE 12 → Jet 4.0
Datos/LectorZk.cs               lectura del Access.mdb (SOLO LEE)
Red/ClienteGestivo.cs           los dos endpoints, TLS 1.2, errores legibles
Sincronizacion/Sincronizador.cs el ciclo de la vía ACCESS

Lib/Interop.zkemkeeper.dll      el SDK del lector (de ZKAccess; ver arriba)
Dispositivo/EquipoConfigurado.cs  un lector de `Machines` + ListaEquipos (PURO)
Dispositivo/EventoEquipo.cs       los datos del SDK y la interfaz IEquipoZk
Dispositivo/MapeoEquipo.cs        del SDK a lo que entiende Gestivo (PURO)
Dispositivo/VigilanteZkAccess.cs  ¿está Access.exe abierto? (para cederle)
Dispositivo/ErroresSdk.cs         un `false` del SDK en algo legible (PURO)
Dispositivo/ClienteZk.Com.cs      el COM, en su hilo STA · solo con el interop
Dispositivo/ClienteZk.SinSdk.cs   su reemplazo cuando no hay interop
Sincronizacion/TiempoReal.cs    el coordinador de la vía EQUIPO
App/FormDiagnosticoEquipo.cs    «Probar equipo…»
Pruebas/AutoPruebas.cs          --autopruebas
```

Las ventanas se construyen **a mano**, sin diseñador, para que el proyecto no
arrastre `.Designer.cs` ni `.resx` generados.

### La ventana de Configuración y las pantallas chicas

El PC de la portería puede ser una pantalla de 1024x600 con escalado, así que la
maquetación está hecha para eso y las autopruebas lo comprueban:

- **Tres pestañas** (Gestivo · Biométrico · Lectura directa del equipo). Los
  quince campos en una sola lista pedían del orden de 1.200 px de alto: no cabían
  en 768, y menos con escalado. Repartidos, la pestaña más alta pide ~426 px y la
  ventana entera 674x627.
- **El desplazamiento está en un `Panel` con `AutoScroll`, con la tabla de
  campos dentro en `Dock.Top`.** Antes `AutoScroll` y `AutoSize` estaban en el
  MISMO `TableLayoutPanel`, que es una contradicción —el panel crece hasta su
  tamaño preferido en vez de desplazarse— y lo que no cabía quedaba recortado sin
  forma de alcanzarlo. Con esto, al tamaño mínimo (440x300) todo sigue alcanzable.
- **Los números que son el mismo asunto van en un renglón**, con su rótulo al
  lado (`[15] min  [2000] por lote  [10] lotes máx.`) y una sola ayuda. En
  renglones separados costaban ~55 px cada uno.
- **El pie se calcula**, no se autodimensiona: `OrganizarPie` coloca los botones
  envolviendo cuando no caben y deja el pie con el alto justo. Con posiciones y
  alto fijos, al angostar la ventana el tercer botón se salía y Guardar quedaba
  fuera de la vista. Calculándolo se puede comprobar con pruebas dónde queda cada
  botón — y se comprueba.
- **La columna de etiquetas se MIDE** con la fuente que Windows esté usando, no
  se fija en 170 px. Es lo que la hace resistir el escalado; de hecho la medición
  descubrió que 170 ya estaba justo al 100 % («Nombre de este agente» se
  recortaba por un pelo).
- Las tres ventanas acotan su tamaño inicial al área de trabajo de la pantalla
  (`FormEstado.CabeEnLaPantalla`), para no abrirse medio fuera. Los iconos de la bandeja se dibujan
en código (`App/Bandeja.cs`, clase `Iconos`): son un semáforo de cuatro colores y
no vale la pena meter cuatro `.ico` al repositorio.

## Decisiones que conviene no deshacer

- **La marca de avance vive en el servidor.** El agente pregunta
  `GET /api/biometrico/estado` cada ciclo en vez de guardar un «último id»
  propio. Así un ciclo que muere a mitad no deja nada adelantado, reinstalar el
  PC no pierde nada y la carga histórica es reanudable sola. Cuesta un GET.
- **Solo lectura sobre el `.mdb`** (`Mode=Read`): se puede sincronizar con
  ZKAccess abierto y nunca se toca la base del equipo.
- **`event_type = 14`**, no `CHECKINOUT`. Para el badge 1, `CHECKINOUT` da 41
  registros y `acc_monitor_log` sin filtrar 54; con el filtro, los 14 reales.
- **Nunca dos ciclos a la vez.** Si el temporizador dispara mientras uno trabaja,
  se salta (no se encola): con lotes de 2.000 un ciclo puede durar más que el
  intervalo durante la carga histórica.
- **El secreto con DPAPI de usuario.** Las alternativas eran peores: por línea de
  comandos queda visible en `schtasks /Query`, y una variable de entorno de
  máquina la lee cualquier usuario del PC.
- **`TOP` interpolado en el SQL**, no por parámetro: Jet no acepta parámetro ahí.
  El valor sale de la configuración y se acota a 1..2000 en `LectorZk`; el `id` sí
  va por parámetro.
- **TLS 1.2 forzado** en el constructor estático de `ClienteGestivo`: .NET
  Framework 4.8 no lo habilita siempre según la política del equipo, y Vercel no
  acepta menos.

Y de la vía equipo:

- **El vaciado de la memoria del lector NUNCA es automático.** No hay umbral ni
  horario que lo dispare: solo el botón «Vaciar memoria del equipo…», con
  confirmación. La razón es que el SDK solo sabe borrar TODO el log, y **lo que
  se borre del lector ya no lo podrá descargar ZKAccess**. La secuencia es fija:
  leer la memoria completa → confirmar que Gestivo la recibió **entera** (la
  cuenta tiene que cerrar exacta) → borrar. Si algo falla, no se borra nada.
- **Solo lectura sobre el equipo**, con esa única excepción: nada de
  `SetDeviceTime`, `EnableDevice` ni escrituras de usuarios. El reloj desfasado
  se **avisa**, no se corrige.
- **Se cede la conexión a ZKAccess por PROCESO** (`Access.exe`, sondeo de 3 s,
  15 s de gracia tras cerrarse). Se asume que el MA500 admite **un solo cliente
  TCP**; si no se cediera, ZKAccess mostraría el equipo «desconectado» y nadie
  podría enrolar. El de Office es `MSACCESS.exe`, así que no se confunden.
- **Los eventos se registran ANTES de la lectura de puesta al día**, no después.
  Al revés queda un hueco: lo que pase entre el final de la lectura y el
  `RegEvent` no lo trae nadie hasta la próxima reconexión. Que una huella llegue
  por las dos puertas es inofensivo: la llave natural y la memoria de claves
  vistas la colapsan.
- **El SN del equipo manda sobre el de ZKAccess.** La llave natural en Gestivo es
  por número de serie, y ZKAccess puede tener uno viejo; si no coinciden se usa
  el del equipo y se avisa en la bitácora.
- **Un 4xx de Gestivo descarta el lote; cualquier otro error lo devuelve a la
  cola.** Reintentar un lote que el servidor rechaza por mal formado no lo va a
  arreglar y atascaría todo lo que venga detrás; queda en la bitácora con el
  tramo y los pines para poder rescatarlo. Los errores de red y 5xx sí vuelven,
  al frente y en orden.
- **La marca de avance de la vía equipo también vive en el servidor**, igual que
  la de Access, pero por **número de serie** (`ultimo_momento_equipo`) y no por
  id. Al reconectar se pide desde esa marca menos `EquipoMargenMin` (10 min),
  que cubre el desfase de relojes y lo que quedara en vuelo.

### Cómo se reparte el trabajo en la vía equipo

Un «pump» de un segundo **lanza tareas y no hace el trabajo él mismo**, para que
una lectura de minutos en un lector no detenga a los demás:

- cada **3 s** mira si ZKAccess está abierto y, según eso, conecta o cede;
- cada **60 s** (`TiempoRealFlushSeg`) manda lo acumulado;
- cada **60 s** un latido por lector, para detectar un TCP muerto.

Las operaciones COM de un lector van serializadas por su propio turno, y los
envíos por el suyo. Los eventos del SDK llegan en el hilo del COM y **solo
encolan**: una excepción que escape de ahí sube al bucle de mensajes y tumba el
hilo dueño del COM, y entonces no llegaría ni un evento más.

**La lista de lectores sale de `Machines` de ZKAccess**, no de la configuración
del agente: duplicarla significaría que agregar un lector obliga a tocar dos
sitios y que sus huellas se pierdan hasta que alguien se acuerde. La publica la
vía Access en cada ciclo, que ya tiene la base abierta. Un lector nuevo entra
solo; uno que cambió de IP se reconecta; uno retirado se suelta tras mandar lo
que tuviera en cola.

### Lo que se midió del SDK de esta instalación

Reflexionando el interop con PowerShell **de 32 bits** (el de 64 no puede cargar
un ensamblado x86):

- **`ReadTimeGLogData` y `ReadNewGLogData` no existen.** La lectura por fecha se
  llama **`ReadLastestLogData(equipo, soloNuevos, año, mes, día, hora, min, seg)`**.
  Se usa con `soloNuevos = 0` a propósito, para no gastar el cursor de «no
  leídos» del equipo, que es de ZKAccess.
- **No hay borrado por fecha.** `ClearGLog` borra TODO el log; lo único con rango
  de fechas es `ClearPhotoByTime`, que es de fotos.
- **`out` y `ref` están mezclados dentro de una misma llamada.**
  `SSR_GetGeneralLogData` tiene nueve `out` y un `ref` (el último, `dwWorkCode`).
  Cambiarlos «para que queden uniformes» no compila. Y ojo al reflexionarlo:
  `ParameterInfo.IsOut` **no** distingue `out` de `ref`, porque un `[In][Out]`
  también lleva la bandera `Out`; hay que mirar `IsIn` junto con `IsOut`, y sobre
  la clase `CZKEMClass`, no sobre la interfaz.
- **`Machines` no tiene columna de número de serie** (sus columnas son `ID,
  MachineAlias, ConnectType, IP, SerialPort, Port, Baudrate, MachineNumber,
  IsHost, Enabled`). El SN sale del equipo al conectar y, mientras no haya
  conexión, se deduce de `acc_monitor_log` — hace falta **antes** de conectar,
  para preguntarle al servidor hasta dónde llegó ese lector. Sí hay
  `MachineNumber`, que es el «número de equipo» del SDK.

## Autopruebas

```
publicarGestivo.AgenteBiometrico.exe --autopruebas
publicarGestivo.AgenteBiometrico.exe --autopruebas "C:ZKTecoZKAccess3.5Access.mdb"
```

Cubren la lógica pura (lista de lectores, mapeo, claves, fechas del servidor,
topes de la configuración), una **prueba de humo de las tres ventanas** —se
construyen y se miden sin mostrarlas, que es donde este proyecto ya tuvo errores
de maquetación— y, si se le pasa la ruta de un `Access.mdb`, la lectura real de
`Machines`, `USERINFO` y `acc_monitor_log` (solo lectura).

Devuelven código de salida 0 o 1 y escriben el informe en
`%TEMP%gestivo-autopruebas.txt`. Dos cosas que conviene saber si se toca esto:
el agente es una aplicación de **ventanas**, así que **`cmd` no la espera** (hace
falta `start /wait`) y su salida por consola no llega a un `.cmd` redirigido —de
ahí el informe en archivo.

## Probar la capa de datos sin levantar la interfaz

Como el ensamblado es x86, hay que cargarlo desde el **PowerShell de 32 bits**:

```powershell
& "$env:windir\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command {
  $base = "C:\Proyectos\La Carolina\saas\ops\agente-biometrico\publicar"
  [Reflection.Assembly]::LoadFrom("$base\Newtonsoft.Json.dll") | Out-Null
  $asm = [Reflection.Assembly]::LoadFrom("$base\Gestivo.AgenteBiometrico.exe")
  $prov = $asm.GetType("Gestivo.AgenteBiometrico.Datos.Proveedor")
  $elegido = $prov.GetMethod("Resolver").Invoke($null, @(""))
  $t = $asm.GetType("Gestivo.AgenteBiometrico.Datos.LectorZk")
  $l = [Activator]::CreateInstance($t, @($elegido, "C:\ruta\Access.mdb", ""))
  "MaximoId: " + $t.GetMethod("MaximoId").Invoke($l, @())
  "Personas: " + $t.GetMethod("LeerPersonas").Invoke($l, @()).Count
  $t.GetMethod("Dispose").Invoke($l, @())
}
```

Desde el PowerShell de 64 bits falla con *«The assembly architecture is not
compatible with the current process architecture»*, que es justamente la
restricción que motiva el diseño.

## Si hiciera falta un servicio de Windows

La bandeja necesita una sesión de Windows abierta. `Sincronizacion/Sincronizador.cs`
no depende de la interfaz: recibe la configuración por un `Func<Configuracion>` y
reporta por un evento. Envolverlo en un `ServiceBase` (o en un *worker*) es
agregar un proyecto que lo instancie con un temporizador, sin tocar lo demás. No
se hizo porque la configuración desde la bandeja era parte de lo pedido.
