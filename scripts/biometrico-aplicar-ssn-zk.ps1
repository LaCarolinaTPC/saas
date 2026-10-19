<#
.SYNOPSIS
  Escribe la cedula de Gestivo en el campo "N.o de identificacion"
  (USERINFO.SSN) de la base de ZKAccess 3.5. ENSAYO por defecto.

.DESCRIPTION
  Es el UNICO script de este flujo que escribe. Toma el correspondencias.json
  que produce biometrico-resolver-correspondencias.mts y, por cada badge,
  actualiza una sola fila de USERINFO.

  Sin -Aplicar no escribe nada: imprime exactamente lo que haria y termina.

  Guardas, en orden:
    1. Rechaza si ZKAccess tiene la base abierta (.ldb / .laccdb).
    2. Respaldo con fecha y hora ANTES de abrir para escribir.
    3. Transaccion: si un UPDATE no afecta exactamente 1 fila, revierte todo.
    4. Compara el nombre del equipo contra el del JSON. Si no coincide, SALTA
       esa fila y sigue: es lo que permite resolver el Excel sobre una copia y
       aplicarlo despues a la base viva sin arrastrar datos de otra persona.
    5. No pisa un SSN que ya tenga otro valor, salvo -Sobrescribir.
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

  # Pisar un SSN que ya tenga un valor distinto de "0".
  [switch] $Sobrescribir,

  # Piloto: solo estos badges. Vacio = todos los del JSON.
  [string[]] $Badges = @(),

  # La columna del "N.o de identificacion". Si el piloto muestra en la interfaz
  # de ZKAccess que no es SSN, se cambia aqui sin tocar el script: la base no
  # permite confirmar cual es (sus tablas de textos de interfaz estan vacias) y
  # identitycard es la otra candidata.
  [ValidateSet("SSN", "identitycard")]
  [string] $Columna = "SSN",

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
Escribir ("Columna:    USERINFO.{0}" -f $Columna)
Escribir ("Badges:     {0}" -f $items.Count)
Escribir ""

# ── Lectura y clasificacion ────────────────────────────────────────────────
$cadenaLectura = "Provider=$proveedorUsado;Data Source=$rutaMdb;Mode=Read;Persist Security Info=False"
$cn = New-Object System.Data.OleDb.OleDbConnection $cadenaLectura
$cn.Open()
try {
  $filas = @(Consultar -Conexion $cn -Sql ("SELECT USERID, Badgenumber, [{0}] AS actual, [Name] AS nombre, lastname FROM USERINFO" -f $Columna))
  $marcasAntes = Escalar -Conexion $cn -Sql "SELECT COUNT(*) FROM acc_monitor_log"
  $checkAntes = Escalar -Conexion $cn -Sql "SELECT COUNT(*) FROM CHECKINOUT"
} finally {
  $cn.Close()
}

$enBase = @{}
foreach ($f in $filas) {
  $enBase[(Celda $f["Badgenumber"])] = [pscustomobject] @{
    USERID  = [int] $f["USERID"]
    actual  = Celda $f["actual"]
    nombre  = (Celda $f["nombre"]) + " " + (Celda $f["lastname"])
  }
}

$actualizar = @()
$yaIgual = @()
$noExiste = @()
$nombreDistinto = @()
$valorDistinto = @()

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
  if ($fila.actual -eq $cedula) {
    $yaIgual += [pscustomobject] @{ badge = $badge; nombre = $fila.nombre.Trim(); cedula = $cedula }
    continue
  }
  # "0" es el valor de fabrica de ZKAccess: cuenta como vacio.
  $vacio = ($fila.actual -eq "" -or $fila.actual -eq "0")
  if (-not $vacio -and -not $Sobrescribir) {
    $valorDistinto += [pscustomobject] @{
      badge = $badge; nombre = $fila.nombre.Trim(); actual = $fila.actual; cedula = $cedula
    }
    continue
  }
  $actualizar += [pscustomobject] @{
    badge = $badge; userid = $fila.USERID; nombre = $fila.nombre.Trim()
    actual = $fila.actual; cedula = $cedula
  }
}

Escribir ("Por actualizar:            {0}" -f $actualizar.Count)
Escribir ("Ya tenian la cedula:       {0}" -f $yaIgual.Count)
Escribir ("Badge que ya no existe:    {0}" -f $noExiste.Count)
Escribir ("Nombre distinto (saltado): {0}" -f $nombreDistinto.Count)
Escribir ("Ya tenia otro valor:       {0}" -f $valorDistinto.Count)
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
    Escribir ("  badge {0}  {1}:  '{2}'  ->  '{3}'" -f $x.badge, $x.nombre, $x.actual, $x.cedula)
  }
  Escribir ""
}
if ($actualizar.Count -gt 0) {
  Escribir "--- POR ACTUALIZAR ---"
  foreach ($x in $actualizar) {
    $de = $x.actual
    if ($de -eq "") { $de = "(vacio)" }
    Escribir ("  badge {0,-6} {1,-40} {2}  ->  {3}" -f $x.badge, $x.nombre, $de, $x.cedula)
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

if ($actualizar.Count -eq 0) {
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
try {
  $tx = $cn.BeginTransaction()
  $cmd = $cn.CreateCommand()
  $cmd.Transaction = $tx
  # Parametros posicionales: Jet y ACE ignoran los nombres y usan el orden.
  $cmd.CommandText = ("UPDATE USERINFO SET [{0}] = ? WHERE Badgenumber = ? AND USERID = ?" -f $Columna)
  $pCedula = $cmd.Parameters.Add("cedula", [System.Data.OleDb.OleDbType]::VarWChar, 20)
  $pBadge = $cmd.Parameters.Add("badge", [System.Data.OleDb.OleDbType]::VarWChar, 50)
  $pUserId = $cmd.Parameters.Add("userid", [System.Data.OleDb.OleDbType]::Integer)

  foreach ($x in $actualizar) {
    $pCedula.Value = $x.cedula
    $pBadge.Value = $x.badge
    $pUserId.Value = $x.userid
    $n = $cmd.ExecuteNonQuery()
    if ($n -ne 1) {
      throw ("El UPDATE del badge {0} (USERID {1}) afecto {2} filas en vez de 1." -f $x.badge, $x.userid, $n)
    }
    $escritos++
  }

  $tx.Commit()
  $tx = $null
  Escribir ("Confirmado: {0} filas actualizadas." -f $escritos)
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
  $despues = @(Consultar -Conexion $cn -Sql ("SELECT Badgenumber, [{0}] AS actual FROM USERINFO" -f $Columna))
  $marcasDespues = Escalar -Conexion $cn -Sql "SELECT COUNT(*) FROM acc_monitor_log"
  $checkDespues = Escalar -Conexion $cn -Sql "SELECT COUNT(*) FROM CHECKINOUT"
  $sinIdentificar = Escalar -Conexion $cn -Sql ("SELECT COUNT(*) FROM USERINFO WHERE [{0}] IS NULL OR [{0}] = '' OR [{0}] = '0'" -f $Columna)
  $total = Escalar -Conexion $cn -Sql "SELECT COUNT(*) FROM USERINFO"
} finally {
  $cn.Close()
}

$ahora = @{}
foreach ($f in $despues) { $ahora[(Celda $f["Badgenumber"])] = Celda $f["actual"] }

$malas = @()
foreach ($x in $actualizar) {
  if ($ahora[$x.badge] -ne $x.cedula) {
    $malas += ("badge {0}: se esperaba '{1}' y quedo '{2}'" -f $x.badge, $x.cedula, $ahora[$x.badge])
  }
}
if ($malas.Count -gt 0) {
  Escribir ("FALLO LA VERIFICACION en {0} filas:" -f $malas.Count)
  foreach ($m in $malas) { Escribir ("  {0}" -f $m) }
  Escribir ("Restaure el respaldo: Copy-Item '{0}' '{1}' -Force" -f $respaldo, $rutaMdb)
  Escribir ("Bitacora: {0}" -f $Log)
  exit 2
}
Escribir ("  {0} filas verificadas una por una: correctas." -f $actualizar.Count)
Escribir ("  USERINFO.{0} sin identificar: {1} de {2}" -f $Columna, $sinIdentificar, $total)

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
Escribir "Abra ZKAccess y confirme en Personal que el 'N.o de identificacion' muestra la cedula."
