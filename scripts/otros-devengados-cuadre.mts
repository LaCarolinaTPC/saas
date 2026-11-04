/**
 * Otros devengados · fase 0: cuadre de referencia de una quincena cerrada.
 *
 * Cruza, por conductor, la producción GEMA de la quincena (salario neto día
 * de cierres_diarios) contra los conceptos de devengo de la nómina de
 * conductores cerrada en MGX, resta lo entregado por Caja devengados y compara
 * el resultado con lo que MGX registró en 216 «Otros devengados N» y 546
 * «Anticipo salario». La regla está en src/lib/otros-devengados/calculo.ts.
 *
 * Uso:
 *   npm run otros-devengados:cuadre -- --periodo=01043
 *   npm run otros-devengados:cuadre -- --periodo=01043 --periodo=01040
 *
 * Solo lee la base (service_role de .env.local o .env). La salida es nominal
 * (cédulas, nombres y valores pagados) y va a work/otros-devengados/, que está
 * en .gitignore: no subirla al repositorio ni reenviarla.
 */
import { config } from "dotenv";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import {
  CONCEPTO_ANTICIPO_SALARIO_MGX,
  CONCEPTO_OTROS_DEVENGADOS_MGX,
  CONCEPTOS_DEVENGO_DEFECTO,
  cruzarQuincena,
  nominaCerrada,
  quincenaGemaDePeriodo,
  type ResultadoCruce,
} from "../src/lib/otros-devengados/calculo";

config({ path: ".env.local" });
config();

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EMPRESA = "emp0";
const GRUPO_CONDUCTORES = "002";
const PAGE = 1000;
const TOLERANCIA = 1; // pesos: diferencias de redondeo

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const periodos = process.argv
  .filter((a) => a.startsWith("--periodo="))
  .map((a) => a.slice("--periodo=".length).trim())
  .filter(Boolean);
if (periodos.length === 0) {
  console.error("Indica al menos un período MGX: --periodo=01043");
  process.exit(1);
}
// Conceptos de devengo del cruce; por defecto los acordados. Sirve para
// comparar variantes (p. ej. --conceptos=003,010,202,208,209 sin ajustes).
const argConceptos = process.argv.find((a) => a.startsWith("--conceptos="));
const CONCEPTOS: string[] = argConceptos
  ? argConceptos.slice("--conceptos=".length).split(",").map((c) => c.trim()).filter(Boolean)
  : [...CONCEPTOS_DEVENGO_DEFECTO];

/** Lee todas las páginas de una consulta (PostgREST recorta a 1.000 filas). */
async function todas<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += PAGE) {
    const { data, error } = await armar(desde, desde + PAGE - 1);
    if (error) throw error;
    const filas = (data ?? []) as T[];
    out.push(...filas);
    if (filas.length < PAGE) break;
  }
  return out;
}

type Periodo = { codigo: string; nombre: string; fec_ini: string; fec_fin: string; est_per: number | null; cod_gpa: string; subper: number };
type LineaNomina = { cod_epl: string; nom_epl: string | null; cod_con: string; valor: number | string; num_doc: string };
type Cierre = { cedula_conductor: string | null; cod_conductor: string | null; conductor_nombre: string | null; fecha: string; salario_neto_dia: number | string | null };
type Entrega = { cedula_conductor: string; valor_entregado: number | string; extemporanea: boolean | null };
type Conductor = { cedula: string; nombre: string | null; codigo: string | null; estado: string | null; fecha_retiro: string | null };

interface FilaCuadre extends ResultadoCruce {
  cedula: string;
  codigo: string | null;
  nombre: string | null;
  estadoMaestro: string | null;
  dias: number;
  conceptos: Record<string, number>;
  enNomina: boolean;
  conProduccion: boolean;
  entregasExtemporaneas: number;
  mgx216: number;
  mgx546: number; // positivo (MGX lo trae como deducción negativa)
  dif216VsOtros: number; // 216 − otros devengados calculados
  dif216VsEntregado: number; // 216 − entregado en caja
  dif546VsAnticipo: number; // 546 − anticipo calculado
  observacion: string;
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

async function cuadrar(codigoPeriodo: string) {
  const { data: per, error: perErr } = await db
    .from("mgx_v_no_periodos")
    .select("codigo, nombre, fec_ini, fec_fin, est_per, cod_gpa, subper")
    .eq("empresa", EMPRESA)
    .eq("codigo", codigoPeriodo)
    .maybeSingle();
  if (perErr) throw perErr;
  if (!per) throw new Error(`El período ${codigoPeriodo} no existe en MGX (${EMPRESA}).`);
  const p = per as Periodo;
  if (p.cod_gpa !== GRUPO_CONDUCTORES) {
    throw new Error(`El período ${codigoPeriodo} es del grupo ${p.cod_gpa}, no de conductores (${GRUPO_CONDUCTORES}).`);
  }

  const { count: lineas, error: cntErr } = await db
    .from("mgx_v_no_nomina")
    .select("cod_epl", { count: "exact", head: true })
    .eq("empresa", EMPRESA)
    .eq("cod_per", codigoPeriodo);
  if (cntErr) throw cntErr;
  if (!nominaCerrada(p.est_per, lineas ?? 0)) {
    throw new Error(`La nómina ${codigoPeriodo} (${p.nombre}) no está cerrada: est_per=${p.est_per}, líneas=${lineas ?? 0}.`);
  }

  const q = quincenaGemaDePeriodo(p.fec_ini, Number(p.subper));
  console.log(`\n${codigoPeriodo} · ${p.nombre}\n  MGX ${p.fec_ini}…${p.fec_fin} · GEMA ${q.ini}…${q.fin} · quincena ${q.periodo}/${q.quincena}`);

  // ── Nómina MGX: un concepto a la vez (cada uno trae ~160 líneas) ──
  const conceptosLeer = [...CONCEPTOS, CONCEPTO_OTROS_DEVENGADOS_MGX, CONCEPTO_ANTICIPO_SALARIO_MGX];
  const nomina: LineaNomina[] = [];
  for (const cod of conceptosLeer) {
    nomina.push(
      ...(await todas<LineaNomina>((d, h) =>
        db
          .from("mgx_v_no_nomina")
          .select("cod_epl, nom_epl, cod_con, valor, num_doc")
          .eq("empresa", EMPRESA)
          .eq("cod_per", codigoPeriodo)
          .eq("cod_con", cod)
          .order("cod_epl", { ascending: true })
          .order("num_doc", { ascending: true })
          .range(d, h)
      ))
    );
  }

  // ── Producción GEMA de la quincena ──
  const cierres = await todas<Cierre>((d, h) =>
    db
      .from("cierres_diarios")
      .select("cedula_conductor, cod_conductor, conductor_nombre, fecha, salario_neto_dia")
      .gte("fecha", q.ini)
      .lte("fecha", q.fin)
      .order("fecha", { ascending: true })
      .order("cod_conductor", { ascending: true })
      .order("id", { ascending: true })
      .range(d, h)
  );

  // ── Entregas vigentes de Caja devengados de esa quincena ──
  const entregas = await todas<Entrega>((d, h) =>
    db
      .from("devengados_entregas")
      .select("cedula_conductor, valor_entregado, extemporanea")
      .eq("periodo", q.periodo)
      .eq("quincena", q.quincena)
      .eq("movimiento", "DEBITO")
      .eq("estado", "activa")
      .order("id", { ascending: true })
      .range(d, h)
  );

  // Cierres sin cédula: se resuelven por código contra la maestra.
  const sinCedula = cierres.filter((c) => !c.cedula_conductor && c.cod_conductor);
  const codigoACedula = new Map<string, string>();
  const codigos = [...new Set(sinCedula.map((c) => c.cod_conductor!))];
  for (let i = 0; i < codigos.length; i += 300) {
    const { data } = await db.from("conductores").select("cedula, codigo").in("codigo", codigos.slice(i, i + 300));
    for (const c of data ?? []) codigoACedula.set(c.codigo as string, c.cedula as string);
  }
  let cierresSinCedula = 0;

  type Acum = { produccion: number; dias: Set<string>; conceptos: Record<string, number>; m216: number; m546: number; entregado: number; extemp: number; nombre: string | null; enNomina: boolean };
  const porCedula = new Map<string, Acum>();
  const acc = (ced: string) => {
    let a = porCedula.get(ced);
    if (!a) porCedula.set(ced, (a = { produccion: 0, dias: new Set(), conceptos: {}, m216: 0, m546: 0, entregado: 0, extemp: 0, nombre: null, enNomina: false }));
    return a;
  };

  for (const c of cierres) {
    const ced = c.cedula_conductor ?? (c.cod_conductor ? codigoACedula.get(c.cod_conductor) : undefined);
    if (!ced) {
      cierresSinCedula += 1;
      continue;
    }
    const a = acc(ced);
    a.produccion += num(c.salario_neto_dia);
    a.dias.add(c.fecha);
    a.nombre ??= c.conductor_nombre;
  }
  const devengo = new Set<string>(CONCEPTOS);
  for (const l of nomina) {
    const a = acc(l.cod_epl);
    a.nombre ??= l.nom_epl;
    if (devengo.has(l.cod_con)) {
      a.enNomina = true;
      a.conceptos[l.cod_con] = r2((a.conceptos[l.cod_con] ?? 0) + num(l.valor));
    } else if (l.cod_con === CONCEPTO_OTROS_DEVENGADOS_MGX) a.m216 += num(l.valor);
    else if (l.cod_con === CONCEPTO_ANTICIPO_SALARIO_MGX) a.m546 += -num(l.valor);
  }
  for (const e of entregas) {
    const a = acc(e.cedula_conductor);
    a.entregado += num(e.valor_entregado);
    if (e.extemporanea) a.extemp += 1;
  }

  const cedulas = [...porCedula.keys()];
  const maestro = new Map<string, Conductor>();
  for (let i = 0; i < cedulas.length; i += 300) {
    const { data } = await db.from("conductores").select("cedula, nombre, codigo, estado, fecha_retiro").in("cedula", cedulas.slice(i, i + 300));
    for (const c of (data ?? []) as Conductor[]) maestro.set(c.cedula, c);
  }

  const filas: FilaCuadre[] = cedulas.map((ced) => {
    const a = porCedula.get(ced)!;
    const res = cruzarQuincena({ produccion: a.produccion, conceptos: a.conceptos, entregado: a.entregado });
    const m = maestro.get(ced);
    const conProduccion = a.produccion > 0;
    const obs: string[] = [];
    if (!a.enNomina) obs.push("Sin nómina de conductores en MGX");
    if (!conProduccion) obs.push("Sin producción GEMA");
    if (a.extemp) obs.push(`${a.extemp} entrega(s) extemporánea(s)`);
    if (m?.estado === "RETIRADO") obs.push(`Retirado${m.fecha_retiro ? ` ${m.fecha_retiro}` : ""}`);
    return {
      ...res,
      cedula: ced,
      codigo: m?.codigo ?? null,
      nombre: m?.nombre ?? a.nombre,
      estadoMaestro: m?.estado ?? null,
      dias: a.dias.size,
      conceptos: a.conceptos,
      enNomina: a.enNomina,
      conProduccion,
      entregasExtemporaneas: a.extemp,
      mgx216: r2(a.m216),
      mgx546: r2(a.m546),
      dif216VsOtros: r2(a.m216 - res.otrosDevengados),
      dif216VsEntregado: r2(a.m216 - res.entregado),
      dif546VsAnticipo: r2(a.m546 - res.anticipo),
      observacion: obs.join(" · "),
    };
  });
  filas.sort((x, y) => (x.nombre ?? "").localeCompare(y.nombre ?? ""));

  return { periodo: p, q, filas, lineas: lineas ?? 0, cierres: cierres.length, cierresSinCedula, entregas: entregas.length };
}

type Cuadre = Awaited<ReturnType<typeof cuadrar>>;

function resumen(c: Cuadre) {
  const ambos = c.filas.filter((f) => f.enNomina && f.conProduccion);
  const suma = (k: keyof FilaCuadre, fs = c.filas) => r2(fs.reduce((s, f) => s + Number(f[k] ?? 0), 0));
  const coincide = (k: "dif216VsOtros" | "dif216VsEntregado" | "dif546VsAnticipo") =>
    ambos.filter((f) => Math.abs(f[k]) <= TOLERANCIA).length;
  return {
    conductores: c.filas.length,
    enNominaYProduccion: ambos.length,
    soloNomina: c.filas.filter((f) => f.enNomina && !f.conProduccion).length,
    soloProduccion: c.filas.filter((f) => !f.enNomina && f.conProduccion).length,
    soloEntregas: c.filas.filter((f) => !f.enNomina && !f.conProduccion).length,
    produccion: suma("produccion"),
    nominaDevengo: suma("nominaDevengo"),
    otrosDevengados: suma("otrosDevengados"),
    entregado: suma("entregado"),
    porEntregar: suma("porEntregar"),
    anticipo: suma("anticipo"),
    mgx216: suma("mgx216"),
    mgx546: suma("mgx546"),
    coincide216Otros: coincide("dif216VsOtros"),
    coincide216Entregado: coincide("dif216VsEntregado"),
    coincide546Anticipo: coincide("dif546VsAnticipo"),
  };
}

// ── Excel ──
const MONEDA = '"$"#,##0;[Red]-"$"#,##0';
const VERDE = "FFE2F0D9";
const ROJO = "FFF8D7DA";
const AMARILLO = "FFFFF3CD";
const ENCABEZADO = "FF1F3864";

function hojaDetalle(wb: ExcelJS.Workbook, c: Cuadre) {
  const ws = wb.addWorksheet(`Detalle ${c.periodo.codigo}`, { views: [{ state: "frozen", xSplit: 3, ySplit: 1 }] });
  const cols: { header: string; key: string; width: number; moneda?: boolean }[] = [
    { header: "Cédula", key: "cedula", width: 13 },
    { header: "Código", key: "codigo", width: 9 },
    { header: "Nombre", key: "nombre", width: 34 },
    { header: "Estado maestro", key: "estadoMaestro", width: 12 },
    { header: "Días GEMA", key: "dias", width: 9 },
    { header: "Producción GEMA", key: "produccion", width: 15, moneda: true },
    ...CONCEPTOS.map((cod) => ({ header: `MGX ${cod}`, key: `c${cod}`, width: 12, moneda: true })),
    { header: "Nómina devengo", key: "nominaDevengo", width: 15, moneda: true },
    { header: "Generado", key: "generado", width: 14, moneda: true },
    { header: "Otros devengados", key: "otrosDevengados", width: 15, moneda: true },
    { header: "Entregado caja", key: "entregado", width: 14, moneda: true },
    { header: "Por entregar", key: "porEntregar", width: 14, moneda: true },
    { header: "Anticipo calc.", key: "anticipo", width: 14, moneda: true },
    { header: "MGX 216 Otros dev.", key: "mgx216", width: 15, moneda: true },
    { header: "MGX 546 Anticipo", key: "mgx546", width: 14, moneda: true },
    { header: "216 − Otros calc.", key: "dif216VsOtros", width: 15, moneda: true },
    { header: "216 − Entregado", key: "dif216VsEntregado", width: 15, moneda: true },
    { header: "546 − Anticipo calc.", key: "dif546VsAnticipo", width: 16, moneda: true },
    { header: "Observación", key: "observacion", width: 40 },
  ];
  ws.columns = cols.map(({ header, key, width }) => ({ header, key, width }));
  for (const f of c.filas) {
    const fila: Record<string, unknown> = { ...f };
    for (const cod of CONCEPTOS) fila[`c${cod}`] = f.conceptos[cod] ?? 0;
    const row = ws.addRow(fila);
    for (const k of ["dif216VsOtros", "dif216VsEntregado", "dif546VsAnticipo"] as const) {
      const cell = row.getCell(k);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: Math.abs(f[k]) <= TOLERANCIA ? VERDE : ROJO } };
    }
    if (f.observacion) row.getCell("observacion").fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMARILLO } };
  }
  cols.forEach((col, i) => {
    if (col.moneda) ws.getColumn(i + 1).numFmt = MONEDA;
  });
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ENCABEZADO } };
  h.alignment = { wrapText: true, vertical: "middle" };
  h.height = 32;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
}

function hojaResumen(wb: ExcelJS.Workbook, cuadres: Cuadre[]) {
  const ws = wb.addWorksheet("Resumen");
  ws.columns = [{ width: 46 }, ...cuadres.map(() => ({ width: 22 }))];
  const r = cuadres.map(resumen);
  const titulo = ws.addRow(["Otros devengados · cuadre de referencia (fase 0)", ...cuadres.map((c) => c.periodo.codigo)]);
  titulo.font = { bold: true, color: { argb: "FFFFFFFF" } };
  titulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ENCABEZADO } };
  const linea = (etq: string, vals: unknown[], moneda = false) => {
    const row = ws.addRow([etq, ...vals]);
    if (moneda) for (let i = 2; i <= vals.length + 1; i++) row.getCell(i).numFmt = MONEDA;
    return row;
  };
  linea("Período MGX", cuadres.map((c) => c.periodo.nombre));
  linea("Rango GEMA", cuadres.map((c) => `${c.q.ini} a ${c.q.fin}`));
  linea("Líneas de nómina del período", cuadres.map((c) => c.lineas));
  linea("Filas de cierre GEMA", cuadres.map((c) => c.cierres));
  linea("Cierres sin cédula (no cruzados)", cuadres.map((c) => c.cierresSinCedula));
  linea("Entregas vigentes de caja", cuadres.map((c) => c.entregas));
  ws.addRow([]);
  linea("Conductores en el cruce", r.map((x) => x.conductores));
  linea("· con nómina y con producción", r.map((x) => x.enNominaYProduccion));
  linea("· solo nómina (sin producción)", r.map((x) => x.soloNomina));
  linea("· solo producción (sin nómina 002)", r.map((x) => x.soloProduccion));
  linea("· solo entregas", r.map((x) => x.soloEntregas));
  ws.addRow([]);
  linea("Producción GEMA", r.map((x) => x.produccion), true);
  linea(`Nómina devengo (${CONCEPTOS.join(", ")})`, r.map((x) => x.nominaDevengo), true);
  linea("Otros devengados calculados", r.map((x) => x.otrosDevengados), true);
  linea("Entregado por caja", r.map((x) => x.entregado), true);
  linea("Por entregar", r.map((x) => x.porEntregar), true);
  linea("Anticipo calculado", r.map((x) => x.anticipo), true);
  linea("MGX 216 Otros devengados N", r.map((x) => x.mgx216), true);
  linea("MGX 546 Anticipo salario", r.map((x) => x.mgx546), true);
  ws.addRow([]);
  linea(`Coinciden (±$${TOLERANCIA}) 216 = otros calculados`, r.map((x) => `${x.coincide216Otros} de ${x.enNominaYProduccion}`));
  linea(`Coinciden (±$${TOLERANCIA}) 216 = entregado caja`, r.map((x) => `${x.coincide216Entregado} de ${x.enNominaYProduccion}`));
  linea(`Coinciden (±$${TOLERANCIA}) 546 = anticipo calculado`, r.map((x) => `${x.coincide546Anticipo} de ${x.enNominaYProduccion}`));
}

const cuadres: Cuadre[] = [];
for (const p of periodos) cuadres.push(await cuadrar(p));
for (const c of cuadres) {
  console.log(`  ${c.periodo.codigo}:`, resumen(c));
}

const wb = new ExcelJS.Workbook();
hojaResumen(wb, cuadres);
for (const c of cuadres) hojaDetalle(wb, c);
const dir = path.join(RAIZ, "work", "otros-devengados");
mkdirSync(dir, { recursive: true });
const salida = path.join(dir, `cuadre-${periodos.join("-")}${argConceptos ? `-conceptos-${CONCEPTOS.join("_")}` : ""}.xlsx`);
await wb.xlsx.writeFile(salida);
console.log(`\nExcel: ${salida}`);
