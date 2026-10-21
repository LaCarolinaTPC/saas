/**
 * Cómo se sincroniza cada tabla, decidido por sus columnas y su tamaño. PURO.
 *
 * Tres estrategias:
 *
 *   · **reemplazo** — se borra la tabla de esa empresa y se vuelve a cargar
 *     entera. Para lo chico (menos de `UMBRAL_REEMPLAZO` filas): es lo más
 *     simple y además refleja los borrados de MGX.
 *   · **incremental_edicion** — filas nuevas por `ide > último ide`, y las
 *     editadas por su fecha de edición (`fhedicion`/`fhe`) desde la última
 *     marca menos un margen. Para las cabezas grandes.
 *   · **incremental_documento** — el `cuerpo` no tiene fecha de edición: las
 *     filas nuevas por `ide`, y las de los documentos cuya CABEZA se editó se
 *     re-traen completas (se borra el documento y se vuelve a insertar, así
 *     también desaparecen los ítems que MGX quitó).
 *
 * La estrategia se guarda en `mgx_tablas.estrategia` al sembrar el catálogo, y
 * el motor obedece esa columna: se puede cambiar sin desplegar.
 */

import { EDICION_NO_FIABLE, type Modulo } from "./catalogo";
import { ANIO_MINIMO, COLUMNAS_DOCUMENTO } from "./limpieza";

export type Estrategia = "reemplazo" | "incremental_edicion" | "incremental_documento";

export const ESTRATEGIAS: readonly Estrategia[] = ["reemplazo", "incremental_edicion", "incremental_documento"];

export const UMBRAL_REEMPLAZO = 50_000;

/** Cuánto se repasa hacia atrás en las ediciones: cubre relojes y lo que quedó en vuelo. */
export const MARGEN_EDICION_HORAS = 24;

export interface MetaTabla {
  modulo: Modulo;
  tabla: string;
  columnas: readonly string[];
  filas: number;
}

/** La columna que dice cuándo se editó una fila, si se puede confiar en ella. */
export function columnaEdicion(meta: Pick<MetaTabla, "modulo" | "tabla" | "columnas">): "fhedicion" | "fhe" | null {
  if (EDICION_NO_FIABLE.has(`${meta.modulo}.${meta.tabla}`)) return null;
  if (meta.columnas.includes("fhedicion")) return "fhedicion";
  if (meta.columnas.includes("fhe")) return "fhe";
  return null;
}

export function tieneLlaveDocumento(columnas: readonly string[]): boolean {
  return COLUMNAS_DOCUMENTO.every((c) => columnas.includes(c));
}

export function decidirEstrategia(meta: MetaTabla): { estrategia: Estrategia; motivo: string } {
  if (!meta.columnas.includes("ide")) {
    throw new Error(`${meta.modulo}.${meta.tabla} no tiene columna ide: no se puede copiar.`);
  }
  if (meta.filas < UMBRAL_REEMPLAZO) {
    return { estrategia: "reemplazo", motivo: `${meta.filas} filas: se recarga entera` };
  }
  if (meta.tabla === "cuerpo" && tieneLlaveDocumento(meta.columnas)) {
    return {
      estrategia: "incremental_documento",
      motivo: "nuevas por ide; editadas por los documentos cuya cabeza cambió",
    };
  }
  const col = columnaEdicion(meta);
  if (col) return { estrategia: "incremental_edicion", motivo: `nuevas por ide; editadas por ${col}` };
  return {
    estrategia: "reemplazo",
    motivo: `${meta.filas} filas sin fecha de edición fiable: se recarga entera`,
  };
}

export interface EstadoTabla {
  ultimo_ide: number | null;
  ultima_edicion: string | null;
}

export interface Ventana {
  /** Traer filas con `ide` mayor que este. */
  desdeIde: number;
  /** Traer ediciones posteriores a esta marca, o null si no toca (primera vez). */
  desdeEdicion: string | null;
  primeraVez: boolean;
}

/** `AAAA-MM-DD HH:MM:SS` en la hora de pared, como las guarda MGX. */
export function marcaDeFecha(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  );
}

/** Lee una marca `AAAA-MM-DD[ T]HH:MM:SS[.ffffff]` como hora de pared (en UTC, sin zona). */
export function fechaDeMarca(m: string): Date | null {
  const r = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/.exec(m.trim());
  if (!r) return null;
  const [, a, me, d, h = "0", mi = "0", s = "0"] = r;
  const f = new Date(Date.UTC(+a, +me - 1, +d, +h, +mi, +s));
  return Number.isNaN(f.getTime()) ? null : f;
}

export function calcularVentana(estado: EstadoTabla): Ventana {
  if (estado.ultimo_ide === null) return { desdeIde: 0, desdeEdicion: null, primeraVez: true };
  let desdeEdicion: string | null = null;
  const marca = estado.ultima_edicion ? fechaDeMarca(estado.ultima_edicion) : null;
  if (marca) desdeEdicion = marcaDeFecha(new Date(marca.getTime() - MARGEN_EDICION_HORAS * 3600_000));
  return { desdeIde: estado.ultimo_ide, desdeEdicion, primeraVez: false };
}

/**
 * La nueva marca de edición: la mayor fecha de `columna` entre las filas, si
 * supera a la actual. Ignora los centinelas y lo que esté más de un día en el
 * futuro respecto de `ahora` (un reloj mal puesto en MGX dejaría la marca
 * adelantada y se saltarían ediciones reales).
 */
export function avanzarMarca(
  actual: string | null,
  filas: readonly Record<string, unknown>[],
  columna: string,
  ahora: Date
): string | null {
  const tope = ahora.getTime() + 24 * 3600_000;
  let mejor = actual;
  let mejorMs = actual ? (fechaDeMarca(actual)?.getTime() ?? -Infinity) : -Infinity;
  for (const f of filas) {
    const v = f[columna];
    if (typeof v !== "string") continue;
    const d = fechaDeMarca(v);
    if (!d || d.getUTCFullYear() < ANIO_MINIMO) continue;
    const ms = d.getTime();
    if (ms > tope || ms <= mejorMs) continue;
    mejor = v;
    mejorMs = ms;
  }
  return mejor;
}
