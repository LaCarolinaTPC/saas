using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using Gestivo.AgenteBiometrico.Datos;
using Gestivo.AgenteBiometrico.Dispositivo;
using Gestivo.AgenteBiometrico.Nucleo;
using Gestivo.AgenteBiometrico.Red;

namespace Gestivo.AgenteBiometrico.Sincronizacion
{
    public enum Salud
    {
        /// <summary>Falta configurar algo: no se ha intentado nada.</summary>
        SinConfigurar,
        /// <summary>Último ciclo bien.</summary>
        Bien,
        /// <summary>Un ciclo en curso.</summary>
        Trabajando,
        /// <summary>El último ciclo falló.</summary>
        Mal,
        /// <summary>
        /// La vía Access está apagada a propósito en este PC (el agente corre
        /// en otro PC, solo con la lectura directa). No es un error.
        /// </summary>
        Desactivada,
    }

    /// <summary>Lo que muestran la bandeja y la ventana de Estado.</summary>
    public class EstadoAgente
    {
        public Salud Salud { get; set; } = Salud.SinConfigurar;
        public DateTime? UltimoIntento { get; set; }
        public DateTime? UltimoExito { get; set; }
        public long UltimoIdServidor { get; set; }
        public long MaximoIdEquipo { get; set; }
        public int NuevasUltimoCiclo { get; set; }
        public int LotesUltimoCiclo { get; set; }
        public string UltimoError { get; set; }
        /// <summary>Progreso del ciclo en curso, para la carga histórica.</summary>
        public string Progreso { get; set; }

        /// <summary>
        /// Marcaciones del equipo que Gestivo todavía no tiene. Es un CONTEO
        /// real de la base, no la resta de ids: el log del equipo mezcla todos
        /// los tipos de evento y restar daba cifras disparatadas.
        /// </summary>
        public long Pendientes { get; set; }

        /// <summary>
        /// Lo que faltaba al EMPEZAR el ciclo. Con `Pendientes` da el avance de
        /// la barra; sin él no habría contra qué medir el progreso.
        /// </summary>
        public long TotalPorSubir { get; set; }

        public EstadoAgente Copia()
        {
            return (EstadoAgente)MemberwiseClone();
        }
    }

    /// <summary>
    /// El ciclo: pregunta a Gestivo hasta dónde llegó, lee lo que sigue de la
    /// base del equipo y lo manda por lotes.
    ///
    /// La marca de avance vive en el SERVIDOR, no aquí. Así un ciclo que muere a
    /// mitad no deja nada adelantado, reinstalar el PC no pierde nada y la carga
    /// histórica es reanudable sola. Cuesta un GET por ciclo.
    ///
    /// Nunca corren dos ciclos a la vez: si el temporizador dispara mientras uno
    /// trabaja, se salta (no se encola).
    /// </summary>
    public class Sincronizador
    {
        private readonly Func<Configuracion> _config;
        private readonly SemaphoreSlim _unoALaVez = new SemaphoreSlim(1, 1);
        private readonly object _candado = new object();
        private EstadoAgente _estado = new EstadoAgente();

        /// <summary>
        /// Tope de un ciclo. Ningún paso debería acercarse (HTTP tiene 120 s), pero
        /// el OLE DB de Jet no tiene timeout: si el Access.mdb queda bloqueado
        /// (copia de seguridad, antivirus, ZKAccess compactando) la lectura
        /// puede no volver nunca, y con ella este ciclo y todos los siguientes.
        /// Pasado el tope el ciclo se da por perdido y el siguiente arranca de
        /// cero; repetir es inofensivo, porque la marca vive en el servidor.
        /// </summary>
        private static readonly TimeSpan TopeCiclo = TimeSpan.FromMinutes(20);

        /// <summary>Último motivo por el que un ciclo no trabajó (se anota solo al cambiar).</summary>
        private string _motivoInactivo;

        /// <summary>Avisa a la interfaz que algo cambió. Puede venir de otro hilo.</summary>
        public event Action<EstadoAgente> Cambio;

        /// <summary>
        /// La lista de lectores que ZKAccess tiene registrados, recién leída.
        ///
        /// La publica esta vía porque ya abre la base en cada ciclo: así la vía
        /// equipo se entera de un lector nuevo sin abrirla otra vez por su
        /// cuenta ni sondear nada.
        /// </summary>
        public event Action<List<EquipoConfigurado>> EquiposLeidos;

        public Sincronizador(Func<Configuracion> config)
        {
            _config = config;
        }

        public EstadoAgente Estado
        {
            get { lock (_candado) return _estado.Copia(); }
        }

        private void Actualizar(Action<EstadoAgente> cambiar)
        {
            EstadoAgente copia;
            lock (_candado)
            {
                cambiar(_estado);
                copia = _estado.Copia();
            }
            var h = Cambio;
            if (h != null) h(copia);
        }

        /// <summary>
        /// Un ciclo completo. Nunca lanza: todo error queda en el estado y en la
        /// bitácora, porque lo llama un temporizador.
        /// </summary>
        public async Task Ciclo(CancellationToken ct, bool manual = false)
        {
            if (!_unoALaVez.Wait(0))
            {
                Bitacora.Aviso(manual
                    ? "«Sincronizar ahora»: ya hay un ciclo en curso, se ignora."
                    : "El ciclo anterior no ha terminado: se salta este turno.");
                return;
            }
            try
            {
                var cfg = _config();
                if (!cfg.ViaAccessHabilitada)
                {
                    AnotarInactivo("vía Access desactivada en la configuración");
                    Actualizar(e =>
                    {
                        e.Salud = Salud.Desactivada;
                        e.UltimoError = null;
                        e.Progreso = null;
                    });
                    return;
                }
                if (!cfg.EstaCompleta)
                {
                    AnotarInactivo("falta configurar " + cfg.QueFalta());
                    Actualizar(e =>
                    {
                        e.Salud = Salud.SinConfigurar;
                        e.UltimoError = "Falta configurar " + cfg.QueFalta() + ".";
                    });
                    return;
                }
                var secreto = cfg.Secreto;
                if (string.IsNullOrEmpty(secreto))
                {
                    AnotarInactivo("el secreto guardado no se pudo descifrar");
                    Actualizar(e =>
                    {
                        e.Salud = Salud.SinConfigurar;
                        e.UltimoError =
                            "El secreto guardado no se pudo descifrar (¿la configuración viene de otro equipo o de otra cuenta?). Vuelva a escribirlo.";
                    });
                    return;
                }

                Actualizar(e =>
                {
                    e.Salud = Salud.Trabajando;
                    e.UltimoIntento = DateTime.Now;
                    e.Progreso = "Consultando a Gestivo…";
                });

                AnotarInactivo(null);

                var trabajo = Trabajar(cfg, secreto, ct);
                if (await Task.WhenAny(trabajo, Task.Delay(TopeCiclo, ct)).ConfigureAwait(false) != trabajo)
                {
                    ct.ThrowIfCancellationRequested();
                    // Se abandona: su excepción, si llega, se observa para que
                    // no quede suelta. El siguiente ciclo empieza de cero.
                    var _ = trabajo.ContinueWith(t => { var x = t.Exception; },
                        TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously);
                    throw new TimeoutException("El ciclo lleva más de " + (int)TopeCiclo.TotalMinutes +
                        " min sin terminar (¿Access.mdb bloqueado o red colgada?). Se abandona y se reintenta.");
                }
                await trabajo.ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                Bitacora.Info("Ciclo cancelado (el agente se está cerrando).");
                Actualizar(e => { e.Progreso = null; });
            }
            catch (OperationCanceledException e)
            {
                // En .NET Framework el timeout de HttpClient llega como una
                // cancelación. Antes se tomaba por «cerrándose» y el icono quedaba
                // en «trabajando» sin decir nada.
                Bitacora.Error("Gestivo no respondió a tiempo (¿sin internet o el servidor lento?); se reintenta", e);
                Actualizar(x =>
                {
                    x.Salud = Salud.Mal;
                    x.UltimoError = "Gestivo no respondió a tiempo. Se reintenta solo.";
                    x.Progreso = null;
                });
            }
            catch (ErrorGestivo e)
            {
                Bitacora.Error("Gestivo rechazó el envío", e);
                Actualizar(x =>
                {
                    x.Salud = Salud.Mal;
                    x.UltimoError = e.Message;
                    x.Progreso = null;
                });
            }
            catch (Exception e)
            {
                Bitacora.Error("Falló el ciclo", e);
                Actualizar(x =>
                {
                    x.Salud = Salud.Mal;
                    x.UltimoError = e.Message;
                    x.Progreso = null;
                });
            }
            finally
            {
                _unoALaVez.Release();
            }
        }

        /// <summary>Deja en la bitácora por qué el ciclo no trabaja, solo cuando cambia.</summary>
        private void AnotarInactivo(string motivo)
        {
            string antes;
            lock (_candado)
            {
                antes = _motivoInactivo;
                _motivoInactivo = motivo;
            }
            if (motivo == antes) return;
            if (motivo != null) Bitacora.Aviso("La vía Access no sincroniza: " + motivo + ".");
            else if (antes != null) Bitacora.Info("La vía Access vuelve a sincronizar.");
        }

        private async Task Trabajar(Configuracion cfg, string secreto, CancellationToken ct)
        {
            var proveedor = Proveedor.Resolver(cfg.Proveedor);

            using (var cliente = new ClienteGestivo(cfg.Url, secreto))
            {
                var estado = await cliente.LeerEstado(ct).ConfigureAwait(false);
                var desdeId = estado.UltimoId ?? 0;
                Bitacora.Info("Gestivo tiene hasta el id " + desdeId + ".");

                using (var lector = new LectorZk(proveedor, cfg.Mdb, cfg.ClaveMdb))
                {
                    // La base ya está abierta: es el momento barato de publicar
                    // la lista de lectores para la vía equipo. Nunca tumba el
                    // ciclo: esta vía funciona igual sin ella.
                    try
                    {
                        var h = EquiposLeidos;
                        if (h != null) h(lector.LeerEquipos());
                    }
                    catch (Exception e)
                    {
                        Bitacora.Error("No se pudo publicar la lista de lectores de ZKAccess", e);
                    }

                    // La serie de cada `device_id`, para las filas que llegan sin
                    // ella: la llave natural es `(device_sn, pin, momento)`, y una
                    // fila con SN vacío no colapsaría con la misma huella traída
                    // por la vía equipo. El servidor también la completa, pero el
                    // dato de primera mano está aquí.
                    var series = lector.LeerSeriesPorEquipo();

                    var maximo = lector.MaximoId();
                    var pendientes = lector.ContarPendientes(desdeId);
                    Actualizar(e =>
                    {
                        e.UltimoIdServidor = desdeId;
                        e.MaximoIdEquipo = maximo;
                        e.Pendientes = pendientes;
                        e.TotalPorSubir = pendientes;
                    });
                    Bitacora.Info("Faltan por subir: " + pendientes + " marcación(es).");

                    // El espejo de personas va en el primer envío del ciclo: es
                    // lo que permite atribuir las marcaciones a una cédula.
                    List<PersonaZk> personas = null;
                    if (cfg.EnviarPersonas)
                    {
                        personas = lector.LeerPersonas();
                        Bitacora.Info("Personas en el equipo: " + personas.Count + ".");
                    }

                    var totalNuevas = 0;
                    var totalEnviadas = 0L;
                    var lotes = 0;
                    var cursor = desdeId;

                    for (var i = 1; i <= cfg.MaxLotes; i++)
                    {
                        ct.ThrowIfCancellationRequested();

                        var marcaciones = lector.LeerMarcaciones(cursor, cfg.TamanoLote);
                        LectorZk.CompletarSeries(marcaciones, series);

                        if (marcaciones.Count == 0)
                        {
                            // Nada nuevo. En el primer lote se manda igual: deja
                            // latido en la bitácora del servidor (así la pantalla
                            // sabe que el agente está vivo) y sube las personas.
                            if (i == 1)
                            {
                                var r0 = await cliente
                                    .Enviar(cfg.NombreAgente, personas, new List<MarcacionZk>(), ct)
                                    .ConfigureAwait(false);
                                lotes++;
                                Bitacora.Info("Sin marcaciones nuevas: latido enviado.");
                                if (r0.UltimoId.HasValue) cursor = r0.UltimoId.Value;
                            }
                            break;
                        }

                        // Lo que queda se descuenta de lo contado al empezar: no
                        // se vuelve a consultar la base en cada lote.
                        var restantes = Math.Max(0, pendientes - totalEnviadas);
                        Actualizar(e =>
                        {
                            e.Pendientes = restantes;
                            e.Progreso = "Lote " + i + "/" + cfg.MaxLotes + " · faltan " +
                                         restantes.ToString("N0", CultureInfo.GetCultureInfo("es-CO"));
                        });

                        var r = await cliente
                            .Enviar(cfg.NombreAgente, i == 1 ? personas : null, marcaciones, ct)
                            .ConfigureAwait(false);

                        totalNuevas += r.Nuevas;
                        totalEnviadas += marcaciones.Count;
                        lotes++;
                        Bitacora.Info(
                            "Lote " + i + ": " + marcaciones[0].momento.Substring(0, 10) + " a " +
                            marcaciones[marcaciones.Count - 1].momento.Substring(0, 10) +
                            " · ids " + marcaciones[0].id + ".." + marcaciones[marcaciones.Count - 1].id +
                            " · nuevas " + r.Nuevas + " · repetidas " + r.Repetidas +
                            " · faltan " + restantes.ToString("N0", CultureInfo.GetCultureInfo("es-CO")));

                        // El servidor manda: se sigue desde lo que él confirmó.
                        // `id` es nulable desde que existe la vía equipo, pero
                        // en esta vía lo trae siempre; el `?? cursor` es solo
                        // para no obligar al compilador a fiarse de eso.
                        cursor = r.UltimoId ?? marcaciones[marcaciones.Count - 1].id ?? cursor;

                        // Menos filas que el tope = se acabó lo que había.
                        if (marcaciones.Count < cfg.TamanoLote) break;

                        if (i == cfg.MaxLotes)
                        {
                            var faltan = Math.Max(0, pendientes - totalEnviadas);
                            if (faltan > 0)
                                Bitacora.Aviso(
                                    "Se alcanzó el máximo de lotes del ciclo; faltan " + faltan +
                                    " marcaciones. Siguen en el próximo ciclo (o suba «Máximo de lotes» para la carga histórica).");
                        }
                    }

                    var nuevasCiclo = totalNuevas;
                    var lotesCiclo = lotes;
                    var cursorFinal = cursor;
                    var faltanAlFinal = Math.Max(0, pendientes - totalEnviadas);
                    Actualizar(e =>
                    {
                        e.Salud = Salud.Bien;
                        e.UltimoExito = DateTime.Now;
                        e.UltimoIdServidor = cursorFinal;
                        e.NuevasUltimoCiclo = nuevasCiclo;
                        e.LotesUltimoCiclo = lotesCiclo;
                        e.Pendientes = faltanAlFinal;
                        e.UltimoError = null;
                        e.Progreso = null;
                    });
                    Bitacora.Info("Ciclo listo: " + lotesCiclo + " lote(s), " + nuevasCiclo + " marcación(es) nueva(s).");
                }
            }
        }
    }
}
