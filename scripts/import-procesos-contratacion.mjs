/**
 * Importa el histórico del Excel de RRHH "Procesos de reclutamiento" (CSV ;)
 * a la tabla `procesos_contratacion`.
 *
 * Uso:
 *   node scripts/import-procesos-contratacion.mjs "/ruta/al/archivo.csv"
 *   node scripts/import-procesos-contratacion.mjs "/ruta/al/archivo.csv" --force    (importa aunque ya haya datos)
 *   node scripts/import-procesos-contratacion.mjs "/ruta/al/archivo.csv" --dry-run  (solo valida el archivo, no escribe)
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local,
 * y que la migración 021_procesos_contratacion.sql ya esté aplicada.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── CSV parser (delimitador ;, campos entre comillas con saltos de línea) ────
function parseCsv(text, delim = ";") {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

// ── mapeos ───────────────────────────────────────────────────────────────────
const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const up = (s) => clean(s).toUpperCase();

function parseDate(s) {
  const m = clean(s).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = "20" + y;
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function parseValor(s) {
  const t = clean(s).replace(/[^\d.,]/g, "");
  if (!t) return 0;
  const n = parseFloat(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function mapEstado(s) {
  const v = up(s);
  if (v === "CONTRATADO") return "contratado";
  if (v === "CIERRE DE PROCESO") return "cierre";
  if (v === "CITADO") return "citado";
  if (v === "EN ESCUELA") return "en_escuela";
  if (v.includes("EXAMENES") || v.includes("EXÁMENES")) return "en_examenes";
  if (v.includes("RECONOCIMIENTO")) return "reconocimiento_ruta";
  if (v.includes("PRUEBA")) return "prueba_manejo";
  return "pendiente"; // PENDIENTE, PENDIENTE POR CITAR, EN PROCESO, vacío
}

function mapSimit(s) {
  const v = up(s);
  if (!v || v === "N/A") return { simit: null, extra: null };
  if (v === "OK") return { simit: "ok", extra: null };
  if (v === "DEUDA") return { simit: "deuda", extra: null };
  if (v.includes("ACUERDO")) return { simit: "acuerdo_pago", extra: v.length > 20 ? clean(s) : null };
  if (v.includes("PENDIENTE") || v.includes("COBRO") || v.includes("COMPARENDO"))
    return { simit: "deuda", extra: clean(s) };
  return { simit: null, extra: clean(s) };
}

function mapAntecedentes(s) {
  const v = up(s);
  if (v === "OK" || v === "NO") return "ok";
  if (v === "PENDIENTE") return "pendiente";
  if (v === "SI" || v === "SÍ") return "con_antecedentes";
  return null;
}

function mapMedio(s) {
  const v = up(s);
  if (!v) return null;
  if (v.startsWith("WHA")) return "whatsapp";
  if (v.startsWith("COMPU")) return "computrabajo";
  if (v.startsWith("REFERIDO") || v.startsWith("RE ")) return "referido";
  if (v === "VARYLO") return "varylo";
  if (v === "MANYCHAT") return "manychat";
  if (v === "VOLUNTARIO") return "voluntario";
  if (v === "REINGRESO" || v === "REINTEGRO") return "reingreso";
  return "otro";
}

// ── main ─────────────────────────────────────────────────────────────────────
const [, , csvPath, ...flags] = process.argv;
if (!csvPath) {
  console.error("Uso: node scripts/import-procesos-contratacion.mjs <archivo.csv> [--force] [--dry-run]");
  process.exit(1);
}
const dryRun = flags.includes("--dry-run");

let supabase = null;
const cedulaToCandidate = new Map();
if (!dryRun) {
  const env = {};
  for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && m[2].trim()) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (en .env.local o el entorno).");
    process.exit(1);
  }
  supabase = createClient(url, key);

  const { count: existing, error: countErr } = await supabase
    .from("procesos_contratacion")
    .select("id", { count: "exact", head: true });
  if (countErr) {
    console.error("¿Aplicaste la migración 021? Error:", countErr.message);
    process.exit(1);
  }
  if (existing > 0 && !flags.includes("--force")) {
    console.error(`La tabla ya tiene ${existing} registros. Usa --force para importar de todos modos.`);
    process.exit(1);
  }

  // Candidatos existentes para vincular por cédula
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("candidates")
      .select("id, document_number")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const c of data) if (c.document_number) cedulaToCandidate.set(c.document_number.trim(), c.id);
    if (data.length < 1000) break;
  }
  console.log(`Candidatos existentes indexados: ${cedulaToCandidate.size}`);
}

const raw = readFileSync(csvPath, "latin1");
const [header, ...dataRows] = parseCsv(raw);
const idx = {};
header.forEach((h, i) => {
  const k = up(h).normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (k.startsWith("FECHA DE CREACION")) idx.fecha = i;
  else if (k === "NOMBRE") idx.nombre = i;
  else if (k === "CEDULA") idx.cedula = i;
  else if (k === "CELULAR") idx.celular = i;
  else if (k === "REINGRESO") idx.reingreso = i;
  else if (k.startsWith("ESTADO")) idx.estado = i;
  else if (k.startsWith("CAUSA")) idx.causa = i;
  else if (k.startsWith("OBSERVACION")) idx.observacion = i;
  else if (k === "SIMIT") idx.simit = i;
  else if (k === "VALOR") idx.valor = i;
  else if (k.startsWith("ANTECEDENTES")) idx.antecedentes = i;
  else if (k === "RUNT") idx.runt = i;
  else if (k.startsWith("MEDIO")) idx.medio = i;
  else if (k.startsWith("FECHA DE EX")) idx.fExamenes = i;
  else if (k.startsWith("FECHA PRUEB")) idx.fPrueba = i;
  else if (k.startsWith("FECHA DE CITACI")) idx.fCitacion = i;
  else if (k.startsWith("FECHA DE CONTRATO")) idx.fContrato = i;
});
console.log("Columnas detectadas:", Object.keys(idx).join(", "));

const rows = [];
const skipped = [];
for (const r of dataRows) {
  const nombre = clean(r[idx.nombre]);
  const cedula = clean(r[idx.cedula]).replace(/\D/g, "");
  const fecha = parseDate(r[idx.fecha]);
  if (!nombre || !cedula || !fecha) {
    skipped.push(nombre || r.join(";").slice(0, 60));
    continue;
  }
  const { simit, extra } = mapSimit(r[idx.simit]);
  let observacion = clean(r[idx.observacion]) || null;
  if (extra) observacion = observacion ? `${observacion} | SIMIT: ${extra}` : `SIMIT: ${extra}`;
  const causaRaw = clean(r[idx.causa]);
  const estado = mapEstado(r[idx.estado]);

  rows.push({
    fecha_creacion: fecha,
    nombre: nombre.toUpperCase(),
    cedula,
    celular: clean(r[idx.celular]) || null,
    reingreso: up(r[idx.reingreso]) === "SI",
    estado,
    causa_no_contrato:
      estado === "cierre" && causaRaw && !["N/A", "EN PROCESO", "CIERRE DE PROCESO"].includes(up(causaRaw))
        ? causaRaw
        : null,
    observacion,
    simit,
    simit_valor: parseValor(r[idx.valor]),
    antecedentes: mapAntecedentes(r[idx.antecedentes]),
    licencia_categoria: clean(r[idx.runt]) || null,
    medio_postulacion: mapMedio(r[idx.medio]),
    fecha_citacion: parseDate(r[idx.fCitacion]),
    fecha_examenes: parseDate(r[idx.fExamenes]),
    fecha_prueba_manejo: parseDate(r[idx.fPrueba]),
    fecha_contrato: parseDate(r[idx.fContrato]),
    candidate_id: cedulaToCandidate.get(cedula) ?? null,
  });
}

console.log(`Filas a importar: ${rows.length} · omitidas (sin nombre/cédula/fecha): ${skipped.length}`);
if (skipped.length) console.log("Omitidas:", skipped.slice(0, 10).join(" | "), skipped.length > 10 ? "…" : "");

if (dryRun) {
  const tally = (key) =>
    rows.reduce((acc, r) => ((acc[r[key] ?? "(vacío)"] = (acc[r[key] ?? "(vacío)"] ?? 0) + 1), acc), {});
  console.log("Estados:", tally("estado"));
  console.log("SIMIT:", tally("simit"));
  console.log("Medios:", tally("medio_postulacion"));
  console.log("Con deuda SIMIT > 0:", rows.filter((r) => r.simit_valor > 0).length);
  console.log("Dry-run: no se escribió nada.");
  process.exit(0);
}

let inserted = 0;
for (let i = 0; i < rows.length; i += 500) {
  const chunk = rows.slice(i, i + 500);
  const { error } = await supabase.from("procesos_contratacion").insert(chunk);
  if (error) {
    console.error(`Error insertando lote ${i / 500 + 1}:`, error.message);
    process.exit(1);
  }
  inserted += chunk.length;
  console.log(`Insertados ${inserted}/${rows.length}`);
}
const vinculados = rows.filter((r) => r.candidate_id).length;
console.log(`Listo ✅  ${inserted} procesos importados (${vinculados} vinculados a candidatos existentes).`);
