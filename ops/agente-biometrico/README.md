# Agente del biométrico

Aplicación de escritorio que corre en el PC donde está instalado **ZKAccess 3.5**,
vive en la bandeja del sistema y manda las marcaciones de huella a Gestivo.

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
Sincronizacion/Sincronizador.cs el ciclo
```

Las ventanas se construyen **a mano**, sin diseñador, para que el proyecto no
arrastre `.Designer.cs` ni `.resx` generados. Los iconos de la bandeja se dibujan
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
