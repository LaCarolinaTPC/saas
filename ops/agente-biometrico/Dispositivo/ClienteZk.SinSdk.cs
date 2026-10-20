using System;
using System.Threading;
using System.Threading.Tasks;

namespace Gestivo.AgenteBiometrico.Dispositivo
{
    /// <summary>
    /// `ClienteZk` cuando el proyecto se compiló SIN el interop del SDK.
    ///
    /// Este archivo y `ClienteZk.Com.cs` definen la misma clase y se excluyen
    /// mutuamente: el .csproj compila uno u otro según exista
    /// `Lib\Interop.zkemkeeper.dll`. Hace falta porque el SDK de ZK es un COM de
    /// 32 bits que solo está en el PC de ZKAccess, y sin esto el agente entero
    /// —incluida la vía Access, que funciona hoy— no se podría compilar ni
    /// probar en ningún otro equipo.
    ///
    /// No es un «no hace nada» silencioso: falla con un mensaje que dice
    /// exactamente qué falta y cómo se arregla, y la ventana de Estado muestra
    /// «compilado sin el SDK» para que nadie persiga un fantasma.
    /// </summary>
    public sealed class ClienteZk : IEquipoZk
    {
        internal const string Explicacion =
            "Este agente se compiló sin el SDK del lector, así que la lectura directa del " +
            "equipo no está disponible (la vía Access sí funciona). Para habilitarla: copie " +
            "zkemkeeper.dll del PC donde está instalado ZKAccess, genérele el interop con " +
            "TlbImp a ops\\agente-biometrico\\Lib\\Interop.zkemkeeper.dll y vuelva a compilar. " +
            "El README del agente tiene la orden exacta.";

        public bool SdkDisponible { get { return false; } }
        public bool Conectado { get { return false; } }

        // Declarados para cumplir el contrato. El `remove` vacío evita el aviso
        // del compilador por evento nunca usado sin desactivarlo globalmente.
        public event Action<EventoEquipo> Evento { add { } remove { } }
        public event Action Desconectado { add { } remove { } }

        public Task<InfoEquipo> Conectar(string ip, int puerto, int numero, int? claveComm)
        {
            throw new InvalidOperationException(Explicacion);
        }

        public Task<bool> RegistrarEventos(int numero)
        {
            throw new InvalidOperationException(Explicacion);
        }

        public Task<ResultadoLectura> LeerRegistros(int numero, DateTime? desde, CancellationToken ct)
        {
            throw new InvalidOperationException(Explicacion);
        }

        public Task<bool> Ping(int numero)
        {
            return Task.FromResult(false);
        }

        public Task<InfoEquipo> Consultar(int numero)
        {
            throw new InvalidOperationException(Explicacion);
        }

        public Task<bool> Vaciar(int numero)
        {
            throw new InvalidOperationException(Explicacion);
        }

        public Task Desconectar()
        {
            return Task.FromResult(0);
        }

        public Task Diagnosticar(EquipoConfigurado equipo, int? claveComm, int numero,
            Action<string> escribir, CancellationToken ct)
        {
            if (escribir != null) escribir(Explicacion);
            return Task.FromResult(0);
        }

        public void Dispose()
        {
        }
    }
}
