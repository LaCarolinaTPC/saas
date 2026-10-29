using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Gestivo.AgenteBiometrico.Dispositivo;
using Newtonsoft.Json;

namespace Gestivo.AgenteBiometrico.Nucleo
{
    /// <summary>
    /// Lo que el usuario puede cambiar desde la ventana de Configuración.
    /// Vive en %LOCALAPPDATA%\Gestivo\AgenteBiometrico\config.json.
    ///
    /// La URL del servidor va a cambiar cuando se mude Gestivo, así que todo es
    /// editable sin reinstalar ni recompilar.
    /// </summary>
    public class Configuracion
    {
        /// <summary>URL base de Gestivo, sin barra final. Ej. https://gestivo.lacarolina.co</summary>
        public string Url { get; set; } = "";

        /// <summary>
        /// Secreto cifrado con DPAPI (ámbito usuario). Nunca se guarda en claro
        /// ni se muestra en la ventana: solo «configurado / no configurado».
        /// </summary>
        public string SecretoCifrado { get; set; } = "";

        /// <summary>Ruta del Access.mdb de ZKAccess.</summary>
        public string Mdb { get; set; } = "";

        /// <summary>
        /// Contraseña de la base Access, si la tiene. ZKAccess usa
        /// «Jet OLEDB:Database Password» en su propia cadena de conexión, así que
        /// la base viva puede exigirla. Cifrada igual que el secreto.
        /// </summary>
        public string ClaveMdbCifrada { get; set; } = "";

        /// <summary>Proveedor OLE DB fijo, o vacío para autodetectar.</summary>
        public string Proveedor { get; set; } = "";

        /// <summary>Minutos entre ciclos. 1 a 120.</summary>
        public int IntervaloMin { get; set; } = 15;

        /// <summary>Marcaciones por lote. 1 a 2000 (el tope del servidor).</summary>
        public int TamanoLote { get; set; } = 2000;

        /// <summary>
        /// Lotes por ciclo. En régimen 10 sobra (llegan ~120 marcaciones al día);
        /// para la carga histórica se sube a 500 y se usa «Sincronizar ahora».
        /// </summary>
        public int MaxLotes { get; set; } = 10;

        /// <summary>Nombre con que el agente se identifica ante Gestivo.</summary>
        public string NombreAgente { get; set; } = "";

        /// <summary>Mandar el espejo de USERINFO en cada ciclo.</summary>
        public bool EnviarPersonas { get; set; } = true;

        // ── Vías ─────────────────────────────────────────────────────────────

        /// <summary>
        /// Leer `acc_monitor_log` del Access.mdb. En false este PC no necesita
        /// la base: es el caso del agente instalado en otro PC de la red, que
        /// solo lee el lector. Un config.json de antes no trae la propiedad y
        /// queda en true, así que actualizar no cambia nada.
        /// </summary>
        public bool ViaAccessHabilitada { get; set; } = true;

        // ── Vía equipo: leer las huellas directo del lector ──────────────────

        /// <summary>
        /// Una sola casilla para toda la vía equipo. En false el agente se
        /// comporta exactamente como antes (solo lee el Access.mdb), así que
        /// desplegar esta versión no cambia nada hasta que alguien la marque, y
        /// volver atrás es desmarcarla.
        /// </summary>
        public bool EquipoHabilitado { get; set; } = false;

        /// <summary>
        /// «Comm Key» del lector, si tiene una puesta. Cifrada con DPAPI igual
        /// que el secreto. Es el RESPALDO de `Machines.CommPassword`, que manda
        /// cuando hay base; en un PC sin ella es la única fuente, porque la clave
        /// no viaja en <see cref="Equipos"/>. Aplica a todos los lectores.
        /// </summary>
        public string EquipoClaveCommCifrada { get; set; } = "";

        /// <summary>
        /// Segundos entre envíos de lo acumulado. El usuario aceptó un minuto de
        /// latencia; bajarlo multiplica las llamadas sin ganar nada visible.
        /// </summary>
        public int TiempoRealFlushSeg { get; set; } = 60;

        /// <summary>
        /// Minutos que se restan a la marca del servidor al reconectar. Cubre el
        /// desfase de relojes y lo que quedó en vuelo; repetir es inofensivo
        /// porque la llave natural lo colapsa.
        /// </summary>
        public int EquipoMargenMin { get; set; } = 10;

        /// <summary>
        /// Procesos a los que se les cede la conexión del lector. ZKAccess 3.5
        /// es `Access.exe` (el de Office es `MSACCESS.exe`, así que no se
        /// confunden). Solo se ven los procesos de ESTE PC: si el agente corre
        /// en otro, no hay nada que detectar (el equipo admite varias sesiones
        /// pull, medido el 2026-10-20, así que no estorba).
        /// </summary>
        public string EquipoProcesosCeder { get; set; } = "Access";

        /// <summary>
        /// Los lectores, guardados. En el PC de ZKAccess los escribe la vía
        /// Access en cada ciclo, copiados de `Machines`, y sirven de respaldo si
        /// la base no se puede abrir. En otro PC son la ÚNICA fuente: se importan
        /// del config.json del PC de ZKAccess o se escriben a mano.
        ///
        /// Sin `ClaveComm` ([JsonIgnore] en la clase): este archivo se copia
        /// entre PCs, y la clave, si hiciera falta, va cifrada en
        /// <see cref="EquipoClaveCommCifrada"/>.
        /// </summary>
        public List<EquipoConfigurado> Equipos { get; set; } = new List<EquipoConfigurado>();

        /// <summary>Cuándo se escribió <see cref="Equipos"/>. Solo para decirlo en pantalla.</summary>
        public DateTime? EquiposActualizadosAt { get; set; }

        /// <summary>«ZKAccess» (copiados de `Machines`) o «manual». Solo para decirlo en pantalla.</summary>
        public string EquiposOrigen { get; set; } = "";

        public const string OrigenZkAccess = "ZKAccess";
        public const string OrigenManual = "manual";

        // ── Rutas ────────────────────────────────────────────────────────────

        /// <summary>
        /// Carpeta de datos. Por usuario, igual que el autoinicio: si mañana la
        /// tarea la corre otra cuenta, su configuración es la suya (y el secreto
        /// cifrado con DPAPI no sería legible de todas formas).
        /// </summary>
        public static string CarpetaDatos
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Gestivo", "AgenteBiometrico");
            }
        }

        public static string RutaConfig
        {
            get { return Path.Combine(CarpetaDatos, "config.json"); }
        }

        public static string CarpetaLogs
        {
            get { return Path.Combine(CarpetaDatos, "logs"); }
        }

        // ── Carga y guardado ─────────────────────────────────────────────────

        private static string RutaRespaldo
        {
            get { return RutaConfig + ".bak"; }
        }

        /// <summary>
        /// La configuración guardada. Si `config.json` falta o quedó dañado —un
        /// corte de luz a mitad de un guardado lo deja en 0 bytes— se usa el
        /// respaldo de la versión anterior, y solo sin él se empieza de cero.
        /// Cualquiera de esos casos queda en la bitácora: antes un archivo vacío
        /// dejaba el agente sin configurar y sin rastro.
        /// </summary>
        public static Configuracion Cargar()
        {
            var c = LeerDe(RutaConfig, "config.json");
            if (c != null) return c.ConValoresSanos();
            if (File.Exists(RutaConfig) || File.Exists(RutaRespaldo))
            {
                c = LeerDe(RutaRespaldo, "el respaldo config.json.bak");
                if (c != null)
                {
                    Bitacora.Aviso("config.json estaba vacío o dañado: se usa el respaldo de la versión anterior.");
                    return c.ConValoresSanos();
                }
                Bitacora.Error("No se pudo leer config.json ni su respaldo: el agente queda sin configurar.");
            }
            return new Configuracion().ConValoresSanos();
        }

        private static Configuracion LeerDe(string ruta, string nombre)
        {
            try
            {
                if (!File.Exists(ruta)) return null;
                var json = File.ReadAllText(ruta);
                if (string.IsNullOrWhiteSpace(json))
                {
                    Bitacora.Aviso(nombre + " está vacío.");
                    return null;
                }
                return JsonConvert.DeserializeObject<Configuracion>(json);
            }
            catch (Exception e)
            {
                Bitacora.Error("No se pudo leer " + nombre, e);
                return null;
            }
        }

        /// <summary>
        /// Guardado atómico: se escribe a un temporal y se reemplaza de un
        /// golpe, dejando la versión anterior como `.bak`. Un apagón a mitad de
        /// la escritura deja intacto el archivo bueno.
        /// </summary>
        public void Guardar()
        {
            Directory.CreateDirectory(CarpetaDatos);
            var temporal = RutaConfig + ".tmp";
            File.WriteAllText(temporal, JsonConvert.SerializeObject(this, Formatting.Indented));
            if (File.Exists(RutaConfig))
                File.Replace(temporal, RutaConfig, RutaRespaldo, true);
            else
                File.Move(temporal, RutaConfig);
        }

        /// <summary>Topes y valores por defecto, para que un config editado a mano no rompa nada.</summary>
        public Configuracion ConValoresSanos()
        {
            Url = (Url ?? "").Trim().TrimEnd('/');
            Mdb = (Mdb ?? "").Trim();
            Proveedor = (Proveedor ?? "").Trim();
            NombreAgente = string.IsNullOrWhiteSpace(NombreAgente) ? Environment.MachineName : NombreAgente.Trim();
            if (IntervaloMin < 1) IntervaloMin = 1;
            if (IntervaloMin > 120) IntervaloMin = 120;
            if (TamanoLote < 1) TamanoLote = 1;
            if (TamanoLote > 2000) TamanoLote = 2000;
            if (MaxLotes < 1) MaxLotes = 1;
            if (MaxLotes > 500) MaxLotes = 500;

            EquipoProcesosCeder = (EquipoProcesosCeder ?? "").Trim();
            // Menos de 5 s sería una llamada HTTP por huella sin ganar nada
            // visible; más de 10 min dejaría de ser «tiempo real».
            if (TiempoRealFlushSeg < 5) TiempoRealFlushSeg = 5;
            if (TiempoRealFlushSeg > 600) TiempoRealFlushSeg = 600;
            // El margen cubre el desfase de relojes: con 0 se perderían huellas
            // justo en el borde, y pasado un día la relectura sería enorme.
            if (EquipoMargenMin < 1) EquipoMargenMin = 1;
            if (EquipoMargenMin > 1440) EquipoMargenMin = 1440;

            Equipos = (Equipos ?? new List<EquipoConfigurado>()).Where(e => e != null).ToList();
            foreach (var e in Equipos)
            {
                e.Alias = e.Alias == null ? null : e.Alias.Trim();
                e.Sn = e.Sn == null ? null : e.Sn.Trim();
                e.Ip = e.Ip == null ? null : e.Ip.Trim();
            }
            EquiposOrigen = (EquiposOrigen ?? "").Trim();
            return this;
        }

        /// <summary>Hay al menos un lector guardado con el que se pueda hablar.</summary>
        [JsonIgnore]
        public bool HayLectoresGuardados
        {
            get { return ListaEquipos.Usables(Equipos).Count > 0; }
        }

        /// <summary>La vía Access está encendida y sabe dónde está la base.</summary>
        [JsonIgnore]
        public bool ViaAccessLista
        {
            get { return ViaAccessHabilitada && !string.IsNullOrWhiteSpace(Mdb); }
        }

        /// <summary>
        /// La vía equipo tiene de dónde sacar los lectores: con la vía Access
        /// encendida la lista llega sola en el primer ciclo; sin ella tiene que
        /// estar guardada.
        /// </summary>
        [JsonIgnore]
        public bool ViaEquipoLista
        {
            get { return EquipoHabilitado && (ViaAccessHabilitada || HayLectoresGuardados); }
        }

        /// <summary>
        /// Lista para trabajar: URL, secreto, al menos una vía, y lo que cada vía
        /// encendida necesita (la base para Access, lectores para equipo).
        /// </summary>
        [JsonIgnore]
        public bool EstaCompleta
        {
            get { return QueFalta().Length == 0; }
        }

        /// <summary>Qué falta por llenar, para decirlo en la ventana de Estado.</summary>
        public string QueFalta()
        {
            var falta = new List<string>();
            if (string.IsNullOrWhiteSpace(Url)) falta.Add("la URL de Gestivo");
            if (string.IsNullOrWhiteSpace(SecretoCifrado)) falta.Add("el secreto");
            if (!ViaAccessHabilitada && !EquipoHabilitado)
                falta.Add("al menos una vía (Access o equipo)");
            if (ViaAccessHabilitada && string.IsNullOrWhiteSpace(Mdb))
                falta.Add("la ruta del Access.mdb");
            if (EquipoHabilitado && !ViaAccessHabilitada && !HayLectoresGuardados)
                falta.Add("al menos un lector guardado para la vía equipo");
            return string.Join(", ", falta);
        }

        /// <summary>
        /// Guarda la lista recién leída de `Machines`. Devuelve true si cambió
        /// algo y hay que escribir el config.json: comparar evita reescribir el
        /// archivo en cada ciclo para nada.
        /// </summary>
        public bool ActualizarEquiposDesdeZkAccess(List<EquipoConfigurado> leidos)
        {
            if (leidos == null) return false;
            var nuevos = leidos.Where(e => e != null).Select(e => e.Copia()).ToList();
            if (EquiposOrigen == OrigenZkAccess && HuellaDeLista(Equipos) == HuellaDeLista(nuevos))
                return false;

            Equipos = nuevos;
            EquiposActualizadosAt = DateTime.Now;
            EquiposOrigen = OrigenZkAccess;
            return true;
        }

        /// <summary>Todo lo que se guarda de la lista, para compararla entera.</summary>
        private static string HuellaDeLista(IEnumerable<EquipoConfigurado> lista)
        {
            return JsonConvert.SerializeObject((lista ?? Enumerable.Empty<EquipoConfigurado>())
                .Where(e => e != null).OrderBy(e => e.Id).ToList());
        }

        // Descifrados: [JsonIgnore] para que Guardar() nunca los escriba en claro.

        [JsonIgnore]
        public string Secreto
        {
            get { return Secretos.Descifrar(SecretoCifrado); }
        }

        [JsonIgnore]
        public string ClaveMdb
        {
            get { return Secretos.Descifrar(ClaveMdbCifrada); }
        }

        /// <summary>
        /// La clave de comunicación del lector, ya descifrada. `null` cuando no
        /// hay ninguna puesta, que es el caso normal. Si lo guardado no es un
        /// número se devuelve `null` y queda constancia: mandar basura al equipo
        /// solo haría que rechazara la conexión sin decir por qué.
        /// </summary>
        [JsonIgnore]
        public int? EquipoClaveComm
        {
            get
            {
                var texto = Secretos.Descifrar(EquipoClaveCommCifrada);
                if (string.IsNullOrWhiteSpace(texto)) return null;
                int valor;
                if (!int.TryParse(texto.Trim(), System.Globalization.NumberStyles.Integer,
                        System.Globalization.CultureInfo.InvariantCulture, out valor))
                {
                    Bitacora.Aviso("La clave de comunicación del lector no es un número: se ignora.");
                    return null;
                }
                return valor == 0 ? (int?)null : valor;
            }
        }
    }
}
