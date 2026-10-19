using System;
using System.Security.Cryptography;
using System.Text;

namespace Gestivo.AgenteBiometrico.Nucleo
{
    /// <summary>
    /// Cifrado del secreto de Gestivo y de la contraseña de la base Access.
    ///
    /// Se usa DPAPI con ámbito de USUARIO (CurrentUser). Consecuencias, a
    /// propósito:
    ///   · solo la cuenta de Windows que lo escribió puede descifrarlo, en ese
    ///     mismo equipo;
    ///   · copiar el config.json a otro PC o a otra cuenta no sirve de nada: hay
    ///     que volver a escribir el secreto en la ventana.
    ///
    /// Es lo más seguro que se puede hacer en un PC compartido sin pedirle una
    /// contraseña maestra al operario. Las alternativas eran peores: pasar el
    /// secreto por la línea de comandos lo deja visible en el Programador de
    /// tareas, y una variable de entorno de máquina la lee cualquier usuario.
    /// </summary>
    public static class Secretos
    {
        // Entropía adicional: no es un secreto (está en el binario), solo evita
        // que un blob cifrado por otra aplicación de la misma cuenta se pueda
        // descifrar con esta.
        private static readonly byte[] Entropia =
            Encoding.UTF8.GetBytes("Gestivo.AgenteBiometrico.v1");

        public static string Cifrar(string texto)
        {
            if (string.IsNullOrEmpty(texto)) return "";
            var datos = Encoding.UTF8.GetBytes(texto);
            var cifrado = ProtectedData.Protect(datos, Entropia, DataProtectionScope.CurrentUser);
            return Convert.ToBase64String(cifrado);
        }

        /// <summary>
        /// Devuelve "" si el blob no es descifrable (config copiado de otro
        /// equipo o de otra cuenta). El llamador lo trata como «sin configurar».
        /// </summary>
        public static string Descifrar(string cifradoBase64)
        {
            if (string.IsNullOrEmpty(cifradoBase64)) return "";
            try
            {
                var cifrado = Convert.FromBase64String(cifradoBase64);
                var datos = ProtectedData.Unprotect(cifrado, Entropia, DataProtectionScope.CurrentUser);
                return Encoding.UTF8.GetString(datos);
            }
            catch (Exception e)
            {
                Bitacora.Error(
                    "No se pudo descifrar un dato guardado (¿el config viene de otro equipo o de otra cuenta de Windows?). Vuelva a escribirlo en Configuración",
                    e);
                return "";
            }
        }
    }
}
