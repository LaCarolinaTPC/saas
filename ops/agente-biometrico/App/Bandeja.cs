using System;
using System.Drawing;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Collections.Generic;
using Gestivo.AgenteBiometrico.Datos;
using Gestivo.AgenteBiometrico.Dispositivo;
using Gestivo.AgenteBiometrico.Nucleo;
using Gestivo.AgenteBiometrico.Recursos;
using Gestivo.AgenteBiometrico.Sincronizacion;

namespace Gestivo.AgenteBiometrico.App
{
    /// <summary>
    /// El agente vive aquí: un icono en la bandeja del sistema, un temporizador
    /// y el menú. No hay ventana principal; las de Configuración y Estado se
    /// abren desde el menú.
    /// </summary>
    public class Bandeja : IDisposable
    {
        private readonly NotifyIcon _icono;
        // Timer de WinForms (no el de System.Threading): su Tick llega en el
        // hilo de la interfaz, que es donde vive el icono de la bandeja.
        private readonly System.Windows.Forms.Timer _reloj;
        private readonly Sincronizador _sinc;
        private readonly TiempoReal _tiempoReal;
        private readonly CancellationTokenSource _cancelar = new CancellationTokenSource();

        /// <summary>
        /// El contexto del hilo de la INTERFAZ, capturado al construir. Program
        /// instala el de WinForms antes de llegar aquí, así que esto es el hilo
        /// de la bandeja. Ver `BeginInvokeEnHilo`.
        /// </summary>
        private readonly SynchronizationContext _interfaz = SynchronizationContext.Current;

        private static readonly CultureInfo Co = CultureInfo.GetCultureInfo("es-CO");

        private Configuracion _cfg;
        private FormConfiguracion _ventanaConfig;
        private FormEstado _ventanaEstado;
        private FormDiagnosticoEquipo _ventanaDiagnostico;
        // El globo solo sale cuando la salud CAMBIA: si no, un PC sin red
        // avisaría cada 15 minutos para siempre.
        private Salud _saludAvisada = Salud.SinConfigurar;

        public Bandeja()
        {
            _cfg = Configuracion.Cargar();
            _sinc = new Sincronizador(() => _cfg);
            _sinc.Cambio += EnCambioDeEstado;

            // La vía equipo: lee las huellas directo del lector por el SDK.
            // Viene apagada hasta que alguien marque la casilla, así que crearla
            // no cambia nada por sí solo.
            _tiempoReal = new TiempoReal(() => _cfg, LeerEquiposDeZkAccess);
            _tiempoReal.Cambio += _ => BeginInvokeEnHilo(() => Pintar(_sinc.Estado));
            // La lista de lectores la publica la vía Access, que ya abre la base
            // en cada ciclo: así un lector nuevo entra solo y sin sondear nada.
            _sinc.EquiposLeidos += lista => _tiempoReal.ActualizarEquipos(lista);

            _icono = new NotifyIcon
            {
                Icon = Iconos.Neutro,
                Text = "Agente del biométrico · Gestivo",
                Visible = true,
                ContextMenuStrip = ConstruirMenu(),
            };
            _icono.DoubleClick += (s, e) => AbrirEstado();

            _reloj = new System.Windows.Forms.Timer
            {
                Interval = Math.Max(1, _cfg.IntervaloMin) * 60 * 1000,
            };
            _reloj.Tick += async (s, e) => await _sinc.Ciclo(_cancelar.Token).ConfigureAwait(false);
            _reloj.Start();

            Bitacora.Info("Agente iniciado. Intervalo: " + _cfg.IntervaloMin + " min.");

            if (!_cfg.EstaCompleta)
            {
                // Primera vez: sin esto el usuario ve un icono y no sabe qué hacer.
                Globo("Falta configurar", "Abra Configuración para indicar la URL de Gestivo, el secreto y la base del biométrico.", ToolTipIcon.Warning);
                BeginInvokeEnHilo(AbrirConfiguracion);
            }
            else
            {
                // Un primer ciclo al arrancar, sin esperar el intervalo. La vía
                // equipo arranca DESPUÉS: su primer paso es preguntarle al
                // servidor hasta dónde llegó cada lector, y el primer ciclo ya
                // deja esa marca al día.
                Task.Run(async () =>
                {
                    await _sinc.Ciclo(_cancelar.Token).ConfigureAwait(false);
                    try { _tiempoReal.Iniciar(); }
                    catch (Exception e) { Bitacora.Error("No se pudo iniciar la vía equipo", e); }
                });
            }
        }

        /// <summary>
        /// La lista de lectores de ZKAccess, abriendo la base solo para eso. La
        /// usa la vía equipo al arrancar; después le llega por `EquiposLeidos`
        /// sin volver a abrirla.
        /// </summary>
        private List<EquipoConfigurado> LeerEquiposDeZkAccess()
        {
            if (string.IsNullOrWhiteSpace(_cfg.Mdb)) return new List<EquipoConfigurado>();
            var proveedor = Proveedor.Resolver(_cfg.Proveedor);
            using (var lector = new LectorZk(proveedor, _cfg.Mdb, _cfg.ClaveMdb))
                return lector.LeerEquipos();
        }

        // ── Menú ─────────────────────────────────────────────────────────────

        private ContextMenuStrip ConstruirMenu()
        {
            var menu = new ContextMenuStrip();

            menu.Items.Add("Estado…", null, (s, e) => AbrirEstado());
            menu.Items.Add("Sincronizar ahora", null, async (s, e) =>
                await _sinc.Ciclo(_cancelar.Token, manual: true).ConfigureAwait(false));
            menu.Items.Add("Reconectar equipo ahora", null, (s, e) => _tiempoReal.ReconectarAhora());
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Configuración…", null, (s, e) => AbrirConfiguracion());

            var autoinicio = new ToolStripMenuItem("Iniciar con Windows")
            {
                CheckOnClick = false,
                Checked = Autoinicio.Activo,
            };
            autoinicio.Click += (s, e) =>
            {
                var quiere = !autoinicio.Checked;
                if (Autoinicio.Establecer(quiere)) autoinicio.Checked = quiere;
                else
                    MessageBox.Show(
                        "No se pudo cambiar el inicio automático. Vea la bitácora.",
                        "Agente del biométrico", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            };
            // El estado real puede haber cambiado por fuera entre aperturas.
            menu.Opening += (s, e) => autoinicio.Checked = Autoinicio.Activo;
            menu.Items.Add(autoinicio);

            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Abrir bitácora", null, (s, e) => Abrir(Bitacora.RutaDeHoy));
            menu.Items.Add("Abrir carpeta de datos", null, (s, e) => Abrir(Configuracion.CarpetaDatos));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Acerca de", null, (s, e) => MostrarAcercaDe());
            menu.Items.Add("Salir", null, (s, e) => Salir());

            return menu;
        }

        private void MostrarAcercaDe()
        {
            var v = typeof(Bandeja).Assembly.GetName().Version;
            MessageBox.Show(
                "Agente del biométrico · Gestivo\nVersión " + v + "\n\n" +
                "Lee las marcaciones de huella y las envía a Gestivo.\n" +
                "Solo LEE la base del biométrico: nunca la modifica.\n\n" +
                // Decirlo aquí ahorra una persecución: sin el SDK no hay tiempo
                // real por más que se marque la casilla, y eso no se ve en
                // ningún otro sitio de la aplicación.
                "Lectura directa del lector: " +
                (TiempoReal.SdkCompilado ? "disponible" : "NO (compilado sin el SDK)") + "\n\n" +
                "Configuración: " + Configuracion.RutaConfig,
                "Acerca de", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        // ── Ventanas ─────────────────────────────────────────────────────────

        private void AbrirConfiguracion()
        {
            if (_ventanaConfig != null && !_ventanaConfig.IsDisposed)
            {
                _ventanaConfig.Activate();
                return;
            }
            var antes = _cfg;
            _ventanaConfig = new FormConfiguracion(
                _cfg,
                AbrirDiagnostico,
                () => _tiempoReal.Estado,
                VaciarMemoriaDelEquipo);
            _ventanaConfig.FormClosed += (s, e) =>
            {
                if (_ventanaConfig.Guardado)
                {
                    _cfg = _ventanaConfig.Resultado;
                    _cfg.Guardar();
                    _reloj.Interval = Math.Max(1, _cfg.IntervaloMin) * 60 * 1000;
                    Bitacora.Info("Configuración guardada. Intervalo: " + _cfg.IntervaloMin + " min.");
                    try
                    {
                        _tiempoReal.Reconfigurar(antes, _cfg);
                        // Si la vía equipo se acaba de habilitar, hay que
                        // arrancarla: `Iniciar` es idempotente.
                        if (_cfg.EquipoHabilitado) _tiempoReal.Iniciar();
                    }
                    catch (Exception ex) { Bitacora.Error("No se pudo reconfigurar la vía equipo", ex); }
                    // Se aplica de inmediato: el usuario acaba de arreglar algo.
                    Task.Run(async () => await _sinc.Ciclo(_cancelar.Token, manual: true).ConfigureAwait(false));
                }
                _ventanaConfig = null;
            };
            _ventanaConfig.Show();
            _ventanaConfig.Activate();
        }

        private void AbrirEstado()
        {
            if (_ventanaEstado != null && !_ventanaEstado.IsDisposed)
            {
                _ventanaEstado.Activate();
                return;
            }
            _ventanaEstado = new FormEstado(
                () => _sinc.Estado,
                () => _tiempoReal.Estado,
                () => _cfg,
                async () => await _sinc.Ciclo(_cancelar.Token, manual: true).ConfigureAwait(false),
                AbrirConfiguracion);
            _ventanaEstado.FormClosed += (s, e) => _ventanaEstado = null;
            _ventanaEstado.Show();
            _ventanaEstado.Activate();
        }

        // ── Estado ───────────────────────────────────────────────────────────

        private void EnCambioDeEstado(EstadoAgente e)
        {
            BeginInvokeEnHilo(() => Pintar(e));
        }

        private void Pintar(EstadoAgente e)
        {
            var eq = _tiempoReal.Estado;

            // El semáforo, por severidad: rojo (algo está mal de verdad) gana
            // sobre azul (trabajando), que gana sobre ámbar (la vía Access va
            // bien pero el equipo no está dando tiempo real), que gana sobre
            // verde. El ámbar es nuevo: sin él, «cedido a ZKAccess» se vería
            // igual que «todo al día» y nadie sabría por qué no entran huellas.
            var equipoRenqueando = eq.Habilitado && (eq.HayProblema || eq.AlgunoCedido);
            _icono.Icon = e.Salud == Salud.Mal
                ? Iconos.Mal
                : e.Salud == Salud.Trabajando
                    ? Iconos.Trabajando
                    : e.Salud == Salud.Bien
                        ? (equipoRenqueando ? Iconos.AMedias : Iconos.Bien)
                        : Iconos.Neutro;

            // OJO: NotifyIcon.Text tope duro de 63 caracteres en .NET Framework;
            // pasarse LANZA una excepción y tumba el ciclo (pasó en pruebas). Por
            // eso el tooltip es corto y el detalle completo vive en «Estado…».
            string texto;
            if (e.Salud == Salud.Trabajando && !string.IsNullOrEmpty(e.Progreso))
                texto = e.Progreso;
            else if (e.Salud == Salud.Mal)
                texto = "Gestivo · error al enviar (abra Estado…)";
            else if (e.Salud == Salud.SinConfigurar)
                texto = "Gestivo · falta configurar";
            else if (e.UltimoExito.HasValue)
                texto = "Gestivo " + e.UltimoExito.Value.ToString("HH:mm", CultureInfo.InvariantCulture) +
                        (e.Pendientes > 0
                            ? " · faltan " + e.Pendientes.ToString("N0", Co)
                            : " · " + e.NuevasUltimoCiclo + " nuevas") +
                        EtiquetaDelEquipo(eq);
            else
                texto = "Agente del biométrico · Gestivo";

            _icono.Text = texto.Length > 63 ? texto.Substring(0, 62) + "…" : texto;

            // Solo en los cambios: pasar a rojo y volver a verde.
            if (e.Salud != _saludAvisada)
            {
                if (e.Salud == Salud.Mal)
                    Globo("No se pudieron enviar las marcaciones",
                        (e.UltimoError ?? "").Length > 200 ? e.UltimoError.Substring(0, 200) + "…" : e.UltimoError,
                        ToolTipIcon.Error);
                else if (e.Salud == Salud.Bien && _saludAvisada == Salud.Mal)
                    Globo("Conexión restablecida", "Las marcaciones volvieron a enviarse.", ToolTipIcon.Info);

                if (e.Salud != Salud.Trabajando) _saludAvisada = e.Salud;
            }

            _ventanaEstado?.Refrescar();
        }

        /// <summary>
        /// Lo que se le añade al tooltip por la vía equipo. Corto a propósito:
        /// NotifyIcon.Text tiene un tope duro de 63 caracteres en .NET Framework
        /// y pasarse LANZA una excepción, así que el detalle vive en «Estado…».
        /// </summary>
        private static string EtiquetaDelEquipo(EstadoTiempoReal eq)
        {
            if (!eq.Habilitado) return "";
            if (!eq.SdkCompilado) return " · sin SDK";
            if (eq.Pausado) return " · equipo en pausa";
            if (eq.AlgunoCedido) return " · equipo→ZKAccess";
            if (eq.HayProblema) return " · equipo sin conexión";
            var ultima = eq.UltimaHuella;
            var cola = eq.EnCola;
            return " · equipo" +
                   (ultima.HasValue ? " " + ultima.Value.ToString("HH:mm", CultureInfo.InvariantCulture) : " ✓") +
                   (cola > 0 ? " (" + cola + " en cola)" : "");
        }

        private void AbrirDiagnostico()
        {
            if (_ventanaDiagnostico != null && !_ventanaDiagnostico.IsDisposed)
            {
                _ventanaDiagnostico.Activate();
                return;
            }
            _ventanaDiagnostico = new FormDiagnosticoEquipo(
                LeerEquiposDeZkAccess,
                () => _cfg,
                motivo => _tiempoReal.Pausar(motivo),
                () => _tiempoReal.Reanudar());
            _ventanaDiagnostico.FormClosed += (s, e) => _ventanaDiagnostico = null;
            _ventanaDiagnostico.Show();
            _ventanaDiagnostico.Activate();
        }

        /// <summary>
        /// «Vaciar memoria del equipo…». Lo dispara una persona desde
        /// Configuración, nunca un temporizador ni un umbral: lo que se borre
        /// del lector ya no lo podrá descargar ZKAccess, así que es una decisión
        /// de alguien, no del programa.
        /// </summary>
        private async Task<string> VaciarMemoriaDelEquipo(int equipoId, Action<string> contar)
        {
            return await _tiempoReal.VaciarMemoria(equipoId, contar).ConfigureAwait(false);
        }

        private void Globo(string titulo, string texto, ToolTipIcon icono)
        {
            try
            {
                _icono.BalloonTipTitle = titulo;
                _icono.BalloonTipText = texto ?? "";
                _icono.BalloonTipIcon = icono;
                _icono.ShowBalloonTip(8000);
            }
            catch
            {
                // Si Windows tiene los globos desactivados, no pasa nada.
            }
        }

        // ── Utilidades ───────────────────────────────────────────────────────

        /// <summary>
        /// Corre algo en el hilo de la interfaz desde cualquier hilo.
        ///
        /// Usa el contexto CAPTURADO al construir la bandeja, no
        /// `SynchronizationContext.Current`. Current es el del hilo que llama, y
        /// quien llama aquí son casi siempre hilos de fondo —el temporizador de
        /// la vía equipo, un `Task.Run`, el hilo del COM— donde vale `null`: se
        /// ejecutaría ahí mismo y se tocaría `NotifyIcon` desde otro hilo. Con la
        /// vía equipo avisando cada pocos segundos eso deja de ser teórico.
        /// </summary>
        private void BeginInvokeEnHilo(Action accion)
        {
            var ctx = _interfaz;
            if (ctx != null) ctx.Post(_ => accion(), null);
            else accion();
        }

        private static void Abrir(string ruta)
        {
            try
            {
                if (!System.IO.File.Exists(ruta) && !System.IO.Directory.Exists(ruta))
                {
                    MessageBox.Show("Todavía no existe: " + ruta, "Agente del biométrico",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = ruta,
                    UseShellExecute = true,
                });
            }
            catch (Exception e)
            {
                Bitacora.Error("No se pudo abrir " + ruta, e);
            }
        }

        private void Salir()
        {
            Bitacora.Info("Agente cerrado por el usuario.");
            // Antes de cortar: lo que la vía equipo tenga en cola son huellas ya
            // captadas, y tirarlas sería perderlas.
            try { _tiempoReal.Detener(TimeSpan.FromSeconds(10)); }
            catch (Exception e) { Bitacora.Error("Fallo al detener la vía equipo", e); }
            _cancelar.Cancel();
            _icono.Visible = false;
            Application.Exit();
        }

        public void Dispose()
        {
            try
            {
                _tiempoReal?.Dispose();
                _reloj?.Stop();
                _reloj?.Dispose();
                _icono.Visible = false;
                _icono?.Dispose();
                _cancelar?.Dispose();
            }
            catch
            {
                // Al cerrar no hay nada que reportar.
            }
        }
    }

    /// <summary>
    /// Los iconos de la bandeja: la misma huella de la aplicación, teñida según
    /// el estado. Antes eran círculos de color, que no decían de qué programa
    /// eran; así se reconoce el agente y además se lee el semáforo.
    /// </summary>
    internal static class Iconos
    {
        internal static readonly Icon Bien = Glifo.IconoBandeja(Color.FromArgb(5, 150, 105));
        internal static readonly Icon Mal = Glifo.IconoBandeja(Color.FromArgb(220, 38, 38));
        internal static readonly Icon Trabajando = Glifo.IconoBandeja(Glifo.Marca);

        /// <summary>
        /// Ámbar: la vía Access va bien pero el equipo no está dando tiempo
        /// real (cedido a ZKAccess, o sin conexión). No es un error —las
        /// huellas llegarán con el próximo ciclo de Access— pero tampoco es
        /// «todo al día», y verlo verde escondería justamente el problema.
        /// </summary>
        internal static readonly Icon AMedias = Glifo.IconoBandeja(Color.FromArgb(217, 119, 6));
        internal static readonly Icon Neutro = Glifo.IconoBandeja(Color.FromArgb(100, 116, 139));

        /// <summary>El de la aplicación (ventanas y barra de tareas): del .exe.</summary>
        internal static Icon Aplicacion
        {
            get
            {
                try
                {
                    var exe = System.Reflection.Assembly.GetExecutingAssembly().Location;
                    var ico = Icon.ExtractAssociatedIcon(exe);
                    if (ico != null) return ico;
                }
                catch (Exception e)
                {
                    Bitacora.Error("No se pudo leer el icono del ejecutable", e);
                }
                // Respaldo: el mismo glifo, con su fondo de marca.
                using (var bmp = Glifo.Dibujar(32, Color.White, Glifo.Marca))
                    return Icon.FromHandle(bmp.GetHicon());
            }
        }
    }
}
