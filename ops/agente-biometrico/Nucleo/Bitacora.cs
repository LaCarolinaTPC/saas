using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;

namespace Gestivo.AgenteBiometrico.Nucleo
{
    /// <summary>
    /// Bitácora en archivo, una por día, en
    /// %LOCALAPPDATA%\Gestivo\AgenteBiometrico\logs. Lleva cédulas y nombres, así
    /// que nunca sale del PC.
    ///
    /// Nada de lo que pase aquí puede tumbar al agente: si no se puede escribir
    /// (disco lleno, permisos), se traga el error y se sigue.
    /// </summary>
    public static class Bitacora
    {
        private static readonly object Candado = new object();
        private const int DiasQueSeGuardan = 30;

        public static string RutaDeHoy
        {
            get
            {
                var nombre = "agente-" + DateTime.Now.ToString("yyyyMMdd", CultureInfo.InvariantCulture) + ".log";
                return Path.Combine(Configuracion.CarpetaLogs, nombre);
            }
        }

        public static void Info(string mensaje)
        {
            Escribir("INFO ", mensaje);
        }

        public static void Aviso(string mensaje)
        {
            Escribir("AVISO", mensaje);
        }

        public static void Error(string mensaje, Exception e = null)
        {
            Escribir("ERROR", e == null ? mensaje : mensaje + ": " + e.Message);
        }

        private static void Escribir(string nivel, string mensaje)
        {
            var linea = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture)
                        + "  " + nivel + "  " + mensaje;
            try
            {
                lock (Candado)
                {
                    Directory.CreateDirectory(Configuracion.CarpetaLogs);
                    File.AppendAllText(RutaDeHoy, linea + Environment.NewLine);
                }
            }
            catch
            {
                // Sin bitácora el agente sigue funcionando: no se interrumpe por esto.
            }
            System.Diagnostics.Debug.WriteLine(linea);
        }

        /// <summary>
        /// Las últimas <paramref name="lineas"/> de la bitácora de hoy, para
        /// mostrar la actividad en vivo dentro de la ventana de Estado (sin
        /// tener que abrir el archivo).
        /// </summary>
        public static string[] Ultimas(int lineas)
        {
            try
            {
                lock (Candado)
                {
                    if (!File.Exists(RutaDeHoy)) return new string[0];
                    // FileShare.ReadWrite: el propio agente la tiene abierta
                    // para escribir cuando esto se llama.
                    using (var fs = new FileStream(RutaDeHoy, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                    using (var sr = new StreamReader(fs))
                    {
                        var cola = new LinkedList<string>();
                        string linea;
                        while ((linea = sr.ReadLine()) != null)
                        {
                            cola.AddLast(linea);
                            if (cola.Count > lineas) cola.RemoveFirst();
                        }
                        var salida = new string[cola.Count];
                        cola.CopyTo(salida, 0);
                        return salida;
                    }
                }
            }
            catch
            {
                return new[] { "(no se pudo leer la bitácora)" };
            }
        }

        /// <summary>Borra las bitácoras viejas. Se llama al arrancar.</summary>
        public static void LimpiarViejas()
        {
            try
            {
                if (!Directory.Exists(Configuracion.CarpetaLogs)) return;
                var corte = DateTime.Now.AddDays(-DiasQueSeGuardan);
                var viejas = Directory.GetFiles(Configuracion.CarpetaLogs, "agente-*.log")
                    .Where(f => File.GetLastWriteTime(f) < corte)
                    .ToList();
                foreach (var f in viejas) File.Delete(f);
                if (viejas.Count > 0)
                    Info("Bitácoras borradas por antiguas: " + viejas.Count);
            }
            catch (Exception e)
            {
                Error("No se pudieron limpiar las bitácoras viejas", e);
            }
        }
    }
}
