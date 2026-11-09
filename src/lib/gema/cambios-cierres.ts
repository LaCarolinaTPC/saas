/**
 * Cambios de GEMA en cierres de días anteriores. Parte PURA: se prueba sola.
 *
 * ## Por qué existe
 *
 * GEMA modifica cierres ya pasados (cambia la producción o el salario de un
 * conductor, rehace o borra filas) y la sincronización los sobrescribía en
 * silencio: relee los últimos 45 días, hace upsert y el espejo borra lo que
 * GEMA ya no reporta, sin dejar el valor anterior. Así pasó con el 27 y
 * 28-oct-2026 (ver `src/lib/devengados/antes-correccion.ts`).
 *
 * Ahora, antes de escribir, `syncCierres` compara lo guardado con lo que trae
 * GEMA y registra en `gema_cambios_cierres` cada diferencia, que Tesorería
 * revisa en Parámetros.
 *
 * ## Qué se vigila
 *
 * - Solo cierres con más de `DIAS_GRACIA` días: GEMA corrige legítimamente
 *   ayer y hoy (recaudos tardíos), y eso no es noticia.
 * - Solo dinero y producción (`CAMPOS_VIGILADOS`). Diferencias de menos de
 *   `TOLERANCIA` son redondeo; nulo y 0 cuentan igual.
 * - Cierres nuevos (GEMA agregó una fila a un día viejo) y borrados (el
 *   espejo quitó una fila que GEMA ya no reporta).
 */

export const CAMPOS_VIGILADOS = [
  "viajes",
  "timbradas",
  "bruto",
  "salario_bruto_dia",
  "salario_neto_dia",
  "ahorro",
  "ahorro_obli",
  "anticipo",
] as const;

export type CampoVigilado = (typeof CAMPOS_VIGILADOS)[number];

/** Diferencias menores a esto (pesos o unidades) son redondeo. */
export const TOLERANCIA = 1;

/** Los cierres de los últimos N días no se vigilan. */
export const DIAS_GRACIA = Math.max(0, Number(process.env.GEMA_CAMBIOS_GRACIA_DIAS ?? 2));

export type TipoCambio = "modificado" | "nuevo" | "borrado";

/** Lo mínimo de un cierre que hace falta para comparar. */
export type CierreComparable = {
  cod_conductor: string;
  fecha: string;
  ruta: string | null;
  conductor_nombre?: string | null;
} & Partial<Record<CampoVigilado, number | string | null>>;

export type CambioCierre = {
  fecha: string;
  cod_conductor: string;
  conductor_nombre: string | null;
  ruta: string;
  tipo: TipoCambio;
  /** Solo los campos que cambiaron: [antes, después]. */
  cambios: Partial<Record<CampoVigilado, [number | null, number | null]>>;
  /** salario_neto_dia después − antes (nulos como 0). */
  delta_neto: number;
};

export type ResumenCambios = {
  cierres: number;
  conductores: number;
  dias: number;
  deltaNeto: number;
};

/** Llave de un cierre: la misma del upsert (`cod_conductor,fecha,ruta`). */
export function llaveCierre(r: { cod_conductor: string; fecha: string; ruta: string | null }): string {
  return `${r.cod_conductor}|${r.fecha}|${r.ruta ?? ""}`;
}

/** AAAA-MM-DD menos N días. */
export function restarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Hoy en Bogotá (AAAA-MM-DD). */
export function hoyBogota(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(ahora);
}

/** Se vigilan los cierres con `fecha < fechaLimite`. */
export function fechaLimite(hoy: string, diasGracia: number = DIAS_GRACIA): string {
  return restarDias(hoy, diasGracia);
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function diferentes(a: number | null, b: number | null): boolean {
  return Math.abs((a ?? 0) - (b ?? 0)) >= TOLERANCIA;
}

/** Todos los campos vigilados con valor: lo que se guarda de un nuevo o borrado. */
function todos(r: CierreComparable, lado: "antes" | "despues"): CambioCierre["cambios"] {
  const out: CambioCierre["cambios"] = {};
  for (const c of CAMPOS_VIGILADOS) {
    const v = num(r[c]);
    if (v == null || v === 0) continue;
    out[c] = lado === "antes" ? [v, null] : [null, v];
  }
  return out;
}

/**
 * Qué cambió entre lo guardado y lo que trae GEMA, en cierres anteriores a
 * `limite`. `guardadas` y `nuevas` van por `llaveCierre`. Los `borrado` que
 * devuelve son candidatos: el llamador solo los registra si el espejo
 * efectivamente los borra.
 */
export function compararCierres(
  guardadas: Map<string, CierreComparable>,
  nuevas: Map<string, CierreComparable>,
  limite: string
): CambioCierre[] {
  const out: CambioCierre[] = [];
  const base = (r: CierreComparable) => ({
    fecha: r.fecha,
    cod_conductor: r.cod_conductor,
    conductor_nombre: r.conductor_nombre ?? null,
    ruta: r.ruta ?? "",
  });

  for (const [k, nueva] of nuevas) {
    if (!(nueva.fecha < limite)) continue;
    const vieja = guardadas.get(k);
    if (!vieja) {
      out.push({
        ...base(nueva),
        tipo: "nuevo",
        cambios: todos(nueva, "despues"),
        delta_neto: num(nueva.salario_neto_dia) ?? 0,
      });
      continue;
    }
    const cambios: CambioCierre["cambios"] = {};
    for (const c of CAMPOS_VIGILADOS) {
      const a = num(vieja[c]);
      const b = num(nueva[c]);
      if (diferentes(a, b)) cambios[c] = [a, b];
    }
    if (Object.keys(cambios).length === 0) continue;
    out.push({
      ...base(nueva),
      conductor_nombre: nueva.conductor_nombre ?? vieja.conductor_nombre ?? null,
      tipo: "modificado",
      cambios,
      delta_neto: (num(nueva.salario_neto_dia) ?? 0) - (num(vieja.salario_neto_dia) ?? 0),
    });
  }

  for (const [k, vieja] of guardadas) {
    if (!(vieja.fecha < limite) || nuevas.has(k)) continue;
    out.push({
      ...base(vieja),
      tipo: "borrado",
      cambios: todos(vieja, "antes"),
      delta_neto: -(num(vieja.salario_neto_dia) ?? 0),
    });
  }

  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.cod_conductor.localeCompare(b.cod_conductor));
}

/** Totales para el aviso. */
export function resumirCambios(cambios: Pick<CambioCierre, "fecha" | "cod_conductor" | "delta_neto">[]): ResumenCambios {
  return {
    cierres: cambios.length,
    conductores: new Set(cambios.map((c) => c.cod_conductor)).size,
    dias: new Set(cambios.map((c) => c.fecha)).size,
    deltaNeto: Math.round(cambios.reduce((s, c) => s + Number(c.delta_neto ?? 0), 0)),
  };
}
