/**
 * Migración del histórico de ausentes 2026 (Excel de Recepción consolidado por
 * RRHH, hoja "BD Ausentismo") a la tabla `ausentismo_registros`, la misma que
 * llena el módulo Ausentismo → Registro del día desde septiembre de 2026.
 *
 * Uso (desde la raíz del proyecto):
 *
 *   npx tsx --tsconfig tsconfig.json scripts/migrar-ausentismo-registros.mts "<ruta>\Bd_ausentismo_2026.xlsx" --ensayo
 *   npx tsx --tsconfig tsconfig.json scripts/migrar-ausentismo-registros.mts "<ruta>\Bd_ausentismo_2026.xlsx" --ensayo --equivalencias "<ruta>\nombres-cedula.csv"
 *   npx tsx --tsconfig tsconfig.json scripts/migrar-ausentismo-registros.mts "<ruta>\Bd_ausentismo_2026.xlsx" --ensayo --correcciones "<ruta>\rechazadas.csv"
 *   npx tsx --tsconfig tsconfig.json scripts/migrar-ausentismo-registros.mts "<ruta>\Bd_ausentismo_2026.xlsx" --escribir --correcciones "<ruta>\rechazadas.csv"
 *   npx tsx --tsconfig tsconfig.json scripts/migrar-ausentismo-registros.mts --reversar
 *
 * --ensayo        solo lee (Excel, maestro, vehículos, conceptos, registros) y deja el
 *                 informe en %TEMP%\migracion-ausentismo\ (resumen.txt, rechazadas.csv,
 *                 nombres-sin-cedula.csv, avisos.csv, a-insertar.csv). No escribe en la base.
 * --equivalencias CSV nombre;veces;cedula (el nombres-sin-cedula.csv del ensayo con la
 *                 columna cedula llena): asigna esa cédula a todas las filas con ese nombre.
 * --correcciones  el rechazadas.csv del ensayo revisado por RRHH: una cédula escrita en la
 *                 columna cedula (o en causa) corrige esa fila exacta del Excel, identificada
 *                 por la columna origen ("mes!fila N"). Las filas que RRHH borró del archivo
 *                 quedan excluidas de la carga (decisión del 2026-09-09).
 * --escribir  respalda ausentismo_registros y ausentismo_log a JSON en la misma
 *             carpeta y luego inserta por lotes, con bitácora por registro.
 * --reversar  borra todo lo que lleve la marca de esta migración (bitácora y registros).
 *
 * Reglas que replica del formulario (crearRegistro en app/(dashboard)/ausentismo/actions.ts):
 * un registro por conductor y día, concepto del catálogo, vehículo del maestro,
 * claves de contacto y soporte válidas, fecha_inicio obligatoria. La cédula debe
 * existir en el maestro `conductores`: de allí salen nombre, código y teléfono;
 * el nombre del Excel solo sirve para resolver la cédula cuando falta.
 *
 * Todo lo que escribe en disco va a %TEMP%: el archivo es una lista nominal y
 * no debe copiarse al vault ni al repositorio. Lee .env.local y si no existe .env.
 */
import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CONTACTO_KEYS, SOPORTE_KEYS } from "../src/lib/ausentismo/constants";

// xlsx es CommonJS: se carga con require para que tsx no lo trate como ESM.
const XLSX = createRequire(import.meta.url)("xlsx") as typeof import("xlsx");

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARCA = "migracion:Bd_ausentismo_2026.xlsx";
const HOJA = "BD Ausentismo";
const SALIDA = path.join(os.tmpdir(), "migracion-ausentismo");
const LOTE = 200;
/**
 * Rango que cubre el archivo. Una fecha fuera de él es casi seguro un año mal
 * digitado (el ensayo del 2026-09-09 halló 26 filas del 03/12/2025 en la hoja
 * de enero): se rechaza para que RRHH la corrija en el Excel y se vuelva a
 * correr, en vez de cargar un dato dudoso.
 */
const RANGO = { desde: "2026-01-01", hasta: "2026-08-31" };

// ── Equivalencias ────────────────────────────────────────────────────────────

/** Tipo del Excel (sin tildes, mayúsculas) → clave de ausentismo_conceptos. null = se excluye. */
const TIPOS: Record<string, string | null> = {
  "INCAPACIDAD": "incapacidad",
  "INCAPACIDAD INDEFINIDA": "incapacidad",
  "HOSPITALIZADO": "incapacidad",
  "PERMISO": "permiso",
  "TRAMITE DE LICENCIA": "permiso",
  "REUNION": "permiso",
  "VACACIONES": "vacaciones",
  "DESCANSO": "descanso",
  "SUSPENSION": "suspension",
  "CALAMIDAD": "calamidad",
  "LICENCIA (PATERNIDAD/LUTO)": "licencia",
  "CITA MEDICA / EPS": "eps",
  "VEHICULO EN TALLER": "taller",
  "RETIRO / RENUNCIA": "renuncia",
  "SIN JUSTIFICACION": "no_justificada",
  "AUSENCIA INJUSTIFICADA": "no_justificada",
  "SIN CONTACTO": "no_justificada",
  "OTRO": "otra",
  "COBRO DE VIAJES": "otra",
  // Decisión RRHH 2026-09-09: el conductor sí trabajó, no es ausencia.
  "ASISTIO / LLEGO TARDE": null,
};

/** Soporte del Excel → clave del sistema. Decisión RRHH 2026-09-09: Registrado = presentado. */
const SOPORTES: Record<string, string> = {
  "REGISTRADO": "presentado",
  "ENTREGADO": "presentado",
  "PENDIENTE": "pendiente",
};

// ── Utilidades ───────────────────────────────────────────────────────────────

const limpio = (v: unknown): string | null => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s || null;
};
/** Sin tildes, mayúsculas, solo letras/números/espacios: para comparar nombres y tipos. */
const clave = (v: unknown): string =>
  String(v ?? "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9 ()\/]/g, " ").replace(/\s+/g, " ").trim();
const claveNombre = (v: unknown): string => clave(v).replace(/[()\/]/g, " ").replace(/\s+/g, " ").trim();
const soloDigitos = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

/** "dd/mm/aaaa", "d/m/aa", "aaaa-mm-dd" o Date → ISO; null si no se entiende. */
function aISO(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  let iso: string | null = null;
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    iso = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  } else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
    iso = m[0];
  }
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** "01/02/2026 – 05/02/2026", "1/2/26 a 5/2/26" o una sola fecha → [inicio, fin]. */
function rangoFechas(v: unknown): { inicio: string | null; fin: string | null; ilegible: boolean } {
  const s = limpio(v);
  if (!s) return { inicio: null, fin: null, ilegible: false };
  const partes = s.split(/\s*[–—]\s*|\s+-\s+|\s+al?\s+|\s*;\s*/i).map(aISO);
  const inicio = partes[0] ?? null;
  const fin = partes[1] ?? null;
  if (!inicio) {
    // Puede venir "dd/mm/aaaa-dd/mm/aaaa" sin espacios.
    const m = s.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{2,4})$/);
    if (m) return { inicio: aISO(m[1]), fin: aISO(m[2]), ilegible: !aISO(m[1]) };
    return { inicio: null, fin: null, ilegible: true };
  }
  return { inicio, fin, ilegible: false };
}

function csv(filas: (string | number | null | undefined)[][]): string {
  const celda = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n") + "\r\n";
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

/** Trae una tabla completa paginando de a 1.000 (PostgREST recorta a 1.000 filas). */
async function todo<T>(db: Db, tabla: string, cols: string, filtro?: (q: any) => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    let q = db.from(tabla).select(cols).range(desde, desde + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// ── Tipos ────────────────────────────────────────────────────────────────────

interface FilaExcel {
  origen: string;
  conductor: string | null;
  vehiculo: string | null;
  tipo: string | null;
  periodo: string | null;
  justificacion: string | null;
  incapacidad: string | null;
  reintegro: string | null;
  soporte: string | null;
  telefono: string | null;
  fecha: string | null;
  cedula: string;
  relevo: string | null;
}

interface Registro {
  fecha: string;
  cedula: string;
  codigo: string | null;
  nombre: string;
  telefono: string | null;
  tipo: string;
  contacto: string | null;
  justificacion: string | null;
  incapacidad_inicio: string | null;
  incapacidad_fin: string | null;
  reintegro: string | null;
  soporte: string;
  soporte_observaciones: string | null;
  codigo_vehiculo: string | null;
  fecha_inicio: string;
  fecha_fin: null;
  created_by: null;
  created_by_email: string;
}

interface Preparado {
  registro: Registro;
  origenes: string[];
  tiposExcel: string[];
}

interface Conductor { cedula: string; nombre: string | null; codigo: string | null; celular: string | null; telefono: string | null }

// ── Lectura del Excel ────────────────────────────────────────────────────────

function leerExcel(ruta: string): FilaExcel[] {
  // El archivo vive en OneDrive y suele estar abierto en Excel: se trabaja sobre una copia.
  mkdirSync(SALIDA, { recursive: true });
  const copia = path.join(SALIDA, path.basename(ruta));
  copyFileSync(ruta, copia);
  const libro = XLSX.readFile(copia, { cellDates: false });
  const hoja = libro.Sheets[HOJA] ?? libro.Sheets[libro.SheetNames[0]];
  if (!hoja) throw new Error(`El libro no tiene la hoja "${HOJA}".`);
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { raw: false, defval: null, dateNF: "dd/mm/yyyy" });
  const col = (r: Record<string, unknown>, ...nombres: string[]) => {
    for (const k of Object.keys(r)) if (nombres.some((n) => clave(k) === clave(n))) return r[k];
    return null;
  };
  return filas.map((r, i) => ({
    origen: limpio(col(r, "Origen")) ?? `fila ${i + 2}`,
    conductor: limpio(col(r, "Conductor")),
    vehiculo: limpio(col(r, "Vehículo", "Vehiculo"))?.toUpperCase() ?? null,
    tipo: limpio(col(r, "Tipo")),
    periodo: limpio(col(r, "Periodo")),
    justificacion: limpio(col(r, "Justificación", "Justificacion")),
    incapacidad: limpio(col(r, "Incapacidad")),
    reintegro: limpio(col(r, "Reintegro")),
    soporte: limpio(col(r, "Soporte")),
    telefono: limpio(col(r, "Teléfono", "Telefono")),
    fecha: limpio(col(r, "Fecha")),
    cedula: soloDigitos(col(r, "Cédula", "Cedula")),
    relevo: limpio(col(r, "Relevo")),
  }));
}

/** Lee un CSV con BOM y separador ; , o tabulador → filas como objetos por encabezado. */
function leerCsv(ruta: string): Record<string, string>[] {
  const texto = readFileSync(ruta, "utf8").replace(/^﻿/, "");
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (lineas.length === 0) return [];
  const sep = [";", ",", "\t"].sort((a, b) => lineas[0].split(b).length - lineas[0].split(a).length)[0];
  const partir = (l: string) => {
    const out: string[] = [];
    let campo = "";
    let enComillas = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (enComillas) {
        if (ch === '"' && l[i + 1] === '"') { campo += '"'; i++; }
        else if (ch === '"') enComillas = false;
        else campo += ch;
      } else if (ch === '"') enComillas = true;
      else if (ch === sep) { out.push(campo); campo = ""; }
      else campo += ch;
    }
    out.push(campo);
    return out.map((c) => c.trim());
  };
  const cab = partir(lineas[0]).map((h) => clave(h).toLowerCase());
  return lineas.slice(1).map((l) => Object.fromEntries(partir(l).map((v, i) => [cab[i] ?? `col${i}`, v])));
}

/**
 * Correcciones fila a fila desde el rechazadas.csv revisado por RRHH. Devuelve
 * la cédula corregida por origen ("mes!fila N") y el conjunto de orígenes que
 * RRHH conservó en el archivo: lo que borró queda excluido de la carga.
 */
function leerCorrecciones(ruta: string | null): { cedulas: Map<string, string>; presentes: Set<string> } | null {
  if (!ruta) return null;
  const cedulas = new Map<string, string>();
  const presentes = new Set<string>();
  for (const r of leerCsv(ruta)) {
    const origen = limpio(r.origen);
    if (!origen) continue;
    presentes.add(origen);
    // La cédula puede venir en su columna o escrita encima de la causa.
    const candidata = [r.cedula, r.causa].map((v) => soloDigitos(v)).find((d) => d.length >= 5);
    if (candidata) cedulas.set(origen, candidata);
  }
  return { cedulas, presentes };
}

function leerEquivalencias(ruta: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!ruta) return out;
  const texto = readFileSync(ruta, "utf8").replace(/^﻿/, "");
  for (const linea of texto.split(/\r?\n/).slice(1)) {
    const [nombre, cedula] = linea.split(/[;,\t]/).map((c) => c.replace(/^"|"$/g, "").trim());
    const ced = soloDigitos(cedula);
    if (nombre && ced) out.set(claveNombre(nombre), ced);
  }
  return out;
}

// ── Transformación ───────────────────────────────────────────────────────────

interface Contexto {
  conductores: Map<string, Conductor>;
  porNombreMaestro: Map<string, string[]>;
  porNombreExcel: Map<string, Set<string>>;
  equivalencias: Map<string, string>;
  correcciones: { cedulas: Map<string, string>; presentes: Set<string> } | null;
  vehiculos: Set<string>;
  conceptos: Map<string, boolean>;
}

type Resultado =
  | { ok: true; prep: Preparado; avisos: string[] }
  | { ok: false; causa: string }
  | { ok: false; causa: "excluida por tipo"; excluida: true }
  | { ok: false; causa: "nombre sin cédula"; nombre: string };

function transformar(f: FilaExcel, ctx: Contexto): Resultado {
  const avisos: string[] = [];
  const fecha = aISO(f.fecha);
  if (!fecha) return { ok: false, causa: `fecha ilegible (${f.fecha ?? "vacía"})` };
  if (fecha < RANGO.desde || fecha > RANGO.hasta) {
    return { ok: false, causa: `fecha fuera del rango ene–ago 2026 (${f.fecha}, hoja ${f.origen.split("!")[0]}): corregir el año en el Excel` };
  }

  const tipoClave = clave(f.tipo);
  if (!(tipoClave in TIPOS)) return { ok: false, causa: `tipo desconocido (${f.tipo ?? "vacío"})` };
  const tipo = TIPOS[tipoClave];
  if (tipo === null) return { ok: false, causa: "excluida por tipo", excluida: true };
  if (!ctx.conceptos.has(tipo)) return { ok: false, causa: `concepto ${tipo} no existe en el catálogo` };
  if (!ctx.conceptos.get(tipo)) avisos.push(`concepto ${tipo} está inactivo en el catálogo`);

  // Cédula: la corrección de RRHH para esta fila manda; si no, la columna; si no,
  // el propio archivo; si no, el maestro; si no, las equivalencias por nombre.
  // Las filas que RRHH no tocó traen la misma cédula del Excel: no cuentan como corrección.
  const enCorrecciones = ctx.correcciones?.cedulas.get(f.origen) ?? null;
  const corregida = enCorrecciones && enCorrecciones !== f.cedula ? enCorrecciones : null;
  let cedula = corregida ?? f.cedula;
  if (corregida) avisos.push(`cédula corregida por RRHH: ${f.cedula || "vacía"} → ${corregida}`);
  if (!cedula && f.conductor) {
    const k = claveNombre(f.conductor);
    const delExcel = ctx.porNombreExcel.get(k);
    const delMaestro = ctx.porNombreMaestro.get(k) ?? [];
    if (delExcel && delExcel.size === 1) cedula = [...delExcel][0];
    else if (ctx.equivalencias.has(k)) cedula = ctx.equivalencias.get(k)!;
    else if (delMaestro.length === 1) cedula = delMaestro[0];
    else if ((delExcel && delExcel.size > 1) || delMaestro.length > 1) {
      return { ok: false, causa: "nombre sin cédula", nombre: `${f.conductor} (ambiguo: varias cédulas)` };
    }
  }
  if (!cedula) {
    // Con el rechazadas.csv revisado, lo que RRHH borró de él queda fuera de la carga.
    if (ctx.correcciones && !ctx.correcciones.presentes.has(f.origen)) {
      return { ok: false, causa: "sin cédula · excluida por RRHH (no está en el rechazadas.csv revisado)" };
    }
    return { ok: false, causa: "nombre sin cédula", nombre: f.conductor ?? "(sin nombre)" };
  }

  // El maestro de conductores es la fuente del nombre, el código y el teléfono:
  // una cédula que no esté allí es casi seguro un número mal digitado en el
  // Excel, así que se rechaza en vez de cargar el nombre tal como venía.
  const maestro = ctx.conductores.get(cedula) ?? null;
  if (!maestro) {
    return { ok: false, causa: `cédula ${cedula} no está en el maestro de conductores: verificar el número en el Excel` };
  }
  const nombre = maestro.nombre ?? f.conductor ?? cedula;

  const justificacionBase = [f.justificacion, clave(f.relevo) === "SI" ? "Relevo: sí" : null].filter(Boolean).join(" · ") || null;
  let contacto: string | null = null;
  if (tipo === "no_justificada") {
    const j = clave(f.justificacion);
    if (j.includes("APAGADO")) contacto = "apagado";
    else if (j.includes("NO CONTESTA")) contacto = "no_contesta";
    else if (j.includes("DESVIA")) contacto = "desvia_llamadas";
    if (contacto && !CONTACTO_KEYS.has(contacto)) contacto = null;
  }

  const inc = rangoFechas(f.incapacidad);
  if (inc.ilegible) avisos.push(`incapacidad ilegible: "${f.incapacidad}"`);
  let incInicio = inc.inicio;
  let incFin = inc.fin;
  if (incInicio && incFin && incFin < incInicio) {
    [incInicio, incFin] = [incFin, incInicio];
    avisos.push("incapacidad con fin antes del inicio: se intercambiaron");
  }
  const reintegro = f.reintegro ? aISO(f.reintegro) : null;
  if (f.reintegro && !reintegro) avisos.push(`reintegro ilegible: "${f.reintegro}"`);

  const soporte = f.soporte ? SOPORTES[clave(f.soporte)] : "no_aplica";
  if (!soporte) return { ok: false, causa: `soporte desconocido (${f.soporte})` };
  if (!SOPORTE_KEYS.has(soporte)) return { ok: false, causa: `soporte ${soporte} no válido` };

  let codigoVehiculo: string | null = null;
  if (f.vehiculo) {
    if (ctx.vehiculos.has(f.vehiculo)) codigoVehiculo = f.vehiculo;
    else avisos.push(`vehículo ${f.vehiculo} no está en el maestro: queda vacío`);
  }

  const registro: Registro = {
    fecha,
    cedula,
    codigo: maestro.codigo ?? null,
    nombre,
    telefono: soloDigitos(f.telefono) || maestro.celular || maestro.telefono || null,
    tipo,
    contacto,
    justificacion: justificacionBase,
    incapacidad_inicio: incInicio,
    incapacidad_fin: incFin,
    reintegro,
    soporte,
    soporte_observaciones: soporte !== "no_aplica" ? `Excel: ${f.soporte}` : null,
    codigo_vehiculo: codigoVehiculo,
    fecha_inicio: fecha,
    fecha_fin: null,
    created_by: null,
    created_by_email: MARCA,
  };
  return { ok: true, prep: { registro, origenes: [f.origen], tiposExcel: [f.tipo ?? ""] }, avisos };
}

/** Dos filas del mismo conductor y día se funden en una: la primera manda y las demás aportan su texto. */
function fusionar(base: Preparado, otra: Preparado): string {
  const r = base.registro;
  const o = otra.registro;
  if (o.justificacion && !(r.justificacion ?? "").includes(o.justificacion)) {
    r.justificacion = r.justificacion ? `${r.justificacion} | ${o.justificacion}` : o.justificacion;
  }
  r.incapacidad_inicio ??= o.incapacidad_inicio;
  r.incapacidad_fin ??= o.incapacidad_fin;
  r.reintegro ??= o.reintegro;
  r.codigo_vehiculo ??= o.codigo_vehiculo;
  r.contacto ??= o.contacto;
  r.telefono ??= o.telefono;
  const peso: Record<string, number> = { no_aplica: 0, pendiente: 1, presentado: 2 };
  if ((peso[o.soporte] ?? 0) > (peso[r.soporte] ?? 0)) {
    r.soporte = o.soporte;
    r.soporte_observaciones = o.soporte_observaciones;
  }
  base.origenes.push(...otra.origenes);
  base.tiposExcel.push(...otra.tiposExcel);
  const distintos = [...new Set(base.tiposExcel)];
  if (distintos.length > 1 && !(r.justificacion ?? "").includes("Tipos en Excel:")) {
    r.justificacion = `${r.justificacion ?? ""}${r.justificacion ? " · " : ""}Tipos en Excel: ${distintos.join(", ")}`;
  }
  return `${r.fecha} · cédula ${r.cedula}: ${otra.origenes.join(", ")} fusionada en ${base.origenes[0]}`;
}

// ── Programa ─────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const modo = args.includes("--escribir") ? "escribir" : args.includes("--reversar") ? "reversar" : "ensayo";
  const valorDe = (bandera: string) => { const i = args.indexOf(bandera); return i >= 0 ? args[i + 1] ?? null : null; };
  const equivalenciasRuta = valorDe("--equivalencias");
  const correccionesRuta = valorDe("--correcciones");
  const archivo = args.find((a, i) => !a.startsWith("--") && !["--equivalencias", "--correcciones"].includes(args[i - 1] ?? "")) ?? null;
  for (const [nombre, ruta] of [["--equivalencias", equivalenciasRuta], ["--correcciones", correccionesRuta]] as const) {
    if (ruta && !existsSync(ruta)) throw new Error(`No existe el archivo de ${nombre}: ${ruta}`);
  }

  const env = leerEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el .env.");
  }
  const db: Db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  mkdirSync(SALIDA, { recursive: true });
  console.log(`Modo: ${modo} · salida: ${SALIDA}`);

  if (modo === "reversar") {
    const { data: logs, error: e1 } = await db.from("ausentismo_log").delete().eq("user_email", MARCA).select("id");
    if (e1) throw new Error(`bitácora: ${e1.message}`);
    const { data: regs, error: e2 } = await db.from("ausentismo_registros").delete().eq("created_by_email", MARCA).select("id");
    if (e2) throw new Error(`registros: ${e2.message}`);
    console.log(`Reversado: ${regs?.length ?? 0} registros y ${logs?.length ?? 0} entradas de bitácora con la marca "${MARCA}".`);
    return;
  }

  if (!archivo) throw new Error("Indica la ruta del Excel como primer argumento.");
  if (!existsSync(archivo)) throw new Error(`No existe el archivo: ${archivo}`);

  // 1. Excel y contexto de la base.
  const filas = leerExcel(archivo);
  console.log(`Excel: ${filas.length} filas en "${HOJA}".`);
  const [conductores, vehiculos, conceptos, existentes] = await Promise.all([
    todo<Conductor>(db, "conductores", "cedula, nombre, codigo, celular, telefono"),
    todo<{ codigo: string }>(db, "vehiculos", "codigo"),
    todo<{ key: string; activo: boolean }>(db, "ausentismo_conceptos", "key, activo"),
    todo<{ fecha: string; cedula: string }>(db, "ausentismo_registros", "fecha, cedula", (q) =>
      q.gte("fecha", RANGO.desde).lte("fecha", RANGO.hasta)
    ),
  ]);
  const ctx: Contexto = {
    conductores: new Map(conductores.map((c) => [soloDigitos(c.cedula), { ...c, cedula: soloDigitos(c.cedula) }])),
    porNombreMaestro: new Map(),
    porNombreExcel: new Map(),
    equivalencias: leerEquivalencias(equivalenciasRuta),
    correcciones: leerCorrecciones(correccionesRuta),
    vehiculos: new Set(vehiculos.map((v) => String(v.codigo).trim().toUpperCase())),
    conceptos: new Map(conceptos.map((c) => [c.key, c.activo])),
  };
  for (const c of conductores) {
    const k = claveNombre(c.nombre);
    if (!k) continue;
    const lista = ctx.porNombreMaestro.get(k) ?? [];
    if (!lista.includes(soloDigitos(c.cedula))) lista.push(soloDigitos(c.cedula));
    ctx.porNombreMaestro.set(k, lista);
  }
  // Diccionario nombre → cédula del propio archivo (filas de enero a julio traen
  // ambos). Solo entran cédulas que existan en el maestro: una mal digitada no
  // debe propagarse a las filas de agosto que solo traen el nombre.
  for (const f of filas) {
    if (!f.cedula || !f.conductor || !ctx.conductores.has(f.cedula)) continue;
    const k = claveNombre(f.conductor);
    if (!ctx.porNombreExcel.has(k)) ctx.porNombreExcel.set(k, new Set());
    ctx.porNombreExcel.get(k)!.add(f.cedula);
  }
  const faltanConceptos = [...new Set(Object.values(TIPOS).filter((v): v is string => !!v))].filter((k) => !ctx.conceptos.has(k));
  if (faltanConceptos.length) throw new Error(`Conceptos ausentes en ausentismo_conceptos: ${faltanConceptos.join(", ")}`);
  console.log(
    `Base: ${conductores.length} conductores · ${vehiculos.length} vehículos · ${conceptos.length} conceptos · ` +
    `${existentes.length} registros ya existentes entre ${RANGO.desde} y ${RANGO.hasta} · ${ctx.equivalencias.size} equivalencias de RRHH` +
    (ctx.correcciones ? ` · correcciones: ${ctx.correcciones.cedulas.size} cédulas en ${ctx.correcciones.presentes.size} filas revisadas.` : ".")
  );

  // 2. Transformar y fusionar.
  const preparados = new Map<string, Preparado>();
  const rechazadas: (string | null)[][] = [];
  const avisos: string[][] = [];
  const nombresSinCedula = new Map<string, { nombre: string; veces: number }>();
  const causas = new Map<string, number>();
  let excluidas = 0;
  let fusionadas = 0;
  const filaCsv = (f: FilaExcel, causa: string) => [
    f.origen, causa, f.conductor, f.cedula, f.fecha, f.tipo, f.periodo, f.justificacion, f.incapacidad, f.reintegro, f.soporte, f.vehiculo, f.relevo,
  ];
  // Cuenta por mes del Excel (según la hoja de origen, no la fecha, para que las
  // fechas mal digitadas también se vean en su mes).
  const mesDeHoja = (f: FilaExcel) => f.origen.split("!")[0].toLowerCase();
  const porHoja = new Map<string, { excel: number; excluidas: number; rechazadas: number; fusionadas: number; insertar: number }>();
  const cuenta = (f: FilaExcel, campo: "excel" | "excluidas" | "rechazadas" | "fusionadas" | "insertar") => {
    const h = mesDeHoja(f);
    const c = porHoja.get(h) ?? { excel: 0, excluidas: 0, rechazadas: 0, fusionadas: 0, insertar: 0 };
    c[campo]++;
    porHoja.set(h, c);
  };
  for (const f of filas) {
    cuenta(f, "excel");
    const r = transformar(f, ctx);
    if (!r.ok) {
      if ("excluida" in r) { excluidas++; cuenta(f, "excluidas"); rechazadas.push(filaCsv(f, "excluida: Asistió / Llegó tarde")); continue; }
      cuenta(f, "rechazadas");
      if ("nombre" in r) {
        const k = claveNombre(f.conductor);
        const n = nombresSinCedula.get(k) ?? { nombre: f.conductor ?? "", veces: 0 };
        n.veces++;
        nombresSinCedula.set(k, n);
      }
      causas.set(r.causa, (causas.get(r.causa) ?? 0) + 1);
      rechazadas.push(filaCsv(f, r.causa));
      continue;
    }
    for (const a of r.avisos) avisos.push([f.origen, r.prep.registro.fecha, r.prep.registro.cedula, a]);
    const llave = `${r.prep.registro.fecha}|${r.prep.registro.cedula}`;
    const previa = preparados.get(llave);
    if (previa) {
      fusionadas++;
      cuenta(f, "fusionadas");
      avisos.push([f.origen, r.prep.registro.fecha, r.prep.registro.cedula, fusionar(previa, r.prep)]);
    } else {
      cuenta(f, "insertar");
      preparados.set(llave, r.prep);
    }
  }
  // 3. Idempotencia: lo que ya está en la base no se vuelve a insertar.
  const yaEnBase = new Set(existentes.map((e) => `${e.fecha}|${soloDigitos(e.cedula)}`));
  let omitidas = 0;
  for (const llave of [...preparados.keys()]) {
    if (yaEnBase.has(llave)) { preparados.delete(llave); omitidas++; }
  }
  const aInsertar = [...preparados.values()];

  // 4. Informe.
  const porMes = new Map<string, number>();
  const porTipo = new Map<string, number>();
  for (const p of aInsertar) {
    porMes.set(p.registro.fecha.slice(0, 7), (porMes.get(p.registro.fecha.slice(0, 7)) ?? 0) + 1);
    porTipo.set(p.registro.tipo, (porTipo.get(p.registro.tipo) ?? 0) + 1);
  }
  const ORDEN_MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const hojas = [...porHoja.keys()].sort((a, b) => ORDEN_MESES.indexOf(a) - ORDEN_MESES.indexOf(b));
  const lineas = [
    `Migración de ${path.basename(archivo)} → ausentismo_registros · ${new Date().toISOString()} · modo ${modo}`,
    `Marca: ${MARCA}`,
    "",
    `Filas leídas:            ${filas.length}`,
    `Excluidas (Llegó tarde): ${excluidas}`,
    `Rechazadas:              ${rechazadas.length - excluidas}`,
    ...[...causas.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `   · ${c}: ${n}`),
    `Fusionadas (mismo conductor y día): ${fusionadas}`,
    `Omitidas por existir ya en la base: ${omitidas}`,
    `Con avisos:              ${avisos.length}`,
    `A insertar:              ${aInsertar.length}`,
    "",
    "Por hoja del Excel (filas → excluidas · rechazadas · fusionadas · a insertar):",
    ...hojas.map((h) => {
      const c = porHoja.get(h)!;
      return `   ${h.padEnd(10)} ${String(c.excel).padStart(4)} → ${String(c.excluidas).padStart(3)} · ${String(c.rechazadas).padStart(3)} · ${String(c.fusionadas).padStart(3)} · ${String(c.insertar).padStart(4)}`;
    }),
    "",
    "Por mes de la fecha (a insertar):",
    ...[...porMes.keys()].sort().map((m) => `   ${m}: ${porMes.get(m)}`),
    "",
    "Por concepto (a insertar):",
    ...[...porTipo.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `   ${t}: ${n}`),
    "",
    `Nombres sin cédula pendientes de RRHH: ${nombresSinCedula.size} (ver nombres-sin-cedula.csv)`,
  ];
  writeFileSync(path.join(SALIDA, "resumen.txt"), lineas.join("\r\n") + "\r\n", "utf8");
  writeFileSync(path.join(SALIDA, "rechazadas.csv"), csv([
    ["origen", "causa", "conductor", "cedula", "fecha", "tipo", "periodo", "justificacion", "incapacidad", "reintegro", "soporte", "vehiculo", "relevo"],
    ...rechazadas,
  ]), "utf8");
  writeFileSync(path.join(SALIDA, "nombres-sin-cedula.csv"), csv([
    ["nombre", "veces", "cedula"],
    ...[...nombresSinCedula.values()].sort((a, b) => b.veces - a.veces).map((n) => [n.nombre, n.veces, ""]),
  ]), "utf8");
  writeFileSync(path.join(SALIDA, "avisos.csv"), csv([["origen", "fecha", "cedula", "aviso"], ...avisos]), "utf8");
  // Lo que entraría a la base, fila por fila, para que RRHH lo revise antes de escribir.
  writeFileSync(path.join(SALIDA, "a-insertar.csv"), csv([
    ["origen", "fecha", "cedula", "codigo", "nombre", "tipo", "contacto", "justificacion", "incapacidad_inicio", "incapacidad_fin", "reintegro", "soporte", "soporte_observaciones", "codigo_vehiculo", "telefono"],
    ...aInsertar
      .sort((a, b) => a.registro.fecha.localeCompare(b.registro.fecha) || a.registro.nombre.localeCompare(b.registro.nombre, "es"))
      .map((p) => {
        const r = p.registro;
        return [
          p.origenes.join(", "), r.fecha, r.cedula, r.codigo, r.nombre, r.tipo, r.contacto, r.justificacion, r.incapacidad_inicio, r.incapacidad_fin,
          r.reintegro, r.soporte, r.soporte_observaciones, r.codigo_vehiculo, r.telefono,
        ];
      }),
  ]), "utf8");
  console.log(lineas.join("\n"));

  if (modo === "ensayo") {
    console.log("\nEnsayo terminado: no se escribió nada en la base.");
    return;
  }

  // 5. Escritura: respaldo, inserción por lotes y bitácora.
  const [respRegistros, respLog] = await Promise.all([
    todo<Record<string, unknown>>(db, "ausentismo_registros", "*"),
    todo<Record<string, unknown>>(db, "ausentismo_log", "*"),
  ]);
  const respaldo = path.join(SALIDA, `respaldo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(respaldo, JSON.stringify({ ausentismo_registros: respRegistros, ausentismo_log: respLog }), "utf8");
  console.log(`Respaldo: ${respaldo} (${respRegistros.length} registros, ${respLog.length} bitácora)`);

  let insertados = 0;
  let bitacora = 0;
  for (let i = 0; i < aInsertar.length; i += LOTE) {
    const lote = aInsertar.slice(i, i + LOTE);
    const { data, error } = await db
      .from("ausentismo_registros")
      .insert(lote.map((p) => p.registro))
      .select("id, fecha, cedula");
    if (error) {
      throw new Error(
        `Lote ${i / LOTE + 1} falló tras insertar ${insertados} registros: ${error.message}. ` +
        `Corre --reversar para dejar la base como estaba y vuelve a intentar.`
      );
    }
    insertados += data?.length ?? 0;
    const porLlave = new Map(lote.map((p) => [`${p.registro.fecha}|${p.registro.cedula}`, p]));
    const entradas = (data ?? []).map((d: { id: string; fecha: string; cedula: string }) => {
      const p = porLlave.get(`${d.fecha}|${soloDigitos(d.cedula)}`)!;
      return {
        registro_id: d.id,
        accion: "creado",
        datos_anteriores: null,
        datos_nuevos: { ...p.registro, origen_excel: p.origenes.join(", "), tipos_excel: p.tiposExcel.join(", ") },
        user_id: null,
        user_email: MARCA,
      };
    });
    const { error: eLog } = await db.from("ausentismo_log").insert(entradas);
    if (eLog) {
      throw new Error(
        `La bitácora falló tras ${insertados} registros: ${eLog.message}. Corre --reversar y vuelve a intentar.`
      );
    }
    bitacora += entradas.length;
    console.log(`  lote ${i / LOTE + 1}: ${insertados} registros · ${bitacora} bitácora`);
  }
  writeFileSync(path.join(SALIDA, "resumen.txt"), lineas.join("\r\n") + `\r\nInsertados: ${insertados} · bitácora: ${bitacora}\r\n`, "utf8");
  console.log(`\nListo: ${insertados} registros y ${bitacora} entradas de bitácora con la marca "${MARCA}".`);
}

main().catch((e) => {
  console.error(`\nERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
