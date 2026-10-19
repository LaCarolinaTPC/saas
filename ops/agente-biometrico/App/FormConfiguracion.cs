using System;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using Gestivo.AgenteBiometrico.Datos;
using Gestivo.AgenteBiometrico.Nucleo;
using Gestivo.AgenteBiometrico.Recursos;
using Gestivo.AgenteBiometrico.Red;

namespace Gestivo.AgenteBiometrico.App
{
    /// <summary>
    /// Ventana de configuración. Todo lo que cambia con el tiempo se edita aquí
    /// —sobre todo la URL, porque el servidor de Gestivo se va a mudar— sin
    /// reinstalar ni recompilar.
    ///
    /// Se arma con TableLayoutPanel y no con coordenadas fijas: con posiciones a
    /// mano la ventana se quedó corta y los botones Probar y Guardar cayeron
    /// fuera del área visible. Con el panel, el alto lo calcula el propio
    /// WinForms, se adapta al escalado DPI y a la fuente del sistema, y si aun
    /// así no cabe aparece barra de desplazamiento en vez de recortarse.
    /// </summary>
    public class FormConfiguracion : Form
    {
        public bool Guardado { get; private set; }
        public Configuracion Resultado { get; private set; }

        private readonly Configuracion _original;

        private readonly TextBox _url = new TextBox();
        private readonly TextBox _secreto = new TextBox { UseSystemPasswordChar = true };
        private readonly Label _secretoEstado = new Label { AutoSize = true };
        private readonly TextBox _mdb = new TextBox();
        private readonly TextBox _claveMdb = new TextBox { UseSystemPasswordChar = true };
        private readonly ComboBox _proveedor = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
        private readonly NumericUpDown _intervalo = new NumericUpDown { Minimum = 1, Maximum = 120 };
        private readonly NumericUpDown _lote = new NumericUpDown { Minimum = 1, Maximum = 2000, Increment = 100 };
        private readonly NumericUpDown _maxLotes = new NumericUpDown { Minimum = 1, Maximum = 500, Increment = 10 };
        private readonly TextBox _nombre = new TextBox();
        private readonly CheckBox _personas = new CheckBox
        {
            Text = "Enviar también la lista de personas del equipo (recomendado)",
            AutoSize = true,
        };
        private readonly CheckBox _autoinicio = new CheckBox { Text = "Iniciar con Windows", AutoSize = true };
        private readonly Label _prueba = new Label { AutoSize = false, Dock = DockStyle.Fill };

        private readonly TableLayoutPanel _tabla;

        private const int AnchoEtiqueta = 170;
        private const int AnchoCampo = 430;

        public FormConfiguracion(Configuracion actual)
        {
            _original = actual;

            Text = "Configuración · Agente del biométrico";
            Icon = Iconos.Aplicacion;
            StartPosition = FormStartPosition.CenterScreen;
            // Redimensionable: en pantallas chicas el usuario puede agrandarla,
            // y el panel de arriba se desplaza si hace falta.
            FormBorderStyle = FormBorderStyle.Sizable;
            MaximizeBox = false;
            MinimizeBox = false;
            AutoScaleMode = AutoScaleMode.Font;
            Font = new Font("Segoe UI", 9f);

            _tabla = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                AutoScroll = true,
                Padding = new Padding(14, 12, 14, 12),
                GrowStyle = TableLayoutPanelGrowStyle.AddRows,
            };
            _tabla.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, AnchoEtiqueta));
            _tabla.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

            Campo("URL de Gestivo", _url,
                "Ej. https://gestivo.lacarolina.co — cámbiela aquí cuando se mude el servidor.");

            // Etiqueta corta: con «Secreto (BIOMETRICO_SECRET)» el texto se
            // partía en dos renglones y quedaba cortado. El nombre de la
            // variable va en la ayuda, que sí tiene sitio.
            Campo("Secreto", _secreto,
                "El valor de BIOMETRICO_SECRET del servidor. Se guarda cifrado y no se vuelve a mostrar.");
            FilaSuelta(_secretoEstado);

            CampoConBoton("Base del biométrico", _mdb, "Examinar…", (s, e) => Examinar(),
                "El Access.mdb de ZKAccess. Se abre en modo solo lectura: nunca se modifica.");

            Campo("Contraseña de la base", _claveMdb,
                "Solo si la base la pide (ZKAccess puede ponerla). Déjela vacía si no.");

            Campo("Proveedor OLE DB", _proveedor,
                "Automático prueba ACE 16, ACE 12 y Jet 4.0, el que instala ZKAccess.");

            Campo("Minutos entre envíos", _intervalo, "Por defecto 15.", estrecho: true);
            Campo("Marcaciones por lote", _lote, "Máximo 2000, que es el tope del servidor.", estrecho: true);
            Campo("Máximo de lotes por envío", _maxLotes,
                "10 basta para el día a día. Para la carga histórica (la primera vez) súbalo a 500 y use «Sincronizar ahora».",
                estrecho: true);
            Campo("Nombre de este agente", _nombre, "Aparece en la bitácora del servidor.");

            FilaSuelta(_personas);
            FilaSuelta(_autoinicio);

            Controls.Add(_tabla);
            Controls.Add(ConstruirPiePagina());

            Cargar();

            // El alto lo manda el contenido, no un número inventado. Se limita a
            // lo que quepa en la pantalla por si el escalado lo agranda mucho.
            var alto = _tabla.PreferredSize.Height + 108;
            var maximo = Screen.FromPoint(Cursor.Position).WorkingArea.Height - 60;
            ClientSize = new Size(AnchoEtiqueta + AnchoCampo + 46, Math.Min(alto, maximo));
            MinimumSize = new Size(ClientSize.Width + 16, 320);
        }

        // ── Armado ───────────────────────────────────────────────────────────

        private Panel ConstruirPiePagina()
        {
            var pie = new Panel { Dock = DockStyle.Bottom, Height = 84, Padding = new Padding(14, 8, 14, 8) };

            var probar = new Button { Text = "Probar conexión", Size = new Size(140, 28), Location = new Point(14, 8) };
            probar.Click += async (s, e) => await Probar(probar).ConfigureAwait(true);
            pie.Controls.Add(probar);

            _prueba.Location = new Point(162, 8);
            _prueba.Size = new Size(AnchoEtiqueta + AnchoCampo - 150, 36);
            _prueba.Dock = DockStyle.None;
            _prueba.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            _prueba.ForeColor = Color.Gray;
            pie.Controls.Add(_prueba);

            var guardar = new Button { Text = "Guardar", Size = new Size(92, 30) };
            guardar.Click += (s, e) => Aceptar();
            var cancelar = new Button { Text = "Cancelar", Size = new Size(92, 30) };
            cancelar.Click += (s, e) => Close();

            // Anclados a la derecha: siguen visibles aunque la ventana crezca.
            guardar.Anchor = cancelar.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            pie.Resize += (s, e) =>
            {
                cancelar.Location = new Point(pie.ClientSize.Width - 14 - cancelar.Width, 48);
                guardar.Location = new Point(cancelar.Left - 8 - guardar.Width, 48);
            };
            pie.Controls.Add(guardar);
            pie.Controls.Add(cancelar);

            AcceptButton = guardar;
            CancelButton = cancelar;
            return pie;
        }

        private void Campo(string etiqueta, Control control, string ayuda, bool estrecho = false)
        {
            var lbl = new Label
            {
                Text = etiqueta,
                AutoSize = false,
                Size = new Size(AnchoEtiqueta - 8, 23),
                TextAlign = ContentAlignment.MiddleLeft,
                Margin = new Padding(0, 4, 8, 0),
            };
            control.Width = estrecho ? 90 : AnchoCampo;
            control.Margin = new Padding(0, 3, 0, 0);

            var celda = new FlowLayoutPanel
            {
                FlowDirection = FlowDirection.TopDown,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Margin = new Padding(0, 0, 0, 8),
                WrapContents = false,
            };
            celda.Controls.Add(control);
            if (!string.IsNullOrEmpty(ayuda))
            {
                celda.Controls.Add(Ayuda(ayuda));
            }
            _tabla.Controls.Add(lbl);
            _tabla.Controls.Add(celda);
        }

        private void CampoConBoton(string etiqueta, Control control, string textoBoton,
            EventHandler alPulsar, string ayuda)
        {
            var lbl = new Label
            {
                Text = etiqueta,
                AutoSize = false,
                Size = new Size(AnchoEtiqueta - 8, 23),
                TextAlign = ContentAlignment.MiddleLeft,
                Margin = new Padding(0, 4, 8, 0),
            };

            var fila = new FlowLayoutPanel
            {
                FlowDirection = FlowDirection.LeftToRight,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Margin = new Padding(0),
                WrapContents = false,
            };
            control.Width = AnchoCampo - 108;
            control.Margin = new Padding(0, 3, 6, 0);
            var b = new Button { Text = textoBoton, Size = new Size(100, 25), Margin = new Padding(0, 2, 0, 0) };
            b.Click += alPulsar;
            fila.Controls.Add(control);
            fila.Controls.Add(b);

            var celda = new FlowLayoutPanel
            {
                FlowDirection = FlowDirection.TopDown,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Margin = new Padding(0, 0, 0, 8),
                WrapContents = false,
            };
            celda.Controls.Add(fila);
            celda.Controls.Add(Ayuda(ayuda));

            _tabla.Controls.Add(lbl);
            _tabla.Controls.Add(celda);
        }

        /// <summary>
        /// Texto de ayuda bajo un campo. El alto se mide con la fuente real en
        /// vez de fijarlo: con un valor fijo, una ayuda de dos renglones se
        /// cortaba y una de uno dejaba un hueco (la ventana salía innecesariamente
        /// alta y en un portátil no cabía).
        /// </summary>
        private Label Ayuda(string texto)
        {
            var lbl = new Label
            {
                Text = texto,
                AutoSize = false,
                ForeColor = Color.Gray,
                Margin = new Padding(0, 2, 0, 0),
            };
            using (var g = CreateGraphics())
            {
                var medida = TextRenderer.MeasureText(
                    g, texto, Font, new Size(AnchoCampo, 0), TextFormatFlags.WordBreak);
                lbl.Size = new Size(AnchoCampo, medida.Height + 2);
            }
            return lbl;
        }

        /// <summary>Un control que ocupa la columna de los campos, sin etiqueta.</summary>
        private void FilaSuelta(Control control)
        {
            control.Margin = new Padding(0, 2, 0, 6);
            _tabla.Controls.Add(new Label { Text = "", AutoSize = false, Size = new Size(AnchoEtiqueta - 8, 1) });
            _tabla.Controls.Add(control);
        }

        // ── Datos ────────────────────────────────────────────────────────────

        private void Cargar()
        {
            _url.Text = _original.Url;
            _mdb.Text = _original.Mdb;
            _intervalo.Value = Math.Min(120, Math.Max(1, _original.IntervaloMin));
            _lote.Value = Math.Min(2000, Math.Max(1, _original.TamanoLote));
            _maxLotes.Value = Math.Min(500, Math.Max(1, _original.MaxLotes));
            _nombre.Text = _original.NombreAgente;
            _personas.Checked = _original.EnviarPersonas;
            _autoinicio.Checked = Autoinicio.Activo;

            // El secreto guardado no se muestra: solo se dice si está puesto.
            var hay = !string.IsNullOrEmpty(_original.SecretoCifrado);
            var legible = hay && !string.IsNullOrEmpty(_original.Secreto);
            _secretoEstado.Text = !hay
                ? "Sin configurar."
                : legible
                    ? "Configurado. Déjelo vacío para conservarlo."
                    : "Guardado pero ILEGIBLE en esta cuenta de Windows: vuelva a escribirlo.";
            _secretoEstado.ForeColor = !hay || !legible
                ? Color.FromArgb(185, 28, 28)
                : Color.FromArgb(5, 150, 105);

            _proveedor.Items.Add("Automático");
            foreach (var p in Proveedor.Disponibles()) _proveedor.Items.Add(p);
            // Si el guardado ya no está instalado, se conserva como opción para
            // que guardar no lo pierda sin avisar.
            if (!string.IsNullOrEmpty(_original.Proveedor) && !_proveedor.Items.Contains(_original.Proveedor))
                _proveedor.Items.Add(_original.Proveedor);
            _proveedor.SelectedItem = string.IsNullOrEmpty(_original.Proveedor)
                ? "Automático"
                : _original.Proveedor;
        }

        private void Examinar()
        {
            using (var d = new OpenFileDialog
            {
                Title = "Base de datos de ZKAccess",
                Filter = "Base de Access (*.mdb;*.accdb)|*.mdb;*.accdb|Todos los archivos|*.*",
                FileName = string.IsNullOrEmpty(_mdb.Text) ? "Access.mdb" : _mdb.Text,
            })
            {
                if (d.ShowDialog(this) == DialogResult.OK) _mdb.Text = d.FileName;
            }
        }

        /// <summary>Lo que hay en la ventana, ya normalizado.</summary>
        private Configuracion Armar()
        {
            var c = new Configuracion
            {
                Url = _url.Text,
                // Vacío = conservar el que ya estaba.
                SecretoCifrado = string.IsNullOrEmpty(_secreto.Text)
                    ? _original.SecretoCifrado
                    : Secretos.Cifrar(_secreto.Text.Trim()),
                Mdb = _mdb.Text,
                ClaveMdbCifrada = string.IsNullOrEmpty(_claveMdb.Text)
                    ? _original.ClaveMdbCifrada
                    : Secretos.Cifrar(_claveMdb.Text),
                Proveedor = (_proveedor.SelectedItem as string) == "Automático"
                    ? ""
                    : (_proveedor.SelectedItem as string) ?? "",
                IntervaloMin = (int)_intervalo.Value,
                TamanoLote = (int)_lote.Value,
                MaxLotes = (int)_maxLotes.Value,
                NombreAgente = _nombre.Text,
                EnviarPersonas = _personas.Checked,
            };
            return c.ConValoresSanos();
        }

        private async System.Threading.Tasks.Task Probar(Button boton)
        {
            var c = Armar();
            if (string.IsNullOrWhiteSpace(c.Url))
            {
                Decir("Escriba primero la URL de Gestivo.", false);
                return;
            }
            var secreto = c.Secreto;
            if (string.IsNullOrEmpty(secreto))
            {
                Decir("Escriba el secreto para poder probar.", false);
                return;
            }

            boton.Enabled = false;
            Decir("Probando…", null);
            try
            {
                // 1. El servidor.
                using (var cliente = new ClienteGestivo(c.Url, secreto, timeoutSeg: 30))
                using (var cancelar = new CancellationTokenSource(TimeSpan.FromSeconds(35)))
                {
                    var estado = await cliente.LeerEstado(cancelar.Token).ConfigureAwait(true);
                    var texto = "Gestivo responde. Tiene hasta el id " + (estado.UltimoId ?? 0) + ".";

                    // 2. La base, si ya está indicada: así el usuario no
                    //    descubre el problema del proveedor en el primer ciclo.
                    if (!string.IsNullOrWhiteSpace(c.Mdb))
                    {
                        if (!File.Exists(c.Mdb))
                        {
                            Decir(texto + " Pero la base no existe en esa ruta.", false);
                            return;
                        }
                        var proveedor = Proveedor.Resolver(c.Proveedor);
                        using (var lector = new LectorZk(proveedor, c.Mdb, c.ClaveMdb))
                        {
                            var max = lector.MaximoId();
                            var faltan = Math.Max(0, max - (estado.UltimoId ?? 0));
                            texto += " La base abre con " + proveedor + "; faltan por subir ~" + faltan + ".";
                        }
                    }
                    Decir(texto, true);
                }
            }
            catch (Exception e)
            {
                Decir(e.Message, false);
                Bitacora.Error("Prueba de conexión fallida", e);
            }
            finally
            {
                boton.Enabled = true;
            }
        }

        private void Decir(string texto, bool? bien)
        {
            _prueba.Text = texto;
            _prueba.ForeColor = bien == null
                ? Color.Gray
                : bien.Value
                    ? Color.FromArgb(5, 150, 105)
                    : Color.FromArgb(185, 28, 28);
        }

        private void Aceptar()
        {
            var c = Armar();

            if (string.IsNullOrWhiteSpace(c.Url))
            {
                Avisar("Falta la URL de Gestivo.");
                return;
            }
            if (!c.Url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                !c.Url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                Avisar("La URL debe empezar por https:// (o http:// para pruebas locales).");
                return;
            }
            if (string.IsNullOrEmpty(c.SecretoCifrado))
            {
                Avisar("Falta el secreto. Es el mismo valor de BIOMETRICO_SECRET del servidor.");
                return;
            }
            if (string.IsNullOrWhiteSpace(c.Mdb) || !File.Exists(c.Mdb))
            {
                Avisar("Indique la ruta del Access.mdb del biométrico (debe existir).");
                return;
            }

            // El autoinicio no vive en el config.json sino en el registro: se
            // aplica aquí, al guardar.
            if (_autoinicio.Checked != Autoinicio.Activo && !Autoinicio.Establecer(_autoinicio.Checked))
                Avisar("No se pudo cambiar «Iniciar con Windows»; lo demás sí se guardó.");

            Resultado = c;
            Guardado = true;
            Close();
        }

        private void Avisar(string texto)
        {
            MessageBox.Show(this, texto, "Configuración", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }
}
