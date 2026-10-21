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

        // ── Maquetación ──────────────────────────────────────────────────
        //
        // Pestañas y no una sola lista: con la sección de lectura directa del
        // equipo la ventana pasó de nueve a quince campos, y de una tirada no
        // cabía en una pantalla de 768 px de alto (menos aún con escalado al
        // 125 %). Repartida en tres, cada una ocupa un tercio.
        //
        // Y el contenido de cada pestaña va dentro de un panel con
        // AutoScroll: antes el AutoScroll estaba en el MISMO
        // TableLayoutPanel que tenía AutoSize, que es una contradicción —el
        // panel crece hasta su tamaño preferido en vez de desplazarse— y lo
        // que no cabía quedaba recortado sin forma de alcanzarlo.
        private readonly TabControl _pestanas = new TabControl { Dock = DockStyle.Fill };
        private readonly List<TableLayoutPanel> _tablas = new List<TableLayoutPanel>();
        private TableLayoutPanel _actual;

        private Panel _pie;
        private Button _guardar;
        private Button _cancelar;
        private readonly List<Button> _botonesPrueba = new List<Button>();
        private bool _organizando;

        /// <summary>
        /// Lo que vive en la columna izquierda: las etiquetas y los separadores
        /// de las filas sueltas. Se guardan para poder MEDIR la columna en vez
        /// de fijarla, que es lo que la hace resistir el escalado: con 170 px
        /// fijos y la fuente del sistema al 150 %, «Contraseña de la base» se
        /// recortaría.
        /// </summary>
        private readonly List<Control> _columnaIzquierda = new List<Control>();

        /// <summary>Punto de partida; el real lo decide `AjustarColumnaDeEtiquetas`.</summary>
        private int _anchoEtiqueta = AnchoEtiqueta;

        private const int AnchoEtiqueta = 170;
        private const int AnchoCampo = 430;
        private const int Margen = 12;
        private const int AltoPestanasPorOmision = 26;

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

            // Redimensionable y maximizable: en una pantalla chica poder
            // maximizar es justo lo que hace falta.
            MaximizeBox = true;

            Controls.Add(_pestanas);
            Controls.Add(ConstruirPiePagina());

            // ── Gestivo ──────────────────────────────────────────────────────
            NuevaPestana("Gestivo");
            Campo("URL de Gestivo", _url,
                "Ej. https://gestivo.lacarolina.co — cámbiela aquí cuando se mude el servidor.");

            // Etiqueta corta: con «Secreto (BIOMETRICO_SECRET)» el texto se
            // partía en dos renglones y quedaba cortado. El nombre de la
            // variable va en la ayuda, que sí tiene sitio.
            Campo("Secreto", _secreto,
                "El valor de BIOMETRICO_SECRET del servidor. Se guarda cifrado y no se vuelve a mostrar.");
            FilaSuelta(_secretoEstado);

            Campo("Nombre de este agente", _nombre, "Aparece en la bitácora del servidor.");
            FilaSuelta(_autoinicio);

            // ── Biométrico ───────────────────────────────────────────────────
            NuevaPestana("Biométrico");
            CampoConBoton("Base del biométrico", _mdb, "Examinar…", (s, e) => Examinar(),
                "El Access.mdb de ZKAccess. Se abre en modo solo lectura: nunca se modifica.");

            Campo("Contraseña de la base", _claveMdb,
                "Solo si la base la pide (ZKAccess puede ponerla). Déjela vacía si no.");

            Campo("Proveedor OLE DB", _proveedor,
                "Automático prueba ACE 16, ACE 12 y Jet 4.0, el que instala ZKAccess.");

            // Los tres en un renglón y no en tres: son el mismo asunto («cada
            // cuánto y cuánto de una vez») y por separado se comían 160 px de
            // alto, que es justo lo que escasea en una pantalla de 768.
            CamposEnLinea("Envíos",
                "Por defecto cada 15 min, en lotes de 2000 (el tope del servidor) y 10 lotes por envío. " +
                "Para la carga histórica (la primera vez) suba el máximo de lotes a 500 y use «Sincronizar ahora»; al terminar, déjelo otra vez en 10.",
                new[] { "min", "por lote", "lotes máx." },
                new Control[] { _intervalo, _lote, _maxLotes });

            FilaSuelta(_personas);

            // ── Lectura directa del equipo ───────────────────────────────────
            //
            // Lo que cambia con esta casilla: hoy las huellas solo llegan a
            // Gestivo cuando alguien abre ZKAccess y descarga a mano, así que la
            // pantalla de Marcaciones pasa el día sin la columna de huella. Con
            // ella marcada, el agente habla con el lector y las manda en el
            // momento. La vía de ZKAccess sigue funcionando igual: es el
            // respaldo y la historia autoritativa.
            NuevaPestana("Lectura directa del equipo");
            FilaSuelta(_equipoHabilitado);
            FilaSuelta(_lectores);
            Campo("Clave de comunicación", _claveComm,
                "Solo si el lector tiene una puesta («Comm Key»). Déjela vacía si no. Se guarda cifrada.");
            FilaSuelta(_claveCommEstado);
            CamposEnLinea("Tiempos",
                "Con 60 s las huellas se acumulan y salen juntas. El margen es cuánto relee al reconectar, " +
                "contando hacia atrás desde la última huella conocida: cubre el desfase del reloj del lector, y repetir no duplica nada.",
                new[] { "s entre envíos", "min de margen" },
                new Control[] { _flushSeg, _margenMin });
            Campo("Ceder la conexión a", _procesosCeder,
                "Procesos que, al estar abiertos, hacen que el agente suelte el lector. ZKAccess 3.5 es «Access» (el de Office es «MSACCESS», no se confunden). Vacío = no ceder a nadie.");

            Cargar();
            AjustarTamano();
        }

        /// <summary>
        /// Una pestaña nueva, con su panel desplazable y su tabla de campos. Los
        /// `Campo`/`FilaSuelta` que vengan después caen en ella.
        /// </summary>
        private void NuevaPestana(string titulo)
        {
            var tabla = new TableLayoutPanel
            {
                // Dock.Top y NO Fill: así la tabla toma el ancho del panel pero
                // crece hacia abajo lo que necesite, que es la condición para
                // que el AutoScroll del panel tenga algo que desplazar.
                Dock = DockStyle.Top,
                ColumnCount = 2,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Padding = new Padding(Margen, 10, Margen, 10),
                GrowStyle = TableLayoutPanelGrowStyle.AddRows,
            };
            tabla.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, _anchoEtiqueta));
            tabla.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

            var desplazable = new Panel { Dock = DockStyle.Fill, AutoScroll = true };
            desplazable.Controls.Add(tabla);

            var pagina = new TabPage(titulo) { Padding = new Padding(0) };
            pagina.Controls.Add(desplazable);

            _pestanas.TabPages.Add(pagina);
            _tablas.Add(tabla);
            _actual = tabla;
        }

        /// <summary>
        /// El tamaño inicial: lo que pida la pestaña más alta, pero sin pasarse
        /// de la pantalla.
        ///
        /// El mínimo es deliberadamente CHICO. En un PC de portería con 1024x600
        /// y escalado, forzar un mínimo grande dejaría los botones de Guardar
        /// fuera de la vista y sin forma de alcanzarlos; con las barras de
        /// desplazamiento, lo que no quepa se alcanza siempre.
        /// </summary>
        /// <summary>
        /// El ancho de la columna de etiquetas, medido con la fuente REAL que
        /// está usando Windows ahora mismo. Acotado por los dos lados: ni tan
        /// angosta que recorte, ni tan ancha que se coma el campo.
        ///
        /// Devuelve el ancho aplicado.
        /// </summary>
        private int AjustarColumnaDeEtiquetas()
        {
            var necesario = 0;
            using (var g = CreateGraphics())
                foreach (var c in _columnaIzquierda)
                {
                    if (string.IsNullOrEmpty(c.Text)) continue;
                    // CON el relleno de MeasureText, no con NoPadding: así es
                    // como `Label` dibuja su texto, y midiendo sin él la columna
                    // salía 171 px y «Nombre de este agente» quedaba recortado.
                    // Lo pilló la autoprueba de recortes.
                    necesario = Math.Max(necesario, TextRenderer.MeasureText(g, c.Text, Font).Width);
                }

            _anchoEtiqueta = Math.Min(280, Math.Max(120, necesario + 14));
            foreach (var c in _columnaIzquierda) c.Width = _anchoEtiqueta - 8;
            foreach (var t in _tablas) t.ColumnStyles[0].Width = _anchoEtiqueta;
            return _anchoEtiqueta;
        }

        private void AjustarTamano()
        {
            var anchoEtiquetas = AjustarColumnaDeEtiquetas();
            var altoContenido = 0;
            foreach (var t in _tablas) altoContenido = Math.Max(altoContenido, t.PreferredSize.Height);

            var altoPestanas = _pestanas.ItemSize.Height > 0
                ? _pestanas.ItemSize.Height + 8
                : AltoPestanasPorOmision + 8;

            var trabajo = Screen.FromPoint(Cursor.Position).WorkingArea;
            var anchoMaximo = Math.Max(400, trabajo.Width - 60);
            var altoMaximo = Math.Max(300, trabajo.Height - 100);

            var ancho = Math.Min(anchoEtiquetas + AnchoCampo + 46, anchoMaximo);

            // El ancho PRIMERO, y solo después medir el pie: su alto depende del
            // ancho, porque los botones envuelven. Midiéndolo antes se tomaba el
            // del tamaño por omisión de un formulario vacío —donde envuelven
            // todos— y la ventana salía con 34 px de más.
            ClientSize = new Size(ancho, ClientSize.Height);
            OrganizarPie();

            ClientSize = new Size(ancho,
                Math.Min(altoContenido + altoPestanas + _pie.Height + 8, altoMaximo));
            MinimumSize = new Size(440, 300);
        }

        // ── Armado ───────────────────────────────────────────────────────────

        /// <summary>
        /// El pie: los botones de prueba, el resultado y Guardar/Cancelar.
        ///
        /// La colocación se calcula en `OrganizarPie` en vez de dejarla al
        /// autodimensionado de WinForms. Con un alto fijo (118 px) y posiciones
        /// fijas, al angostar la ventana —o con escalado al 125 %— el tercer
        /// botón se salía y Guardar quedaba fuera de la vista; y un
        /// `FlowLayoutPanel` que envuelve no da un alto fiable dentro de un
        /// contenedor que a su vez se autodimensiona. Calculándolo se sabe
        /// exactamente dónde queda cada botón, y se puede comprobar con pruebas.
        /// </summary>
        private Panel ConstruirPiePagina()
        {
            _pie = new Panel { Dock = DockStyle.Bottom, Height = 118 };

            var probar = new Button { Text = "Probar conexión", Size = new Size(140, 28) };
            probar.Click += async (s, e) => await Probar(probar).ConfigureAwait(true);

            var probarEquipo = new Button { Text = "Probar equipo…", Size = new Size(130, 28) };
            probarEquipo.Click += (s, e) => _abrirDiagnostico();

            var vaciarEquipo = new Button { Text = "Vaciar memoria del equipo…", Size = new Size(190, 28) };
            vaciarEquipo.Click += async (s, e) => await Vaciar(vaciarEquipo).ConfigureAwait(true);

            _botonesPrueba.Add(probar);
            _botonesPrueba.Add(probarEquipo);
            _botonesPrueba.Add(vaciarEquipo);
            foreach (var b in _botonesPrueba) _pie.Controls.Add(b);

            _prueba.Dock = DockStyle.None;
            _prueba.Anchor = AnchorStyles.Top | AnchorStyles.Left;
            _prueba.AutoSize = false;
            _prueba.ForeColor = Color.Gray;
            _pie.Controls.Add(_prueba);

            _guardar = new Button { Text = "Guardar", Size = new Size(92, 30) };
            _guardar.Click += (s, e) => Aceptar();
            _cancelar = new Button { Text = "Cancelar", Size = new Size(92, 30) };
            _cancelar.Click += (s, e) => Close();
            _pie.Controls.Add(_guardar);
            _pie.Controls.Add(_cancelar);

            // Cambiar el alto del pie dispara otro Resize: el candado evita la
            // recursión.
            _pie.Resize += (s, e) => OrganizarPie();

            AcceptButton = _guardar;
            CancelButton = _cancelar;
            return _pie;
        }

        /// <summary>
        /// Coloca los botones del pie según el ancho que haya, envolviendo a un
        /// renglón nuevo cuando no caben, y deja el pie con el alto justo.
        /// </summary>
        private void OrganizarPie()
        {
            if (_pie == null || _organizando || IsDisposed) return;
            _organizando = true;
            try
            {
                var ancho = Math.Max(240, _pie.ClientSize.Width);
                var x = Margen;
                var y = 8;
                var altoRenglon = 0;

                foreach (var b in _botonesPrueba)
                {
                    // El primero del renglón entra siempre, aunque no quepa:
                    // mejor que se salga por la derecha (con barra) que dejar un
                    // renglón vacío y nunca colocarlo.
                    if (x > Margen && x + b.Width > ancho - Margen)
                    {
                        x = Margen;
                        y += altoRenglon + 6;
                        altoRenglon = 0;
                    }
                    b.Location = new Point(x, y);
                    x += b.Width + 8;
                    altoRenglon = Math.Max(altoRenglon, b.Height);
                }
                y += altoRenglon + 8;

                // El resultado de la prueba envuelve: son mensajes de error del
                // servidor, que pueden ser largos.
                var anchoTexto = Math.Max(120, ancho - Margen * 2);
                _prueba.Location = new Point(Margen, y);
                _prueba.Size = new Size(anchoTexto, AltoDelTexto(_prueba.Text, anchoTexto));
                y += _prueba.Height + 8;

                // Guardar y Cancelar, abajo a la derecha. Con Math.Max para que
                // en una ventana muy angosta no se vayan a coordenada negativa.
                _cancelar.Location = new Point(Math.Max(Margen, ancho - Margen - _cancelar.Width), y);
                _guardar.Location = new Point(Math.Max(Margen, _cancelar.Left - 8 - _guardar.Width), y);
                y += _cancelar.Height + 8;

                _pie.Height = y;
            }
            finally
            {
                _organizando = false;
            }
        }

        /// <summary>Alto que necesita un texto envolviendo a <paramref name="ancho"/>.</summary>
        private int AltoDelTexto(string texto, int ancho)
        {
            using (var g = CreateGraphics())
            {
                var medida = TextRenderer.MeasureText(
                    g, string.IsNullOrEmpty(texto) ? "Ag" : texto, Font,
                    new Size(ancho, 0), TextFormatFlags.WordBreak);
                return Math.Max(18, medida.Height + 2);
            }
        }

        /// <summary>
        /// La etiqueta de la columna izquierda. Extraída porque la repetían
        /// `Campo`, `CampoConBoton` y `CamposEnLinea` con los mismos números.
        /// </summary>
        private Label EtiquetaDeCampo(string texto)
        {
            var lbl = new Label
            {
                Text = texto,
                AutoSize = false,
                Size = new Size(_anchoEtiqueta - 8, 23),
                TextAlign = ContentAlignment.MiddleLeft,
                Margin = new Padding(0, 4, 8, 0),
            };
            _columnaIzquierda.Add(lbl);
            return lbl;
        }

        /// <summary>
        /// Varios campos cortos en un mismo renglón, cada uno con su rótulo al
        /// lado: `[15] min  [2000] por lote  [10] lotes máx.`
        ///
        /// Para números que son el mismo asunto. En renglones separados cada uno
        /// cuesta su control, su texto de ayuda y su margen —unos 55 px— y la
        /// ventana se va de la pantalla; juntos comparten una sola ayuda.
        /// Envuelven solos si no caben a lo ancho.
        /// </summary>
        private void CamposEnLinea(string etiqueta, string ayuda, string[] rotulos, Control[] controles)
        {
            var fila = new FlowLayoutPanel
            {
                FlowDirection = FlowDirection.LeftToRight,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                WrapContents = true,
                // El tope de ancho es lo que hace que envuelvan en vez de
                // salirse de la columna.
                MaximumSize = new Size(AnchoCampo, 0),
                Margin = new Padding(0),
            };

            for (var i = 0; i < controles.Length; i++)
            {
                controles[i].Width = 64;
                controles[i].Margin = new Padding(i == 0 ? 0 : 14, 3, 5, 0);
                fila.Controls.Add(controles[i]);
                fila.Controls.Add(new Label
                {
                    Text = i < rotulos.Length ? rotulos[i] : "",
                    AutoSize = true,
                    ForeColor = Color.Gray,
                    Margin = new Padding(0, 8, 0, 0),
                });
            }

            var celda = new FlowLayoutPanel
            {
                FlowDirection = FlowDirection.TopDown,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Margin = new Padding(0, 0, 0, 8),
                WrapContents = false,
            };
            celda.Controls.Add(fila);
            if (!string.IsNullOrEmpty(ayuda)) celda.Controls.Add(Ayuda(ayuda));

            _actual.Controls.Add(EtiquetaDeCampo(etiqueta));
            _actual.Controls.Add(celda);
        }

        private void Campo(string etiqueta, Control control, string ayuda, bool estrecho = false)
        {
            var lbl = EtiquetaDeCampo(etiqueta);
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
            _actual.Controls.Add(lbl);
            _actual.Controls.Add(celda);
        }

        private void CampoConBoton(string etiqueta, Control control, string textoBoton,
            EventHandler alPulsar, string ayuda)
        {
            var lbl = EtiquetaDeCampo(etiqueta);

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

            _actual.Controls.Add(lbl);
            _actual.Controls.Add(celda);
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
            var hueco = new Label { Text = "", AutoSize = false, Size = new Size(_anchoEtiqueta - 8, 1) };
            _columnaIzquierda.Add(hueco);
            _actual.Controls.Add(hueco);
            _actual.Controls.Add(control);
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
            // El alto del pie depende del largo de este mensaje: sin esto, un
            // error largo del servidor se comería los botones de Guardar.
            OrganizarPie();
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
