/**
 * Lectura de la foto de la cédula con IA (prueba para la entrega 4): el prompt,
 * la interpretación de la respuesta y la comparación con lo que el aspirante
 * dijo en el chat. Funciones puras; la llamada al modelo está en prueba-actions.
 */
import { fechaValida } from "./extraccion";

export interface LecturaCedula {
  /** false si la foto no es una cédula de ciudadanía colombiana. */
  esCedula: boolean;
  /**
   * amarilla: la de hologramas, con datos en los dos lados (frente: número y
   * nombres; reverso: nacimiento y expedición) · digital: casi todo en el frente.
   */
  tipoCedula: "amarilla" | "digital" | null;
  lado: "frente" | "reverso" | "ambos" | null;
  numero: string | null;
  apellidos: string | null;
  nombres: string | null;
  fechaNacimiento: string | null;
  lugarNacimiento: string | null;
  sexo: "M" | "F" | null;
  rh: string | null;
  fechaExpedicion: string | null;
  lugarExpedicion: string | null;
  /** Qué no se pudo leer bien (reflejo, borrosa, cortada…). */
  problemas: string | null;
}

export const SISTEMA_LECTURA_CEDULA = [
  "Lees fotos de documentos de identidad colombianos para un proceso de selección de conductores.",
  "Responde SOLO con un objeto JSON, sin texto antes ni después, con estas claves:",
  '{"es_cedula": boolean, "tipo_cedula": "amarilla"|"digital"|null, "lado": "frente"|"reverso"|"ambos"|null, "numero": string|null, "apellidos": string|null, "nombres": string|null, "fecha_nacimiento": string|null, "lugar_nacimiento": string|null, "sexo": "M"|"F"|null, "rh": string|null, "fecha_expedicion": string|null, "lugar_expedicion": string|null, "problemas": string|null}',
  "Reglas:",
  "- es_cedula: true solo si es una cédula de ciudadanía colombiana (la amarilla con hologramas o la digital). Si es otro documento (licencia, pasaporte, tarjeta de identidad) o no es un documento, false y lo demás null.",
  "- Copia los datos tal como aparecen impresos. Si un dato no aparece en este lado, está tapado, borroso o no es seguro, pon null: nunca adivines ni completes.",
  "- numero: solo los dígitos del número de cédula (sin puntos).",
  "- apellidos y nombres: en mayúsculas, como aparecen.",
  "- Fechas en formato AAAA-MM-DD. En la cédula amarilla aparecen como «15-MAR-1985» o «1985/03/15»: conviértelas.",
  "- tipo_cedula: «amarilla» si es la cédula amarilla con hologramas; «digital» si es la cédula digital (tarjeta con chip y código QR). null si no se distingue.",
  "- En la cédula amarilla, el frente trae número, apellidos y nombres; el reverso trae fecha y lugar de nacimiento, estatura, RH, sexo y fecha y lugar de expedición: en una foto de un solo lado faltan los datos del otro, y eso es normal (pon null). La digital trae casi todo en el frente.",
  "- problemas: en una frase, qué no se pudo leer y por qué (reflejo, borrosa, cortada, muy oscura); null si todo se lee bien.",
].join("\n");

export const INSTRUCCION_LECTURA_CEDULA = "Lee esta foto y responde con el JSON.";

const texto = (v: unknown, max = 80): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/** Interpreta la respuesta del modelo; null si no trae un JSON usable. */
export function interpretarLecturaCedula(respuesta: string): LecturaCedula | null {
  const limpio = respuesta.replace(/```(?:json)?/gi, "");
  const ini = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (ini < 0 || fin <= ini) return null;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(limpio.slice(ini, fin + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const numero = typeof d.numero === "string" || typeof d.numero === "number" ? String(d.numero).replace(/\D/g, "") : "";
  const lado = d.lado === "frente" || d.lado === "reverso" || d.lado === "ambos" ? d.lado : null;
  const sexo = d.sexo === "M" || d.sexo === "F" ? d.sexo : null;
  const tipoCedula = d.tipo_cedula === "amarilla" || d.tipo_cedula === "digital" ? d.tipo_cedula : null;
  return {
    esCedula: d.es_cedula === true,
    tipoCedula,
    lado,
    numero: numero.length >= 5 && numero.length <= 11 ? numero : null,
    apellidos: texto(d.apellidos),
    nombres: texto(d.nombres),
    fechaNacimiento: fechaValida(d.fecha_nacimiento),
    lugarNacimiento: texto(d.lugar_nacimiento),
    sexo,
    rh: texto(d.rh, 6),
    fechaExpedicion: fechaValida(d.fecha_expedicion),
    lugarExpedicion: texto(d.lugar_expedicion),
    problemas: texto(d.problemas, 300),
  };
}

export interface ComparacionDato {
  dato: string;
  enFoto: string | null;
  enChat: string | null;
  /** true coincide · false no coincide · null falta uno de los dos. */
  coincide: boolean | null;
}

/** Compara lo leído en la foto con lo que el aspirante dijo en el chat. */
export function compararConChat(
  l: LecturaCedula,
  chat: { cedula: string | null; fecha_expedicion: string | null; fecha_nacimiento: string | null }
): ComparacionDato[] {
  const par = (dato: string, a: string | null, b: string | null): ComparacionDato => ({ dato, enFoto: a, enChat: b, coincide: a && b ? a === b : null });
  return [
    par("Número de cédula", l.numero, chat.cedula),
    par("Fecha de expedición", l.fechaExpedicion, chat.fecha_expedicion),
    par("Fecha de nacimiento", l.fechaNacimiento, chat.fecha_nacimiento),
  ];
}

/**
 * La lectura en palabras, para el asistente y la extracción (va junto al
 * mensaje de la foto). Sin el nombre: el asistente no le dice nombres.
 */
export function resumenLectura(l: LecturaCedula): string {
  if (!l.esCedula) return "no parece una cédula de ciudadanía";
  const leido: string[] = [];
  if (l.numero) leido.push(`número ${l.numero}`);
  if (l.fechaExpedicion) leido.push(`expedida el ${l.fechaExpedicion}${l.lugarExpedicion ? ` en ${l.lugarExpedicion}` : ""}`);
  if (l.fechaNacimiento) leido.push(`fecha de nacimiento ${l.fechaNacimiento}`);
  const tipo = l.tipoCedula === "amarilla" ? "cédula amarilla" : l.tipoCedula === "digital" ? "cédula digital" : "cédula";
  const partes = [`${tipo}${l.lado ? ` (${l.lado})` : ""}`];
  partes.push(leido.length ? leido.join(", ") : "no se leyó ningún dato");
  const falta: string[] = [];
  if (!l.numero) falta.push("el número");
  if (!l.fechaExpedicion) falta.push("la fecha de expedición");
  if (!l.fechaNacimiento) falta.push("la fecha de nacimiento");
  if (falta.length) {
    // La amarilla reparte los datos en los dos lados: lo que falta suele estar en el otro.
    const amarilla = l.tipoCedula !== "digital";
    const otroLado =
      amarilla && l.lado === "frente" && !l.fechaExpedicion
        ? "; faltan los datos del reverso: pídele la foto del reverso o que escriba la fecha de expedición y la de nacimiento"
        : amarilla && l.lado === "reverso" && !l.numero
          ? "; falta el número, que va en el frente: pídele la foto del frente o que lo escriba"
          : `; no se leyó ${falta.join(" ni ")}: pídele que lo escriba o una foto más clara`;
    partes.push(otroLado.slice(2));
  }
  if (l.problemas) partes.push(`problemas: ${l.problemas}`);
  return partes.join("; ");
}

/**
 * Fotos de la cédula que no vale la pena guardar (pedido de GH del 17-nov-2026:
 * si mandan varias porque la primera salió borrosa, no llenar el espacio con
 * las que no sirven). Solo aplica a fotos que el modelo reconoció como cédula:
 * cualquier otra foto (licencia, hoja de vida…) se guarda siempre.
 */
export type MotivoDescarte = "ilegible" | "reemplazada";

/** Es cédula pero no se leyó ningún dato clave: borrosa, cortada o con reflejo. */
export function lecturaIlegible(l: LecturaCedula): boolean {
  return l.esCedula && !l.numero && !l.fechaExpedicion && !l.fechaNacimiento;
}

const CLAVES = ["numero", "fechaExpedicion", "fechaNacimiento"] as const;

/**
 * `nueva` hace innecesaria a `vieja`: las dos son cédula, del mismo lado (o la
 * nueva trae ambos), la nueva leyó al menos los mismos datos clave y ninguno
 * contradice a la vieja. Así un frente y un reverso nunca se reemplazan entre sí.
 */
export function reemplazaA(nueva: LecturaCedula, vieja: LecturaCedula): boolean {
  if (!nueva.esCedula || !vieja.esCedula) return false;
  const mismoLado = nueva.lado === "ambos" || (nueva.lado !== null && nueva.lado === vieja.lado);
  if (!mismoLado) return false;
  return CLAVES.every((k) => vieja[k] === null || nueva[k] === vieja[k]);
}

/**
 * Qué fotos descartar de una lista en orden cronológico (la más vieja primero).
 * Devuelve índice → motivo. Una foto reemplazada solo cuenta si la que la
 * reemplaza se guarda (no se descarta una buena por una ilegible).
 */
export function fotosADescartar(lecturas: (LecturaCedula | null)[]): Map<number, MotivoDescarte> {
  const fuera = new Map<number, MotivoDescarte>();
  lecturas.forEach((l, i) => {
    if (l && lecturaIlegible(l)) fuera.set(i, "ilegible");
  });
  lecturas.forEach((vieja, i) => {
    if (!vieja || fuera.has(i)) return;
    for (let j = i + 1; j < lecturas.length; j++) {
      const nueva = lecturas[j];
      if (nueva && !fuera.has(j) && reemplazaA(nueva, vieja)) {
        fuera.set(i, "reemplazada");
        return;
      }
    }
  });
  return fuera;
}
