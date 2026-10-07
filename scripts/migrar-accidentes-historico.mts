/**
 * Carga del histórico de la Matriz de Control de Accidentes de Tráfico
 * (Excel GO-R-22, exportado a CSV) a la tabla `accidentes`, marcado con
 * origen = 'historico'. Requiere la migración
 * supabase/migrations/20261007161838_accidentes_historico_de_la_matriz_de_control.sql
 * para --escribir; el --ensayo funciona sin ella.
 *
 * Uso (desde la raíz del proyecto):
 *
 *   npx tsx --tsconfig tsconfig.json scripts/migrar-accidentes-historico.mts "<ruta>/Matriz….csv" --ensayo
 *   npx tsx --tsconfig tsconfig.json scripts/migrar-accidentes-historico.mts "<ruta>/Matriz….csv" --ensayo --equivalencias "<ruta>/conductores.csv"
 *   npx tsx --tsconfig tsconfig.json scripts/migrar-accidentes-historico.mts "<ruta>/Matriz….csv" --escribir --equivalencias "<ruta>/conductores.csv"
 *   npx tsx --tsconfig tsconfig.json scripts/migrar-accidentes-historico.mts --reversar
 *
 * --ensayo        solo lee (CSV, maestro de conductores, vehículos, catálogo y
 *                 accidentes reportados en Gestivo) y deja el informe en
 *                 <tmp>/migracion-accidentes/: resumen.txt, conductores.csv,
 *                 duplicados.csv, rechazadas.csv, avisos.csv. No escribe en la base.
 * --equivalencias el conductores.csv del ensayo revisado: la columna cedula
 *                 manda sobre el emparejamiento automático (vacía = sin cédula).
 * --escribir      inserta por lotes lo que el ensayo marcó "a cargar". Es
 *                 idempotente: las filas ya cargadas (historico_ref) se saltan.
 * --reversar      borra todos los accidentes con origen = 'historico'.
 *
 * Reglas:
 * - El conductor se busca por nombre en `conductores` (la matriz no trae
 *   cédula): exacto o probable se carga con cédula; ambiguo o sin coincidencia
 *   queda solo con el nombre de la matriz.
 * - Un accidente que también se reportó en Gestivo (mismo día y misma placa o
 *   misma cédula) no se carga: manda lo de Gestivo.
 * - Los registros llegan cerrados (estado 'aprobado'), sin evaluación ni firma.
 *
 * El informe lleva nombres y teléfonos de terceros: va a la carpeta temporal y
 * no debe copiarse al repositorio. Lee .env.local y si no existe .env.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { flagsDesdeCodigos } from "../src/lib/accidentabilidad/formato";
import {
  REF_MATRIZ,
  clave,
  crearEmparejador,
  diaColombia,
  filaConDatos,
  leerCsv,
  mapearFila,
  type AccidenteHistorico,
  type ConductorMaestro,
  type Emparejamiento,
  type Fila,
} from "../src/lib/accidentabilidad/historico";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(os.tmpdir(), "migracion-accidentes");
const LOTE = 200;

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

/** La matriz viene de Excel en Windows: Windows-1252, no UTF-8. */
function leerMatriz(ruta: string): { filas: Fila[]; numeros: number[] } {
  const buf = readFileSync(ruta);
  const texto = buf.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
    ? buf.toString("utf8").slice(1)
    : new TextDecoder("windows-1252").decode(buf);
  const crudas = leerCsv(texto);
  // Fila 1: título del formato; fila 2: encabezados.
  const iEnc = crudas.findIndex((f) => f.some((c) => clave(c) === "fecha accidente"));
  if (iEnc < 0) throw new Error("No encontré el encabezado 'Fecha Accidente' en el CSV.");
  const encabezados = crudas[iEnc].map(clave);
  const filas: Fila[] = [];
  const numeros: number[] = [];
  for (let i = iEnc + 1; i < crudas.length; i++) {
    const f: Fila = {};
    encabezados.forEach((h, j) => { if (h && !(h in f)) f[h] = crudas[i][j] ?? ""; });
    if (!filaConDatos(f)) continue;
    filas.push(f);
    numeros.push(i + 1); // número de fila tal como se ve en Excel
  }
  return { filas, numeros };
}

function leerEquivalencias(ruta: string | null): Map<string, string | null> {
  const m = new Map<string, string | null>();
  if (!ruta) return m;
  const texto = readFileSync(ruta, "utf8").replace(/^﻿/, "");
  const filas = texto.split(/\r?\n/).filter(Boolean).map((l) => l.split(";").map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"').trim()));
  const enc = filas[0].map((c) => c.toLowerCase());
  const iNombre = enc.indexOf("nombre_matriz");
  const iCedula = enc.indexOf("cedula");
  if (iNombre < 0 || iCedula < 0) throw new Error("El archivo de equivalencias necesita las columnas nombre_matriz y cedula.");
  for (const f of filas.slice(1)) if (f[iNombre]) m.set(f[iNombre], f[iCedula] || null);
  return m;
}

type Plan = {
  registro: AccidenteHistorico;
  conductor: ConductorMaestro | null;
  match: Emparejamiento["tipo"] | "equivalencia";
};

async function main() {
  const reversar = process.argv.includes("--reversar");
  const escribir = process.argv.includes("--escribir");
  const ensayo = process.argv.includes("--ensayo");
  const env = leerEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el .env.");
  }
  const db: Db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  if (reversar) {
    const { count, error } = await db.from("accidentes").delete({ count: "exact" }).eq("origen", "historico");
    if (error) throw new Error(error.message);
    console.log(`Borrados ${count ?? 0} accidentes históricos.`);
    return;
  }

  const args = process.argv.slice(2);
  const ruta = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--equivalencias");
  if (!ruta || (!ensayo && !escribir)) {
    console.log("Uso: migrar-accidentes-historico.mts <matriz.csv> --ensayo | --escribir [--equivalencias <conductores.csv>] | --reversar");
    process.exit(1);
  }
  mkdirSync(SALIDA, { recursive: true });

  // ── Lectura ──
  const { filas, numeros } = leerMatriz(ruta);
  const equivalencias = leerEquivalencias(argumento("--equivalencias"));
  const [maestro, vehiculos, factores] = await Promise.all([
    todo<ConductorMaestro>(db, "conductores", "id, cedula, nombre, codigo"),
    todo<{ codigo: string; placa: string | null }>(db, "vehiculos", "codigo, placa"),
    todo<{ codigo: string; factor_politica: string | null }>(db, "accidente_catalogos", "codigo, factor_politica", (q) => q.eq("tipo", "factor")),
  ]);
  const porCedula = new Map(maestro.map((c) => [c.cedula, c]));
  const codigosVehiculo = new Set(vehiculos.map((v) => v.codigo));
  const codigosFactor = new Set(factores.map((f) => f.codigo));
  const emparejar = crearEmparejador(maestro);

  // Lo reportado en Gestivo (para no duplicar). Antes de la migración no existe `origen`.
  type Previo = { id: string; consecutivo: number; fecha_accidente: string; conductor_cedula: string | null; vehiculo_placa?: string | null; conductor_nombre: string; origen?: string; historico_ref?: string | null };
  let migracionAplicada = true;
  let previos: Previo[];
  try {
    previos = await todo<Previo>(db, "accidentes", "id, consecutivo, fecha_accidente, conductor_cedula, conductor_nombre, vehiculo_placa, origen, historico_ref");
  } catch {
    migracionAplicada = false;
    previos = await todo<Previo>(db, "accidentes", "id, consecutivo, fecha_accidente, conductor_cedula, conductor_nombre, vehiculo_placa");
  }
  const yaCargados = new Set(previos.map((p) => p.historico_ref).filter(Boolean));
  const gestivo = previos.filter((p) => (p.origen ?? "gestivo") === "gestivo");
  const gestivoPorDia = new Map<string, Previo[]>();
  for (const p of gestivo) {
    const d = diaColombia(p.fecha_accidente);
    gestivoPorDia.set(d, [...(gestivoPorDia.get(d) ?? []), p]);
  }

  // ── Plan ──
  const rechazadas: (string | number)[][] = [["fila", "motivo"]];
  const avisos: (string | number)[][] = [["fila", "aviso"]];
  const duplicados: (string | number | null)[][] = [["fila", "fecha", "conductor_matriz", "placa", "gestivo_consecutivo", "gestivo_conductor"]];
  const planes: { fila: number; plan: Plan }[] = [];
  const porNombre = new Map<string, { veces: number; e: Emparejamiento; eq?: string | null }>();

  filas.forEach((f, i) => {
    const n = numeros[i];
    const r = mapearFila(f, n);
    if (!r.ok) { rechazadas.push([n, r.motivo]); return; }
    const a = r.registro;
    for (const av of r.avisos) avisos.push([n, av]);
    if (a.vehiculo_codigo && !codigosVehiculo.has(a.vehiculo_codigo)) avisos.push([n, `N.º interno ${a.vehiculo_codigo} no está en vehículos`]);
    for (const c of a.factores_codigos) if (!codigosFactor.has(c)) avisos.push([n, `Código ${c} no está en el catálogo de factores`]);

    const e = emparejar(a.conductor_nombre_matriz);
    const info = porNombre.get(a.conductor_nombre_matriz) ?? { veces: 0, e };
    info.veces++;
    porNombre.set(a.conductor_nombre_matriz, info);

    let conductor: ConductorMaestro | null = e.tipo === "exacto" || e.tipo === "probable" ? e.conductor : null;
    let match: Plan["match"] = e.tipo;
    if (equivalencias.has(a.conductor_nombre_matriz)) {
      const ced = equivalencias.get(a.conductor_nombre_matriz);
      conductor = ced ? porCedula.get(ced) ?? null : null;
      if (ced && !conductor) avisos.push([n, `Cédula ${ced} de equivalencias no está en el maestro`]);
      match = "equivalencia";
      info.eq = ced;
    }

    const dia = diaColombia(a.fecha_accidente);
    const dup = (gestivoPorDia.get(dia) ?? []).find(
      (p) => (a.vehiculo_placa && p.vehiculo_placa === a.vehiculo_placa) || (conductor && p.conductor_cedula === conductor.cedula)
    );
    if (dup) {
      duplicados.push([n, dia, a.conductor_nombre_matriz, a.vehiculo_placa, dup.consecutivo, dup.conductor_nombre]);
      return;
    }
    planes.push({ fila: n, plan: { registro: a, conductor, match } });
  });

  const nuevos = planes.filter((p) => !yaCargados.has(p.plan.registro.historico_ref));

  // ── Informe ──
  const conductoresCsv: (string | number | null)[][] = [["nombre_matriz", "veces", "resultado", "cedula", "nombre_maestro", "candidatos"]];
  for (const [nombre, { veces, e, eq }] of [...porNombre].sort((a, b) => b[1].veces - a[1].veces)) {
    const c = eq !== undefined ? (eq ? porCedula.get(eq) ?? null : null) : e.tipo === "exacto" || e.tipo === "probable" ? e.conductor : null;
    const candidatos = e.tipo === "ambiguo" ? e.candidatos.map((x) => `${x.cedula} ${x.nombre}`).join(" | ") : "";
    conductoresCsv.push([nombre, veces, eq !== undefined ? "equivalencia" : e.tipo, c?.cedula ?? eq ?? "", c?.nombre ?? "", candidatos]);
  }
  const cuenta = (t: string) => [...porNombre.values()].filter((x) => (x.eq !== undefined ? "equivalencia" : x.e.tipo) === t);
  const accidentesCon = (t: string) => cuenta(t).reduce((s, x) => s + x.veces, 0);
  const conCedula = planes.filter((p) => p.plan.conductor).length;
  const anios = new Map<string, number>();
  for (const { plan } of planes) anios.set(plan.registro.fecha_accidente.slice(0, 4), (anios.get(plan.registro.fecha_accidente.slice(0, 4)) ?? 0) + 1);
  const fechas = planes.map((p) => p.plan.registro.fecha_accidente).sort();

  const resumen = [
    `Migración del histórico de accidentes (${REF_MATRIZ}) — ${escribir ? "ESCRITURA" : "ENSAYO (no escribe)"}`,
    `Archivo: ${ruta}`,
    `Migración de base aplicada: ${migracionAplicada ? "sí" : "NO (aplíquela antes de --escribir)"}`,
    "",
    `Filas con datos en la matriz:     ${filas.length}`,
    `  Rechazadas:                      ${rechazadas.length - 1}`,
    `  Ya reportadas en Gestivo:        ${duplicados.length - 1}  (se conserva lo de Gestivo)`,
    `  A cargar:                        ${planes.length}  (${fechas[0]?.slice(0, 10)} a ${fechas.at(-1)?.slice(0, 10)})`,
    ...[...anios].sort().map(([a, n]) => `    ${a}: ${n}`),
    `  Ya cargadas antes (se saltan):   ${planes.length - nuevos.length}`,
    "",
    `Conductores distintos en la matriz: ${porNombre.size}`,
    `  Coincidencia exacta:   ${cuenta("exacto").length} conductores (${accidentesCon("exacto")} accidentes)`,
    `  Probable (revisar):    ${cuenta("probable").length} conductores (${accidentesCon("probable")} accidentes)`,
    `  Por equivalencias:     ${cuenta("equivalencia").length} conductores (${accidentesCon("equivalencia")} accidentes)`,
    `  Ambiguos:              ${cuenta("ambiguo").length} conductores (${accidentesCon("ambiguo")} accidentes)`,
    `  Sin coincidencia:      ${cuenta("ninguno").length} conductores (${accidentesCon("ninguno")} accidentes)`,
    `  Accidentes a cargar con cédula: ${conCedula} de ${planes.length} (${planes.length ? Math.round((conCedula / planes.length) * 100) : 0} %)`,
    "",
    `Clase: ${["simple", "lesionado", "muerto"].map((c) => `${c} ${planes.filter((p) => p.plan.registro.clase_accidente === c).length}`).join(", ")}`,
    `Con vehículo del tercero: ${planes.filter((p) => p.plan.registro.tercero).length}; con lesionado/víctima: ${planes.filter((p) => p.plan.registro.victima).length}`,
    `Avisos: ${avisos.length - 1} (ver avisos.csv)`,
    "",
    `Informe en ${SALIDA}`,
    "  conductores.csv  → revise 'probable', 'ambiguo' y 'ninguno'; corrija la columna cedula y",
    "                     páselo con --equivalencias (cedula vacía = cargar sin cédula).",
  ].join("\n");

  writeFileSync(path.join(SALIDA, "resumen.txt"), resumen + "\n");
  writeFileSync(path.join(SALIDA, "conductores.csv"), csv(conductoresCsv));
  writeFileSync(path.join(SALIDA, "duplicados.csv"), csv(duplicados));
  writeFileSync(path.join(SALIDA, "rechazadas.csv"), csv(rechazadas));
  writeFileSync(path.join(SALIDA, "avisos.csv"), csv(avisos));
  console.log(resumen);

  if (!escribir) return;
  if (!migracionAplicada) throw new Error("Aplique primero la migración 20261007161838_accidentes_historico_de_la_matriz_de_control.sql.");

  // ── Escritura ──
  let insertados = 0;
  for (let i = 0; i < nuevos.length; i += LOTE) {
    const lote = nuevos.slice(i, i + LOTE).map((x) => x.plan);
    const filasAcc = lote.map(({ registro: a, conductor: c }) => {
      const flags = flagsDesdeCodigos(a.factores_codigos, factores as never, false);
      return {
        origen: "historico",
        historico_ref: a.historico_ref,
        historico_datos: a.historico_datos,
        estado: "aprobado",
        conductor_id: c?.id ?? null,
        conductor_cedula: c?.cedula ?? null,
        conductor_nombre: c?.nombre ?? a.conductor_nombre_matriz,
        conductor_codigo: c?.codigo ?? null,
        fecha_accidente: a.fecha_accidente,
        created_at: a.fecha_accidente,
        direccion_accidente: a.direccion_accidente,
        resumen_hechos: `Registro histórico importado de la Matriz de Control de Accidentes de Tráfico (${REF_MATRIZ}).`,
        ciudad: a.ciudad,
        clase_accidente: a.clase_accidente,
        lesionados: a.lesionados,
        tiene_ipat: a.tiene_ipat,
        ipat_numero: a.ipat_numero,
        transaccion: a.transaccion,
        hubo_arreglo: a.transaccion === true,
        vehiculo_empresa: a.vehiculo_empresa,
        vehiculo_afiliado: a.vehiculo_afiliado,
        vehiculo_codigo: a.vehiculo_codigo,
        vehiculo_placa: a.vehiculo_placa,
        vehiculo_ruta: a.vehiculo_ruta,
        inmovilizacion: a.inmovilizacion,
        solicito_aseguradora: a.solicito_aseguradora,
        aseguradora_reporte_numero: a.aseguradora_reporte_numero,
        responsabilidad_reportada: a.responsabilidad_reportada,
        factores_codigos: a.factores_codigos,
        fact_exceso_velocidad: flags.exceso_velocidad,
        fact_no_distancia: flags.no_guardar_distancia,
        fact_fatiga: flags.fatiga_comprobada,
        agente_nombre: a.agente_nombre,
        funcionario_atendio: a.funcionario_atendio,
        costo_reparacion: a.costo_reparacion,
        cobro_conductor: a.cobro_conductor,
        cobro_tercero: a.cobro_tercero,
        caso_estado: a.caso_estado,
        seguimiento_lesionados: a.seguimiento_lesionados,
        tiene_peaton: a.victima?.condicion === "peaton",
      };
    });
    const { data, error } = await db.from("accidentes").insert(filasAcc).select("id, historico_ref");
    if (error) throw new Error(`Lote ${i / LOTE + 1}: ${error.message}`);
    const idPorRef = new Map((data ?? []).map((d) => [d.historico_ref as string, d.id as string]));

    const terceros = lote.filter((p) => p.registro.tercero).map(({ registro: a }) => ({
      accidente_id: idPorRef.get(a.historico_ref), es_propio: false, ...a.tercero,
    }));
    const victimas = lote.filter((p) => p.registro.victima).map(({ registro: a }) => ({
      accidente_id: idPorRef.get(a.historico_ref), ...a.victima,
    }));
    const eventos = lote.map(({ registro: a }) => ({
      accidente_id: idPorRef.get(a.historico_ref),
      tipo: "creado",
      comentario: `Importado de la matriz ${a.historico_ref}`,
      created_at: a.fecha_accidente,
    }));
    for (const [tabla, filasT] of [["accidente_vehiculos", terceros], ["accidente_victimas", victimas], ["accidente_eventos", eventos]] as const) {
      if (filasT.length === 0) continue;
      const { error: e } = await db.from(tabla).insert(filasT);
      if (e) throw new Error(`Lote ${i / LOTE + 1}, ${tabla}: ${e.message}`);
    }
    insertados += lote.length;
    console.log(`  ${insertados}/${nuevos.length}`);
  }
  console.log(`Listo: ${insertados} accidentes históricos cargados.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
