using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Gestivo.AgenteBiometrico.Nucleo;
using zkemkeeper;

namespace Gestivo.AgenteBiometrico.Dispositivo
{
    /// <summary>
    /// El lector, por el SDK clásico de ZK (`zkemkeeper`, COM de 32 bits).
    ///
    /// Este archivo se compila SOLO si existe `Lib\Interop.zkemkeeper.dll`; si
    /// no, el .csproj compila `ClienteZk.SinSdk.cs` en su lugar. Ver el README.
    ///
    /// ## Por qué un hilo propio
    ///
    /// El COM entrega los eventos (`OnAttTransactionEx`) al hilo que creó el
    /// objeto, por puntos de conexión, y ese hilo tiene que estar bombeando
    /// mensajes para recibirlos. Si el objeto se creara en el hilo de la
    /// interfaz, una lectura de la memoria del equipo —que puede tardar
    /// minutos— congelaría la ventana; y si se creara en un hilo del pool, los
    /// eventos no llegarían nunca. Así que: un hilo STA propio, con su bucle de
    /// mensajes, dueño del objeto COM de principio a fin. Todo lo público de
    /// esta clase devuelve `Task` porque por dentro cruza a ese hilo.
    ///
    /// ## Solo lectura
    ///
    /// Ningún método cambia nada en el equipo —ni la hora, ni los usuarios, ni
    /// `EnableDevice`—, con una única excepción declarada: <see cref="Vaciar"/>,
    /// que borra los registros y solo se llama cuando una persona lo confirma.
    ///
    /// ## Lo que se midió del SDK de ESTA instalación
    ///
    /// Las firmas de abajo no son suposiciones: salen de reflexionar
    /// `Interop.zkemkeeper.dll` de `C:\ZKTeco\ZKAccess3.5` (2026-10-20), que es
    /// el interop que ZKTeco generó de su propio SDK y el que lleva años
    /// hablando con este MA500. Tres hallazgos que cambiaron el plan:
    ///
    ///   · `ReadTimeGLogData` y `ReadNewGLogData` NO EXISTEN. La lectura por
    ///     fecha de este SDK se llama **`ReadLastestLogData`** y sí está.
    ///   · No hay borrado por fecha: `ClearGLog` borra todo el log y punto. Lo
    ///     único con rango de fechas es `ClearPhotoByTime`, que es de fotos.
    ///   · Los parámetros de salida están MEZCLADOS entre `out` y `ref` dentro
    ///     de una misma llamada, según lleven `[Out]` solo o `[In][Out]`. Caso
    ///     extremo: `SSR_GetGeneralLogData` tiene nueve `out` y un `ref` (el
    ///     último, `dwWorkCode`). No se puede uniformar «a ojo»: cada llamada
    ///     de abajo está como la declara el interop, y cambiarla no compila.
    /// </summary>
    public sealed class ClienteZk : IEquipoZk
    {
        /// <summary>Todos los eventos del equipo. Es el valor que usa el SDK para «todo».</summary>
        private const int TodosLosEventos = 65535;

        /// <summary>`GetDeviceStatus`: la guía del SDK llama al 6 «cantidad de registros nuevos».</summary>
        private const int ContadorRegistros = 6;

        private readonly string _nombre;
        private readonly object _candado = new object();

        private Thread _hilo;
        private Control _bomba;
        private CZKEMClass _zk;
        private volatile bool _conectado;
        private volatile bool _cerrando;

        public ClienteZk(string nombre)
        {
            _nombre = string.IsNullOrWhiteSpace(nombre) ? "equipo" : nombre;
        }

        public bool SdkDisponible { get { return true; } }
        public bool Conectado { get { return _conectado; } }

        public event Action<EventoEquipo> Evento;
        public event Action Desconectado;

        // ── El hilo STA ──────────────────────────────────────────────────────

        /// <summary>
        /// Arranca el hilo dueño del COM, si no está ya. El `Control` oculto es
        /// la cola hacia ese hilo: su `BeginInvoke` es lo que permite pedirle
        /// cosas desde la interfaz o desde un temporizador.
        /// </summary>
        private void AsegurarHilo()
        {
            lock (_candado)
            {
                if (_hilo != null && _hilo.IsAlive && _bomba != null && !_bomba.IsDisposed) return;

                using (var listo = new ManualResetEventSlim(false))
                {
                    Exception falla = null;
                    _hilo = new Thread(() =>
                    {
                        try
                        {
                            var control = new Control();
                            // Leer .Handle fuerza la creación de la ventana, que
                            // es lo que hace falta para que BeginInvoke tenga a
                            // dónde mandar. Un Control sin padre no se ve.
                            var _ = control.Handle;
                            _bomba = control;
                            listo.Set();
                            // El bucle de mensajes: sin esto los eventos del
                            // COM no se entregan nunca.
                            Application.Run();
                        }
                        catch (Exception e)
                        {
                            falla = e;
                            listo.Set();
                        }
                    })
                    {
                        Name = "ZK " + _nombre,
                        IsBackground = true,
                    };
                    _hilo.SetApartmentState(ApartmentState.STA);
                    _hilo.Start();

                    if (!listo.Wait(TimeSpan.FromSeconds(10)))
                        throw new TimeoutException(
                            "El hilo de comunicación con el lector no arrancó en 10 s.");
                    if (falla != null)
                        throw new InvalidOperationException(
                            "No se pudo arrancar el hilo de comunicación con el lector: " + falla.Message,
                            falla);
                }
            }
        }

        /// <summary>Corre algo EN el hilo dueño del COM y espera su resultado.</summary>
        private Task<T> EnHilo<T>(Func<T> trabajo)
        {
            AsegurarHilo();
            var tcs = new TaskCompletionSource<T>();
            var bomba = _bomba;
            if (bomba == null || bomba.IsDisposed)
            {
                tcs.SetException(new InvalidOperationException(
                    "El hilo de comunicación con el lector ya se cerró."));
                return tcs.Task;
            }
            try
            {
                bomba.BeginInvoke((Action)(() =>
                {
                    try { tcs.TrySetResult(trabajo()); }
                    catch (Exception e) { tcs.TrySetException(e); }
                }));
            }
            catch (Exception e)
            {
                tcs.TrySetException(e);
            }
            return tcs.Task;
        }

        // ── Conexión ─────────────────────────────────────────────────────────

        public Task<InfoEquipo> Conectar(string ip, int puerto, int numero, int? claveComm)
        {
            return EnHilo(() =>
            {
                if (_zk == null)
                {
                    _zk = new CZKEMClass();
                    Suscribir(_zk);
                }

                // La clave de comunicación, si el equipo tiene una puesta. Va
                // ANTES de conectar: el SDK la manda en el saludo.
                if (claveComm.HasValue && claveComm.Value != 0)
                    _zk.SetCommPassword(claveComm.Value);

                if (!_zk.Connect_Net(ip, puerto))
                    throw new InvalidOperationException(ErroresSdk.Conexion(UltimoError(), ip, puerto));

                _conectado = true;
                return Leer(numero);
            });
        }

        private void Suscribir(CZKEMClass zk)
        {
            // Los dos: el firmware viejo puede emitir solo el `OnAttTransaction`
            // clásico (incógnita (f) del plan). Si emitiera los dos, la clave
            // natural los colapsa y no se duplica nada. Las firmas están
            // medidas: Ex trae el pin como string y el código de trabajo; el
            // clásico lo trae como entero y sin código.
            zk.OnAttTransactionEx += (enroll, invalido, estado, metodo, anio, mes, dia, hora, min, seg, trabajo) =>
                Recibir(enroll, invalido, estado, metodo, anio, mes, dia, hora, min, seg, trabajo);

            zk.OnAttTransaction += (enroll, invalido, estado, metodo, anio, mes, dia, hora, min, seg) =>
                Recibir(enroll.ToString(CultureInfo.InvariantCulture),
                    invalido, estado, metodo, anio, mes, dia, hora, min, seg, 0);

            zk.OnDisConnected += () =>
            {
                _conectado = false;
                if (_cerrando) return;
                Bitacora.Aviso("El lector «" + _nombre + "» cerró la conexión.");
                var h = Desconectado;
                if (h != null)
                {
                    try { h(); }
                    catch (Exception e) { Bitacora.Error("Fallo al avisar la desconexión", e); }
                }
            };
        }

        /// <summary>
        /// Lo único que hace un manejador de evento del COM: armar el dato y
        /// entregarlo. Con try/catch alrededor de TODO porque una excepción que
        /// escape de aquí sube al bucle de mensajes y tumba el hilo dueño del
        /// COM, y entonces no llegaría ni un evento más.
        /// </summary>
        private void Recibir(string enroll, int invalido, int estado, int metodo,
            int anio, int mes, int dia, int hora, int min, int seg, int trabajo)
        {
            try
            {
                DateTime momento;
                try
                {
                    momento = new DateTime(anio, mes, dia, hora, min, seg);
                }
                catch (ArgumentOutOfRangeException)
                {
                    Bitacora.Aviso("El lector «" + _nombre + "» mandó una fecha imposible (" +
                                   anio + "-" + mes + "-" + dia + " " + hora + ":" + min + ":" + seg +
                                   "): se omite.");
                    return;
                }

                var e = new EventoEquipo
                {
                    Pin = (enroll ?? "").Trim(),
                    EsInvalido = invalido,
                    Estado = estado,
                    MetodoVerificacion = metodo,
                    Momento = momento,
                    CodigoTrabajo = trabajo,
                    RecibidoAt = DateTimeOffset.Now,
                    Fuente = FuenteEvento.TiempoReal,
                };

                var h = Evento;
                if (h != null) h(e);
            }
            catch (Exception ex)
            {
                Bitacora.Error("Fallo al procesar un evento del lector «" + _nombre + "»", ex);
            }
        }

        public Task<bool> RegistrarEventos(int numero)
        {
            return EnHilo(() =>
            {
                if (!_zk.RegEvent(numero, TodosLosEventos))
                {
                    Bitacora.Aviso("Lector «" + _nombre + "»: " + ErroresSdk.Eventos(UltimoError()));
                    return false;
                }
                return true;
            });
        }

        public Task<bool> Ping(int numero)
        {
            return EnHilo(() =>
            {
                try
                {
                    int a = 0, m = 0, d = 0, h = 0, mi = 0, s = 0;
                    return _zk.GetDeviceTime(numero, ref a, ref m, ref d, ref h, ref mi, ref s);
                }
                catch
                {
                    return false;
                }
            });
        }

        public Task<InfoEquipo> Consultar(int numero)
        {
            return EnHilo(() => Leer(numero));
        }

        /// <summary>Lo que el equipo dice de sí mismo. Ya dentro del hilo STA.</summary>
        private InfoEquipo Leer(int numero)
        {
            var info = new InfoEquipo();

            try
            {
                string sn;
                if (_zk.GetSerialNumber(numero, out sn)) info.Sn = (sn ?? "").Trim();
            }
            catch (Exception e) { Bitacora.Error("No se pudo leer el número de serie", e); }

            try
            {
                var v = "";
                if (_zk.GetFirmwareVersion(numero, ref v)) info.Firmware = (v ?? "").Trim();
            }
            catch (Exception e) { Bitacora.Error("No se pudo leer la versión del firmware", e); }

            try
            {
                var v = "";
                if (_zk.GetSDKVersion(ref v)) info.VersionSdk = (v ?? "").Trim();
            }
            catch { /* informativo */ }

            try
            {
                string v;
                if (_zk.GetProductCode(numero, out v)) info.Plataforma = (v ?? "").Trim();
            }
            catch { /* informativo */ }

            try
            {
                int a = 0, m = 0, d = 0, h = 0, mi = 0, s = 0;
                if (_zk.GetDeviceTime(numero, ref a, ref m, ref d, ref h, ref mi, ref s))
                {
                    var hora = new DateTime(a, m, d, h, mi, s);
                    info.HoraEquipo = hora;
                    info.Desfase = hora - DateTime.Now;
                }
            }
            catch (Exception e) { Bitacora.Error("No se pudo leer la hora del equipo", e); }

            // Todos los contadores: cuál es cuál en ESTE firmware se decide con
            // el diagnóstico en sitio, no adivinando aquí.
            for (var codigo = 1; codigo <= 8; codigo++)
            {
                try
                {
                    var valor = 0;
                    if (_zk.GetDeviceStatus(numero, codigo, ref valor)) info.Contadores[codigo] = valor;
                }
                catch { /* el firmware puede no tener ese contador */ }
            }
            int registros;
            if (info.Contadores.TryGetValue(ContadorRegistros, out registros)) info.Registros = registros;

            return info;
        }

        // ── Lectura de la memoria ────────────────────────────────────────────

        public Task<ResultadoLectura> LeerRegistros(int numero, DateTime? desde, CancellationToken ct)
        {
            return EnHilo(() =>
            {
                var reloj = Stopwatch.StartNew();

                // `ReadLastestLogData` es la lectura por fecha de este SDK (el
                // plan la buscaba como `ReadTimeGLogData`, que no existe aquí).
                // El segundo parámetro es la bandera «solo los nuevos»; se manda
                // 0 para que mande todo lo posterior a la fecha, que es lo que
                // se quiere: lo del cursor del equipo ya lo pudo consumir una
                // descarga de ZKAccess.
                //
                // Si no la admite, se cae a la lectura completa y se filtra
                // aquí: lento, pero no se pierde nada.
                var metodo = "completa";
                var cargado = false;

                if (desde.HasValue)
                {
                    var d = desde.Value;
                    try
                    {
                        if (_zk.ReadLastestLogData(numero, 0, d.Year, d.Month, d.Day, d.Hour, d.Minute, d.Second))
                        {
                            metodo = "por fecha";
                            cargado = true;
                        }
                        else
                        {
                            Bitacora.Info("El lector «" + _nombre + "» no admitió la lectura por fecha (" +
                                          ErroresSdk.Codigo(UltimoError()) + "); se lee la memoria completa.");
                        }
                    }
                    catch (Exception e)
                    {
                        Bitacora.Info("El lector «" + _nombre + "» no admite la lectura por fecha (" +
                                      e.Message + "); se lee la memoria completa.");
                    }
                }

                if (!cargado)
                {
                    if (!_zk.ReadGeneralLogData(numero))
                        throw new InvalidOperationException(ErroresSdk.Lectura(UltimoError()));
                }

                var salida = new ResultadoLectura { Metodo = metodo };

                string pin;
                int verifica, entradaSalida, anio, mes, dia, hora, min, seg;
                // `dwWorkCode` es el unico [In][Out] de la llamada, asi que va
                // por `ref` y hay que inicializarlo; los demas son `out` puros.
                var trabajo = 0;
                while (_zk.SSR_GetGeneralLogData(numero, out pin, out verifica, out entradaSalida,
                           out anio, out mes, out dia, out hora, out min, out seg, ref trabajo))
                {
                    ct.ThrowIfCancellationRequested();
                    salida.Leidos++;

                    DateTime momento;
                    try
                    {
                        momento = new DateTime(anio, mes, dia, hora, min, seg);
                    }
                    catch (ArgumentOutOfRangeException)
                    {
                        continue;
                    }

                    // Se filtra igual aunque la lectura fuera por fecha: así el
                    // resultado no depende de cómo interprete el firmware el
                    // rango, y la lectura completa queda acotada al tramo.
                    if (desde.HasValue && momento < desde.Value) continue;

                    salida.Eventos.Add(new EventoEquipo
                    {
                        Pin = (pin ?? "").Trim(),
                        // La memoria del equipo solo guarda verificaciones
                        // válidas; no hay un «IsInValid» que leer aquí.
                        EsInvalido = 0,
                        Estado = entradaSalida,
                        MetodoVerificacion = verifica,
                        Momento = momento,
                        CodigoTrabajo = trabajo,
                        RecibidoAt = DateTimeOffset.Now,
                        Fuente = FuenteEvento.Lectura,
                    });
                }

                reloj.Stop();
                salida.Duracion = reloj.Elapsed;
                return salida;
            });
        }

        // ── Vaciado (la única escritura, y nunca sola) ───────────────────────

        public Task<bool> Vaciar(int numero)
        {
            return EnHilo(() =>
            {
                // Quien llama ya confirmó con una persona Y comprobó que Gestivo
                // recibió todo. Aquí solo se ejecuta y se deja constancia.
                //
                // `ClearGLog` borra TODO el log: este SDK no tiene borrado por
                // fecha (comprobado en el interop: lo único con rango de fechas
                // es `ClearPhotoByTime`, que es de fotos).
                Bitacora.Aviso("Lector «" + _nombre + "»: se va a VACIAR la memoria de registros (ClearGLog).");
                if (!_zk.ClearGLog(numero))
                {
                    Bitacora.Error("No se pudo vaciar la memoria del lector «" + _nombre + "»: " +
                                   ErroresSdk.Codigo(UltimoError()));
                    return false;
                }
                Bitacora.Info("Memoria del lector «" + _nombre + "» vaciada.");
                return true;
            });
        }

        // ── Cierre ───────────────────────────────────────────────────────────

        public Task Desconectar()
        {
            if (_hilo == null || !_hilo.IsAlive)
            {
                _conectado = false;
                return Task.FromResult(0);
            }
            return EnHilo<object>(() =>
            {
                CerrarEnHilo();
                return null;
            });
        }

        private void CerrarEnHilo()
        {
            _cerrando = true;
            try
            {
                if (_zk != null && _conectado) _zk.Disconnect();
            }
            catch (Exception e)
            {
                Bitacora.Error("Fallo al desconectar del lector «" + _nombre + "»", e);
            }
            finally
            {
                _conectado = false;
                _cerrando = false;
            }
        }

        public void Dispose()
        {
            try
            {
                var bomba = _bomba;
                if (bomba != null && !bomba.IsDisposed)
                {
                    // Cerrar y parar el bucle, en el hilo dueño del COM.
                    bomba.BeginInvoke((Action)(() =>
                    {
                        CerrarEnHilo();
                        try
                        {
                            if (_zk != null)
                            {
                                System.Runtime.InteropServices.Marshal.FinalReleaseComObject(_zk);
                                _zk = null;
                            }
                        }
                        catch { /* al cerrar no hay nada que reportar */ }
                        bomba.Dispose();
                        Application.ExitThread();
                    }));
                    var hilo = _hilo;
                    if (hilo != null && hilo.IsAlive) hilo.Join(TimeSpan.FromSeconds(5));
                }
            }
            catch
            {
                // Al cerrar no hay nada que reportar.
            }
        }

        // ── Utilidades del SDK ───────────────────────────────────────────────

        /// <summary>
        /// El SDK no lanza: devuelve `false` y deja el motivo aquí.
        /// `GetLastError` devuelve void y entrega el código por `out`.
        /// </summary>
        private int UltimoError()
        {
            try
            {
                var codigo = 0;
                _zk.GetLastError(ref codigo);
                return codigo;
            }
            catch
            {
                return 0;
            }
        }

        // ── Diagnóstico ──────────────────────────────────────────────────────

        /// <summary>
        /// Los pasos de «Probar equipo…». Responde las incógnitas que quedan
        /// —(a), (c), (d), (e), (f)— con mediciones, no con suposiciones. La (b)
        /// ya se resolvió reflexionando el interop: existe `ReadLastestLogData`,
        /// y aquí se comprueba que el firmware la respete de verdad comparando
        /// su resultado con la lectura completa.
        /// </summary>
        public async Task Diagnosticar(EquipoConfigurado equipo, int? claveComm, int numero,
            Action<string> escribir, CancellationToken ct)
        {
            Action<string> decir = texto =>
            {
                if (escribir != null) escribir(texto);
                Bitacora.Info("DIAG " + texto);
            };
            var co = CultureInfo.GetCultureInfo("es-CO");

            decir("=== Diagnóstico del lector «" + equipo.Nombre + "» (" + equipo.Enlace + ") ===");
            decir("Fecha: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture));
            decir("");

            // 1. ¿Está el COM registrado?
            var tipo = Type.GetTypeFromProgID("zkemkeeper.ZKEM");
            if (tipo == null)
            {
                decir("1. COM del SDK: NO REGISTRADO en 32 bits.");
                decir("   Regístrelo con esta orden, como administrador:");
                decir("   C:\\Windows\\SysWOW64\\regsvr32.exe \"C:\\ZKTeco\\ZKAccess3.5\\zkemkeeper.dll\"");
                decir("   Sin esto no se puede seguir.");
                return;
            }
            decir("1. COM del SDK: registrado.");

            // 2. ¿ZKAccess abierto? Es la prueba (a).
            var vigilante = new VigilanteZkAccess("Access");
            var zkAbierto = vigilante.Revisar();
            decir("2. ZKAccess abierto: " + (zkAbierto ? "SÍ (" + vigilante.Quien + ")" : "no") + ".");
            if (zkAbierto)
                decir("   OJO: si el paso 3 falla, eso RESPONDE la incógnita (a): el equipo " +
                      "admite un solo cliente y el agente tiene que ceder. Es un resultado, no un fallo.");

            // 3. Conectar.
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
                // 4. Identidad y relojes (e).
                decir("4. Serie:    " + (info.Sn ?? "?") + (string.IsNullOrEmpty(equipo.Sn)
                          ? ""
                          : string.Equals(info.Sn, equipo.Sn, StringComparison.OrdinalIgnoreCase)
                              ? "  (coincide con ZKAccess)"
                              : "  ¡DISTINTA de la de ZKAccess (" + equipo.Sn + ")! Gestivo usará la del equipo."));
                decir("   Firmware: " + (info.Firmware ?? "?"));
                decir("   SDK:      " + (info.VersionSdk ?? "?") +
                      "   Plataforma: " + (info.Plataforma ?? "?"));
                if (info.HoraEquipo.HasValue)
                {
                    var desfase = info.Desfase ?? TimeSpan.Zero;
                    decir("   Reloj del equipo: " +
                          info.HoraEquipo.Value.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) +
                          " · PC: " + DateTime.Now.ToString("HH:mm:ss", CultureInfo.InvariantCulture) +
                          " · desfase " + ((int)desfase.TotalSeconds) + " s" +
                          (Math.Abs(desfase.TotalSeconds) > 60
                              ? "  <-- MÁS DE UN MINUTO: la fecha de una huella puede caer en otro día."
                              : ""));
                }
                else
                {
                    decir("   Reloj del equipo: no lo entregó.");
                }

                // 5. Contadores (c). El 6 es el que la guía llama «registros nuevos».
                decir("5. Contadores de GetDeviceStatus:");
                foreach (var kv in info.Contadores.OrderBy(k => k.Key))
                    decir("   [" + kv.Key + "] = " + kv.Value.ToString("N0", co) +
                          (kv.Key == ContadorRegistros ? "   <-- la guía: «registros nuevos»" : ""));
                if (info.Contadores.Count == 0) decir("   (ninguno: este firmware no los reporta)");
                if (info.MemoriaCasiLlena)
                    decir("   AVISO: la memoria va por encima del 80 %. Ver «Vaciar memoria del equipo…».");

                // 6. Lectura por fecha, y su comprobación contra la completa (b).
                decir("6. Lectura por fecha (ReadLastestLogData, últimas 24 h):");
                var ayer = DateTime.Now.AddDays(-1);
                var porFecha = await LeerRegistros(numero, ayer, ct).ConfigureAwait(false);
                decir("   " + porFecha.Resumen());

                decir("7. Lectura COMPLETA de la memoria (puede tardar):");
                var completa = await LeerRegistros(numero, null, ct).ConfigureAwait(false);
                decir("   " + completa.Resumen());

                // La comprobación que de verdad importa: ¿la lectura barata trae
                // lo MISMO que la completa en ese tramo? Si trae menos, no se
                // puede confiar en ella para ponerse al día.
                var delTramo = completa.Eventos.Where(x => x.Momento >= ayer).ToList();
                decir("   En las últimas 24 h: por fecha " + porFecha.Eventos.Count +
                      " · en la completa " + delTramo.Count);
                if (porFecha.Metodo != "por fecha")
                    decir("   -> (b): este firmware NO admite la lectura por fecha. Cada reconexión " +
                          "lee la memoria completa (" + completa.Duracion.TotalSeconds.ToString("0.0", co) +
                          " s). Vaciar la memoria la haría mucho más rápida.");
                else if (porFecha.Eventos.Count >= delTramo.Count)
                    decir("   -> (b) RESUELTA: la lectura por fecha trae todo lo del tramo. " +
                          "Reconectar es barato y la puesta al día es fiable.");
                else
                    decir("   -> (b) ¡OJO!: la lectura por fecha trae MENOS que la completa. " +
                          "No es fiable en este firmware: ponga EquipoMargenMin más alto o " +
                          "fuerce la lectura completa en MapeoEquipo/ClienteZk.");

                if (completa.Eventos.Count > 0)
                {
                    var ordenados = completa.Eventos.OrderBy(x => x.Momento).ToList();
                    decir("   Del " + ordenados[0].Momento.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture) +
                          " al " + ordenados[ordenados.Count - 1].Momento.ToString("yyyy-MM-dd HH:mm",
                              CultureInfo.InvariantCulture));
                    decir("   Por método de verificación (VerifyMethod): " +
                          string.Join(", ", completa.Eventos.GroupBy(x => x.MetodoVerificacion)
                              .OrderBy(g => g.Key)
                              .Select(g => g.Key + "=" + g.Count().ToString("N0", co))));
                    decir("   Por estado (InOutMode): " +
                          string.Join(", ", completa.Eventos.GroupBy(x => x.Estado)
                              .OrderBy(g => g.Key)
                              .Select(g => g.Key + "=" + g.Count().ToString("N0", co))));
                    decir("   -> (d): el método con más registros es el que usa la gente para entrar;");
                    decir("      MapeoEquipo.Traduccion debe llevarlo a 6 (lo que ZKAccess llama huella).");
                }
                if (completa.Duracion.TotalSeconds > 120)
                    decir("   AVISO: más de 2 min. Cada reconexión costaría eso si (b) salió mal.");

                // 8. Eventos en vivo (d)(f).
                decir("8. Eventos en tiempo real: ponga un dedo DOS VECES en el lector (60 s)…");
                var vistos = new List<EventoEquipo>();
                Action<EventoEquipo> anotar = ev =>
                {
                    lock (vistos) vistos.Add(ev);
                    decir("   EVENTO " + ev + "  (PC: " +
                          ev.RecibidoAt.ToString("HH:mm:ss.fff", CultureInfo.InvariantCulture) +
                          ", latencia " + (int)(ev.RecibidoAt - new DateTimeOffset(ev.Momento,
                              ev.RecibidoAt.Offset)).TotalSeconds + " s)");
                };
                Evento += anotar;
                try
                {
                    var ok = await RegistrarEventos(numero).ConfigureAwait(false);
                    decir("   RegEvent: " + (ok ? "aceptado" : "RECHAZADO"));
                    if (ok)
                    {
                        var hasta = DateTime.Now.AddSeconds(60);
                        while (DateTime.Now < hasta && !ct.IsCancellationRequested)
                        {
                            lock (vistos) if (vistos.Count >= 2) break;
                            await Task.Delay(500, ct).ConfigureAwait(false);
                        }
                        int cuantos;
                        lock (vistos) cuantos = vistos.Count;
                        decir("   Eventos recibidos: " + cuantos);
                        if (cuantos == 0)
                            decir("   -> (f): no llegó ninguno. O nadie puso el dedo, o este firmware no " +
                                  "emite eventos y la vía equipo solo serviría por lectura periódica.");
                        else
                            decir("   -> (f) RESUELTA: el firmware SÍ emite eventos en vivo.");
                    }
                }
                finally
                {
                    Evento -= anotar;
                }

                // 9. Segundo cliente (a).
                decir("9. ¿Admite un segundo cliente? (con esta sesión viva)");
                try
                {
                    var otro = new CZKEMClass();
                    try
                    {
                        if (claveComm.HasValue && claveComm.Value != 0) otro.SetCommPassword(claveComm.Value);
                        var segunda = otro.Connect_Net(equipo.Ip, equipo.Puerto);
                        decir("   Segunda conexión: " + (segunda ? "ACEPTADA" : "rechazada") + ".");
                        decir(segunda
                            ? "   -> (a): admite varios clientes. Ceder a ZKAccess sigue siendo prudente, pero no es imprescindible."
                            : "   -> (a) RESUELTA: un solo cliente a la vez. Ceder a ZKAccess es obligatorio.");
                        if (segunda) otro.Disconnect();
                    }
                    finally
                    {
                        try { System.Runtime.InteropServices.Marshal.FinalReleaseComObject(otro); }
                        catch { /* nada */ }
                    }
                }
                catch (Exception e)
                {
                    decir("   No se pudo probar: " + e.Message);
                }

                decir("");
                decir("=== Resumen para pegar en la conversación ===");
                decir("(a) dos clientes a la vez:  ver paso 9");
                decir("(b) lectura por fecha:      " + porFecha.Metodo + " · por fecha " +
                      porFecha.Eventos.Count + " vs completa " + delTramo.Count + " en 24 h");
                decir("(c) memoria:                " + info.Ocupacion() +
                      " · lectura completa " + completa.Duracion.TotalSeconds.ToString("0.0", co) + " s");
                decir("(d) VerifyMethod de huella: ver histograma del paso 7 y los eventos del paso 8");
                decir("(e) desfase del reloj:      " +
                      (info.Desfase.HasValue ? ((int)info.Desfase.Value.TotalSeconds) + " s" : "?"));
                decir("(f) eventos en vivo:        ver paso 8");
            }
            finally
            {
                await Desconectar().ConfigureAwait(false);
                decir("Desconectado. El agente retoma la vía equipo al cerrar esta ventana.");
            }
        }
    }
}
