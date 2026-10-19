using System;
using System.Drawing;
using System.Globalization;
using System.Text;
using System.Windows.Forms;
using Gestivo.AgenteBiometrico.Nucleo;
using Gestivo.AgenteBiometrico.Sincronizacion;

namespace Gestivo.AgenteBiometrico.App
{
    /// <summary>
    /// Ventana de Estado: qué pasó en el último ciclo y cuánto falta por subir.
    /// Es lo que se mira cuando en Gestivo la caja del agente sale en rojo, así
    /// que el error va completo y se puede copiar.
    /// </summary>
    public class FormEstado : Form
    {
        private readonly Func<EstadoAgente> _estado;
        private readonly Func<Configuracion> _config;
        private readonly Func<System.Threading.Tasks.Task> _sincronizar;
        private readonly Action _abrirConfiguracion;

        private readonly Label _salud = new Label { AutoSize = false, Font = new Font("Segoe UI", 11f, FontStyle.Bold) };
        private readonly TextBox _detalle = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            BackColor = Color.White,
            Font = new Font("Consolas", 9f),
        };
        private readonly Button _botonSinc;

        private static readonly CultureInfo Co = CultureInfo.GetCultureInfo("es-CO");

        public FormEstado(
            Func<EstadoAgente> estado,
            Func<Configuracion> config,
            Func<System.Threading.Tasks.Task> sincronizar,
            Action abrirConfiguracion)
        {
            _estado = estado;
            _config = config;
            _sincronizar = sincronizar;
            _abrirConfiguracion = abrirConfiguracion;

            Text = "Estado · Agente del biométrico";
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(620, 430);
            MinimumSize = new Size(500, 360);
            Font = new Font("Segoe UI", 9f);

            _salud.Location = new Point(14, 12);
            _salud.Size = new Size(590, 26);
            Controls.Add(_salud);

            _detalle.Location = new Point(14, 44);
            _detalle.Size = new Size(590, 300);
            _detalle.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom;
            Controls.Add(_detalle);

            _botonSinc = new Button { Text = "Sincronizar ahora", Size = new Size(140, 30) };
            _botonSinc.Location = new Point(14, 356);
            _botonSinc.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
            _botonSinc.Click += async (s, e) =>
            {
                _botonSinc.Enabled = false;
                try { await _sincronizar().ConfigureAwait(true); }
                finally { _botonSinc.Enabled = true; Refrescar(); }
            };
            Controls.Add(_botonSinc);

            var copiar = new Button { Text = "Copiar diagnóstico", Size = new Size(140, 30) };
            copiar.Location = new Point(162, 356);
            copiar.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
            copiar.Click += (s, e) => Copiar();
            Controls.Add(copiar);

            var bitacora = new Button { Text = "Abrir bitácora", Size = new Size(120, 30) };
            bitacora.Location = new Point(310, 356);
            bitacora.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
            bitacora.Click += (s, e) => AbrirBitacora();
            Controls.Add(bitacora);

            var config2 = new Button { Text = "Configuración…", Size = new Size(130, 30) };
            config2.Location = new Point(474, 356);
            config2.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            config2.Click += (s, e) => _abrirConfiguracion();
            Controls.Add(config2);

            Refrescar();
        }

        /// <summary>La llama la bandeja cuando el sincronizador reporta algo.</summary>
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

            _detalle.Text = Diagnostico(e, c);
        }

        private static string Diagnostico(EstadoAgente e, Configuracion c)
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
                         e.NuevasUltimoCiclo + " marcación(es) nueva(s)");
            s.AppendLine();
            s.AppendLine("Gestivo tiene hasta el id: " + e.UltimoIdServidor.ToString("N0", Co));
            s.AppendLine("El equipo llega hasta:     " + e.MaximoIdEquipo.ToString("N0", Co));
            s.AppendLine("Faltan por subir:          " + e.Pendientes.ToString("N0", Co));
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
            s.AppendLine("Bitácora: " + Bitacora.RutaDeHoy);
            return s.ToString();
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
                Clipboard.SetText(_detalle.Text);
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
    }
}
