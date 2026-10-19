using System;
using System.Drawing;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
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
        private readonly CancellationTokenSource _cancelar = new CancellationTokenSource();

        private static readonly CultureInfo Co = CultureInfo.GetCultureInfo("es-CO");

        private Configuracion _cfg;
        private FormConfiguracion _ventanaConfig;
        private FormEstado _ventanaEstado;
        // El globo solo sale cuando la salud CAMBIA: si no, un PC sin red
        // avisaría cada 15 minutos para siempre.
        private Salud _saludAvisada = Salud.SinConfigurar;

        public Bandeja()
        {
            _cfg = Configuracion.Cargar();
            _sinc = new Sincronizador(() => _cfg);
            _sinc.Cambio += EnCambioDeEstado;

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
                // Un primer ciclo al arrancar, sin esperar el intervalo.
                Task.Run(async () => await _sinc.Ciclo(_cancelar.Token).ConfigureAwait(false));
            }
        }

        // ── Menú ─────────────────────────────────────────────────────────────

        private ContextMenuStrip ConstruirMenu()
        {
            var menu = new ContextMenuStrip();

            menu.Items.Add("Estado…", null, (s, e) => AbrirEstado());
            menu.Items.Add("Sincronizar ahora", null, async (s, e) =>
                await _sinc.Ciclo(_cancelar.Token, manual: true).ConfigureAwait(false));
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
                "Lee las marcaciones de huella de ZKAccess y las envía a Gestivo.\n" +
                "Solo LEE la base del biométrico: nunca la modifica.\n\n" +
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
            _ventanaConfig = new FormConfiguracion(_cfg);
            _ventanaConfig.FormClosed += (s, e) =>
            {
                if (_ventanaConfig.Guardado)
                {
                    _cfg = _ventanaConfig.Resultado;
                    _cfg.Guardar();
                    _reloj.Interval = Math.Max(1, _cfg.IntervaloMin) * 60 * 1000;
                    Bitacora.Info("Configuración guardada. Intervalo: " + _cfg.IntervaloMin + " min.");
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
            _icono.Icon = e.Salud == Salud.Bien
                ? Iconos.Bien
                : e.Salud == Salud.Mal
                    ? Iconos.Mal
                    : e.Salud == Salud.Trabajando
                        ? Iconos.Trabajando
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
                texto = "Gestivo · " + e.UltimoExito.Value.ToString("HH:mm", CultureInfo.InvariantCulture) +
                        " · " + e.NuevasUltimoCiclo + " nuevas" +
                        (e.Pendientes > 0 ? " · faltan " + e.Pendientes.ToString("N0", Co) : "");
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

        /// <summary>Corre algo en el hilo de la interfaz desde cualquier hilo.</summary>
        private void BeginInvokeEnHilo(Action accion)
        {
            var ctx = SynchronizationContext.Current;
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
            _cancelar.Cancel();
            _icono.Visible = false;
            Application.Exit();
        }

        public void Dispose()
        {
            try
            {
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
