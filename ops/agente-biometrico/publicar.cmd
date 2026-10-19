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

echo.
echo === Listo ===
echo Carpeta: %cd%\publicar
echo.
echo Copie esa carpeta al PC del biometrico, por ejemplo a
echo   C:\Gestivo\AgenteBiometrico\
echo y ejecute Gestivo.AgenteBiometrico.exe. La primera vez abre la ventana de
echo Configuracion: URL de Gestivo, secreto y ruta del Access.mdb.
echo.
echo Detalle en README.md y en docs\biometrico-marcaciones.md.
endlocal
