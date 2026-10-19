using System;
using System.Threading;
using System.Windows.Forms;
using Gestivo.AgenteBiometrico.App;
using Gestivo.AgenteBiometrico.Nucleo;

namespace Gestivo.AgenteBiometrico
{
    internal static class Program
    {
        /// <summary>
        /// Instancia única. El agente arranca con Windows y alguien puede abrir
        /// el acceso directo otra vez sin darse cuenta: dos copias leerían la
        /// misma base y mandarían los mismos lotes (inofensivo, porque el
        /// servidor ignora repetidos, pero confuso en la bitácora).
        /// </summary>
        private const string NombreMutex = "Global\\GestivoAgenteBiometrico";

        [STAThread]
        private static void Main()
        {
            bool esNuestro;
            using (var mutex = new Mutex(true, NombreMutex, out esNuestro))
            {
                if (!esNuestro)
                {
                    MessageBox.Show(
                        "El agente del biométrico ya está abierto. Búsquelo en la bandeja, junto al reloj.",
                        "Agente del biométrico", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                // WinForms no instala contexto de sincronización hasta que hay
                // un bucle de mensajes; el Sincronizador lo necesita para volver
                // al hilo de la interfaz.
                SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());

                Bitacora.LimpiarViejas();

                // Un error no atrapado no debe dejar un icono muerto en la
                // bandeja sin que quede rastro de por qué.
                Application.ThreadException += (s, e) =>
                {
                    Bitacora.Error("Error no atrapado en la interfaz", e.Exception);
                    MessageBox.Show(
                        "Ocurrió un error inesperado:\n\n" + e.Exception.Message +
                        "\n\nQuedó en la bitácora: " + Bitacora.RutaDeHoy,
                        "Agente del biométrico", MessageBoxButtons.OK, MessageBoxIcon.Error);
                };
                AppDomain.CurrentDomain.UnhandledException += (s, e) =>
                    Bitacora.Error("Error no atrapado", e.ExceptionObject as Exception);

                using (var bandeja = new Bandeja())
                {
                    Application.Run();
                    GC.KeepAlive(bandeja);
                }

                GC.KeepAlive(mutex);
            }
        }
    }
}
