import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function leerEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const a of [".env", ".env.local"]) {
    if (!fs.existsSync(a)) continue;
    for (const l of fs.readFileSync(a, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim());
      if (m && m[2]) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  return env;
}
const env = leerEnv();
const U = env.NEXT_PUBLIC_SUPABASE_URL!, K = env.SUPABASE_SERVICE_ROLE_KEY!;
async function todo<T>(t: string, c: string): Promise<T[]> {
  const out: T[] = [];
  for (let d = 0; ; d += 1000) {
    const r = await fetch(`${U}/rest/v1/${t}?select=${c}&limit=1000&offset=${d}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } });
    const lote = (await r.json()) as T[];
    out.push(...lote);
    if (lote.length < 1000) break;
  }
  return out;
}
const tok = (s?: string | null) =>
  !s ? [] : s.replace(/[Ññ]/g, "N").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
const clave = (s?: string | null) => tok(s).sort().join(" ");

const zk = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "gestivo-biometrico", "zk.json"), "utf8"));
const marcas = new Map<string, number>(zk.marcas.map((m: any) => [String(m.pin), m.n]));

// 1. Mismo nombre completo con dos badges distintos en el biometrico
const porNombre = new Map<string, any[]>();
for (const p of zk.personas) {
  const k = clave(`${p.name ?? ""} ${p.lastname ?? ""}`);
  if (!k) continue;
  if (!porNombre.has(k)) porNombre.set(k, []);
  porNombre.get(k)!.push(p);
}
const dupExactos = [...porNombre.values()].filter((v) => v.length > 1);

// 2. Apellidos iguales y el primer nombre de uno contenido en el otro
//    (LUIS CAMARGO MONTENEGRO vs LUIS ENRIQUE CAMARGO MONTENEGRO)
const dupSubconjunto: any[][] = [];
const personas = zk.personas.filter((p: any) => tok(p.lastname).length && tok(p.name).length);
for (let i = 0; i < personas.length; i++) {
  for (let j = i + 1; j < personas.length; j++) {
    const a = personas[i], b = personas[j];
    if (clave(a.lastname) !== clave(b.lastname)) continue;
    const na = tok(a.name), nb = tok(b.name);
    if (na[0] !== nb[0]) continue;
    if (clave(`${a.name} ${a.lastname}`) === clave(`${b.name} ${b.lastname}`)) continue; // ya en dupExactos
    const sa = new Set(na), sb = new Set(nb);
    const aEnB = na.every((t) => sb.has(t)), bEnA = nb.every((t) => sa.has(t));
    if (aEnB || bEnA) dupSubconjunto.push([a, b]);
  }
}

// 3. Maestro de Gestivo
const cond = await todo<any>("conductores", "cedula,nombre,estado");
const emp = await todo<any>("employees", "document_number,full_name,status");
const cedCond = new Set(cond.map((c) => String(c.cedula)));
const enAmbos = emp.filter((e) => e.document_number && cedCond.has(String(e.document_number)));
const nombresCond = new Map<string, any[]>();
for (const c of cond) {
  const k = clave(c.nombre);
  if (!k) continue;
  if (!nombresCond.has(k)) nombresCond.set(k, []);
  nombresCond.get(k)!.push(c);
}
const condMismoNombre = [...nombresCond.values()].filter((v) => v.length > 1);

const marc = (p: any) => marcas.get(String(p.Badgenumber)) ?? 0;

console.log(`=== 1. BIOMETRICO: mismo nombre exacto, dos badges (${dupExactos.length}) ===`);
for (const g of dupExactos) console.log("  " + g.map((p: any) => `badge ${p.Badgenumber} (${marc(p)} marc.)`).join("  +  ") + `  -> ${g[0].name} ${g[0].lastname}`);

console.log(`\n=== 2. BIOMETRICO: mismos apellidos, nombre de pila contenido (${dupSubconjunto.length}) ===`);
for (const [a, b] of dupSubconjunto) console.log(`  badge ${a.Badgenumber} '${a.name} ${a.lastname}' (${marc(a)} marc.)  +  badge ${b.Badgenumber} '${b.name} ${b.lastname}' (${marc(b)} marc.)`);

console.log(`\n=== 3. GESTIVO: misma cedula en conductores y employees (${enAmbos.length}) ===`);
for (const e of enAmbos.slice(0, 12)) console.log(`  ${e.document_number}  ${e.full_name} [${e.status}]`);
if (enAmbos.length > 12) console.log(`  ... y ${enAmbos.length - 12} mas`);

console.log(`\n=== 4. GESTIVO: conductores con el mismo nombre (${condMismoNombre.length}) ===`);
for (const g of condMismoNombre.slice(0, 12)) console.log("  " + g.map((c: any) => `${c.cedula} [${c.estado}]`).join("  +  ") + `  -> ${g[0].nombre}`);
if (condMismoNombre.length > 12) console.log(`  ... y ${condMismoNombre.length - 12} mas`);
