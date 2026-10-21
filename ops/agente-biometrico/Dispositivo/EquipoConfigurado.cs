using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net;
using Newtonsoft.Json;

namespace Gestivo.AgenteBiometrico.Dispositivo
{
    /// <summary>
    /// Un lector, tal como lo tiene registrado ZKAccess en su tabla `Machines`.
    ///
    /// La fuente de la lista es `Machines`: ZKAccess ya es su dueño, y
    /// duplicarla a mano significaría que agregar un lector obliga a tocar dos
    /// sitios. El agente la lee de ahí y se adapta, y además la guarda en
    /// config.json (`Configuracion.Equipos`) para cuando la base no se pueda
    /// abrir o el agente corra en otro PC. Solo ahí, sin `Machines`, se escribe
    /// un lector a mano; esos llevan `Id` negativo (ver <see cref="EsManual"/>).
    ///
    /// `Id` es el mismo `device_id` que aparece en `acc_monitor_log`, así que una
    /// huella leída por el SDK queda etiquetada igual que si la hubiera traído
    /// ZKAccess. El `Sn` es lo que de verdad identifica al equipo en Gestivo (la
    /// llave natural es `(device_sn, pin, momento)`): el `Id` cambia cada vez
    /// que alguien vuelve a registrar el mismo lector, y eso ya pasó cuatro
    /// veces con este MA500.
    ///
    /// Sobre el `Sn`: `Machines` SI tiene columna `sn` (y `CommPassword`, y
    /// `FirmwareVersion`). La tabla tiene mas de sesenta columnas; un listado
    /// truncado hizo creer lo contrario. De todas formas el SN se confirma
    /// contra `GetSerialNumber` al conectar, porque el del equipo es el bueno:
    /// ZKAccess puede tener uno viejo. Y si la columna viniera vacia, se deduce
    /// del `device_id` en `acc_monitor_log`, que hace falta ANTES de conectar
    /// para preguntarle al servidor hasta donde llego este lector.
    /// </summary>
    public class EquipoConfigurado
    {
        public int Id { get; set; }
        public string Alias { get; set; }
        public string Sn { get; set; }
        public string Ip { get; set; }
        public int Puerto { get; set; }
        public bool Habilitado { get; set; }

        /// <summary>1 = TCP/IP. Es el único que el SDK sabe abrir por red.</summary>
        public int TipoConexion { get; set; }

        /// <summary>
        /// `Machines.MachineNumber`: el «número de equipo» que pide cada llamada
        /// del SDK. Se lee de ZKAccess en vez de configurarlo a mano, porque es
        /// el mismo valor con el que ZKAccess habla con el lector.
        /// </summary>
        public int Numero { get; set; } = 1;

        /// <summary>
        /// `Machines.CommPassword`: la clave de comunicacion que ZKAccess tiene
        /// puesta para este lector. Null o vacia = el equipo no pide ninguna,
        /// que es el caso de esta instalacion.
        ///
        /// Se lee de ZKAccess en vez de configurarla en el agente, por lo mismo
        /// que la IP: si manana alguien le pone clave al equipo desde ZKAccess,
        /// el agente la toma sola en el siguiente ciclo.
        ///
        /// No se guarda en config.json: ese archivo se copia entre PCs.
        /// </summary>
        [JsonIgnore]
        public string ClaveComm { get; set; }

        /// <summary>Lo que ZKAccess guardo del firmware. Informativo.</summary>
        public string Firmware { get; set; }

        /// <summary>
        /// `Machines.DevSDKType`: con que SDK le habla ZKAccess. 1 = pull,
        /// 2 = standalone (el clasico, zkemkeeper). Decide la implementacion;
        /// ver <see cref="FabricaEquipo"/>.
        /// </summary>
        public int TipoSdk { get; set; } = FabricaEquipo.SdkPull;

        /// <summary>La clave como la quiere el SDK, o null si no hay.</summary>
        [JsonIgnore]
        public int? ClaveCommNumerica
        {
            get
            {
                if (string.IsNullOrWhiteSpace(ClaveComm)) return null;
                int v;
                if (!int.TryParse(ClaveComm.Trim(), System.Globalization.NumberStyles.Integer,
                        CultureInfo.InvariantCulture, out v)) return null;
                return v == 0 ? (int?)null : v;
            }
        }

        /// <summary>
        /// Lo que decide si hay que reconectar. El alias y el SN pueden cambiar
        /// sin que la conexión se vea afectada; la IP y el puerto no.
        /// </summary>
        [JsonIgnore]
        public string Enlace
        {
            get { return (Ip ?? "") + ":" + Puerto.ToString(CultureInfo.InvariantCulture); }
        }

        [JsonIgnore]
        public string Nombre
        {
            get
            {
                if (!string.IsNullOrWhiteSpace(Alias)) return Alias.Trim();
                return EsManual ? "lector " + (Ip ?? "").Trim() : "equipo " + Id;
            }
        }

        /// <summary>
        /// Escrito a mano en la ventana, no leído de `Machines`. Su `Id` es
        /// negativo para no chocar con los de ZKAccess y para que no viaje a
        /// Gestivo como `device_id`: un número inventado ahí parecería un lector
        /// real de ZKAccess.
        /// </summary>
        [JsonIgnore]
        public bool EsManual
        {
            get { return Id < 0; }
        }

        /// <summary>
        /// Una copia suelta. Hace falta porque la vía equipo corrige el `Sn` del
        /// objeto que recibe con el que responde el lector, y eso no debe tocar
        /// la lista guardada en la configuración.
        /// </summary>
        public EquipoConfigurado Copia()
        {
            return (EquipoConfigurado)MemberwiseClone();
        }

        /// <summary>
        /// ¿Se puede intentar hablar con él? Un equipo deshabilitado en ZKAccess
        /// o conectado por USB no es un error: simplemente no es para esta vía.
        /// </summary>
        [JsonIgnore]
        public bool EsUsable
        {
            get
            {
                if (!Habilitado) return false;
                if (TipoConexion != 1) return false;
                if (Puerto <= 0 || Puerto > 65535) return false;
                IPAddress _;
                return !string.IsNullOrWhiteSpace(Ip) && IPAddress.TryParse(Ip.Trim(), out _);
            }
        }

        public override string ToString()
        {
            return Nombre + " · " + Enlace + (string.IsNullOrWhiteSpace(Sn) ? "" : " · SN " + Sn);
        }
    }

    /// <summary>Qué cambió en `Machines` entre dos lecturas.</summary>
    public class CambiosEquipos
    {
        public List<EquipoConfigurado> Altas { get; } = new List<EquipoConfigurado>();
        public List<EquipoConfigurado> Bajas { get; } = new List<EquipoConfigurado>();

        /// <summary>Mismo `Id`, pero cambió algo que obliga a reconectar (IP o puerto).</summary>
        public List<EquipoConfigurado> Reconectar { get; } = new List<EquipoConfigurado>();

        /// <summary>Mismo `Id` y mismo enlace: solo cambiaron datos (alias, SN…).</summary>
        public List<EquipoConfigurado> Retocar { get; } = new List<EquipoConfigurado>();

        public bool HayAlgo
        {
            get { return Altas.Count > 0 || Bajas.Count > 0 || Reconectar.Count > 0 || Retocar.Count > 0; }
        }

        /// <summary>Una línea para la bitácora. Vacía si no cambió nada.</summary>
        public string Resumen()
        {
            var partes = new List<string>();
            if (Altas.Count > 0) partes.Add("nuevos: " + string.Join(", ", Altas.Select(e => e.ToString())));
            if (Bajas.Count > 0) partes.Add("retirados: " + string.Join(", ", Bajas.Select(e => e.Nombre)));
            if (Reconectar.Count > 0)
                partes.Add("cambiaron de dirección: " + string.Join(", ", Reconectar.Select(e => e.Nombre + " → " + e.Enlace)));
            if (Retocar.Count > 0) partes.Add("retocados: " + string.Join(", ", Retocar.Select(e => e.Nombre)));
            return string.Join(" · ", partes);
        }
    }

    /// <summary>
    /// Qué hacer con la lista de `Machines` que acaba de leerse. PURO: no toca
    /// la base ni la red, así que se prueba solo (ver Pruebas/AutoPruebas.cs).
    /// </summary>
    public static class ListaEquipos
    {
        /// <summary>
        /// Los que esta vía puede usar, sin repetidos y en orden estable.
        ///
        /// Por `Id`, no por SN: el mismo lector registrado dos veces son dos
        /// filas con el mismo SN, y conectarse dos veces al mismo equipo lo
        /// pondría a rechazar una de las dos sesiones. Gana el de `Id` mayor,
        /// que es el registro vigente (el que ZKAccess está usando).
        /// </summary>
        public static List<EquipoConfigurado> Usables(IEnumerable<EquipoConfigurado> filas)
        {
            if (filas == null) return new List<EquipoConfigurado>();

            var porSn = new Dictionary<string, EquipoConfigurado>(StringComparer.OrdinalIgnoreCase);
            var sinSn = new List<EquipoConfigurado>();

            foreach (var e in filas.Where(f => f != null && f.EsUsable).OrderBy(f => f.Id))
            {
                var sn = (e.Sn ?? "").Trim();
                if (sn.Length == 0)
                {
                    sinSn.Add(e);
                    continue;
                }
                // OrderBy ascendente + asignación directa deja el de Id mayor.
                porSn[sn] = e;
            }

            return porSn.Values.Concat(sinSn).OrderBy(e => e.Id).ToList();
        }

        /// <summary>
        /// Diferencias entre la lista que el agente está usando y la que acaba
        /// de leer. Las dos deben venir ya pasadas por <see cref="Usables"/>.
        /// </summary>
        public static CambiosEquipos Diferencias(
            IEnumerable<EquipoConfigurado> antes,
            IEnumerable<EquipoConfigurado> ahora)
        {
            var cambios = new CambiosEquipos();
            var viejos = (antes ?? Enumerable.Empty<EquipoConfigurado>())
                .Where(e => e != null).ToDictionary(e => e.Id, e => e);
            var nuevos = (ahora ?? Enumerable.Empty<EquipoConfigurado>())
                .Where(e => e != null).ToDictionary(e => e.Id, e => e);

            foreach (var n in nuevos.Values.OrderBy(e => e.Id))
            {
                EquipoConfigurado v;
                if (!viejos.TryGetValue(n.Id, out v))
                {
                    cambios.Altas.Add(n);
                }
                else if (!string.Equals(v.Enlace, n.Enlace, StringComparison.OrdinalIgnoreCase))
                {
                    cambios.Reconectar.Add(n);
                }
                else if (!string.Equals(v.Sn ?? "", n.Sn ?? "", StringComparison.OrdinalIgnoreCase) ||
                         !string.Equals(v.Alias ?? "", n.Alias ?? "", StringComparison.Ordinal))
                {
                    cambios.Retocar.Add(n);
                }
            }

            foreach (var v in viejos.Values.OrderBy(e => e.Id))
                if (!nuevos.ContainsKey(v.Id)) cambios.Bajas.Add(v);

            return cambios;
        }
    }
}
