using System;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Gestivo.AgenteBiometrico.Datos;
using Gestivo.AgenteBiometrico.Nucleo;
using Gestivo.AgenteBiometrico.Sincronizacion;
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
        private readonly Action _abrirDiagnostico;
        private readonly Func<EstadoTiempoReal> _estadoEquipo;
        private readonly Func<int, Action<string>, Task<string>> _vaciar;

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

        // ── Vía equipo ───────────────────────────────────────────────────
        private readonly CheckBox _equipoHabilitado = new CheckBox
        {
            Text = "Leer las huellas directo del lector (tiempo real)",
            AutoSize = true,
        };
        private readonly TextBox _claveComm = new TextBox { UseSystemPasswordChar = true };
        private readonly Label _claveCommEstado = new Label { AutoSize = true };
        private readonly NumericUpDown _flushSeg = new NumericUpDown { Minimum = 5, Maximum = 600, Increment = 5 };
        private readonly NumericUpDown _margenMin = new NumericUpDown { Minimum = 1, Maximum = 1440, Increment = 5 };
        private readonly TextBox _procesosCeder = new TextBox();
        private readonly Label _lectores = new Label { AutoSize = false };
        private readonly Label _prueba = new Label { AutoSize = false, Dock = DockStyle.Fill };

        private readonly TableLayoutPanel _tabla;

        private const int AnchoEtiqueta = 170;
        private const int AnchoCampo = 430;

        public FormConfiguracion(
            Configuracion actual,
            Action abrirDiagnostico,
            Func<EstadoTiempoReal> estadoEquipo,
            Func<int, Action<string>, Task<string>> vaciar)
        {
            _original = actual;
            _abrirDiagnostico = abrirDiagnostico;
            _estadoEquipo = estadoEquipo;
            _vaciar = vaciar;

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

            // ── Lectura directa del equipo ───────────────────────────────────
            //
            // Lo que cambia con esta casilla: hoy las huellas solo llegan a
            // Gestivo cuando alguien abre ZKAccess y descarga a mano, así que la
            // pantalla de Marcaciones pasa el día sin la columna de huella. Con
            // ella marcada, el agente habla con el lector y las manda en el
            // momento. La vía de ZKAccess sigue funcionando igual: es el
            // respaldo y la historia autoritativa.
            Titulo("Lectura directa del equipo");
            FilaSuelta(_equipoHabilitado);
            FilaSuelta(_lectores);
            Campo("Clave de comunicación", _claveComm,
                "Solo si el lector tiene una puesta («Comm Key»). Déjela vacía si no. Se guarda cifrada.");
            FilaSuelta(_claveCommEstado);
            Campo("Segundos entre envíos", _flushSeg,
                "60 está bien: las huellas se acumulan y salen juntas.", estrecho: true);
            Campo("Margen al reconectar (min)", _margenMin,
                "Al reconectar, el agente relee desde la última huella conocida menos este margen. Cubre el desfase del reloj del lector; repetir no duplica nada.",
                estrecho: true);
            Campo("Ceder la conexión a", _procesosCeder,
                "Procesos que, al estar abiertos, hacen que el agente suelte el lector. ZKAccess 3.5 es «Access» (el de Office es «MSACCESS», no se confunden). Vacío = no ceder a nadie.");

            Controls.Add(_tabla);
            Controls.Add(ConstruirPiePagina());

            Cargar();

            // El alto lo manda el contenido, no un número inventado. Se limita a
            // lo que quepa en la pantalla por si el escalado lo agranda mucho.
            var alto = _tabla.PreferredSize.Height + 142;
            var maximo = Screen.FromPoint(Cursor.Position).WorkingArea.Height - 60;
            ClientSize = new Size(AnchoEtiqueta + AnchoCampo + 46, Math.Min(alto, maximo));
            MinimumSize = new Size(ClientSize.Width + 16, 320);
        }

        // ── Armado ───────────────────────────────────────────────────────────

        private Panel ConstruirPiePagina()
        {
            // Tres renglones: los botones de prueba, el resultado, y guardar.
            // Con dos no cabía: el texto del resultado se comía los botones.
            var pie = new Panel { Dock = DockStyle.Bottom, Height = 118, Padding = new Padding(14, 8, 14, 8) };

            var probar = new Button { Text = "Probar conexión", Size = new Size(140, 28), Location = new Point(14, 8) };
            probar.Click += async (s, e) => await Probar(probar).ConfigureAwait(true);
            pie.Controls.Add(probar);

            var probarEquipo = new Button
            {
                Text = "Probar equipo…",
                Size = new Size(130, 28),
                Location = new Point(162, 8),
            };
            probarEquipo.Click += (s, e) => _abrirDiagnostico();
            pie.Controls.Add(probarEquipo);

            var vaciarEquipo = new Button
            {
                Text = "Vaciar memoria del equipo…",
                Size = new Size(200, 28),
                Location = new Point(300, 8),
            };
            vaciarEquipo.Click += async (s, e) => await Vaciar(vaciarEquipo).ConfigureAwait(true);
            pie.Controls.Add(vaciarEquipo);

            _prueba.Location = new Point(14, 42);
            _prueba.Size = new Size(AnchoEtiqueta + AnchoCampo + 20, 32);
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
                cancelar.Location = new Point(pie.ClientSize.Width - 14 - cancelar.Width, 80);
                guardar.Location = new Point(cancelar.Left - 8 - guardar.Width, 80);
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

        /// <summary>
        /// Un separador con título, para que la ventana no sea una lista plana
        /// de catorce campos donde no se sabe qué va con qué.
        /// </summary>
        private void Titulo(string texto)
        {
            var celda = new FlowLayoutPanel
            {
                FlowDirection = FlowDirection.TopDown,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Margin = new Padding(0, 10, 0, 6),
                WrapContents = false,
            };
            celda.Controls.Add(new Label
            {
                Text = texto,
                AutoSize = false,
                Size = new Size(AnchoCampo, 20),
                Font = new Font(Font, FontStyle.Bold),
                Margin = new Padding(0),
            });
            celda.Controls.Add(new Label
            {
                AutoSize = false,
                Size = new Size(AnchoCampo, 1),
                BorderStyle = BorderStyle.Fixed3D,
                Margin = new Padding(0, 0, 0, 4),
            });
            _tabla.Controls.Add(new Label { Text = "", AutoSize = false, Size = new Size(AnchoEtiqueta - 8, 1) });
            _tabla.Controls.Add(celda);
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

            // ── Vía equipo ───────────────────────────────────────────────────
            _equipoHabilitado.Checked = _original.EquipoHabilitado;
            _flushSeg.Value = Math.Min(600, Math.Max(5, _original.TiempoRealFlushSeg));
            _margenMin.Value = Math.Min(1440, Math.Max(1, _original.EquipoMargenMin));
            _procesosCeder.Text = _original.EquipoProcesosCeder;

            var hayClave = !string.IsNullOrEmpty(_original.EquipoClaveCommCifrada);
            _claveCommEstado.Text = hayClave
                ? "Configurada. Déjela vacía para conservarla."
                : "Sin clave (lo normal).";
            _claveCommEstado.ForeColor = Color.Gray;

            DescribirLectores();
        }

        /// <summary>
        /// Los lectores que ZKAccess tiene registrados, como información. No se
        /// editan aquí a propósito: la lista es de ZKAccess, y tenerla también
        /// en el agente significaría que agregar un lector obliga a tocar dos
        /// sitios y que las huellas del nuevo se pierdan hasta que alguien se
        /// acuerde.
        /// </summary>
        private void DescribirLectores()
        {
            var texto = "Los lectores los toma de ZKAccess; no se configuran aquí.";
            try
            {
                var eq = _estadoEquipo();
                if (!eq.SdkCompilado)
                {
                    texto = "Este agente se compiló sin el SDK del lector: la casilla no tendrá efecto.";
                }
                else if (eq.Equipos.Count == 0)
                {
                    texto = "ZKAccess no tiene ningún lector de red habilitado en «Machines».";
                }
                else
                {
                    texto = "Lectores de ZKAccess: " + string.Join(" · ",
                        eq.Equipos.Select(x => x.Alias + " (" + x.Enlace + ")"));
                }
            }
            catch (Exception e)
            {
                Bitacora.Error("No se pudo describir la lista de lectores", e);
            }

            _lectores.ForeColor = Color.Gray;
            using (var g = CreateGraphics())
            {
                var medida = TextRenderer.MeasureText(
                    g, texto, Font, new Size(AnchoCampo, 0), TextFormatFlags.WordBreak);
                _lectores.Size = new Size(AnchoCampo, medida.Height + 2);
            }
            _lectores.Text = texto;
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

                EquipoHabilitado = _equipoHabilitado.Checked,
                // Vacío = conservar la que ya estaba, igual que el secreto.
                EquipoClaveCommCifrada = string.IsNullOrEmpty(_claveComm.Text)
                    ? _original.EquipoClaveCommCifrada
                    : Secretos.Cifrar(_claveComm.Text.Trim()),
                TiempoRealFlushSeg = (int)_flushSeg.Value,
                EquipoMargenMin = (int)_margenMin.Value,
                EquipoProcesosCeder = _procesosCeder.Text,
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

        /// <summary>
        /// «Vaciar memoria del equipo…».
        ///
        /// El lector guarda sus registros y NUNCA se le han borrado: la prueba
        /// es que ZKAccess descargó la misma huella hasta cuatro veces. Si se
        /// llena, con el PC apagado se perderían huellas. El SDK solo sabe
        /// borrar TODO (no hay borrado por fecha), así que la secuencia es: leer
        /// la memoria completa, confirmar que Gestivo la recibió ENTERA, y solo
        /// entonces borrar. Si algo falla, no se borra nada.
        ///
        /// Y nunca es automático: no hay umbral ni horario que lo dispare. Es
        /// una decisión de una persona, porque lo que se borre del lector ya no
        /// lo podrá descargar ZKAccess.
        /// </summary>
        private async Task Vaciar(Button boton)
        {
            EstadoTiempoReal eq;
            try
            {
                eq = _estadoEquipo();
            }
            catch (Exception e)
            {
                Avisar("No se pudo consultar el estado del lector: " + e.Message);
                return;
            }

            if (!eq.SdkCompilado)
            {
                Avisar("Este agente se compiló sin el SDK del lector, así que no puede hablar con él.");
                return;
            }

            var conectados = eq.Equipos.Where(x => x.Salud == SaludEquipo.Conectado).ToList();
            if (conectados.Count == 0)
            {
                Avisar("Ningún lector está conectado ahora mismo.\n\n" +
                       "Para vaciar su memoria hay que poder leerla primero y confirmar que Gestivo " +
                       "la recibió. Marque «Leer las huellas directo del lector», cierre ZKAccess si " +
                       "lo tiene abierto, y espere a que Estado diga «conectado».");
                return;
            }

            var x0 = conectados[0];
            var cuantos = x0.Registros.HasValue
                ? x0.Registros.Value.ToString("N0", System.Globalization.CultureInfo.GetCultureInfo("es-CO")) +
                  " registro(s)"
                : "una cantidad que el equipo no reporta";

            var aviso =
                "Se va a vaciar la memoria del lector «" + x0.Alias + "» (" + x0.Enlace + ").\n\n" +
                "Ahora tiene " + cuantos + ".\n\n" +
                "Qué va a pasar, en este orden:\n" +
                "  1. se lee su memoria COMPLETA (puede tardar);\n" +
                "  2. se manda a Gestivo y se comprueba que la recibió ENTERA;\n" +
                "  3. solo si la cuenta cierra exacta, se borra del equipo.\n\n" +
                "OJO: lo que se borre del lector YA NO lo podrá descargar ZKAccess. Si quiere que " +
                "el Access.mdb también quede completo hasta hoy, haga antes una descarga en " +
                "ZKAccess.\n\n" +
                "¿Continuar?";

            if (MessageBox.Show(this, aviso, "Vaciar memoria del equipo",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Warning,
                    MessageBoxDefaultButton.Button2) != DialogResult.Yes)
                return;

            boton.Enabled = false;
            Decir("Vaciando…", null);
            try
            {
                var resumen = await _vaciar(x0.Id, linea => Decir(linea, null)).ConfigureAwait(true);
                Decir(resumen, true);
                MessageBox.Show(this, resumen, "Vaciar memoria del equipo",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception e)
            {
                Decir(e.Message, false);
                Bitacora.Error("No se pudo vaciar la memoria del equipo", e);
                MessageBox.Show(this,
                    "NO se borró nada del equipo.\n\n" + e.Message,
                    "Vaciar memoria del equipo", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
