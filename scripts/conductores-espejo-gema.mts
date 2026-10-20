/**
 * Ensayo del sync ESPEJO de conductores: qué insertaría, qué actualizaría y
 * qué borraría si `conductores` fuera un espejo exacto de GEMA.
 *
 *   npm run conductores:espejo              # ensayo, no escribe nada
 *   npm run conductores:espejo -- --aplicar # borra las que GEMA no tiene
 *
 * Solo el borrado necesita `--aplicar`: insertar y actualizar ya lo hace el
 * cron (`syncConductores`). Esto cierra la parte que falta.
 *
 * ## Guardas, porque un borrado mal hecho vacía el maestro
 *
 *   1. Si la vista de GEMA devuelve menos del `MINIMO_RAZONABLE` de lo que hay
 *      en Gestivo, se rechaza sin borrar nada: es señal de que la consulta
 *      falló a medias, no de que se fueron 500 conductores.
 *   2. Hay TRES claves foráneas a `conductores` —`accidentes.conductor_id`,
 *      `mantenimiento_reportes.cedula_conductor` (NOT NULL) y
 *      `revision_preoperacional.cedula_conductor`—. Una ficha referenciada NO
 *      se borra: se informa, porque borrarla rompería ese historial.
 *   3. Nunca borra más del `MAXIMO_BORRADO` de la tabla de una vez.
 */
import { leerEnv } from "./biometrico-comun.mjs";

const env = leerEnv();
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;

const { queryView, closeGemaPool } = await import("../src/lib/gema/client");

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const LLAVE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !LLAVE) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

/** Si GEMA trae menos de esta parte de lo que hay guardado, no se borra nada. */
const MINIMO_RAZONABLE = 0.9;
/** Ni se borra más de esta parte de la tabla en una corrida. */
const MAXIMO_BORRADO = 0.1;

const APLICAR = process.argv.includes("--aplicar");

async function todas<T>(consulta: string): Promise<T[]> {
  const filas: T[] = [];
  const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    const r = await fetch(`${URL_BASE}/rest/v1/${consulta}`, {
      headers: {
        apikey: LLAVE,
        Authorization: `Bearer ${LLAVE}`,
        Range: `${desde}-${desde + paso - 1}`,
        "Range-Unit": "items",
      },
    });
    if (!r.ok) throw new Error(`${consulta}: ${r.status} ${await r.text()}`);
    const lote = (await r.json()) as T[];
    filas.push(...lote);
    if (lote.length < paso) break;
  }
  return filas;
}

/**
 * Como `todas`, pero para las tablas que referencian a `conductores`: si una no
 * existe en esta instalación, se dice y se sigue. Lo que NO se puede es tratar
 * un error como «no hay referencias»: se borraría una ficha con historial.
 */
async function referencias<T>(tabla: string, consulta: string): Promise<T[] | null> {
  try {
    return await todas<T>(consulta);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/PGRST205|Could not find the table/.test(msg)) {
      console.log(`  ${tabla}: no existe en esta instalación, se omite.`);
      return [];
    }
    console.log(`  ${tabla}: NO SE PUDO REVISAR -> ${msg.slice(0, 120)}`);
    return null;
  }
}

/** Misma normalización de cédula que `toCedula` del sync. */
function aCedula(v: unknown): string | null {
  const s = String(v ?? "").replace(/\D/g, "");
  return s.length > 0 ? s : null;
}

// ── Lo que tiene GEMA ──────────────────────────────────────────────────────
console.log("Leyendo vst_ext_get_conductores de GEMA…");
const crudo = await queryView("vst_ext_get_conductores");
const enGema = new Map<string, Record<string, unknown>>();
let sinCedula = 0;
for (const r of crudo) {
  const c = aCedula(r.identificacion);
  if (!c) {
    sinCedula++;
    continue;
  }
  enGema.set(c, r);
}
await closeGemaPool();

console.log(`  filas en la vista: ${crudo.length}`);
console.log(`  cédulas distintas: ${enGema.size}${sinCedula ? ` · sin cédula: ${sinCedula}` : ""}`);
console.log(`  repetidas en el origen: ${crudo.length - sinCedula - enGema.size}`);

// ── Lo que tiene Gestivo ───────────────────────────────────────────────────
interface Fila {
  id: string;
  cedula: string;
  nombre: string | null;
  estado: string | null;
  codigo: string | null;
  fecha_retiro: string | null;
  observacion: string | null;
  created_at: string | null;
  solo_informativo: boolean | null;
}
const enGestivo = await todas<Fila>(
  "conductores?select=id,cedula,nombre,estado,codigo,fecha_retiro,observacion,created_at,solo_informativo"
);
console.log(`\nEn Gestivo: ${enGestivo.length} conductores`);

const sobran = enGestivo.filter((c) => !enGema.has(String(c.cedula).trim()));
const faltan = [...enGema.keys()].filter(
  (c) => !enGestivo.some((g) => String(g.cedula).trim() === c)
);

console.log(`  GEMA no las tiene (candidatas a BORRAR): ${sobran.length}`);
console.log(`  en GEMA y no en Gestivo (a INSERTAR):    ${faltan.length}`);
console.log(`  en las dos (a ACTUALIZAR):               ${enGestivo.length - sobran.length}`);

// ── Guarda 1: la vista no vino a medias ────────────────────────────────────
if (enGema.size < enGestivo.length * MINIMO_RAZONABLE) {
  console.log("");
  console.log(
    `RECHAZADO: GEMA trajo ${enGema.size} y en Gestivo hay ${enGestivo.length} ` +
      `(menos del ${Math.round(MINIMO_RAZONABLE * 100)} %).`
  );
  console.log("Eso parece una consulta que falló a medias, no una baja masiva. No se borra nada.");
  process.exit(1);
}

if (sobran.length === 0) {
  console.log("\nNada que borrar: Gestivo ya es un espejo de GEMA.");
  process.exit(0);
}

// ── Guarda 2: quién está referenciado ──────────────────────────────────────
console.log("\nRevisando referencias de las que sobran…");
const cedulas = sobran.map((c) => String(c.cedula).trim());
const ids = sobran.map((c) => c.id);
const lista = (xs: string[]) => `(${xs.map((x) => `"${x}"`).join(",")})`;

const [accidentes, mantenimiento, preoperacional] = await Promise.all([
  referencias<{ conductor_id: string }>(
    "accidentes",
    `accidentes?select=conductor_id&conductor_id=in.${lista(ids)}`
  ),
  referencias<{ cedula_conductor: string }>(
    "mantenimiento_reportes",
    `mantenimiento_reportes?select=cedula_conductor&cedula_conductor=in.${lista(cedulas)}`
  ),
  referencias<{ cedula_conductor: string }>(
    "revision_preoperacional",
    `revision_preoperacional?select=cedula_conductor&cedula_conductor=in.${lista(cedulas)}`
  ),
]);

// Si una revisión falló de verdad, no se puede saber qué es seguro borrar.
if (accidentes === null || mantenimiento === null || preoperacional === null) {
  console.log("");
  console.log("RECHAZADO: no se pudo revisar alguna tabla que referencia a conductores.");
  console.log("Sin eso, borrar podría romper un historial. No se borró nada.");
  process.exit(1);
}

const referenciadas = new Map<string, string[]>();
const anotar = (cedula: string, donde: string) => {
  const ya = referenciadas.get(cedula);
  if (ya) {
    if (!ya.includes(donde)) ya.push(donde);
  } else referenciadas.set(cedula, [donde]);
};
for (const a of accidentes) {
  const c = sobran.find((s) => s.id === a.conductor_id);
  if (c) anotar(String(c.cedula).trim(), "accidentes");
}
for (const m of mantenimiento) anotar(String(m.cedula_conductor).trim(), "mantenimiento_reportes");
for (const p of preoperacional) anotar(String(p.cedula_conductor).trim(), "revision_preoperacional");

const borrables = sobran.filter((c) => !referenciadas.has(String(c.cedula).trim()));
const intocables = sobran.filter((c) => referenciadas.has(String(c.cedula).trim()));

console.log("");
console.log("═".repeat(96));
const BF = /m.dulo Candidatos/i;
for (const c of sobran.sort((a, b) => String(a.cedula).localeCompare(String(b.cedula)))) {
  const ced = String(c.cedula).trim();
  const refs = referenciadas.get(ced);
  const origen = BF.test(String(c.observacion ?? "")) ? "Contratación" : c.codigo ? "GEMA (ya no)" : "otro";
  console.log(
    `${ced.padEnd(13)} ${String(c.estado ?? "?").padEnd(9)} ${origen.padEnd(13)} ${String(c.nombre ?? "").slice(0, 40).padEnd(40)}` +
      (refs ? ` NO SE BORRA: usada en ${refs.join(", ")}` : "")
  );
}
console.log("═".repeat(96));
console.log("");
console.log(`Se pueden borrar: ${borrables.length} · intocables por referencias: ${intocables.length}`);

// ── Guarda 3: tope de borrado ──────────────────────────────────────────────
if (borrables.length > enGestivo.length * MAXIMO_BORRADO) {
  console.log("");
  console.log(
    `RECHAZADO: borrar ${borrables.length} de ${enGestivo.length} pasa del ` +
      `${Math.round(MAXIMO_BORRADO * 100)} % de la tabla. Revise antes a mano.`
  );
  process.exit(1);
}

if (!APLICAR) {
  console.log("");
  console.log("ENSAYO: no se borró nada. Para aplicar, repita con  -- --aplicar");
  process.exit(0);
}

// ── Borrado ────────────────────────────────────────────────────────────────
console.log("\nBorrando…");
let borradas = 0;
for (const c of borrables) {
  const r = await fetch(`${URL_BASE}/rest/v1/conductores?id=eq.${c.id}`, {
    method: "DELETE",
    headers: { apikey: LLAVE, Authorization: `Bearer ${LLAVE}`, Prefer: "return=minimal" },
  });
  if (!r.ok) {
    console.log(`  ${c.cedula}: HTTP ${r.status} ${await r.text()}`);
    continue;
  }
  borradas++;
}
console.log(`  borradas: ${borradas} de ${borrables.length}`);

// Las que no se pudieron borrar se quedan, pero MARCADAS: tienen historial
// colgando y existen solo para consultarlo, no para usarse en procesos.
if (intocables.length > 0) {
  console.log("\nMarcando como solo informativas las que tienen historial…");
  for (const c of intocables) {
    const r = await fetch(`${URL_BASE}/rest/v1/conductores?id=eq.${c.id}`, {
      method: "PATCH",
      headers: {
        apikey: LLAVE,
        Authorization: `Bearer ${LLAVE}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ solo_informativo: true }),
    });
    console.log(`  ${String(c.cedula).padEnd(13)} ${r.ok ? "marcada" : `HTTP ${r.status}`}`);
  }
}

const despues = await todas<{ cedula: string }>("conductores?select=cedula");
console.log(`\nConductores en Gestivo: ${enGestivo.length} -> ${despues.length}`);
if (intocables.length > 0) {
  console.log(`Quedaron ${intocables.length} que no se pueden borrar por tener historial asociado.`);
}
