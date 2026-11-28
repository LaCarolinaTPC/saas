/**
 * Destinos de prueba en el entorno de pruebas (24-nov-2026). Solo servidor.
 *
 * La base de desarrollo es copia de producción: aspirantes y laboratorios son
 * reales, así que en desarrollo ni el WhatsApp ni el correo salen. Lo que va a
 * un destino de prueba sí sale de verdad: los correos y números de las listas
 * de Selección › Tiempos y reglas › Entorno de pruebas (ajustes
 * correos_prueba_desarrollo y whatsapp_prueba_desarrollo), más las variables
 * CORREO_PERMITIDOS_DESARROLLO y WHATSAPP_PERMITIDOS_DESARROLLO si existen.
 * En producción no se lee nada y todo sale normal.
 */

export function enDesarrollo(entorno: string | undefined = process.env.GESTIVO_ENTORNO): boolean {
  return entorno?.trim().toLowerCase() === "desarrollo";
}

/** «300 123 4567», «+57 300…» → «573001234567». */
export function normalizarTelefonoPrueba(t: string | null | undefined): string {
  const d = String(t ?? "").replace(/\D/g, "");
  return d.length === 10 ? `57${d}` : d;
}

/** ¿El correo está en la lista? Vale el correo exacto o un dominio con @ («@empresa.com»). */
export function esCorreoDePrueba(lista: string[], correo: string | null | undefined): boolean {
  const c = String(correo ?? "").trim().toLowerCase();
  if (!c) return false;
  return lista.some((l) => {
    const x = l.trim().toLowerCase();
    return x.startsWith("@") ? c.endsWith(x) : x === c;
  });
}

export function esWhatsappDePrueba(lista: string[], telefono: string | null | undefined): boolean {
  const t = normalizarTelefonoPrueba(telefono);
  return t.length >= 10 && lista.some((l) => normalizarTelefonoPrueba(l) === t);
}

const separar = (v: unknown): string[] =>
  (Array.isArray(v) ? v.map(String) : String(v ?? "").split(/[,;\s]+/)).map((x) => x.trim()).filter(Boolean);

let cache: { hasta: number; listas: Promise<{ correos: string[]; whatsapp: string[] }> } | null = null;

/** Las dos listas (unos segundos en memoria: el WhatsApp las consulta en cada envío). Vacías fuera de desarrollo. */
export async function listasDePrueba(): Promise<{ correos: string[]; whatsapp: string[] }> {
  if (!enDesarrollo()) return { correos: [], whatsapp: [] };
  if (cache && cache.hasta > Date.now()) return cache.listas;
  const listas = (async () => {
    const envCorreos = separar(process.env.CORREO_PERMITIDOS_DESARROLLO);
    const envWhatsapp = separar(process.env.WHATSAPP_PERMITIDOS_DESARROLLO);
    try {
      // Import tardío: el envío de correo y WhatsApp lo usan módulos que el de ajustes también importa.
      const { leerAjustes, valorAjuste } = await import("@/lib/seleccion/servidor");
      const ajustes = await leerAjustes();
      return {
        correos: [...envCorreos, ...separar(valorAjuste<unknown>(ajustes, "correos_prueba_desarrollo", []))],
        whatsapp: [...envWhatsapp, ...separar(valorAjuste<unknown>(ajustes, "whatsapp_prueba_desarrollo", []))],
      };
    } catch {
      return { correos: envCorreos, whatsapp: envWhatsapp };
    }
  })();
  cache = { hasta: Date.now() + 15_000, listas };
  return listas;
}

/** ¿Este número de WhatsApp recibe de verdad en desarrollo? */
export async function whatsappDePruebaPermitido(telefono: string): Promise<boolean> {
  if (!enDesarrollo()) return false;
  return esWhatsappDePrueba((await listasDePrueba()).whatsapp, telefono);
}

/**
 * El destino de un laboratorio es de prueba (desarrollo): por correo, todos
 * sus destinatarios están en la lista; por WhatsApp, su número lo está. Lo
 * devuelve para mostrarlo; null si no.
 */
export async function destinoDePrueba(lab: { canal: string; correos: string[]; whatsapp: string | null }): Promise<string | null> {
  if (!enDesarrollo()) return null;
  const { correos, whatsapp } = await listasDePrueba();
  if (lab.canal === "correo") {
    return lab.correos.length && lab.correos.every((c) => esCorreoDePrueba(correos, c)) ? lab.correos.join(", ") : null;
  }
  return lab.whatsapp && esWhatsappDePrueba(whatsapp, lab.whatsapp) ? lab.whatsapp : null;
}

// ── Envío real desde el chat de prueba (27-nov-2026) ─────────────────────────
// Pedido del usuario: las pruebas tienen que ser más reales. Lo que se envía por
// un candidato del chat de prueba (la orden al laboratorio, las alertas) sale de
// verdad, también en desarrollo y sin listas, marcado «PRUEBA». El freno de
// desarrollo sigue para todo lo demás: los aspirantes de la copia son reales.
import { AsyncLocalStorage } from "node:async_hooks";

const envioDePrueba = new AsyncLocalStorage<true>();

/** Corre `fn` dejando salir de verdad el WhatsApp y el correo (solo para envíos de candidatos de prueba). */
export function conEnvioRealDePrueba<T>(fn: () => Promise<T>): Promise<T> {
  return envioDePrueba.run(true, fn);
}

/** ¿Estamos dentro de un envío de prueba que debe salir de verdad? */
export function envioRealDePrueba(): boolean {
  // Las baterías de pruebas (scripts/) corren con GESTIVO_SIN_ENVIOS_REALES=1: sus laboratorios y
  // contactos son ficticios y un número inventado puede ser de una persona real (27-nov-2026).
  if (process.env.GESTIVO_SIN_ENVIOS_REALES === "1") return false;
  return envioDePrueba.getStore() === true;
}
