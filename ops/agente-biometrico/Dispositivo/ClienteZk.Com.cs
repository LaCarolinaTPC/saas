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

        /// <summary>
        /// Cuanto se le concede al equipo estar desactivado mientras se descarga.
        ///
        /// Es un TECHO de seguridad, no una espera: el agente lo reactiva en
        /// cuanto termina la descarga, y el techo solo actua si el agente muere a
        /// mitad. Por eso conviene GENEROSO y no corto: con 94.942 registros en
        /// memoria (medido en sitio) una descarga completa puede pasar del
        /// minuto, y si el techo expira a mitad el equipo se reactiva solo y la
        /// lectura vuelve a fallar con -101.
        ///
        /// Cinco minutos es el peor caso si el agente se muere y NO vuelve: el
        /// lector no acepta huellas hasta que expire. Se asume a conciencia
        /// porque se recupera solo —el lector esta en otro edificio y nadie puede
        /// ir a reiniciarlo— y porque el agente ademas lo reactiva al reconectar.
        /// </summary>
        private const int SegundosDesactivado = 300;

        /// <summary>`GetDeviceStatus`: la guía del SDK llama al 6 «cantidad de registros nuevos».</summary>
        private const int ContadorRegistros = 6;

        private readonly string _nombre;
        private readonly object _candado = new object();

        private Thread _hilo;
        private Control _bomba;
        private CZKEMClass _zk;
        private volatile bool _conectado;
        private volatile bool _cerrando;

        /// <summary>
        /// El numero de equipo de la sesion viva. Hace falta al cerrar: el cierre
        /// que reactiva el lector al soltar la sesión lo pide, y
        /// `Desconectar` no recibe parametros.
        /// </summary>
        private int _ultimoNumero = 1;

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

                // NO se llama a SetCommProType ni se toca PullMode, aunque
                // ZKAccess lo haga antes de conectar (su ConnectWithoutLock hace
                // SetCommProType(1) -> SetCommPassword -> PullMode = 0). Se probó
                // en sitio el 2026-10-20 y **rompe la conexión**: Connect_Net pasa
                // de funcionar a devolver -8. El mismo -8 sale en el PC de
                // desarrollo con esa combinación.
                //
                // Se intentó porque es la única diferencia que quedaba con
                // ZKAccess y porque las descargas en bloque fallan (-101/-112).
                // No lo resuelve: lo empeora. Queda anotado para no repetirlo.
                if (!_zk.Connect_Net(ip, puerto))
                    throw new InvalidOperationException(ErroresSdk.Conexion(UltimoError(), ip, puerto));

                _conectado = true;
                _ultimoNumero = numero;

                // La MISMA inicializacion que hace ZKAccess tras conectar, en su
                // orden. Sacada del IL de STDDevComm.ConnectWithoutLock:
                //   GetSysOption("~UserExtFmt") -> GetFirmwareVersion ->
                //   GetSysOption("~Platform") -> IsTFTMachine -> RegEvent ->
                //   GetSysOption("FaceFunOn") -> GetCardFun ->
                //   GetSysOption("~LockFunOn") -> GetSysOption("CompatOldFirmware")
                //
                // Por que importa: con el lector conectado y respondiendo a todo
                // lo simple, las lecturas en bloque devolvian -101 y las de fecha
                // -112, con y sin desactivar el equipo. La diferencia que queda
                // entre ZKAccess y nosotros es justo esta: el SDK se entera por
                // aqui del formato de datos y de la plataforma del equipo (este es
                // un firmware de 2014; una de las opciones se llama literalmente
                // "CompatOldFirmware"). No es gratis adivinarlo: se replica.
                Inicializar(numero);

                // Red de seguridad: si una descarga anterior quedo a medias (el
                // agente se murio, se corto la red), el lector pudo quedarse
                // DESACTIVADO y no aceptando huellas. Reactivarlo aqui lo arregla
                // en remoto, que es lo unico posible: el equipo esta en otro
                // edificio. Es inofensivo cuando ya estaba activo.
                Reactivar(numero);

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

        /// <summary>
        /// Las opciones del equipo que el SDK necesita conocer, en el mismo orden
        /// en que las pide ZKAccess. Lo que devuelven queda en
        /// <see cref="Opciones"/> para poder verlo en el diagnóstico.
        ///
        /// Nada de esto escribe en el equipo: `GetSysOption` lee.
        /// </summary>
        private void Inicializar(int numero)
        {
            Opciones.Clear();
            foreach (var nombre in new[]
                     { "~UserExtFmt", "~Platform", "FaceFunOn", "~LockFunOn", "CompatOldFirmware" })
            {
                try
                {
                    string valor;
                    Opciones[nombre] = _zk.GetSysOption(numero, nombre, out valor)
                        ? (valor ?? "")
                        : "(no la entregó: " + ErroresSdk.Codigo(UltimoError()) + ")";
                }
                catch (Exception e)
                {
                    Opciones[nombre] = "(falló: " + e.Message + ")";
                }
            }

            try { Opciones["IsTFTMachine"] = _zk.IsTFTMachine(numero) ? "sí" : "no"; }
            catch (Exception e) { Opciones["IsTFTMachine"] = "(falló: " + e.Message + ")"; }

            try
            {
                var fun = 0;
                Opciones["CardFun"] = _zk.GetCardFun(numero, ref fun)
                    ? fun.ToString(CultureInfo.InvariantCulture)
                    : "(no la entregó)";
            }
            catch (Exception e) { Opciones["CardFun"] = "(falló: " + e.Message + ")"; }
        }

        /// <summary>Lo que respondió el equipo a la inicialización. Para el diagnóstico.</summary>
        internal readonly Dictionary<string, string> Opciones = new Dictionary<string, string>();

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

        public Task<ResultadoLectura> LeerRegistros(int numero, DateTime? desde, CancellationToken ct,
            bool desactivarAlLeer = true)
        {
            return EnHilo(() =>
            {
                var reloj = Stopwatch.StartNew();
                var salida = new ResultadoLectura();
                var fallos = new List<string>();

                // El equipo NIEGA la descarga en bloque mientras esta atendiendo
                // verificaciones: devuelve -101 (medido en sitio el 2026-10-20,
                // con 94.942 registros en memoria, asi que no era "no hay nada").
                //
                // Hay que desactivarlo mientras se descarga, que es exactamente lo
                // que hace ZKAccess: su GetAllTransactionWithoutLock llama
                //     DisableDeviceWithTimeOut -> ReadAllGLogData -> EnableDevice
                //     -> SSR_GetGeneralLogData
                // (sacado del IL de MachinesManager.dll).
                //
                // Dos cosas importantes del diseno, copiadas de ahi:
                //   · se usa la variante CON TIEMPO LIMITE, no EnableDevice(false):
                //     si el agente muere a mitad, el equipo se reactiva solo y no
                //     deja a la gente sin poder entrar;
                //   · se reactiva ANTES de vaciar el bufer, porque el vaciado ya es
                //     local y no necesita al equipo. El lector queda fuera de juego
                //     solo durante la descarga.
                var desactivado = false;
                if (desactivarAlLeer)
                {
                    try
                    {
                        desactivado = _zk.DisableDeviceWithTimeOut(numero, SegundosDesactivado);
                        if (!desactivado)
                            fallos.Add("no se pudo desactivar el lector para leer → " +
                                       ErroresSdk.Codigo(UltimoError()));
                    }
                    catch (Exception e)
                    {
                        fallos.Add("no se pudo desactivar el lector para leer → " + e.Message);
                    }
                }

                try
                {

                // Este SDK tiene varias formas de pedir los registros y el
                // firmware acepta unas y rechaza otras, así que se prueban en
                // orden de más barata a más cara. Medido en sitio: la de «solo
                // los nuevos» devolvió -101, lo que encaja con que ZKAccess
                // acababa de descargar y dejó el cursor del equipo al final.
                //
                //   1. por fecha  -> el equipo manda solo el tramo pedido
                //   2. todos      -> la memoria completa; es la que usa ZKAccess
                //                    (por eso volvió a bajar lo mismo 4 veces)
                //   3. solo nuevos-> lo que el equipo aún no ha entregado
                if (desde.HasValue)
                {
                    var d = desde.Value;
                    if (Intentar(() => _zk.ReadLastestLogData(
                            numero, 0, d.Year, d.Month, d.Day, d.Hour, d.Minute, d.Second),
                        "por fecha", fallos))
                        salida.Metodo = "por fecha";
                }

                if (salida.Metodo == null &&
                    Intentar(() => _zk.ReadAllGLogData(numero), "completa", fallos))
                    salida.Metodo = "completa";

                if (salida.Metodo == null &&
                    Intentar(() => _zk.ReadGeneralLogData(numero), "solo nuevos", fallos))
                    salida.Metodo = "solo nuevos";

                if (salida.Metodo == null)
                {
                    // Antes de dar error: ¿o es que no hay NADA que leer? El
                    // contador de registros nuevos en 0 con las lecturas
                    // fallando es «no hay novedades», no una avería, y tratarlo
                    // como avería dejaría el lector en reintento perpetuo justo
                    // después de que alguien descargue en ZKAccess.
                    var nuevos = Contador(numero, ContadorRegistros);
                    if (nuevos.HasValue && nuevos.Value == 0)
                    {
                        reloj.Stop();
                        salida.Metodo = "sin novedades";
                        salida.Duracion = reloj.Elapsed;
                        Bitacora.Info("El lector «" + _nombre + "» no tiene registros nuevos (" +
                                      string.Join(" · ", fallos.ToArray()) + ").");
                        return salida;
                    }
                    throw new InvalidOperationException(ErroresSdk.Lectura(fallos));
                }

                    if (fallos.Count > 0)
                        Bitacora.Info("El lector «" + _nombre + "» leyó «" + salida.Metodo +
                                      "» tras descartar: " + string.Join(" · ", fallos.ToArray()) + ".");
                }
                finally
                {
                    // Reactivar SIEMPRE, y antes de vaciar el bufer.
                    if (desactivado) Reactivar(numero);
                }

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

        /// <summary>
        /// Llama al SDK y, si devuelve `false`, anota el porqué en
        /// <paramref name="fallos"/> en vez de lanzar. Así se puede probar la
        /// siguiente forma de lectura sin perder el rastro de las anteriores.
        /// </summary>
        private bool Intentar(Func<bool> llamada, string nombre, List<string> fallos)
        {
            try
            {
                if (llamada()) return true;
                fallos.Add(nombre + " → " + ErroresSdk.Codigo(UltimoError()));
            }
            catch (Exception e)
            {
                fallos.Add(nombre + " → " + e.Message);
            }
            return false;
        }

        /// <summary>Una forma de pedirle los registros al equipo. Solo para el diagnóstico.</summary>
        private sealed class Forma
        {
            public readonly string Nombre;
            public readonly Func<bool> Llamar;

            public Forma(string nombre, Func<bool> llamar)
            {
                Nombre = nombre;
                Llamar = llamar;
            }
        }

        /// <summary>
        /// Prueba UNA forma de leer y dice qué pasó, sin lanzar: el diagnóstico
        /// tiene que poder seguir con la siguiente.
        ///
        /// Con <paramref name="desactivando"/> envuelve la lectura en
        /// `EnableDevice(false/true)`, que es lo que hacen los ejemplos de
        /// ZKTeco para las operaciones en bloque. Es la ÚNICA escritura que esto
        /// hace sobre el equipo, y mientras está desactivado **el lector no
        /// acepta huellas**: por eso lo pide el usuario con una casilla y
        /// siempre se reactiva en el `finally`.
        /// </summary>
        private Task<ResultadoLectura> ProbarForma(int numero, Forma forma, bool desactivando,
            Action<string> decir, CancellationToken ct)
        {
            var etiqueta = "   " + forma.Nombre + (desactivando ? "  [lector desactivado]" : "");
            return EnHilo<ResultadoLectura>(() =>
            {
                var desactivado = false;
                try
                {
                    if (desactivando)
                    {
                        // Con TIEMPO LIMITE, como ZKAccess: si esto muere a mitad,
                        // el lector se reactiva solo en vez de quedarse mudo.
                        if (!_zk.DisableDeviceWithTimeOut(numero, SegundosDesactivado))
                        {
                            decir(etiqueta + " → no se pudo desactivar el lector (" +
                                  ErroresSdk.Codigo(UltimoError()) + ")");
                            return null;
                        }
                        desactivado = true;
                    }

                    var reloj = Stopwatch.StartNew();
                    if (!forma.Llamar())
                    {
                        decir(etiqueta + " → NO, " + ErroresSdk.Codigo(UltimoError()));
                        return null;
                    }

                    var r = new ResultadoLectura { Metodo = forma.Nombre };
                    string pin;
                    int verifica, entradaSalida, anio, mes, dia, hora, min, seg;
                    var trabajo = 0;
                    while (_zk.SSR_GetGeneralLogData(numero, out pin, out verifica, out entradaSalida,
                               out anio, out mes, out dia, out hora, out min, out seg, ref trabajo))
                    {
                        ct.ThrowIfCancellationRequested();
                        r.Leidos++;
                        DateTime momento;
                        try
                        {
                            momento = new DateTime(anio, mes, dia, hora, min, seg);
                        }
                        catch (ArgumentOutOfRangeException)
                        {
                            continue;
                        }
                        r.Eventos.Add(new EventoEquipo
                        {
                            Pin = (pin ?? "").Trim(),
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
                    r.Duracion = reloj.Elapsed;
                    decir(etiqueta + " → SÍ, " + r.Resumen());
                    return r;
                }
                catch (Exception e)
                {
                    decir(etiqueta + " → falló: " + e.Message);
                    return null;
                }
                finally
                {
                    // SIEMPRE se reactiva: dejar el lector apagado sería dejar a
                    // la gente sin poder entrar.
                    if (desactivado) Reactivar(numero);
                }
            });
        }

        /// <summary>
        /// Vuelve a activar el lector tras una descarga. Si fallara, se avisa
        /// fuerte: el equipo se reactiva solo al expirar el tiempo limite, pero
        /// mientras tanto nadie puede entrar.
        /// </summary>
        private void Reactivar(int numero)
        {
            try
            {
                if (_zk.EnableDevice(numero, true)) return;
                Bitacora.Error("No se pudo REACTIVAR el lector «" + _nombre + "» tras leer (" +
                               ErroresSdk.Codigo(UltimoError()) + "). Se reactiva solo en " +
                               SegundosDesactivado + " s; si no, actívelo desde ZKAccess.", null);
            }
            catch (Exception e)
            {
                Bitacora.Error("Fallo al reactivar el lector «" + _nombre + "» tras leer", e);
            }
        }

        /// <summary>Un contador de `GetDeviceStatus`, o null si el firmware no lo tiene.</summary>
        private int? Contador(int numero, int codigo)
        {
            try
            {
                var valor = 0;
                if (_zk.GetDeviceStatus(numero, codigo, ref valor)) return valor;
            }
            catch
            {
                // El firmware puede no tener ese contador.
            }
            return null;
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
                // Reactivar el lector antes de soltar la sesion: si una descarga
                // quedo a medias, podria estar desactivado. Es lo unico que se
                // conserva de la secuencia de cierre de ZKAccess; su BatchUpdate y
                // RefreshData se probaron en sitio y no cambian nada, asi que no
                // se arrastran.
                if (_zk != null && _conectado)
                {
                    try { _zk.EnableDevice(_ultimoNumero, true); } catch { }
                }

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
            bool permitirDesactivar, Action<string> escribir, CancellationToken ct)
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

                // 6. LAS CUATRO FORMAS de leer, una por una (b).
                //
                // Antes este paso probaba solo dos y, si fallaban, la excepción
                // abortaba el diagnóstico entero: se perdían los pasos 7, 8 y 9,
                // que son los que exigen estar delante del equipo. Ahora cada
                // forma se prueba aparte, se anota su código, y se sigue.
                decir("5b. Opciones que el SDK le pregunta al equipo (igual que ZKAccess):");
                foreach (var kv in Opciones)
                    decir("   " + kv.Key.PadRight(20) + " = " + kv.Value);
                if (Opciones.Count == 0) decir("   (ninguna; la inicialización no corrió)");

                decir("6. Formas de pedir los registros (el SDK tiene cuatro):");
                decir(permitirDesactivar
                    ? "   (si una falla, se reintenta desactivando el lector: es lo que hace ZKAccess)"
                    : "   (NO se desactivará el lector, y entonces la lectura en bloque va a fallar" +
                      " con -101: marque la casilla)");
                var ayer = DateTime.Now.AddDays(-1);
                var mejor = (ResultadoLectura)null;
                var nombreMejor = "ninguna";

                var formas = new[]
                {
                    new Forma("por fecha (ReadLastestLogData, NewLog=0)", () =>
                        _zk.ReadLastestLogData(numero, 0, ayer.Year, ayer.Month, ayer.Day,
                            ayer.Hour, ayer.Minute, ayer.Second)),
                    new Forma("por fecha, solo nuevos (NewLog=1)", () =>
                        _zk.ReadLastestLogData(numero, 1, ayer.Year, ayer.Month, ayer.Day,
                            ayer.Hour, ayer.Minute, ayer.Second)),
                    new Forma("todos (ReadAllGLogData)", () => _zk.ReadAllGLogData(numero)),
                    new Forma("solo nuevos (ReadGeneralLogData)", () => _zk.ReadGeneralLogData(numero)),
                };

                foreach (var forma in formas)
                {
                    ct.ThrowIfCancellationRequested();
                    var r = await ProbarForma(numero, forma, false, decir, ct).ConfigureAwait(false);

                    // Si falló, se reintenta DESACTIVANDO el lector mientras se
                    // lee, que es lo que hacen los ejemplos de ZKTeco. Es la
                    // única escritura que el diagnóstico hace sobre el equipo,
                    // dura segundos y siempre se vuelve a activar; si resulta
                    // que hace falta, hay que decidirlo aparte, porque mientras
                    // está desactivado el lector no acepta huellas.
                    if (r == null && permitirDesactivar)
                        r = await ProbarForma(numero, forma, true, decir, ct).ConfigureAwait(false);

                    if (r != null && (mejor == null || r.Eventos.Count > mejor.Eventos.Count))
                    {
                        mejor = r;
                        nombreMejor = forma.Nombre;
                    }
                }

                if (mejor == null)
                {
                    decir("   -> (b) NINGUNA funcionó. Qué ya se descartó, para no repetirlo:");
                    decir("      · no es el contador en 0: el paso 5 muestra 94.942 registros;");
                    decir("      · no es el lector activo: falla igual desactivándolo;");
                    decir("      · no es la inicialización: el paso 5b la hace completa.");
                    decir("      · no es SetCommProType/PullMode: probado, y eso ROMPE la conexión.");
                    decir("      La vía equipo sirve igual para TIEMPO REAL (RegEvent se acepta) y");
                    decir("      los huecos los cubre la vía Access, que ya funciona hoy.");
                }
                else
                {
                    decir("   -> (b) la mejor es «" + nombreMejor + "»: " + mejor.Resumen() + ".");
                }

                // 7. El contenido, para resolver (d) y medir la memoria (c).
                decir("7. Qué traen esos registros:");
                var completa = mejor ?? new ResultadoLectura { Metodo = "ninguna" };
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
                    decir("   Últimos tres, para cotejarlos con ZKAccess:");
                    foreach (var e in completa.Eventos.OrderByDescending(x => x.Momento).Take(3))
                        decir("     " + e);
                    decir("   -> (d): el método con más registros es el que usa la gente para entrar;");
                    decir("      MapeoEquipo.Traduccion debe llevarlo a 6 (lo que ZKAccess llama huella).");
                }
                else
                {
                    decir("   Ninguna forma entregó registros, así que (d) queda sin resolver aquí:");
                    decir("   el paso 8 lo responde igual con un dedo de verdad.");
                }
                if (completa.Duracion.TotalSeconds > 120)
                    decir("   AVISO: más de 2 min. Cada reconexión costaría eso si no hay lectura por fecha.");

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
                decir("(b) forma de leer que sirve: " + nombreMejor +
                      (mejor == null ? "" : " · " + mejor.Resumen()));
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
