/**
 * Grabación de respuestas de IA para las pruebas (23-nov-2026).
 *
 * Con IA_GRABACION=<carpeta> y GESTIVO_ENTORNO=desarrollo, cada llamada a un
 * modelo (chat, lectura de documentos, transcripción) se busca primero en
 * <carpeta>/<tipo>-<hash>.json: si está, se devuelve sin llamar al proveedor
 * (costo y tokens en cero); si no, se llama y se guarda. El hash sale de todo
 * lo que se le manda al modelo (modelo, instrucciones, mensajes y archivos),
 * así que basta con cambiar el prompt o el documento para que se vuelva a
 * llamar de verdad.
 *
 * Sirve para repetir las baterías de selección gratis mientras se corrigen
 * reglas. Sin la variable, o fuera de desarrollo, no hace nada.
 */
import { createHash } from "node:crypto";

/** Carpeta de grabaciones, o null si no está activa (nunca en producción). */
export function carpetaGrabacion(): string | null {
  const carpeta = process.env.IA_GRABACION?.trim();
  if (!carpeta) return null;
  if (process.env.GESTIVO_ENTORNO?.trim().toLowerCase() !== "desarrollo") return null;
  return carpeta;
}

/** Huella estable de lo que se le manda al modelo (los bytes se resumen aparte para no serializarlos). */
export function huellaLlamada(partes: unknown): string {
  const h = createHash("sha256");
  h.update(
    JSON.stringify(partes, (_k, v: unknown) => {
      if (v instanceof Uint8Array) return `bytes:${createHash("sha256").update(v).digest("hex")}`;
      if (v instanceof ArrayBuffer) return `bytes:${createHash("sha256").update(new Uint8Array(v)).digest("hex")}`;
      return v;
    })
  );
  return h.digest("hex").slice(0, 32);
}

/** Cuántas respuestas se repitieron y cuántas se pidieron de verdad en este proceso (para el informe de las baterías). */
export const contadorGrabacion = { repetidas: 0, nuevas: 0 };

/**
 * Llama a `llamar` o repite la respuesta grabada. `sinCosto` deja en cero el
 * costo y los tokens de una respuesta repetida; `guardable` decide qué
 * respuestas se guardan (por defecto todas: un error se lanza y no se guarda).
 */
export async function conGrabacion<T>(
  tipo: string,
  partes: unknown,
  llamar: () => Promise<T>,
  opciones: { sinCosto?: (r: T) => T; guardable?: (r: T) => boolean } = {}
): Promise<T> {
  const carpeta = carpetaGrabacion();
  if (!carpeta) return llamar();
  const { mkdir, readFile, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const archivo = join(carpeta, `${tipo}-${huellaLlamada({ tipo, partes })}.json`);
  try {
    const guardada = JSON.parse(await readFile(archivo, "utf8")) as { respuesta: T };
    contadorGrabacion.repetidas++;
    return opciones.sinCosto ? opciones.sinCosto(guardada.respuesta) : guardada.respuesta;
  } catch {
    // No está grabada (o el archivo está dañado): se llama de verdad.
  }
  const respuesta = await llamar();
  contadorGrabacion.nuevas++;
  if (!opciones.guardable || opciones.guardable(respuesta)) {
    await mkdir(carpeta, { recursive: true });
    await writeFile(archivo, JSON.stringify({ tipo, grabada: new Date().toISOString(), respuesta }, null, 1));
  }
  return respuesta;
}
