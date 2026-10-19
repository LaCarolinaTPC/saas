<#
.SYNOPSIS
  Exporta a JSON las personas, los departamentos y el conteo de marcaciones de
  la base de ZKAccess 3.5 (Access .mdb). SOLO LEE.

.DESCRIPTION
  Produce el zk.json que consume scripts/biometrico-cruce-excel.mts. Reemplaza
  el exportar-zk.ps1 original, que vivia fuera del repositorio y se perdio.

  Las marcaciones NO salen de CHECKINOUT sino de acc_monitor_log con
  event_type = 14 y agrupadas por pin (= Badgenumber). Es lo que hacia el
  script original y lo que reproduce sus cifras: para el badge 1, CHECKINOUT da
  41 registros y acc_monitor_log sin filtro da 54, pero con event_type = 14 da
  los 14 que traia el zk.json.

  Compatible con Windows PowerShell 5.1: el equipo donde corre ZKAccess puede
  no tener pwsh 7. Sin operadores ?? ni ternarios, y los mensajes en ASCII.

  Pensado para copiarlo junto al Access.mdb, abrir una consola en esa carpeta
  y ejecutarlo SIN parametros: la base se busca ahi. Si no esta, falla
  diciendo donde busco.

.EXAMPLE
  # Lo normal: en la carpeta donde esta el Access.mdb
  powershell -ExecutionPolicy Bypass -File .\biometrico-exportar-zk.ps1

.EXAMPLE
  # Con la ruta explicita, desde cualquier carpeta
  powershell -ExecutionPolicy Bypass -File scripts\biometrico-exportar-zk.ps1 -Mdb "C:\ZKAccess\Access.mdb"

.NOTES
  Si falla por falta de proveedor, pruebe el PowerShell de 32 bits:
  %windir%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -File ...
#>
[CmdletBinding()]
param(
  # Ruta del Access.mdb. Vacio = el Access.mdb de la carpeta actual.
  [string] $Mdb = "",

  # Destino del JSON. Lleva nombres: va a %TEMP%, no al repositorio.
  [string] $Salida = "$env:TEMP\gestivo-biometrico\zk.json",

  # Proveedor OLE DB a la fuerza. Vacio = autodetectar.
  [string] $Proveedor = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Proveedor ──────────────────────────────────────────────────────────────
# Misma funcion en biometrico-aplicar-ssn-zk.ps1. Se duplica a proposito: un
# tercer archivo para dot-source es un archivo mas que copiar al equipo vivo.
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

# Devuelve las FILAS (DataRow), no el DataTable: PowerShell enumera un
# DataTable al retornarlo de una funcion, asi que $t.Rows no existe del otro
# lado. Los llamadores envuelven con @() para que una sola fila siga siendo
# una coleccion.
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

# Texto de una celda: DBNull y vacio -> $null, para que el JSON lleve null.
function Texto {
  param($Valor)
  if ($null -eq $Valor -or $Valor -is [System.DBNull]) { return $null }
  $s = [string] $Valor
  if ($s.Trim().Length -eq 0) { return $null }
  return $s
}

function Fecha {
  param($Valor)
  if ($null -eq $Valor -or $Valor -is [System.DBNull]) { return $null }
  return ([datetime] $Valor).ToString("yyyy-MM-dd HH:mm:ss", [System.Globalization.CultureInfo]::InvariantCulture)
}

function Entero {
  param($Valor)
  if ($null -eq $Valor -or $Valor -is [System.DBNull]) { return $null }
  return [int] $Valor
}

# ── Validaciones ───────────────────────────────────────────────────────────
# Sin -Mdb se usa el Access.mdb de la carpeta actual. Se mira tambien la
# carpeta del propio script, porque con "Ejecutar con PowerShell" desde el
# Explorador la carpeta actual no siempre es la del archivo.
if ($Mdb) {
  # "Copiar como ruta de acceso" del Explorador entrega la ruta ENTRE COMILLAS.
  $Mdb = $Mdb.Trim().Trim('"').Trim("'").Trim()
  if (-not (Test-Path -LiteralPath $Mdb -PathType Leaf)) {
    Write-Host ""
    Write-Host "No existe el archivo que se indico: $Mdb"
    exit 1
  }
} else {
  $carpetas = @($PWD.Path)
  if ($PSScriptRoot) { $carpetas += $PSScriptRoot }
  $carpetas = @($carpetas | Select-Object -Unique)
  foreach ($c in $carpetas) {
    $candidato = Join-Path $c "Access.mdb"
    if (Test-Path -LiteralPath $candidato -PathType Leaf) { $Mdb = $candidato; break }
  }
  if (-not $Mdb) {
    Write-Host ""
    Write-Host "No se encontro la base de ZKAccess (Access.mdb)."
    Write-Host "Se busco en:"
    foreach ($c in $carpetas) { Write-Host ("  - " + $c) }
    Write-Host ""
    Write-Host "Corra el script desde la carpeta de la base, o indiquela con -Mdb."
    exit 1
  }
}
$rutaMdb = (Resolve-Path -LiteralPath $Mdb).Path
$carpetaMdb = Split-Path -Parent $rutaMdb
$base = [IO.Path]::GetFileNameWithoutExtension($rutaMdb)
foreach ($cerradura in @("$base.ldb", "$base.laccdb")) {
  if (Test-Path -LiteralPath (Join-Path $carpetaMdb $cerradura)) {
    # ${} obligatorio: un ':' pegado a $var lo lee PowerShell como unidad.
    Write-Warning "Hay un ${cerradura}: alguien tiene la base abierta. Para LEER no importa, pero las cifras son del momento."
  }
}

$proveedorUsado = Resolver-Proveedor -Preferido $Proveedor
$cadena = "Provider=$proveedorUsado;Data Source=$rutaMdb;Mode=Read;Persist Security Info=False"

Write-Host "Proveedor: $proveedorUsado"
Write-Host "Base:      $rutaMdb"

$cn = New-Object System.Data.OleDb.OleDbConnection $cadena
$cn.Open()
try {
  $tDeptos = @(Consultar -Conexion $cn -Sql "SELECT DEPTID, DEPTNAME FROM DEPARTMENTS")
  $tPersonas = @(Consultar -Conexion $cn -Sql "SELECT Badgenumber, [Name] AS name, lastname, DEFAULTDEPTID FROM USERINFO")
  # event_type = 14 es la verificacion valida (la que el equipo acepta).
  $sqlMarcas = @"
SELECT pin, COUNT(*) AS n, MIN([time]) AS primera, MAX([time]) AS ultima
FROM acc_monitor_log
WHERE event_type = 14
GROUP BY pin
"@
  $tMarcas = @(Consultar -Conexion $cn -Sql $sqlMarcas)
} finally {
  $cn.Close()
}

$deptos = @()
foreach ($f in $tDeptos) {
  $deptos += [pscustomobject] @{
    DEPTID   = Entero $f["DEPTID"]
    DEPTNAME = Texto $f["DEPTNAME"]
  }
}

$personas = @()
foreach ($f in $tPersonas) {
  $personas += [pscustomobject] @{
    Badgenumber   = Texto $f["Badgenumber"]
    name          = Texto $f["name"]
    lastname      = Texto $f["lastname"]
    DEFAULTDEPTID = Entero $f["DEFAULTDEPTID"]
  }
}

$marcas = @()
foreach ($f in $tMarcas) {
  $marcas += [pscustomobject] @{
    pin     = Texto $f["pin"]
    n       = Entero $f["n"]
    primera = Fecha $f["primera"]
    ultima  = Fecha $f["ultima"]
  }
}

$salidaObj = [pscustomobject] @{
  generado = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss", [System.Globalization.CultureInfo]::InvariantCulture)
  origen   = $rutaMdb
  deptos   = @($deptos)
  personas = @($personas)
  marcas   = @($marcas)
}

$carpetaSalida = Split-Path -Parent $Salida
if ($carpetaSalida -and -not (Test-Path -LiteralPath $carpetaSalida)) {
  [void] (New-Item -ItemType Directory -Path $carpetaSalida -Force)
}

# UTF-8 SIN BOM: Out-File -Encoding utf8 de PowerShell 5.1 agrega BOM y
# JSON.parse de Node lo rechaza.
$json = $salidaObj | ConvertTo-Json -Depth 5 -Compress
[IO.File]::WriteAllText($Salida, $json, (New-Object System.Text.UTF8Encoding $false))

Write-Host ""
Write-Host ("Departamentos: {0}" -f $deptos.Count)
Write-Host ("Personas:      {0}" -f $personas.Count)
Write-Host ("Pines con marcaciones: {0}" -f $marcas.Count)
if ($marcas.Count -gt 0) {
  $ultima = ($marcas | Where-Object { $_.ultima } | Sort-Object ultima -Descending | Select-Object -First 1)
  if ($ultima) {
    Write-Host ("Marcacion mas reciente: {0}  (si no es de hoy, esta base no es la viva)" -f $ultima.ultima)
  }
}
Write-Host ""
Write-Host "JSON: $Salida"
