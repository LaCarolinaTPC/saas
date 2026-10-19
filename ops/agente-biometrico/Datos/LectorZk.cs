using System;
using System.Collections.Generic;
using System.Data.OleDb;
using System.Globalization;
using Gestivo.AgenteBiometrico.Nucleo;

namespace Gestivo.AgenteBiometrico.Datos
{
    /// <summary>Una persona del equipo (USERINFO), como se manda a Gestivo.</summary>
    public class PersonaZk
    {
        public string pin { get; set; }
        public int? userid { get; set; }
        /// <summary>USERINFO.SSN: el «N.º de identificación» del equipo. El servidor lo normaliza.</summary>
        public string ssn { get; set; }
        public string nombre { get; set; }
        public string apellido { get; set; }
        public int? departamentoId { get; set; }
    }

    /// <summary>Una marcación (acc_monitor_log), como se manda a Gestivo.</summary>
    public class MarcacionZk
    {
        public long id { get; set; }
        public string pin { get; set; }
        /// <summary>Hora local del equipo, "yyyy-MM-ddTHH:mm:ss". El servidor le pone el offset de Bogotá.</summary>
        public string momento { get; set; }
        public int? deviceId { get; set; }
        public string deviceName { get; set; }
        public string deviceSn { get; set; }
        public int? verificado { get; set; }
        public string punto { get; set; }
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
                "SELECT USERID, Badgenumber, SSN, [Name], lastname, DEFAULTDEPTID FROM USERINFO";
            using (var cmd = new OleDbCommand(sql, _cn))
            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    var pin = Texto(r, 1);
                    // Sin pin no se puede atribuir nada: no vale la pena mandarla.
                    if (string.IsNullOrEmpty(pin)) continue;
                    salida.Add(new PersonaZk
                    {
                        userid = Entero(r, 0),
                        pin = pin,
                        ssn = Texto(r, 2),
                        nombre = Texto(r, 3),
                        apellido = Texto(r, 4),
                        departamentoId = Entero(r, 5),
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
                            deviceSn = Texto(r, 6),
                            punto = Texto(r, 7),
                        });
                    }
                }
            }
            return salida;
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
