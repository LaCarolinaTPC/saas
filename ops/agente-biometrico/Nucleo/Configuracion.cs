using System;
using System.IO;
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
        /// que el secreto. No está en `Machines`, así que es lo único de los
        /// equipos que sí se configura aquí; aplica a todos (si algún día hay
        /// claves distintas por lector, se vuelve una lista por SN).
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
        /// confunden). Vacío = no ceder a nadie, que es lo correcto si ZKAccess
        /// se usara desde otro PC.
        /// </summary>
        public string EquipoProcesosCeder { get; set; } = "Access";

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

        public static Configuracion Cargar()
        {
            try
            {
                if (File.Exists(RutaConfig))
                {
                    var json = File.ReadAllText(RutaConfig);
                    var c = JsonConvert.DeserializeObject<Configuracion>(json);
                    if (c != null) return c.ConValoresSanos();
                }
            }
            catch (Exception e)
            {
                // Un config corrupto no debe impedir abrir la ventana: se
                // empieza de cero y el usuario vuelve a llenarla.
                Bitacora.Error("No se pudo leer la configuración, se usa una vacía", e);
            }
            return new Configuracion().ConValoresSanos();
        }

        public void Guardar()
        {
            Directory.CreateDirectory(CarpetaDatos);
            File.WriteAllText(RutaConfig, JsonConvert.SerializeObject(this, Formatting.Indented));
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
            return this;
        }

        /// <summary>Lista para trabajar: tiene URL, secreto y base.</summary>
        public bool EstaCompleta
        {
            get
            {
                return !string.IsNullOrWhiteSpace(Url)
                    && !string.IsNullOrWhiteSpace(SecretoCifrado)
                    && !string.IsNullOrWhiteSpace(Mdb);
            }
        }

        /// <summary>Qué falta por llenar, para decirlo en la ventana de Estado.</summary>
        public string QueFalta()
        {
            var falta = "";
            if (string.IsNullOrWhiteSpace(Url)) falta += "la URL de Gestivo, ";
            if (string.IsNullOrWhiteSpace(SecretoCifrado)) falta += "el secreto, ";
            if (string.IsNullOrWhiteSpace(Mdb)) falta += "la ruta del Access.mdb, ";
            return falta.Length > 0 ? falta.Substring(0, falta.Length - 2) : "";
        }

        public string Secreto
        {
            get { return Secretos.Descifrar(SecretoCifrado); }
        }

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
