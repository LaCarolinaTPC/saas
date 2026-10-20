using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Windows.Forms;
using Gestivo.AgenteBiometrico.Dispositivo;
using Gestivo.AgenteBiometrico.Nucleo;
using Gestivo.AgenteBiometrico.Red;

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
            ValoresSanosDeConfiguracion();
            FechasDelServidor();
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
                    // Lo que falló aquí una vez: que el alto calculado no
                    // alcanzara para el pie, dejando Guardar fuera de la vista.
                    Afirmar("Configuración tiene un alto utilizable", v.ClientSize.Height > 300);
                    Afirmar("y cabe el pie de botones", v.ClientSize.Height > 118 + 100);
                    var botones = v.Controls.OfType<Panel>()
                        .SelectMany(pa => pa.Controls.OfType<Button>()).ToList();
                    Afirmar("están los botones de la vía equipo",
                        botones.Any(b => b.Text.StartsWith("Probar equipo", StringComparison.Ordinal)) &&
                        botones.Any(b => b.Text.StartsWith("Vaciar memoria", StringComparison.Ordinal)));
                    Afirmar("ningún botón del pie se sale a la izquierda",
                        botones.All(b => b.Left >= 0));
                }
            }
            catch (Exception e)
            {
                Afirmar("Configuración se construye (" + e.Message + ")", false);
            }

            try
            {
                using (var v = new App.FormEstado(() => new Sincronizacion.EstadoAgente(),
                           () => equipo, () => cfg,
                           () => System.Threading.Tasks.Task.FromResult(0), () => { }))
                {
                    Afirmar("Estado se construye", true);
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
                    Afirmar("los usables traen número de serie deducido del histórico",
                        usables.All(e => !string.IsNullOrWhiteSpace(e.Sn)));

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

        private static void Afirmar(string que, bool bien)
        {
            _total++;
            if (bien)
            {
                Console.WriteLine("  ok   " + que);
                return;
            }
            _fallos++;
            Console.WriteLine("  MAL  " + que);
        }
    }
}
