using System;
using System.Collections.Generic;
using System.Globalization;
using Gestivo.AgenteBiometrico.Datos;

namespace Gestivo.AgenteBiometrico.Dispositivo
{
    /// <summary>
    /// De lo que entrega el SDK a lo que entiende Gestivo. PURO: ni COM, ni red,
    /// ni base; se prueba sin equipo (ver Pruebas/AutoPruebas.cs).
    ///
    /// Aquí está concentrado a propósito todo lo que es HIPÓTESIS hasta que se
    /// mida en sitio, para que ajustarlo sea cambiar una tabla de este archivo y
    /// no ir a buscarlo entre el código de hilos y COM.
    /// </summary>
    public static class MapeoEquipo
    {
        /// <summary>
        /// `acc_monitor_log.verified` cuando la verificación fue por huella: es
        /// el valor con el que se cargaron las 158.936 huellas históricas, así
        /// que la pantalla de Marcaciones y el histórico cuentan con él.
        /// </summary>
        public const int VerificadoHuella = 6;

        /// <summary>
        /// `VerifyMethod` del SDK STANDALONE -> `verified` de ZKAccess. Con el
        /// pull no aplica: su `Verified` ya es el de ZKAccess (ver
        /// <see cref="EventoEquipo.MetodoYaEsDeZkAccess"/>), y traducirlo
        /// convertiría un 1 legítimo en huella.
        ///
        /// HIPÓTESIS (incógnita (d) del plan): se asume que 1 = huella. Lo que
        /// no esté en la tabla pasa en crudo, para no inventar: si en sitio
        /// resulta que la huella llega con otro número, se ve en el diagnóstico
        /// (paso 8 imprime el `VerifyMethod` de un dedo real) y se corrige aquí.
        ///
        /// Da igual para la identidad de la huella —la llave es
        /// `(device_sn, pin, momento)`— y además cuando ZKAccess descargue ese
        /// mismo tramo, la ingesta sobrescribe `verificado` con el suyo.
        /// </summary>
        public static readonly IReadOnlyDictionary<int, int> Traduccion =
            new Dictionary<int, int> { { 1, VerificadoHuella } };

        public static int? Verificado(int metodoDelSdk)
        {
            int traducido;
            return Traduccion.TryGetValue(metodoDelSdk, out traducido) ? traducido : metodoDelSdk;
        }

        /// <summary>El `verificado` de un evento, traducido solo si viene del standalone.</summary>
        public static int? Verificado(EventoEquipo e)
        {
            return e.MetodoYaEsDeZkAccess ? e.MetodoVerificacion : Verificado(e.MetodoVerificacion);
        }

        /// <summary>
        /// ¿Vale la pena mandarla? <paramref name="motivo"/> queda con el por
        /// qué cuando no, para la bitácora.
        ///
        /// HIPÓTESIS (incógnita (d)): `IsInValid == 0` equivale a un
        /// `event_type = 14` de ZKAccess. Se comprueba en sitio cruzando lo que
        /// entrega el SDK con las filas que aparecen en el `.mdb` tras la
        /// siguiente descarga.
        ///
        /// NO se filtra por método de verificación: si alguien entra con clave
        /// o tarjeta, estuvo ahí, y esconderlo haría que la pantalla lo contara
        /// como ausente. El dato de CON QUÉ se identificó va en `verificado`.
        /// </summary>
        public static bool EsValida(EventoEquipo e, out string motivo)
        {
            motivo = null;
            if (e == null)
            {
                motivo = "evento nulo";
                return false;
            }
            if (string.IsNullOrWhiteSpace(e.Pin))
            {
                motivo = "sin pin: no se puede atribuir a nadie";
                return false;
            }
            // El 0 es el pin de los sucesos de puerta y alarma: nadie se enrola
            // con él, y mandarlo inventaría una persona.
            if (e.Pin.Trim() == "0")
            {
                motivo = "pin 0: suceso del equipo, no de una persona";
                return false;
            }
            // Solo el pull informa el tipo. Cualquier cosa distinta de 14 es un
            // suceso de puerta, una alarma o una verificación fallida: igual que
            // la vía Access, que filtra `event_type = 14`.
            if (e.TipoEvento.HasValue && e.TipoEvento.Value != TablaPull.EventoVerificacionValida)
            {
                motivo = "no es una verificación válida (event_type " + e.TipoEvento.Value + ")";
                return false;
            }
            if (e.EsInvalido != 0)
            {
                motivo = "verificación rechazada por el equipo (IsInValid " + e.EsInvalido + ")";
                return false;
            }
            // Año 2000 como piso: un equipo recién reiniciado y sin hora puede
            // entregar fechas de 1970 o de 2000-01-01, y eso ensuciaría el
            // histórico con un día operativo inexistente.
            if (e.Momento.Year < 2000)
            {
                motivo = "hora imposible (" + e.Momento.ToString("yyyy-MM-dd HH:mm:ss",
                             CultureInfo.InvariantCulture) + "): ¿el equipo perdió el reloj?";
                return false;
            }
            return true;
        }

        /// <summary>
        /// La misma identidad que usa el servidor: `(device_sn, pin, momento)`.
        /// Sirve para no mandar dos veces lo que llegó por las dos puertas (en
        /// vivo y en la lectura de puesta al día).
        ///
        /// Al segundo, igual que la llave de la base: `acc_monitor_log.time` no
        /// guarda fracción.
        /// </summary>
        public static string Clave(string sn, EventoEquipo e)
        {
            return (sn ?? "").Trim().ToUpperInvariant() + "|" +
                   (e.Pin ?? "").Trim() + "|" +
                   e.Momento.ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// Cómo nombra ZKAccess el punto de verificación: el alias del equipo y
        /// el número de la puerta. En el histórico es «Entrada-1» para el equipo
        /// «Entrada». Es informativo; cuando Access descargue ese tramo, la
        /// ingesta lo sobrescribe con el nombre real.
        /// </summary>
        public static string Punto(EquipoConfigurado equipo)
        {
            if (equipo == null || string.IsNullOrWhiteSpace(equipo.Alias)) return null;
            return equipo.Alias.Trim() + "-1";
        }

        /// <summary>
        /// El evento, listo para el POST.
        ///
        /// `id` queda en null a propósito: ese número es de `acc_monitor_log`,
        /// no existe en el equipo, y es justo lo que le dice al servidor que
        /// esta marcación viene por la vía equipo.
        ///
        /// `momento` va SIN zona, igual que la vía Access: es la hora del
        /// equipo y el servidor le pone el offset de Bogotá. `recibidoAt` sí va
        /// con offset, porque es la hora del PC y su valor está justamente en
        /// compararla con la del equipo.
        /// </summary>
        public static MarcacionZk AMarcacion(EventoEquipo e, EquipoConfigurado equipo)
        {
            if (e == null) throw new ArgumentNullException("e");
            if (equipo == null) throw new ArgumentNullException("equipo");

            return new MarcacionZk
            {
                id = null,
                pin = e.Pin.Trim(),
                momento = e.Momento.ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture),
                // Un lector escrito a mano no tiene `device_id` de ZKAccess, y
                // mandar uno inventado lo haría pasar por uno real.
                deviceId = equipo.Id > 0 ? equipo.Id : (int?)null,
                deviceName = equipo.Alias,
                // El SN manda: es la llave natural. Si ZKAccess lo tenía viejo,
                // quien llena esto ya lo corrigió con el del propio equipo. En
                // mayúsculas, igual que la clave local y que el servidor.
                deviceSn = (equipo.Sn ?? "").Trim().ToUpperInvariant(),
                verificado = Verificado(e),
                punto = Punto(equipo),
                recibidoAt = e.RecibidoAt.ToString("yyyy-MM-dd'T'HH:mm:ss.fffzzz", CultureInfo.InvariantCulture),
            };
        }
    }
}
