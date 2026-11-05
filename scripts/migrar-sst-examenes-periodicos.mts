/**
 * Carga del histórico del Excel de SST «LISTADO PERSONAL EXAMEN PERIODICO»
 * (hojas mensuales y de control) a `sst_examenes_personas` y
 * `sst_examenes_periodicos`, con origen = 'historico'. Requiere la migración
 * 20261105161614_sst_examenes_periodicos.sql para --escribir; el --ensayo
 * funciona sin ella.
 *
 * Uso (desde la raíz del proyecto):
 *
 *   npm run sst:examenes-historico -- "<ruta>/LISTADO PERSONAL EXAMEN PERIODICO 2026.xlsx" --ensayo
 *   npm run sst:examenes-historico -- "<ruta>/LISTADO PERSONAL EXAMEN PERIODICO 2026.xlsx" --escribir
 *   npm run sst:examenes-historico -- --reversar
 *
 * --ensayo    solo lee (Excel y base) y escribe el informe en
 *             <tmp>/migracion-sst-examenes/: resumen.txt, rechazadas.csv,
 *             avisos.csv y comparacion.csv (próximo examen y alerta del Excel
 *             contra lo calculado).
 * --escribir  inserta lo que el ensayo da por bueno. Idempotente: una persona
 *             que ya está en el control no se toca, y un examen ya cargado
 *             (historico_ref) o con la misma cédula y fecha se salta.
 * --reversar  borra los exámenes con origen = 'historico' y las personas
 *             históricas que se quedan sin exámenes.
 *
 * El informe lleva nombres, cédulas y datos de salud: va a la carpeta temporal
 * y no debe copiarse al repositorio. Lee .env.local y si no existe .env.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { fechaCelda, hojaControl, leerLibroExamenes, type HojaCruda } from "../src/lib/sst/examenes-historico";
import { GRUPOS_EXAMEN, POR_VENCER_DIAS, estadoExamen, proximoDesdeIngreso, type EstadoExamen } from "../src/lib/sst/examenes";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(os.tmpdir(), "migracion-sst-examenes");
const AUTOR = "importacion-excel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

function leerEnv(): Record<string, string> {
  const archivo = [".env.local", ".env"].map((n) => path.join(RAIZ, n)).find(existsSync);
  if (!archivo) throw new Error("No hay .env.local ni .env en la raíz del proyecto.");
  const out: Record<string, string> = {};
  for (const linea of readFileSync(archivo, "utf8").split(/\r?\n/)) {
    if (!linea || linea.startsWith("#") || !linea.includes("=")) continue;
    const i = linea.indexOf("=");
    out[linea.slice(0, i).trim()] = linea.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function csv(filas: (string | number | null | undefined)[][]): string {
  const celda = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n") + "\r\n";
}

async function todas<T>(db: Db, tabla: string, select: string): Promise<T[] | null> {
  const out: T[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await db.from(tabla).select(select).order("cedula").range(a, a + 999);
    if (error) return null;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

async function cedulasDe(db: Db, tabla: string, col: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (let a = 0; ; a += 1000) {
    const { data, error } = await db.from(tabla).select(col).order(col).range(a, a + 999);
    if (error) return out;
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) if (r[col]) out.add(String(r[col]));
    if (!data || data.length < 1000) return out;
  }
}

/** Lo que dice la columna «ALERTAS» del Excel, traducido al semáforo del módulo. */
function estadoDeAlerta(alerta: string | null): EstadoExamen | null {
  if (!alerta) return null;
  if (/vencido/i.test(alerta)) return "vencido";
  if (/vence hoy/i.test(alerta)) return "por_vencer";
  const n = Number(/(\d+)/.exec(alerta)?.[1]);
  if (!Number.isFinite(n)) return null;
  return n <= POR_VENCER_DIAS ? "por_vencer" : "vigente";
}

async function reversar(db: Db) {
  const { count, error } = await db.from("sst_examenes_periodicos").delete({ count: "exact" }).eq("origen", "historico");
  if (error) throw new Error(error.message);
  const conExamen = new Set(((await todas<{ cedula: string }>(db, "sst_examenes_periodicos", "cedula")) ?? []).map((r) => r.cedula));
  const historicas = ((await todas<{ cedula: string; origen: string }>(db, "sst_examenes_personas", "cedula, origen")) ?? [])
    .filter((p) => p.origen === "historico" && !conExamen.has(p.cedula))
    .map((p) => p.cedula);
  let personas = 0;
  for (let i = 0; i < historicas.length; i += 200) {
    const { count: c, error: e } = await db.from("sst_examenes_personas").delete({ count: "exact" }).in("cedula", historicas.slice(i, i + 200));
    if (e) throw new Error(e.message);
    personas += c ?? 0;
  }
  console.log(`Borrados ${count ?? 0} exámenes históricos y ${personas} personas históricas sin exámenes.`);
}

async function main() {
  const escribir = process.argv.includes("--escribir");
  const ensayo = process.argv.includes("--ensayo");
  const env = leerEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el .env.");
  const db: Db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  if (process.argv.includes("--reversar")) return reversar(db);

  const ruta = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!ruta || (!ensayo && !escribir)) {
    console.log("Uso: migrar-sst-examenes-periodicos.mts <excel.xlsx> --ensayo | --escribir | --reversar");
    process.exit(1);
  }
  mkdirSync(SALIDA, { recursive: true });

  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const libro = XLSX.read(readFileSync(ruta), { type: "buffer" });
  const hojas: HojaCruda[] = libro.SheetNames.map((nombre) => ({
    nombre,
    filas: XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombre], { header: 1, raw: true, defval: null, blankrows: true }),
  }));
  const r = leerLibroExamenes(hojas, hoy);

  // Fecha de corte de las alertas del Excel (la celda con la fecha en la fila 1 de las hojas de control).
  const hojaCorte = hojas.find((h) => hojaControl(h.nombre));
  const corte = (hojaCorte?.filas[0] ?? []).map((v) => (typeof v === "number" && v > 40000 ? fechaCelda(v).fecha : null)).find(Boolean) ?? hoy;

  // Lo que ya está en la base (antes de la migración las tablas no existen).
  const personasBase = await todas<{ cedula: string }>(db, "sst_examenes_personas", "cedula");
  const examenesBase = await todas<{ cedula: string; fecha_atencion: string; historico_ref: string | null; anulado_en: string | null }>(
    db, "sst_examenes_periodicos", "cedula, fecha_atencion, historico_ref, anulado_en"
  );
  const migracionAplicada = personasBase !== null && examenesBase !== null;
  const yaPersona = new Set((personasBase ?? []).map((p) => p.cedula));
  const yaRef = new Set((examenesBase ?? []).map((e) => e.historico_ref).filter(Boolean) as string[]);
  const yaFecha = new Set((examenesBase ?? []).filter((e) => !e.anulado_en).map((e) => `${e.cedula}|${e.fecha_atencion}`));
  const personasNuevas = r.personas.filter((p) => !yaPersona.has(p.cedula));
  const examenesNuevos = r.examenes.filter((e) => !yaRef.has(e.historicoRef) && !yaFecha.has(`${e.cedula}|${e.fechaAtencion}`));

  // Cédulas que no están en los maestros (solo informativo: se cargan igual).
  const [cond, emp] = await Promise.all([cedulasDe(db, "conductores", "cedula"), cedulasDe(db, "employees", "document_number")]);
  const sinMaestro = r.personas.filter((p) => !cond.has(p.cedula) && !emp.has(p.cedula));

  // Próximo examen y alerta del Excel contra lo calculado, a la fecha de corte del Excel.
  const ultimo = new Map<string, (typeof r.examenes)[number]>();
  for (const e of r.examenes) if ((ultimo.get(e.cedula)?.fechaAtencion ?? "") < e.fechaAtencion) ultimo.set(e.cedula, e);
  const comparacion: (string | number)[][] = [["cedula", "nombre", "grupo", "ultimo examen", "proximo (Excel)", "proximo (calculado)", "alerta (Excel)", `estado al ${corte} (calculado)`, "coincide"]];
  let comparables = 0;
  let iguales = 0;
  let proximoIgual = 0;
  let proximoCerca = 0;
  for (const p of r.personas) {
    if (!p.activo) continue;
    const c = r.control.get(p.cedula);
    const u = ultimo.get(p.cedula);
    const proximoCalc = u?.proximoExamen ?? proximoDesdeIngreso(p);
    const calc = estadoExamen(proximoCalc, corte).estado;
    const excel = estadoDeAlerta(c?.alerta ?? null);
    if (c?.proximo && proximoCalc) {
      const d = Math.abs(Date.parse(c.proximo) - Date.parse(proximoCalc)) / 86400000;
      if (d === 0) proximoIgual++;
      else if (d <= 31) proximoCerca++;
    }
    if (excel) {
      comparables++;
      if (excel === calc) iguales++;
    }
    if (!excel || excel !== calc) {
      comparacion.push([p.cedula, p.nombre, p.grupo, u?.fechaAtencion ?? (p.fechaIngreso ? `ingreso ${p.fechaIngreso}` : ""), c?.proximo ?? "", proximoCalc ?? "", c?.alerta ?? "", calc, excel ? (excel === calc ? "sí" : "no") : "sin alerta en el Excel"]);
    }
  }

  const activas = r.personas.filter((p) => p.activo);
  const porEstado = new Map<EstadoExamen, number>();
  for (const p of activas) {
    const est = estadoExamen(ultimo.get(p.cedula)?.proximoExamen ?? proximoDesdeIngreso(p), hoy).estado;
    porEstado.set(est, (porEstado.get(est) ?? 0) + 1);
  }
  const porAnio = new Map<string, number>();
  for (const e of r.examenes) porAnio.set(e.fechaAtencion.slice(0, 4), (porAnio.get(e.fechaAtencion.slice(0, 4)) ?? 0) + 1);

  const resumen = [
    `Carga del histórico de exámenes periódicos (SST) — ${escribir ? "ESCRITURA" : "ENSAYO (no escribe)"}`,
    `Archivo: ${ruta}`,
    `Hojas mensuales: ${r.hojas.filter((h) => h.tipo === "mensual").length} · de control: ${r.hojas.filter((h) => h.tipo === "control").map((h) => `${h.nombre.trim()} (${h.filas})`).join(", ")}`,
    `Hojas ignoradas: ${r.hojas.filter((h) => h.tipo === "ignorada").map((h) => h.nombre).join(", ") || "ninguna"}`,
    `Migración de base aplicada: ${migracionAplicada ? "sí" : "NO (aplíquela antes de --escribir)"}`,
    "",
    `Personas: ${r.personas.length} (${activas.length} en control, ${r.personas.length - activas.length} retiradas) · ${personasNuevas.length} nuevas en la base`,
    ...GRUPOS_EXAMEN.map((g) => `    ${String(r.personas.filter((p) => p.grupo === g.key).length).padStart(4)}  ${g.label} (${activas.filter((p) => p.grupo === g.key).length} en control)`),
    `Exámenes: ${r.examenes.length} · ${examenesNuevos.length} nuevos en la base · con recomendaciones ${r.examenes.filter((e) => e.recomendaciones).length} · con entrega ${r.examenes.filter((e) => e.fechaEntrega).length}`,
    ...[...porAnio.entries()].sort().map(([a, n]) => `    ${String(n).padStart(4)}  ${a}`),
    `Periodicidad de las personas: ${[12, 24, 36].map((m) => `${m} meses = ${r.personas.filter((p) => p.periodicidadMeses === m).length}`).join(" · ")}`,
    `Personas en control sin examen periódico: ${activas.filter((p) => !ultimo.has(p.cedula)).length} (con fecha de ingreso, su primer examen se cuenta desde ella: ${activas.filter((p) => !ultimo.has(p.cedula) && p.fechaIngreso).length})`,
    `Rechazadas: ${r.rechazadas.length} · Avisos: ${r.avisos.length}`,
    `Personas que no están en conductores ni empleados: ${sinMaestro.length} (normal para Metrorecaudo y Anaya Giraldo)`,
    "",
    `Estado hoy (${hoy}) de las personas en control: ${(["vencido", "por_vencer", "sin_examen", "vigente"] as EstadoExamen[]).map((e) => `${e} ${porEstado.get(e) ?? 0}`).join(" · ")}`,
    `Contra el Excel (alertas al ${corte}): ${iguales} de ${comparables} con el mismo estado; próximo examen igual ${proximoIgual}, a un mes o menos ${proximoCerca}. Diferencias en comparacion.csv.`,
    "",
    `Informe en: ${SALIDA}`,
  ].join("\n");
  writeFileSync(path.join(SALIDA, "resumen.txt"), resumen + "\n");
  writeFileSync(path.join(SALIDA, "rechazadas.csv"), csv([["referencia", "motivo"], ...r.rechazadas.map((x) => [x.ref, x.motivo])]));
  writeFileSync(path.join(SALIDA, "avisos.csv"), csv([["referencia", "aviso"], ...r.avisos.map((x) => [x.ref, x.aviso])]));
  writeFileSync(path.join(SALIDA, "comparacion.csv"), csv(comparacion));
  console.log(resumen);

  if (!escribir) return;
  if (!migracionAplicada) throw new Error("Aplique primero la migración 20261105161614_sst_examenes_periodicos.sql.");

  const filasPersona = personasNuevas.map((p) => ({
    cedula: p.cedula,
    nombre: p.nombre,
    cargo: p.cargo,
    grupo: p.grupo,
    fecha_ingreso: p.fechaIngreso,
    periodicidad_meses: p.periodicidadMeses,
    activo: p.activo,
    motivo_inactivo: p.activo ? null : "retirado",
    inactivo_desde: p.inactivoDesde,
    origen: "historico",
    created_by_email: AUTOR,
  }));
  for (let i = 0; i < filasPersona.length; i += 500) {
    const { error } = await db.from("sst_examenes_personas").upsert(filasPersona.slice(i, i + 500), { onConflict: "cedula", ignoreDuplicates: true });
    if (error) throw new Error(`personas: ${error.message}`);
  }
  const filasExamen = examenesNuevos.map((e) => ({
    cedula: e.cedula,
    nombre: e.nombre,
    cargo: e.cargo,
    fecha_atencion: e.fechaAtencion,
    fecha_entrega: e.fechaEntrega,
    periodicidad_meses: e.periodicidadMeses,
    proximo_examen: e.proximoExamen,
    recomendaciones: e.recomendaciones,
    observaciones: e.observaciones,
    origen: "historico",
    historico_ref: e.historicoRef,
    created_by_email: AUTOR,
  }));
  for (let i = 0; i < filasExamen.length; i += 500) {
    const { error } = await db.from("sst_examenes_periodicos").insert(filasExamen.slice(i, i + 500));
    if (error) throw new Error(`exámenes: ${error.message}`);
  }
  console.log(`Listo: ${filasPersona.length} personas y ${filasExamen.length} exámenes cargados.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
