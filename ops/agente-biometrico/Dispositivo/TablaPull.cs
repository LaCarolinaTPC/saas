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
        ///
        /// Las que se entienden pero no son una huella de alguien —`EventType`
        /// distinto de 14 (puerta, alarma, verificación fallida) o pin 0— se
        /// cuentan en <paramref name="ignorados"/>. Es el mismo filtro que
        /// <see cref="EnVivo"/> y que la vía Access (`event_type = 14`): sin él,
        /// la puesta al día mandaba a Gestivo sucesos que no son marcaciones.
        /// Si la cabecera no trae `EventType`, la fila pasa: no se inventa.
        /// </summary>
        public static List<EventoEquipo> Transacciones(string texto, out int omitidas, out int ignorados)
        {
            omitidas = 0;
            ignorados = 0;
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

            int iPin, iVerificado, iEvento, iMomento, iEntradaSalida;
            if (!columnas.TryGetValue("Pin", out iPin)) return salida;
            if (!columnas.TryGetValue("Time_second", out iMomento)) return salida;
            columnas.TryGetValue("Verified", out iVerificado);
            columnas.TryGetValue("EventType", out iEvento);
            columnas.TryGetValue("InOutState", out iEntradaSalida);
            var tieneVerificado = columnas.ContainsKey("Verified");
            var tieneEvento = columnas.ContainsKey("EventType");
            var tieneEntradaSalida = columnas.ContainsKey("InOutState");

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
                if (pin == "0")
                {
                    ignorados++;
                    continue;
                }

                int? tipo = tieneEvento ? Entero(campos, iEvento) : (int?)null;
                if (tipo.HasValue && tipo.Value != EventoVerificacionValida)
                {
                    ignorados++;
                    continue;
                }

                salida.Add(new EventoEquipo
                {
                    Pin = pin,
                    // La tabla del equipo solo guarda lo que ocurrió; la validez
                    // la dice `EventType`, ya filtrado arriba.
                    EsInvalido = 0,
                    Estado = tieneEntradaSalida ? Entero(campos, iEntradaSalida) : 0,
                    TipoEvento = tipo,
                    MetodoVerificacion = tieneVerificado ? Entero(campos, iVerificado) : 0,
                    MetodoYaEsDeZkAccess = true,
                    Momento = momento.Value,
                    RecibidoAt = ahora,
                    Fuente = FuenteEvento.Lectura,
                });
            }
            return salida;
        }

        /// <summary>Tipo de evento del registro de estado de puerta y alarma.</summary>
        public const int EventoEstadoPuerta = 255;

        /// <summary>
        /// Una tanda de `GetRTLog`. Sin cabecera y con la fecha ya formateada.
        ///
        /// Orden del SDK pull (el mismo juego de campos que la tabla
        /// `transaction`, en otro orden):
        ///   `0 hora, 1 pin, 2 tarjeta, 3 puerta, 4 TIPO DE EVENTO, 5 entrada/salida, 6 modo de verificación`
        ///
        /// Hasta la 1.2.x se leía el tipo en la columna 6, por un orden «medido»
        /// con una sola línea, la de estado de puerta (`…,0,0,0,255,0,200`): ahí
        /// el 255 de la columna 4 es el tipo (estado de puerta, que el equipo
        /// devuelve en cada sondeo sin novedad) y el 200 de la 6 el modo de
        /// verificación «otro». Con la columna equivocada TODA huella real
        /// (`…,332,0,1,14,0,6`) se descartaba: en diez días de producción no
        /// llegó ni una en vivo y solo entraban con la puesta al día al reconectar.
        ///
        /// Solo se devuelven las verificaciones válidas (`tipo = 14`) con pin.
        /// El resto son sucesos de puerta y alarmas, y mandarlos a Gestivo como
        /// huellas inventaría presencias. <paramref name="raras"/>, si se pasa,
        /// recibe las líneas descartadas que NO son el estado de puerta de cada
        /// sondeo: son las que conviene ver en la bitácora si algo no cuadra.
        /// </summary>
        public static List<EventoEquipo> EnVivo(string texto, out int ignorados, List<string> raras = null)
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
                    raras?.Add(linea);
                    continue;
                }

                DateTime momento;
                if (!DateTime.TryParseExact(campos[0].Trim(), "yyyy-MM-dd HH:mm:ss",
                        CultureInfo.InvariantCulture, DateTimeStyles.None, out momento))
                {
                    ignorados++;
                    raras?.Add(linea);
                    continue;
                }

                var tipo = Entero(campos, 4);
                var pin = campos[1].Trim();
                if (tipo != EventoVerificacionValida || pin.Length == 0 || pin == "0")
                {
                    ignorados++;
                    if (tipo != EventoEstadoPuerta) raras?.Add(linea);
                    continue;
                }

                salida.Add(new EventoEquipo
                {
                    Pin = pin,
                    EsInvalido = 0,
                    Estado = Entero(campos, 5),
                    TipoEvento = tipo,
                    // El tipo 14 ya es «abrir con huella», y 6 es el valor con el
                    // que ZKAccess guarda una huella: el mismo que trae la vía
                    // Access, para que las dos puertas coincidan. El modo de la
                    // columna 6 no se usa porque su codificación no está medida.
                    MetodoVerificacion = MapeoEquipo.VerificadoHuella,
                    MetodoYaEsDeZkAccess = true,
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
