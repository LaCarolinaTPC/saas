/**
 * Fase 7 — Recalibración de los umbrales de semáforo con el consolidado.
 *
 * Los tres umbrales vienen del aplicativo de Lovable, donde estaban escritos
 * en el código. Este script mira lo que de verdad hace la flota y propone
 * unos nuevos, para llevarlos a Subgerencia Financiera antes de cambiarlos en
 * Parámetros (plan, secciones 6.3.1 y 9, fase 7).
 *
 *   npm run financiera:umbrales
 *   npm run financiera:umbrales -- --desde 2025-01 --hasta 2026-08
 *
 * Qué se puede recalibrar y qué no:
 *   · productividad  EXACTA siempre: sale entera de GEMA.
 *   · rentabilidad   solo con el archivo contable cargado; sin él es un techo.
 *   · gasto/timbrada solo con el archivo contable cargado; sin él es un piso.
 * El script lo dice en cada bloque y no propone nada que no pueda sostener.
 */

import { config } from "dotenv";
// Igual que en financiera-historico.mts: los tipos van en un import estático
// porque no se pueden desestructurar de un import dinámico.
import type { NivelSemaforo, ParametroSemaforo } from "../src/lib/financiera/motor";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { indicadores, nivelSemaforo } = await import("../src/lib/financiera/motor");
const { leerParametros } = await import("../src/lib/financiera/consulta");

const argv = process.argv.slice(2);
const valor = (f: string) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const desde = valor("--desde");
const hasta = valor("--hasta");

const dec = (n: number, d = 1) => n.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
const cop = (n: number) => `$ ${Math.round(n).toLocaleString("es-CO")}`;
const pct = (n: number) => `${dec(n, 2)} %`;

// ── Datos ────────────────────────────────────────────────────────────────────

const db = createAdminClient();
type Fila = {
  periodo: string;
  codigo_vehiculo: string;
  viajes: number; timbradas: number; ingresos: number;
  gastos_operativos_totales: number; utilidad_neta: number;
  rentabilidad: number; gastos_por_timbrada: number;
  origen_contable: string;
  estado_periodo: string | null;
};

const filas: Fila[] = [];
for (let d = 0; ; d += 1000) {
  let q = db
    .from("vw_financiera_consolidado")
    .select("periodo, codigo_vehiculo, viajes, timbradas, ingresos, gastos_operativos_totales, utilidad_neta, rentabilidad, gastos_por_timbrada, origen_contable, estado_periodo")
    .order("periodo")
    .order("codigo_vehiculo")
    .range(d, d + 999);
  if (desde) q = q.gte("periodo", desde);
  if (hasta) q = q.lte("periodo", hasta);
  const { data, error } = await q;
  if (error) {
    console.error("No se pudo leer el consolidado:", error.message);
    process.exit(1);
  }
  const lote = (data ?? []) as unknown as Record<string, unknown>[];
  for (const r of lote) {
    filas.push({
      periodo: String(r.periodo),
      codigo_vehiculo: String(r.codigo_vehiculo),
      viajes: Number(r.viajes), timbradas: Number(r.timbradas), ingresos: Number(r.ingresos),
      gastos_operativos_totales: Number(r.gastos_operativos_totales),
      utilidad_neta: Number(r.utilidad_neta),
      rentabilidad: Number(r.rentabilidad),
      gastos_por_timbrada: Number(r.gastos_por_timbrada),
      origen_contable: String(r.origen_contable),
      estado_periodo: (r.estado_periodo as string | null) ?? null,
    });
  }
  if (lote.length < 1000) break;
}

if (filas.length === 0) {
  console.log("El consolidado está vacío en ese rango: consolide primero desde GEMA.");
  process.exit(0);
}

const periodos = [...new Set(filas.map((f) => f.periodo))].sort();
const conContable = filas.filter((f) => f.origen_contable === "archivo");
const cerrados = filas.filter((f) => f.estado_periodo === "cerrado");

console.log("── Base de la recalibración ──");
console.log(`vehículo-mes: ${filas.length} · períodos: ${periodos[0]} → ${periodos[periodos.length - 1]} (${periodos.length})`);
console.log(`de períodos cerrados: ${cerrados.length} · con archivo contable: ${conContable.length} (${dec((conContable.length / filas.length) * 100, 0)} %)`);

// ── Utilidades de distribución ───────────────────────────────────────────────

function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const i = (orden.length - 1) * p;
  const bajo = Math.floor(i), alto = Math.ceil(i);
  return bajo === alto ? orden[bajo] : orden[bajo] + (orden[alto] - orden[bajo]) * (i - bajo);
}

function reparto(valores: number[], p: ParametroSemaforo): Record<NivelSemaforo, number> {
  const r: Record<NivelSemaforo, number> = { excelente: 0, aceptable: 0, critico: 0 };
  for (const v of valores) r[nivelSemaforo(v, p)]++;
  return r;
}

function linea(valores: number[], p: ParametroSemaforo, etiqueta: string, fmt: (n: number) => string): string {
  const r = reparto(valores, p);
  const t = valores.length || 1;
  return (
    `  ${etiqueta.padEnd(30)} 🟢 ${String(r.excelente).padStart(5)} (${dec((r.excelente / t) * 100, 0).padStart(3)} %)  ` +
    `🟡 ${String(r.aceptable).padStart(5)} (${dec((r.aceptable / t) * 100, 0).padStart(3)} %)  ` +
    `🔴 ${String(r.critico).padStart(5)} (${dec((r.critico / t) * 100, 0).padStart(3)} %)` +
    `   [excelente ${fmt(p.umbralExcelente)} · aceptable ${fmt(p.umbralAceptable)}]`
  );
}

function distribucion(valores: number[], fmt: (n: number) => string): string {
  const p = (x: number) => fmt(percentil(valores, x));
  return `  P10 ${p(0.1)} · P25 ${p(0.25)} · mediana ${p(0.5)} · P75 ${p(0.75)} · P90 ${p(0.9)}`;
}

const actuales = await leerParametros();

// ── 1. Productividad (exacta) ────────────────────────────────────────────────

console.log("\n── Productividad (viajes por vehículo-mes) ──");
console.log("Exacta: sale entera de GEMA y no depende del archivo contable.");
const prod = filas.map((f) => f.viajes);
const mediaFlota = prod.reduce((s, v) => s + v, 0) / prod.length;
console.log(`  media de la flota: ${dec(mediaFlota)} viajes por vehículo-mes`);
console.log(distribucion(prod, (n) => dec(n, 0)));

const pActual = actuales.productividad;
console.log("\n  reparto con el umbral vigente y con tres candidatos:");
console.log(linea(prod, pActual, "vigente (heredado)", (n) => dec(n, 0)));
for (const [e, a] of [[85, 70], [80, 65], [Math.round(percentil(prod, 0.7)), Math.round(percentil(prod, 0.35))]] as const) {
  console.log(linea(prod, { ...pActual, umbralExcelente: e, umbralAceptable: a }, `${e} / ${a}`, (n) => dec(n, 0)));
}
console.log(`\n  propuesta por percentiles (P70 / P35): excelente ${Math.round(percentil(prod, 0.7))}, aceptable ${Math.round(percentil(prod, 0.35))}`);
console.log("  deja ~30 % en verde y ~35 % en rojo, que es el reparto que hace útil un semáforo.");

// ── 2 y 3. Rentabilidad y gasto por timbrada ─────────────────────────────────

const puedeRecalibrar = conContable.length > 0;

console.log("\n── Rentabilidad (%) ──");
if (!puedeRecalibrar) {
  console.log("NO SE PUEDE RECALIBRAR TODAVÍA: ningún vehículo-mes tiene el archivo contable.");
  console.log("Lo que se ve hoy es un TECHO (falta restar seis rubros de costo), así que cualquier");
  console.log("umbral que se derive de estas cifras quedaría demasiado alto.");
  const techo = filas.map((f) => f.rentabilidad);
  console.log(`  techo actual — media ponderada: ${pct((filas.reduce((s, f) => s + f.utilidad_neta, 0) / filas.reduce((s, f) => s + f.ingresos, 0)) * 100)}`);
  console.log(distribucion(techo, pct));
} else {
  const rent = conContable.map((f) => f.rentabilidad);
  const ponderada = (conContable.reduce((s, f) => s + f.utilidad_neta, 0) / conContable.reduce((s, f) => s + f.ingresos, 0)) * 100;
  console.log(`Sobre ${conContable.length} vehículo-mes con archivo contable completo.`);
  console.log(`  media ponderada: ${pct(ponderada)}`);
  console.log(distribucion(rent, pct));
  const r = actuales.rentabilidad;
  console.log("\n  reparto con el umbral vigente y con la propuesta por percentiles:");
  console.log(linea(rent, r, "vigente (15 / 5)", pct));
  const e = Math.round(percentil(rent, 0.7) * 10) / 10;
  const a = Math.round(percentil(rent, 0.35) * 10) / 10;
  console.log(linea(rent, { ...r, umbralExcelente: e, umbralAceptable: a }, `${dec(e)} / ${dec(a)}`, pct));
  console.log(`\n  propuesta (P70 / P35): excelente ${dec(e)} %, aceptable ${dec(a)} %`);
}

console.log("\n── Gasto por timbrada (COP) ──");
if (!puedeRecalibrar) {
  console.log("NO SE PUEDE RECALIBRAR TODAVÍA: sin el archivo contable la cifra es un PISO.");
  const piso = filas.map((f) => f.gastos_por_timbrada);
  const ingresoTim = filas.reduce((s, f) => s + f.ingresos, 0) / filas.reduce((s, f) => s + f.timbradas, 0);
  const gastoTim = filas.reduce((s, f) => s + f.gastos_operativos_totales, 0) / filas.reduce((s, f) => s + f.timbradas, 0);
  console.log(`  ingreso por timbrada: ${cop(ingresoTim)} · gasto (piso): ${cop(gastoTim)} = ${dec((gastoTim / ingresoTim) * 100)} % del ingreso`);
  console.log(distribucion(piso, cop));
  console.log("\n  Nota del plan (6.3.1): los umbrales están en pesos fijos y el pasaje subió ~10 % en 2026,");
  console.log("  así que envejecen solos. Conviene decidir si se expresan como porcentaje del ingreso por");
  console.log("  timbrada; con eso el umbral no hay que retocarlo cada vez que sube la tarifa.");
} else {
  const gasto = conContable.map((f) => f.gastos_por_timbrada);
  const ingresoTim = conContable.reduce((s, f) => s + f.ingresos, 0) / conContable.reduce((s, f) => s + f.timbradas, 0);
  const gastoTim = conContable.reduce((s, f) => s + f.gastos_operativos_totales, 0) / conContable.reduce((s, f) => s + f.timbradas, 0);
  console.log(`Sobre ${conContable.length} vehículo-mes con archivo contable completo.`);
  console.log(`  ingreso por timbrada: ${cop(ingresoTim)} · gasto: ${cop(gastoTim)} = ${dec((gastoTim / ingresoTim) * 100)} % del ingreso`);
  console.log(distribucion(gasto, cop));
  const g = actuales.gasto_timbrada;
  console.log("\n  reparto con el umbral vigente y con la propuesta por percentiles:");
  console.log(linea(gasto, g, "vigente (2.500 / 3.200)", cop));
  const e = Math.round(percentil(gasto, 0.3));
  const a = Math.round(percentil(gasto, 0.65));
  console.log(linea(gasto, { ...g, umbralExcelente: e, umbralAceptable: a }, `${cop(e)} / ${cop(a)}`, cop));
  console.log(`\n  propuesta (P30 / P65): excelente ${cop(e)}, aceptable ${cop(a)}`);
  console.log(`  equivalen al ${dec((e / ingresoTim) * 100)} % y al ${dec((a / ingresoTim) * 100)} % del ingreso por timbrada.`);
}

// ── Cierre ───────────────────────────────────────────────────────────────────

console.log("\n── Qué hacer con esto ──");
console.log("Los umbrales se cambian en Financiera › Parámetros (solo administrador) y el valor");
console.log("anterior queda en la bitácora. La decisión es de Subgerencia Financiera: este script");
console.log("solo muestra qué reparto produce cada corte sobre la operación real.");
if (!puedeRecalibrar) {
  console.log("\nSolo la productividad se puede decidir hoy. Los otros dos esperan a que se cargue");
  console.log("el archivo contable (fase 4, o el histórico con npm run financiera:historico).");
}

const nota = indicadores({
  viajes: 0, timbradas: 0, ingresos: 0,
  fondo: 0, poliza: 0, prestamo: 0, estudio: 0, salario: 0, combustible: 0, rtica: 0, admon: 0, sitra: 0,
  despacho: 0, intereses: 0, otrosGastos: 0, repuestos: 0, manoDeObra: 0, descFondoConductor: 0,
  combustibleVehiculosNuevos: 0, polizaVehiculosNuevos: 0,
});
if (nota.rentabilidad !== 0) console.error("El motor no devolvió 0 para una fila vacía; revise motor.ts.");
