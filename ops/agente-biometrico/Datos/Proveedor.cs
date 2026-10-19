using System;
using System.Collections.Generic;
using System.Data.OleDb;
using System.Linq;
using Gestivo.AgenteBiometrico.Nucleo;

namespace Gestivo.AgenteBiometrico.Datos
{
    /// <summary>
    /// Elección del proveedor OLE DB para abrir el .mdb.
    ///
    /// Misma regla y mismo orden que `Resolver-Proveedor` de
    /// scripts/biometrico-exportar-zk.ps1 y biometrico-aplicar-ssn-zk.ps1: ACE 16,
    /// ACE 12 y por último Jet 4.0, que es el que instala ZKAccess 3.5 y el único
    /// que seguro está en ese PC. Como la app se compila a x86, el Jet de 32 bits
    /// se ve sin trucos.
    /// </summary>
    public static class Proveedor
    {
        public static readonly string[] Preferidos =
        {
            "Microsoft.ACE.OLEDB.16.0",
            "Microsoft.ACE.OLEDB.12.0",
            "Microsoft.Jet.OLEDB.4.0",
        };

        /// <summary>Proveedores instalados en este equipo (y en estos bits).</summary>
        public static List<string> Disponibles()
        {
            try
            {
                var tabla = OleDbEnumerator.GetRootEnumerator();
                var nombres = new List<string>();
                while (tabla.Read())
                {
                    var n = tabla["SOURCES_NAME"] as string;
                    if (!string.IsNullOrEmpty(n)) nombres.Add(n);
                }
                return nombres.Distinct().OrderBy(n => n, StringComparer.OrdinalIgnoreCase).ToList();
            }
            catch (Exception e)
            {
                Bitacora.Error("No se pudieron enumerar los proveedores OLE DB", e);
                return new List<string>();
            }
        }

        /// <summary>
        /// El proveedor a usar. Lanza con un mensaje accionable si no hay ninguno
        /// (pasa cuando se corre en 64 bits y solo está el Jet de 32).
        /// </summary>
        public static string Resolver(string preferido)
        {
            if (!string.IsNullOrWhiteSpace(preferido)) return preferido.Trim();

            var hay = Disponibles();
            foreach (var p in Preferidos)
                if (hay.Contains(p, StringComparer.OrdinalIgnoreCase)) return p;

            throw new InvalidOperationException(
                "No hay proveedor de Access instalado para aplicaciones de 32 bits. " +
                "Instale el «Microsoft Access Database Engine» de 32 bits, o elija el " +
                "proveedor a mano en Configuración. Encontrados: " +
                (hay.Count == 0 ? "ninguno" : string.Join(", ", hay)));
        }

        /// <summary>
        /// Cadena de conexión de SOLO LECTURA: así se puede leer con ZKAccess
        /// abierto y nunca se modifica la base del equipo.
        /// </summary>
        public static string CadenaLectura(string proveedor, string mdb, string clave)
        {
            var cadena = "Provider=" + proveedor + ";Data Source=" + mdb +
                         ";Mode=Read;Persist Security Info=False";
            // ZKAccess usa «Jet OLEDB:Database Password» en su propio config, así
            // que la base viva puede tener contraseña.
            if (!string.IsNullOrEmpty(clave))
                cadena += ";Jet OLEDB:Database Password=" + clave;
            return cadena;
        }
    }
}
