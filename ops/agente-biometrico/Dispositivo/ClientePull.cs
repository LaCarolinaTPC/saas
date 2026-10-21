using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Gestivo.AgenteBiometrico.Nucleo;

namespace Gestivo.AgenteBiometrico.Dispositivo
{
    /// <summary>
    /// El lector por el SDK **PULL** de ZK (`plcommpro.dll`).
    ///
    /// ## Por qué este y no `zkemkeeper`
    ///
    /// `Machines.DevSDKType` vale **1** para este lector, y el enum `SDKType` de
    /// ZKAccess dice `1 = PullSDK` (`2 = StandaloneSDK`). O sea ZKAccess le habla
    /// por el pull, no por el SDK clásico. Intentar leerlo con las llamadas
    /// standalone (`ReadAllGLogData` y compañía) devuelve siempre **-101**, que en
    /// la tabla de errores de ZKAccess significa «el campo de condición no existe
    /// en la tabla»: era una consulta mal formada, no un problema del equipo.
    ///
    /// ## Lo que se midió contra el equipo (2026-10-20)
    ///
    ///   · `Connect` tarda **0,3 s** (por zkemkeeper tardaba 12);
    ///   · `GetDeviceDataCount("transaction")` → 94.945;
    ///   · la descarga completa son **94.945 filas en 29 s**;
    ///   · `GetRTLog` entrega los sucesos en vivo;
    ///   · el filtrado funciona (`Pin=332` → 777 filas en 3,5 s) y `Time_second`
    ///     es un campo válido, pero **el operador de rango no**: el parser del
    ///     filtro corta en el primer `=`, así que `Time_second&gt;=X` le deja el
    ///     campo como `Time_second&gt;` y responde -101. Por eso la puesta al día
    ///     descarga todo y recorta aquí.
    ///
    /// ## Es mucho más simple que el COM
    ///
    /// Una API C plana: no hay interop, ni registro, ni hilo STA con bucle de
    /// mensajes. Lo único que hay que cuidar es que el handle no se use desde dos
    /// hilos a la vez, de ahí el candado.
    ///
    /// SOLO LECTURA, con una única excepción declarada: <see cref="Vaciar"/>.
    /// </summary>
    public sealed class ClientePull : IEquipoZk
    {
        private const string DLL = "plcommpro.dll";

        /// <summary>
        /// 16 MB. La tabla completa son ~95.000 filas de texto (unos 3 MB), y el
        /// SDK devuelve -106 («desbordamiento: más de 4 MB») si no cabe, así que
        /// se da holgura. Solo se reserva durante la descarga.
        /// </summary>
        private const int TamBuferTabla = 16 * 1024 * 1024;

        private const int TamBuferVivo = 64 * 1024;
        private const int TamBuferParam = 8 * 1024;

        /// <summary>Cada cuánto se le pregunta al equipo por lo que acaba de pasar.</summary>
        private static readonly TimeSpan CadaSondeo = TimeSpan.FromSeconds(1);

        // ── La API del SDK pull ──────────────────────────────────────────────
        // Winapi (= StdCall) y Ansi: así las declara ZKAccess en su clase
        // DevComm, comprobado en su IL.

        [DllImport(DLL, CallingConvention = CallingConvention.Winapi, CharSet = CharSet.Ansi,
            EntryPoint = "Connect")]
        private static extern IntPtr SdkConectar(string parametros);

        [DllImport(DLL, CallingConvention = CallingConvention.Winapi, EntryPoint = "Disconnect")]
        private static extern void SdkDesconectar(IntPtr h);

        [DllImport(DLL, CallingConvention = CallingConvention.Winapi, CharSet = CharSet.Ansi,
            EntryPoint = "GetDeviceData")]
        private static extern int SdkLeerTabla(IntPtr h, byte[] bufer, int tamBufer,
            string tabla, string campos, string filtro, string opciones);

        [DllImport(DLL, CallingConvention = CallingConvention.Winapi, CharSet = CharSet.Ansi,
            EntryPoint = "GetDeviceDataCount")]
        private static extern int SdkContar(IntPtr h, string tabla, string filtro, string opciones);

        [DllImport(DLL, CallingConvention = CallingConvention.Winapi, EntryPoint = "GetRTLog")]
        private static extern int SdkLeerEnVivo(IntPtr h, byte[] bufer, int tamBufer);

        [DllImport(DLL, CallingConvention = CallingConvention.Winapi, EntryPoint = "PullLastError")]
        private static extern int SdkUltimoError();

        [DllImport(DLL, CallingConvention = CallingConvention.Winapi, CharSet = CharSet.Ansi,
            EntryPoint = "GetDeviceParam")]
        private static extern int SdkLeerParametros(IntPtr h, byte[] bufer, int tamBufer, string nombres);

        [DllImport(DLL, CallingConvention = CallingConvention.Winapi, CharSet = CharSet.Ansi,
            EntryPoint = "DeleteDeviceData")]
        private static extern int SdkBorrarTabla(IntPtr h, string tabla, string datos, string opciones);

        // ── Estado ───────────────────────────────────────────────────────────

        private readonly string _nombre;

        /// <summary>
        /// El handle del SDK no es seguro entre hilos, y aquí concurren el
        /// sondeo de tiempo real, el latido y las descargas.
        /// </summary>
        private readonly object _candado = new object();

        private IntPtr _h = IntPtr.Zero;
        private CancellationTokenSource _pararSondeo;
        private Task _sondeo;

        public ClientePull(string nombre)
        {
            _nombre = string.IsNullOrWhiteSpace(nombre) ? "equipo" : nombre;
        }

        public bool Conectado
        {
            get { lock (_candado) return _h != IntPtr.Zero; }
        }

        public event Action<EventoEquipo> Evento;
        public event Action Desconectado;

        /// <summary>
        /// ¿Está `plcommpro.dll` a mano? Windows la busca primero en la carpeta
        /// del .exe —donde la deja `publicar.cmd`, que es lo que permite correr
        /// el agente en otro PC— y después en `SysWOW64`, donde la instala
        /// ZKAccess. Las otras cuatro (`plcomms`, `pltcpcomm`…) las carga ella por
        /// nombre, con el mismo orden.
        /// Se comprueba de verdad, llamando: si falta, `P/Invoke` lanza
        /// `DllNotFoundException` y aquí se traduce a un «no».
        /// </summary>
        public bool SdkDisponible
        {
            get
            {
                try
                {
                    // Sobre un handle nulo: no toca ningún equipo, solo obliga a
                    // cargar la DLL.
                    SdkUltimoError();
                    return true;
                }
                catch (DllNotFoundException)
                {
                    return false;
                }
                catch (Exception)
                {
                    // Cargó pero algo más falló: la DLL está, que es lo que se
                    // pregunta.
                    return true;
                }
            }
        }

        // ── Conexión ─────────────────────────────────────────────────────────

        public Task<InfoEquipo> Conectar(string ip, int puerto, int numero, int? claveComm)
        {
            return Task.Run(() =>
            {
                lock (_candado)
                {
                    if (_h != IntPtr.Zero) CerrarSinCandado();

                    // El formato es el de ZKAccess, tomado de su IL:
                    //   protocol=TCP,ipaddress={0},port={1},timeout={2},passwd={3}
                    var parametros =
                        "protocol=TCP,ipaddress=" + ip +
                        ",port=" + puerto.ToString(CultureInfo.InvariantCulture) +
                        ",timeout=4000,passwd=" +
                        (claveComm.HasValue && claveComm.Value != 0
                            ? claveComm.Value.ToString(CultureInfo.InvariantCulture)
                            : "");

                    var reloj = Stopwatch.StartNew();
                    IntPtr h;
                    try
                    {
                        h = SdkConectar(parametros);
                    }
                    catch (DllNotFoundException)
                    {
                        throw new InvalidOperationException(
                            "No se encontró plcommpro.dll, que es el SDK con el que este lector " +
                            "se comunica. En el PC de ZKAccess está en C:\\Windows\\SysWOW64; en otro PC " +
                            "tiene que estar junto al .exe del agente (publicar.cmd la deja ahí).");
                    }
                    reloj.Stop();

                    if (h == IntPtr.Zero)
                        throw new InvalidOperationException(
                            ErroresPull.Conexion(SdkUltimoError(), ip, puerto));

                    _h = h;
                    Bitacora.Info("Lector «" + _nombre + "» conectado por el SDK pull en " +
                                  reloj.ElapsedMilliseconds + " ms.");
                    return LeerInfoSinCandado(numero);
                }
            });
        }

        public Task Desconectar()
        {
            return Task.Run(() =>
            {
                PararSondeo();
                lock (_candado) CerrarSinCandado();
            });
        }

        private void CerrarSinCandado()
        {
            if (_h == IntPtr.Zero) return;
            try { SdkDesconectar(_h); }
            catch (Exception e) { Bitacora.Error("Fallo al desconectar del lector «" + _nombre + "»", e); }
            _h = IntPtr.Zero;
        }

        public void Dispose()
        {
            try { PararSondeo(); } catch { /* al cerrar no hay nada que reportar */ }
            lock (_candado)
            {
                try { CerrarSinCandado(); } catch { }
            }
        }

        // ── Lo que el equipo dice de sí mismo ────────────────────────────────

        public Task<InfoEquipo> Consultar(int numero)
        {
            return Task.Run(() =>
            {
                lock (_candado)
                {
                    ExigirConexion();
                    return LeerInfoSinCandado(numero);
                }
            });
        }

        private InfoEquipo LeerInfoSinCandado(int numero)
        {
            var info = new InfoEquipo();
            var bufer = new byte[TamBuferParam];

            var r = SdkLeerParametros(_h, bufer, bufer.Length,
                "~SerialNumber,~DeviceName,FirmVer,~Platform,~ProductTime,LockCount,~ZKFPVersion");
            if (r >= 0)
            {
                var p = TablaPull.Parametros(Cadena(bufer));
                foreach (var kv in p) info.Parametros[kv.Key] = kv.Value;
                info.Sn = Buscar(p, "~SerialNumber");
                info.Firmware = Buscar(p, "FirmVer");
                info.Plataforma = Buscar(p, "~Platform");
                info.VersionSdk = "pull (plcommpro)";
            }
            else
            {
                Bitacora.Aviso("El lector «" + _nombre + "» no entregó sus parámetros (" +
                               ErroresPull.Codigo(SdkUltimoError()) + ").");
            }

            // El conteo de la tabla es el dato que de verdad importa de la
            // memoria: el SDK pull lo da exacto y barato.
            var n = SdkContar(_h, "transaction", "", "");
            if (n >= 0) info.Registros = n;

            // La hora del equipo no viene en los parámetros; se deduce del
            // último registro, que es lo que hay. Si no hay registros, se deja
            // sin desfase en vez de inventarlo.
            info.HoraEquipo = null;
            info.Desfase = null;
            return info;
        }

        private static string Buscar(Dictionary<string, string> p, string clave)
        {
            string v;
            return p.TryGetValue(clave, out v) ? v : null;
        }

        /// <summary>Latido barato: pedir un parámetro suelto.</summary>
        public Task<bool> Ping(int numero)
        {
            return Task.Run(() =>
            {
                lock (_candado)
                {
                    if (_h == IntPtr.Zero) return false;
                    try
                    {
                        var bufer = new byte[256];
                        return SdkLeerParametros(_h, bufer, bufer.Length, "~SerialNumber") >= 0;
                    }
                    catch
                    {
                        return false;
                    }
                }
            });
        }

        // ── Tiempo real: sondeo, no eventos ──────────────────────────────────

        /// <summary>
        /// Arranca el sondeo de `GetRTLog`.
        ///
        /// El pull no entrega eventos por devolución de llamada: hay que
        /// preguntarle. Cada llamada devuelve lo ocurrido desde la anterior, así
        /// que sondear cada segundo da una latencia de un segundo — de sobra
        /// para lo que se pidió (un minuto) y mucho más simple que el COM, que
        /// exigía un hilo STA con bucle de mensajes.
        /// </summary>
        public Task<bool> RegistrarEventos(int numero)
        {
            PararSondeo();
            var cancelar = new CancellationTokenSource();
            _pararSondeo = cancelar;
            _sondeo = Task.Run(() => Sondear(cancelar.Token), cancelar.Token);
            return Task.FromResult(true);
        }

        private void PararSondeo()
        {
            var cancelar = _pararSondeo;
            var tarea = _sondeo;
            _pararSondeo = null;
            _sondeo = null;
            if (cancelar == null) return;
            try { cancelar.Cancel(); } catch { }
            try { tarea?.Wait(TimeSpan.FromSeconds(3)); } catch { }
            try { cancelar.Dispose(); } catch { }
        }

        private void Sondear(CancellationToken ct)
        {
            var bufer = new byte[TamBuferVivo];
            while (!ct.IsCancellationRequested)
            {
                try
                {
                    string texto = null;
                    lock (_candado)
                    {
                        if (_h == IntPtr.Zero) return;
                        var r = SdkLeerEnVivo(_h, bufer, bufer.Length);
                        if (r < 0)
                        {
                            // Perder el canal en vivo es motivo de reconexión: el
                            // coordinador lo hará al verlo desconectado.
                            Bitacora.Aviso("El lector «" + _nombre + "» cortó el canal en vivo (" +
                                           ErroresPull.Codigo(SdkUltimoError()) + ").");
                            CerrarSinCandado();
                            Avisar(Desconectado);
                            return;
                        }
                        texto = Cadena(bufer);
                    }

                    int ignorados;
                    foreach (var ev in TablaPull.EnVivo(texto, out ignorados))
                    {
                        var h = Evento;
                        if (h == null) continue;
                        try { h(ev); }
                        catch (Exception e) { Bitacora.Error("Fallo al entregar una huella en vivo", e); }
                    }
                }
                catch (Exception e)
                {
                    Bitacora.Error("Fallo en el sondeo del lector «" + _nombre + "»", e);
                }

                if (ct.WaitHandle.WaitOne(CadaSondeo)) return;
            }
        }

        private static void Avisar(Action h)
        {
            if (h == null) return;
            try { h(); }
            catch (Exception e) { Bitacora.Error("Fallo al avisar", e); }
        }

        // ── La memoria del equipo ────────────────────────────────────────────

        /// <summary>
        /// La tabla `transaction`, recortada a lo posterior a
        /// <paramref name="desde"/>.
        ///
        /// Se descarga COMPLETA y se recorta aquí, a propósito. El filtro del SDK
        /// funciona pero no admite rangos (ver el comentario de la clase), y el
        /// cursor de «solo los nuevos» —que sería lo más barato— **se comparte con
        /// ZKAccess**: usarlo le robaría los registros sin que nadie se entere.
        /// Son 29 s y solo al reconectar.
        ///
        /// <paramref name="desactivarAlLeer"/> se ignora: eso era del SDK
        /// standalone. Aquí no hay que desactivar el lector para descargar, que
        /// es una ventaja: la gente puede seguir entrando mientras.
        /// </summary>
        public Task<ResultadoLectura> LeerRegistros(int numero, DateTime? desde, CancellationToken ct,
            bool desactivarAlLeer = true)
        {
            return Task.Run(() =>
            {
                var reloj = Stopwatch.StartNew();
                string texto;
                lock (_candado)
                {
                    ExigirConexion();
                    var bufer = new byte[TamBuferTabla];
                    var r = SdkLeerTabla(_h, bufer, bufer.Length, "transaction", "*", "", "");
                    if (r < 0)
                        throw new InvalidOperationException(ErroresPull.Lectura(SdkUltimoError()));
                    texto = Cadena(bufer);
                }
                ct.ThrowIfCancellationRequested();

                int omitidas, ignorados;
                var todas = TablaPull.Transacciones(texto, out omitidas, out ignorados);
                var salida = new ResultadoLectura
                {
                    Metodo = desde.HasValue ? "completa, recortada" : "completa",
                    Leidos = todas.Count + ignorados + omitidas,
                    Ignorados = ignorados,
                };
                salida.Eventos.AddRange(desde.HasValue
                    ? todas.Where(e => e.Momento >= desde.Value)
                    : todas);
                reloj.Stop();
                salida.Duracion = reloj.Elapsed;

                if (omitidas > 0)
                    Bitacora.Aviso("Lector «" + _nombre + "»: " + omitidas +
                                   " fila(s) de la tabla no se pudieron interpretar y se omiten.");
                // Info y no Aviso: son normales y pueden ser miles.
                if (ignorados > 0)
                    Bitacora.Info("Lector «" + _nombre + "»: " + ignorados +
                                  " fila(s) no son huellas de alguien (event_type distinto de 14 o pin 0) y no se mandan.");
                return salida;
            }, ct);
        }

        /// <summary>
        /// Borra la tabla de transacciones del equipo.
        ///
        /// Nunca se llama sola: la dispara el botón «Vaciar memoria del
        /// equipo…», que antes confirma con una persona Y comprueba que Gestivo
        /// recibió todo. Ver <c>TiempoReal.VaciarMemoria</c>.
        /// </summary>
        public Task<bool> Vaciar(int numero)
        {
            return Task.Run(() =>
            {
                lock (_candado)
                {
                    ExigirConexion();
                    Bitacora.Aviso("Lector «" + _nombre + "»: se va a VACIAR la tabla de transacciones.");
                    var r = SdkBorrarTabla(_h, "transaction", "", "");
                    if (r < 0)
                    {
                        Bitacora.Error("No se pudo vaciar la memoria del lector «" + _nombre + "»: " +
                                       ErroresPull.Codigo(SdkUltimoError()), null);
                        return false;
                    }
                    Bitacora.Info("Memoria del lector «" + _nombre + "» vaciada.");
                    return true;
                }
            });
        }

        // ── Utilidades ───────────────────────────────────────────────────────

        private void ExigirConexion()
        {
            if (_h == IntPtr.Zero)
                throw new InvalidOperationException("El lector «" + _nombre + "» no está conectado.");
        }

        /// <summary>
        /// El SDK escribe texto terminado en cero dentro del búfer. Se corta ahí
        /// y no se convierte el búfer entero: son 16 MB.
        /// </summary>
        private static string Cadena(byte[] bufer)
        {
            var fin = Array.IndexOf(bufer, (byte)0);
            if (fin < 0) fin = bufer.Length;
            return Encoding.Default.GetString(bufer, 0, fin);
        }

        /// <summary>
        /// «Probar equipo…» por la vía pull.
        ///
        /// A diferencia del diagnóstico del SDK standalone, este **resuelve el
        /// método de verificación sin que nadie toque el sensor**: la descarga
        /// funciona, así que el histograma de `Verified` sale de los 94.945
        /// registros que el equipo ya tiene.
        ///
        /// <paramref name="permitirDesactivar"/> se ignora: por esta vía no hay
        /// que desactivar el lector para descargar.
        /// </summary>
        public async Task Diagnosticar(EquipoConfigurado equipo, int? claveComm, int numero,
            bool permitirDesactivar, Action<string> escribir, CancellationToken ct)
        {
            Action<string> decir = texto =>
            {
                if (escribir != null) escribir(texto);
                Bitacora.Info("DIAG " + texto);
            };
            var co = CultureInfo.GetCultureInfo("es-CO");

            decir("=== Diagnóstico del lector «" + equipo.Nombre + "» (" + equipo.Enlace + ") ===");
            decir("Vía: SDK PULL (plcommpro), que es la que usa ZKAccess con este equipo");
            decir("     (Machines.DevSDKType = 1 = PullSDK).");
            decir("Fecha: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture));
            decir("");

            if (!SdkDisponible)
            {
                decir("1. plcommpro.dll NO está disponible en este PC.");
                decir("   Son seis: plcommpro, plcomms, pltcpcomm, plrscomm, plrscagent y plusbcomm.");
                decir("   En el PC de ZKAccess viven en C:\\Windows\\SysWOW64; en otro PC van");
                decir("   junto al .exe del agente (publicar.cmd las copia ahí).");
                return;
            }
            decir("1. plcommpro.dll: disponible.");

            var vigilante = new VigilanteZkAccess("Access");
            decir("2. ZKAccess abierto en ESTE PC: " + (vigilante.Revisar() ? "SÍ" : "no") +
                  "  (solo se ven los procesos locales; por esta vía no estorba:");
            decir("   el equipo admite varias sesiones)");

            InfoEquipo info;
            var reloj = Stopwatch.StartNew();
            try
            {
                info = await Conectar(equipo.Ip, equipo.Puerto, numero, claveComm).ConfigureAwait(false);
                reloj.Stop();
                decir("3. Conexión: OK en " + reloj.ElapsedMilliseconds + " ms.");
            }
            catch (Exception e)
            {
                reloj.Stop();
                decir("3. Conexión: FALLÓ tras " + reloj.ElapsedMilliseconds + " ms.");
                decir("   " + e.Message);
                return;
            }

            try
            {
                decir("4. Lo que dice el equipo de sí mismo");
                foreach (var kv in info.Parametros) decir("   " + kv.Key.PadRight(16) + " = " + kv.Value);
                if (!string.IsNullOrEmpty(info.Sn) && !string.IsNullOrEmpty(equipo.Sn))
                    decir("   serie " + (string.Equals(info.Sn, equipo.Sn, StringComparison.OrdinalIgnoreCase)
                        ? "coincide con ZKAccess"
                        : "DISTINTA de la de ZKAccess (" + equipo.Sn + "); manda la del equipo"));

                decir("5. Memoria: " + (info.Registros.HasValue
                    ? info.Registros.Value.ToString("N0", co) + " transacciones"
                    : "no la reportó"));
                if (info.MemoriaCasiLlena)
                    decir("   AVISO: por encima del 80 %. Ver «Vaciar memoria del equipo…».");

                decir("6. Descarga de la tabla (puede tardar; no desactiva el lector)");
                var lectura = await LeerRegistros(numero, null, ct).ConfigureAwait(false);
                decir("   " + lectura.Resumen());

                if (lectura.Eventos.Count > 0)
                {
                    var orden = lectura.Eventos.OrderBy(x => x.Momento).ToList();
                    decir("   Del " + orden[0].Momento.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture) +
                          " al " + orden[orden.Count - 1].Momento.ToString("yyyy-MM-dd HH:mm",
                              CultureInfo.InvariantCulture));
                    decir("   Por método de verificación («Verified»): " +
                          string.Join(", ", lectura.Eventos.GroupBy(x => x.MetodoVerificacion)
                              .OrderByDescending(g => g.Count())
                              .Select(g => g.Key + "=" + g.Count().ToString("N0", co))));
                    decir("   Descartadas por no ser huellas de alguien (event_type distinto de 14");
                    decir("   o pin 0): " + lectura.Ignorados.ToString("N0", co));
                    decir("   -> (d) RESUELTA sin tocar el sensor: el método con más registros es");
                    decir("      el que usa la gente, y 6 es lo que ZKAccess llama huella.");
                    decir("   Últimas tres, para cotejar con ZKAccess:");
                    foreach (var e in lectura.Eventos.OrderByDescending(x => x.Momento).Take(3))
                        decir("     " + e);

                    // El reloj del equipo, deducido del registro más reciente.
                    var ultima = lectura.Eventos.Max(x => x.Momento);
                    decir("   Última marcación: " +
                          ultima.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) +
                          "  ·  ahora en el PC: " +
                          DateTime.Now.ToString("HH:mm:ss", CultureInfo.InvariantCulture));
                }

                decir("7. Tiempo real (GetRTLog), 30 s. No hace falta poner el dedo:");
                decir("   si alguien pasa, sale aquí; si no, igual se ve que el canal responde.");
                var vistas = 0;
                var sucesos = 0;
                Action<EventoEquipo> anotar = ev =>
                {
                    vistas++;
                    decir("   HUELLA EN VIVO " + ev);
                };
                Evento += anotar;
                try
                {
                    await RegistrarEventos(numero).ConfigureAwait(false);
                    for (var i = 0; i < 30 && !ct.IsCancellationRequested; i++)
                    {
                        await Task.Delay(1000, ct).ConfigureAwait(false);
                        sucesos++;
                    }
                }
                finally
                {
                    Evento -= anotar;
                }
                decir("   huellas en vivo durante la prueba: " + vistas);
                decir("   (los sucesos de puerta se descartan a propósito: llegan cada segundo y");
                decir("    mandarlos como huellas inventaría presencias)");

                decir("");
                decir("=== Resumen ===");
                decir("conexión            " + reloj.ElapsedMilliseconds + " ms");
                decir("memoria             " + (info.Registros.HasValue
                    ? info.Registros.Value.ToString("N0", co)
                    : "?"));
                decir("descarga completa   " + lectura.Resumen());
                decir("huellas en vivo     " + vistas + " en 30 s");
            }
            finally
            {
                await Desconectar().ConfigureAwait(false);
                decir("Desconectado.");
            }
        }
    }
}
