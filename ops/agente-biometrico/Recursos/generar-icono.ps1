# Genera Recursos/agente.ico a partir del mismo glifo que dibuja la aplicación
# en la bandeja (Recursos/Glifo.cs): una huella blanca sobre fondo indigo, el
# color de marca de Gestivo (#4F46E5).
#
# El .ico se versiona porque es entrada de compilación (ApplicationIcon del
# csproj). Este script queda para poder regenerarlo si el glifo cambia.
#
#   powershell -ExecutionPolicy Bypass -File Recursos\generar-icono.ps1

Add-Type -AssemblyName System.Drawing

$salida = Join-Path $PSScriptRoot "agente.ico"
$tamanos = @(16, 24, 32, 48, 64, 128, 256)

# Mismo dibujo que Glifo.cs, en PowerShell. Si se cambia uno, cambie el otro.
function Dibujar([int]$lado, [System.Drawing.Color]$fondo, [System.Drawing.Color]$tinta, [bool]$conFondo) {
  $bmp = New-Object System.Drawing.Bitmap $lado, $lado
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)

  if ($conFondo) {
    # Cuadrado redondeado.
    $r = [Math]::Max(2, [int]($lado * 0.22))
    $ruta = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $ruta.AddArc(0, 0, $d, $d, 180, 90)
    $ruta.AddArc($lado - $d, 0, $d, $d, 270, 90)
    $ruta.AddArc($lado - $d, $lado - $d, $d, $d, 0, 90)
    $ruta.AddArc(0, $lado - $d, $d, $d, 90, 90)
    $ruta.CloseFigure()
    $pincel = New-Object System.Drawing.SolidBrush $fondo
    $g.FillPath($pincel, $ruta)
    $pincel.Dispose(); $ruta.Dispose()
  }

  # Huella: arcos concéntricos ELÍPTICOS (más altos que anchos) que envuelven
  # por los lados y abren abajo. Con arcos circulares y poco barrido el dibujo
  # se lee como un símbolo de wifi, no como una huella.
  # A 16 px tres anillos se emborronan: se dibujan dos y más gruesos. Es lo
  # normal en iconografía (el glifo se simplifica en tamaños pequeños).
  $chico = $lado -le 20
  $grosor = [Math]::Max(1.6, $lado * $(if ($chico) { 0.11 } else { 0.075 }))
  $lapiz = New-Object System.Drawing.Pen $tinta, $grosor
  $lapiz.StartCap = 'Round'
  $lapiz.EndCap = 'Round'

  $cx = $lado / 2.0
  $cy = $lado * 0.50
  # rx/ry: la huella es más alta que ancha. El barrido grande hace que el arco
  # baje por los costados, que es lo que la distingue del wifi.
  $anillos = if ($chico) {
    @(
      @{ rx = $lado * 0.29; ry = $lado * 0.34; ini = 160; barrido = 220 },
      @{ rx = $lado * 0.12; ry = $lado * 0.16; ini = 172; barrido = 196 }
    )
  } else {
    @(
      @{ rx = $lado * 0.30; ry = $lado * 0.36; ini = 160; barrido = 220 },
      @{ rx = $lado * 0.20; ry = $lado * 0.25; ini = 165; barrido = 210 },
      @{ rx = $lado * 0.10; ry = $lado * 0.14; ini = 175; barrido = 190 }
    )
  }
  foreach ($a in $anillos) {
    $g.DrawArc($lapiz, [float]($cx - $a.rx), [float]($cy - $a.ry),
               [float]($a.rx * 2), [float]($a.ry * 2), [float]$a.ini, [float]$a.barrido)
  }
  # Núcleo: el trazo corto del centro. En tamaños chicos no cabe: con dos
  # anillos gruesos ya se lee, y añadirlo solo ensucia.
  if (-not $chico) {
    $g.DrawLine($lapiz, [float]$cx, [float]($cy - $lado * 0.06), [float]$cx, [float]($cy + $lado * 0.08))
  }

  $lapiz.Dispose()
  $g.Dispose()
  return $bmp
}

$indigo = [System.Drawing.Color]::FromArgb(79, 70, 229)
$blanco = [System.Drawing.Color]::White

# ── Armado del .ico ──────────────────────────────────────────────────────────
# Cada imagen se guarda como PNG dentro del contenedor ICO (válido desde
# Windows Vista y lo único práctico para 256x256).
$pngs = @()
foreach ($lado in $tamanos) {
  $bmp = Dibujar $lado $indigo $blanco $true
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngs += , @{ lado = $lado; datos = $ms.ToArray() }
  $ms.Dispose(); $bmp.Dispose()
}

$fs = [System.IO.File]::Create($salida)
$bw = New-Object System.IO.BinaryWriter $fs
try {
  # ICONDIR
  $bw.Write([uint16]0)                 # reservado
  $bw.Write([uint16]1)                 # tipo 1 = icono
  $bw.Write([uint16]$pngs.Count)

  # ICONDIRENTRY por imagen (16 bytes cada una)
  $desplazamiento = 6 + (16 * $pngs.Count)
  foreach ($p in $pngs) {
    $b = if ($p.lado -ge 256) { 0 } else { $p.lado }   # 0 significa 256
    $bw.Write([byte]$b)                # ancho
    $bw.Write([byte]$b)                # alto
    $bw.Write([byte]0)                 # colores de la paleta
    $bw.Write([byte]0)                 # reservado
    $bw.Write([uint16]1)               # planos
    $bw.Write([uint16]32)              # bits por píxel
    $bw.Write([uint32]$p.datos.Length)
    $bw.Write([uint32]$desplazamiento)
    $desplazamiento += $p.datos.Length
  }
  foreach ($p in $pngs) { $bw.Write($p.datos) }
}
finally {
  $bw.Dispose(); $fs.Dispose()
}

"Icono generado: $salida"
"  tamanos: $($tamanos -join ', ')"
"  bytes:   $((Get-Item $salida).Length)"
