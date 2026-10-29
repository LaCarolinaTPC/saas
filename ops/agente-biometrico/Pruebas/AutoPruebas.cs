using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Drawing;
using System.Windows.Forms;
using Gestivo.AgenteBiometrico.Dispositivo;
using Gestivo.AgenteBiometrico.Nucleo;
using Gestivo.AgenteBiometrico.Red;
using Newtonsoft.Json;

namespace Gestivo.AgenteBiometrico.Pruebas
{
    /// <summary>
    /// Pruebas de la lógica pura del agente, sin lector ni base ni red.
    ///
    /// Se corren con `Gestivo.AgenteBiometrico.exe --autopruebas` y devuelven
    /// código de salida 0 o 1, así que `publicar.cmd` las usa como puerta: si
    /// algo falla, no se publica.
    ///
    /// No son un proyecto de pruebas aparte a propósito: con net48 y x86 eso
    /// significaría otro csproj, otro paquete y otra copia de las dependencias
    /// para cubrir unas pocas funciones puras. Lo que de verdad importa aquí es
    /// que se puedan correr EN EL PC de la portería, donde no hay SDK de .NET
    /// instalado, y esto se puede: es el mismo .exe que ya está ahí.
    /// </summary>
    internal static class AutoPruebas
    {
        private static int _fallos;
        private static int _total;

        /// <summary>
        /// Dónde queda el informe, siempre. Esto es una aplicación de ventanas,
        /// así que su salida por consola depende de haber podido engancharse a
        /// la del proceso que la llamó, y eso no funciona cuando la lanza un
        /// .cmd con la salida redirigida. El archivo sí funciona siempre, y es
        /// lo que `publicar.cmd` muestra.
        /// </summary>
        internal static string RutaDelInforme
        {
            get
            {
                return System.IO.Path.Combine(
                    System.IO.Path.GetTempPath(), "gestivo-autopruebas.txt");
            }
        }

        internal static int Correr(string mdb = null)
        {
            try { Console.OutputEncoding = System.Text.Encoding.UTF8; }
            catch { /* una consola vieja no lo acepta; se lee igual */ }

            var consola = Console.Out;
            System.IO.StreamWriter archivo = null;
            try
            {
                archivo = new System.IO.StreamWriter(RutaDelInforme, false, new System.Text.UTF8Encoding(false));
                Console.SetOut(new Doble(consola, archivo));
            }
            catch (Exception e)
            {
                // Sin informe en archivo se sigue: la consola, si la hay, basta.
                consola.WriteLine("(no se pudo escribir el informe: " + e.Message + ")");
            }

            try
            {
                return Todo(mdb);
            }
            finally
            {
                Console.SetOut(consola);
                if (archivo != null)
                {
                    try { archivo.Dispose(); } catch { /* nada */ }
                    consola.WriteLine("Informe: " + RutaDelInforme);
                }
            }
        }

        /// <summary>Escribe en los dos sitios a la vez: consola e informe.</summary>
        private sealed class Doble : System.IO.TextWriter
        {
            private readonly System.IO.TextWriter _a;
            private readonly System.IO.TextWriter _b;

            public Doble(System.IO.TextWriter a, System.IO.TextWriter b) { _a = a; _b = b; }

            public override System.Text.Encoding Encoding { get { return _a.Encoding; } }

            public override void Write(char valor)
            {
                try { _a.Write(valor); } catch { /* sin consola */ }
                try { _b.Write(valor); } catch { /* sin archivo */ }
            }

            public override void Flush()
            {
                try { _a.Flush(); } catch { }
                try { _b.Flush(); } catch { }
            }
        }

        private static int Todo(string mdb)
        {
            Console.WriteLine("Autopruebas del agente del biométrico");
            Console.WriteLine(new string('-', 60));

            ListaDeEquipos();
            DiferenciasDeEquipos();
            ProcesosACeder();
            TraduccionDeVerificado();
            ValidezDeEventos();
            ClaveNatural();
            ConversionAMarcacion();
            ConfiguracionDeVias();
            MarcaDeAvance();
            SeriesDeLaViaAccess();
            ValoresSanosDeConfiguracion();
            FechasDelServidor();
            QueSeReintenta();
            TiempoEmpaquetado();
            TablaDelPull();
            Ventanas();
            if (!string.IsNullOrWhiteSpace(mdb)) LecturaDeLaBase(mdb.Trim());

            Console.WriteLine(new string('-', 60));
            Console.WriteLine(_fallos == 0
                ? "OK · " + _total + " comprobaciones"
                : "FALLARON " + _fallos + " de " + _total + " comprobaciones");
            return _fallos == 0 ? 0 : 1;
        }

        // ── Casos ────────────────────────────────────────────────────────────

        private static void ListaDeEquipos()
        {
            Console.WriteLine("ListaEquipos.Usables");

            var filas = new List<EquipoConfigurado>
            {
                Eq(7, "Entrada", "AHID222860036", "192.168.0.253", 4370, true, 1),
                // Deshabilitado en ZKAccess: no es un error, simplemente no es para esta vía.
                Eq(8, "Taller", "AHID999", "192.168.0.80", 4370, false, 1),
                // Por USB/serie: el SDK no lo abre por red.
                Eq(9, "Serie", "AHID888", "192.168.0.81", 4370, true, 2),
                // Sin IP válida.
                Eq(10, "Rota", "AHID777", "no-es-ip", 4370, true, 1),
                // Puerto imposible.
                Eq(11, "Puerto", "AHID666", "192.168.0.82", 0, true, 1),
            };

            var usables = ListaEquipos.Usables(filas);
            Afirmar("solo queda el de red habilitado y bien formado", usables.Count == 1);
            Afirmar("y es el 7", usables.Count == 1 && usables[0].Id == 7);

            // El caso real de esta instalación: el MISMO lector registrado varias
            // veces. Conectarse dos veces al mismo equipo haría que rechazara una
            // de las sesiones, así que gana el registro vigente (el de Id mayor).
            var repetido = ListaEquipos.Usables(new List<EquipoConfigurado>
            {
                Eq(4, "Entrada Principal", "AHID222860036", "192.168.0.253", 4370, true, 1),
                Eq(5, "192.168.0.253", "AHID222860036", "192.168.0.253", 4370, true, 1),
                Eq(7, "Entrada", "AHID222860036", "192.168.0.253", 4370, true, 1),
                Eq(3, "Entrada Principal", "AHID211660104", "192.168.0.250", 4370, true, 1),
            });
            Afirmar("un lector repetido cuenta una vez por número de serie", repetido.Count == 2);
            Afirmar("del repetido gana el registro vigente (Id mayor)",
                repetido.Any(e => e.Id == 7) && !repetido.Any(e => e.Id == 4 || e.Id == 5));
            Afirmar("salen ordenados por Id", repetido.Select(e => e.Id).SequenceEqual(new[] { 3, 7 }));

            // Sin SN (ZKAccess no guarda la serie) no se puede deducir que sean
            // el mismo equipo: pasan los dos y el SN real lo dirá la conexión.
            var sinSerie = ListaEquipos.Usables(new List<EquipoConfigurado>
            {
                Eq(1, "A", null, "192.168.0.10", 4370, true, 1),
                Eq(2, "B", "", "192.168.0.11", 4370, true, 1),
            });
            Afirmar("sin número de serie no se colapsan", sinSerie.Count == 2);

            Afirmar("una lista nula no reventa", ListaEquipos.Usables(null).Count == 0);
        }

        private static void DiferenciasDeEquipos()
        {
            Console.WriteLine("ListaEquipos.Diferencias");

            var antes = new List<EquipoConfigurado>
            {
                Eq(7, "Entrada", "AHID222860036", "192.168.0.253", 4370, true, 1),
                Eq(8, "Patio", "AHID444", "192.168.0.60", 4370, true, 1),
            };
            var ahora = new List<EquipoConfigurado>
            {
                // Mismo equipo, IP nueva: hay que reconectar.
                Eq(7, "Entrada", "AHID222860036", "192.168.0.254", 4370, true, 1),
                // El 8 desapareció y entró el 9.
                Eq(9, "Bodega", "AHID555", "192.168.0.70", 4370, true, 1),
            };

            var c = ListaEquipos.Diferencias(antes, ahora);
            Afirmar("detecta el alta", c.Altas.Count == 1 && c.Altas[0].Id == 9);
            Afirmar("detecta la baja", c.Bajas.Count == 1 && c.Bajas[0].Id == 8);
            Afirmar("detecta el cambio de dirección",
                c.Reconectar.Count == 1 && c.Reconectar[0].Id == 7);
            Afirmar("un cambio de dirección no se cuenta además como retoque", c.Retocar.Count == 0);
            Afirmar("hay algo que hacer", c.HayAlgo);
            Afirmar("el resumen nombra los tres cambios",
                c.Resumen().Contains("nuevos") && c.Resumen().Contains("retirados") &&
                c.Resumen().Contains("cambiaron de dirección"));

            // Cambió solo el alias o el número de serie: hay que actualizar los
            // datos, pero NO soltar una conexión que está funcionando.
            var retoque = ListaEquipos.Diferencias(antes, new List<EquipoConfigurado>
            {
                Eq(7, "Entrada Principal", "AHID222860036", "192.168.0.253", 4370, true, 1),
                Eq(8, "Patio", "AHID444", "192.168.0.60", 4370, true, 1),
            });
            Afirmar("un alias nuevo es retoque, no reconexión",
                retoque.Retocar.Count == 1 && retoque.Reconectar.Count == 0);

            var igual = ListaEquipos.Diferencias(antes, antes);
            Afirmar("sin cambios no hay nada que hacer", !igual.HayAlgo);
            Afirmar("y el resumen queda vacío", igual.Resumen().Length == 0);

            var arranque = ListaEquipos.Diferencias(null, ahora);
            Afirmar("al arrancar, todo es alta", arranque.Altas.Count == 2 && arranque.Bajas.Count == 0);
        }

        private static void ProcesosACeder()
        {
            Console.WriteLine("VigilanteZkAccess.NombresDe");

            var n = VigilanteZkAccess.NombresDe(" Access.exe , zkaccess ;; ACCESS ");
            Afirmar("quita la extensión, los espacios y los repetidos",
                n.Length == 2 && n[0] == "Access" && n[1] == "zkaccess");
            Afirmar("vacío = no ceder a nadie", VigilanteZkAccess.NombresDe("").Length == 0);
            Afirmar("nulo tampoco reventa", VigilanteZkAccess.NombresDe(null).Length == 0);

            // El de Office es MSACCESS.exe: no debe confundirse con ZKAccess,
            // que es Access.exe. La comparación es por nombre exacto.
            var solo = VigilanteZkAccess.NombresDe("Access");
            Afirmar("«Access» no es «MSACCESS»",
                solo.Length == 1 && !string.Equals(solo[0], "MSACCESS", StringComparison.OrdinalIgnoreCase));
        }

        private static void TraduccionDeVerificado()
        {
            Console.WriteLine("MapeoEquipo.Verificado");
            Afirmar("el método 1 del SDK es la huella (6 de ZKAccess)",
                MapeoEquipo.Verificado(1) == MapeoEquipo.VerificadoHuella);
            Afirmar("lo que no esté en la tabla pasa en crudo, no se inventa",
                MapeoEquipo.Verificado(4) == 4 && MapeoEquipo.Verificado(0) == 0);

            // El pull ya entrega el `verified` de ZKAccess: traducirlo como si
            // fuera del standalone convertiría un 1 legítimo en huella.
            var delPull = Ev("27", 0, 1);
            delPull.MetodoYaEsDeZkAccess = true;
            Afirmar("un método que ya es de ZKAccess (pull) no se traduce",
                MapeoEquipo.Verificado(delPull) == 1);
            Afirmar("uno del standalone sí", MapeoEquipo.Verificado(Ev("27", 0, 1)) == MapeoEquipo.VerificadoHuella);
        }

        private static void ValidezDeEventos()
        {
            Console.WriteLine("MapeoEquipo.EsValida");
            string motivo;

            Afirmar("una verificación normal vale", MapeoEquipo.EsValida(Ev("27", 0, 1), out motivo));

            Afirmar("sin pin no se puede atribuir", !MapeoEquipo.EsValida(Ev("", 0, 1), out motivo));
            Afirmar("y lo dice", (motivo ?? "").Contains("pin"));

            Afirmar("una verificación rechazada no vale",
                !MapeoEquipo.EsValida(Ev("27", 1, 1), out motivo));

            var sinReloj = Ev("27", 0, 1);
            sinReloj.Momento = new DateTime(1970, 1, 1, 0, 0, 0);
            Afirmar("una fecha de equipo sin reloj no vale",
                !MapeoEquipo.EsValida(sinReloj, out motivo));
            Afirmar("y lo dice", (motivo ?? "").Contains("reloj"));

            // Entrar con clave o tarjeta también es haber estado ahí: filtrarlo
            // haría que la pantalla contara a esa persona como ausente.
            Afirmar("un método que no es huella igual vale",
                MapeoEquipo.EsValida(Ev("27", 0, 3), out motivo));

            Afirmar("un evento nulo no reventa", !MapeoEquipo.EsValida(null, out motivo));

            Afirmar("el pin 0 es un suceso del equipo, no de una persona",
                !MapeoEquipo.EsValida(Ev("0", 0, 1), out motivo));

            var puerta = Ev("27", 0, 1);
            puerta.TipoEvento = 200;
            Afirmar("un evento que no es tipo 14 no vale", !MapeoEquipo.EsValida(puerta, out motivo));
            Afirmar("y lo dice", (motivo ?? "").Contains("event_type"));

            var huella = Ev("27", 0, 1);
            huella.TipoEvento = 14;
            Afirmar("un tipo 14 sí vale", MapeoEquipo.EsValida(huella, out motivo));
        }

        private static void ClaveNatural()
        {
            Console.WriteLine("MapeoEquipo.Clave");

            var e = Ev("27", 0, 1);
            var clave = MapeoEquipo.Clave("AHID222860036", e);
            Afirmar("la clave es serie|pin|momento al segundo",
                clave == "AHID222860036|27|20261020064210");

            Afirmar("la serie no distingue mayúsculas",
                MapeoEquipo.Clave("ahid222860036", e) == clave);
            Afirmar("los espacios de sobra no cuentan",
                MapeoEquipo.Clave(" AHID222860036 ", e) == clave);

            var otroSegundo = Ev("27", 0, 1);
            otroSegundo.Momento = otroSegundo.Momento.AddSeconds(1);
            Afirmar("un segundo de diferencia es otra huella",
                MapeoEquipo.Clave("AHID222860036", otroSegundo) != clave);

            // El mismo pin y el mismo segundo en DOS lectores son dos huellas de
            // verdad: la clave tiene que distinguirlas.
            Afirmar("dos lectores no se mezclan",
                MapeoEquipo.Clave("AHID211660104", e) != clave);

            // La fracción de segundo se tira: `acc_monitor_log.time` no la
            // guarda, así que incluirla rompería el cruce entre las dos vías.
            var conMilis = Ev("27", 0, 1);
            conMilis.Momento = conMilis.Momento.AddMilliseconds(400);
            Afirmar("las milésimas no cuentan", MapeoEquipo.Clave("AHID222860036", conMilis) == clave);
        }

        private static void ConversionAMarcacion()
        {
            Console.WriteLine("MapeoEquipo.AMarcacion");

            var equipo = Eq(7, "Entrada", "AHID222860036", "192.168.0.253", 4370, true, 1);
            var m = MapeoEquipo.AMarcacion(Ev("27", 0, 1), equipo);

            // Lo más importante: SIN id. Es lo que le dice al servidor que la
            // huella viene del lector y que la identidad es (sn, pin, momento).
            Afirmar("no lleva id", m.id == null);
            Afirmar("lleva el pin", m.pin == "27");
            Afirmar("el momento va sin zona, que la pone el servidor",
                m.momento == "2026-10-20T06:42:10");
            Afirmar("lleva la serie, que es la llave", m.deviceSn == "AHID222860036");
            Afirmar("lleva el device_id de ZKAccess", m.deviceId == 7);
            Afirmar("traduce el método de verificación", m.verificado == MapeoEquipo.VerificadoHuella);
            Afirmar("el punto se nombra como en ZKAccess", m.punto == "Entrada-1");

            // `recibidoAt` SÍ lleva offset: su valor está en poder compararla con
            // la hora del equipo, y sin zona no se podría.
            Afirmar("recibidoAt lleva offset",
                !string.IsNullOrEmpty(m.recibidoAt) &&
                (m.recibidoAt.Contains("+") || m.recibidoAt.LastIndexOf('-') > 10));
            DateTimeOffset _;
            Afirmar("y es una fecha que el servidor puede leer",
                DateTimeOffset.TryParse(m.recibidoAt, CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out _));

            var sinAlias = Eq(7, null, "AHID222860036", "192.168.0.253", 4370, true, 1);
            Afirmar("sin alias no se inventa un punto",
                MapeoEquipo.AMarcacion(Ev("27", 0, 1), sinAlias).punto == null);

            // La serie es parte de la llave natural: mayúsculas y sin espacios,
            // igual que en el servidor, o la misma huella serían dos filas.
            var minusculas = Eq(7, "Entrada", " ahid222860036 ", "192.168.0.253", 4370, true, 1);
            Afirmar("la serie sale en mayúsculas y sin espacios",
                MapeoEquipo.AMarcacion(Ev("27", 0, 1), minusculas).deviceSn == "AHID222860036");

            // Un lector escrito a mano no tiene device_id de ZKAccess.
            var manual = Eq(-1, "Entrada", "AHID222860036", "192.168.0.253", 4370, true, 1);
            Afirmar("un lector a mano no manda un device_id inventado",
                MapeoEquipo.AMarcacion(Ev("27", 0, 1), manual).deviceId == null);
        }

        private static void ConfiguracionDeVias()
        {
            Console.WriteLine("Configuracion: vías y lectores guardados");

            Func<Configuracion> base_ = () => new Configuracion
            {
                Url = "https://ejemplo",
                SecretoCifrado = "x",
            };

            var deAntes = JsonConvert.DeserializeObject<Configuracion>("{\"Url\":\"https://x\"}");
            Afirmar("un config.json de antes deja la vía Access encendida", deAntes.ViaAccessHabilitada);

            var a = base_();
            a.Mdb = "C:\\Access.mdb";
            Afirmar("con URL, secreto y base, está completa (como siempre)", a.EstaCompleta);

            var sinBase = base_();
            Afirmar("con la vía Access, sin base no está completa", !sinBase.EstaCompleta);
            Afirmar("y dice que falta la base", sinBase.QueFalta().Contains("Access.mdb"));

            var ninguna = base_();
            ninguna.ViaAccessHabilitada = false;
            Afirmar("sin ninguna vía no está completa", !ninguna.EstaCompleta);
            Afirmar("y lo dice", ninguna.QueFalta().Contains("al menos una vía"));

            var soloEquipoSinLectores = base_();
            soloEquipoSinLectores.ViaAccessHabilitada = false;
            soloEquipoSinLectores.EquipoHabilitado = true;
            Afirmar("solo equipo y sin lectores guardados no está completa", !soloEquipoSinLectores.EstaCompleta);
            Afirmar("y pide un lector", soloEquipoSinLectores.QueFalta().Contains("lector"));

            var soloEquipo = base_();
            soloEquipo.ViaAccessHabilitada = false;
            soloEquipo.EquipoHabilitado = true;
            soloEquipo.Equipos.Add(Eq(7, "Entrada", "AHID222860036", "192.168.0.253", 4370, true, 1));
            Afirmar("solo equipo con un lector guardado está completa, sin base", soloEquipo.EstaCompleta);
            Afirmar("y la vía Access no está lista", !soloEquipo.ViaAccessLista);

            // Lo que viaja en el archivo: se copia entre PCs, así que nada en claro.
            var conClave = Eq(7, "Entrada", "AHID222860036", "192.168.0.253", 4370, true, 1);
            conClave.ClaveComm = "1234";
            soloEquipo.Equipos[0] = conClave;
            var json = JsonConvert.SerializeObject(soloEquipo);
            Afirmar("la clave del lector no se guarda en config.json", !json.Contains("1234"));
            Afirmar("ni los valores descifrados ni los calculados",
                !json.Contains("\"Secreto\"") && !json.Contains("\"ClaveMdb\"") &&
                !json.Contains("\"EstaCompleta\"") && !json.Contains("\"EsUsable\""));

            var vuelta = JsonConvert.DeserializeObject<Configuracion>(json).ConValoresSanos();
            Afirmar("los lectores vuelven igual del archivo",
                vuelta.Equipos.Count == 1 && vuelta.Equipos[0].Id == 7 &&
                vuelta.Equipos[0].Sn == "AHID222860036" && vuelta.Equipos[0].Ip == "192.168.0.253" &&
                vuelta.Equipos[0].Puerto == 4370 && vuelta.Equipos[0].Numero == 1 &&
                vuelta.Equipos[0].TipoSdk == FabricaEquipo.SdkPull && vuelta.Equipos[0].EsUsable);

            // Guardar solo cuando cambia: el ciclo corre cada 15 minutos.
            var c = base_();
            var leidos = new List<EquipoConfigurado> { Eq(7, "Entrada", "AHID222860036", "192.168.0.253", 4370, true, 1) };
            Afirmar("la primera lista de ZKAccess se guarda", c.ActualizarEquiposDesdeZkAccess(leidos));
            Afirmar("y queda marcada como de ZKAccess", c.EquiposOrigen == Configuracion.OrigenZkAccess && c.EquiposActualizadosAt.HasValue);
            Afirmar("la misma lista otra vez no reescribe nada", !c.ActualizarEquiposDesdeZkAccess(leidos));
            leidos[0].Ip = "192.168.0.254";
            Afirmar("una IP nueva sí", c.ActualizarEquiposDesdeZkAccess(leidos));
            leidos[0].Sn = "OTRO";
            Afirmar("y lo guardado es una copia, no la misma lista", c.Equipos[0].Sn == "AHID222860036");
        }

        private static void MarcaDeAvance()
        {
            Console.WriteLine("TiempoReal.MarcaDeAvance");

            var porEquipo = new Dictionary<string, string>
            {
                { "AHID222860036", "2026-10-20T11:00:00+00:00" },
                { "AHID211660104", "2026-10-21T11:00:00+00:00" },
            };
            var global = "2026-10-21T11:30:00+00:00";
            var propia = ClienteGestivo.ParsearMomento("2026-10-20T11:00:00+00:00");

            // El fallo que se corrigió: con la global más nueva, el lector se
            // saltaba su propio hueco.
            Afirmar("manda la marca del propio lector aunque la global sea más nueva",
                Sincronizacion.TiempoReal.MarcaDeAvance("AHID222860036", porEquipo, global) == propia);
            Afirmar("la serie se busca sin distinguir mayúsculas",
                Sincronizacion.TiempoReal.MarcaDeAvance(" ahid222860036 ", porEquipo, global) == propia);
            Afirmar("un lector que nunca reportó usa la global",
                Sincronizacion.TiempoReal.MarcaDeAvance("NUEVO", porEquipo, global) ==
                ClienteGestivo.ParsearMomento(global));
            Afirmar("sin serie también",
                Sincronizacion.TiempoReal.MarcaDeAvance(null, porEquipo, global) ==
                ClienteGestivo.ParsearMomento(global));
            Afirmar("sin nada es «leer todo»",
                Sincronizacion.TiempoReal.MarcaDeAvance("X", null, null) == null);
        }

        private static void SeriesDeLaViaAccess()
        {
            Console.WriteLine("LectorZk.CompletarSeries");

            var series = new Dictionary<int, string> { { 7, "AHID222860036" }, { 3, "ahid211660104" } };
            var m = new List<Datos.MarcacionZk>
            {
                new Datos.MarcacionZk { id = 1, pin = "27", deviceId = 7, deviceSn = null },
                new Datos.MarcacionZk { id = 2, pin = "27", deviceId = 3, deviceSn = "" },
                new Datos.MarcacionZk { id = 3, pin = "27", deviceId = 7, deviceSn = "AHID999" },
                new Datos.MarcacionZk { id = 4, pin = "27", deviceId = 99, deviceSn = null },
            };
            var n = Datos.LectorZk.CompletarSeries(m, series);
            Afirmar("completa las que llegan sin serie", n == 2 && m[0].deviceSn == "AHID222860036");
            Afirmar("en mayúsculas", m[1].deviceSn == "AHID211660104");
            Afirmar("no pisa una serie que ya venía", m[2].deviceSn == "AHID999");
            Afirmar("y no inventa una para un device_id desconocido", m[3].deviceSn == null);
        }

        private static void ValoresSanosDeConfiguracion()
        {
            Console.WriteLine("Configuracion.ConValoresSanos");

            var c = new Configuracion
            {
                TiempoRealFlushSeg = 0,
                EquipoMargenMin = 0,
                EquipoProcesosCeder = "  Access  ",
            }.ConValoresSanos();
            Afirmar("un flush de 0 s se sube al mínimo", c.TiempoRealFlushSeg >= 5);
            Afirmar("un margen de 0 min se sube al mínimo", c.EquipoMargenMin >= 1);
            Afirmar("los espacios de los procesos se quitan", c.EquipoProcesosCeder == "Access");

            var exagerado = new Configuracion
            {
                TiempoRealFlushSeg = 99999,
                EquipoMargenMin = 99999,
            }.ConValoresSanos();
            Afirmar("un flush enorme se acota", exagerado.TiempoRealFlushSeg <= 600);
            Afirmar("un margen enorme se acota", exagerado.EquipoMargenMin <= 1440);

            var porDefecto = new Configuracion().ConValoresSanos();
            Afirmar("la vía equipo viene APAGADA por defecto", !porDefecto.EquipoHabilitado);
            Afirmar("y sin clave de comunicación", porDefecto.EquipoClaveComm == null);
        }

        private static void FechasDelServidor()
        {
            Console.WriteLine("ClienteGestivo.ParsearMomento");

            // La trampa: PostgREST normaliza los timestamptz a +00:00, así que
            // lo que llega está en UTC aunque el dato se guardara con el offset
            // de Bogotá. Leer los dígitos tal cual daría cinco horas de menos y
            // la puesta al día pediría un tramo equivocado.
            var enUtc = ClienteGestivo.ParsearMomento("2026-10-20T11:42:10+00:00");
            var enBogota = ClienteGestivo.ParsearMomento("2026-10-20T06:42:10-05:00");
            Afirmar("el mismo instante escrito en dos zonas da lo mismo",
                enUtc.HasValue && enBogota.HasValue && enUtc.Value == enBogota.Value);

            var conZ = ClienteGestivo.ParsearMomento("2026-10-20T11:42:10Z");
            Afirmar("la forma con Z también", conZ.HasValue && conZ.Value == enUtc.Value);

            // Y lo que de verdad se quiere: que el resultado sea hora LOCAL del
            // PC, porque con eso se le habla al lector.
            var esperado = new DateTimeOffset(2026, 10, 20, 11, 42, 10, TimeSpan.Zero)
                .ToLocalTime().DateTime;
            Afirmar("el resultado es hora local del PC", enUtc.Value == esperado);

            Afirmar("vacío es «no hay marca»", ClienteGestivo.ParsearMomento("") == null);
            Afirmar("nulo también", ClienteGestivo.ParsearMomento(null) == null);
            Afirmar("una basura no reventa", ClienteGestivo.ParsearMomento("ayer") == null);
        }

        private static void QueSeReintenta()
        {
            Console.WriteLine("ErrorGestivo: qué se descarta y qué se reintenta");

            // Lo ÚNICO que se descarta: el servidor validó el lote y lo rechazó
            // por mal formado, así que reintentar lo mismo no lo arregla nunca y
            // atascaría para siempre todo lo que venga detrás.
            Afirmar("un 400 (lote mal formado) se descarta",
                new ErrorGestivo(System.Net.HttpStatusCode.BadRequest, "x").SeDescarta);

            // Y lo que NO se puede tirar, con el porqué de cada uno.
            var seReintentan = new[]
            {
                System.Net.HttpStatusCode.Unauthorized,          // secreto mal: configuración
                System.Net.HttpStatusCode.Forbidden,
                System.Net.HttpStatusCode.NotFound,              // URL mal: configuración
                System.Net.HttpStatusCode.RequestEntityTooLarge, // lote grande: se parte y va
                System.Net.HttpStatusCode.InternalServerError,   // el servidor se cayó
                System.Net.HttpStatusCode.BadGateway,
                System.Net.HttpStatusCode.ServiceUnavailable,    // falta BIOMETRICO_SECRET allá
                System.Net.HttpStatusCode.GatewayTimeout,
            };
            foreach (var c in seReintentan)
                Afirmar("un " + (int)c + " se reintenta, no se tira",
                    !new ErrorGestivo(c, "x").SeDescarta);

            // El 401 era el caso peligroso: con la regla vieja —descartar ante
            // cualquier 4xx— se tiraban huellas porque el secreto estaba mal
            // escrito, que es algo que se arregla en una ventana.
            var mal = new ErrorGestivo(System.Net.HttpStatusCode.Unauthorized, "x");
            Afirmar("el 401 sigue siendo «del cliente» pero NO se descarta",
                mal.EsDelCliente && !mal.SeDescarta);
        }

        private static void TiempoEmpaquetado()
        {
            Console.WriteLine("TiempoZk (la fecha como la guarda el lector)");

            // El caso de oro: una fila REAL del equipo, medida el 2026-10-20.
            var real = TiempoZk.Desempaquetar(861465103);
            Afirmar("una fila real del equipo da su fecha",
                real.HasValue && real.Value == new DateTime(2026, 10, 20, 15, 51, 43),
                real.HasValue ? real.Value.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) : "null");

            // Ida y vuelta, en fechas que tocan los bordes del empaquetado.
            foreach (var f in new[]
                     {
                         new DateTime(2026, 10, 20, 15, 51, 43),
                         new DateTime(2000, 1, 1, 0, 0, 1),
                         new DateTime(2026, 1, 31, 23, 59, 59),
                         new DateTime(2026, 12, 31, 12, 0, 0),
                         new DateTime(2024, 2, 29, 6, 30, 0),
                     })
            {
                var ida = TiempoZk.Empaquetar(f);
                var vuelta = TiempoZk.Desempaquetar(ida);
                Afirmar("ida y vuelta de " + f.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
                    vuelta.HasValue && vuelta.Value == f);
            }

            // El equipo cuenta meses de 31 días, así que el empaquetado admite
            // fechas que no existen. Dejarlas pasar ensuciaría el histórico con
            // un día operativo inexistente.
            var treintaYUnoDeFebrero = (2026 - 2000) * 12 * 31 + (2 - 1) * 31 + (31 - 1);
            Afirmar("un 31 de febrero se rechaza",
                TiempoZk.Desempaquetar(treintaYUnoDeFebrero * 86400) == null);
            // El 2000-01-01 00:00:00 empaqueta justo a 0, así que el cero es
            // ambiguo: o es ese instante, o es «sin valor». Se decide que es
            // «sin valor», porque una marcación del año 2000 en un equipo
            // fabricado en 2022 no existe y un campo vacío sí.
            Afirmar("el inicio de la cuenta empaqueta a 0",
                TiempoZk.Empaquetar(new DateTime(2000, 1, 1, 0, 0, 0)) == 0);
            Afirmar("y el cero se lee como «sin valor», no como esa fecha",
                TiempoZk.Desempaquetar(0) == null);
            Afirmar("un negativo se rechaza", TiempoZk.Desempaquetar(-5) == null);

            // Dentro del mismo mes tiene que crecer con el tiempo: es lo que
            // permite comparar y ordenar.
            Afirmar("crece con el tiempo",
                TiempoZk.Empaquetar(new DateTime(2026, 10, 20, 8, 0, 0)) <
                TiempoZk.Empaquetar(new DateTime(2026, 10, 20, 8, 0, 1)) &&
                TiempoZk.Empaquetar(new DateTime(2026, 10, 20, 23, 59, 59)) <
                TiempoZk.Empaquetar(new DateTime(2026, 10, 21, 0, 0, 0)));
        }

        private static void TablaDelPull()
        {
            Console.WriteLine("TablaPull (lo que devuelve el SDK pull)");

            // La cabecera y las filas, tal como las devolvió el equipo.
            var tabla = string.Join("\r\n", new[]
            {
                "Cardno,Pin,Verified,DoorID,EventType,InOutState,Time_second",
                "0,332,6,1,14,0,807429214",
                "0,686,6,1,14,0,861465103",
                "0,580,6,1,14,0,861465121",
            });
            int omitidas, descartadas;
            var filas = TablaPull.Transacciones(tabla, out omitidas, out descartadas);
            Afirmar("lee las tres filas", filas.Count == 3, "leídas " + filas.Count);
            Afirmar("las marca como verificaciones válidas (event_type 14)",
                filas.All(f => f.TipoEvento == TablaPull.EventoVerificacionValida));
            Afirmar("y con el «Verified» que ya es de ZKAccess, sin traducir",
                filas.All(f => f.MetodoYaEsDeZkAccess));
            Afirmar("el estado es InOutState, no el tipo de evento", filas.All(f => f.Estado == 0));
            Afirmar("ninguna omitida", omitidas == 0);
            Afirmar("toma el pin", filas.Count == 3 && filas[1].Pin == "686");
            Afirmar("toma el método de verificación de «Verified»",
                filas.Count == 3 && filas[1].MetodoVerificacion == 6);
            Afirmar("y la fecha del empaquetado",
                filas.Count == 3 && filas[1].Momento == new DateTime(2026, 10, 20, 15, 51, 43));
            Afirmar("las marca como leídas, no en vivo",
                filas.Count == 3 && filas[0].Fuente == FuenteEvento.Lectura);

            // Las columnas se leen por NOMBRE: si el firmware agrega una, no
            // se desplaza la lectura.
            var conExtra = string.Join("\r\n", new[]
            {
                "Nuevo,Cardno,Pin,Verified,DoorID,EventType,InOutState,Time_second",
                "x,0,686,6,1,14,0,861465103",
            });
            var conExtraFilas = TablaPull.Transacciones(conExtra, out omitidas, out descartadas);
            Afirmar("una columna nueva del firmware no desplaza la lectura",
                conExtraFilas.Count == 1 && conExtraFilas[0].Pin == "686" &&
                conExtraFilas[0].Momento == new DateTime(2026, 10, 20, 15, 51, 43));

            // Filas corruptas: una no puede tumbar una descarga de 95.000.
            var sucia = string.Join("\r\n", new[]
            {
                "Cardno,Pin,Verified,DoorID,EventType,InOutState,Time_second",
                "0,686,6,1,14,0,861465103",
                "0,,6,1,14,0,861465103",
                "0,999,6,1,14,0,abc",
                "incompleta",
            });
            var limpias = TablaPull.Transacciones(sucia, out omitidas, out descartadas);
            Afirmar("una fila buena entre basura se salva", limpias.Count == 1);
            Afirmar("y las malas se cuentan", omitidas == 3, "omitidas " + omitidas);

            Afirmar("texto vacío no reventa",
                TablaPull.Transacciones("", out omitidas, out descartadas).Count == 0);
            Afirmar("solo cabecera no reventa",
                TablaPull.Transacciones("Pin,Time_second", out omitidas, out descartadas).Count == 0);

            // La corrección del 2026-10-21: la puesta al día mandaba TODO lo que
            // hubiera en la tabla, también sucesos de puerta y alarmas. La vía
            // Access filtra `event_type = 14` y la vía en vivo también; la
            // descarga tiene que hacer lo mismo.
            var mezclada = string.Join("\r\n", new[]
            {
                "Cardno,Pin,Verified,DoorID,EventType,InOutState,Time_second",
                "0,332,6,1,14,0,861465103",
                "0,332,6,1,200,0,861465104",   // puerta abierta: no es una huella
                "0,0,6,1,14,0,861465105",      // pin 0: suceso del equipo
                "0,686,6,1,27,0,861465106",    // verificación fallida
            });
            var deMezclada = TablaPull.Transacciones(mezclada, out omitidas, out descartadas);
            Afirmar("de la descarga solo salen las verificaciones válidas con pin",
                deMezclada.Count == 1 && deMezclada[0].Pin == "332", "salieron " + deMezclada.Count);
            Afirmar("y el resto se cuenta como descartado, no como omitido",
                descartadas == 3 && omitidas == 0, "descartadas " + descartadas + " · omitidas " + omitidas);

            // Sin columna EventType no se sabe el tipo: no se inventa un filtro.
            var sinTipo = string.Join("\r\n", new[] { "Pin,Verified,Time_second", "332,6,861465103" });
            var deSinTipo = TablaPull.Transacciones(sinTipo, out omitidas, out descartadas);
            Afirmar("si la tabla no trae EventType, la fila pasa",
                deSinTipo.Count == 1 && deSinTipo[0].TipoEvento == null);

            // ── Tiempo real ──────────────────────────────────────────────────
            Console.WriteLine("TablaPull.EnVivo");
            int ignorados;

            // Orden del pull: hora, pin, tarjeta, puerta, TIPO, entrada/salida,
            // modo de verificación. Lo que llega en cada sondeo sin novedad es
            // el estado de puerta (tipo 255, línea capturada del equipo). NO es
            // una huella, y mandarlo a Gestivo inventaría una presencia.
            var puerta = "2026-10-20 16:16:33,0,0,0,255,0,200";
            var raras = new List<string>();
            Afirmar("un estado de puerta NO es una huella",
                TablaPull.EnVivo(puerta, out ignorados, raras).Count == 0);
            Afirmar("y se cuenta como ignorado", ignorados == 1);
            Afirmar("y no se reporta como línea rara (llega en cada sondeo)", raras.Count == 0);

            // Una verificación válida: tipo 14 en la columna 4, con su pin.
            var huella = "2026-10-20 16:20:05,332,0,1,14,0,6";
            var vivas = TablaPull.EnVivo(huella, out ignorados);
            Afirmar("una verificación válida sí lo es", vivas.Count == 1);
            Afirmar("con su pin", vivas.Count == 1 && vivas[0].Pin == "332");
            Afirmar("con su momento",
                vivas.Count == 1 && vivas[0].Momento == new DateTime(2026, 10, 20, 16, 20, 5));
            Afirmar("marcada como EN VIVO",
                vivas.Count == 1 && vivas[0].Fuente == FuenteEvento.TiempoReal);
            Afirmar("y con el valor que ZKAccess usa para huella",
                vivas.Count == 1 && vivas[0].MetodoVerificacion == MapeoEquipo.VerificadoHuella);
            Afirmar("marcada como tipo 14 y sin traducir",
                vivas.Count == 1 && vivas[0].TipoEvento == 14 && vivas[0].MetodoYaEsDeZkAccess);

            // Una tanda mezclada, que es lo normal.
            var tanda = string.Join("\r\n", new[]
            {
                "2026-10-20 16:16:33,0,0,0,255,0,200",
                "2026-10-20 16:20:05,332,0,1,14,0,6",
                "2026-10-20 16:20:11,686,0,1,14,0,6",
                "2026-10-20 16:20:30,686,0,1,27,0,6",   // verificación fallida
                "2026-10-20 16:21:00,0,0,0,255,0,200",
            });
            raras.Clear();
            var deTanda = TablaPull.EnVivo(tanda, out ignorados, raras);
            Afirmar("de una tanda mezclada saca solo las huellas", deTanda.Count == 2);
            Afirmar("y cuenta el resto como ignorado", ignorados == 3);
            Afirmar("la verificación fallida sí se reporta como rara",
                raras.Count == 1 && raras[0].Contains(",27,"), "raras " + raras.Count);

            // El error que hubo en producción del 20 al 29-10: leer el tipo en la
            // columna 6 (el modo de verificación). Un 14 AHÍ no es una huella.
            Afirmar("un 14 en la columna 6 NO es una huella",
                TablaPull.EnVivo("2026-10-20 16:20:05,332,0,1,0,0,14", out ignorados).Count == 0);

            Afirmar("vacío no reventa", TablaPull.EnVivo("", out ignorados).Count == 0);

            // ── Parámetros ───────────────────────────────────────────────────
            var par = TablaPull.Parametros(
                "~SerialNumber=AHID222860036,~DeviceName=MA500,FirmVer=Ver 6.64.0012 Jun 25 2014," +
                "~Platform=ZEM760,LockCount=1");
            Afirmar("lee el número de serie",
                par.ContainsKey("~SerialNumber") && par["~SerialNumber"] == "AHID222860036");
            Afirmar("y el firmware con sus espacios",
                par.ContainsKey("FirmVer") && par["FirmVer"] == "Ver 6.64.0012 Jun 25 2014");
            Afirmar("y la plataforma",
                par.ContainsKey("~Platform") && par["~Platform"] == "ZEM760");
        }

        /// <summary>
        /// Prueba de humo de las ventanas: se construyen y se miden, sin
        /// mostrarlas.
        ///
        /// Vale la pena porque en este proyecto los errores de WinForms ya han
        /// sido de maquetación, no de lógica: con posiciones fijas la ventana de
        /// Configuración se quedó corta y los botones Probar y Guardar cayeron
        /// fuera del área visible. Un fallo así no se ve compilando, y en la
        /// portería se descubre cuando alguien no puede guardar.
        /// </summary>
        private static void Ventanas()
        {
            Console.WriteLine("Ventanas (construcción y medidas)");

            var cfg = new Configuracion { Url = "https://ejemplo", Mdb = "C:\\no-existe.mdb" }
                .ConValoresSanos();
            cfg.ActualizarEquiposDesdeZkAccess(new List<EquipoConfigurado>
            {
                Eq(7, "Entrada", "AHID222860036", "192.168.0.253", 4370, true, 1),
            });
            var equipo = new Sincronizacion.EstadoTiempoReal
            {
                Habilitado = true,
                SdkCompilado = true,
                Equipos = new List<Sincronizacion.EstadoEquipo>
                {
                    new Sincronizacion.EstadoEquipo
                    {
                        Id = 7, Alias = "Entrada", Sn = "AHID222860036",
                        Enlace = "192.168.0.253:4370",
                        Salud = Sincronizacion.SaludEquipo.Conectado,
                        Desde = DateTime.Now, Firmware = "Ver 6.64.0012",
                        Registros = 42000, Desfase = TimeSpan.FromSeconds(12),
                        UltimaHuella = DateTime.Now, UltimoPin = "27", HuellasHoy = 118,
                    },
                },
            };

            try
            {
                using (var v = new App.FormConfiguracion(cfg, () => { }, () => equipo,
                           (id, contar) => System.Threading.Tasks.Task.FromResult("")))
                {
                    Afirmar("Configuración se construye", true);

                    var trabajo = Screen.PrimaryScreen.WorkingArea;
                    Afirmar("la ventana cabe en el área de trabajo de esta pantalla",
                        v.Width <= trabajo.Width && v.Height <= trabajo.Height);

                    // Las medidas, impresas: una aserción dice «cabe», pero para
                    // juzgar si cabe en la pantalla de la portería hay que ver
                    // los números.
                    Console.WriteLine("       ventana " + v.Width + "x" + v.Height +
                                      " · mínimo " + v.MinimumSize.Width + "x" + v.MinimumSize.Height +
                                      " · pantalla " + trabajo.Width + "x" + trabajo.Height);
                    foreach (var t in Todos(v).OfType<TableLayoutPanel>())
                        Console.WriteLine("       pestaña: alto que pide " + t.PreferredSize.Height +
                                          " px · columna de etiquetas " +
                                          (int)t.ColumnStyles[0].Width + " px");

                    // El objetivo de la pantalla chica: el MÍNIMO tiene que
                    // caber en 1024x600, que es lo que puede haber en un PC de
                    // portería con escalado. Lo que no quepa se alcanza con las
                    // barras de desplazamiento, no quedando fuera de la vista.
                    Afirmar("el tamaño mínimo cabe en 1024x600",
                        v.MinimumSize.Width <= 1024 - 40 && v.MinimumSize.Height <= 600 - 40);

                    // Nada recortado: cada etiqueta tiene que tener sitio para
                    // su propio texto con la fuente que Windows esté usando. Es
                    // lo que protege de una pantalla chica CON escalado, donde
                    // la fuente crece y un ancho fijo recortaría.
                    using (var g = v.CreateGraphics())
                    {
                        var recortadas = Todos(v).OfType<Label>()
                            .Where(l => !l.AutoSize && !string.IsNullOrEmpty(l.Text) && l.Height <= 30)
                            .Where(l => TextRenderer.MeasureText(g, l.Text, v.Font).Width > l.Width)
                            .Select(l => l.Text)
                            .ToList();
                        Afirmar("ninguna etiqueta de una línea queda recortada" +
                                (recortadas.Count == 0 ? "" : ": " + string.Join(" · ", recortadas)),
                            recortadas.Count == 0);
                    }

                    var pestanas = Todos(v).OfType<TabControl>().FirstOrDefault();
                    Afirmar("los campos están repartidos en pestañas", pestanas != null);
                    Afirmar("hay tres pestañas", pestanas != null && pestanas.TabPages.Count == 3);
                    if (pestanas != null)
                        Afirmar("y son Gestivo / Biométrico / Lectura directa del equipo",
                            pestanas.TabPages[0].Text == "Gestivo" &&
                            pestanas.TabPages[1].Text == "Biométrico" &&
                            pestanas.TabPages[2].Text.StartsWith("Lectura directa", StringComparison.Ordinal));

                    // Sin AutoScroll, lo que no cabe queda recortado y sin forma
                    // de alcanzarlo. Y tiene que estar en el PANEL, no en el
                    // TableLayoutPanel que se autodimensiona: ahí se anulan.
                    var scrolls = Todos(v).OfType<Panel>()
                        .Where(x => x.AutoScroll && !(x is TableLayoutPanel)).ToList();
                    Afirmar("cada pestaña tiene su panel desplazable", scrolls.Count >= 3);
                    Afirmar("ninguna tabla de campos se autodesplaza a sí misma",
                        Todos(v).OfType<TableLayoutPanel>().All(t => !t.AutoScroll));
                    Afirmar("las tablas crecen hacia abajo (Dock.Top), que es lo que permite desplazar",
                        Todos(v).OfType<TableLayoutPanel>().All(t => t.Dock == DockStyle.Top));

                    // La prueba que de verdad importa para una pantalla chica:
                    // al tamaño MÍNIMO, lo que no cabe se tiene que poder
                    // alcanzar desplazando. Si el contenido fuera más alto que
                    // su visor y el panel NO desplazara, habría campos
                    // inalcanzables — que es lo que pasaba antes.
                    v.Size = v.MinimumSize;
                    foreach (var sc in scrolls)
                    {
                        if (sc.Controls.Count == 0) continue;
                        var contenido = sc.Controls[0];
                        var cabe = contenido.Height <= sc.ClientSize.Height;
                        Afirmar("al tamaño mínimo, «" + (sc.Parent != null ? sc.Parent.Text : "?") +
                                "» cabe o se puede desplazar", cabe || sc.AutoScroll);
                    }

                    var pie = v.Controls.OfType<Panel>().FirstOrDefault(x => x.Dock == DockStyle.Bottom);
                    Afirmar("hay un pie", pie != null);
                    if (pie == null) return;

                    // Con Dock, el orden en que se agregan decide quién come
                    // espacio de quién. Si el pie y las pestañas se solaparan,
                    // Guardar quedaría tapado y no habría forma de saberlo sin
                    // abrir la ventana.
                    Afirmar("el pie no se solapa con las pestañas",
                        pestanas == null || pestanas.Bottom <= pie.Top);
                    Afirmar("y el pie llega al borde inferior del área de cliente",
                        pie.Bottom >= v.ClientSize.Height - 1);

                    var botones = pie.Controls.OfType<Button>().ToList();
                    Afirmar("están los botones de la vía equipo",
                        botones.Any(b => b.Text.StartsWith("Probar equipo", StringComparison.Ordinal)) &&
                        botones.Any(b => b.Text.StartsWith("Vaciar memoria", StringComparison.Ordinal)));
                    Afirmar("y Guardar y Cancelar",
                        botones.Any(b => b.Text == "Guardar") && botones.Any(b => b.Text == "Cancelar"));
                    Afirmar("y el que lleva a las bitácoras", botones.Any(b => b.Text == "Abrir bitácoras"));

                    var lectores = Todos(v).OfType<TextBox>().FirstOrDefault(t => t.ReadOnly && t.Multiline &&
                        t.Text.Contains("AHID222860036"));
                    Afirmar("la lista de lectores guardados se ve, con su serie", lectores != null);
                    Afirmar("y dice que vienen de ZKAccess",
                        lectores != null && lectores.Text.Contains("De ZKAccess"));
                    Afirmar("está la casilla de la vía Access",
                        Todos(v).OfType<CheckBox>().Any(x => x.Text.StartsWith("Sincronizar desde el Access.mdb", StringComparison.Ordinal) && x.Checked));
                    Afirmar("y los botones de lectores a mano",
                        Todos(v).OfType<Button>().Any(b => b.Text == "Agregar lector") &&
                        Todos(v).OfType<Button>().Any(b => b.Text.StartsWith("Importar de config.json", StringComparison.Ordinal)));

                    // Ancho generoso: los tres botones de prueba en un renglón.
                    v.ClientSize = new Size(700, 460);
                    var altoAncho = pie.Height;
                    var pruebaAncho = botones
                        .Where(b => b.Text != "Guardar" && b.Text != "Cancelar")
                        .Select(b => b.Top).Distinct().Count();
                    Afirmar("con sitio, los botones de prueba van en un solo renglón", pruebaAncho == 1);

                    // Y ahora angosta, al mínimo: tienen que ENVOLVER, no
                    // salirse. Esto es exactamente lo que fallaba antes.
                    v.ClientSize = new Size(470, 330);
                    Afirmar("al angostar, los botones envuelven a otro renglón",
                        botones.Where(b => b.Text != "Guardar" && b.Text != "Cancelar")
                            .Select(b => b.Top).Distinct().Count() > 1);
                    Afirmar("y el pie crece para alojarlos", pie.Height > altoAncho);
                    Afirmar("ningún botón del pie se sale por los lados",
                        botones.All(b => b.Left >= 0 && b.Right <= pie.ClientSize.Width));
                    Afirmar("ni por abajo: todos quedan dentro del pie",
                        botones.All(b => b.Top >= 0 && b.Bottom <= pie.Height));

                    var guardar = botones.First(b => b.Text == "Guardar");
                    var ultimaPrueba = botones
                        .Where(b => b.Text != "Guardar" && b.Text != "Cancelar")
                        .Max(b => b.Bottom);
                    Afirmar("Guardar queda por debajo de los botones de prueba, sin solaparse",
                        guardar.Top >= ultimaPrueba);

                    // Un error largo del servidor no puede comerse Guardar.
                    var antesDelError = pie.Height;
                    v.GetType()
                        .GetMethod("Decir", System.Reflection.BindingFlags.Instance |
                                            System.Reflection.BindingFlags.NonPublic)
                        .Invoke(v, new object[]
                        {
                            "HTTP 400: marcaciones[137]: «momento» no es una fecha y hora válida. " +
                            "El servidor rechazó el lote completo; el detalle dice qué fila está mal.",
                            false,
                        });
                    Afirmar("un mensaje de error largo agranda el pie en vez de tapar los botones",
                        pie.Height > antesDelError);
                    Afirmar("y Guardar sigue dentro del pie",
                        guardar.Bottom <= pie.Height && guardar.Right <= pie.ClientSize.Width);
                }
            }
            catch (Exception e)
            {
                Afirmar("Configuración se construye (" + e.Message + ")", false);
            }

            // El PC sin ZKAccess: la vía Access apagada deja la base sin tocar.
            try
            {
                var otroPc = new Configuracion
                {
                    Url = "https://ejemplo", Mdb = "C:\\no-existe.mdb",
                    ViaAccessHabilitada = false, EquipoHabilitado = true,
                }.ConValoresSanos();
                using (var v = new App.FormConfiguracion(otroPc, () => { }, () => equipo,
                           (id, contar) => System.Threading.Tasks.Task.FromResult("")))
                {
                    var mdb = Todos(v).OfType<TextBox>().FirstOrDefault(t => t.Text == "C:\\no-existe.mdb");
                    Afirmar("sin vía Access, la ruta de la base queda deshabilitada",
                        mdb != null && !mdb.Enabled);
                    var examinar = Todos(v).OfType<Button>().FirstOrDefault(b => b.Text == "Examinar…");
                    Afirmar("y su botón Examinar también", examinar != null && !examinar.Enabled);
                    Afirmar("y la lista invita a agregar o importar un lector",
                        Todos(v).OfType<TextBox>().Any(t => t.ReadOnly && t.Text.Contains("importe")));
                    Afirmar("el lector a mano viene con la IP de la portería, editable",
                        Todos(v).OfType<TextBox>().Any(t => t.Text == "192.168.0.253" && !t.ReadOnly && t.Enabled));
                    Afirmar("y con puerto 4370 y número 1",
                        Todos(v).OfType<NumericUpDown>().Any(n => n.Value == 4370) &&
                        Todos(v).OfType<NumericUpDown>().Any(n => n.Value == 1 && n.Maximum == 255));
                }
            }
            catch (Exception e)
            {
                Afirmar("Configuración sin vía Access se construye (" + e.Message + ")", false);
            }

            try
            {
                using (var v = new App.FormEstado(() => new Sincronizacion.EstadoAgente(),
                           () => equipo, () => cfg,
                           () => System.Threading.Tasks.Task.FromResult(0), () => { }))
                {
                    Afirmar("Estado se construye", true);
                    var trab = Screen.PrimaryScreen.WorkingArea;
                    Afirmar("Estado cabe en la pantalla",
                        v.Width <= trab.Width && v.Height <= trab.Height);
                    Afirmar("y su mínimo cabe en 1024x600",
                        v.MinimumSize.Width <= 1024 - 40 && v.MinimumSize.Height <= 600 - 40);
                    // El bloque del equipo tiene que estar visible en el
                    // resumen: es lo que se mira cuando no entran huellas.
                    var resumen = v.Controls.OfType<Control>()
                        .SelectMany(Todos).OfType<TextBox>()
                        .Select(t => t.Text).FirstOrDefault(t => t.Contains("Lectura directa"));
                    Afirmar("el resumen incluye el bloque del equipo", resumen != null);
                    Afirmar("y nombra el lector", resumen != null && resumen.Contains("AHID222860036"));
                    Afirmar("y dice que está conectado", resumen != null && resumen.Contains("conectado"));
                }
            }
            catch (Exception e)
            {
                Afirmar("Estado se construye (" + e.Message + ")", false);
            }

            try
            {
                using (var v = new App.FormDiagnosticoEquipo(
                           () => new List<EquipoConfigurado>(), () => cfg, _ => { }, () => { }))
                {
                    Afirmar("Probar equipo se construye", true);
                    var trab2 = Screen.PrimaryScreen.WorkingArea;
                    Afirmar("Probar equipo cabe en la pantalla",
                        v.Width <= trab2.Width && v.Height <= trab2.Height);
                    Afirmar("y su mínimo cabe en 1024x600",
                        v.MinimumSize.Width <= 1024 - 40 && v.MinimumSize.Height <= 600 - 40);
                    Afirmar("sin lectores, la ventana no deja ejecutar",
                        v.Controls.OfType<Panel>().SelectMany(pa => pa.Controls.OfType<Button>())
                            .Where(b => b.Text == "Ejecutar").All(b => !b.Enabled));
                }
            }
            catch (Exception e)
            {
                Afirmar("Probar equipo se construye (" + e.Message + ")", false);
            }
        }

        private static IEnumerable<Control> Todos(Control c)
        {
            yield return c;
            foreach (var h in c.Controls.OfType<Control>())
                foreach (var n in Todos(h))
                    yield return n;
        }

        /// <summary>
        /// Contra un `Access.mdb` de verdad, si se le pasa la ruta:
        /// `--autopruebas "C:\ZKTeco\ZKAccess3.5\Access.mdb"`.
        ///
        /// Lo demás de este archivo es lógica pura; esto es lo único que toca
        /// datos reales, y hace falta porque `LeerEquipos` consulta un esquema
        /// que es de ZKAccess y no nuestro: si un día cambia una columna, esta
        /// prueba lo dice en un segundo en vez de que la vía equipo se quede
        /// callada sin lectores.
        ///
        /// Solo LEE, igual que el agente.
        /// </summary>
        private static void LecturaDeLaBase(string mdb)
        {
            Console.WriteLine("LectorZk.LeerEquipos  (contra " + mdb + ")");

            if (!System.IO.File.Exists(mdb))
            {
                Afirmar("la base existe en esa ruta", false);
                return;
            }

            try
            {
                var proveedor = Datos.Proveedor.Resolver(null);
                Console.WriteLine("  (proveedor: " + proveedor + ")");

                using (var lector = new Datos.LectorZk(proveedor, mdb, null))
                {
                    var filas = lector.LeerEquipos();
                    Afirmar("la tabla Machines se lee y tiene al menos un lector", filas.Count > 0);
                    foreach (var e in filas)
                        Console.WriteLine("       " + e + " · numero " + e.Numero +
                                          " · tipo " + e.TipoConexion +
                                          " · " + (e.Habilitado ? "habilitado" : "deshabilitado") +
                                          " · usable " + (e.EsUsable ? "sí" : "no"));

                    Afirmar("todos traen Id", filas.All(e => e.Id > 0));
                    Afirmar("el número de equipo del SDK nunca es 0", filas.All(e => e.Numero > 0));
                    Afirmar("los de red traen IP y puerto",
                        filas.Where(e => e.TipoConexion == 1).All(e =>
                            !string.IsNullOrWhiteSpace(e.Ip) && e.Puerto > 0));

                    // La serie no está en `Machines`: se deduce del histórico. Sin
                    // ella no se puede preguntar al servidor hasta dónde llegó
                    // este lector y habría que leer la memoria completa.
                    var usables = ListaEquipos.Usables(filas);
                    Afirmar("hay al menos un lector usable", usables.Count > 0);
                    Afirmar("los usables traen número de serie (de la columna sn, o del histórico)",
                        usables.All(e => !string.IsNullOrWhiteSpace(e.Sn)));
                    Afirmar("y el número de equipo del SDK sale de MachineNumber",
                        usables.All(e => e.Numero > 0));

                    // Lo que costó una tarde entender: ZKAccess dice con qué SDK
                    // le habla a cada lector, y hay que respetarlo. A un lector
                    // pull se le puede conectar con el SDK clásico y responder a
                    // los comandos simples, pero toda lectura de registros falla
                    // con -101 porque traduce la consulta mal.
                    foreach (var e in usables)
                        Console.WriteLine("       " + e.Nombre + ": DevSDKType=" + e.TipoSdk +
                                          " -> vía " + FabricaEquipo.Nombre(e));
                    Afirmar("el SDK de cada lector se decide por DevSDKType de ZKAccess",
                        usables.All(e => FabricaEquipo.Nombre(e) ==
                                         (e.TipoSdk == FabricaEquipo.SdkStandalone ? "zkemkeeper" : "pull")));
                    Afirmar("y este lector resulta ser PULL, no el SDK clásico",
                        usables.Any(e => e.TipoSdk == FabricaEquipo.SdkPull),
                        "tipos: " + string.Join(", ", usables.Select(e => e.TipoSdk.ToString()).ToArray()));

                    var series = lector.LeerSeriesPorEquipo();
                    Afirmar("el histórico da la serie de al menos un device_id", series.Count > 0);
                    Console.WriteLine("       series por device_id: " +
                                      string.Join(", ", series.Select(kv => kv.Key + "=" + kv.Value)));

                    var personas = lector.LeerPersonas();
                    Afirmar("USERINFO se sigue leyendo igual", personas.Count > 0);

                    // «No vacío» NO sirve como medida: cuando no hay CardNo, el
                    // campo cae a SSN, y SSN trae el "0" de fábrica. Contarlo
                    // como identificación daría «todos tienen», que es falso.
                    // Se usa la misma regla del servidor: dígitos que no sean
                    // todos cero.
                    Func<string, bool> util = v => !string.IsNullOrWhiteSpace(v) &&
                                                   v.Trim().Trim('0').Length > 0;
                    var conIdent = personas.Count(p => util(p.identificacion));
                    Console.WriteLine("       personas: " + personas.Count +
                                      " · con identificación: " + conIdent +
                                      " · SIN ninguna: " + (personas.Count - conIdent) +
                                      "  (CardNo " + personas.Count(p => util(p.cardNo)) +
                                      " · SSN " + personas.Count(p => util(p.ssn)) + ")");

                    // Dos pines con la misma cédula = la misma persona enrolada
                    // dos veces. No rompe nada (el servidor resuelve los dos a
                    // la misma cédula), pero sus huellas quedan partidas entre
                    // dos pines y conviene depurarlo en ZKAccess.
                    var repetidas = personas.Where(p => util(p.identificacion))
                        .GroupBy(p => p.identificacion.Trim())
                        .Where(g => g.Count() > 1)
                        .ToList();
                    Console.WriteLine("       personas enroladas dos veces: " + repetidas.Count);
                    foreach (var g in repetidas.Take(15))
                        Console.WriteLine("         " + g.Key + " -> pines " +
                                          string.Join(", ", g.Select(p => p.pin)));

                    var maximo = lector.MaximoId();
                    Afirmar("acc_monitor_log se sigue leyendo igual", maximo > 0);
                    Console.WriteLine("       último id de marcación: " +
                                      maximo.ToString("N0", CultureInfo.GetCultureInfo("es-CO")));
                }
            }
            catch (Exception e)
            {
                Afirmar("la base se abre y se consulta sin error (" + e.Message + ")", false);
            }
        }

        // ── Utilidades ───────────────────────────────────────────────────────

        private static EquipoConfigurado Eq(int id, string alias, string sn, string ip, int puerto,
            bool habilitado, int tipo)
        {
            return new EquipoConfigurado
            {
                Id = id,
                Alias = alias,
                Sn = sn,
                Ip = ip,
                Puerto = puerto,
                Habilitado = habilitado,
                TipoConexion = tipo,
                Numero = 1,
            };
        }

        private static EventoEquipo Ev(string pin, int invalido, int metodo)
        {
            return new EventoEquipo
            {
                Pin = pin,
                EsInvalido = invalido,
                MetodoVerificacion = metodo,
                Estado = 0,
                Momento = new DateTime(2026, 10, 20, 6, 42, 10),
                RecibidoAt = DateTimeOffset.Now,
                Fuente = FuenteEvento.TiempoReal,
            };
        }

        /// <summary>
        /// Una comprobación. El <paramref name="detalle"/> se imprime solo
        /// cuando FALLA: en verde estorba, y cuando falla es justo lo que hace
        /// falta para no tener que volver a correr nada.
        /// </summary>
        private static void Afirmar(string que, bool bien, string detalle = null)
        {
            _total++;
            if (bien)
            {
                Console.WriteLine("  ok   " + que);
                return;
            }
            _fallos++;
            Console.WriteLine("  MAL  " + que + (string.IsNullOrEmpty(detalle) ? "" : "  ·  " + detalle));
        }
    }
}
