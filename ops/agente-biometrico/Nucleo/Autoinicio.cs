using System;
using System.Diagnostics;
using System.Reflection;
using Microsoft.Win32;

namespace Gestivo.AgenteBiometrico.Nucleo
{
    /// <summary>
    /// «Iniciar con Windows»: una entrada en la clave Run del USUARIO actual
    /// (HKCU), no de la máquina, más un VIGILANTE en el Programador de tareas.
    ///
    /// Por qué HKCU y no un servicio de Windows: el agente vive en la bandeja y
    /// necesita una sesión abierta para mostrarse. Un servicio correría sin
    /// sesión pero no tendría ventana ni icono, que es justamente lo que se pidió
    /// para poder cambiar la configuración. Si algún día el PC debe sincronizar
    /// sin que nadie inicie sesión, el Sincronizador se envuelve en un servicio
    /// sin tocar lo demás.
    ///
    /// El vigilante existe porque Run solo actúa al iniciar sesión: si el
    /// proceso muere a mitad del día —un fallo dentro de la DLL nativa del
    /// lector no se puede atrapar— no volvía hasta el día siguiente. La tarea
    /// lo lanza cada 10 min con `--silencioso`; si ya está corriendo, el mutex
    /// hace que esa copia salga sin decir nada.
    ///
    /// Nada de esto pide permiso de administrador, que en ese PC no siempre hay.
    /// </summary>
    public static class Autoinicio
    {
        private const string ClaveRun = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string Nombre = "GestivoAgenteBiometrico";
        private const string TareaVigilante = "Gestivo Agente Biometrico (vigilante)";

        /// <summary>Argumento con el que lo lanza el vigilante: si ya corre, sale sin avisar.</summary>
        public const string ArgSilencioso = "--silencioso";

        private static string Exe
        {
            get { return Assembly.GetExecutingAssembly().Location; }
        }

        private static string RutaExe
        {
            get
            {
                // Entre comillas: la ruta puede llevar espacios (C:\Program Files\...).
                return "\"" + Exe + "\"";
            }
        }

        private static string ValorRun()
        {
            using (var k = Registry.CurrentUser.OpenSubKey(ClaveRun, false))
                return k?.GetValue(Nombre) as string;
        }

        /// <summary>
        /// Activo de verdad: la entrada existe Y apunta a ESTE .exe. Antes
        /// bastaba con que existiera, y tras copiar una versión nueva a otra
        /// carpeta el menú salía marcado mientras Windows arrancaba la vieja.
        /// </summary>
        public static bool Activo
        {
            get
            {
                try
                {
                    var v = ValorRun();
                    return !string.IsNullOrEmpty(v) &&
                           string.Equals(v.Trim().Trim('"'), Exe, StringComparison.OrdinalIgnoreCase);
                }
                catch (Exception e)
                {
                    Bitacora.Error("No se pudo leer el autoinicio", e);
                    return false;
                }
            }
        }

        /// <summary>Devuelve true si quedó como se pidió.</summary>
        public static bool Establecer(bool activar)
        {
            try
            {
                using (var k = Registry.CurrentUser.OpenSubKey(ClaveRun, true))
                {
                    if (k == null) return false;
                    if (activar) k.SetValue(Nombre, RutaExe, RegistryValueKind.String);
                    else k.DeleteValue(Nombre, false);
                }
                Bitacora.Info("Iniciar con Windows: " + (activar ? "activado" : "desactivado"));
            }
            catch (Exception e)
            {
                Bitacora.Error("No se pudo cambiar el autoinicio", e);
                return false;
            }
            if (activar) CrearVigilante();
            else BorrarVigilante();
            return true;
        }

        /// <summary>
        /// Al arrancar: si «Iniciar con Windows» estaba pedido pero apunta a otra
        /// copia del .exe, se corrige; y se asegura el vigilante. Nunca lanza.
        /// </summary>
        public static void Reparar()
        {
            try
            {
                var v = ValorRun();
                if (string.IsNullOrEmpty(v)) return;
                if (!Activo)
                {
                    Bitacora.Aviso("«Iniciar con Windows» apuntaba a " + v + ": se corrige a esta copia (" + Exe + ").");
                    Establecer(true);
                    return;
                }
                if (!ExisteVigilante()) CrearVigilante();
            }
            catch (Exception e)
            {
                Bitacora.Error("No se pudo revisar el autoinicio", e);
            }
        }

        private static bool ExisteVigilante()
        {
            return Schtasks("/Query /TN \"" + TareaVigilante + "\"", registrarFallo: false) == 0;
        }

        private static void CrearVigilante()
        {
            var r = Schtasks("/Create /F /SC MINUTE /MO 10 /TN \"" + TareaVigilante + "\" /TR \"\\\"" + Exe +
                             "\\\" " + ArgSilencioso + "\"", registrarFallo: true);
            if (r == 0) Bitacora.Info("Vigilante creado en el Programador de tareas: relanza el agente si se cierra.");
        }

        private static void BorrarVigilante()
        {
            if (!ExisteVigilante()) return;
            if (Schtasks("/Delete /F /TN \"" + TareaVigilante + "\"", registrarFallo: true) == 0)
                Bitacora.Info("Vigilante del Programador de tareas borrado.");
        }

        /// <summary>Corre schtasks.exe sin ventana; devuelve su código de salida (-1 si no se pudo).</summary>
        private static int Schtasks(string argumentos, bool registrarFallo)
        {
            try
            {
                var psi = new ProcessStartInfo("schtasks.exe", argumentos)
                {
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                };
                using (var p = Process.Start(psi))
                {
                    if (p == null) return -1;
                    var error = p.StandardError.ReadToEnd();
                    p.StandardOutput.ReadToEnd();
                    if (!p.WaitForExit(15000))
                    {
                        try { p.Kill(); } catch { }
                        if (registrarFallo) Bitacora.Aviso("schtasks no respondió en 15 s.");
                        return -1;
                    }
                    if (p.ExitCode != 0 && registrarFallo)
                        Bitacora.Aviso("schtasks " + argumentos.Split(' ')[0] + " falló (" + p.ExitCode + "): " +
                                       error.Trim());
                    return p.ExitCode;
                }
            }
            catch (Exception e)
            {
                if (registrarFallo) Bitacora.Error("No se pudo usar el Programador de tareas", e);
                return -1;
            }
        }
    }
}
