/**
 * Carga del histórico del Excel de SST «INFORMACION ACCIDENTES DE TRABAJO»
 * (hojas «Consolidado AAAA») a `sst_accidentes_trabajo`, con origen =
 * 'historico'. Requiere la migración 20261029231220_sst_accidentes_de_trabajo.sql
 * para --escribir; el --ensayo funciona sin ella.
 *
 * Uso (desde la raíz del proyecto):
 *
 *   npm run sst:historico -- "<ruta>/INFORMACION ACCIDENTES DE TRABAJO.xlsx" --ensayo
 *   npm run sst:historico -- "<ruta>/INFORMACION ACCIDENTES DE TRABAJO.xlsx" --escribir
 *   npm run sst:historico -- --reversar
 *
 * --ensayo    solo lee (Excel y maestros) y escribe el informe en
 *             <tmp>/migracion-sst/: resumen.txt, rechazadas.csv, avisos.csv.
 * --escribir  inserta lo que el ensayo da por bueno. Idempotente: una fila ya
 *             cargada (historico_ref = «hoja:fila») o un caso del año que ya
 *             existe se salta.
 * --reversar  borra los accidentes con origen = 'historico'.
 *
 * La pestaña de caracterización NO se importa: la calcula el módulo de los
 * registros. El informe compara los conteos.
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
import { filasDeHoja, mapearFilaAt } from "../src/lib/sst/historico";
import { caracterizar, type Conteo } from "../src/lib/sst/reglas";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(os.tmpdir(), "migracion-sst");
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

async function cedulasDe(db: Db, tabla: string, col: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (let a = 0; ; a += 1000) {
    const { data, error } = await db.from(tabla).select(col).order(col).range(a, a + 999);
    if (error) return out;
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) if (r[col]) out.add(String(r[col]));
    if (!data || data.length < 1000) return out;
  }
}

const lineas = (titulo: string, datos: Conteo[]) => [`${titulo}:`, ...datos.filter((d) => d.n > 0).map((d) => `    ${String(d.n).padStart(3)}  ${d.label}`)];

async function main() {
  const reversar = process.argv.includes("--reversar");
  const escribir = process.argv.includes("--escribir");
  const ensayo = process.argv.includes("--ensayo");
  const env = leerEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el .env.");
  const db: Db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  if (reversar) {
    const { count, error } = await db.from("sst_accidentes_trabajo").delete({ count: "exact" }).eq("origen", "historico");
    if (error) throw new Error(error.message);
    console.log(`Borrados ${count ?? 0} accidentes de trabajo históricos.`);
    return;
  }

  const ruta = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!ruta || (!ensayo && !escribir)) {
    console.log("Uso: migrar-sst-accidentes-trabajo.mts <excel.xlsx> --ensayo | --escribir | --reversar");
    process.exit(1);
  }
  mkdirSync(SALIDA, { recursive: true });

  const libro = XLSX.read(readFileSync(ruta), { type: "buffer" });
  const hojas = libro.SheetNames.filter((n) => /^consolidado/i.test(n.trim()));
  if (hojas.length === 0) throw new Error(`El libro no tiene hojas «Consolidado» (tiene: ${libro.SheetNames.join(", ")}).`);

  const rechazadas: (string | number)[][] = [["hoja", "fila", "motivo"]];
  const avisos: (string | number)[][] = [["hoja", "fila", "caso", "aviso"]];
  const buenas: Exclude<ReturnType<typeof mapearFilaAt>, { ok: false }>[] = [];
  let filasTotal = 0;
  for (const h of hojas) {
    const crudas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[h], { header: 1, raw: true, defval: null, blankrows: true });
    for (const f of filasDeHoja(h.trim(), crudas)) {
      filasTotal++;
      const r = mapearFilaAt(f);
      if (!r.ok) {
        rechazadas.push([f.hoja, f.fila, r.error]);
        continue;
      }
      for (const a of r.avisos) avisos.push([f.hoja, f.fila, r.caso, a]);
      buenas.push(r);
    }
  }
  // Casos repetidos dentro del mismo año en el Excel.
  const vistos = new Set<string>();
  const unicas = buenas.filter((r) => {
    const k = `${r.anio}|${r.caso}`;
    if (vistos.has(k)) {
      rechazadas.push([r.historicoRef.split(":")[0], Number(r.historicoRef.split(":")[1]), `caso ${r.anio}-${r.caso} repetido en el Excel`]);
      return false;
    }
    vistos.add(k);
    return true;
  });

  // Ya cargados (antes de la migración la tabla no existe).
  let migracionAplicada = true;
  const yaRef = new Set<string>();
  const yaCaso = new Set<string>();
  {
    const { data, error } = await db.from("sst_accidentes_trabajo").select("anio, caso, historico_ref").is("anulado_en", null);
    if (error) migracionAplicada = false;
    for (const r of (data ?? []) as { anio: number; caso: number; historico_ref: string | null }[]) {
      if (r.historico_ref) yaRef.add(r.historico_ref);
      yaCaso.add(`${r.anio}|${r.caso}`);
    }
  }
  const nuevas = unicas.filter((r) => !yaRef.has(r.historicoRef) && !yaCaso.has(`${r.anio}|${r.caso}`));

  // Cédulas que no están en los maestros (solo informativo: se cargan igual).
  const [cond, emp] = await Promise.all([cedulasDe(db, "conductores", "cedula"), cedulasDe(db, "employees", "document_number")]);
  const sinMaestro = unicas.filter((r) => r.datos.cedula && !cond.has(r.datos.cedula) && !emp.has(r.datos.cedula));

  const c = caracterizar(unicas.map((r) => r.datos));
  const resumen = [
    `Carga del histórico de accidentes de trabajo (SST) — ${escribir ? "ESCRITURA" : "ENSAYO (no escribe)"}`,
    `Archivo: ${ruta}`,
    `Hojas: ${hojas.join(", ")}`,
    `Migración de base aplicada: ${migracionAplicada ? "sí" : "NO (aplíquela antes de --escribir)"}`,
    "",
    `Filas con caso en el Excel: ${filasTotal}`,
    `A cargar: ${unicas.length} (${nuevas.length} nuevos, ${unicas.length - nuevas.length} ya estaban)`,
    `Rechazadas: ${rechazadas.length - 1}`,
    `Avisos: ${avisos.length - 1}`,
    `Cédulas que no están en conductores ni empleados: ${sinMaestro.length}${sinMaestro.length ? ` (${sinMaestro.map((r) => `${r.datos.nombre} ${r.datos.cedula}`).join("; ")})` : ""}`,
    "",
    `Caracterización calculada (compárela con la pestaña «Carac.» del Excel):`,
    `  Total ${c.total} · días de incapacidad ${c.diasIncapacidad} · de tránsito ${c.transito} · trabajadores ${c.trabajadores}`,
    ...lineas("  Por mes", c.porMes),
    ...lineas("  Tipo de lesión", c.porTipoLesion),
    ...lineas("  Parte del cuerpo", c.porParteCuerpo),
    ...lineas("  Mecanismo", c.porMecanismo),
    ...lineas("  Agente", c.porAgente),
    ...lineas("  Día", c.porDia),
    "",
    `Informe en: ${SALIDA}`,
  ].join("\n");
  writeFileSync(path.join(SALIDA, "resumen.txt"), resumen + "\n");
  writeFileSync(path.join(SALIDA, "rechazadas.csv"), csv(rechazadas));
  writeFileSync(path.join(SALIDA, "avisos.csv"), csv(avisos));
  console.log(resumen);

  if (!escribir) return;
  if (!migracionAplicada) throw new Error("Aplique primero la migración 20261029231220_sst_accidentes_de_trabajo.sql.");

  const filas = nuevas.map((r) => ({
    anio: r.anio,
    caso: r.caso,
    fecha_at: r.datos.fechaAt,
    hora: r.datos.hora,
    fecha_notificacion: r.datos.fechaNotificacion,
    cedula: r.datos.cedula,
    nombre: r.datos.nombre,
    cargo: r.datos.cargo,
    empresa_usuaria: r.datos.empresaUsuaria,
    ciudad: r.datos.ciudad,
    sexo: r.datos.sexo,
    tipo_lesion: r.datos.tipoLesion,
    parte_cuerpo: r.datos.parteCuerpo,
    parte_cuerpo_grupo: r.datos.parteCuerpoGrupo,
    mecanismo: r.datos.mecanismo,
    agente: r.datos.agente,
    descripcion: r.datos.descripcion,
    accidente_transito: r.datos.accidenteTransito,
    dias_incapacidad: r.datos.diasIncapacidad,
    estado_investigacion: r.datos.estadoInvestigacion,
    cierre_administrativo_arl: r.datos.cierreAdministrativoArl,
    origen: "historico",
    historico_ref: r.historicoRef,
    created_by_email: AUTOR,
  }));
  if (filas.length) {
    const { error } = await db.from("sst_accidentes_trabajo").insert(filas);
    if (error) throw new Error(error.message);
  }
  console.log(`Listo: ${filas.length} accidentes de trabajo cargados.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
