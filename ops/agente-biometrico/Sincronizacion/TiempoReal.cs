using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Gestivo.AgenteBiometrico.Datos;
using Gestivo.AgenteBiometrico.Dispositivo;
using Gestivo.AgenteBiometrico.Nucleo;
using Gestivo.AgenteBiometrico.Red;

namespace Gestivo.AgenteBiometrico.Sincronizacion
{
    public enum SaludEquipo
    {
        /// <summary>No está en `Machines` como usable, o la vía está apagada.</summary>
        Deshabilitado,
        Conectando,
        Conectado,
        /// <summary>ZKAccess está abierto: el agente le soltó la conexión.</summary>
        CedidoAZkAccess,
        Desconectado,
        Error,
    }

    /// <summary>Lo que se sabe de un lector. Se copia para sacarlo del candado.</summary>
    public class EstadoEquipo
    {
        public int Id { get; set; }
        public string Alias { get; set; }
        public string Sn { get; set; }
        public string Enlace { get; set; }

        public SaludEquipo Salud { get; set; } = SaludEquipo.Deshabilitado;
        public string Error { get; set; }
        public DateTime? Desde { get; set; }

        public string Firmware { get; set; }
        public int? Registros { get; set; }
        public bool MemoriaCasiLlena { get; set; }
        public TimeSpan? Desfase { get; set; }

        /// <summary>Qué hizo la lectura al conectar: «por fecha, 12 de 40 en 1,8 s».</summary>
        public string LecturaAlConectar { get; set; }

        public DateTime? UltimaHuella { get; set; }
        public string UltimoPin { get; set; }
        public int HuellasHoy { get; set; }
        public int EnCola { get; set; }
        public DateTime? UltimoEnvio { get; set; }
        public int EnviadasHoy { get; set; }
        public int RepetidasDescartadas { get; set; }
        public int Reintentos { get; set; }
        public DateTime? ProximoIntento { get; set; }

        public EstadoEquipo Copia()
        {
            return (EstadoEquipo)MemberwiseClone();
        }
    }

    /// <summary>Lo que muestran la bandeja y la ventana de Estado de la vía equipo.</summary>
    public class EstadoTiempoReal
    {
        public bool Habilitado { get; set; }
        public bool SdkCompilado { get; set; }
        public bool Pausado { get; set; }
        public string MotivoPausa { get; set; }
        public bool ZkAccessAbierto { get; set; }
        public string QuienTieneZkAccess { get; set; }
        public int SegundosDeGracia { get; set; }
        public string Error { get; set; }
        public List<EstadoEquipo> Equipos { get; set; } = new List<EstadoEquipo>();

        /// <summary>La huella en vivo más reciente de cualquier lector.</summary>
        public DateTime? UltimaHuella
        {
            get
            {
                var con = Equipos.Where(e => e.UltimaHuella.HasValue).ToList();
                return con.Count == 0 ? (DateTime?)null : con.Max(e => e.UltimaHuella.Value);
            }
        }

        public int EnCola { get { return Equipos.Sum(e => e.EnCola); } }

        /// <summary>true si algún lector debería estar trabajando y no lo está.</summary>
        public bool HayProblema
        {
            get { return Equipos.Any(e => e.Salud == SaludEquipo.Error || e.Salud == SaludEquipo.Desconectado); }
        }

        public bool AlgunoCedido
        {
            get { return Equipos.Any(e => e.Salud == SaludEquipo.CedidoAZkAccess); }
        }

        public bool AlgunoConectado
        {
            get { return Equipos.Any(e => e.Salud == SaludEquipo.Conectado); }
        }
    }

    /// <summary>
    /// La vía EQUIPO: el agente habla directo con cada lector por el SDK y manda
    /// a Gestivo lo que va pasando, sin esperar a que alguien abra ZKAccess.
    ///
    /// Convive con la vía Access (<see cref="Sincronizador"/>), que sigue siendo
    /// la historia autoritativa: la llave natural `(device_sn, pin, momento)`
    /// hace que la misma huella llegada por las dos puertas sea una sola fila.
    ///
    /// ## Cómo se reparte el trabajo
    ///
    /// Un «pump» de un segundo lanza tareas; nunca hace el trabajo él mismo, y
    /// así una lectura de minutos en un lector no detiene a los demás:
    ///   · cada 3 s  revisa si ZKAccess está abierto y, según eso, conecta o cede
    ///   · cada N s  manda lo acumulado (N = TiempoRealFlushSeg)
    ///   · cada 60 s latido por lector, para detectar un TCP muerto
    ///
    /// Las operaciones COM de un lector están serializadas por su propio turno;
    /// el envío por el suyo. Los eventos del SDK llegan en el hilo del COM y
    /// solo encolan.
    ///
    /// ## De dónde sale la lista de lectores
    ///
    /// De `Machines` de ZKAccess cuando este PC tiene la base (ver
    /// <see cref="ListaEquipos"/>): un lector nuevo entra solo. Si la base no
    /// se puede abrir, o la vía Access está apagada porque el agente corre en
    /// otro PC, de la copia guardada en `Configuracion.Equipos`. Quien la
    /// resuelve es la función que recibe el constructor; aquí da igual.
    /// </summary>
    public class TiempoReal : IDisposable
    {
        /// <summary>Cuánto se acumula antes de mandar, como tope duro de memoria.</summary>
        private const int LoteMaximo = 500;

        /// <summary>Si la cola pasa de esto, Gestivo lleva mucho rato caído: se suelta y se releerá.</summary>
        private const int ColaDesborde = 10000;

        /// <summary>Claves recordadas por lector para no mandar dos veces lo mismo.</summary>
        private const int VistasMaximas = 5000;

        /// <summary>Espera entre reintentos, en segundos. Después se queda en el último.</summary>
        private static readonly int[] Reintentos = { 10, 30, 60, 120, 300 };

        /// <summary>
        /// Sin una vuelta del sondeo en vivo durante esto, el SDK se da por
        /// colgado. Holgado: una descarga completa toma el candado ~45 s con la
        /// memoria llena (95.000 registros), y no debe confundirse con un cuelgue.
        /// </summary>
        private static readonly TimeSpan SondeoColgado = TimeSpan.FromMinutes(3);

        /// <summary>Tope de las operaciones con el equipo que corren con el turno tomado.</summary>
        private static readonly TimeSpan TopeLatido = TimeSpan.FromSeconds(20);
        private static readonly TimeSpan TopeSoltar = TimeSpan.FromSeconds(15);

        private readonly Func<Configuracion> _config;
        private readonly Func<List<EquipoConfigurado>> _leerMaquinas;
        private readonly CancellationTokenSource _cancelar = new CancellationTokenSource();
        private readonly object _candado = new object();
        private readonly Dictionary<int, Sesion> _sesiones = new Dictionary<int, Sesion>();
        private readonly SemaphoreSlim _unPump = new SemaphoreSlim(1, 1);

        private VigilanteZkAccess _vigilante;
        private ClienteGestivo _gestivo;
        private string _urlDelCliente;
        private string _secretoDelCliente;
        private Timer _pump;
        private long _tic;
        private bool _pausado;
        private string _motivoPausa;
        private string _errorGlobal;
        private bool _iniciado;

        /// <summary>Avisa a la interfaz. Puede venir de cualquier hilo.</summary>
        public event Action<EstadoTiempoReal> Cambio;

        public TiempoReal(Func<Configuracion> config, Func<List<EquipoConfigurado>> leerMaquinas)
        {
            _config = config;
            _leerMaquinas = leerMaquinas;
            _vigilante = new VigilanteZkAccess(config().EquipoProcesosCeder);
        }

        /// <summary>
        /// ¿Hay con qué hablarle al lector?
        ///
        /// Basta con UNO de los dos SDK. El pull (`plcommpro.dll`) es el que usa
        /// esta instalación y no necesita nada en compilación: se comprueba
        /// cargándolo. El clásico (`zkemkeeper`) solo está si se compiló con su
        /// interop.
        /// </summary>
        public static bool SdkCompilado
        {
            get
            {
                using (var pull = new ClientePull("prueba"))
                    if (pull.SdkDisponible) return true;
                using (var clasico = new ClienteZk("prueba"))
                    return clasico.SdkDisponible;
            }
        }

        // ── Sesión por lector ────────────────────────────────────────────────

        private class Sesion : IDisposable
        {
            public EquipoConfigurado Equipo;
            public IEquipoZk Cliente;

            /// <summary>Protege cola, vistas y estado.</summary>
            public readonly object Candado = new object();

            public readonly List<EventoEquipo> Cola = new List<EventoEquipo>();
            public readonly HashSet<string> Vistas = new HashSet<string>(StringComparer.Ordinal);
            public readonly Queue<string> OrdenVistas = new Queue<string>();

            /// <summary>Serializa las operaciones del COM de ESTE lector.</summary>
            public readonly SemaphoreSlim Turno = new SemaphoreSlim(1, 1);

            /// <summary>Serializa los envíos de ESTE lector.</summary>
            public readonly SemaphoreSlim TurnoEnvio = new SemaphoreSlim(1, 1);

            public EstadoEquipo Estado = new EstadoEquipo();

            /// <summary>Si está puesto, hay que releer el equipo desde ahí.</summary>
            public DateTime? RelerDesde;

            public DateTime? ProximoIntento;
            public int Fallos;
            public string DiaDelConteo;

            public void Dispose()
            {
                try { Cliente?.Dispose(); } catch { /* al cerrar no hay nada que reportar */ }
                try { Turno.Dispose(); } catch { }
                try { TurnoEnvio.Dispose(); } catch { }
            }
        }

        // ── Arranque y parada ────────────────────────────────────────────────

        public void Iniciar()
        {
            if (_iniciado) return;
            _iniciado = true;

            if (!SdkCompilado)
            {
                Bitacora.Aviso("Vía equipo: el agente se compiló SIN el SDK del lector, así que " +
                               "queda deshabilitada. La vía Access no se ve afectada.");
            }

            var cfg = _config();
            if (cfg.EquipoHabilitado && !cfg.ViaAccessLista)
            {
                // Una vez por arranque, para que quien lea la bitácora sepa por
                // qué el agente nunca cede la conexión en este PC.
                Bitacora.Aviso("Vía equipo: este PC no lee el Access.mdb, así que usa los lectores " +
                               "guardados en la configuración y no puede saber si ZKAccess está abierto " +
                               "en otro PC («Ceder la conexión a» solo ve los procesos de ESTE PC). " +
                               "Por el SDK pull no estorba: el equipo admite varias sesiones (medido el 2026-10-20).");
            }

            RevisarMaquinas();
            _pump = new Timer(_ => Pump(), null, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(1));
            Avisar();
        }

        /// <summary>
        /// La configuración cambió. Lo que obliga a reconectar (habilitar,
        /// clave, número de equipo) se aplica soltando las sesiones; el resto es
        /// inmediato.
        /// </summary>
        public void Reconfigurar(Configuracion antes, Configuracion ahora)
        {
            _vigilante.Reconfigurar(ahora.EquipoProcesosCeder);

            var cambioLoDeFondo =
                antes == null ||
                antes.EquipoHabilitado != ahora.EquipoHabilitado ||
                antes.EquipoClaveCommCifrada != ahora.EquipoClaveCommCifrada;

            if (cambioLoDeFondo)
            {
                Bitacora.Info("Vía equipo: la configuración cambió, se sueltan las conexiones.");
                SoltarTodas("configuración cambiada");
            }
            RevisarMaquinas();
            Avisar();
        }

        /// <summary>
        /// Deja de tocar los lectores. Lo usa la ventana de diagnóstico, que
        /// necesita el equipo para ella sola.
        /// </summary>
        public void Pausar(string motivo)
        {
            lock (_candado)
            {
                _pausado = true;
                _motivoPausa = motivo;
            }
            Bitacora.Info("Vía equipo en pausa: " + motivo + ".");
            SoltarTodas(motivo);
            Avisar();
        }

        public void Reanudar()
        {
            lock (_candado)
            {
                _pausado = false;
                _motivoPausa = null;
            }
            Bitacora.Info("Vía equipo reanudada.");
            foreach (var s in Sesiones())
                lock (s.Candado) s.ProximoIntento = null;
            Avisar();
        }

        /// <summary>Menú «Reconectar equipo ahora»: borra las esperas de reintento.</summary>
        public void ReconectarAhora()
        {
            SoltarTodas("reconexión pedida por el usuario");
            foreach (var s in Sesiones())
                lock (s.Candado)
                {
                    s.Fallos = 0;
                    s.ProximoIntento = null;
                }
            Bitacora.Info("Vía equipo: reconexión pedida por el usuario.");
            Avisar();
        }

        /// <summary>
        /// Volvió la red o el PC salió de suspensión. Los lectores sin conexión
        /// se reintentan ya, sin esperar su turno de reintento (que puede ir en
        /// 5 min), y se manda lo que haya en cola. Con <paramref name="releer"/>
        /// —tras una suspensión— también se sueltan los conectados: su TCP
        /// murió durmiendo, y reconectar trae lo que pasó mientras tanto.
        /// </summary>
        public void ReintentarYa(string motivo, bool releer)
        {
            if (releer) SoltarTodas(motivo);
            foreach (var s in Sesiones())
                lock (s.Candado) s.ProximoIntento = null;
            Bitacora.Info("Vía equipo: se reintenta ya (" + motivo + ").");
            LanzarEnvios();
            Avisar();
        }

        /// <summary>
        /// Para todo. Da <paramref name="gracia"/> para que salga lo que esté en
        /// cola: tirarlo sería perder huellas que el equipo quizá ya no
        /// entregue por rango.
        /// </summary>
        public void Detener(TimeSpan gracia)
        {
            try { _pump?.Change(Timeout.Infinite, Timeout.Infinite); } catch { }

            if (EnColaTotal() > 0 && HayDondeMandar())
            {
                Bitacora.Info("Vía equipo: mandando lo que queda en cola antes de cerrar…");
                try
                {
                    var tarea = Task.WhenAll(Sesiones().Select(s => Enviar(s)).ToArray());
                    tarea.Wait(gracia);
                }
                catch (Exception e)
                {
                    Bitacora.Error("No se pudo vaciar la cola al cerrar", e);
                }
            }

            _cancelar.Cancel();
            SoltarTodas("el agente se está cerrando");
        }

        public void Dispose()
        {
            try { _pump?.Dispose(); } catch { }
            foreach (var s in Sesiones()) s.Dispose();
            lock (_candado) _sesiones.Clear();
            try { _gestivo?.Dispose(); } catch { }
            try { _cancelar.Dispose(); } catch { }
            try { _unPump.Dispose(); } catch { }
        }

        // ── Estado para la interfaz ──────────────────────────────────────────

        public EstadoTiempoReal Estado
        {
            get
            {
                var cfg = _config();
                var e = new EstadoTiempoReal
                {
                    Habilitado = cfg.EquipoHabilitado,
                    SdkCompilado = SdkCompilado,
                    ZkAccessAbierto = _vigilante.Abierto,
                    QuienTieneZkAccess = _vigilante.Quien,
                    SegundosDeGracia = _vigilante.SegundosDeGracia(),
                };
                lock (_candado)
                {
                    e.Pausado = _pausado;
                    e.MotivoPausa = _motivoPausa;
                    e.Error = _errorGlobal;
                }
                foreach (var s in Sesiones())
                    lock (s.Candado)
                    {
                        s.Estado.EnCola = s.Cola.Count;
                        e.Equipos.Add(s.Estado.Copia());
                    }
                e.Equipos = e.Equipos.OrderBy(x => x.Id).ToList();
                return e;
            }
        }

        private void Avisar()
        {
            var h = Cambio;
            if (h == null) return;
            try { h(Estado); }
            catch (Exception e) { Bitacora.Error("Fallo al avisar el estado de la vía equipo", e); }
        }

        private List<Sesion> Sesiones()
        {
            lock (_candado) return _sesiones.Values.ToList();
        }

        private int EnColaTotal()
        {
            return Sesiones().Sum(s => { lock (s.Candado) return s.Cola.Count; });
        }

        // ── La lista de lectores ─────────────────────────────────────────────

        /// <summary>
        /// Pide la lista de lectores (de `Machines` o de la copia guardada). Se
        /// usa al arrancar, al cambiar la configuración y, si no hay ningún
        /// lector, cada 5 minutos desde el pump: sin eso, una base que falló al
        /// arrancar dejaba la vía equipo sin lectores hasta el próximo ciclo
        /// Access que saliera bien. En régimen la lista llega por
        /// <see cref="ActualizarEquipos"/> desde la vía Access.
        /// </summary>
        public void RevisarMaquinas()
        {
            try
            {
                ActualizarEquipos(_leerMaquinas());
            }
            catch (Exception e)
            {
                // Se conserva la última lista conocida: la base puede estar
                // bloqueada un momento y eso no es razón para soltar lectores
                // que están funcionando.
                Bitacora.Error("No se pudo leer la lista de lectores de ZKAccess (se conserva la anterior)", e);
                lock (_candado) _errorGlobal = "No se pudo leer la lista de lectores: " + e.Message;
            }
        }

        /// <summary>
        /// La lista de lectores que acaba de leer la vía Access. Da de alta los
        /// nuevos, suelta los retirados y reconecta los que cambiaron de
        /// dirección, sin tocar los que están funcionando.
        /// </summary>
        public void ActualizarEquipos(List<EquipoConfigurado> lista)
        {
            var ahora = ListaEquipos.Usables(lista);
            lock (_candado) _errorGlobal = null;

            var antes = Sesiones().Select(s => s.Equipo).ToList();
            var cambios = ListaEquipos.Diferencias(antes, ahora);

            if (cambios.HayAlgo)
                Bitacora.Info("Lectores en ZKAccess · " + cambios.Resumen());
            else if (antes.Count == 0 && ahora.Count > 0)
                Bitacora.Info("Lectores en ZKAccess: " + string.Join(" · ", ahora.Select(x => x.ToString())));

            foreach (var nuevo in cambios.Altas)
            {
                var s = new Sesion { Equipo = nuevo };
                s.Estado = new EstadoEquipo
                {
                    Id = nuevo.Id,
                    Alias = nuevo.Nombre,
                    Sn = nuevo.Sn,
                    Enlace = nuevo.Enlace,
                    Salud = SaludEquipo.Desconectado,
                };
                lock (_candado) _sesiones[nuevo.Id] = s;
            }

            foreach (var ido in cambios.Bajas)
            {
                Sesion s;
                lock (_candado)
                {
                    if (!_sesiones.TryGetValue(ido.Id, out s)) continue;
                    _sesiones.Remove(ido.Id);
                }
                // Lo que tenga en cola se manda igual antes de soltarlo: son
                // huellas ya captadas y el lector puede no volver.
                Task.Run(async () =>
                {
                    try { await Enviar(s).ConfigureAwait(false); }
                    catch (Exception e) { Bitacora.Error("No se pudo vaciar la cola del lector retirado", e); }
                    finally
                    {
                        await Soltar(s, "retirado de ZKAccess").ConfigureAwait(false);
                        s.Dispose();
                    }
                });
            }

            foreach (var cambiado in cambios.Reconectar)
            {
                Sesion s;
                lock (_candado) if (!_sesiones.TryGetValue(cambiado.Id, out s)) continue;
                s.Equipo = cambiado;
                lock (s.Candado)
                {
                    s.Estado.Enlace = cambiado.Enlace;
                    s.Estado.Alias = cambiado.Nombre;
                    s.Fallos = 0;
                    s.ProximoIntento = null;
                }
                Task.Run(() => Soltar(s, "cambió de dirección"));
            }

            foreach (var retocado in cambios.Retocar)
            {
                Sesion s;
                lock (_candado) if (!_sesiones.TryGetValue(retocado.Id, out s)) continue;
                // El SN que manda es el del equipo, no el de ZKAccess: si ya
                // está conectado, no se le pisa con el de la tabla.
                var sn = s.Cliente != null && s.Cliente.Conectado ? s.Equipo.Sn : retocado.Sn;
                retocado.Sn = sn;
                s.Equipo = retocado;
                lock (s.Candado)
                {
                    s.Estado.Alias = retocado.Nombre;
                    s.Estado.Sn = sn;
                }
            }

            if (cambios.HayAlgo) Avisar();
        }

        // ── El pump ──────────────────────────────────────────────────────────

        private void Pump()
        {
            if (_cancelar.IsCancellationRequested) return;
            // Un tic que se solape con el anterior se salta: el trabajo de
            // verdad va en tareas aparte y ya tiene sus propios turnos.
            if (!_unPump.Wait(0)) return;
            try
            {
                var tic = ++_tic;
                var cfg = _config();

                var flushCada = Math.Max(5, cfg.TiempoRealFlushSeg);

                if (tic % 3 == 0) Vigilar(cfg);
                if (tic % flushCada == 0) LanzarEnvios();
                if (tic % 60 == 0) LanzarLatidos(cfg);
                if (tic % 600 == 0 && cfg.EquipoHabilitado) EscribirResumen();
                // Puede abrir la base: en una tarea, para no frenar el pump.
                if (tic % 300 == 0 && cfg.EquipoHabilitado && Sesiones().Count == 0)
                    Task.Run(() => RevisarMaquinas());
            }
            catch (Exception e)
            {
                Bitacora.Error("Fallo en el ciclo de la vía equipo", e);
            }
            finally
            {
                _unPump.Release();
            }
        }

        /// <summary>
        /// El corazón: decide, para cada lector, si conectar, ceder o esperar.
        /// </summary>
        private void Vigilar(Configuracion cfg)
        {
            var zkAbierto = _vigilante.Revisar();
            var activa = cfg.EquipoHabilitado && SdkCompilado && !Pausa();

            foreach (var s in Sesiones())
            {
                var conectado = s.Cliente != null && s.Cliente.Conectado;

                if (!activa)
                {
                    if (conectado)
                    {
                        var motivo = Pausa() ? "en pausa" : "vía deshabilitada";
                        Task.Run(async () =>
                        {
                            if (!await s.Turno.WaitAsync(0).ConfigureAwait(false)) return;
                            try { await Soltar(s, motivo).ConfigureAwait(false); }
                            finally { s.Turno.Release(); }
                        });
                    }
                    else
                    {
                        Marcar(s, SaludEquipo.Deshabilitado, null);
                    }
                    continue;
                }

                // Perro guardián: el sondeo en vivo completa una vuelta por
                // segundo. Si lleva minutos sin avanzar, una llamada nativa se
                // quedó colgada con el candado del SDK tomado, y ni el latido ni
                // `Soltar` pueden con él (los dos esperan ese candado). Se
                // abandona el cliente y se reconecta con uno nuevo.
                var pull = s.Cliente as ClientePull;
                var sinAvanzar = conectado && pull != null ? pull.SondeoSinAvanzar : null;
                if (sinAvanzar.HasValue && sinAvanzar.Value > SondeoColgado)
                {
                    Bitacora.Aviso("Lector «" + s.Equipo.Nombre + "»: el canal en vivo lleva " +
                                   (int)sinAvanzar.Value.TotalSeconds + " s sin responder (SDK colgado); " +
                                   "se abandona la conexión y se reconecta.");
                    Abandonar(s, cfg);
                    Fallo(s, "El SDK del lector dejó de responder.");
                    continue;
                }

                // Con el SDK pull el MA500 admite varias sesiones (medido el
                // 2026-10-20), así que NO se cede a ZKAccess: cederle dejaba la
                // vía equipo apagada todo el día en el PC donde ZKAccess pasa
                // abierto. Se sigue cediendo con el SDK clásico, que podría no
                // admitirlas.
                var cede = zkAbierto && s.Equipo.TipoSdk == FabricaEquipo.SdkStandalone;
                if (cede)
                {
                    lock (s.Candado)
                    {
                        if (s.Estado.Salud != SaludEquipo.CedidoAZkAccess)
                            Bitacora.Aviso("Lector «" + s.Equipo.Nombre + "» (SDK clásico) cedido a ZKAccess: " +
                                           "sin lectura directa mientras siga abierto.");
                    }
                    if (conectado)
                    {
                        Task.Run(async () =>
                        {
                            // Bajo el turno del lector: ceder puede tardar más
                            // que los 3 s del vigilante, y sin esto el siguiente
                            // tic lanzaría otra cesión encima de la primera.
                            if (!await s.Turno.WaitAsync(0).ConfigureAwait(false)) return;
                            try
                            {
                                // Primero lo que haya en cola: si se suelta sin
                                // mandar, esas huellas esperarían a la reconexión.
                                await Enviar(s).ConfigureAwait(false);
                                await Soltar(s, "ZKAccess abierto").ConfigureAwait(false);
                                Marcar(s, SaludEquipo.CedidoAZkAccess, null);
                            }
                            finally
                            {
                                s.Turno.Release();
                            }
                        });
                    }
                    else
                    {
                        Marcar(s, SaludEquipo.CedidoAZkAccess, null);
                    }
                    continue;
                }

                if (conectado) continue;

                if (s.Equipo.TipoSdk == FabricaEquipo.SdkStandalone && !_vigilante.PuedeConectar()) continue;

                DateTime? proximo;
                lock (s.Candado) proximo = s.ProximoIntento;
                if (proximo.HasValue && DateTime.UtcNow < proximo.Value) continue;

                Task.Run(() => ConectarYPonerseAlDia(s, cfg));
            }
        }

        /// <summary>
        /// Una línea por lector cada 10 min. Con todo bien la vía equipo no
        /// escribía nada, y en la bitácora no se distinguía «sano y sin gente»
        /// de «colgado».
        /// </summary>
        private void EscribirResumen()
        {
            foreach (var s in Sesiones())
            {
                SaludEquipo salud;
                DateTime? ultima;
                int cola;
                lock (s.Candado)
                {
                    salud = s.Estado.Salud;
                    ultima = s.Estado.UltimaHuella;
                    cola = s.Cola.Count;
                }
                Bitacora.Info("Vía equipo · " + s.Equipo.Nombre + " · " + salud +
                              " · última huella " + (ultima.HasValue
                                  ? ultima.Value.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture)
                                  : "ninguna") +
                              " · en cola " + cola + ".");
            }
        }

        private bool Pausa()
        {
            lock (_candado) return _pausado;
        }

        private void LanzarEnvios()
        {
            foreach (var s in Sesiones())
            {
                var sesion = s;
                int enCola;
                lock (sesion.Candado) enCola = sesion.Cola.Count;
                if (enCola == 0) continue;
                Task.Run(() => Enviar(sesion));
            }
        }

        private void LanzarLatidos(Configuracion cfg)
        {
            foreach (var s in Sesiones())
            {
                var sesion = s;
                if (sesion.Cliente == null || !sesion.Cliente.Conectado) continue;
                Task.Run(async () =>
                {
                    if (!await sesion.Turno.WaitAsync(0).ConfigureAwait(false)) return;
                    try
                    {
                        var cliente = sesion.Cliente;
                        if (cliente == null) return;
                        bool vivo;
                        try
                        {
                            vivo = await ConTope(cliente.Ping(sesion.Equipo.Numero), TopeLatido, "El latido")
                                .ConfigureAwait(false);
                        }
                        catch (TimeoutException)
                        {
                            vivo = false;
                        }
                        if (vivo) return;
                        Bitacora.Aviso("El lector «" + sesion.Equipo.Nombre +
                                       "» no responde al latido: se suelta y se reintenta.");
                        // Se anota desde dónde releer: entre el último evento y
                        // la reconexión pudo pasar algo que no llegó.
                        lock (sesion.Candado)
                        {
                            var ultima = sesion.Estado.UltimaHuella;
                            sesion.RelerDesde = (ultima ?? DateTime.Now)
                                .AddMinutes(-Math.Max(1, cfg.EquipoMargenMin));
                        }
                    }
                    finally
                    {
                        sesion.Turno.Release();
                    }
                    await Soltar(sesion, "no responde").ConfigureAwait(false);
                    Fallo(sesion, "El lector dejó de responder.");
                });
            }
        }

        // ── Conectar y ponerse al día ────────────────────────────────────────

        private async Task ConectarYPonerseAlDia(Sesion s, Configuracion cfg)
        {
            if (!await s.Turno.WaitAsync(0).ConfigureAwait(false)) return;
            try
            {
                if (s.Cliente != null && s.Cliente.Conectado) return;
                Marcar(s, SaludEquipo.Conectando, null);

                // 1. Hasta dónde llegó Gestivo con ESTE lector.
                var desde = await DesdeDondeLeer(s, cfg).ConfigureAwait(false);

                // 2. Conectar.
                if (s.Cliente == null)
                {
                    var nuevo = FabricaEquipo.Crear(s.Equipo);
                    s.Cliente = nuevo;
                    nuevo.Evento += ev => Encolar(s, ev);
                    nuevo.Desconectado += () => Task.Run(async () =>
                    {
                        // Un cliente abandonado (SDK colgado) que despierta tarde
                        // no debe tumbar la conexión del que lo reemplazó.
                        if (!ReferenceEquals(s.Cliente, nuevo)) return;
                        await Soltar(s, "el equipo cerró la conexión").ConfigureAwait(false);
                        Fallo(s, "El equipo cerró la conexión.");
                    });
                }

                var info = await ConTope(s.Cliente
                    // La clave que ZKAccess tiene para ESTE lector; la de la
                    // configuracion queda solo como respaldo manual.
                    .Conectar(s.Equipo.Ip, s.Equipo.Puerto, s.Equipo.Numero,
                        s.Equipo.ClaveCommNumerica ?? cfg.EquipoClaveComm),
                    TimeSpan.FromSeconds(60), "Conectar con el lector").ConfigureAwait(false);

                // El SN del EQUIPO manda sobre el de ZKAccess: la llave natural
                // en Gestivo es por serie, y ZKAccess puede tener una vieja.
                if (!string.IsNullOrWhiteSpace(info.Sn) &&
                    !string.Equals(info.Sn, s.Equipo.Sn, StringComparison.OrdinalIgnoreCase))
                {
                    Bitacora.Aviso("El lector «" + s.Equipo.Nombre + "» reporta la serie " + info.Sn +
                                   " y ZKAccess tiene «" + (s.Equipo.Sn ?? "") +
                                   "». Se usa la del equipo.");
                    s.Equipo.Sn = info.Sn;
                    // La marca de avance es por serie: con la serie corregida hay
                    // que volver a preguntar desde dónde.
                    desde = await DesdeDondeLeer(s, cfg).ConfigureAwait(false);
                }

                lock (s.Candado)
                {
                    s.Estado.Sn = s.Equipo.Sn;
                    s.Estado.Firmware = info.Firmware;
                    s.Estado.Registros = info.Registros;
                    s.Estado.MemoriaCasiLlena = info.MemoriaCasiLlena;
                    s.Estado.Desfase = info.Desfase;
                }

                Bitacora.Info("Lector «" + s.Equipo.Nombre + "» conectado · SN " + (info.Sn ?? "?") +
                              " · firmware " + (info.Firmware ?? "?") +
                              " · registros " + info.Ocupacion() +
                              (info.Desfase.HasValue
                                  ? " · reloj " + ((int)info.Desfase.Value.TotalSeconds) + " s"
                                  : ""));
                if (info.Desfase.HasValue && Math.Abs(info.Desfase.Value.TotalSeconds) > 60)
                    Bitacora.Aviso("El reloj del lector «" + s.Equipo.Nombre + "» está desfasado " +
                                   ((int)info.Desfase.Value.TotalSeconds) + " s respecto al PC. " +
                                   "La hora de la huella es la del equipo, así que una marcación de " +
                                   "madrugada podría caer en otro día. Ajústelo desde ZKAccess.");
                if (info.MemoriaCasiLlena)
                    Bitacora.Aviso("La memoria del lector «" + s.Equipo.Nombre + "» va por " +
                                   info.Ocupacion() + ". Con el PC apagado podría perder huellas. " +
                                   "Ver «Vaciar memoria del equipo…» en Configuración.");

                // 3. Eventos ANTES de la lectura.
                //
                // El plan los ponía después; al escribirlo quedó claro que así
                // hay un hueco: lo que pase entre el final de la lectura y el
                // RegEvent no lo trae nadie hasta la próxima reconexión. Al
                // revés no se pierde nada y lo único que puede pasar es que una
                // huella llegue por las dos puertas, que es justo lo que la
                // clave natural y `Vistas` ya colapsan.
                await s.Cliente.RegistrarEventos(s.Equipo.Numero).ConfigureAwait(false);

                // 4. Lo que pasó mientras no estaba. MEJOR ESFUERZO: si falla, NO
                // se tumba la conexión.
                //
                // Importa porque son dos cosas independientes y una funciona sin
                // la otra. Los eventos en vivo —que es la razón de ser de esta
                // vía— ya están suscritos en el paso 3 y llegan solos. La puesta
                // al día solo rellena el hueco de mientras estuvo desconectado, y
                // ese hueco lo cubre igual la vía Access.
                //
                // Sin esto, en este lector la vía entera no arrancaría: sus
                // descargas en bloque devuelven -101, la excepción soltaba la
                // conexión y el agente quedaba en «conectar, fallar, reintentar»
                // sin recibir una sola huella en vivo.
                try
                {
                    var lectura = await ConTope(s.Cliente
                        .LeerRegistros(s.Equipo.Numero, desde, _cancelar.Token),
                        TimeSpan.FromMinutes(5), "La puesta al día").ConfigureAwait(false);
                    foreach (var ev in lectura.Eventos) Encolar(s, ev);

                    Bitacora.Info("Lector «" + s.Equipo.Nombre + "» · puesta al día: " + lectura.Resumen() +
                                  (desde.HasValue
                                      ? " desde " + desde.Value.ToString("yyyy-MM-dd HH:mm",
                                            CultureInfo.InvariantCulture)
                                      : " (memoria completa)"));

                    lock (s.Candado)
                    {
                        s.Estado.LecturaAlConectar = lectura.Resumen();
                        s.RelerDesde = null;
                    }
                }
                catch (OperationCanceledException)
                {
                    throw;
                }
                catch (Exception e)
                {
                    // Se deja anotado desde dónde habría que releer, para que un
                    // intento posterior lo recupere si el equipo algún día acepta
                    // la descarga.
                    lock (s.Candado)
                    {
                        s.RelerDesde = desde;
                        s.Estado.LecturaAlConectar = "no se pudo (" + e.Message + ")";
                    }
                    Bitacora.Aviso("Lector «" + s.Equipo.Nombre + "»: no se pudo poner al día (" +
                                   e.Message + "). Las huellas EN VIVO siguen llegando; el hueco " +
                                   "lo cubre la descarga de ZKAccess.");
                }

                // La conexión está buena y los eventos suscritos: esto es «bien»
                // aunque la puesta al día no haya podido.
                lock (s.Candado)
                {
                    s.Fallos = 0;
                    s.ProximoIntento = null;
                }
                Marcar(s, SaludEquipo.Conectado, null);
            }
            catch (OperationCanceledException)
            {
                // El agente se está cerrando.
            }
            catch (Exception e)
            {
                Bitacora.Error("No se pudo poner al día el lector «" + s.Equipo.Nombre + "»", e);
                try { await Soltar(s, "fallo al conectar").ConfigureAwait(false); } catch { }
                Fallo(s, e.Message);
            }
            finally
            {
                s.Turno.Release();
                Avisar();
            }
        }

        /// <summary>
        /// Desde qué momento pedirle al equipo. La marca vive en el SERVIDOR,
        /// igual que en la vía Access: así reinstalar el PC no pierde nada y dos
        /// agentes no se contradicen.
        ///
        /// Se resta un margen porque el reloj del equipo y el del servidor no
        /// son el mismo, y porque algo pudo quedar en vuelo. Repetir es
        /// inofensivo: la llave natural lo colapsa.
        /// </summary>
        private async Task<DateTime?> DesdeDondeLeer(Sesion s, Configuracion cfg)
        {
            DateTime? releer;
            lock (s.Candado) releer = s.RelerDesde;
            if (releer.HasValue) return releer;

            var cliente = Gestivo();
            if (cliente == null) return null;

            try
            {
                var estado = await cliente.LeerEstado(_cancelar.Token).ConfigureAwait(false);
                var marca = MarcaDeAvance(s.Equipo.Sn, estado.UltimoMomentoEquipo, estado.UltimoMomentoGlobal);
                if (!marca.HasValue) return null;

                return marca.Value.AddMinutes(-Math.Max(1, cfg.EquipoMargenMin));
            }
            catch (Exception e)
            {
                // Sin marca se lee la memoria completa: es lento pero no pierde
                // nada, y el servidor descarta lo repetido.
                Bitacora.Aviso("No se pudo preguntar a Gestivo hasta dónde llegó el lector «" +
                               s.Equipo.Nombre + "» (" + e.Message + "): se leerá la memoria completa.");
                return null;
            }
        }

        /// <summary>
        /// Hasta dónde llegó ESTE lector en Gestivo, sin el margen. PURO.
        ///
        /// Manda la marca del propio SN. Antes se tomaba la más nueva entre esa
        /// y la global, y eso estaba mal: si la global iba adelante —otro lector,
        /// o la vía Access trayendo un tramo reciente— este lector se saltaba su
        /// propio hueco y esas huellas solo llegaban si alguien descargaba en
        /// ZKAccess. La global queda solo para un lector que nunca ha reportado,
        /// para no releer años de memoria la primera vez.
        ///
        /// El SN se busca sin distinguir mayúsculas: el servidor las normaliza,
        /// pero un servidor viejo podría devolver la clave como llegó.
        /// </summary>
        internal static DateTime? MarcaDeAvance(string sn, IDictionary<string, string> porEquipo, string global)
        {
            var buscado = (sn ?? "").Trim();
            if (buscado.Length > 0 && porEquipo != null)
            {
                foreach (var kv in porEquipo)
                {
                    if (!string.Equals((kv.Key ?? "").Trim(), buscado, StringComparison.OrdinalIgnoreCase)) continue;
                    var delLector = ClienteGestivo.ParsearMomento(kv.Value);
                    if (delLector.HasValue) return delLector;
                }
            }
            return ClienteGestivo.ParsearMomento(global);
        }

        private async Task Soltar(Sesion s, string motivo)
        {
            var cliente = s.Cliente;
            if (cliente == null) return;
            try
            {
                // Con tope: desconectar espera el candado del SDK, y si una
                // llamada nativa quedó colgada esperaría para siempre, con el
                // turno del lector tomado por quien llamó.
                var desconectar = cliente.Desconectar();
                if (await Task.WhenAny(desconectar, Task.Delay(TopeSoltar)).ConfigureAwait(false) != desconectar)
                {
                    Bitacora.Aviso("Lector «" + s.Equipo.Nombre + "»: no se pudo soltar en " +
                                   (int)TopeSoltar.TotalSeconds + " s (" + motivo + "); se abandona la conexión.");
                    Abandonar(s, null);
                }
                else
                {
                    await desconectar.ConfigureAwait(false);
                    Bitacora.Info("Lector «" + s.Equipo.Nombre + "»: conexión soltada (" + motivo + ").");
                }
            }
            catch (Exception e)
            {
                Bitacora.Error("Fallo al soltar el lector «" + s.Equipo.Nombre + "»", e);
            }
            Avisar();
        }

        /// <summary>
        /// Espera <paramref name="tarea"/> como mucho <paramref name="tope"/>. Las
        /// llamadas al SDK corren con el turno del lector tomado: sin tope, una
        /// que no vuelva lo deja tomado para siempre y todo lo demás de ese
        /// lector se salta en silencio. La tarea abandonada sigue sola; si
        /// termina mal después, su excepción se observa aquí para que no quede
        /// suelta.
        /// </summary>
        private static async Task<T> ConTope<T>(Task<T> tarea, TimeSpan tope, string que)
        {
            if (await Task.WhenAny(tarea, Task.Delay(tope)).ConfigureAwait(false) != tarea)
            {
                var _ = tarea.ContinueWith(t => { var x = t.Exception; },
                    TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously);
                throw new TimeoutException(que + " no respondió en " + (int)tope.TotalSeconds + " s.");
            }
            return await tarea.ConfigureAwait(false);
        }

        /// <summary>
        /// Deja de usar el cliente actual SIN cerrarlo: cerrarlo esperaría el
        /// candado que tiene tomado la llamada colgada. Quedan un hilo y un
        /// socket perdidos hasta que el SDK vuelva o el agente se reinicie, que
        /// es mucho mejor que un lector muerto todo el día. La próxima conexión
        /// crea un cliente (y un handle) nuevo, y relee desde antes de la última
        /// huella para cubrir el hueco.
        /// </summary>
        private void Abandonar(Sesion s, Configuracion cfg)
        {
            var margen = Math.Max(1, (cfg ?? _config()).EquipoMargenMin);
            lock (s.Candado)
            {
                if (!s.RelerDesde.HasValue)
                    s.RelerDesde = (s.Estado.UltimaHuella ?? DateTime.Now).AddMinutes(-margen);
            }
            s.Cliente = null;
        }

        private void SoltarTodas(string motivo)
        {
            foreach (var s in Sesiones())
            {
                var sesion = s;
                try { Soltar(sesion, motivo).Wait(TimeSpan.FromSeconds(5)); }
                catch (Exception e) { Bitacora.Error("Fallo al soltar un lector", e); }
            }
        }

        private void Marcar(Sesion s, SaludEquipo salud, string error)
        {
            var cambio = false;
            lock (s.Candado)
            {
                if (s.Estado.Salud != salud)
                {
                    s.Estado.Salud = salud;
                    s.Estado.Desde = DateTime.Now;
                    cambio = true;
                }
                if (s.Estado.Error != error)
                {
                    s.Estado.Error = error;
                    cambio = true;
                }
            }
            if (cambio) Avisar();
        }

        private void Fallo(Sesion s, string error)
        {
            int espera;
            lock (s.Candado)
            {
                s.Fallos++;
                espera = Reintentos[Math.Min(s.Fallos - 1, Reintentos.Length - 1)];
                s.ProximoIntento = DateTime.UtcNow.AddSeconds(espera);
                s.Estado.Reintentos = s.Fallos;
                s.Estado.ProximoIntento = DateTime.Now.AddSeconds(espera);
            }
            Marcar(s, SaludEquipo.Error, error);
            Bitacora.Aviso("Lector «" + s.Equipo.Nombre + "»: se reintenta en " + espera + " s.");
        }

        // ── La cola ──────────────────────────────────────────────────────────

        /// <summary>
        /// Guarda un evento para mandarlo. Lo llama el hilo del COM, así que no
        /// puede hacer nada lento ni lanzar.
        /// </summary>
        private void Encolar(Sesion s, EventoEquipo ev)
        {
            try
            {
                string motivo;
                if (!MapeoEquipo.EsValida(ev, out motivo))
                {
                    Bitacora.Aviso("Lector «" + s.Equipo.Nombre + "»: se omite un evento (" + motivo + ").");
                    return;
                }

                var clave = MapeoEquipo.Clave(s.Equipo.Sn, ev);
                var hoy = DateTime.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

                lock (s.Candado)
                {
                    // Lo mismo puede llegar por las dos puertas: en vivo y en la
                    // lectura de puesta al día. El servidor también lo colapsa,
                    // pero mandarlo dos veces sería gastar red por nada.
                    if (!s.Vistas.Add(clave))
                    {
                        s.Estado.RepetidasDescartadas++;
                        return;
                    }
                    s.OrdenVistas.Enqueue(clave);
                    while (s.OrdenVistas.Count > VistasMaximas) s.Vistas.Remove(s.OrdenVistas.Dequeue());

                    s.Cola.Add(ev);

                    if (s.DiaDelConteo != hoy)
                    {
                        s.DiaDelConteo = hoy;
                        s.Estado.HuellasHoy = 0;
                        s.Estado.EnviadasHoy = 0;
                    }
                    s.Estado.HuellasHoy++;
                    s.Estado.UltimaHuella = ev.Momento;
                    s.Estado.UltimoPin = ev.Pin;
                    s.Estado.EnCola = s.Cola.Count;

                    if (s.Cola.Count > ColaDesborde)
                    {
                        // Gestivo lleva mucho rato sin aceptar nada. Se suelta
                        // la cola para no crecer sin tope y se anota desde dónde
                        // releer el equipo: la memoria del lector sigue
                        // teniéndolo todo, así que no se pierde.
                        var masVieja = s.Cola.Min(x => x.Momento);
                        s.RelerDesde = masVieja.AddMinutes(-1);
                        s.Cola.Clear();
                        s.Vistas.Clear();
                        s.OrdenVistas.Clear();
                        Bitacora.Aviso("Lector «" + s.Equipo.Nombre + "»: la cola pasó de " +
                                       ColaDesborde + " sin poder mandar. Se suelta y se releerá del " +
                                       "equipo desde " + masVieja.ToString("yyyy-MM-dd HH:mm",
                                           CultureInfo.InvariantCulture) + ".");
                    }
                }

                if (ev.Fuente == FuenteEvento.TiempoReal)
                    Bitacora.Info("Huella en vivo · " + s.Equipo.Nombre + " · " + ev);
            }
            catch (Exception e)
            {
                Bitacora.Error("No se pudo encolar un evento del lector «" + s.Equipo.Nombre + "»", e);
            }
        }

        // ── El envío ─────────────────────────────────────────────────────────

        private bool HayDondeMandar()
        {
            return Gestivo() != null;
        }

        /// <summary>
        /// El cliente HTTP, uno para todo el proceso. Se rehace solo si cambió
        /// la URL o el secreto: crear uno por envío agota los sockets.
        /// </summary>
        private ClienteGestivo Gestivo()
        {
            var cfg = _config();
            if (string.IsNullOrWhiteSpace(cfg.Url)) return null;
            var secreto = cfg.Secreto;
            if (string.IsNullOrEmpty(secreto)) return null;

            lock (_candado)
            {
                if (_gestivo != null && _urlDelCliente == cfg.Url && _secretoDelCliente == secreto)
                    return _gestivo;
                try { _gestivo?.Dispose(); } catch { }
                _gestivo = new ClienteGestivo(cfg.Url, secreto);
                _urlDelCliente = cfg.Url;
                _secretoDelCliente = secreto;
                return _gestivo;
            }
        }

        private DateTime _ultimoAvisoSinGestivo = DateTime.MinValue;

        private async Task Enviar(Sesion s)
        {
            if (!await s.TurnoEnvio.WaitAsync(0).ConfigureAwait(false)) return;
            try
            {
                var cliente = Gestivo();
                if (cliente == null)
                {
                    // Las huellas siguen en cola y saldrán cuando se arregle;
                    // pero que se sepa, una vez por hora.
                    if (DateTime.UtcNow - _ultimoAvisoSinGestivo > TimeSpan.FromHours(1))
                    {
                        _ultimoAvisoSinGestivo = DateTime.UtcNow;
                        Bitacora.Aviso("Vía equipo: hay huellas en cola pero falta la URL o el secreto de Gestivo " +
                                       "(o no se pudo descifrar): no se envían hasta corregir la configuración.");
                    }
                    return;
                }
                var cfg = _config();

                while (true)
                {
                    List<EventoEquipo> lote;
                    lock (s.Candado)
                    {
                        if (s.Cola.Count == 0) return;
                        var cuantas = Math.Min(LoteMaximo, s.Cola.Count);
                        lote = s.Cola.GetRange(0, cuantas);
                        s.Cola.RemoveRange(0, cuantas);
                        s.Estado.EnCola = s.Cola.Count;
                    }

                    var marcaciones = lote.Select(ev => MapeoEquipo.AMarcacion(ev, s.Equipo)).ToList();

                    try
                    {
                        var r = await cliente
                            .Enviar(cfg.NombreAgente + " (equipo)", null, marcaciones, _cancelar.Token)
                            .ConfigureAwait(false);

                        lock (s.Candado)
                        {
                            s.Estado.UltimoEnvio = DateTime.Now;
                            s.Estado.EnviadasHoy += marcaciones.Count;
                        }
                        Bitacora.Info("Lector «" + s.Equipo.Nombre + "» · enviadas " + marcaciones.Count +
                                      " · nuevas " + r.Nuevas + " · completadas " + r.Completadas +
                                      " · repetidas " + r.Repetidas +
                                      " · quedan en cola " + s.Estado.EnCola);
                    }
                    catch (ErrorGestivo e) when (e.SeDescarta)
                    {
                        // SOLO el 400 descarta, y por una razón precisa: el
                        // servidor validó el lote y lo rechazó por mal formado,
                        // así que reintentar lo MISMO no lo va a arreglar nunca y
                        // atascaría todo lo que venga detrás para siempre. Queda
                        // en la bitácora con el tramo y los pines para poder
                        // rescatarlo a mano.
                        Bitacora.Error("Gestivo RECHAZÓ por mal formado " + marcaciones.Count +
                                       " huella(s) del lector «" + s.Equipo.Nombre +
                                       "» y se descartan: " + e.Message + " · tramo " + Tramo(lote), e);
                        continue;
                    }
                    catch (Exception e)
                    {
                        // Red, 5xx, 413: vuelven al frente de la cola, en orden.
                        lock (s.Candado)
                        {
                            s.Cola.InsertRange(0, lote);
                            s.Estado.EnCola = s.Cola.Count;
                        }
                        // Todo lo demás vuelve a la cola, al frente y en orden:
                        // sin red, servidor caído (5xx), lote grande (413) y
                        // también el secreto o la URL equivocados (401/404), que
                        // son de CONFIGURACIÓN. Tirar huellas porque el secreto
                        // está mal sería perderlas por algo que se arregla en la
                        // ventana de Configuración.
                        Bitacora.Aviso("No se pudieron enviar " + marcaciones.Count +
                                       " huella(s) del lector «" + s.Equipo.Nombre +
                                       "» (" + e.Message + "): vuelven a la cola y se reintenta.");
                        return;
                    }
                }
            }
            catch (OperationCanceledException)
            {
                // Cerrando.
            }
            catch (Exception e)
            {
                Bitacora.Error("Fallo al enviar las huellas del lector «" + s.Equipo.Nombre + "»", e);
            }
            finally
            {
                s.TurnoEnvio.Release();
                Avisar();
            }
        }

        private static string Tramo(List<EventoEquipo> lote)
        {
            if (lote == null || lote.Count == 0) return "(vacío)";
            var orden = lote.OrderBy(x => x.Momento).ToList();
            return orden[0].Momento.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) + " a " +
                   orden[orden.Count - 1].Momento.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) +
                   " · pines " + string.Join(",", orden.Select(x => x.Pin).Distinct().Take(20));
        }

        // ── Vaciar la memoria del equipo (solo a mano) ───────────────────────

        /// <summary>
        /// Lee TODO lo que tiene el equipo, confirma que Gestivo lo aceptó y
        /// solo entonces borra su memoria.
        ///
        /// NUNCA se llama sola: la dispara el botón «Vaciar memoria del
        /// equipo…», que antes muestra cuántos registros hay y pide
        /// confirmación. No existe ningún vaciado por umbral ni por horario;
        /// es una decisión explícita del usuario (2026-10-20).
        ///
        /// Si cualquier envío falla se aborta sin borrar nada. Una huella que
        /// caiga entre la lectura y el borrado llega igual por
        /// `OnAttTransactionEx`, porque la suscripción sigue viva.
        /// </summary>
        public async Task<string> VaciarMemoria(int equipoId, Action<string> contar)
        {
            Sesion s;
            lock (_candado)
            {
                if (!_sesiones.TryGetValue(equipoId, out s))
                    throw new InvalidOperationException("Ese lector ya no está en la lista de ZKAccess.");
            }
            Action<string> decir = t =>
            {
                if (contar != null) contar(t);
                Bitacora.Info("VACIADO · " + t);
            };

            var cfg = _config();
            var cliente = Gestivo();
            if (cliente == null)
                throw new InvalidOperationException(
                    "Falta la URL o el secreto de Gestivo: sin poder confirmar que recibió las " +
                    "huellas, no se borra nada.");

            if (!await s.Turno.WaitAsync(TimeSpan.FromSeconds(30)).ConfigureAwait(false))
                throw new InvalidOperationException(
                    "El lector está ocupado (leyendo o conectándose). Inténtelo en un momento.");
            try
            {
                if (s.Cliente == null || !s.Cliente.Conectado)
                    throw new InvalidOperationException(
                        "El lector no está conectado. Cierre ZKAccess si lo tiene abierto y espere " +
                        "a que el estado diga «conectado».");

                var co = CultureInfo.GetCultureInfo("es-CO");

                decir("1/4 · Leyendo la memoria completa del lector «" + s.Equipo.Nombre + "»…");
                var lectura = await s.Cliente
                    .LeerRegistros(s.Equipo.Numero, null, _cancelar.Token)
                    .ConfigureAwait(false);
                decir("      " + lectura.Resumen());

                var validas = new List<EventoEquipo>();
                foreach (var ev in lectura.Eventos)
                {
                    string motivo;
                    if (MapeoEquipo.EsValida(ev, out motivo)) validas.Add(ev);
                }
                decir("      " + validas.Count.ToString("N0", co) + " aprovechables de " +
                      lectura.Eventos.Count.ToString("N0", co) + ".");

                decir("2/4 · Enviando a Gestivo y comprobando que las aceptó TODAS…");
                var enviadas = 0;
                for (var i = 0; i < validas.Count; i += LoteMaximo)
                {
                    var trozo = validas.GetRange(i, Math.Min(LoteMaximo, validas.Count - i));
                    var marcaciones = trozo.Select(ev => MapeoEquipo.AMarcacion(ev, s.Equipo)).ToList();
                    var r = await cliente
                        .Enviar(cfg.NombreAgente + " (vaciado)", null, marcaciones, _cancelar.Token)
                        .ConfigureAwait(false);

                    // La cuenta tiene que cerrar EXACTA. Si no, se aborta: es
                    // justo lo que separa un vaciado seguro de perder huellas.
                    var contabilizadas = r.Nuevas + r.Repetidas + r.Completadas;
                    if (r.Recibidas != marcaciones.Count || contabilizadas != marcaciones.Count)
                        throw new InvalidOperationException(
                            "Gestivo no confirmó todas las huellas del tramo " + (i + 1) + "-" +
                            (i + trozo.Count) + " (mandadas " + marcaciones.Count + ", recibidas " +
                            r.Recibidas + ", contabilizadas " + contabilizadas +
                            "). NO se borró nada del equipo.");

                    enviadas += marcaciones.Count;
                    decir("      " + enviadas.ToString("N0", co) + " / " +
                          validas.Count.ToString("N0", co) + " confirmadas.");
                }

                decir("3/4 · Borrando los registros del lector…");
                if (!await s.Cliente.Vaciar(s.Equipo.Numero).ConfigureAwait(false))
                    throw new InvalidOperationException(
                        "El equipo no aceptó la orden de borrado. No se borró nada; las huellas ya " +
                        "están en Gestivo, así que puede reintentarlo.");

                decir("4/4 · Comprobando el contador del equipo…");
                var despues = await s.Cliente.Consultar(s.Equipo.Numero).ConfigureAwait(false);
                lock (s.Candado)
                {
                    s.Estado.Registros = despues.Registros;
                    s.Estado.MemoriaCasiLlena = despues.MemoriaCasiLlena;
                }
                decir("      El equipo ahora reporta: " + despues.Ocupacion() + ".");

                var resumen = "Vaciado listo. " + validas.Count.ToString("N0", co) +
                              " huella(s) confirmadas por Gestivo antes de borrar; el equipo quedó en " +
                              despues.Ocupacion() + ".";
                Bitacora.Info("VACIADO · " + resumen);
                Avisar();
                return resumen;
            }
            finally
            {
                s.Turno.Release();
            }
        }

        // ── Diagnóstico ──────────────────────────────────────────────────────

        /// <summary>Los lectores que la ventana de diagnóstico puede probar.</summary>
        public List<EquipoConfigurado> EquiposConocidos()
        {
            return Sesiones().Select(s => s.Equipo).OrderBy(e => e.Id).ToList();
        }
    }
}
