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
    /// De `Machines` de ZKAccess, no de la configuración del agente: ver
    /// <see cref="ListaEquipos"/>. Un lector nuevo entra solo.
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
        /// Abre la base y relee `Machines`. Solo se usa al arrancar: en régimen
        /// la lista llega por <see cref="ActualizarEquipos"/> desde la vía
        /// Access, que ya tiene la base abierta en cada ciclo.
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

                if (zkAbierto)
                {
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

                if (!_vigilante.PuedeConectar()) continue;

                DateTime? proximo;
                lock (s.Candado) proximo = s.ProximoIntento;
                if (proximo.HasValue && DateTime.UtcNow < proximo.Value) continue;

                Task.Run(() => ConectarYPonerseAlDia(s, cfg));
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
                        var vivo = await sesion.Cliente.Ping(sesion.Equipo.Numero).ConfigureAwait(false);
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
                    s.Cliente = FabricaEquipo.Crear(s.Equipo);
                    s.Cliente.Evento += ev => Encolar(s, ev);
                    s.Cliente.Desconectado += () => Task.Run(async () =>
                    {
                        await Soltar(s, "el equipo cerró la conexión").ConfigureAwait(false);
                        Fallo(s, "El equipo cerró la conexión.");
                    });
                }

                var info = await s.Cliente
                    // La clave que ZKAccess tiene para ESTE lector; la de la
                    // configuracion queda solo como respaldo manual.
                    .Conectar(s.Equipo.Ip, s.Equipo.Puerto, s.Equipo.Numero,
                        s.Equipo.ClaveCommNumerica ?? cfg.EquipoClaveComm)
                    .ConfigureAwait(false);

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
                    var lectura = await s.Cliente
                        .LeerRegistros(s.Equipo.Numero, desde, _cancelar.Token)
                        .ConfigureAwait(false);
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
                var sn = (s.Equipo.Sn ?? "").Trim();

                DateTime? delLector = null;
                if (sn.Length > 0 && estado.UltimoMomentoEquipo != null)
                {
                    string iso;
                    if (estado.UltimoMomentoEquipo.TryGetValue(sn, out iso))
                        delLector = ClienteGestivo.ParsearMomento(iso);
                }
                var global = ClienteGestivo.ParsearMomento(estado.UltimoMomentoGlobal);

                // El más nuevo de los dos: si este lector nunca ha reportado,
                // el global evita releer años de memoria la primera vez.
                DateTime? marca = delLector;
                if (!marca.HasValue || (global.HasValue && global.Value > marca.Value)) marca = global;
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

        private async Task Soltar(Sesion s, string motivo)
        {
            var cliente = s.Cliente;
            if (cliente == null) return;
            try
            {
                await cliente.Desconectar().ConfigureAwait(false);
                Bitacora.Info("Lector «" + s.Equipo.Nombre + "»: conexión soltada (" + motivo + ").");
            }
            catch (Exception e)
            {
                Bitacora.Error("Fallo al soltar el lector «" + s.Equipo.Nombre + "»", e);
            }
            Avisar();
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

        private async Task Enviar(Sesion s)
        {
            if (!await s.TurnoEnvio.WaitAsync(0).ConfigureAwait(false)) return;
            try
            {
                var cliente = Gestivo();
                if (cliente == null) return;
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
