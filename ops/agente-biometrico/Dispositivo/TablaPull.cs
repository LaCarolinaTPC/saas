using System;
using System.Collections.Generic;
using System.Globalization;

namespace Gestivo.AgenteBiometrico.Dispositivo
{
    /// <summary>
    /// Lo que devuelve el SDK pull, convertido a <see cref="EventoEquipo"/>.
    ///
    /// Son dos formatos distintos y conviene no confundirlos:
    ///
    /// **`GetDeviceData("transaction")`** devuelve texto con CABECERA y filas
    /// separadas por saltos de línea, al estilo CSV. Medido en el equipo:
    ///
    ///     Cardno,Pin,Verified,DoorID,EventType,InOutState,Time_second
    ///     0,332,6,1,14,0,807429214
    ///
    /// Los nombres de las columnas vienen en la cabecera, así que se leen de
    /// ahí y NO por posición: si el firmware agrega una columna, esto sigue
    /// funcionando.
    ///
    /// **`GetRTLog`** devuelve filas SIN cabecera, con la fecha ya formateada:
    ///
    ///     2026-10-20 16:16:33,0,0,0,255,0,200
    ///
    /// Ahí sí toca ir por posición, y el orden está medido contra el equipo.
    ///
    /// `Verified = 6` y `EventType = 14` son exactamente los valores que ZKAccess
    /// guarda en `acc_monitor_log` (`verified` y `event_type`): es la misma
    /// fuente de datos, leída directo.
    ///
    /// PURO: ni red ni COM. Se prueba con las cadenas de verdad del equipo.
    /// </summary>
    public static class TablaPull
    {
        /// <summary>`event_type` de ZKAccess para una verificación válida.</summary>
        public const int EventoVerificacionValida = 14;

        private static readonly char[] Saltos = { '\r', '\n' };
        private static readonly char[] Comas = { ',' };

        /// <summary>
        /// Las filas de la tabla `transaction`. Las que no se puedan interpretar
        /// se omiten en silencio y se cuentan en <paramref name="omitidas"/>:
        /// con 95.000 filas, una corrupta no puede tumbar la descarga entera.
        /// </summary>
        public static List<EventoEquipo> Transacciones(string texto, out int omitidas)
        {
            omitidas = 0;
            var salida = new List<EventoEquipo>();
            if (string.IsNullOrWhiteSpace(texto)) return salida;

            var lineas = texto.Split(Saltos, StringSplitOptions.RemoveEmptyEntries);
            if (lineas.Length < 2) return salida;

            // La cabecera manda: así una columna nueva del firmware no desplaza
            // la lectura.
            var columnas = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var nombres = lineas[0].Split(Comas);
            for (var i = 0; i < nombres.Length; i++)
                columnas[nombres[i].Trim()] = i;

            int iPin, iVerificado, iEvento, iMomento;
            if (!columnas.TryGetValue("Pin", out iPin)) return salida;
            if (!columnas.TryGetValue("Time_second", out iMomento)) return salida;
            columnas.TryGetValue("Verified", out iVerificado);
            columnas.TryGetValue("EventType", out iEvento);
            var tieneVerificado = columnas.ContainsKey("Verified");
            var tieneEvento = columnas.ContainsKey("EventType");

            var ahora = DateTimeOffset.Now;
            for (var f = 1; f < lineas.Length; f++)
            {
                var campos = lineas[f].Split(Comas);
                if (campos.Length <= iMomento || campos.Length <= iPin)
                {
                    omitidas++;
                    continue;
                }

                int empaquetado;
                if (!int.TryParse(campos[iMomento].Trim(), NumberStyles.Integer,
                        CultureInfo.InvariantCulture, out empaquetado))
                {
                    omitidas++;
                    continue;
                }
                var momento = TiempoZk.Desempaquetar(empaquetado);
                if (momento == null)
                {
                    omitidas++;
                    continue;
                }

                var pin = campos[iPin].Trim();
                if (pin.Length == 0)
                {
                    omitidas++;
                    continue;
                }

                salida.Add(new EventoEquipo
                {
                    Pin = pin,
                    // La tabla del equipo solo guarda lo que ocurrió; no hay una
                    // marca de «rechazada» que leer aquí.
                    EsInvalido = 0,
                    Estado = tieneEvento ? Entero(campos, iEvento) : 0,
                    MetodoVerificacion = tieneVerificado ? Entero(campos, iVerificado) : 0,
                    Momento = momento.Value,
                    RecibidoAt = ahora,
                    Fuente = FuenteEvento.Lectura,
                });
            }
            return salida;
        }

        /// <summary>
        /// Una tanda de `GetRTLog`. Sin cabecera y con la fecha ya formateada.
        ///
        /// Orden medido contra el equipo:
        ///   `fecha, pin, tarjeta, puerta, ?, entradaSalida, tipoDeEvento`
        ///
        /// Solo se devuelven las verificaciones válidas (`tipoDeEvento = 14`).
        /// El resto son sucesos de puerta y alarmas —el 200 es «puerta abierta
        /// correctamente», que llega cada segundo— y mandarlos a Gestivo como
        /// huellas inventaría presencias.
        /// </summary>
        public static List<EventoEquipo> EnVivo(string texto, out int ignorados)
        {
            ignorados = 0;
            var salida = new List<EventoEquipo>();
            if (string.IsNullOrWhiteSpace(texto)) return salida;

            var ahora = DateTimeOffset.Now;
            foreach (var linea in texto.Split(Saltos, StringSplitOptions.RemoveEmptyEntries))
            {
                var campos = linea.Split(Comas);
                if (campos.Length < 7)
                {
                    ignorados++;
                    continue;
                }

                DateTime momento;
                if (!DateTime.TryParseExact(campos[0].Trim(), "yyyy-MM-dd HH:mm:ss",
                        CultureInfo.InvariantCulture, DateTimeStyles.None, out momento))
                {
                    ignorados++;
                    continue;
                }

                var tipo = Entero(campos, 6);
                if (tipo != EventoVerificacionValida)
                {
                    ignorados++;
                    continue;
                }

                var pin = campos[1].Trim();
                if (pin.Length == 0 || pin == "0")
                {
                    ignorados++;
                    continue;
                }

                salida.Add(new EventoEquipo
                {
                    Pin = pin,
                    EsInvalido = 0,
                    Estado = Entero(campos, 5),
                    // En la tabla `transaction` el método de verificación va en
                    // `Verified`; en tiempo real no viene, y el valor con el que
                    // ZKAccess guarda una huella es 6.
                    MetodoVerificacion = MapeoEquipo.VerificadoHuella,
                    Momento = momento,
                    RecibidoAt = ahora,
                    Fuente = FuenteEvento.TiempoReal,
                });
            }
            return salida;
        }

        /// <summary>
        /// Los pares `clave=valor` separados por comas que devuelve
        /// `GetDeviceParam`.
        /// </summary>
        public static Dictionary<string, string> Parametros(string texto)
        {
            var salida = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrWhiteSpace(texto)) return salida;
            foreach (var trozo in texto.Split(Comas, StringSplitOptions.RemoveEmptyEntries))
            {
                var i = trozo.IndexOf('=');
                if (i <= 0) continue;
                salida[trozo.Substring(0, i).Trim()] = trozo.Substring(i + 1).Trim();
            }
            return salida;
        }

        private static int Entero(string[] campos, int i)
        {
            if (i < 0 || i >= campos.Length) return 0;
            int v;
            return int.TryParse(campos[i].Trim(), NumberStyles.Integer,
                CultureInfo.InvariantCulture, out v)
                ? v
                : 0;
        }
    }
}
