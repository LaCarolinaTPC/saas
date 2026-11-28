/**
 * ¿El archivo es del aspirante? (27-nov-2026, pedido: «cuando se suba un
 * archivo, que pertenezca a la persona, por si hubo un error; también en los
 * demás documentos»). PURO: mira el texto del PDF (o lo que se leyó de él).
 *
 *  - «suyo»: trae la cédula del aspirante, o su nombre (un nombre y un apellido).
 *  - «otro»: trae otra cédula junto a «cédula / C.C. / identificación /
 *    documento» y no la suya, o un nombre que no es el suyo.
 *  - «sin_datos»: no se puede decir (imagen, texto corto o sin nombre ni cédula).
 */
import { nombresCoinciden, palabrasNombre } from "@/lib/verificacion/nombres";

export type DeQuien = { estado: "suyo" } | { estado: "otro"; motivo: string } | { estado: "sin_datos" };

const digitos = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");
const nombreValido = (n: string | null | undefined) => !!n && !/por confirmar/i.test(n) && palabrasNombre(n).length >= 2;

/** Números de documento que aparecen junto a «cédula», «C.C.», «identificación» o «documento». */
export function cedulasDelTexto(texto: string): string[] {
  const plano = texto.replace(/\s+/g, " ");
  const out = new Set<string>();
  for (const m of plano.matchAll(/(?:c[eé]dula(?: de ciudadan[ií]a)?|c\.\s?c\.?|identificaci[oó]n|documento(?: de identidad)?|n[uú]mero de documento)\s*(?:n[oº°.]*\s*)?[:#-]?\s*([\d][\d.\s]{4,14}\d)/gi)) {
    const d = digitos(m[1]);
    if (d.length >= 5 && d.length <= 11) out.add(d);
  }
  return [...out];
}

/** ¿El texto trae esa cédula, con o sin puntos o espacios? */
function traeCedula(texto: string, cedula: string): boolean {
  if (cedula.length < 5) return false;
  for (const m of texto.matchAll(/\d[\d.\s]{3,16}\d/g)) if (digitos(m[0]).includes(cedula)) return true;
  return false;
}

/** ¿El texto trae el nombre del aspirante (un nombre y un apellido, o todas sus palabras si tiene dos)? */
function traeNombre(texto: string, nombre: string): boolean {
  const del = new Set(palabrasNombre(texto));
  const suyas = palabrasNombre(nombre).filter((p) => p.length > 2);
  return suyas.filter((p) => del.has(p)).length >= Math.min(2, suyas.length);
}

/**
 * Con el texto completo del archivo. `nombreLeido` (opcional): el nombre que
 * dice el documento, si ya se sabe (p. ej. «Nombre:» del informe).
 */
export function deQuienEsElTexto(texto: string, aspirante: { nombre: string | null; cedula: string | null }, nombreLeido?: string | null): DeQuien {
  const cedula = digitos(aspirante.cedula);
  if (nombreLeido && nombreValido(nombreLeido) && nombreValido(aspirante.nombre) && !nombresCoinciden(nombreLeido, aspirante.nombre)) {
    return { estado: "otro", motivo: `El archivo está a nombre de «${nombreLeido.trim()}», no de «${aspirante.nombre!.trim()}».` };
  }
  if (cedula.length >= 5 && traeCedula(texto, cedula)) return { estado: "suyo" };
  const otras = cedulasDelTexto(texto).filter((c) => c !== cedula);
  if (otras.length && cedula.length >= 5) {
    const conNombre = nombreValido(aspirante.nombre) && traeNombre(texto, aspirante.nombre!);
    return { estado: "otro", motivo: `El archivo trae la cédula ${otras[0]}, no la del aspirante (${cedula})${conNombre ? ", aunque el nombre sí coincide" : ""}.` };
  }
  if (nombreValido(aspirante.nombre) && traeNombre(texto, aspirante.nombre!)) return { estado: "suyo" };
  return { estado: "sin_datos" };
}

/**
 * Lo que se leyó del documento (nombre y cédula sueltos), sin el texto
 * completo: los avisos del laboratorio y los certificados. null si todo cuadra
 * o no hay con qué comparar; si no, el motivo.
 */
export function noCoincideConAspirante(leido: { nombre?: string | null; cedula?: string | null }, aspirante: { nombre: string | null; cedula: string | null }): string | null {
  const c = digitos(leido.cedula);
  const propia = digitos(aspirante.cedula);
  const motivos: string[] = [];
  if (c.length >= 5 && propia.length >= 5 && c !== propia) motivos.push(`la cédula leída es ${c}, no ${propia}`);
  if (nombreValido(leido.nombre) && nombreValido(aspirante.nombre) && !nombresCoinciden(leido.nombre, aspirante.nombre)) motivos.push(`el nombre leído es «${leido.nombre!.trim()}», no «${aspirante.nombre!.trim()}»`);
  return motivos.length ? `${motivos.join(" y ")}.`.replace(/^./, (x) => x.toUpperCase()) : null;
}
