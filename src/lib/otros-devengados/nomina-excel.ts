/**
 * Otros devengados · nómina cargada por Excel (lógica pura, sin base de datos).
 *
 * Tesorería carga el listado de nómina que exporta MGX (una fila por empleado
 * y concepto) para calcular y entregar antes de que la nómina del período
 * cierre en MGX. Cuando cierra, se compara lo cargado contra MGX.
 */
import { quincenaDeFecha, type QuincenaGema } from "./calculo";

export interface LineaNominaExcel {
  codEpl: string;
  nomEpl: string | null;
  codCon: string;
  nomCon: string | null;
  cantidad: number | null;
  valor: number;
}

export interface ListadoNomina {
  codPer: string;
  nomPer: string | null;
  /** Corte (quincena GEMA) que sale de la fecha del documento de nómina. */
  corte: QuincenaGema;
  lineas: LineaNominaExcel[];
}

/** Número del listado: 124547,5 · 1.234.567,89 · 124547.5 · número de Excel. */
export function numeroListado(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!s) return NaN;
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
}

/** Fecha del listado (15/10/2026, 2026-10-15 o fecha de Excel) → 'YYYY-MM-DD', o null. */
export function fechaListado(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : null;
}

/** Código que Excel pudo dejar como número (3 → «003»). */
const codigo = (v: unknown, largo: number) => {
  const s = String(v ?? "").trim();
  return /^\d+$/.test(s) ? s.padStart(largo, "0") : s;
};

/**
 * Convierte la matriz del listado de nómina de MGX (encabezado COD_CON,
 * NOM_CON, COD_EPL, NOM_EPL, CANTIDAD, FECHA, COD_PER, NOM_PER, VALOR…) en
 * líneas. Devuelve un mensaje si el archivo no es ese listado, trae más de un
 * período o sus fechas caen en más de una quincena.
 */
export function interpretarListadoNomina(m: unknown[][]): ListadoNomina | string {
  const norm = (v: unknown) => String(v ?? "").trim().toUpperCase();
  const iCab = m.findIndex((r) => {
    const c = r.map(norm);
    return c.includes("COD_CON") && c.includes("COD_EPL") && c.includes("VALOR");
  });
  if (iCab < 0) {
    return "No se encontró el encabezado del listado (COD_CON, COD_EPL, VALOR…). ¿Es el listado de nómina que exporta MGX?";
  }
  const cab = m[iCab].map(norm);
  const col = (n: string) => cab.indexOf(n);
  const c = {
    codCon: col("COD_CON"),
    nomCon: col("NOM_CON"),
    codEpl: col("COD_EPL"),
    nomEpl: col("NOM_EPL"),
    cantidad: col("CANTIDAD"),
    fecha: col("FECHA"),
    codPer: col("COD_PER"),
    nomPer: col("NOM_PER"),
    valor: col("VALOR"),
  };
  if (c.fecha < 0 || c.codPer < 0) return "Al listado le faltan las columnas FECHA o COD_PER.";
  const txt = (r: unknown[], i: number) => (i < 0 ? null : String(r[i] ?? "").trim() || null);

  const lineas: LineaNominaExcel[] = [];
  const periodos = new Map<string, string | null>();
  const cortes = new Map<string, QuincenaGema>();
  for (let i = iCab + 1; i < m.length; i++) {
    const r = m[i];
    const codEpl = String(r[c.codEpl] ?? "").replace(/\D/g, "");
    const codCon = codigo(r[c.codCon], 3);
    if (!codEpl && !codCon) continue; // fila vacía o de totales
    if (!codEpl || !codCon) return `Fila ${i + 1}: falta el empleado o el concepto.`;
    const valor = numeroListado(r[c.valor]);
    if (!Number.isFinite(valor)) return `Fila ${i + 1}: el valor «${String(r[c.valor] ?? "")}» no es un número.`;
    const fecha = fechaListado(r[c.fecha]);
    if (!fecha) return `Fila ${i + 1}: la fecha «${String(r[c.fecha] ?? "")}» no es válida.`;
    const q = quincenaDeFecha(fecha);
    cortes.set(`${q.periodo}-${q.quincena}`, q);
    const codPer = codigo(r[c.codPer], 5);
    if (!codPer) return `Fila ${i + 1}: falta el período de nómina (COD_PER).`;
    if (!periodos.has(codPer)) periodos.set(codPer, txt(r, c.nomPer));
    const cantidad = c.cantidad < 0 ? NaN : numeroListado(r[c.cantidad]);
    lineas.push({
      codEpl,
      nomEpl: txt(r, c.nomEpl),
      codCon,
      nomCon: txt(r, c.nomCon),
      cantidad: Number.isFinite(cantidad) ? cantidad : null,
      valor,
    });
  }
  if (lineas.length === 0) return "El listado no trae líneas de nómina.";
  if (periodos.size > 1) return `El listado trae más de un período de nómina (${[...periodos.keys()].join(", ")}). Carga un período a la vez.`;
  if (cortes.size > 1) return "Las fechas del listado caen en más de una quincena. Carga un período a la vez.";
  const [codPer, nomPer] = [...periodos][0];
  return { codPer, nomPer, corte: [...cortes.values()][0], lineas };
}

export interface LineaComparable {
  cedula: string;
  nombre: string | null;
  concepto: string;
  valor: number;
}

export interface DiferenciaNomina {
  cedula: string;
  nombre: string | null;
  concepto: string;
  excel: number;
  mgx: number;
}

export interface ComparacionNomina {
  /** Total por concepto usado en el cruce. */
  conceptos: { concepto: string; excel: number; mgx: number; diferencia: number }[];
  /** Conductor × concepto donde el Excel y MGX no coinciden (más de $1). */
  diferencias: DiferenciaNomina[];
  /** Cuántas diferencias hay (queda aunque se oculte el detalle). */
  nDiferencias: number;
  empleadosExcel: number;
  empleadosMgx: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Compara, para los conceptos del cruce, lo cargado por Excel contra MGX. */
export function compararNomina(
  excel: LineaComparable[],
  mgx: LineaComparable[],
  conceptos: readonly string[]
): ComparacionNomina {
  const usados = new Set(conceptos);
  const sumar = (lineas: LineaComparable[]) => {
    const m = new Map<string, { cedula: string; nombre: string | null; concepto: string; valor: number }>();
    for (const l of lineas) {
      if (!usados.has(l.concepto)) continue;
      const k = `${l.cedula}|${l.concepto}`;
      const a = m.get(k) ?? { cedula: l.cedula, nombre: l.nombre, concepto: l.concepto, valor: 0 };
      a.valor += l.valor;
      a.nombre ??= l.nombre;
      m.set(k, a);
    }
    return m;
  };
  const e = sumar(excel);
  const g = sumar(mgx);
  const diferencias: DiferenciaNomina[] = [];
  for (const k of new Set([...e.keys(), ...g.keys()])) {
    const x = e.get(k);
    const y = g.get(k);
    const vx = r2(x?.valor ?? 0);
    const vy = r2(y?.valor ?? 0);
    if (Math.abs(vx - vy) > 1) {
      diferencias.push({ cedula: (x ?? y)!.cedula, nombre: y?.nombre ?? x?.nombre ?? null, concepto: (x ?? y)!.concepto, excel: vx, mgx: vy });
    }
  }
  diferencias.sort((a, b) => (a.nombre ?? a.cedula).localeCompare(b.nombre ?? b.cedula, "es") || a.concepto.localeCompare(b.concepto));
  const total = (m: typeof e, c: string) => r2([...m.values()].filter((l) => l.concepto === c).reduce((t, l) => t + l.valor, 0));
  const empleados = (m: typeof e) => new Set([...m.values()].map((l) => l.cedula)).size;
  return {
    conceptos: conceptos.map((c) => {
      const x = total(e, c);
      const y = total(g, c);
      return { concepto: c, excel: x, mgx: y, diferencia: r2(x - y) };
    }),
    diferencias,
    nDiferencias: diferencias.length,
    empleadosExcel: empleados(e),
    empleadosMgx: empleados(g),
  };
}
