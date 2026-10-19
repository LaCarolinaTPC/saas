using System;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using Gestivo.AgenteBiometrico.Datos;
using Gestivo.AgenteBiometrico.Nucleo;
using Gestivo.AgenteBiometrico.Red;

namespace Gestivo.AgenteBiometrico.App
{
    /// <summary>
    /// Ventana de configuración. Todo lo que cambia con el tiempo se edita aquí
    /// —sobre todo la URL, porque el servidor de Gestivo se va a mudar— sin
    /// reinstalar ni recompilar.
    ///
    /// Construida a mano (sin diseñador) para que el proyecto no arrastre
    /// archivos .Designer.cs ni .resx generados.
    /// </summary>
    public class FormConfiguracion : Form
    {
        public bool Guardado { get; private set; }
        public Configuracion Resultado { get; private set; }

        private readonly Configuracion _original;

        private readonly TextBox _url = new TextBox();
        private readonly TextBox _secreto = new TextBox { UseSystemPasswordChar = true };
        private readonly Label _secretoEstado = new Label { AutoSize = true, ForeColor = Color.Gray };
        private readonly TextBox _mdb = new TextBox();
        private readonly TextBox _claveMdb = new TextBox { UseSystemPasswordChar = true };
        private readonly ComboBox _proveedor = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
        private readonly NumericUpDown _intervalo = new NumericUpDown { Minimum = 1, Maximum = 120 };
        private readonly NumericUpDown _lote = new NumericUpDown { Minimum = 1, Maximum = 2000, Increment = 100 };
        private readonly NumericUpDown _maxLotes = new NumericUpDown { Minimum = 1, Maximum = 500, Increment = 10 };
        private readonly TextBox _nombre = new TextBox();
        private readonly CheckBox _personas = new CheckBox { Text = "Enviar también la lista de personas del equipo (recomendado)" };
        private readonly CheckBox _autoinicio = new CheckBox { Text = "Iniciar con Windows" };
        private readonly Label _prueba = new Label { AutoSize = false, ForeColor = Color.Gray };

        public FormConfiguracion(Configuracion actual)
        {
            _original = actual;

            Text = "Configuración · Agente del biométrico";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.CenterScreen;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(620, 560);
            Font = new Font("Segoe UI", 9f);

            var y = 14;

            y = Campo("URL de Gestivo", _url, y,
                "Ej. https://gestivo.lacarolina.co — cámbiela aquí cuando se mude el servidor.");

            y = Campo("Secreto (BIOMETRICO_SECRET)", _secreto, y,
                "El mismo valor que tiene el servidor. Se guarda cifrado y no se vuelve a mostrar.");
            _secretoEstado.Location = new Point(170, y);
            Controls.Add(_secretoEstado);
            y += 20;

            y = CampoConBoton("Base del biométrico", _mdb, y, "Examinar…", (s, e) => Examinar(),
                "El Access.mdb de ZKAccess. Se abre en modo solo lectura: nunca se modifica.");

            y = Campo("Contraseña de la base", _claveMdb, y,
                "Solo si la base la pide (ZKAccess puede ponerla). Déjela vacía si no.");

            y = Campo("Proveedor OLE DB", _proveedor, y,
                "Automático prueba ACE 16, ACE 12 y Jet 4.0, el que instala ZKAccess.");

            y = Campo("Minutos entre envíos", _intervalo, y, "Por defecto 15.");
            y = Campo("Marcaciones por lote", _lote, y, "Máximo 2000, que es el tope del servidor.");
            y = Campo("Máximo de lotes por envío", _maxLotes, y,
                "10 basta para el día a día. Para la carga histórica (la primera vez) súbalo a 500 y use «Sincronizar ahora».");
            y = Campo("Nombre de este agente", _nombre, y, "Aparece en la bitácora del servidor.");

            _personas.Location = new Point(170, y);
            _personas.Size = new Size(430, 20);
            Controls.Add(_personas);
            y += 24;

            _autoinicio.Location = new Point(170, y);
            _autoinicio.Size = new Size(430, 20);
            Controls.Add(_autoinicio);
            y += 30;

            var probar = new Button { Text = "Probar conexión", Location = new Point(170, y), Size = new Size(130, 28) };
            probar.Click += async (s, e) => await Probar(probar).ConfigureAwait(true);
            Controls.Add(probar);

            _prueba.Location = new Point(310, y + 5);
            _prueba.Size = new Size(295, 36);
            Controls.Add(_prueba);
            y += 44;

            var guardar = new Button { Text = "Guardar", Location = new Point(420, y), Size = new Size(90, 30) };
            guardar.Click += (s, e) => Aceptar();
            var cancelar = new Button { Text = "Cancelar", Location = new Point(516, y), Size = new Size(90, 30) };
            cancelar.Click += (s, e) => Close();
            Controls.Add(guardar);
            Controls.Add(cancelar);
            AcceptButton = guardar;
            CancelButton = cancelar;

            Cargar();
        }

        // ── Armado de la ventana ─────────────────────────────────────────────

        private int Campo(string etiqueta, Control control, int y, string ayuda)
        {
            Controls.Add(new Label
            {
                Text = etiqueta,
                Location = new Point(14, y + 3),
                Size = new Size(150, 20),
                TextAlign = ContentAlignment.MiddleLeft,
            });
            control.Location = new Point(170, y);
            control.Size = new Size(control is NumericUpDown ? 90 : 436, 23);
            Controls.Add(control);
            y += 25;
            if (!string.IsNullOrEmpty(ayuda))
            {
                Controls.Add(new Label
                {
                    Text = ayuda,
                    Location = new Point(170, y),
                    Size = new Size(436, 28),
                    ForeColor = Color.Gray,
                });
                y += 30;
            }
            return y;
        }

        private int CampoConBoton(string etiqueta, Control control, int y, string textoBoton,
            EventHandler alPulsar, string ayuda)
        {
            Controls.Add(new Label
            {
                Text = etiqueta,
                Location = new Point(14, y + 3),
                Size = new Size(150, 20),
                TextAlign = ContentAlignment.MiddleLeft,
            });
            control.Location = new Point(170, y);
            control.Size = new Size(330, 23);
            Controls.Add(control);
            var b = new Button { Text = textoBoton, Location = new Point(506, y - 1), Size = new Size(100, 25) };
            b.Click += alPulsar;
            Controls.Add(b);
            y += 25;
            Controls.Add(new Label
            {
                Text = ayuda,
                Location = new Point(170, y),
                Size = new Size(436, 28),
                ForeColor = Color.Gray,
            });
            return y + 30;
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
            _secretoEstado.ForeColor = !hay || !legible ? Color.FromArgb(185, 28, 28) : Color.FromArgb(5, 150, 105);

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
