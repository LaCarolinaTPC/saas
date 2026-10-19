using System;
using System.Drawing;
using System.Drawing.Drawing2D;

namespace Gestivo.AgenteBiometrico.Recursos
{
    /// <summary>
    /// El glifo de la aplicación: una huella. Se dibuja en código para poder
    /// teñirlo según el estado del agente, que es lo que hace el icono de la
    /// bandeja (verde al día, rojo con error…).
    ///
    /// El mismo dibujo, en PowerShell, genera `agente.ico` (el icono del .exe y
    /// de las ventanas): ver `generar-icono.ps1`. Si se cambia uno, cambie el
    /// otro y vuelva a generar el .ico.
    /// </summary>
    internal static class Glifo
    {
        /// <summary>Indigo de Gestivo.</summary>
        internal static readonly Color Marca = Color.FromArgb(79, 70, 229);

        /// <summary>
        /// Dibuja la huella en un cuadrado de <paramref name="lado"/> píxeles.
        /// Con <paramref name="fondo"/> nulo queda sobre transparente, que es
        /// como se usa en la bandeja: la barra de tareas ya tiene su color y un
        /// recuadro sólido se vería como un parche.
        /// </summary>
        internal static Bitmap Dibujar(int lado, Color tinta, Color? fondo = null)
        {
            var bmp = new Bitmap(lado, lado);
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.Clear(Color.Transparent);

                if (fondo.HasValue)
                {
                    var r = Math.Max(2, (int)(lado * 0.22));
                    using (var ruta = new GraphicsPath())
                    {
                        var d = r * 2;
                        ruta.AddArc(0, 0, d, d, 180, 90);
                        ruta.AddArc(lado - d, 0, d, d, 270, 90);
                        ruta.AddArc(lado - d, lado - d, d, d, 0, 90);
                        ruta.AddArc(0, lado - d, d, d, 90, 90);
                        ruta.CloseFigure();
                        using (var pincel = new SolidBrush(fondo.Value)) g.FillPath(pincel, ruta);
                    }
                }

                // A 16 px tres anillos se emborronan: dos, y más gruesos.
                var chico = lado <= 20;
                var grosor = Math.Max(1.6f, lado * (chico ? 0.11f : 0.075f));
                using (var lapiz = new Pen(tinta, grosor) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                {
                    var cx = lado / 2f;
                    var cy = lado * 0.50f;
                    // Elípticos y de barrido amplio: bajan por los costados, que
                    // es lo que distingue una huella de un símbolo de wifi.
                    float[][] anillos = chico
                        ? new[]
                        {
                            new[] { 0.29f, 0.34f, 160f, 220f },
                            new[] { 0.12f, 0.16f, 172f, 196f },
                        }
                        : new[]
                        {
                            new[] { 0.30f, 0.36f, 160f, 220f },
                            new[] { 0.20f, 0.25f, 165f, 210f },
                            new[] { 0.10f, 0.14f, 175f, 190f },
                        };
                    foreach (var a in anillos)
                    {
                        var rx = lado * a[0];
                        var ry = lado * a[1];
                        g.DrawArc(lapiz, cx - rx, cy - ry, rx * 2, ry * 2, a[2], a[3]);
                    }
                    if (!chico)
                        g.DrawLine(lapiz, cx, cy - lado * 0.06f, cx, cy + lado * 0.08f);
                }
            }
            return bmp;
        }

        /// <summary>
        /// Icono de bandeja del color pedido. Windows lo pide a 16 px (32 con
        /// escalado), así que se dibuja a 32 y él lo reduce.
        /// </summary>
        internal static Icon IconoBandeja(Color tinta)
        {
            using (var bmp = Dibujar(32, tinta))
            {
                var h = bmp.GetHicon();
                try
                {
                    // Icon.FromHandle no es dueño del handle: se clona para
                    // poder liberarlo y que el icono siga siendo válido.
                    using (var temporal = Icon.FromHandle(h)) return (Icon)temporal.Clone();
                }
                finally
                {
                    DestruirIcono(h);
                }
            }
        }

        [System.Runtime.InteropServices.DllImport("user32.dll", EntryPoint = "DestroyIcon")]
        private static extern bool DestruirIcono(IntPtr handle);
    }
}
