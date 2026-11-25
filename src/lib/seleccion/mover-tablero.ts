/**
 * Arrastrar en el tablero (24-nov-2026). Hacia atrás (o reabrir un cerrado) el
 * proceso se mueve directo, como antes; a «Cierre» se pide la causa. Hacia
 * adelante no se mueve solo: se abre la ficha con lo que pide esa etapa (citar,
 * la prueba de manejo, los exámenes…) y el proceso avanza cuando se hace, por el
 * mismo camino que los botones de la ficha (con sus mensajes y citas). Si la
 * columna está a varios pasos, se van haciendo uno por uno.
 */
import { ordenEstado } from "@/lib/contratacion/constants";

/** Etapas a las que se llega con una acción (las demás se mueven directo). */
export type EtapaConPaso =
  | "antecedentes"
  | "citado"
  | "prueba_manejo"
  | "en_escuela"
  | "en_examenes"
  | "en_examenes_fase2"
  | "reconocimiento_ruta"
  | "listo_contratar"
  | "contratado";

/** Desde qué estados se llega a cada etapa (lo mismo que aceptan las acciones del servidor). */
export const DESDE: Record<EtapaConPaso, readonly string[]> = {
  antecedentes: ["pendiente"],
  citado: ["pendiente", "antecedentes"],
  prueba_manejo: ["citado"],
  en_escuela: ["citado", "prueba_manejo"],
  en_examenes: ["citado", "prueba_manejo", "en_escuela"],
  en_examenes_fase2: ["en_examenes"],
  reconocimiento_ruta: ["en_examenes_fase2"],
  // 25-nov-2026: a «Listo para contratar» no se lleva a mano; entra solo al cumplir todo
  // menos el visto bueno. Al soltarlo ahí se abre la ficha con lo que le falta.
  listo_contratar: ["pendiente", "antecedentes", "citado", "prueba_manejo", "en_escuela", "en_examenes", "en_examenes_fase2", "reconocimiento_ruta"],
  // Las condiciones para contratar deciden; desde cualquier etapa abierta.
  contratado: ["pendiente", "antecedentes", "citado", "prueba_manejo", "en_escuela", "en_examenes", "en_examenes_fase2", "reconocimiento_ruta", "listo_contratar"],
};

const esEtapaConPaso = (e: string): e is EtapaConPaso => e in DESDE;
const cerrado = (e: string) => e === "cierre" || e === "contratado";

export type Movimiento =
  | { tipo: "nada" }
  | { tipo: "directo" }
  | { tipo: "cierre" }
  | { tipo: "ficha"; destino: EtapaConPaso };

/** Qué hacer al soltar una tarjeta de `desde` en `hacia`. */
export function movimientoAlSoltar(desde: string, hacia: string): Movimiento {
  if (desde === hacia) return { tipo: "nada" };
  if (hacia === "cierre") return { tipo: "cierre" };
  // Reabrir un cerrado o un contratado, o devolverlo a una etapa anterior: directo.
  if (cerrado(desde) || ordenEstado(hacia) < ordenEstado(desde)) return { tipo: "directo" };
  return esEtapaConPaso(hacia) ? { tipo: "ficha", destino: hacia } : { tipo: "directo" };
}

/**
 * El siguiente paso para llegar de `actual` a `destino`: la etapa más avanzada
 * (sin pasarse) a la que se llega desde `actual`. «En escuela» solo si es el
 * destino (aprobar la prueba lleva directo a exámenes). null si ya llegó, si
 * está cerrado o si no hay camino.
 */
export function siguientePaso(actual: string, destino: EtapaConPaso): EtapaConPaso | null {
  if (actual === destino || cerrado(actual)) return null;
  if (DESDE[destino].includes(actual)) return destino;
  const tope = ordenEstado(destino);
  if (ordenEstado(actual) >= tope) return null;
  const posibles = (Object.keys(DESDE) as EtapaConPaso[])
    .filter((e) => e !== "contratado" && e !== "listo_contratar" && e !== "en_escuela" && DESDE[e].includes(actual) && ordenEstado(e) <= tope)
    .sort((a, b) => ordenEstado(b) - ordenEstado(a));
  return posibles[0] ?? null;
}
