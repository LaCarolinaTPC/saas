using System.Globalization;

namespace Gestivo.AgenteBiometrico.Dispositivo
{
    /// <summary>
    /// El SDK no lanza excepciones: los métodos devuelven `false` y hay que
    /// pedirle el código con `GetLastError`. Un «false» pelado en la bitácora no
    /// se puede arreglar a distancia, así que aquí se convierte en algo que una
    /// persona en la portería pueda leer.
    ///
    /// Las pistas van por OPERACIÓN y no por código, a propósito: la tabla de
    /// códigos del SDK clásico está mal documentada y poner glosas inventadas
    /// sería peor que no ponerlas. Lo que sí se sabe con certeza es qué suele
    /// fallar al conectarse a un lector de estos, y en qué orden mirarlo.
    /// </summary>
    public static class ErroresSdk
    {
        /// <summary>El código, sin adornos. PURO.</summary>
        public static string Codigo(int codigo)
        {
            return "código " + codigo.ToString(CultureInfo.InvariantCulture) + " del SDK";
        }

        /// <summary>
        /// Por qué no se pudo abrir la conexión. El orden de las causas es el
        /// orden en que conviene mirarlas en sitio.
        /// </summary>
        public static string Conexion(int codigo, string ip, int puerto)
        {
            return "No se pudo conectar con " + ip + ":" +
                   puerto.ToString(CultureInfo.InvariantCulture) + " (" + Codigo(codigo) + "). " +
                   "Mire, en este orden: (1) ZKAccess abierto en este PC o en otro —este equipo " +
                   "admite una sola conexión a la vez—; (2) el equipo apagado o sin red " +
                   "(pruebe «ping " + ip + "»); (3) el puerto, que en estos lectores es 4370; " +
                   "(4) la clave de comunicación, si el equipo tiene una puesta.";
        }

        /// <summary>Por qué falló una lectura de la memoria.</summary>
        public static string Lectura(int codigo)
        {
            return "El equipo no entregó sus registros (" + Codigo(codigo) + "). " +
                   "Si acaba de perder la conexión, el agente reintenta solo; si se repite " +
                   "con el equipo accesible, probablemente este firmware no admita esa forma " +
                   "de lectura y haya que usar la completa.";
        }

        /// <summary>Por qué no se pudo suscribir a los eventos en vivo.</summary>
        public static string Eventos(int codigo)
        {
            return "El equipo no aceptó la suscripción a eventos en tiempo real (" +
                   Codigo(codigo) + "). Las huellas seguirán llegando, pero solo cuando el " +
                   "agente lea su memoria al reconectarse o cuando ZKAccess descargue.";
        }
    }
}
