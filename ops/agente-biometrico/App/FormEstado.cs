using System;
using System.Drawing;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using Gestivo.AgenteBiometrico.Nucleo;
using Gestivo.AgenteBiometrico.Recursos;
using Gestivo.AgenteBiometrico.Sincronizacion;

namespace Gestivo.AgenteBiometrico.App
{
    /// <summary>
    /// Ventana de Estado: qué está pasando ahora y qué pasó en el último ciclo.
    ///
    /// Tiene dos mitades porque responden a preguntas distintas: arriba el
    /// resumen («¿está al día?», «¿cuánto falta?», «¿cuál fue el error?») y
    /// abajo la ACTIVIDAD EN VIVO, lote por lote. Sin la de abajo, durante la
    /// carga histórica —que son más de cien lotes— no se veía nada pasar y había
    /// que abrir el archivo de bitácora para saber si seguía trabajando.
    /// </summary>
    public class FormEstado : Form
    {
        private readonly Func<EstadoAgente> _estado;
        private readonly Func<EstadoTiempoReal> _estadoEquipo;
        private readonly Func<Configuracion> _config;
        private readonly Func<System.Threading.Tasks.Task> _sincronizar;
        private readonly Action _abrirConfiguracion;

        private readonly Label _salud = new Label
        {
            AutoSize = false,
            Dock = DockStyle.Top,
            Height = 28,
            Font = new Font("Segoe UI", 11f, FontStyle.Bold),
            Padding = new Padding(2, 2, 0, 0),
        };
        private readonly ProgressBar _barra = new ProgressBar
        {
            Dock = DockStyle.Top,
            Height = 10,
            Style = ProgressBarStyle.Continuous,
            Visible = false,
        };
        private readonly TextBox _resumen = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            Dock = DockStyle.Fill,
            ScrollBars = ScrollBars.Vertical,
            BackColor = Color.White,
            Font = new Font("Consolas", 9f),
        };
        private readonly TextBox _actividad = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            Dock = DockStyle.Fill,
            ScrollBars = ScrollBars.Both,
            WordWrap = false,
            BackColor = Color.FromArgb(248, 250, 252),
            Font = new Font("Consolas", 8.5f),
        };
        private readonly Button _botonSinc;
        // Refresca la actividad aunque el sincronizador no reporte cambios de
        // estado: dentro de un lote largo no hay eventos y la ventana parecería
        // congelada.
        private readonly Timer _refresco = new Timer { Interval = 1000 };

        private static readonly CultureInfo Co = CultureInfo.GetCultureInfo("es-CO");
        private const int LineasActividad = 200;

        public FormEstado(
            Func<EstadoAgente> estado,
            Func<EstadoTiempoReal> estadoEquipo,
            Func<Configuracion> config,
            Func<System.Threading.Tasks.Task> sincronizar,
            Action abrirConfiguracion)
        {
            _estado = estado;
            _estadoEquipo = estadoEquipo;
            _config = config;
            _sincronizar = sincronizar;
            _abrirConfiguracion = abrirConfiguracion;

            Text = "Estado · Agente del biométrico";
            Icon = Iconos.Aplicacion;
            StartPosition = FormStartPosition.CenterScreen;
            // Acotado a la pantalla: 580 px de alto no caben en un PC de
            // portería con 1024x600, y la ventana saldría medio fuera. Lo que no
            // quepa se alcanza con las barras de los dos cuadros de texto.
            ClientSize = CabeEnLaPantalla(700, 580);
            MinimumSize = new Size(480, 320);
            Font = new Font("Segoe UI", 9f);
            AutoScaleMode = AutoScaleMode.Font;

            // Las dos mitades, con divisor movible por si se quiere ver más de
            // una o de la otra.
            var divisor = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Horizontal,
                SplitterDistance = 250,
                Panel1MinSize = 120,
                Panel2MinSize = 120,
            };

            var arriba = new Panel { Dock = DockStyle.Fill, Padding = new Padding(12, 10, 12, 6) };
            arriba.Controls.Add(_resumen);
            arriba.Controls.Add(_barra);
            arriba.Controls.Add(_salud);
            divisor.Panel1.Controls.Add(arriba);

            var abajo = new Panel { Dock = DockStyle.Fill, Padding = new Padding(12, 6, 12, 6) };
            abajo.Controls.Add(_actividad);
            abajo.Controls.Add(new Label
            {
                Text = "Actividad (lo que está haciendo ahora)",
                Dock = DockStyle.Top,
                Height = 20,
                ForeColor = Color.Gray,
            });
            divisor.Panel2.Controls.Add(abajo);

            Controls.Add(divisor);
            Controls.Add(ConstruirPiePagina(out _botonSinc));

            _refresco.Tick += (s, e) => Refrescar();
            _refresco.Start();

            Refrescar();
        }

        /// <summary>
        /// El tamaño pedido, recortado a lo que quepa en la pantalla donde está
        /// el cursor. Dejando sitio para el marco y la barra de tareas.
        /// </summary>
        internal static Size CabeEnLaPantalla(int ancho, int alto)
        {
            var trabajo = Screen.FromPoint(Cursor.Position).WorkingArea;
            return new Size(
                Math.Min(ancho, Math.Max(400, trabajo.Width - 60)),
                Math.Min(alto, Math.Max(300, trabajo.Height - 100)));
        }

        private Panel ConstruirPiePagina(out Button sincronizar)
        {
            var pie = new Panel { Dock = DockStyle.Bottom, Height = 46, Padding = new Padding(12, 8, 12, 8) };

            sincronizar = new Button { Text = "Sincronizar ahora", Size = new Size(140, 30), Location = new Point(12, 8) };
            var sinc = sincronizar;
            sinc.Click += async (s, e) =>
            {
                sinc.Enabled = false;
                try { await _sincronizar().ConfigureAwait(true); }
                finally { sinc.Enabled = true; Refrescar(); }
            };
            pie.Controls.Add(sinc);

            var copiar = new Button { Text = "Copiar diagnóstico", Size = new Size(140, 30), Location = new Point(160, 8) };
            copiar.Click += (s, e) => Copiar();
            pie.Controls.Add(copiar);

            var bitacora = new Button { Text = "Abrir bitácora", Size = new Size(120, 30), Location = new Point(308, 8) };
            bitacora.Click += (s, e) => AbrirBitacora();
            pie.Controls.Add(bitacora);

            var config = new Button { Text = "Configuración…", Size = new Size(130, 30) };
            config.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            config.Click += (s, e) => _abrirConfiguracion();
            pie.Controls.Add(config);
            pie.Resize += (s, e) => config.Location = new Point(pie.ClientSize.Width - 12 - config.Width, 8);

            return pie;
        }

        /// <summary>La llama la bandeja cuando el sincronizador reporta algo, y el temporizador cada segundo.</summary>
        public void Refrescar()
        {
            if (IsDisposed) return;
            if (InvokeRequired)
            {
                try { BeginInvoke((Action)Refrescar); } catch { /* cerrándose */ }
                return;
            }

            var e = _estado();
            var c = _config();

            switch (e.Salud)
            {
                case Salud.Bien:
                    _salud.Text = "● Funcionando";
                    _salud.ForeColor = Color.FromArgb(5, 150, 105);
                    break;
                case Salud.Trabajando:
                    _salud.Text = "● Enviando… " + (e.Progreso ?? "");
                    _salud.ForeColor = Color.FromArgb(79, 70, 229);
                    break;
                case Salud.Mal:
                    _salud.Text = "● Con error";
                    _salud.ForeColor = Color.FromArgb(185, 28, 28);
                    break;
                default:
                    _salud.Text = "● Falta configurar";
                    _salud.ForeColor = Color.FromArgb(180, 83, 9);
                    break;
            }

            // Barra de avance de la carga: solo tiene sentido mientras trabaja y
            // con algo pendiente de verdad.
            var subidas = Math.Max(0, e.TotalPorSubir - e.Pendientes);
            if (e.Salud == Salud.Trabajando && e.TotalPorSubir > 0)
            {
                _barra.Visible = true;
                _barra.Maximum = (int)Math.Min(int.MaxValue, e.TotalPorSubir);
                _barra.Value = (int)Math.Min(_barra.Maximum, subidas);
            }
            else
            {
                _barra.Visible = false;
            }

            // Solo se reescribe si cambió: si no, el cursor y el desplazamiento
            // saltarían cada segundo mientras se lee.
            var resumen = Diagnostico(e, c, _estadoEquipo());
            if (_resumen.Text != resumen)
            {
                _resumen.Text = resumen;
                // Asignar .Text deja TODO seleccionado (se veía en azul).
                _resumen.SelectionStart = 0;
                _resumen.SelectionLength = 0;
            }

            var lineas = Bitacora.Ultimas(LineasActividad);
            var texto = string.Join(Environment.NewLine, lineas);
            if (_actividad.Text != texto)
            {
                _actividad.Text = texto;
                // Al final, que es donde está lo nuevo (y sin dejarlo todo
                // seleccionado, que es lo que hace asignar .Text).
                _actividad.SelectionStart = _actividad.TextLength;
                _actividad.SelectionLength = 0;
                _actividad.ScrollToCaret();
            }
        }

        private static string Diagnostico(EstadoAgente e, Configuracion c, EstadoTiempoReal eq)
        {
            var s = new StringBuilder();
            s.AppendLine("Servidor:        " + (string.IsNullOrEmpty(c.Url) ? "(sin configurar)" : c.Url));
            s.AppendLine("Base:            " + (string.IsNullOrEmpty(c.Mdb) ? "(sin configurar)" : c.Mdb));
            s.AppendLine("Secreto:         " + (string.IsNullOrEmpty(c.SecretoCifrado)
                ? "(sin configurar)"
                : string.IsNullOrEmpty(c.Secreto) ? "guardado pero ILEGIBLE en esta cuenta" : "configurado"));
            s.AppendLine("Agente:          " + c.NombreAgente);
            s.AppendLine("Cada:            " + c.IntervaloMin + " min · lote " + c.TamanoLote +
                         " · máx. " + c.MaxLotes + " lotes por envío");
            s.AppendLine("Inicia con Windows: " + (Autoinicio.Activo ? "sí" : "no"));
            s.AppendLine();
            s.AppendLine("Último intento:  " + Momento(e.UltimoIntento));
            s.AppendLine("Último éxito:    " + Momento(e.UltimoExito));
            s.AppendLine("Último ciclo:    " + e.LotesUltimoCiclo + " lote(s), " +
                         e.NuevasUltimoCiclo.ToString("N0", Co) + " marcación(es) nueva(s)");
            s.AppendLine();
            s.AppendLine("Gestivo tiene hasta el id: " + e.UltimoIdServidor.ToString("N0", Co));
            s.AppendLine("El equipo llega hasta:     " + e.MaximoIdEquipo.ToString("N0", Co));
            // Conteo real, no la resta de ids: el log del equipo mezcla todos
            // los tipos de evento y solo uno de cada cuatro es una marcación.
            s.AppendLine("Faltan por subir:          " + e.Pendientes.ToString("N0", Co) + " marcaciones");
            if (e.Pendientes > (long)c.TamanoLote * c.MaxLotes)
            {
                s.AppendLine();
                s.AppendLine("Faltan más de lo que entra en un envío. Para ponerse al día de una vez,");
                s.AppendLine("suba «Máximo de lotes por envío» a 500 en Configuración y pulse");
                s.AppendLine("«Sincronizar ahora»; al terminar, déjelo otra vez en 10.");
            }
            if (!string.IsNullOrEmpty(e.UltimoError))
            {
                s.AppendLine();
                s.AppendLine("Último error:");
                s.AppendLine(e.UltimoError);
            }

            s.AppendLine();
            Equipos(s, eq);

            s.AppendLine();
            s.AppendLine("Bitácora: " + Bitacora.RutaDeHoy);
            return s.ToString();
        }

        /// <summary>
        /// La vía EQUIPO: lectura directa del lector por el SDK.
        ///
        /// Es el bloque que hay que mirar cuando la pantalla de Marcaciones no
        /// muestra huellas del día: dice si el agente tiene la conexión, si se
        /// la cedió a ZKAccess, cuándo entró la última huella y cuánto lleva en
        /// cola sin poder mandarse.
        /// </summary>
        private static void Equipos(StringBuilder s, EstadoTiempoReal eq)
        {
            s.AppendLine("── Lectura directa del equipo ──────────────────────────────");

            if (!eq.SdkCompilado)
            {
                s.AppendLine("Este agente se compiló SIN el SDK del lector: la vía equipo no");
                s.AppendLine("está disponible. Las huellas llegan solo por el Access.mdb, que");
                s.AppendLine("depende de que alguien descargue en ZKAccess.");
                return;
            }
            if (!eq.Habilitado)
            {
                s.AppendLine("Deshabilitada. Para que las huellas lleguen en el momento y no");
                s.AppendLine("cuando alguien descargue en ZKAccess, actívela en Configuración →");
                s.AppendLine("«Lectura directa del equipo».");
                return;
            }
            if (eq.Pausado)
            {
                s.AppendLine("EN PAUSA: " + (eq.MotivoPausa ?? "sin motivo anotado") + ".");
            }
            if (!string.IsNullOrEmpty(eq.Error))
            {
                s.AppendLine("Problema: " + eq.Error);
            }
            if (eq.ZkAccessAbierto)
            {
                s.AppendLine("ZKAccess está abierto (" + (eq.QuienTieneZkAccess ?? "?") + "): el agente le");
                s.AppendLine("cedió la conexión del lector. La retoma " +
                             (eq.SegundosDeGracia > 0
                                 ? "en " + eq.SegundosDeGracia + " s tras cerrarlo."
                                 : "a los 15 s de cerrarlo."));
            }
            if (eq.Equipos.Count == 0)
            {
                s.AppendLine("ZKAccess no tiene ningún lector de red habilitado en «Machines».");
                return;
            }

            foreach (var x in eq.Equipos)
            {
                s.AppendLine();
                s.AppendLine("  " + x.Alias + "  ·  " + x.Enlace +
                             (string.IsNullOrEmpty(x.Sn) ? "" : "  ·  SN " + x.Sn));
                s.AppendLine("    Estado:        " + TextoDeSalud(x));
                if (!string.IsNullOrEmpty(x.Error))
                    s.AppendLine("    Problema:      " + x.Error);
                if (!string.IsNullOrEmpty(x.Firmware))
                    s.AppendLine("    Firmware:      " + x.Firmware);
                if (x.Registros.HasValue)
                    s.AppendLine("    Registros:     " + x.Registros.Value.ToString("N0", Co) +
                                 (x.MemoriaCasiLlena
                                     ? "   <-- la memoria va llena: ver «Vaciar memoria del equipo…»"
                                     : ""));
                if (x.Desfase.HasValue)
                {
                    var seg = (int)x.Desfase.Value.TotalSeconds;
                    s.AppendLine("    Reloj:         " + (seg >= 0 ? "+" : "") + seg + " s respecto al PC" +
                                 (Math.Abs(seg) > 60 ? "   <-- MÁS DE UN MINUTO" : ""));
                }
                if (!string.IsNullOrEmpty(x.LecturaAlConectar))
                    s.AppendLine("    Al conectar:   " + x.LecturaAlConectar);

                s.AppendLine("    Última huella: " +
                             (x.UltimaHuella.HasValue
                                 ? x.UltimaHuella.Value.ToString("HH:mm:ss", CultureInfo.InvariantCulture) +
                                   (string.IsNullOrEmpty(x.UltimoPin) ? "" : "  pin " + x.UltimoPin)
                                 : "ninguna todavía"));
                s.AppendLine("    Hoy:           " + x.HuellasHoy.ToString("N0", Co) + " captadas · " +
                             x.EnviadasHoy.ToString("N0", Co) + " enviadas · " +
                             x.EnCola.ToString("N0", Co) + " en cola" +
                             (x.RepetidasDescartadas > 0
                                 ? " · " + x.RepetidasDescartadas.ToString("N0", Co) + " repetidas"
                                 : ""));
                if (x.UltimoEnvio.HasValue)
                    s.AppendLine("    Último envío:  " +
                                 x.UltimoEnvio.Value.ToString("HH:mm:ss", CultureInfo.InvariantCulture));
                if (x.Reintentos > 0 && x.ProximoIntento.HasValue)
                    s.AppendLine("    Reintento:     el " + x.Reintentos + ".º, a las " +
                                 x.ProximoIntento.Value.ToString("HH:mm:ss", CultureInfo.InvariantCulture));
            }
        }

        private static string TextoDeSalud(EstadoEquipo x)
        {
            var desde = x.Desde.HasValue
                ? " desde las " + x.Desde.Value.ToString("HH:mm:ss", CultureInfo.InvariantCulture)
                : "";
            switch (x.Salud)
            {
                case SaludEquipo.Conectado: return "conectado" + desde;
                case SaludEquipo.Conectando: return "conectando…";
                case SaludEquipo.CedidoAZkAccess: return "cedido a ZKAccess" + desde;
                case SaludEquipo.Desconectado: return "sin conexión" + desde;
                case SaludEquipo.Error: return "con error" + desde;
                default: return "deshabilitado";
            }
        }

        private static string Momento(DateTime? f)
        {
            if (!f.HasValue) return "nunca";
            var min = (int)Math.Round((DateTime.Now - f.Value).TotalMinutes);
            return f.Value.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) +
                   " (hace " + min + " min)";
        }

        private void Copiar()
        {
            try
            {
                // El diagnóstico Y la actividad: es lo que hace falta para
                // entender un problema sin estar delante del equipo.
                // (TakeLast es de .NET Core; en Framework 4.8 se usa Skip.)
                var act = Bitacora.Ultimas(LineasActividad);
                var ultimas = act.Skip(Math.Max(0, act.Length - 60));
                Clipboard.SetText(
                    _resumen.Text + Environment.NewLine +
                    "--- Actividad ---" + Environment.NewLine +
                    string.Join(Environment.NewLine, ultimas));
                MessageBox.Show(this, "Diagnóstico copiado. Péguelo donde haga falta.",
                    "Estado", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                Bitacora.Error("No se pudo copiar el diagnóstico", ex);
            }
        }

        private void AbrirBitacora()
        {
            try
            {
                if (!System.IO.File.Exists(Bitacora.RutaDeHoy))
                {
                    MessageBox.Show(this, "Todavía no hay bitácora de hoy.", "Estado",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = Bitacora.RutaDeHoy,
                    UseShellExecute = true,
                });
            }
            catch (Exception ex)
            {
                Bitacora.Error("No se pudo abrir la bitácora", ex);
            }
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            _refresco.Stop();
            _refresco.Dispose();
            base.OnFormClosed(e);
        }
    }
}
