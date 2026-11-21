"use server";

import { getRequestMeta } from "@/lib/devengados/audit";
import { Limitador } from "@/lib/pantalla/vinculacion-reglas";
import {
  guardarPruebaDeIntento, identificarCedula, iniciarIntento, terminarIntento, vincularEquipoConCodigo,
  type DatosInicio, type Identificacion, type Inicio,
} from "@/lib/psicosensotecnica/servidor";

// Prueba psicosensotécnica pública: sin sesión. La persona se identifica con la
// cédula y, desde que empieza, con la clave de su intento. Ninguna acción de
// este archivo puede llamar a getCurrentPermissions.
//
// Nada del navegador es de fiar: la cédula, el acceso y los datos de cada
// prueba se validan en el servidor, que además recalcula los resultados.

// En memoria (una por instancia): frena a quien prueba cédulas o códigos en serie.
const limiteCedula = new Limitador(20, 60_000);
const limiteCodigo = new Limitador(6, 60_000);

const DEMASIADOS = "Demasiados intentos. Espere un minuto y vuelva a probar.";
const fallo = (e: unknown) => ({ success: false as const, error: e instanceof Error ? e.message : "No se pudo completar. Intente de nuevo." });

export async function identificar(cedula: string): Promise<Identificacion> {
  try {
    const { ip } = await getRequestMeta();
    if (!limiteCedula.permite(ip ?? "sin-ip")) return { success: false, error: DEMASIADOS };
    return await identificarCedula(String(cedula ?? ""));
  } catch (e) {
    return fallo(e);
  }
}

export async function iniciar(datos: DatosInicio): Promise<Inicio> {
  try {
    const meta = await getRequestMeta();
    if (!limiteCedula.permite(meta.ip ?? "sin-ip")) return { success: false, error: DEMASIADOS };
    return await iniciarIntento(
      {
        cedula: String(datos?.cedula ?? ""),
        nombre: typeof datos?.nombre === "string" ? datos.nombre : undefined,
        celular: typeof datos?.celular === "string" ? datos.celular : undefined,
        autoriza: datos?.autoriza === true,
        tipoEntrada: datos?.tipoEntrada === "tactil" ? "tactil" : "raton",
      },
      meta
    );
  } catch (e) {
    return fallo(e);
  }
}

export async function guardarPrueba(token: string, prueba: string, datos: unknown) {
  try {
    return await guardarPruebaDeIntento(token, prueba, datos);
  } catch (e) {
    return fallo(e);
  }
}

export async function terminar(token: string) {
  try {
    return await terminarIntento(token);
  } catch (e) {
    return fallo(e);
  }
}

export async function vincularEquipo(codigo: string): Promise<{ success: true; nombre: string } | { success: false; error: string }> {
  try {
    const { ip } = await getRequestMeta();
    if (!limiteCodigo.permite(ip ?? "sin-ip")) return { success: false, error: DEMASIADOS };
    const equipo = await vincularEquipoConCodigo(String(codigo ?? ""));
    return equipo ? { success: true, nombre: equipo.nombre } : { success: false, error: "Ese código no sirve o ya venció. Pida uno nuevo." };
  } catch (e) {
    return fallo(e);
  }
}
