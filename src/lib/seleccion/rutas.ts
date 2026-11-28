/**
 * Rutas del reconocimiento de ruta (21-nov-2026). PURO.
 *
 * La lista es de Gestión Humana (Selección › Tiempos y reglas): se agregan,
 * corrigen y quitan rutas, y se marcan las obligatorias. Cada nombre es una
 * ruta distinta (dos variaciones de la misma línea cuentan aparte). Para
 * contratar debe aprender al menos `rutas_minimas` rutas, entre ellas todas
 * las obligatorias: si hay más obligatorias que ese número, se exigen todas.
 */

export interface RutaReconocimiento {
  id: string;
  nombre: string;
  obligatoria: boolean;
  orden: number;
}

export interface AvanceRutas {
  /** Rutas que ya aprendió, en el orden en que las aprendió. */
  aprendidas: string[];
  /** Cuántas debe aprender: el ajuste o, si son más, el número de obligatorias. */
  necesarias: number;
  /** Obligatorias que todavía no aprendió. */
  faltanObligatorias: string[];
  completas: boolean;
  /** «1 de 2 (B-17 MALLORQUIN) · falta la obligatoria A - 16 MIRAMAR». */
  detalle: string;
}

const clave = (s: string) => s.trim().toLowerCase();

export function avanceRutas(aprendidas: readonly string[], minimas: number, obligatorias: readonly string[]): AvanceRutas {
  const vistas = new Set<string>();
  const unicas = aprendidas.filter((r) => {
    const k = clave(r);
    if (!k || vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
  const necesarias = Math.max(Math.max(0, Math.floor(minimas)), obligatorias.length);
  const faltanObligatorias = obligatorias.filter((o) => !vistas.has(clave(o)));
  const completas = unicas.length >= necesarias && faltanObligatorias.length === 0;
  const partes = [`${Math.min(unicas.length, necesarias)} de ${necesarias}${unicas.length ? ` (${unicas.join(", ")})` : ""}`];
  if (faltanObligatorias.length) {
    partes.push(`${faltanObligatorias.length === 1 ? "falta la obligatoria" : "faltan las obligatorias"} ${faltanObligatorias.join(", ")}`);
  }
  return { aprendidas: unicas, necesarias, faltanObligatorias, completas, detalle: partes.join(" · ") };
}

/** Nombres de las obligatorias, en el orden de la lista. */
export const obligatoriasDe = (rutas: readonly RutaReconocimiento[]): string[] => rutas.filter((r) => r.obligatoria).map((r) => r.nombre);

export const MAX_NOMBRE_RUTA = 80;

/** Nombre limpio, o el error: vacío, muy largo o repetido (sin importar mayúsculas). */
export function validarNombreRuta(nombre: string, rutas: readonly Pick<RutaReconocimiento, "id" | "nombre">[], idActual?: string): { ok: true; nombre: string } | { ok: false; error: string } {
  const limpio = nombre.replace(/\s+/g, " ").trim();
  if (!limpio) return { ok: false, error: "Escribe el nombre de la ruta." };
  if (limpio.length > MAX_NOMBRE_RUTA) return { ok: false, error: `El nombre admite hasta ${MAX_NOMBRE_RUTA} caracteres.` };
  if (rutas.some((r) => r.id !== idActual && clave(r.nombre) === clave(limpio))) return { ok: false, error: `Ya existe la ruta «${limpio}».` };
  return { ok: true, nombre: limpio };
}
