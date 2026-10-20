using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;

namespace Gestivo.AgenteBiometrico.Dispositivo
{
    /// <summary>De dónde salió el evento, para poder leerlo en la bitácora.</summary>
    public enum FuenteEvento
    {
        /// <summary>Llegó solo, por `OnAttTransactionEx`. Es la vía rápida.</summary>
        TiempoReal,

        /// <summary>Se leyó de la memoria del equipo al (re)conectar.</summary>
        Lectura,
    }

    /// <summary>
    /// Una verificación tal como la entrega el SDK. Deliberadamente en crudo: la
    /// traducción a lo que entiende Gestivo vive en <see cref="MapeoEquipo"/>,
    /// que es puro y se puede probar sin equipo.
    /// </summary>
    public class EventoEquipo
    {
        /// <summary>`EnrollNumber` del SDK = `Badgenumber` de ZKAccess = `pin`.</summary>
        public string Pin { get; set; }

        /// <summary>0 = verificación válida. Distinto de 0 = rechazada.</summary>
        public int EsInvalido { get; set; }

        /// <summary>`AttState`: entrada, salida… El MA500 de la portería manda 0.</summary>
        public int Estado { get; set; }

        /// <summary>`VerifyMethod`: con qué se identificó (huella, clave, tarjeta).</summary>
        public int MetodoVerificacion { get; set; }

        /// <summary>Hora del EQUIPO, sin zona. Es la que cruza con `acc_monitor_log.time`.</summary>
        public DateTime Momento { get; set; }

        public int CodigoTrabajo { get; set; }

        /// <summary>Hora del PC al captarlo. Mide la latencia y el desfase del reloj.</summary>
        public DateTimeOffset RecibidoAt { get; set; }

        public FuenteEvento Fuente { get; set; }

        public override string ToString()
        {
            return "pin " + Pin + " · " + Momento.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) +
                   " · metodo " + MetodoVerificacion + " · estado " + Estado +
                   " · invalido " + EsInvalido + " · " + (Fuente == FuenteEvento.TiempoReal ? "en vivo" : "leido");
        }
    }

    /// <summary>Lo que el equipo cuenta de sí mismo al conectarse.</summary>
    public class InfoEquipo
    {
        public string Sn { get; set; }
        public string Firmware { get; set; }
        public string VersionSdk { get; set; }
        public string Plataforma { get; set; }

        /// <summary>Hora del equipo y su desfase contra el PC (positivo = el equipo va adelantado).</summary>
        public DateTime? HoraEquipo { get; set; }
        public TimeSpan? Desfase { get; set; }

        /// <summary>`GetDeviceStatus` 6: registros de asistencia guardados.</summary>
        public int? Registros { get; set; }

        /// <summary>Capacidad de registros que reporta el equipo, si la reporta.</summary>
        public int? Capacidad { get; set; }

        /// <summary>Todos los contadores de `GetDeviceStatus`, para el diagnóstico.</summary>
        public Dictionary<int, int> Contadores { get; set; } = new Dictionary<int, int>();

        /// <summary>«12.400 de 100.000 (12 %)», o «?» si el equipo no lo dice.</summary>
        public string Ocupacion()
        {
            if (!Registros.HasValue) return "?";
            var co = CultureInfo.GetCultureInfo("es-CO");
            var texto = Registros.Value.ToString("N0", co);
            if (!Capacidad.HasValue || Capacidad.Value <= 0) return texto;
            var pct = (int)Math.Round(100.0 * Registros.Value / Capacidad.Value);
            return texto + " de " + Capacidad.Value.ToString("N0", co) + " (" + pct + " %)";
        }

        /// <summary>
        /// ¿Toca avisar? El tope real no se conoce hasta que el equipo lo
        /// reporte; sin él se usa 100.000, que es el orden del MA500. Solo
        /// AVISA: el vaciado nunca es automático.
        /// </summary>
        public bool MemoriaCasiLlena
        {
            get
            {
                if (!Registros.HasValue) return false;
                var tope = Capacidad.HasValue && Capacidad.Value > 0 ? Capacidad.Value : 100000;
                return Registros.Value >= (int)(tope * 0.8);
            }
        }
    }

    /// <summary>Lo que devolvió una lectura de la memoria del equipo.</summary>
    public class ResultadoLectura
    {
        public List<EventoEquipo> Eventos { get; set; } = new List<EventoEquipo>();

        /// <summary>«por fecha», «solo nuevos» o «completa»: cuál de los tres caminos sirvió.</summary>
        public string Metodo { get; set; }

        /// <summary>Cuántos entregó el equipo ANTES de filtrar por fecha.</summary>
        public int Leidos { get; set; }

        public TimeSpan Duracion { get; set; }

        public string Resumen()
        {
            var co = CultureInfo.GetCultureInfo("es-CO");
            return Metodo + ", " + Eventos.Count.ToString("N0", co) + " de " +
                   Leidos.ToString("N0", co) + " en " +
                   Duracion.TotalSeconds.ToString("0.0", co) + " s";
        }
    }

    /// <summary>
    /// El lector, visto desde el agente.
    ///
    /// Existe la interfaz —y no solo la clase— porque el COM del SDK no está
    /// disponible en el PC de desarrollo: `ClienteZk` se compila únicamente
    /// cuando `Lib\Interop.zkemkeeper.dll` existe, y si no se compila
    /// `ClienteZkAusente`, que cumple el mismo contrato y explica qué falta.
    /// Así el resto del agente (TiempoReal, las ventanas) se escribe, compila y
    /// prueba sin tener el equipo delante.
    ///
    /// Todos los métodos son `Task` porque por dentro cruzan a un hilo STA
    /// propio: el COM entrega los eventos al hilo que creó el objeto y ese hilo
    /// tiene que estar bombeando mensajes.
    ///
    /// SOLO LECTURA, con una única excepción declarada: <see cref="Vaciar"/>,
    /// que nunca se llama sola (ver «Vaciar memoria del equipo…»).
    /// </summary>
    public interface IEquipoZk : IDisposable
    {
        /// <summary>false en la compilación sin SDK: nada más va a funcionar.</summary>
        bool SdkDisponible { get; }

        /// <summary>true entre `Conectar` correcto y `Desconectar`.</summary>
        bool Conectado { get; }

        /// <summary>Una verificación. Llega en el hilo STA: el manejador solo debe encolar.</summary>
        event Action<EventoEquipo> Evento;

        /// <summary>El SDK avisó que se cayó la conexión.</summary>
        event Action Desconectado;

        Task<InfoEquipo> Conectar(string ip, int puerto, int numero, int? claveComm);

        /// <summary>Suscribe los eventos en vivo. Después de la lectura de puesta al día.</summary>
        Task<bool> RegistrarEventos(int numero);

        /// <summary>
        /// La memoria del equipo. Con <paramref name="desde"/> intenta primero
        /// pedirle solo ese tramo, que es lo barato; si el firmware no lo
        /// soporta, lee todo y filtra.
        /// </summary>
        Task<ResultadoLectura> LeerRegistros(int numero, DateTime? desde, CancellationToken ct);

        /// <summary>Latido barato: pide la hora. false = el TCP ya no sirve.</summary>
        Task<bool> Ping(int numero);

        Task<InfoEquipo> Consultar(int numero);

        /// <summary>
        /// `ClearGLog`: borra TODOS los registros del equipo. El SDK clásico no
        /// tiene borrado por fecha. Nunca se llama sin que una persona lo haya
        /// confirmado y sin haber confirmado antes que Gestivo lo recibió todo.
        /// </summary>
        Task<bool> Vaciar(int numero);

        Task Desconectar();

        /// <summary>
        /// Los pasos de «Probar equipo…», escribiendo cada línea por
        /// <paramref name="escribir"/> a medida que ocurren. Vive aquí porque es
        /// todo COM; la ventana solo lo muestra.
        /// </summary>
        Task Diagnosticar(EquipoConfigurado equipo, int? claveComm, int numero,
            Action<string> escribir, CancellationToken ct);
    }
}
