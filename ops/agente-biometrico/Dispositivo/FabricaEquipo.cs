using Gestivo.AgenteBiometrico.Nucleo;

namespace Gestivo.AgenteBiometrico.Dispositivo
{
    /// <summary>
    /// Elige con qué SDK hablarle a cada lector.
    ///
    /// No es una preferencia nuestra: lo dice ZKAccess en
    /// `Machines.DevSDKType`, y su propio enum `SDKType` lo traduce
    /// (`1 = PullSDK`, `2 = StandaloneSDK`). Respetarlo es lo que evita el
    /// error que costó una tarde: a un lector pull (este MA500) se le puede
    /// conectar con el SDK standalone y responder a los comandos simples, pero
    /// TODA lectura de registros falla con -101 («el campo de condición no
    /// existe en la tabla»), porque por debajo traduce la consulta mal.
    ///
    /// Y es per-lector a propósito: si mañana entra un terminal de los otros,
    /// cada uno usa el suyo sin tocar configuración.
    /// </summary>
    public static class FabricaEquipo
    {
        /// <summary>El valor de `Machines.DevSDKType` para un lector pull.</summary>
        public const int SdkPull = 1;

        /// <summary>Y para uno del SDK clásico.</summary>
        public const int SdkStandalone = 2;

        public static IEquipoZk Crear(EquipoConfigurado equipo)
        {
            // Sin dato, pull: es lo que tiene esta instalación, y el standalone
            // ya demostró que con un equipo pull no sirve.
            if (equipo == null || equipo.TipoSdk != SdkStandalone)
                return new ClientePull(equipo == null ? "equipo" : equipo.Nombre);

            Bitacora.Info("El lector «" + equipo.Nombre +
                          "» está marcado como SDK clásico (DevSDKType = 2): se usa zkemkeeper.");
            return new ClienteZk(equipo.Nombre);
        }

        /// <summary>Cómo se llama la vía, para la bitácora y la pantalla.</summary>
        public static string Nombre(EquipoConfigurado equipo)
        {
            return equipo != null && equipo.TipoSdk == SdkStandalone ? "zkemkeeper" : "pull";
        }
    }
}
