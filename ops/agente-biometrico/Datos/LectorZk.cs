using System;
using System.Collections.Generic;
using System.Data.OleDb;
using System.Globalization;
using Gestivo.AgenteBiometrico.Dispositivo;
using Gestivo.AgenteBiometrico.Nucleo;
using Newtonsoft.Json;

namespace Gestivo.AgenteBiometrico.Datos
{
    /// <summary>Una persona del equipo (USERINFO), como se manda a Gestivo.</summary>
    public class PersonaZk
    {
        public string pin { get; set; }
        public int? userid { get; set; }

        /// <summary>
        /// El «N.º de identificación» que usa el operario en ZKAccess, que es
        /// **CardNo**. Confirmado con los datos: de las 790 personas, las dos
        /// únicas con algo ahí lo tienen con forma de cédula (badge 940 ->
        /// 72250850, justo la que el cruce le asignó por nombre), mientras que
        /// SSN estaba en su valor de fábrica "0" en las 790. En este equipo no
        /// se usan tarjetas RFID, así que CardNo está libre.
        ///
        /// Es lo que el servidor normaliza a cédula. Si está vacío cae a SSN,
        /// por si quedó algo escrito ahí de antes.
        /// </summary>
        public string identificacion { get; set; }

        /// <summary>Los dos campos en crudo, para poder diagnosticar sin entrar al equipo.</summary>
        public string cardNo { get; set; }
        public string ssn { get; set; }

        public string nombre { get; set; }
        public string apellido { get; set; }
        public int? departamentoId { get; set; }
    }

    /// <summary>
    /// Una marcación, como se manda a Gestivo. Vale para las dos vías.
    ///
    /// `id` es `acc_monitor_log.id` y SOLO existe en la vía Access: en el lector
    /// ese número no existe. Por eso es nulo y no se serializa cuando falta —
    /// es justamente lo que le dice al servidor que la huella viene del equipo,
    /// y que entonces la identidad es `(deviceSn, pin, momento)`.
    /// </summary>
    public class MarcacionZk
    {
        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public long? id { get; set; }

        public string pin { get; set; }
        /// <summary>Hora local del equipo, "yyyy-MM-ddTHH:mm:ss". El servidor le pone el offset de Bogotá.</summary>
        public string momento { get; set; }
        public int? deviceId { get; set; }
        public string deviceName { get; set; }
        public string deviceSn { get; set; }
        public int? verificado { get; set; }
        public string punto { get; set; }

        /// <summary>
        /// Hora del PC del agente al captar el evento, con offset. Solo la vía
        /// equipo: contra `momento` da la latencia real y el desfase del reloj
        /// del lector.
        /// </summary>
        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public string recibidoAt { get; set; }
    }

    /// <summary>
    /// Lectura de la base de ZKAccess 3.5. SOLO LEE.
    ///
    /// Las marcaciones salen de `acc_monitor_log` con `event_type = 14`
    /// (verificación válida), NO de `CHECKINOUT`. Comprobado: para el badge 1,
    /// CHECKINOUT da 41 registros y acc_monitor_log sin filtro 54, pero con
    /// event_type = 14 da los 14 reales. Es la misma consulta que usa
    /// scripts/biometrico-exportar-zk.ps1.
    /// </summary>
    public class LectorZk : IDisposable
    {
        private readonly OleDbConnection _cn;

        public LectorZk(string proveedor, string mdb, string clave)
        {
            _cn = new OleDbConnection(Proveedor.CadenaLectura(proveedor, mdb, clave));
            _cn.Open();
        }

        /// <summary>Espejo de USERINFO: 790 filas en el equipo actual.</summary>
        public List<PersonaZk> LeerPersonas()
        {
            var salida = new List<PersonaZk>();
            const string sql =
                "SELECT USERID, Badgenumber, CardNo, SSN, [Name], lastname, DEFAULTDEPTID FROM USERINFO";
            using (var cmd = new OleDbCommand(sql, _cn))
            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    var pin = Texto(r, 1);
                    // Sin pin no se puede atribuir nada: no vale la pena mandarla.
                    if (string.IsNullOrEmpty(pin)) continue;
                    var cardNo = Texto(r, 2);
                    var ssn = Texto(r, 3);
                    salida.Add(new PersonaZk
                    {
                        userid = Entero(r, 0),
                        pin = pin,
                        // CardNo manda; SSN solo como respaldo por si quedó
                        // algo escrito ahí antes de este cambio.
                        identificacion = EsIdentificacion(cardNo) ? cardNo : ssn,
                        cardNo = cardNo,
                        ssn = ssn,
                        nombre = Texto(r, 4),
                        apellido = Texto(r, 5),
                        departamentoId = Entero(r, 6),
                    });
                }
            }
            return salida;
        }

        /// <summary>
        /// Las primeras <paramref name="tope"/> marcaciones con id mayor que
        /// <paramref name="desdeId"/>, en orden. Jet no acepta parámetro en TOP,
        /// así que va interpolado: el valor viene de la configuración y se acota
        /// aquí a 1..2000, nunca de datos externos.
        /// </summary>
        public List<MarcacionZk> LeerMarcaciones(long desdeId, int tope)
        {
            if (tope < 1) tope = 1;
            if (tope > 2000) tope = 2000;

            var salida = new List<MarcacionZk>();
            var sql =
                "SELECT TOP " + tope.ToString(CultureInfo.InvariantCulture) + " " +
                "id, [time], pin, verified, device_id, device_name, device_sn, event_point_name " +
                "FROM acc_monitor_log WHERE event_type = 14 AND id > ? ORDER BY id";

            using (var cmd = new OleDbCommand(sql, _cn))
            {
                // El id sí va por parámetro.
                cmd.Parameters.Add("desdeId", OleDbType.BigInt).Value = desdeId;
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        var momento = Momento(r, 1);
                        var pin = Texto(r, 2);
                        // Una fila sin hora o sin pin no sirve y el servidor la
                        // rechazaría entera: se salta y se deja constancia.
                        if (momento == null || string.IsNullOrEmpty(pin))
                        {
                            Bitacora.Aviso("Marcación id " + Largo(r, 0) + " sin hora o sin pin: se omite.");
                            continue;
                        }
                        salida.Add(new MarcacionZk
                        {
                            id = Largo(r, 0),
                            momento = momento,
                            pin = pin,
                            verificado = Entero(r, 3),
                            deviceId = Entero(r, 4),
                            deviceName = Texto(r, 5),
                            // En mayúsculas, igual que la vía equipo y el
                            // servidor: es parte de la llave natural.
                            deviceSn = Texto(r, 6)?.ToUpperInvariant(),
                            punto = Texto(r, 7),
                        });
                    }
                }
            }
            return salida;
        }

        /// <summary>
        /// Los lectores que ZKAccess tiene registrados, de su tabla `Machines`.
        ///
        /// La lista de equipos sale de aquí y no de la configuración del agente:
        /// ZKAccess ya es su dueño, y duplicarla significaría que agregar un
        /// lector obliga a tocar dos sitios (y que las huellas de uno nuevo se
        /// pierdan hasta que alguien se acuerde).
        ///
        /// Se seleccionan las columnas por nombre y no con `SELECT *` para que
        /// la consulta falle de forma clara si ZKAccess cambia el esquema.
        /// `Machines` SÍ tiene `sn`, `CommPassword` y `DevSDKType` (tiene más de
        /// sesenta columnas; un listado truncado hizo creer lo contrario el
        /// 2026-10-20). Si `sn` viene vacía se deduce de `acc_monitor_log` y, en
        /// cuanto hay conexión, la reemplaza la que responde el propio equipo.
        ///
        /// La vía Access guarda esta lista en la configuración, para el día en
        /// que la base no se pueda abrir.
        /// </summary>
        public List<EquipoConfigurado> LeerEquipos()
        {
            var salida = new List<EquipoConfigurado>();
            // `Machines` tiene mas de sesenta columnas; se nombran solo estas
            // para que la consulta falle claro si ZKAccess cambia el esquema.
            const string sql =
                "SELECT ID, MachineAlias, ConnectType, IP, Port, MachineNumber, Enabled, " +
                "sn, CommPassword, FirmwareVersion, DevSDKType FROM Machines";

            using (var cmd = new OleDbCommand(sql, _cn))
            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    var id = Entero(r, 0);
                    if (!id.HasValue) continue;
                    salida.Add(new EquipoConfigurado
                    {
                        Id = id.Value,
                        Alias = Texto(r, 1),
                        TipoConexion = Entero(r, 2) ?? 0,
                        Ip = Texto(r, 3),
                        Puerto = Entero(r, 4) ?? 4370,
                        // 0 no es un número de equipo válido para el SDK.
                        Numero = Entero(r, 5) is int n && n > 0 ? n : 1,
                        Habilitado = Verdadero(r, 6),
                        Sn = Texto(r, 7),
                        ClaveComm = Texto(r, 8),
                        Firmware = Texto(r, 9),
                        // Sin dato, pull: es lo que usa esta instalacion.
                        TipoSdk = Entero(r, 10) ?? FabricaEquipo.SdkPull,
                    });
                }
            }

            // Solo para los que no traigan `sn` en la tabla: el historico dice
            // de que lector son por su `device_id`.
            if (salida.Exists(e => string.IsNullOrWhiteSpace(e.Sn)))
            {
                var series = LeerSeriesPorEquipo();
                foreach (var e in salida)
                {
                    if (!string.IsNullOrWhiteSpace(e.Sn)) continue;
                    string sn;
                    if (series.TryGetValue(e.Id, out sn)) e.Sn = sn;
                }
            }
            return salida;
        }

        /// <summary>
        /// Qué número de serie se vio en el histórico para cada `device_id`.
        ///
        /// Hace falta ANTES de conectarse: la marca de avance en Gestivo es por
        /// serie, así que sin ella no se puede preguntar «¿hasta dónde llegó
        /// este lector?» y habría que leer la memoria completa. Se toma el de la
        /// marcación más reciente, que es el vigente si alguien cambió el equipo
        /// conservando su registro.
        ///
        /// También rellena las marcaciones que llegan sin serie (ver
        /// <see cref="CompletarSeries"/>). Las claves van en mayúsculas.
        /// </summary>
        public Dictionary<int, string> LeerSeriesPorEquipo()
        {
            var salida = new Dictionary<int, string>();
            // Agrupado y con MAX(id): una sola pasada por el índice, sin traer
            // las 216 mil filas.
            const string sql =
                "SELECT device_id, device_sn, MAX(id) AS ultimo FROM acc_monitor_log " +
                "WHERE event_type = 14 AND device_sn IS NOT NULL AND device_sn <> '' " +
                "GROUP BY device_id, device_sn ORDER BY device_id, MAX(id)";

            try
            {
                using (var cmd = new OleDbCommand(sql, _cn))
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        var id = Entero(r, 0);
                        var sn = Texto(r, 1);
                        if (!id.HasValue || string.IsNullOrEmpty(sn)) continue;
                        // ORDER BY deja el de MAX(id) mayor al final: gana.
                        salida[id.Value] = sn.ToUpperInvariant();
                    }
                }
            }
            catch (Exception e)
            {
                // Sin serie el agente igual trabaja: se la pregunta al equipo al
                // conectar y, si no hay marca, lee la memoria completa.
                Bitacora.Error("No se pudieron deducir las series de los lectores del histórico", e);
            }
            return salida;
        }

        /// <summary>
        /// Pone la serie a las marcaciones que llegaron sin ella, según su
        /// `device_id`. PURO. Sin esto, una fila con SN vacío queda en Gestivo
        /// con otra llave natural que la misma huella traída por la vía equipo,
        /// y las dos aparecen. Devuelve cuántas completó.
        /// </summary>
        public static int CompletarSeries(List<MarcacionZk> marcaciones, IDictionary<int, string> series)
        {
            if (marcaciones == null || series == null || series.Count == 0) return 0;
            var completadas = 0;
            foreach (var m in marcaciones)
            {
                if (m == null || !string.IsNullOrWhiteSpace(m.deviceSn) || !m.deviceId.HasValue) continue;
                string sn;
                if (!series.TryGetValue(m.deviceId.Value, out sn) || string.IsNullOrWhiteSpace(sn)) continue;
                m.deviceSn = sn.Trim().ToUpperInvariant();
                completadas++;
            }
            return completadas;
        }

        /// <summary>El id más alto de una marcación válida en el equipo.</summary>
        public long MaximoId()
        {
            const string sql = "SELECT MAX(id) FROM acc_monitor_log WHERE event_type = 14";
            using (var cmd = new OleDbCommand(sql, _cn))
            {
                var v = cmd.ExecuteScalar();
                if (v == null || v == DBNull.Value) return 0;
                return Convert.ToInt64(v, CultureInfo.InvariantCulture);
            }
        }

        /// <summary>
        /// Cuántas marcaciones faltan por subir desde <paramref name="desdeId"/>.
        ///
        /// Se CUENTA, no se resta: `acc_monitor_log` mezcla todos los tipos de
        /// evento (apertura de puerta, alarmas…) y solo uno de cada cuatro es una
        /// verificación válida. Restar ids daba «faltan 31.891.320» cuando las
        /// marcaciones reales eran 215.698.
        /// </summary>
        public long ContarPendientes(long desdeId)
        {
            const string sql = "SELECT COUNT(*) FROM acc_monitor_log WHERE event_type = 14 AND id > ?";
            using (var cmd = new OleDbCommand(sql, _cn))
            {
                cmd.Parameters.Add("desdeId", OleDbType.BigInt).Value = desdeId;
                var v = cmd.ExecuteScalar();
                if (v == null || v == DBNull.Value) return 0;
                return Convert.ToInt64(v, CultureInfo.InvariantCulture);
            }
        }

        /// <summary>
        /// ¿Ese valor es una identificación de verdad? ZKAccess deja "0" como
        /// valor de fábrica, y el vacío tampoco cuenta. El servidor vuelve a
        /// validarlo; esto solo decide cuál de los dos campos se manda.
        /// </summary>
        private static bool EsIdentificacion(string valor)
        {
            if (string.IsNullOrWhiteSpace(valor)) return false;
            return valor.Trim().Trim('0').Length > 0;
        }

        // ── Lectura de celdas ────────────────────────────────────────────────

        private static string Texto(OleDbDataReader r, int i)
        {
            if (r.IsDBNull(i)) return null;
            var s = Convert.ToString(r.GetValue(i), CultureInfo.InvariantCulture);
            if (s == null) return null;
            s = s.Trim();
            return s.Length == 0 ? null : s;
        }

        private static int? Entero(OleDbDataReader r, int i)
        {
            if (r.IsDBNull(i)) return null;
            try { return Convert.ToInt32(r.GetValue(i), CultureInfo.InvariantCulture); }
            catch { return null; }
        }

        /// <summary>
        /// Un sí/no de Access. Jet entrega los booleanos como `bool`, pero los
        /// campos numéricos usados como bandera llegan como entero (0/-1), así
        /// que se aceptan los dos.
        /// </summary>
        private static bool Verdadero(OleDbDataReader r, int i)
        {
            if (r.IsDBNull(i)) return false;
            var v = r.GetValue(i);
            if (v is bool) return (bool)v;
            try { return Convert.ToInt64(v, CultureInfo.InvariantCulture) != 0; }
            catch { return false; }
        }

        private static long Largo(OleDbDataReader r, int i)
        {
            if (r.IsDBNull(i)) return 0;
            try { return Convert.ToInt64(r.GetValue(i), CultureInfo.InvariantCulture); }
            catch { return 0; }
        }

        /// <summary>
        /// Hora del equipo en formato fijo, SIN zona: el servidor le pone el
        /// offset de Bogotá. Con InvariantCulture a propósito, para que el
        /// formato no dependa de la configuración regional del PC.
        /// </summary>
        private static string Momento(OleDbDataReader r, int i)
        {
            if (r.IsDBNull(i)) return null;
            try
            {
                var f = Convert.ToDateTime(r.GetValue(i), CultureInfo.InvariantCulture);
                return f.ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture);
            }
            catch
            {
                return null;
            }
        }

        public void Dispose()
        {
            try { _cn?.Dispose(); } catch { /* cerrar no debe fallar el ciclo */ }
        }
    }
}
