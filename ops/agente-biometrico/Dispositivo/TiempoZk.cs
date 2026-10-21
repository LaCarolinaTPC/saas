using System;
using System.Globalization;

namespace Gestivo.AgenteBiometrico.Dispositivo
{
    /// <summary>
    /// La fecha y hora como las guarda el lector en el SDK pull: un entero
    /// empaquetado, NO segundos de Unix.
    ///
    /// El campo de la tabla `transaction` se llama `Time_second` y lleva
    ///
    ///     ((año - 2000) * 12 * 31 + (mes - 1) * 31 + (día - 1)) * 86400
    ///     + hora * 3600 + minuto * 60 + segundo
    ///
    /// Es decir, cuenta los meses como si todos tuvieran 31 días. Eso lo hace
    /// no monótono en los saltos de mes (del 31 de un mes de 30 al 1 del
    /// siguiente hay un hueco), pero sí creciente dentro del mismo mes y entre
    /// meses, que es lo que hace falta para ordenar y comparar.
    ///
    /// Medido contra una fila real del equipo el 2026-10-20:
    /// `861465103` → `2026-10-20 15:51:43`.
    ///
    /// PURO: se prueba sin equipo (ver Pruebas/AutoPruebas.cs).
    /// </summary>
    public static class TiempoZk
    {
        private const int SegundosPorDia = 86400;

        /// <summary>Meses de 31 días: así cuenta el equipo, no el calendario.</summary>
        private const int DiasPorMes = 31;
        private const int DiasPorAnio = 12 * DiasPorMes;

        /// <summary>De fecha a lo que entiende el equipo.</summary>
        public static int Empaquetar(DateTime f)
        {
            var dias = (f.Year - 2000) * DiasPorAnio + (f.Month - 1) * DiasPorMes + (f.Day - 1);
            return dias * SegundosPorDia + f.Hour * 3600 + f.Minute * 60 + f.Second;
        }

        /// <summary>
        /// De lo que entrega el equipo a fecha. Devuelve null si el valor no
        /// puede ser una fecha: el equipo puede traer basura en una fila
        /// corrupta, y dejarla pasar ensuciaría el histórico con un día
        /// inexistente.
        /// </summary>
        public static DateTime? Desempaquetar(int valor)
        {
            if (valor <= 0) return null;

            var dias = valor / SegundosPorDia;
            var resto = valor % SegundosPorDia;

            var anio = 2000 + dias / DiasPorAnio;
            var mes = dias % DiasPorAnio / DiasPorMes + 1;
            var dia = dias % DiasPorAnio % DiasPorMes + 1;

            // El empaquetado admite el 31 de febrero: el equipo cuenta meses de
            // 31 días. Una fila así está corrupta.
            if (anio < 2000 || anio > 2100) return null;
            if (mes < 1 || mes > 12) return null;
            if (dia < 1 || dia > DateTime.DaysInMonth(anio, mes)) return null;

            var hora = resto / 3600;
            var minuto = resto % 3600 / 60;
            var segundo = resto % 60;
            if (hora > 23) return null;

            return new DateTime(anio, mes, dia, hora, minuto, segundo);
        }

        /// <summary>El valor tal como va en un filtro del SDK pull.</summary>
        public static string ParaFiltro(DateTime f)
        {
            return Empaquetar(f).ToString(CultureInfo.InvariantCulture);
        }
    }
}
