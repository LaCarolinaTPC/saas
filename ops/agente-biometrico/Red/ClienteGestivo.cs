using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Gestivo.AgenteBiometrico.Datos;
using Gestivo.AgenteBiometrico.Nucleo;
using Newtonsoft.Json;

namespace Gestivo.AgenteBiometrico.Red
{
    /// <summary>
    /// Lo que responde GET /api/biometrico/estado.
    ///
    /// Hay DOS marcas de avance, una por vía, porque las dos identifican las
    /// huellas de forma distinta: la vía Access por `acc_monitor_log.id`, y la
    /// vía equipo por momento, que es lo único que el lector sabe.
    /// </summary>
    public class EstadoServidor
    {
        [JsonProperty("ultimo_id")] public long? UltimoId { get; set; }
        [JsonProperty("ultimo_momento")] public string UltimoMomento { get; set; }

        /// <summary>Por número de serie: { "AHID222860036": "2026-10-20T06:42:10+00:00", … }</summary>
        [JsonProperty("ultimo_momento_equipo")]
        public Dictionary<string, string> UltimoMomentoEquipo { get; set; }

        /// <summary>De respaldo, para un lector que nunca ha reportado.</summary>
        [JsonProperty("ultimo_momento_global")] public string UltimoMomentoGlobal { get; set; }

        [JsonProperty("ultimo_envio_at")] public string UltimoEnvioAt { get; set; }
        [JsonProperty("servidor_at")] public string ServidorAt { get; set; }
    }

    /// <summary>Lo que responde POST /api/biometrico/marcaciones.</summary>
    public class RespuestaEnvio
    {
        [JsonProperty("recibidas")] public int Recibidas { get; set; }
        [JsonProperty("nuevas")] public int Nuevas { get; set; }

        /// <summary>
        /// Ya estaban —las había traído el equipo, sin `id_zk`— y este envío de
        /// la vía Access les puso el suyo. Es la señal de que las dos vías están
        /// cruzando bien: si tras una descarga en ZKAccess sale 0, algo no cuadra
        /// en la hora o en el pin.
        /// </summary>
        [JsonProperty("completadas")] public int Completadas { get; set; }

        [JsonProperty("repetidas")] public int Repetidas { get; set; }
        [JsonProperty("ultimo_id")] public long? UltimoId { get; set; }
        [JsonProperty("ultimo_momento")] public string UltimoMomento { get; set; }
    }

    /// <summary>
    /// El error trae el cuerpo de Gestivo, que dice qué fila del lote está mal
    /// («marcaciones[137]: momento … no es una fecha»). Sin eso, un 400 es
    /// imposible de arreglar a distancia.
    /// </summary>
    public class ErrorGestivo : Exception
    {
        public HttpStatusCode Codigo { get; }

        /// <summary>true si no tiene sentido reintentar sin arreglar algo (4xx).</summary>
        public bool EsDelCliente { get; }

        /// <summary>
        /// ¿Hay que DESCARTAR el lote, o devolverlo a la cola y reintentar?
        ///
        /// Solo el **400**. El servidor validó el lote y lo rechazó por mal
        /// formado, así que reintentar lo mismo no lo va a arreglar nunca y
        /// atascaría para siempre todo lo que venga detrás.
        ///
        /// Todo lo demás se reintenta, y el 401 y el 404 en particular: son el
        /// secreto o la URL equivocados, o sea CONFIGURACIÓN. Tirar huellas por
        /// eso sería perderlas por algo que se arregla en una ventana — y es
        /// justo lo que hacía antes, descartando ante cualquier 4xx.
        /// </summary>
        public bool SeDescarta
        {
            get { return Codigo == HttpStatusCode.BadRequest; }
        }

        public ErrorGestivo(HttpStatusCode codigo, string mensaje)
            : base(mensaje)
        {
            Codigo = codigo;
            EsDelCliente = (int)codigo >= 400 && (int)codigo < 500;
        }
    }

    /// <summary>
    /// Cliente de los endpoints del biométrico. Un solo HttpClient para toda la
    /// vida del proceso (crear uno por llamada agota los sockets).
    /// </summary>
    public class ClienteGestivo : IDisposable
    {
        private readonly HttpClient _http;
        private readonly string _url;

        static ClienteGestivo()
        {
            // .NET Framework 4.8 por defecto no necesariamente habilita TLS 1.2
            // según la política del equipo, y Vercel no acepta menos.
            try
            {
                ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            }
            catch (Exception e)
            {
                Bitacora.Error("No se pudo forzar TLS 1.2", e);
            }
        }

        public ClienteGestivo(string url, string secreto, int timeoutSeg = 120)
        {
            _url = (url ?? "").TrimEnd('/');
            _http = new HttpClient { Timeout = TimeSpan.FromSeconds(timeoutSeg) };
            _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", secreto);
            _http.DefaultRequestHeaders.UserAgent.ParseAdd("GestivoAgenteBiometrico/1.0");
        }

        public async Task<EstadoServidor> LeerEstado(CancellationToken ct)
        {
            using (var resp = await _http.GetAsync(_url + "/api/biometrico/estado", ct).ConfigureAwait(false))
            {
                var cuerpo = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
                if (!resp.IsSuccessStatusCode) throw Traducir(resp.StatusCode, cuerpo);
                return JsonConvert.DeserializeObject<EstadoServidor>(cuerpo) ?? new EstadoServidor();
            }
        }

        public async Task<RespuestaEnvio> Enviar(
            string agente,
            List<PersonaZk> personas,
            List<MarcacionZk> marcaciones,
            CancellationToken ct)
        {
            var cuerpoObj = new Dictionary<string, object>
            {
                { "agente", agente },
                { "marcaciones", marcaciones ?? new List<MarcacionZk>() },
            };
            // Las personas solo van cuando hay algo que mandar: son 790 filas y
            // no cambian entre lotes del mismo ciclo.
            if (personas != null && personas.Count > 0) cuerpoObj["personas"] = personas;

            var json = JsonConvert.SerializeObject(cuerpoObj);
            // UTF-8 explícito: hay nombres con tildes y eñes.
            using (var contenido = new StringContent(json, new UTF8Encoding(false), "application/json"))
            using (var resp = await _http
                       .PostAsync(_url + "/api/biometrico/marcaciones", contenido, ct)
                       .ConfigureAwait(false))
            {
                var cuerpo = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
                if (!resp.IsSuccessStatusCode) throw Traducir(resp.StatusCode, cuerpo);
                return JsonConvert.DeserializeObject<RespuestaEnvio>(cuerpo) ?? new RespuestaEnvio();
            }
        }

        /// <summary>
        /// Una fecha y hora del servidor a hora local del PC.
        ///
        /// PostgREST normaliza los `timestamptz` a `+00:00`, así que lo que
        /// llega está en UTC aunque el dato se guardara con el offset de Bogotá:
        /// leer los dígitos de la hora tal cual daría cinco horas de menos y la
        /// puesta al día pediría un tramo equivocado. `DateTimeOffset.Parse` con
        /// el offset que trae la cadena es lo que lo resuelve.
        /// </summary>
        public static DateTime? ParsearMomento(string iso)
        {
            if (string.IsNullOrWhiteSpace(iso)) return null;
            DateTimeOffset f;
            if (!DateTimeOffset.TryParse(iso, System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.AssumeUniversal, out f))
            {
                Bitacora.Aviso("El servidor mandó una fecha que no se pudo leer: «" + iso + "».");
                return null;
            }
            return f.ToLocalTime().DateTime;
        }

        /// <summary>Convierte la respuesta de error en algo que una persona pueda leer.</summary>
        private static ErrorGestivo Traducir(HttpStatusCode codigo, string cuerpo)
        {
            var detalle = "";
            try
            {
                var o = JsonConvert.DeserializeObject<Dictionary<string, object>>(cuerpo ?? "");
                if (o != null && o.ContainsKey("error") && o["error"] != null)
                    detalle = Convert.ToString(o["error"]);
            }
            catch
            {
                // No era JSON (una página de error de Vercel, por ejemplo).
            }
            if (string.IsNullOrEmpty(detalle))
                detalle = (cuerpo ?? "").Trim();
            if (detalle.Length > 500) detalle = detalle.Substring(0, 500) + "…";

            string pista;
            switch ((int)codigo)
            {
                case 401:
                    pista = "El secreto no coincide con el del servidor. Revise Configuración → Secreto.";
                    break;
                case 503:
                    pista = "El servidor no tiene configurada la variable BIOMETRICO_SECRET.";
                    break;
                case 404:
                    pista = "La URL no responde a este endpoint. ¿Es la URL correcta de Gestivo?";
                    break;
                case 413:
                    pista = "El lote es demasiado grande. Baje «Marcaciones por lote» en Configuración.";
                    break;
                case 400:
                    pista = "El servidor rechazó el lote completo; el detalle dice qué fila está mal.";
                    break;
                default:
                    pista = "";
                    break;
            }

            var mensaje = "HTTP " + (int)codigo + (string.IsNullOrEmpty(detalle) ? "" : ": " + detalle);
            if (!string.IsNullOrEmpty(pista)) mensaje += " — " + pista;
            return new ErrorGestivo(codigo, mensaje);
        }

        public void Dispose()
        {
            try { _http?.Dispose(); } catch { /* nada */ }
        }
    }
}
