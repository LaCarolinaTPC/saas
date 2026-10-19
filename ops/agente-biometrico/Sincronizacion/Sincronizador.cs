using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using Gestivo.AgenteBiometrico.Datos;
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

        /// <summary>Marcaciones del equipo que Gestivo todavía no tiene.</summary>
        public long Pendientes
        {
            get { return Math.Max(0, MaximoIdEquipo - UltimoIdServidor); }
        }

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

        /// <summary>Avisa a la interfaz que algo cambió. Puede venir de otro hilo.</summary>
        public event Action<EstadoAgente> Cambio;

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
                if (!cfg.EstaCompleta)
                {
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

                await Trabajar(cfg, secreto, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                Bitacora.Info("Ciclo cancelado (el agente se está cerrando).");
                Actualizar(e => { e.Progreso = null; });
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
                    var maximo = lector.MaximoId();
                    Actualizar(e =>
                    {
                        e.UltimoIdServidor = desdeId;
                        e.MaximoIdEquipo = maximo;
                    });

                    // El espejo de personas va en el primer envío del ciclo: es
                    // lo que permite atribuir las marcaciones a una cédula.
                    List<PersonaZk> personas = null;
                    if (cfg.EnviarPersonas)
                    {
                        personas = lector.LeerPersonas();
                        Bitacora.Info("Personas en el equipo: " + personas.Count + ".");
                    }

                    var totalNuevas = 0;
                    var lotes = 0;
                    var cursor = desdeId;

                    for (var i = 1; i <= cfg.MaxLotes; i++)
                    {
                        ct.ThrowIfCancellationRequested();

                        var marcaciones = lector.LeerMarcaciones(cursor, cfg.TamanoLote);

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

                        var pendientes = Math.Max(0, maximo - cursor);
                        Actualizar(e =>
                            e.Progreso = "Lote " + i + "/" + cfg.MaxLotes + " · " +
                                         marcaciones.Count + " marcaciones · faltan ~" +
                                         pendientes.ToString("N0", CultureInfo.GetCultureInfo("es-CO")));

                        var r = await cliente
                            .Enviar(cfg.NombreAgente, i == 1 ? personas : null, marcaciones, ct)
                            .ConfigureAwait(false);

                        totalNuevas += r.Nuevas;
                        lotes++;
                        Bitacora.Info(
                            "Lote " + i + ": ids " + marcaciones[0].id + ".." +
                            marcaciones[marcaciones.Count - 1].id +
                            " · recibidas " + r.Recibidas + " · nuevas " + r.Nuevas +
                            " · repetidas " + r.Repetidas);

                        // El servidor manda: se sigue desde lo que él confirmó.
                        cursor = r.UltimoId ?? marcaciones[marcaciones.Count - 1].id;

                        // Menos filas que el tope = se acabó lo que había.
                        if (marcaciones.Count < cfg.TamanoLote) break;

                        if (i == cfg.MaxLotes)
                        {
                            var faltan = Math.Max(0, maximo - cursor);
                            if (faltan > 0)
                                Bitacora.Aviso(
                                    "Se alcanzó el máximo de lotes del ciclo; faltan ~" + faltan +
                                    " marcaciones. Siguen en el próximo ciclo (o suba «Máximo de lotes» para la carga histórica).");
                        }
                    }

                    var nuevasCiclo = totalNuevas;
                    var lotesCiclo = lotes;
                    var cursorFinal = cursor;
                    Actualizar(e =>
                    {
                        e.Salud = Salud.Bien;
                        e.UltimoExito = DateTime.Now;
                        e.UltimoIdServidor = cursorFinal;
                        e.NuevasUltimoCiclo = nuevasCiclo;
                        e.LotesUltimoCiclo = lotesCiclo;
                        e.UltimoError = null;
                        e.Progreso = null;
                    });
                    Bitacora.Info("Ciclo listo: " + lotesCiclo + " lote(s), " + nuevasCiclo + " marcación(es) nueva(s).");
                }
            }
        }
    }
}
