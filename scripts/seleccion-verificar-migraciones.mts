// ¿Qué migraciones de Selección están aplicadas en la base? (25-nov-2026)
//
// Las migraciones se aplican a mano en el SQL Editor y no hay tabla que registre
// cuáles se corrieron (docs/migraciones.md). Este script lo deduce: lee cada
// archivo de supabase/migrations desde la entrega 1 de Selección, saca lo que
// crea (tablas, columnas, ajustes y mensajes sembrados) y pregunta a la base si
// existe. SOLO LEE: no escribe nada.
//
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-verificar-migraciones.mts
//   npx tsx --env-file=.env.produccion --tsconfig tsconfig.json scripts/seleccion-verificar-migraciones.mts
//   … [--desde=20261120] [--todas]   (--todas: también las que no son de selección)
//
// «Aplicada»: todo lo que crea existe. «Falta»: no existe nada. «A medias»: existe
// una parte (se aplicó incompleta, o otra migración posterior quitó algo).
// «Sin huella»: solo cambia datos o funciones; hay que mirarla a mano.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";

const DIR = join(process.cwd(), "supabase", "migrations");
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const DESDE = arg("desde") ?? "20261113";
const TODAS = process.argv.includes("--todas");
const db = createAdminClient();

interface Huella {
  tablas: string[];
  columnas: [string, string][];
  ajustes: string[];
  mensajes: string[];
}

/** Lo que el SQL crea. Lo que una migración posterior quitó no cuenta (se pasa en `quitado`). */
function huellaDe(sql: string): Huella {
  const sinComentarios = sql.replace(/--[^\n]*/g, "");
  const tablas = [...sinComentarios.matchAll(/CREATE TABLE IF NOT EXISTS\s+(?:public\.)?(\w+)/gi)].map((m) => m[1]);
  const columnas: [string, string][] = [];
  for (const m of sinComentarios.matchAll(/ALTER TABLE\s+(?:IF EXISTS\s+)?(?:public\.)?(\w+)([^;]*);/gi)) {
    for (const c of m[2].matchAll(/ADD COLUMN IF NOT EXISTS\s+(\w+)/gi)) columnas.push([m[1], c[1]]);
  }
  const sembrados = (tabla: string) => {
    const out: string[] = [];
    for (const m of sinComentarios.matchAll(new RegExp(`INSERT INTO\\s+(?:public\\.)?${tabla}\\s*\\(\\s*clave[^)]*\\)([\\s\\S]*?)(?:ON CONFLICT|;)`, "gi"))) {
      // La clave es el primer texto de cada fila: tras «(» al inicio de la fila, o tras «VALUES».
      for (const c of m[1].matchAll(/(?:^|[\n,]|VALUES)\s*\(\s*'([a-z0-9_]+)'/gi)) out.push(c[1]);
    }
    return [...new Set(out)];
  };
  return { tablas: [...new Set(tablas)], columnas, ajustes: sembrados("seleccion_ajustes"), mensajes: sembrados("seleccion_mensajes") };
}

const existe = new Map<string, Promise<boolean>>();
function hay(clave: string, consulta: () => PromiseLike<{ error: unknown; data?: unknown }>, conDatos = false): Promise<boolean> {
  if (!existe.has(clave)) {
    existe.set(
      clave,
      Promise.resolve(consulta()).then(
        (r) => !r.error && (!conDatos || (Array.isArray(r.data) && r.data.length > 0)),
        () => false
      )
    );
  }
  return existe.get(clave)!;
}
// Sin `head`: en una petición HEAD el error llega sin cuerpo y una tabla que no existe parecía existir.
const hayTabla = (t: string) => hay(`t:${t}`, () => db.from(t).select("*").limit(1));
const hayColumna = (t: string, c: string) => hay(`c:${t}.${c}`, () => db.from(t).select(c).limit(1));
const hayAjuste = (k: string) => hay(`a:${k}`, () => db.from("seleccion_ajustes").select("clave").eq("clave", k).limit(1), true);
const hayMensaje = (k: string) => hay(`m:${k}`, () => db.from("seleccion_mensajes").select("clave").eq("clave", k).limit(1), true);

const archivos = readdirSync(DIR)
  .filter((f) => /^\d{14}_.+\.sql$/.test(f) && f.slice(0, DESDE.length) >= DESDE)
  .filter((f) => TODAS || /seleccion|agente|asistente|seguimiento|ia_por_separado|psicosensotecnica|alertas_por_correo/.test(f))
  .sort();

// Lo que una migración posterior quita a propósito (la prueba psicosensotécnica propia, 24-nov-2026).
const QUITADO = new Set(["m:recordatorio_psicotecnica", "t:psico_intentos", "t:psico_baterias", "t:psico_resultados"]);

const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
console.log(`Base: ${url.replace(/^https?:\/\//, "")}${process.env.GESTIVO_ENTORNO === "desarrollo" ? " (desarrollo)" : ""}`);
console.log(`Migraciones revisadas: ${archivos.length} (desde ${DESDE}${TODAS ? ", todas" : ", las de selección"})\n`);

const cuenta = { aplicada: 0, falta: 0, medias: 0, sinHuella: 0 };
const faltan: string[] = [];
for (const f of archivos) {
  const h = huellaDe(readFileSync(join(DIR, f), "utf8"));
  const pruebas: [string, Promise<boolean>][] = [
    ...h.tablas.map((t): [string, Promise<boolean>] => [`t:${t}`, hayTabla(t)]),
    ...h.columnas.map(([t, c]): [string, Promise<boolean>] => [`c:${t}.${c}`, hayColumna(t, c)]),
    ...h.ajustes.map((k): [string, Promise<boolean>] => [`a:${k}`, hayAjuste(k)]),
    ...h.mensajes.map((k): [string, Promise<boolean>] => [`m:${k}`, hayMensaje(k)]),
  ].filter(([k]) => !QUITADO.has(k));
  if (!pruebas.length) {
    cuenta.sinHuella++;
    console.log(`  ·  ${f}  — sin huella (solo cambia datos o funciones): revisar a mano`);
    continue;
  }
  const res = await Promise.all(pruebas.map(async ([k, p]) => [k, await p] as const));
  const no = res.filter(([, ok]) => !ok).map(([k]) => k.slice(2));
  if (!no.length) {
    cuenta.aplicada++;
    console.log(`  ✔  ${f}`);
  } else if (no.length === res.length) {
    cuenta.falta++;
    faltan.push(f);
    console.log(`  ✘  ${f}  — FALTA (${res.length} ${res.length === 1 ? "cosa" : "cosas"} que crea no ${res.length === 1 ? "existe" : "existen"})`);
  } else {
    cuenta.medias++;
    faltan.push(f);
    console.log(`  ◐  ${f}  — a medias; no existe: ${no.slice(0, 6).join(", ")}${no.length > 6 ? `… (+${no.length - 6})` : ""}`);
  }
}

console.log(`\nAplicadas ${cuenta.aplicada} · faltan ${cuenta.falta} · a medias ${cuenta.medias} · sin huella ${cuenta.sinHuella}.`);
if (faltan.length) {
  console.log("\nPor aplicar, en este orden (SQL Editor, cada archivo entero):");
  for (const f of faltan) console.log(`  supabase/migrations/${f}`);
  process.exitCode = 1;
}
