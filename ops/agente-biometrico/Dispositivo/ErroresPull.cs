using System.Collections.Generic;
using System.Globalization;

namespace Gestivo.AgenteBiometrico.Dispositivo
{
    /// <summary>
    /// Los códigos de error del SDK pull, en palabras.
    ///
    /// No están inventados ni deducidos: salen de los propios archivos de idioma
    /// de ZKAccess (`Languages\emnetman_spa.xml`), donde cada código tiene su
    /// texto. Tenerlos aquí vale una tarde de trabajo — literalmente: el `-101`
    /// que bloqueó la lectura durante horas resultó ser **«el campo de condición
    /// no existe en la tabla»**, o sea una consulta mal escrita, cuando se había
    /// supuesto que era la memoria del equipo, el lector activo o el firmware.
    ///
    /// Dos que conviene no confundir, porque se parecen y significan cosas muy
    /// distintas:
    ///   · **-201** «lectura de librería fallida» → falta una DLL nativa;
    ///   · **-207** «el dispositivo está ocupado» → eso sí es otra sesión.
    /// </summary>
    public static class ErroresPull
    {
        private static readonly Dictionary<int, string> Tabla = new Dictionary<int, string>
        {
            // Estructura y consultas: el grupo que importa al leer tablas.
            { -100, "la tabla de estructura no existe" },
            { -101, "el campo de condición no existe en la tabla" },
            { -102, "el número total de campos no es consistente" },
            { -103, "la secuencia de campos no es consistente" },
            { -104, "error de datos en el evento de tiempo real" },
            { -105, "error de datos al resolverlos" },
            { -106, "desbordamiento: se entregaron más de 4 MB" },
            { -107, "no se pudo obtener la estructura de la tabla" },
            { -108, "opción inválida" },

            // Comunicación y carga del SDK.
            { -201, "lectura de librería fallida (falta una DLL nativa del SDK)" },
            { -202, "no se pudo cargar la interfaz" },
            { -203, "falló la inicialización de la comunicación" },
            { -206, "el puerto serie está ocupado o no existe" },
            { -207, "el dispositivo está ocupado" },

            // Red.
            { -301, "error de versión TCP/IP" },
            { -302, "error de versión TCP/IP" },
            { -303, "no se pudo obtener el tipo de protocolo" },
            { -304, "socket inválido" },
            { -305, "error de socket" },
            { -306, "error de host" },
            { -307, "se agotó el tiempo de espera" },

            // Protocolo y datos.
            { -8, "conexión no autorizada" },
            { -9, "error de datos: el CRC resultó erróneo" },
            { -10, "error de datos: el SDK no pudo resolverlos" },
            { -11, "error en los datos de un parámetro" },
            { -12, "falló la ejecución del comando" },
            { -13, "comando no disponible" },
            { -14, "error de contraseña de comunicación" },
            { -18, "búfer insuficiente" },
            { -20, "la longitud de los datos recibidos no cuadra con la entregada" },
            { -22, "plataforma de firmware inconsistente" },
            { -23, "la versión del firmware es muy antigua" },
            { -99, "error desconocido" },
            { -999, "el dispositivo no se ha inicializado" },
        };

        /// <summary>El código con su significado, si se conoce.</summary>
        public static string Codigo(int codigo)
        {
            var texto = codigo.ToString(CultureInfo.InvariantCulture);
            string que;
            return Tabla.TryGetValue(codigo, out que)
                ? "código " + texto + " («" + que + "»)"
                : "código " + texto + " del SDK pull";
        }

        /// <summary>Por qué no se pudo abrir la conexión, con lo que conviene mirar.</summary>
        public static string Conexion(int codigo, string ip, int puerto)
        {
            var mensaje = "No se pudo conectar con " + ip + ":" +
                          puerto.ToString(CultureInfo.InvariantCulture) + ", " + Codigo(codigo) + ".";

            // Las dos causas que de verdad se dan, y son opuestas.
            if (codigo == -201 || codigo == -202)
                return mensaje + " Esto NO es del equipo: al SDK le falta una de sus DLL nativas. " +
                       "Son plcommpro.dll y sus transportes plcomms, pltcpcomm, plrscomm y plusbcomm; " +
                       "en el PC de ZKAccess viven en C:\\Windows\\SysWOW64.";
            if (codigo == -207)
                return mensaje + " El equipo está atendiendo a otro cliente. Cierre ZKAccess y " +
                       "compruebe que no quedó otra copia del agente abierta.";
            if (codigo == -307 || codigo == -306 || codigo == -305)
                return mensaje + " Es de red: compruebe que el equipo responde («ping " + ip + "») y " +
                       "que el puerto es el 4370.";
            if (codigo == -14)
                return mensaje + " La clave de comunicación no coincide con la del equipo. " +
                       "ZKAccess la guarda en Machines.CommPassword.";
            return mensaje;
        }

        /// <summary>Por qué falló una lectura de tabla.</summary>
        public static string Lectura(int codigo)
        {
            var mensaje = "El equipo no entregó la tabla, " + Codigo(codigo) + ".";
            if (codigo == -101)
                return mensaje + " Es un error de CONSULTA, no del equipo: el campo por el que se " +
                       "filtra no existe. En la tabla «transaction» el de la fecha se llama " +
                       "Time_second, y el filtro no admite operadores de rango.";
            if (codigo == -106)
                return mensaje + " Hay que leer en trozos o agrandar el búfer.";
            return mensaje;
        }
    }
}
