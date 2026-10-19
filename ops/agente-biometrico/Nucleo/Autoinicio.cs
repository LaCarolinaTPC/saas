using System;
using System.Reflection;
using Microsoft.Win32;

namespace Gestivo.AgenteBiometrico.Nucleo
{
    /// <summary>
    /// «Iniciar con Windows»: una entrada en la clave Run del USUARIO actual
    /// (HKCU), no de la máquina.
    ///
    /// Por qué HKCU y no un servicio de Windows: el agente vive en la bandeja y
    /// necesita una sesión abierta para mostrarse. Un servicio correría sin
    /// sesión pero no tendría ventana ni icono, que es justamente lo que se pidió
    /// para poder cambiar la configuración. Si algún día el PC debe sincronizar
    /// sin que nadie inicie sesión, el Sincronizador se envuelve en un servicio
    /// sin tocar lo demás.
    ///
    /// Tampoco hace falta permiso de administrador, que en ese PC no siempre hay.
    /// </summary>
    public static class Autoinicio
    {
        private const string ClaveRun = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string Nombre = "GestivoAgenteBiometrico";

        private static string RutaExe
        {
            get
            {
                // Entre comillas: la ruta puede llevar espacios (C:\Program Files\...).
                return "\"" + Assembly.GetExecutingAssembly().Location + "\"";
            }
        }

        public static bool Activo
        {
            get
            {
                try
                {
                    using (var k = Registry.CurrentUser.OpenSubKey(ClaveRun, false))
                    {
                        var v = k?.GetValue(Nombre) as string;
                        return !string.IsNullOrEmpty(v);
                    }
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
                return true;
            }
            catch (Exception e)
            {
                Bitacora.Error("No se pudo cambiar el autoinicio", e);
                return false;
            }
        }
    }
}
