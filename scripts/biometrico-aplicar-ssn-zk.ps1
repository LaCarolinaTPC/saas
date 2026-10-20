<#
.SYNOPSIS
  Escribe la cedula de Gestivo en USERINFO de la base de ZKAccess 3.5, en
  CardNo (el "N.o de identificacion" de la interfaz) y en SSN. ENSAYO por
  defecto.

.DESCRIPTION
  Es el UNICO script de este flujo que escribe. Toma el correspondencias.json
  que produce biometrico-resolver-correspondencias.mts y, por cada badge,
  actualiza una sola fila de USERINFO.

  Por defecto escribe la MISMA cedula en las dos columnas (-Columnas
  CardNo,SSN). La decision es por celda: a quien ya tenga CardNo puesto y SSN
  vacio solo se le escribe SSN, y si las dos ya estan, no se toca.

  Y registra la tarjeta en personnel_issuecard, que es lo que hace que la
  interfaz de ZKAccess muestre el "N.o de tarjeta". ZKAccess lo guarda en DOS
  sitios y la interfaz escribe los dos: USERINFO.CardNo (la copia) y
  personnel_issuecard (el registro: a quien, si esta vigente, quien la entrego
  y cuando). Escribir solo CardNo deja la tarjeta sin registrar.
  -NoRegistrarTarjeta lo desactiva.

  Todo va en una sola transaccion: si algo falla, no queda nada a medias.

  Sin -Aplicar no escribe nada: imprime exactamente lo que haria y termina.

  Guardas, en orden:
    1. Rechaza si ZKAccess tiene la base abierta (.ldb / .laccdb).
    2. Respaldo con fecha y hora ANTES de abrir para escribir.
    3. Transaccion: si un UPDATE no afecta exactamente 1 fila, revierte todo.
    4. Compara el nombre del equipo contra el del JSON. Si no coincide, SALTA
       esa fila y sigue: es lo que permite resolver el Excel sobre una copia y
       aplicarlo despues a la base viva sin arrastrar datos de otra persona.
    5. No pisa un valor que ya este puesto y sea distinto, salvo -Sobrescribir.
    6. Re-lee al final y verifica. Cuenta las tablas de marcaciones antes y
       despues para probar que no se movio nada mas.

  Compatible con Windows PowerShell 5.1.

  Pensado para copiarlo junto al Access.mdb con el correspondencias.json,
  abrir una consola en esa carpeta y ejecutarlo SIN parametros: los dos
  archivos se buscan ahi. Si falta alguno, falla diciendo donde busco.

.EXAMPLE
  # Lo normal: en la carpeta donde estan Access.mdb y correspondencias.json.
  # Ensayo, no escribe nada.
  powershell -ExecutionPolicy Bypass -File .\biometrico-aplicar-ssn-zk.ps1

.EXAMPLE
  # Piloto de dos personas, para confirmar en la interfaz de ZKAccess
  powershell -ExecutionPolicy Bypass -File .\biometrico-aplicar-ssn-zk.ps1 -Badges 27,89 -Aplicar

.EXAMPLE
  # Todo
  powershell -ExecutionPolicy Bypass -File .\biometrico-aplicar-ssn-zk.ps1 -Aplicar

.EXAMPLE
  # Con las rutas explicitas, desde cualquier carpeta
  powershell -ExecutionPolicy Bypass -File scripts\biometrico-aplicar-ssn-zk.ps1 -Mdb "C:\ZKAccess\Access.mdb" -Correspondencias "D:\correspondencias.json"

.EXAMPLE
  # Solo una columna (lo que hacia la version anterior)
  powershell -ExecutionPolicy Bypass -File .\biometrico-aplicar-ssn-zk.ps1 -Columnas CardNo -Aplicar

.NOTES
  Codigos de salida: 0 bien, 1 rechazado antes de tocar nada, 2 revertido.
#>
[CmdletBinding()]
param(
  # Ruta del Access.mdb de ZKAccess. Si no se da, el script la pide.
  [string] $Mdb = "",

  # JSON del resolvedor. Si no se da, el script la pide (ofreciendo el de %TEMP%).
  [string] $Correspondencias = "",

  # Sin esto no se escribe nada.
  [switch] $Aplicar,

  # Pisar un valor que ya este puesto y sea distinto.
  [switch] $Sobrescribir,

  # Piloto: solo estos badges. Vacio = todos los del JSON.
  [string[]] $Badges = @(),

  # No registrar la tarjeta en personnel_issuecard.
  #
  # ZKAccess guarda el numero de tarjeta en DOS sitios: USERINFO.CardNo (la
  # copia que muestra la pantalla de Personal) y personnel_issuecard (el
  # registro de la tarjeta entregada: a quien, si esta vigente, quien la
  # entrego y cuando). La interfaz escribe los dos. Se comprobo con las dos
  # unicas personas que ya tenian tarjeta: USERID 634 -> 4149901 y USERID
  # 1585 -> 72250850, cada una con su fila en personnel_issuecard.
  #
  # Escribir solo CardNo deja la tarjeta sin registrar, asi que por defecto se
  # escriben las dos. Solo aplica si CardNo esta entre -Columnas.
  [switch] $NoRegistrarTarjeta,

  # Columnas de USERINFO donde escribir la cedula. Por defecto las DOS.
  #
  # CardNo es el "N.o de identificacion" de la interfaz de ZKAccess, confirmado
  # con los datos: de las 790 personas, las unicas dos con algo en ese campo lo
  # tienen con forma de cedula (badge 940 -> 72250850, que es exactamente la
  # cedula que el cruce le asigno por nombre; badge 1 -> 4149901, una cedula
  # vieja de 7 digitos). Nadie habia escrito nunca en SSN, que esta en su valor
  # de fabrica "0" en las 790.
  #
  # Se escribe en las dos a proposito: SSN es el campo que otras herramientas de
  # ZK leen como documento, y tenerlo duplicado hace que cualquiera de los dos
  # sirva. El agente manda las dos crudas y el servidor toma la que valga, asi
  # que esto es redundancia deliberada, no un requisito.
  #
  # Una fila se decide columna por columna: si CardNo ya tiene la cedula y SSN
  # no, solo se escribe SSN.
  #
  # En este ZKAccess no se usan tarjetas RFID, asi que CardNo esta libre.
  [string[]] $Columnas = @("CardNo", "SSN"),

  # Proveedor OLE DB a la fuerza. Vacio = autodetectar.
  [string] $Proveedor = "",

  # Carpeta de respaldos. Vacio = <carpeta del MDB>\respaldos.
  [string] $Respaldos = "",

  # Archivo de bitacora. Vacio = %TEMP%\gestivo-biometrico\aplicar-ssn-<fecha>.log
  [string] $Log = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$sello = (Get-Date).ToString("yyyyMMdd-HHmmss")
if (-not $Log) {
  $Log = Join-Path $env:TEMP ("gestivo-biometrico\aplicar-ssn-{0}.log" -f $sello)
}
$carpetaLog = Split-Path -Parent $Log
if ($carpetaLog -and -not (Test-Path -LiteralPath $carpetaLog)) {
  [void] (New-Item -ItemType Directory -Path $carpetaLog -Force)
}

# Toda linea que ve la persona queda tambien en la bitacora. Lleva cedulas: por
# eso vive en %TEMP% y no en el repositorio.
function Escribir {
  param([string] $Texto = "")
  Write-Host $Texto
  Add-Content -LiteralPath $Log -Value $Texto -Encoding UTF8
}

# ── Rutas ──────────────────────────────────────────────────────────────────
# Pensado para copiar los dos .ps1 y el correspondencias.json a la carpeta
# donde vive el Access.mdb, abrir ahi una consola y ejecutar sin parametros:
# los archivos se buscan en la carpeta actual. Si no estan, falla diciendo
# donde busco. Pasar -Mdb o -Correspondencias sigue funcionando igual.

<#
  Limpia una ruta escrita a mano. "Copiar como ruta de acceso" del Explorador
  de Windows entrega la ruta ENTRE COMILLAS, y pegada tal cual no existe.
#>
function Limpiar-Ruta {
  param([string] $Texto)
  if (-not $Texto) { return "" }
  $t = $Texto.Trim()
  $t = $t.Trim('"')
  $t = $t.Trim("'")
  return $t.Trim()
}

<#
  Ruta de un archivo de entrada: la que se dio por parametro, o el archivo con
  ese nombre en la carpeta actual.

  Se busca tambien en la carpeta del propio script ($PSScriptRoot) porque al
  abrirlo con "Ejecutar con PowerShell" desde el Explorador la carpeta actual
  no siempre es la del archivo. Y en las carpetas extra que pase el llamador
  (el %TEMP% de este equipo, para el JSON).
#>
function Resolver-Entrada {
  param(
    [string] $Dada,
    [string] $Nombre,
    [string] $Para,
    [string[]] $Extra = @()
  )

  if ($Dada) {
    $r = Limpiar-Ruta $Dada
    if (-not (Test-Path -LiteralPath $r -PathType Leaf)) {
      throw ("No existe el archivo que se indico para {0}: {1}" -f $Para, $r)
    }
    return (Resolve-Path -LiteralPath $r).Path
  }

  $carpetas = @($PWD.Path)
  if ($PSScriptRoot) { $carpetas += $PSScriptRoot }
  foreach ($e in $Extra) { if ($e) { $carpetas += $e } }
  $carpetas = @($carpetas | Select-Object -Unique)

  foreach ($c in $carpetas) {
    $candidato = Join-Path $c $Nombre
    if (Test-Path -LiteralPath $candidato -PathType Leaf) {
      return (Resolve-Path -LiteralPath $candidato).Path
    }
  }

  $donde = ($carpetas | ForEach-Object { "  - " + $_ }) -join "`n"
  throw ("No se encontro {0} ({1}).`nSe busco en:`n{2}`n" -f $Para, $Nombre, $donde) +
        ("Copie el archivo a la carpeta actual, o indiquelo con el parametro correspondiente.")
}

# ── Proveedor ──────────────────────────────────────────────────────────────
# Misma funcion en biometrico-exportar-zk.ps1 (duplicada a proposito: un
# archivo menos que copiar al equipo donde corre ZKAccess).
function Resolver-Proveedor {
  param([string] $Preferido)

  if ($Preferido) { return $Preferido }

  $disponibles = @()
  try {
    $enum = New-Object System.Data.OleDb.OleDbEnumerator
    $disponibles = @($enum.GetElements() | ForEach-Object { $_.SOURCES_NAME })
  } catch {
    Write-Verbose "No se pudo enumerar proveedores: $($_.Exception.Message)"
  }

  foreach ($p in @("Microsoft.ACE.OLEDB.16.0", "Microsoft.ACE.OLEDB.12.0", "Microsoft.Jet.OLEDB.4.0")) {
    if ($disponibles -contains $p) { return $p }
  }

  throw ("No hay proveedor de Access en este PowerShell. Instale el Microsoft Access Database Engine, " +
         "o si ZKAccess es de 32 bits use el PowerShell de 32 bits:`n" +
         "  %windir%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -File <este script> ...")
}

# Devuelve las FILAS: PowerShell enumera un DataTable al retornarlo.
function Consultar {
  param(
    [System.Data.OleDb.OleDbConnection] $Conexion,
    [string] $Sql
  )
  $cmd = $Conexion.CreateCommand()
  $cmd.CommandText = $Sql
  $adaptador = New-Object System.Data.OleDb.OleDbDataAdapter $cmd
  $tabla = New-Object System.Data.DataTable
  [void] $adaptador.Fill($tabla)
  return $tabla.Rows
}

function Escalar {
  param(
    [System.Data.OleDb.OleDbConnection] $Conexion,
    [string] $Sql
  )
  $cmd = $Conexion.CreateCommand()
  $cmd.CommandText = $Sql
  $v = $cmd.ExecuteScalar()
  if ($null -eq $v -or $v -is [System.DBNull]) { return 0 }
  return [int64] $v
}

function Celda {
  param($Valor)
  if ($null -eq $Valor -or $Valor -is [System.DBNull]) { return "" }
  return ([string] $Valor).Trim()
}

<#
  Normalizador de nombres. DEBE dar el mismo resultado que tokens()/claveNombre()
  de scripts/biometrico-comun.mts: N con tilde -> N, sin tildes, mayusculas,
  todo lo que no sea letra o digito -> un espacio.

  Casos de prueba (los mismos del lado de TypeScript):
    "Munoz Varela"      -> "MUNOZ VARELA"
    "Cepeda Merino"     -> "CEPEDA MERINO"
    "GUERRA  ACUNA"     -> "GUERRA ACUNA"
    "Guadano De la hoz" -> "GUADANO DE LA HOZ"
#>
function Clave {
  param([string] $Texto)
  if (-not $Texto) { return "" }
  $s = $Texto -replace "[\u00D1\u00F1]", "N"
  $s = $s.Normalize([System.Text.NormalizationForm]::FormD)
  $s = $s -replace "\p{Mn}", ""
  $s = $s.ToUpperInvariant()
  $s = $s -replace "[^A-Z0-9]+", " "
  return $s.Trim()
}

# ── Columnas de destino ────────────────────────────────────────────────────
# Mismo problema que -Badges: "powershell -File ... -Columnas CardNo,SSN"
# entrega UN solo elemento "CardNo,SSN", porque -File no interpreta sintaxis de
# arreglo. Se parte por comas para que funcione igual desde -File y desde una
# consola. La validacion es a mano y no con [ValidateSet] justamente por eso.
$COLUMNAS_VALIDAS = @("CardNo", "SSN", "identitycard")

$destino = @()
foreach ($c in $Columnas) {
  foreach ($t in ([string] $c).Split(",")) {
    $t = $t.Trim()
    if (-not $t) { continue }
    $canonica = @($COLUMNAS_VALIDAS | Where-Object { $_ -ieq $t })
    if ($canonica.Count -ne 1) {
      Escribir ("RECHAZADO: '{0}' no es una columna valida. Use: {1}" -f $t, ($COLUMNAS_VALIDAS -join ", "))
      exit 1
    }
    if ($destino -notcontains $canonica[0]) { $destino += $canonica[0] }
  }
}
if ($destino.Count -eq 0) {
  Escribir ("RECHAZADO: no se indico ninguna columna. Use: {0}" -f ($COLUMNAS_VALIDAS -join ", "))
  exit 1
}

# El registro de tarjeta es el espejo de CardNo: sin CardNo no tiene sentido.
$registrarTarjeta = (-not $NoRegistrarTarjeta) -and ($destino -contains "CardNo")

# ── Previas ────────────────────────────────────────────────────────────────
Escribir ("=== Aplicar cedulas al biometrico ({0}) ===" -f $sello)
Escribir ""

# Lo que no vino por parametro se busca en la carpeta actual. El try/catch es
# para que un archivo que falta salga como un mensaje limpio y codigo 1, y no
# como el volcado de error de PowerShell con la linea del script.
try {
  $rutaMdb = Resolver-Entrada -Dada $Mdb -Nombre "Access.mdb" -Para "la base de ZKAccess"
  $Correspondencias = Resolver-Entrada -Dada $Correspondencias -Nombre "correspondencias.json" `
    -Para "el archivo de correspondencias" `
    -Extra @((Join-Path $env:TEMP "gestivo-biometrico"))
} catch {
  Escribir ""
  Escribir $_.Exception.Message
  Escribir ""
  Escribir ("Bitacora: {0}" -f $Log)
  exit 1
}
$carpetaMdb = Split-Path -Parent $rutaMdb

$datos = Get-Content -LiteralPath $Correspondencias -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $datos.correspondencias) { throw "El JSON no trae correspondencias." }
$items = @($datos.correspondencias)

# Validacion de forma: nunca se confia en el JSON de entrada.
foreach ($it in $items) {
  foreach ($campo in @("badge", "clave", "cedula")) {
    if (-not $it.PSObject.Properties.Name.Contains($campo)) {
      throw "Una correspondencia no trae el campo '$campo'."
    }
  }
  if ([string] $it.badge -eq "") { throw "Una correspondencia trae el badge vacio." }
  if (([string] $it.cedula) -notmatch "^\d{1,20}$") {
    throw ("Cedula no valida para el badge {0}: '{1}'" -f $it.badge, $it.cedula)
  }
}

if ($Badges.Count -gt 0) {
  # "powershell -File ... -Badges 27,89" entrega UN solo elemento "27,89":
  # el -File no interpreta sintaxis de arreglo de PowerShell. Se parte por
  # comas para que funcione igual desde el -File y desde una consola.
  $pedidos = @()
  foreach ($b in $Badges) {
    foreach ($t in ([string] $b).Split(",")) {
      $t = $t.Trim()
      if ($t) { $pedidos += $t }
    }
  }
  $filtro = @{}
  foreach ($b in $pedidos) { $filtro[$b] = $true }
  $items = @($items | Where-Object { $filtro.ContainsKey([string] $_.badge) })
  Escribir ("PILOTO: solo {0} de {1} badges ({2})" -f $items.Count, @($datos.correspondencias).Count, ($pedidos -join ", "))
  if ($items.Count -eq 0) {
    Escribir "RECHAZADO: ninguno de esos badges esta en el JSON de correspondencias."
    Escribir ("Bitacora: {0}" -f $Log)
    exit 1
  }
}

# Cerradura de Access: con -Aplicar es motivo de rechazo.
$base = [IO.Path]::GetFileNameWithoutExtension($rutaMdb)
$cerraduras = @()
foreach ($c in @("$base.ldb", "$base.laccdb")) {
  if (Test-Path -LiteralPath (Join-Path $carpetaMdb $c)) { $cerraduras += $c }
}
if ($cerraduras.Count -gt 0) {
  $aviso = "Hay " + ($cerraduras -join " y ") + ": alguien tiene la base abierta."
  if ($Aplicar) {
    Escribir ("RECHAZADO. {0}" -f $aviso)
    Escribir "Cierre ZKAccess en TODOS los equipos y vuelva a intentar."
    exit 1
  }
  Write-Warning $aviso
}

$proveedorUsado = Resolver-Proveedor -Preferido $Proveedor
$modo = "ENSAYO (no escribe nada)"
if ($Aplicar) { $modo = "APLICAR" }

Escribir ("Modo:       {0}" -f $modo)
Escribir ("Proveedor:  {0}" -f $proveedorUsado)
Escribir ("Base:       {0}" -f $rutaMdb)
Escribir ("JSON:       {0}" -f $Correspondencias)
$aDonde = ($destino | ForEach-Object { "USERINFO." + $_ }) -join " + "
if ($registrarTarjeta) { $aDonde += " + personnel_issuecard" }
Escribir ("Escribe en: {0}" -f $aDonde)
Escribir ("Badges:     {0}" -f $items.Count)
Escribir ""

# ── Lectura y clasificacion ────────────────────────────────────────────────
$cadenaLectura = "Provider=$proveedorUsado;Data Source=$rutaMdb;Mode=Read;Persist Security Info=False"
$cn = New-Object System.Data.OleDb.OleDbConnection $cadenaLectura
$cn.Open()
try {
  $listaColumnas = ($destino | ForEach-Object { "[" + $_ + "]" }) -join ", "
  $filas = @(Consultar -Conexion $cn -Sql ("SELECT USERID, Badgenumber, {0}, [Name] AS nombre, lastname FROM USERINFO" -f $listaColumnas))
  $marcasAntes = Escalar -Conexion $cn -Sql "SELECT COUNT(*) FROM acc_monitor_log"
  $checkAntes = Escalar -Conexion $cn -Sql "SELECT COUNT(*) FROM CHECKINOUT"
  # Tarjetas ya registradas, por USERID.
  $tarjetas = @{}
  if ($registrarTarjeta) {
    foreach ($f in @(Consultar -Conexion $cn -Sql "SELECT id, UserID_id, cardno FROM personnel_issuecard")) {
      if ($f["UserID_id"] -is [System.DBNull]) { continue }
      $tarjetas[[int] $f["UserID_id"]] = [pscustomobject] @{
        id = [int] $f["id"]; cardno = Celda $f["cardno"]
      }
    }
  }
} finally {
  $cn.Close()
}

$enBase = @{}
foreach ($f in $filas) {
  $actuales = @{}
  foreach ($col in $destino) { $actuales[$col] = Celda $f[$col] }
  $enBase[(Celda $f["Badgenumber"])] = [pscustomobject] @{
    USERID   = [int] $f["USERID"]
    actuales = $actuales
    nombre   = (Celda $f["nombre"]) + " " + (Celda $f["lastname"])
  }
}

# "0" es el valor de fabrica de ZKAccess en SSN: cuenta como vacio.
function Esta-Vacio {
  param([string] $Valor)
  return ($Valor -eq "" -or $Valor -eq "0")
}

$actualizar = @()      # una entrada por badge, con las columnas que le faltan
$yaIgual = @()         # las tres columnas pedidas ya tenian la cedula
$noExiste = @()
$nombreDistinto = @()
$valorDistinto = @()   # una entrada por (badge, columna) con otro valor puesto

# personnel_issuecard, el registro de la tarjeta entregada.
$tarjetaNueva = @()    # no tienen fila: hay que crearla
$tarjetaCambia = @()   # tienen fila con la tarjeta vacia (o -Sobrescribir)
$tarjetaOtra = @()     # tienen fila con otra tarjeta: se salta
$tarjetaIgual = 0      # ya estaba bien registrada

foreach ($it in $items) {
  $badge = [string] $it.badge
  $cedula = [string] $it.cedula
  if (-not $enBase.ContainsKey($badge)) {
    $noExiste += [pscustomobject] @{ badge = $badge; nombreJson = $it.nombreZk; cedula = $cedula }
    continue
  }
  $fila = $enBase[$badge]
  $claveBase = Clave $fila.nombre
  $claveJson = Clave ([string] $it.clave)

  if ($claveBase -ne $claveJson) {
    $nombreDistinto += [pscustomobject] @{
      badge = $badge; enBase = $fila.nombre.Trim(); enJson = $it.nombreZk; cedula = $cedula
    }
    continue
  }

  # El registro de tarjeta va aparte de las columnas: en la base viva CardNo ya
  # esta puesto para las 744 y aun asi la tarjeta puede no estar registrada.
  if ($registrarTarjeta) {
    if (-not $tarjetas.ContainsKey($fila.USERID)) {
      $tarjetaNueva += [pscustomobject] @{
        badge = $badge; userid = $fila.USERID; nombre = $fila.nombre.Trim(); cedula = $cedula
      }
    } elseif ($tarjetas[$fila.USERID].cardno -eq $cedula) {
      $tarjetaIgual++
    } elseif ((Esta-Vacio $tarjetas[$fila.USERID].cardno) -or $Sobrescribir) {
      # `userid` hace falta aquí aunque el UPDATE vaya por `id`: la
      # posverificacion relee personnel_issuecard indexado por UserID_id.
      $tarjetaCambia += [pscustomobject] @{
        badge = $badge; id = $tarjetas[$fila.USERID].id; userid = $fila.USERID
        nombre = $fila.nombre.Trim()
        actual = $tarjetas[$fila.USERID].cardno; cedula = $cedula
      }
    } else {
      $tarjetaOtra += [pscustomobject] @{
        badge = $badge; id = $tarjetas[$fila.USERID].id; userid = $fila.USERID
        nombre = $fila.nombre.Trim()
        actual = $tarjetas[$fila.USERID].cardno; cedula = $cedula
      }
    }
  }

  # Columna por columna: una fila puede tener CardNo ya puesto y SSN vacio.
  $faltan = @()
  $deAntes = @{}
  $yaTenia = 0
  foreach ($col in $destino) {
    $actual = $fila.actuales[$col]
    if ($actual -eq $cedula) { $yaTenia++; continue }
    if (-not (Esta-Vacio $actual) -and -not $Sobrescribir) {
      $valorDistinto += [pscustomobject] @{
        badge = $badge; columna = $col; nombre = $fila.nombre.Trim(); actual = $actual; cedula = $cedula
      }
      continue
    }
    $faltan += $col
    $deAntes[$col] = $actual
  }

  if ($faltan.Count -gt 0) {
    $actualizar += [pscustomobject] @{
      badge = $badge; userid = $fila.USERID; nombre = $fila.nombre.Trim()
      cedula = $cedula; columnas = $faltan; deAntes = $deAntes
    }
  } elseif ($yaTenia -eq $destino.Count) {
    $yaIgual += [pscustomobject] @{ badge = $badge; nombre = $fila.nombre.Trim(); cedula = $cedula }
  }
}

$celdasPorEscribir = 0
foreach ($x in $actualizar) { $celdasPorEscribir += $x.columnas.Count }

Escribir ("Por actualizar:            {0} filas ({1} celdas)" -f $actualizar.Count, $celdasPorEscribir)
Escribir ("Ya tenian la cedula:       {0}" -f $yaIgual.Count)
Escribir ("Badge que ya no existe:    {0}" -f $noExiste.Count)
Escribir ("Nombre distinto (saltado): {0}" -f $nombreDistinto.Count)
Escribir ("Ya tenia otro valor:       {0} celdas" -f $valorDistinto.Count)
if ($registrarTarjeta) {
  Escribir ""
  Escribir "  personnel_issuecard (el registro de la tarjeta que ve la interfaz):"
  Escribir ("    por registrar:       {0}" -f $tarjetaNueva.Count)
  Escribir ("    por corregir:        {0}" -f $tarjetaCambia.Count)
  Escribir ("    ya estaban bien:     {0}" -f $tarjetaIgual)
  Escribir ("    con otra tarjeta:    {0}  (se saltan)" -f $tarjetaOtra.Count)
} else {
  Escribir ""
  Escribir "  personnel_issuecard: NO se toca (sin CardNo en -Columnas, o -NoRegistrarTarjeta)."
}
Escribir ""

if ($noExiste.Count -gt 0) {
  Escribir "--- BADGE QUE YA NO EXISTE EN EL EQUIPO ---"
  foreach ($x in $noExiste) { Escribir ("  badge {0}  {1}  (cedula {2})" -f $x.badge, $x.nombreJson, $x.cedula) }
  Escribir ""
}
if ($nombreDistinto.Count -gt 0) {
  Escribir "--- NOMBRE DISTINTO: SE SALTAN (el equipo cambio desde que se resolvio el Excel) ---"
  foreach ($x in $nombreDistinto) {
    Escribir ("  badge {0}" -f $x.badge)
    Escribir ("      en el equipo: '{0}'" -f $x.enBase)
    Escribir ("      en el JSON:   '{0}'  (cedula {1})" -f $x.enJson, $x.cedula)
  }
  Escribir ""
}
if ($valorDistinto.Count -gt 0) {
  Escribir "--- YA TENIAN OTRO VALOR: SE SALTAN (use -Sobrescribir para pisarlos) ---"
  foreach ($x in $valorDistinto) {
    Escribir ("  badge {0}  {1}  [{2}]:  '{3}'  ->  '{4}'" -f $x.badge, $x.nombre, $x.columna, $x.actual, $x.cedula)
  }
  Escribir ""
}
if ($actualizar.Count -gt 0) {
  Escribir "--- POR ACTUALIZAR ---"
  foreach ($x in $actualizar) {
    $detalle = ($x.columnas | ForEach-Object {
      $de = $x.deAntes[$_]
      if (Esta-Vacio $de) { $de = "(vacio)" }
      "{0}: {1}" -f $_, $de
    }) -join ", "
    Escribir ("  badge {0,-6} {1,-40} {2}  ->  {3}" -f $x.badge, $x.nombre, $detalle, $x.cedula)
  }
  Escribir ""
}

if ($tarjetaOtra.Count -gt 0) {
  Escribir "--- YA TENIAN OTRA TARJETA REGISTRADA: SE SALTAN (use -Sobrescribir) ---"
  foreach ($x in $tarjetaOtra) {
    Escribir ("  badge {0}  {1}:  tarjeta '{2}'  ->  '{3}'" -f $x.badge, $x.nombre, $x.actual, $x.cedula)
  }
  Escribir ""
}
if ($tarjetaCambia.Count -gt 0) {
  Escribir "--- TARJETAS POR CORREGIR (la fila existe) ---"
  foreach ($x in $tarjetaCambia) {
    $de = $x.actual
    if (Esta-Vacio $de) { $de = "(vacia)" }
    Escribir ("  badge {0,-6} {1,-40} {2}  ->  {3}" -f $x.badge, $x.nombre, $de, $x.cedula)
  }
  Escribir ""
}
if ($tarjetaNueva.Count -gt 0) {
  Escribir ("--- TARJETAS POR REGISTRAR: {0} (se muestran las primeras 10) ---" -f $tarjetaNueva.Count)
  foreach ($x in @($tarjetaNueva | Select-Object -First 10)) {
    Escribir ("  badge {0,-6} USERID {1,-6} {2,-40} tarjeta {3}" -f $x.badge, $x.userid, $x.nombre, $x.cedula)
  }
  Escribir ""
}

if (-not $Aplicar) {
  Escribir "ENSAYO: no se escribio nada."
  Escribir "Para aplicar, repita el comando agregando  -Aplicar"
  Escribir ""
  Escribir ("Bitacora: {0}" -f $Log)
  exit 0
}

if ($actualizar.Count -eq 0 -and $tarjetaNueva.Count -eq 0 -and $tarjetaCambia.Count -eq 0) {
  Escribir "No hay nada que actualizar."
  Escribir ("Bitacora: {0}" -f $Log)
  exit 0
}

# ── Respaldo ───────────────────────────────────────────────────────────────
if (-not $Respaldos) { $Respaldos = Join-Path $carpetaMdb "respaldos" }
if (-not (Test-Path -LiteralPath $Respaldos)) {
  [void] (New-Item -ItemType Directory -Path $Respaldos -Force)
}
$respaldo = Join-Path $Respaldos ("{0}-{1}{2}" -f $base, $sello, [IO.Path]::GetExtension($rutaMdb))
Copy-Item -LiteralPath $rutaMdb -Destination $respaldo -Force
$tamOrigen = (Get-Item -LiteralPath $rutaMdb).Length
$tamCopia = (Get-Item -LiteralPath $respaldo).Length
if ($tamOrigen -ne $tamCopia) {
  Escribir ("RECHAZADO: el respaldo quedo de {0} bytes y el original tiene {1}." -f $tamCopia, $tamOrigen)
  exit 1
}
Escribir ("Respaldo: {0}  ({1:N1} MB)" -f $respaldo, ($tamCopia / 1MB))
Escribir ""

# ── Escritura, en una transaccion ──────────────────────────────────────────
$cadenaEscritura = "Provider=$proveedorUsado;Data Source=$rutaMdb;Persist Security Info=False"
$cn = New-Object System.Data.OleDb.OleDbConnection $cadenaEscritura
$cn.Open()
$tx = $null
$escritos = 0
$celdasEscritas = 0
$tarjetasEscritas = 0
try {
  $tx = $cn.BeginTransaction()

  # Un comando por combinacion de columnas: una fila a la que solo le falta SSN
  # no debe reescribir CardNo. Con dos columnas hay a lo sumo tres formas, asi
  # que se preparan sobre la marcha y se reusan.
  $comandos = @{}
  function Obtener-Comando {
    param([string[]] $Cols)
    $llave = $Cols -join "+"
    if ($comandos.ContainsKey($llave)) { return $comandos[$llave] }

    $sets = ($Cols | ForEach-Object { "[" + $_ + "] = ?" }) -join ", "
    $c = $cn.CreateCommand()
    $c.Transaction = $tx
    $c.CommandText = "UPDATE USERINFO SET $sets WHERE Badgenumber = ? AND USERID = ?"
    # Parametros posicionales: Jet y ACE ignoran los nombres y usan el orden,
    # asi que primero van las cedulas (una por columna) y luego el WHERE.
    $ps = @()
    for ($i = 0; $i -lt $Cols.Count; $i++) {
      $ps += $c.Parameters.Add("cedula$i", [System.Data.OleDb.OleDbType]::VarWChar, 20)
    }
    $pb = $c.Parameters.Add("badge", [System.Data.OleDb.OleDbType]::VarWChar, 50)
    $pu = $c.Parameters.Add("userid", [System.Data.OleDb.OleDbType]::Integer)

    $comandos[$llave] = [pscustomobject] @{ cmd = $c; cedulas = $ps; badge = $pb; userid = $pu }
    return $comandos[$llave]
  }

  foreach ($x in $actualizar) {
    $c = Obtener-Comando -Cols $x.columnas
    foreach ($p in $c.cedulas) { $p.Value = $x.cedula }
    $c.badge.Value = $x.badge
    $c.userid.Value = $x.userid
    $n = $c.cmd.ExecuteNonQuery()
    if ($n -ne 1) {
      throw ("El UPDATE del badge {0} (USERID {1}) afecto {2} filas en vez de 1." -f $x.badge, $x.userid, $n)
    }
    $escritos++
    $celdasEscritas += $x.columnas.Count
  }

  # ── personnel_issuecard, igual que lo hace la interfaz ───────────────────
  # Se comprobo sobre una copia: `id` es autonumerico (se omite) y el operador
  # 25 es `admin` (Super Admin), el unico de auth_user. Los campos de fecha que
  # la interfaz deja nulos se dejan nulos.
  if ($registrarTarjeta -and ($tarjetaNueva.Count -gt 0 -or $tarjetaCambia.Count -gt 0)) {
    if ($tarjetaNueva.Count -gt 0) {
      $ins = $cn.CreateCommand()
      $ins.Transaction = $tx
      # Se nombran TODAS las columnas que la interfaz escribe, incluidas las que
      # deja nulas: `issuedate` tiene un valor por omision en el esquema
      # (2011-07-15) que se cuela si no se menciona, y la interfaz la deja nula.
      # Se comparo fila por fila contra la que creo la interfaz (id 62).
      $ins.CommandText = "INSERT INTO personnel_issuecard " +
        "(UserID_id, cardno, isvalid, cardstatus, status, create_time, create_operator, cardpwd, " +
        " change_operator, delete_operator, issuedate, effectivenessdate, failuredate) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      $qU = $ins.Parameters.Add("u", [System.Data.OleDb.OleDbType]::Integer)
      $qC = $ins.Parameters.Add("c", [System.Data.OleDb.OleDbType]::VarWChar, 50)
      $qV = $ins.Parameters.Add("v", [System.Data.OleDb.OleDbType]::Boolean)
      $qS = $ins.Parameters.Add("s", [System.Data.OleDb.OleDbType]::VarWChar, 50)
      $qE = $ins.Parameters.Add("e", [System.Data.OleDb.OleDbType]::Integer)
      $qT = $ins.Parameters.Add("t", [System.Data.OleDb.OleDbType]::Date)
      $qO = $ins.Parameters.Add("o", [System.Data.OleDb.OleDbType]::VarWChar, 50)
      $qP = $ins.Parameters.Add("p", [System.Data.OleDb.OleDbType]::VarWChar, 50)
      $qCo = $ins.Parameters.Add("co", [System.Data.OleDb.OleDbType]::VarWChar, 50)
      $qDo = $ins.Parameters.Add("do", [System.Data.OleDb.OleDbType]::VarWChar, 50)
      $qId = $ins.Parameters.Add("id", [System.Data.OleDb.OleDbType]::Date)
      $qEd = $ins.Parameters.Add("ed", [System.Data.OleDb.OleDbType]::Date)
      $qFd = $ins.Parameters.Add("fd", [System.Data.OleDb.OleDbType]::Date)
      $qV.Value = $true
      $qS.Value = "1"
      $qE.Value = 0
      $qO.Value = "25"
      $qP.Value = ""
      $qCo.Value = ""
      $qDo.Value = ""
      $qId.Value = [System.DBNull]::Value
      $qEd.Value = [System.DBNull]::Value
      $qFd.Value = [System.DBNull]::Value
      foreach ($x in $tarjetaNueva) {
        $qU.Value = $x.userid
        $qC.Value = $x.cedula
        $qT.Value = (Get-Date)
        $n = $ins.ExecuteNonQuery()
        if ($n -ne 1) {
          throw ("El INSERT de la tarjeta del badge {0} (USERID {1}) afecto {2} filas en vez de 1." -f $x.badge, $x.userid, $n)
        }
        $tarjetasEscritas++
      }
    }

    if ($tarjetaCambia.Count -gt 0) {
      $upd = $cn.CreateCommand()
      $upd.Transaction = $tx
      $upd.CommandText = "UPDATE personnel_issuecard SET cardno = ?, isvalid = ?, cardstatus = ?, change_time = ?, change_operator = ? WHERE id = ?"
      $wC = $upd.Parameters.Add("c", [System.Data.OleDb.OleDbType]::VarWChar, 50)
      $wV = $upd.Parameters.Add("v", [System.Data.OleDb.OleDbType]::Boolean)
      $wS = $upd.Parameters.Add("s", [System.Data.OleDb.OleDbType]::VarWChar, 50)
      $wT = $upd.Parameters.Add("t", [System.Data.OleDb.OleDbType]::Date)
      $wO = $upd.Parameters.Add("o", [System.Data.OleDb.OleDbType]::VarWChar, 50)
      $wI = $upd.Parameters.Add("i", [System.Data.OleDb.OleDbType]::Integer)
      $wV.Value = $true
      $wS.Value = "1"
      $wO.Value = "25"
      foreach ($x in $tarjetaCambia) {
        $wC.Value = $x.cedula
        $wT.Value = (Get-Date)
        $wI.Value = $x.id
        $n = $upd.ExecuteNonQuery()
        if ($n -ne 1) {
          throw ("El UPDATE de la tarjeta id {0} (badge {1}) afecto {2} filas en vez de 1." -f $x.id, $x.badge, $n)
        }
        $tarjetasEscritas++
      }
    }
  }

  $tx.Commit()
  $tx = $null
  Escribir ("Confirmado: {0} filas de USERINFO ({1} celdas) y {2} tarjetas." -f $escritos, $celdasEscritas, $tarjetasEscritas)
} catch {
  Escribir ""
  Escribir ("ERROR: {0}" -f $_.Exception.Message)
  if ($tx) {
    try {
      $tx.Rollback()
      Escribir "REVERTIDO: la base quedo como estaba. No se escribio ni una fila."
    } catch {
      Escribir ("NO SE PUDO REVERTIR: {0}" -f $_.Exception.Message)
      Escribir ("Restaure el respaldo: Copy-Item '{0}' '{1}' -Force" -f $respaldo, $rutaMdb)
    }
  }
  $cn.Close()
  Escribir ("Bitacora: {0}" -f $Log)
  exit 2
} finally {
  if ($cn.State -eq "Open") { $cn.Close() }
}

# ── Posverificacion ────────────────────────────────────────────────────────
Escribir ""
Escribir "--- Verificacion (lectura nueva) ---"
$cn = New-Object System.Data.OleDb.OleDbConnection $cadenaLectura
$cn.Open()
try {
  $despues = @(Consultar -Conexion $cn -Sql ("SELECT Badgenumber, {0} FROM USERINFO" -f $listaColumnas))
  $marcasDespues = Escalar -Conexion $cn -Sql "SELECT COUNT(*) FROM acc_monitor_log"
  $checkDespues = Escalar -Conexion $cn -Sql "SELECT COUNT(*) FROM CHECKINOUT"
  $total = Escalar -Conexion $cn -Sql "SELECT COUNT(*) FROM USERINFO"
  $sinIdentificar = @{}
  foreach ($col in $destino) {
    $sinIdentificar[$col] = Escalar -Conexion $cn `
      -Sql ("SELECT COUNT(*) FROM USERINFO WHERE [{0}] IS NULL OR [{0}] = '' OR [{0}] = '0'" -f $col)
  }
  $tarjetasAhora = @{}
  $totalTarjetas = 0
  if ($registrarTarjeta) {
    foreach ($f in @(Consultar -Conexion $cn -Sql "SELECT UserID_id, cardno FROM personnel_issuecard")) {
      if ($f["UserID_id"] -is [System.DBNull]) { continue }
      $tarjetasAhora[[int] $f["UserID_id"]] = Celda $f["cardno"]
    }
    $totalTarjetas = Escalar -Conexion $cn -Sql "SELECT COUNT(*) FROM personnel_issuecard"
  }
} finally {
  $cn.Close()
}

$ahora = @{}
foreach ($f in $despues) {
  $v = @{}
  foreach ($col in $destino) { $v[$col] = Celda $f[$col] }
  $ahora[(Celda $f["Badgenumber"])] = $v
}

$malas = @()
foreach ($x in $actualizar) {
  foreach ($col in $x.columnas) {
    $quedo = $ahora[$x.badge][$col]
    if ($quedo -ne $x.cedula) {
      $malas += ("badge {0} [{1}]: se esperaba '{2}' y quedo '{3}'" -f $x.badge, $col, $x.cedula, $quedo)
    }
  }
}
if ($malas.Count -gt 0) {
  Escribir ("FALLO LA VERIFICACION en {0} celdas:" -f $malas.Count)
  foreach ($m in $malas) { Escribir ("  {0}" -f $m) }
  Escribir ("Restaure el respaldo: Copy-Item '{0}' '{1}' -Force" -f $respaldo, $rutaMdb)
  Escribir ("Bitacora: {0}" -f $Log)
  exit 2
}
Escribir ("  {0} celdas verificadas una por una: correctas." -f $celdasEscritas)
foreach ($col in $destino) {
  Escribir ("  USERINFO.{0} sin identificar: {1} de {2}" -f $col, $sinIdentificar[$col], $total)
}

if ($registrarTarjeta) {
  $malasTarjetas = @()
  foreach ($x in @($tarjetaNueva + $tarjetaCambia)) {
    $quedo = ""
    if ($tarjetasAhora.ContainsKey($x.userid)) { $quedo = $tarjetasAhora[$x.userid] }
    if ($quedo -ne $x.cedula) {
      $malasTarjetas += ("badge {0} (USERID {1}): se esperaba la tarjeta '{2}' y quedo '{3}'" -f $x.badge, $x.userid, $x.cedula, $quedo)
    }
  }
  if ($malasTarjetas.Count -gt 0) {
    Escribir ("FALLO LA VERIFICACION en {0} tarjetas:" -f $malasTarjetas.Count)
    foreach ($m in $malasTarjetas) { Escribir ("  {0}" -f $m) }
    Escribir ("Restaure el respaldo: Copy-Item '{0}' '{1}' -Force" -f $respaldo, $rutaMdb)
    Escribir ("Bitacora: {0}" -f $Log)
    exit 2
  }
  Escribir ("  {0} tarjetas verificadas una por una: correctas." -f $tarjetasEscritas)
  Escribir ("  personnel_issuecard quedo con {0} filas." -f $totalTarjetas)
}

if ($marcasAntes -ne $marcasDespues -or $checkAntes -ne $checkDespues) {
  Escribir ("  AVISO: cambiaron las marcaciones (acc_monitor_log {0} -> {1}, CHECKINOUT {2} -> {3})." -f $marcasAntes, $marcasDespues, $checkAntes, $checkDespues)
  Escribir "  Este script no las toca: si cambiaron, alguien marco mientras corria."
} else {
  Escribir ("  Marcaciones intactas (acc_monitor_log {0}, CHECKINOUT {1})." -f $marcasDespues, $checkDespues)
}

Escribir ""
Escribir ("Respaldo: {0}" -f $respaldo)
Escribir ("Bitacora: {0}" -f $Log)
Escribir ""
Escribir "Abra ZKAccess y confirme en Personal que el 'N.o de tarjeta' muestra la cedula."
Escribir "Si ZKAccess estaba abierto, cierrelo y vuelvalo a abrir: lee la base al arrancar."
