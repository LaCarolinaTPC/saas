using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Gestivo.AgenteBiometrico.Dispositivo;
using Gestivo.AgenteBiometrico.Nucleo;
using Gestivo.AgenteBiometrico.Recursos;

namespace Gestivo.AgenteBiometrico.App
{
    /// <summary>
    /// «Probar equipo…»: habla con el lector y escribe lo que encuentra.
    ///
    /// Existe porque hay cosas de este MA500 (firmware de 2014) que no se
    /// pueden saber desde aquí y solo se miden en la portería: si admite dos
    /// clientes a la vez, cuánto tarda leer su memoria, con qué número reporta
    /// una huella, cuánto está desfasado su reloj. Imprime los resultados en un
    /// formato pensado para copiar y pegar.
    ///
    /// Mientras está abierta, la vía equipo queda EN PAUSA: el lector
    /// probablemente admita una sola conexión, así que el diagnóstico necesita
    /// la suya. Al cerrar, se reanuda sola.
    /// </summary>
    public class FormDiagnosticoEquipo : Form
    {
        private readonly Func<List<EquipoConfigurado>> _equipos;
        private readonly Func<Configuracion> _config;
        private readonly Action<string> _pausar;
        private readonly Action _reanudar;

        private readonly ComboBox _cual = new ComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList,
            Width = 320,
        };
        private readonly TextBox _salida = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            Dock = DockStyle.Fill,
            ScrollBars = ScrollBars.Both,
            WordWrap = false,
            BackColor = Color.White,
            Font = new Font("Consolas", 9f),
        };
        private readonly Button _ejecutar = new Button { Text = "Ejecutar", Size = new Size(110, 30) };
        private readonly Button _copiar = new Button { Text = "Copiar", Size = new Size(100, 30) };
        private readonly Button _cerrar = new Button { Text = "Cerrar", Size = new Size(100, 30) };

        private CancellationTokenSource _cancelar;
        private bool _corriendo;
        private bool _pausada;

        public FormDiagnosticoEquipo(
            Func<List<EquipoConfigurado>> equipos,
            Func<Configuracion> config,
            Action<string> pausar,
            Action reanudar)
        {
            _equipos = equipos;
            _config = config;
            _pausar = pausar;
            _reanudar = reanudar;

            Text = "Probar equipo · Agente del biométrico";
            Icon = Iconos.Aplicacion;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(820, 560);
            MinimumSize = new Size(620, 400);
            Font = new Font("Segoe UI", 9f);
            AutoScaleMode = AutoScaleMode.Font;

            var arriba = new Panel { Dock = DockStyle.Top, Height = 66, Padding = new Padding(12, 10, 12, 6) };
            arriba.Controls.Add(new Label
            {
                Text = "Lector:",
                AutoSize = false,
                Size = new Size(50, 23),
                Location = new Point(12, 12),
                TextAlign = ContentAlignment.MiddleLeft,
            });
            _cual.Location = new Point(66, 10);
            arriba.Controls.Add(_cual);
            arriba.Controls.Add(new Label
            {
                Text = "Cierre ZKAccess antes de ejecutar. La prueba del paso 9 (segundo cliente) " +
                       "conviene repetirla con ZKAccess ABIERTO.",
                AutoSize = false,
                Location = new Point(12, 38),
                Size = new Size(780, 20),
                ForeColor = Color.Gray,
            });

            var pie = new Panel { Dock = DockStyle.Bottom, Height = 48, Padding = new Padding(12, 8, 12, 8) };
            _ejecutar.Location = new Point(12, 9);
            _ejecutar.Click += async (s, e) => await Ejecutar().ConfigureAwait(true);
            pie.Controls.Add(_ejecutar);

            _copiar.Location = new Point(130, 9);
            _copiar.Click += (s, e) => Copiar();
            pie.Controls.Add(_copiar);

            _cerrar.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            _cerrar.Click += (s, e) => Close();
            pie.Controls.Add(_cerrar);
            pie.Resize += (s, e) => _cerrar.Location = new Point(pie.ClientSize.Width - 12 - _cerrar.Width, 9);

            var centro = new Panel { Dock = DockStyle.Fill, Padding = new Padding(12, 6, 12, 6) };
            centro.Controls.Add(_salida);

            Controls.Add(centro);
            Controls.Add(arriba);
            Controls.Add(pie);

            CargarEquipos();
        }

        private void CargarEquipos()
        {
            _cual.Items.Clear();
            List<EquipoConfigurado> lista;
            try
            {
                lista = _equipos() ?? new List<EquipoConfigurado>();
            }
            catch (Exception e)
            {
                Escribir("No se pudo leer la lista de lectores de ZKAccess: " + e.Message);
                _ejecutar.Enabled = false;
                return;
            }

            var usables = ListaEquipos.Usables(lista);
            foreach (var e in usables) _cual.Items.Add(new Opcion(e));

            if (_cual.Items.Count == 0)
            {
                Escribir("ZKAccess no tiene ningún lector de red habilitado en su tabla «Machines».");
                Escribir("");
                Escribir("Lectores encontrados, con el motivo por el que no sirven:");
                if (lista.Count == 0)
                {
                    Escribir("  (ninguno: la tabla está vacía o no se pudo leer)");
                }
                else
                {
                    foreach (var e in lista)
                        Escribir("  " + e + " · " +
                                 (!e.Habilitado ? "deshabilitado en ZKAccess"
                                     : e.TipoConexion != 1 ? "no es de red (ConnectType " + e.TipoConexion + ")"
                                     : "dirección o puerto inválidos"));
                }
                _ejecutar.Enabled = false;
                return;
            }
            _cual.SelectedIndex = 0;
        }

        private class Opcion
        {
            public readonly EquipoConfigurado Equipo;
            public Opcion(EquipoConfigurado e) { Equipo = e; }
            public override string ToString() { return Equipo.ToString(); }
        }

        private async Task Ejecutar()
        {
            if (_corriendo) return;
            var opcion = _cual.SelectedItem as Opcion;
            if (opcion == null) return;

            _corriendo = true;
            _ejecutar.Enabled = false;
            _cual.Enabled = false;
            _salida.Clear();
            _cancelar = new CancellationTokenSource();

            // La vía equipo suelta su conexión: el diagnóstico necesita la suya.
            if (!_pausada)
            {
                try
                {
                    _pausar("diagnóstico del equipo abierto");
                    _pausada = true;
                }
                catch (Exception e)
                {
                    Bitacora.Error("No se pudo pausar la vía equipo", e);
                }
            }

            try
            {
                var cfg = _config();
                using (var cliente = new ClienteZk(opcion.Equipo.Nombre))
                {
                    await cliente.Diagnosticar(opcion.Equipo, cfg.EquipoClaveComm,
                        opcion.Equipo.Numero, Escribir, _cancelar.Token).ConfigureAwait(true);
                }
            }
            catch (OperationCanceledException)
            {
                Escribir("");
                Escribir("(cancelado al cerrar la ventana)");
            }
            catch (Exception e)
            {
                Escribir("");
                Escribir("FALLÓ: " + e.Message);
                Bitacora.Error("Falló el diagnóstico del equipo", e);
            }
            finally
            {
                _corriendo = false;
                if (!IsDisposed)
                {
                    _ejecutar.Enabled = true;
                    _cual.Enabled = true;
                }
            }
        }

        /// <summary>
        /// Cada línea, a medida que ocurre. Llega desde el hilo del COM, así que
        /// hay que cruzar al de la interfaz.
        /// </summary>
        private void Escribir(string texto)
        {
            if (IsDisposed) return;
            if (InvokeRequired)
            {
                try { BeginInvoke((Action<string>)Escribir, texto); }
                catch { /* cerrándose */ }
                return;
            }
            _salida.AppendText((texto ?? "") + Environment.NewLine);
        }

        private void Copiar()
        {
            try
            {
                if (_salida.TextLength == 0)
                {
                    MessageBox.Show(this, "Todavía no hay nada que copiar: pulse «Ejecutar».",
                        "Probar equipo", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                Clipboard.SetText(_salida.Text);
                MessageBox.Show(this, "Copiado. Péguelo donde haga falta.",
                    "Probar equipo", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception e)
            {
                Bitacora.Error("No se pudo copiar el diagnóstico del equipo", e);
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (_corriendo)
            {
                var r = MessageBox.Show(this,
                    "La prueba está corriendo. ¿Cancelarla y cerrar?",
                    "Probar equipo", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                if (r != DialogResult.Yes)
                {
                    e.Cancel = true;
                    return;
                }
                try { _cancelar?.Cancel(); } catch { /* nada */ }
            }
            base.OnFormClosing(e);
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            try { _cancelar?.Dispose(); } catch { /* nada */ }
            if (_pausada)
            {
                try { _reanudar(); }
                catch (Exception ex) { Bitacora.Error("No se pudo reanudar la vía equipo", ex); }
                _pausada = false;
            }
            base.OnFormClosed(e);
        }
    }
}
