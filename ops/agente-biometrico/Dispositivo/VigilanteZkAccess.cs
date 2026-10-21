using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using Gestivo.AgenteBiometrico.Nucleo;

namespace Gestivo.AgenteBiometrico.Dispositivo
{
    /// <summary>
    /// ¿Está ZKAccess abierto?
    ///
    /// Nació porque se asumía que el MA500 **no acepta dos clientes TCP a la
    /// vez**: si el agente tenía la conexión tomada, ZKAccess mostraría el
    /// equipo «desconectado» y nadie podría enrolar ni descargar. Por el SDK
    /// pull se midió el 2026-10-20 que SÍ admite varias sesiones, así que hoy
    /// es prudencia más que necesidad, y se conserva porque cuesta poco: un
    /// lector standalone podría no admitirlas. Mientras ZKAccess esté abierto
    /// el agente suelta la conexión, y al cerrarse la retoma y se pone al día.
    ///
    /// Solo ve los procesos de ESTE PC. Si el agente corre en otro PC de la red,
    /// no tiene forma de saber si ZKAccess está abierto allá (la bitácora lo
    /// avisa al arrancar).
    ///
    /// Por PROCESO y no por intento de conexión, porque es la única señal que se
    /// tiene antes de molestar al equipo. ZKAccess 3.5 corre como `Access.exe`
    /// —su propio ejecutable, no el de Office, que es `MSACCESS.exe`—, así que
    /// la comparación es por nombre exacto y Office no la dispara.
    /// </summary>
    public class VigilanteZkAccess
    {
        /// <summary>
        /// Cuánto se espera tras verlo cerrarse. ZKAccess tarda en soltar el
        /// socket, y sin esta gracia un cierre y reapertura rápidos harían
        /// rebotar la conexión (conectar, leer memoria, ceder, repetir).
        /// </summary>
        public static readonly TimeSpan Gracia = TimeSpan.FromSeconds(15);

        private readonly object _candado = new object();
        private string[] _nombres;
        private bool _abierto;
        private string _quien;
        private DateTime? _cerradoA;

        public VigilanteZkAccess(string procesos)
        {
            _nombres = NombresDe(procesos);
        }

        /// <summary>
        /// La lista configurada, normalizada: sin la extensión, sin espacios,
        /// sin repetidos y sin vacíos. PURO, así que se prueba solo.
        ///
        /// Vacía = nadie a quien ceder. Es una decisión explícita y vale: si
        /// ZKAccess se usara desde otro PC, el agente no tendría que ceder nada.
        /// </summary>
        public static string[] NombresDe(string procesos)
        {
            if (string.IsNullOrWhiteSpace(procesos)) return new string[0];
            return procesos
                .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(p => p.Trim())
                .Select(p => p.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
                    ? p.Substring(0, p.Length - 4)
                    : p)
                .Where(p => p.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        public void Reconfigurar(string procesos)
        {
            var nuevos = NombresDe(procesos);
            lock (_candado) _nombres = nuevos;
        }

        /// <summary>Lo último que se vio, sin volver a mirar los procesos.</summary>
        public bool Abierto
        {
            get { lock (_candado) return _abierto; }
        }

        /// <summary>Quién lo tiene tomado, para decirlo en pantalla.</summary>
        public string Quien
        {
            get { lock (_candado) return _quien; }
        }

        /// <summary>
        /// Mira los procesos ahora. Devuelve true si está abierto.
        ///
        /// Si no se pueden enumerar los procesos (permisos), se responde
        /// «cerrado»: el agente intenta conectarse y, si el equipo rechaza la
        /// segunda sesión, eso queda como un error de conexión normal y
        /// reintenta. Al contrario —asumir «abierto»— la vía equipo no
        /// arrancaría nunca y nadie sabría por qué.
        /// </summary>
        public bool Revisar()
        {
            string[] nombres;
            lock (_candado) nombres = _nombres;

            var abierto = false;
            string quien = null;
            foreach (var n in nombres)
            {
                try
                {
                    var procesos = Process.GetProcessesByName(n);
                    try
                    {
                        if (procesos.Length > 0)
                        {
                            abierto = true;
                            quien = n + ".exe";
                            break;
                        }
                    }
                    finally
                    {
                        foreach (var p in procesos) p.Dispose();
                    }
                }
                catch (Exception e)
                {
                    Bitacora.Error("No se pudieron enumerar los procesos «" + n + "»", e);
                }
            }

            lock (_candado)
            {
                // El instante del cierre se guarda para medir la gracia.
                if (_abierto && !abierto) _cerradoA = DateTime.UtcNow;
                if (abierto) _cerradoA = null;
                _abierto = abierto;
                _quien = quien;
            }
            return abierto;
        }

        /// <summary>
        /// ¿Se puede tomar la conexión del equipo? Hay que haber llamado antes a
        /// <see cref="Revisar"/>.
        /// </summary>
        public bool PuedeConectar()
        {
            lock (_candado)
            {
                if (_abierto) return false;
                // Nunca se le vio abierto: no hay nada que esperar.
                if (!_cerradoA.HasValue) return true;
                return DateTime.UtcNow - _cerradoA.Value >= Gracia;
            }
        }

        /// <summary>Segundos que faltan de gracia, para explicarlo en pantalla.</summary>
        public int SegundosDeGracia()
        {
            lock (_candado)
            {
                if (_abierto || !_cerradoA.HasValue) return 0;
                var falta = Gracia - (DateTime.UtcNow - _cerradoA.Value);
                return falta > TimeSpan.Zero ? (int)Math.Ceiling(falta.TotalSeconds) : 0;
            }
        }

        /// <summary>Los procesos que se están vigilando, para la ventana de Estado.</summary>
        public IReadOnlyList<string> Vigilados
        {
            get { lock (_candado) return _nombres.ToList(); }
        }
    }
}
