// Conciliación del combustible del proveedor con el cierre de GEMA
// (ingreso_tercero.combustible, lo que la liquidación descuenta a cada bus por
// día). Funciones puras, sin dependencias: las usa la vista previa de la carga
// (servidor) y la lista de últimas cargas (cliente).
//
// Se compara por bus y día, con tolerancia de un peso. Solo se comparan los
// días que GEMA ya liquidó (al menos una fila en ingreso_tercero): el archivo
// del proveedor llega antes que la liquidación. Las causas salen de la
// conciliación de enero a octubre de 2026 (dev-log 2026-10-14).

export const CAUSAS_CONCILIACION = [
  "duplicado_gema",
  "factura_compartida",
  "falta_en_gema",
  "sobra_en_gema",
  "otro_bus",
  "diferencia",
] as const;
export type CausaConciliacion = (typeof CAUSAS_CONCILIACION)[number];

export const CAUSA_CONCILIACION_LABEL: Record<CausaConciliacion, string> = {
  duplicado_gema: "GEMA lo descuenta dos veces",
  factura_compartida: "factura a nombre de dos buses: GEMA la descuenta una vez",
  falta_en_gema: "GEMA no lo descuenta",
  sobra_en_gema: "GEMA descuenta sin tanqueo del proveedor",
  otro_bus: "GEMA lo descuenta a otro bus",
  diferencia: "valor distinto",
};

export interface BusDiaPetromil {
  fecha: string;
  bus: string;
  valor: number;
  /** Valor de cada tanqueo del bus ese día con la alerta factura_compartida. */
  compartidas: number[];
}

export interface BusDiaGema {
  fecha: string;
  bus: string;
  valor: number;
  /** Filas de ingreso_tercero del bus ese día con combustible. */
  filas: number;
}

export interface DiferenciaBusDia {
  fecha: string;
  bus: string;
  petromil: number;
  gema: number;
  diferencia: number;
  causa: CausaConciliacion;
}

export type EstadoConciliacion = "cuadra" | "diferencias" | "sin_liquidar";

export interface ConciliacionGema {
  estado: EstadoConciliacion;
  /** Días del archivo que GEMA todavía no liquida (no se comparan). */
  diasSinLiquidar: string[];
  diasComparados: string[];
  /** Totales de los días comparados. */
  petromil: number;
  gema: number;
  /** gema − petromil: negativa, GEMA descuenta de menos. */
  diferencia: number;
  busesDia: number;
  cuadran: number;
  porCausa: Partial<Record<CausaConciliacion, { n: number; valor: number }>>;
  diferencias: DiferenciaBusDia[];
}

const TOLERANCIA = 1;

export function causaDiferencia(p: BusDiaPetromil | undefined, g: BusDiaGema | undefined): CausaConciliacion {
  const vp = p?.valor ?? 0, vg = g?.valor ?? 0;
  const d = vg - vp;
  if (vp > 0 && (g?.filas ?? 0) >= 2 && Math.abs(vg - 2 * vp) < TOLERANCIA) return "duplicado_gema";
  if (p?.compartidas.some((v) => Math.abs(d + v) < TOLERANCIA)) return "factura_compartida";
  if (vp > 0 && vg === 0) return "falta_en_gema";
  if (vp === 0) return "sobra_en_gema";
  return "diferencia";
}

/**
 * Compara bus por bus y día por día los `fechas` pedidos. `diasLiquidados` son
 * los días con al menos una fila en ingreso_tercero.
 */
export function conciliarConGema(
  fechas: string[],
  petromil: BusDiaPetromil[],
  gema: BusDiaGema[],
  diasLiquidados: Set<string>,
): ConciliacionGema {
  const dias = [...new Set(fechas)].sort();
  const diasComparados = dias.filter((d) => diasLiquidados.has(d));
  const diasSinLiquidar = dias.filter((d) => !diasLiquidados.has(d));
  const comparar = new Set(diasComparados);
  const k = (x: { fecha: string; bus: string }) => `${x.fecha}|${x.bus}`;
  const mp = new Map(petromil.filter((x) => comparar.has(x.fecha)).map((x) => [k(x), x]));
  const mg = new Map(gema.filter((x) => comparar.has(x.fecha)).map((x) => [k(x), x]));

  let totalP = 0, totalG = 0, cuadran = 0;
  const diferencias: DiferenciaBusDia[] = [];
  const porCausa: ConciliacionGema["porCausa"] = {};
  for (const llave of new Set([...mp.keys(), ...mg.keys()])) {
    const p = mp.get(llave), g = mg.get(llave);
    const vp = p?.valor ?? 0, vg = g?.valor ?? 0;
    // Un bus con fila en GEMA sin combustible y sin tanqueo no cuenta.
    if (vp === 0 && vg === 0) continue;
    totalP += vp;
    totalG += vg;
    if (Math.abs(vg - vp) < TOLERANCIA) { cuadran++; continue; }
    const causa = causaDiferencia(p, g);
    const [fecha, bus] = llave.split("|");
    diferencias.push({ fecha, bus, petromil: vp, gema: vg, diferencia: vg - vp, causa });
  }
  // Dos buses que se compensan el mismo día: GEMA cargó el tanqueo al otro bus
  // (el proveedor escribió un interno y la placa era de otro). Se reclasifican
  // antes de totalizar por causa.
  for (const a of diferencias) {
    if (a.causa === "duplicado_gema" || a.causa === "factura_compartida" || a.causa === "otro_bus") continue;
    const b = diferencias.find((x) => x !== a && x.fecha === a.fecha && x.causa !== "otro_bus" && x.causa !== "duplicado_gema" && x.causa !== "factura_compartida" && Math.abs(x.diferencia + a.diferencia) < TOLERANCIA);
    if (b) a.causa = b.causa = "otro_bus";
  }
  for (const d of diferencias) {
    const c = (porCausa[d.causa] ??= { n: 0, valor: 0 });
    c.n++;
    c.valor += d.diferencia;
  }
  diferencias.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia) || a.fecha.localeCompare(b.fecha));
  const estado: EstadoConciliacion =
    diasComparados.length === 0 ? "sin_liquidar" : diferencias.length === 0 ? "cuadra" : "diferencias";
  return {
    estado, diasSinLiquidar, diasComparados,
    petromil: totalP, gema: totalG, diferencia: totalG - totalP,
    busesDia: cuadran + diferencias.length, cuadran, porCausa, diferencias,
  };
}
