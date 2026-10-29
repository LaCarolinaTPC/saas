/**
 * Carga del histórico del Excel de RRHH «PROCESOS DISCIPLINARIOS» (hojas 2025
 * y 2026) a `procesos_disciplinarios`, marcado con origen = 'historico'.
 * Requiere la migración
 * supabase/migrations/20261029154740_procesos_disciplinarios_campos_del_excel_e_historico.sql
 * para --escribir; el --ensayo funciona sin ella.
 *
 * Uso (desde la raíz del proyecto):
 *
 *   npm run disciplinarios:historico -- "<ruta>/PROCESOS DISCIPLINARIOS.xlsx" --ensayo
 *   npm run disciplinarios:historico -- "<ruta>/PROCESOS DISCIPLINARIOS.xlsx" --ensayo --equivalencias "<ruta>/trabajadores.csv"
 *   npm run disciplinarios:historico -- "<ruta>/PROCESOS DISCIPLINARIOS.xlsx" --escribir [--equivalencias "<ruta>/trabajadores.csv"]
 *   npm run disciplinarios:historico -- "<ruta>/PROCESOS DISCIPLINARIOS.xlsx" --escribir --incluir-parciales
 *   npm run disciplinarios:historico -- --reversar
 *
 * --ensayo        solo lee (Excel, maestro de conductores y procesos ya
 *                 cargados) y deja el informe en <tmp>/migracion-disciplinarios/:
 *                 resumen.txt, trabajadores.csv, no-cargadas.csv, avisos.csv.
 * --equivalencias el trabajadores.csv del ensayo revisado: la cédula escrita
 *                 manda sobre el emparejamiento automático (así se suma a quien
 *                 RRHH identifique a mano; vacía = no cargar).
 * --incluir-parciales también carga los emparejados con solo 2 palabras
 *                 («EDGAR PUELLO» → PUELLO FRANCO EDGAR ALEXANDER, único candidato)
 *                 que no se confirman solos. Sin la opción, un parcial se carga
 *                 solo si el mismo conductor aparece en otra fila del Excel con
 *                 el nombre completo («DAIRO MERIÑO» y «DAIRO MERIÑO MENDOZA»).
 *                 Revíselos antes en trabajadores.csv: «CARLOS DE LEON» empata
 *                 con LEON CASTRO JUAN CARLOS.
 * --escribir      inserta por lotes. Es idempotente: las filas ya cargadas
 *                 (historico_ref = «hoja:fila») se saltan.
 * --reversar      borra todos los procesos con origen = 'historico'.
 *
 * Reglas:
 * - El Excel no trae cédula: el EMPLEADO se busca por nombre en `conductores`
 *   (crearEmparejadorNombres: mismas palabras en cualquier orden, o uno
 *   contiene al otro tolerando una letra por palabra). Ambiguos, sin
 *   coincidencia y, salvo --incluir-parciales, los parciales NO se cargan:
 *   quedan en el informe.
 * - Tipo, medida, motivo y norma se deducen del texto (src/lib/disciplinarios/historico.ts);
 *   el texto original queda en la descripción.
 * - El mismo proceso en las dos hojas (misma cédula, fecha, tipo y motivo) se
 *   carga una vez.
 *
 * El informe lleva nombres y cédulas: va a la carpeta temporal y no debe
 * copiarse al repositorio. Lee .env.local y si no existe .env.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import {
  claveDuplicado, crearEmparejadorNombres, leerHoja, mapearFila, type Emparejamiento, type ProcesoHistorico, type Trabajador,
} from "../src/lib/disciplinarios/historico";
import { etiquetaMedida, etiquetaMotivo, etiquetaNorma, etiquetaTipo } from "../src/lib/disciplinarios/reglas";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(os.tmpdir(), "migracion-disciplinarios");
const LOTE = 200;
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

/** Trae una tabla completa paginando de a 1.000 (PostgREST recorta a 1.000 filas). */
async function todo<T>(db: Db, tabla: string, cols: string, filtro?: (q: any) => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    let q = db.from(tabla).select(cols).range(desde, desde + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...(data as T[]));
    if (!data || data.length < 1000) return out;
  }
}

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] ?? null : null;
}

function leerEquivalencias(ruta: string | null): Map<string, string | null> {
  const m = new Map<string, string | null>();
  if (!ruta) return m;
  const texto = readFileSync(ruta, "utf8").replace(/^﻿/, "");
  const filas = texto.split(/\r?\n/).filter(Boolean).map((l) => l.split(";").map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"').trim()));
  const enc = filas[0].map((c) => c.toLowerCase());
  const iNombre = enc.indexOf("nombre_excel");
  const iCedula = enc.indexOf("cedula");
  if (iNombre < 0 || iCedula < 0) throw new Error("El archivo de equivalencias necesita las columnas nombre_excel y cedula.");
  for (const f of filas.slice(1)) if (f[iNombre]) m.set(f[iNombre], f[iCedula]?.replace(/\D/g, "") || null);
  return m;
}

type Plan = { proceso: ProcesoHistorico; conductor: Trabajador; match: Emparejamiento["tipo"] | "equivalencia" };

async function main() {
  const reversar = process.argv.includes("--reversar");
  const escribir = process.argv.includes("--escribir");
  const ensayo = process.argv.includes("--ensayo");
  const incluirParciales = process.argv.includes("--incluir-parciales");
  const env = leerEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el .env.");
  }
  const db: Db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  if (reversar) {
    const { count, error } = await db.from("procesos_disciplinarios").delete({ count: "exact" }).eq("origen", "historico");
    if (error) throw new Error(error.message);
    console.log(`Borrados ${count ?? 0} procesos históricos.`);
    return;
  }

  const args = process.argv.slice(2);
  const ruta = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--equivalencias");
  if (!ruta || (!ensayo && !escribir)) {
    console.log("Uso: migrar-disciplinarios-historico.mts <excel.xlsx> --ensayo | --escribir [--equivalencias <trabajadores.csv>] | --reversar");
    process.exit(1);
  }
  mkdirSync(SALIDA, { recursive: true });

  // ── Lectura ──
  const libro = XLSX.read(readFileSync(ruta), { type: "buffer" });
  const hojas = libro.SheetNames.filter((n) => /^\d{4}$/.test(n.trim()));
  if (hojas.length === 0) throw new Error(`El libro no tiene hojas con nombre de año (tiene: ${libro.SheetNames.join(", ")}).`);
  const filas = hojas.flatMap((h) =>
    leerHoja(h.trim(), XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[h], { header: 1, raw: true, defval: null, blankrows: true }))
  );
  const equivalencias = leerEquivalencias(argumento("--equivalencias"));
  const maestroCrudo = await todo<{ cedula: string | null; nombre: string | null; codigo: string | null; estado: string | null }>(
    db, "conductores", "cedula, nombre, codigo, estado"
  );
  const maestro: Trabajador[] = maestroCrudo
    .filter((c) => c.cedula && c.nombre)
    .map((c) => ({ cedula: c.cedula!, nombre: c.nombre!, codigo: c.codigo, estado: c.estado }));
  const porCedula = new Map(maestro.map((c) => [c.cedula, c]));
  const emparejar = crearEmparejadorNombres(maestro);

  // Ya cargados (antes de la migración no existe historico_ref).
  let migracionAplicada = true;
  let yaCargados = new Set<string>();
  try {
    const previos = await todo<{ historico_ref: string | null }>(db, "procesos_disciplinarios", "historico_ref", (q) => q.not("historico_ref", "is", null));
    yaCargados = new Set(previos.map((p) => p.historico_ref!).filter(Boolean));
  } catch {
    migracionAplicada = false;
  }

  // ── Plan ──
  const noCargadas: (string | number)[][] = [["hoja", "fila", "empleado", "motivo", "detalle"]];
  const avisos: (string | number)[][] = [["hoja", "fila", "empleado", "aviso"]];
  const planes: Plan[] = [];
  const vistos = new Map<string, string>();
  const porNombre = new Map<string, { veces: number; e: Emparejamiento; eq?: string | null }>();
  const motivoNoCarga = new Map<string, number>();
  const noCargar = (f: { hoja: string; fila: number; empleado: string }, motivo: string, detalle = "") => {
    noCargadas.push([f.hoja, f.fila, f.empleado, motivo, detalle]);
    motivoNoCarga.set(motivo, (motivoNoCarga.get(motivo) ?? 0) + 1);
  };

  // Un parcial («DAIRO MERIÑO») se da por confirmado si el mismo conductor
  // también aparece en el Excel con el nombre completo (exacto o probable).
  const confirmados = new Set<string>();
  for (const f of filas) {
    const e = emparejar(f.empleado);
    if (e.tipo === "exacto" || e.tipo === "probable") confirmados.add(e.conductor.cedula);
  }

  for (const f of filas) {
    const r = mapearFila(f);
    if (!r.ok) {
      noCargar(f, "Fecha inválida", r.error);
      continue;
    }
    for (const a of r.avisos) avisos.push([f.hoja, f.fila, f.empleado, a]);

    const e = emparejar(f.empleado);
    const info = porNombre.get(f.empleado) ?? { veces: 0, e };
    info.veces++;
    porNombre.set(f.empleado, info);

    const cargable =
      e.tipo === "exacto" || e.tipo === "probable" || (e.tipo === "parcial" && (incluirParciales || confirmados.has(e.conductor.cedula)));
    let conductor: Trabajador | null = cargable ? e.conductor : null;
    let match: Plan["match"] = e.tipo;
    if (equivalencias.has(f.empleado)) {
      const ced = equivalencias.get(f.empleado) ?? null;
      conductor = ced ? porCedula.get(ced) ?? null : null;
      if (ced && !conductor) avisos.push([f.hoja, f.fila, f.empleado, `Cédula ${ced} de equivalencias no está en el maestro`]);
      match = "equivalencia";
      info.eq = ced;
    }
    if (!conductor) {
      noCargar(
        f,
        match === "equivalencia"
          ? "Sin cédula en equivalencias"
          : e.tipo === "ambiguo"
            ? "Nombre ambiguo en el maestro"
            : e.tipo === "parcial"
              ? "Emparejado parcial (2 palabras): use --incluir-parciales o equivalencias"
              : "No está en el maestro",
        e.tipo === "ambiguo" ? e.candidatos.map((x) => `${x.cedula} ${x.nombre}`).join(" | ") : ""
      );
      continue;
    }

    const k = claveDuplicado(conductor.cedula, r.proceso);
    if (vistos.has(k)) {
      noCargar(f, "Duplicado", `Igual a la fila ${vistos.get(k)}`);
      continue;
    }
    vistos.set(k, r.proceso.historico_ref);
    planes.push({ proceso: r.proceso, conductor, match });
  }
  const nuevos = planes.filter((p) => !yaCargados.has(p.proceso.historico_ref));

  // ── Informe ──
  const trabajadoresCsv: (string | number | null)[][] = [["nombre_excel", "veces", "resultado", "cedula", "nombre_maestro", "codigo", "estado_maestro", "candidatos"]];
  for (const [nombre, { veces, e, eq }] of [...porNombre].sort((a, b) => b[1].veces - a[1].veces || a[0].localeCompare(b[0]))) {
    const c = eq !== undefined ? (eq ? porCedula.get(eq) ?? null : null) : "conductor" in e ? e.conductor : null;
    const candidatos = e.tipo === "ambiguo" ? e.candidatos.map((x) => `${x.cedula} ${x.nombre}`).join(" | ") : "";
    const resultado = eq !== undefined ? "equivalencia" : e.tipo === "parcial" && confirmados.has(e.conductor.cedula) ? "parcial confirmado" : e.tipo;
    trabajadoresCsv.push([nombre, veces, resultado, c?.cedula ?? eq ?? "", c?.nombre ?? "", c?.codigo ?? "", c?.estado ?? "", candidatos]);
  }
  const personas = (t: string) => [...porNombre.values()].filter((x) => (x.eq !== undefined ? "equivalencia" : x.e.tipo) === t);
  const conteo = <K extends string>(f: (p: ProcesoHistorico) => K, etiqueta: (k: K) => string) => {
    const m = new Map<K, number>();
    for (const { proceso } of planes) m.set(f(proceso), (m.get(f(proceso)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `    ${String(n).padStart(4)}  ${etiqueta(k)}`);
  };
  const porHoja = hojas.map((h) => `    ${h.trim()}: ${filas.filter((f) => f.hoja === h.trim()).length} filas, ${planes.filter((p) => p.proceso.historico_ref.startsWith(`${h.trim()}:`)).length} a cargar`);

  const resumen = [
    `Carga del histórico de procesos disciplinarios — ${escribir ? "ESCRITURA" : "ENSAYO (no escribe)"}`,
    `Archivo: ${ruta}`,
    `Migración de base aplicada: ${migracionAplicada ? "sí" : "NO (aplíquela antes de --escribir)"}`,
    "",
    `Filas con empleado en el Excel:   ${filas.length}`,
    ...porHoja,
    `A cargar:                         ${planes.length} (${nuevos.length} nuevos, ${planes.length - nuevos.length} ya estaban)`,
    `No se cargan:                     ${noCargadas.length - 1}`,
    ...[...motivoNoCarga].sort((a, b) => b[1] - a[1]).map(([m, n]) => `    ${String(n).padStart(4)}  ${m}`),
    "",
    `Trabajadores distintos en el Excel: ${porNombre.size}`,
    `  Exactos:      ${personas("exacto").length}`,
    `  Probables:    ${personas("probable").length}`,
    `  Parciales:    ${personas("parcial").length}, de ellos ${personas("parcial").filter((x) => x.e.tipo === "parcial" && confirmados.has(x.e.conductor.cedula)).length} confirmados con el nombre completo en otra fila (los demás ${incluirParciales ? "se cargan" : "NO se cargan sin --incluir-parciales"})`,
    `  Equivalencia: ${personas("equivalencia").length}`,
    `  Ambiguos:     ${personas("ambiguo").length}`,
    `  Sin maestro:  ${personas("ninguno").length}`,
    "",
    "Por tipo:",
    ...conteo((p) => p.tipo, etiquetaTipo),
    "Por medida:",
    ...conteo((p) => p.medida, (k) => etiquetaMedida(k)),
    "Por motivo:",
    ...conteo((p) => p.motivo, (k) => etiquetaMotivo(k)),
    "Por norma incumplida:",
    ...conteo((p) => p.norma_incumplida, etiquetaNorma),
    "",
    `Avisos (fechas corregidas, sanciones no reconocidas…): ${avisos.length - 1}`,
    `Informe en: ${SALIDA}`,
    "  trabajadores.csv: revise «probable» y «parcial» y complete «cedula» de ambiguos o sin maestro si los identifica;",
    "                    páselo con --equivalencias (cedula vacía = no cargar).",
  ].join("\n");
  writeFileSync(path.join(SALIDA, "resumen.txt"), resumen + "\n");
  writeFileSync(path.join(SALIDA, "trabajadores.csv"), csv(trabajadoresCsv));
  writeFileSync(path.join(SALIDA, "no-cargadas.csv"), csv(noCargadas));
  writeFileSync(path.join(SALIDA, "avisos.csv"), csv(avisos));
  console.log(resumen);

  if (!escribir) return;
  if (!migracionAplicada) throw new Error("Aplique primero la migración 20261029154740_procesos_disciplinarios_campos_del_excel_e_historico.sql.");

  // ── Escritura ──
  let insertados = 0;
  for (let i = 0; i < nuevos.length; i += LOTE) {
    const lote = nuevos.slice(i, i + LOTE).map(({ proceso: p, conductor: c }) => ({
      cedula: c.cedula,
      codigo: c.codigo,
      nombre: c.nombre,
      tipo: p.tipo,
      fecha_hecho: p.fecha_hecho,
      motivo: p.motivo,
      motivo_detalle: null,
      descripcion: p.descripcion,
      fecha_descargos: p.fecha_descargos,
      asistio: p.asistio,
      medida: p.medida,
      dias_suspension: p.dias_suspension,
      medida_detalle: p.medida_detalle,
      norma_incumplida: p.norma_incumplida,
      cargo: p.cargo,
      area: p.area,
      realizado_por: p.realizado_por,
      origen: "historico",
      historico_ref: p.historico_ref,
      created_by_email: AUTOR,
      created_at: `${p.fecha_hecho}T12:00:00-05:00`,
    }));
    const { error } = await db.from("procesos_disciplinarios").insert(lote);
    if (error) throw new Error(`Lote ${i / LOTE + 1}: ${error.message}`);
    insertados += lote.length;
    console.log(`  ${insertados}/${nuevos.length}`);
  }
  console.log(`Listo: ${insertados} procesos históricos cargados.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
