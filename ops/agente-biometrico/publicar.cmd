@echo off
rem Publica el agente en la carpeta `publicar\`, lista para copiar al PC de
rem ZKAccess. No genera instalador: son un .exe y unas DLL, menos de 5 MB.
rem
rem Requiere el SDK de .NET (dotnet) en el equipo de desarrollo. El resultado
rem corre con el .NET Framework 4.8 que ya trae Windows 10 1903+ y Windows 11.

setlocal
cd /d "%~dp0"

echo.
echo === Compilando el agente del biometrico (net48, x86) ===
dotnet publish Gestivo.AgenteBiometrico.csproj -c Release -o publicar
if errorlevel 1 (
  echo.
  echo FALLO la compilacion. Revise los mensajes de arriba.
  exit /b 1
)

rem El SDK del lector es opcional al compilar: sin el interop, la lectura
rem directa del equipo no entra en el .exe y las huellas solo llegarian cuando
rem alguien descargue en ZKAccess. Publicar eso sin querer seria un retroceso
rem silencioso, asi que se avisa fuerte.
if not exist "publicar\Interop.zkemkeeper.dll" (
  echo.
  echo *** AVISO: se publico SIN el SDK del lector ***
  echo.
  echo   Falta Lib\Interop.zkemkeeper.dll, asi que este .exe NO puede leer las
  echo   huellas en tiempo real: solo las traera del Access.mdb cuando alguien
  echo   descargue en ZKAccess.
  echo.
  echo   Para arreglarlo: copie Interop.zkemkeeper.dll de la carpeta de
  echo   instalacion de ZKAccess 3.5 a Lib\ y vuelva a publicar.
  echo.
)

rem El SDK pull es el que usa este lector. En el PC de ZKAccess esta en
rem SysWOW64 de todas formas; en OTRO PC solo funciona si va junto al .exe.
if not exist "publicar\plcommpro.dll" (
  echo.
  echo *** AVISO: se publico SIN las DLL del SDK pull ***
  echo.
  echo   Falta Lib\PullSdk\. En el PC de ZKAccess no importa ^(estan en
  echo   C:\Windows\SysWOW64^), pero en OTRO PC la lectura directa no podra
  echo   conectarse. Copie plcommpro, plcomms, pltcpcomm, plrscomm, plrscagent y
  echo   plusbcomm de C:\Windows\SysWOW64 del PC de ZKAccess a Lib\PullSdk\.
  echo.
)

rem Las autopruebas corren sobre el .exe PUBLICADO, no sobre el de bin\: asi se
rem comprueba lo que de verdad se va a copiar. Si fallan, no se publica.
rem
rem `start /wait` y no la llamada directa: el agente es una aplicacion de
rem VENTANAS, y cmd no espera a esas, asi que sin /wait el errorlevel seria el
rem del comando anterior y la puerta no serviria de nada.
rem
rem Y el informe se lee del archivo porque la salida por consola de una
rem aplicacion de ventanas no llega aqui cuando esto se ejecuta redirigido.
echo.
echo === Autopruebas ===
start /wait "" "publicar\Gestivo.AgenteBiometrico.exe" --autopruebas
set FALLARON=%errorlevel%
if exist "%TEMP%\gestivo-autopruebas.txt" type "%TEMP%\gestivo-autopruebas.txt"
if not "%FALLARON%"=="0" (
  echo.
  echo FALLARON las autopruebas: no se publica. Revise el informe de arriba.
  exit /b 1
)

echo.
echo === Listo ===
echo Carpeta: %cd%\publicar
echo.
echo Copie esa carpeta ENTERA, por ejemplo a C:\Gestivo\AgenteBiometrico\, y
echo ejecute Gestivo.AgenteBiometrico.exe. La primera vez abre Configuracion.
echo.
echo   En el PC de ZKAccess: URL, secreto y ruta del Access.mdb (las dos vias).
echo   En OTRO PC de la red: URL y secreto, desmarque la via Access, marque la
echo   lectura directa e importe el config.json del PC de ZKAccess (o escriba
echo   el lector a mano).
echo.
echo Detalle en README.md y en docs\biometrico-marcaciones.md.
endlocal
