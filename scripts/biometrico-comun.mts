/**
 * Piezas compartidas de los scripts del biometrico (ZKAccess 3.5).
 *
 * Modulo sin efectos al importarse: no lee .env ni la red. Los scripts que
 * necesitan Supabase llaman leerEnv() y construyen su propio cliente, para que
 * el resolvedor -que solo lee un Excel- funcione sin llaves configuradas.
 *
 * Lo usan:
 *   biometrico-cruce-excel.mts            (zk.json + Gestivo -> Excel)
 *   biometrico-resolver-correspondencias.mts  (Excel -> correspondencias.json)
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/** Carpeta de trabajo: lleva cedulas y nombres, por eso vive en %TEMP% y no en el repo. */
export const DIR_SALIDA = path.join(os.tmpdir(), "gestivo-biometrico");

/** Ruta del JSON que exporta biometrico-exportar-zk.ps1. */
export const RUTA_ZK = path.join(DIR_SALIDA, "zk.json");

/** Ruta del JSON que produce el resolvedor y consume biometrico-aplicar-ssn-zk.ps1. */
export const RUTA_CORRESPONDENCIAS = path.join(DIR_SALIDA, "correspondencias.json");

// ── Entorno ────────────────────────────────────────────────────────────────
/** Lee .env y .env.local sin dependencias. Las claves vacias se omiten. */
export function leerEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const archivo of [".env", ".env.local"]) {
    if (!fs.existsSync(archivo)) continue;
    for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linea.trim());
      if (!m) continue;
      const v = m[2].replace(/^["']|["']$/g, "").trim();
      if (v) env[m[1]] = v;
    }
  }
  return env;
}

/**
 * Lector paginado de la API REST de Supabase con la llave de servicio.
 * Devuelve la tabla completa en lotes de 1.000.
 */
export function crearLector(url: string, llave: string) {
  return async function todo<T>(tabla: string, columnas: string): Promise<T[]> {
    const filas: T[] = [];
    for (let desde = 0; ; desde += 1000) {
      const destino = `${url}/rest/v1/${tabla}?select=${columnas}&limit=1000&offset=${desde}`;
      const r = await fetch(destino, {
        headers: { apikey: llave, Authorization: `Bearer ${llave}` },
      });
      if (!r.ok) throw new Error(`${tabla}: ${r.status} ${await r.text()}`);
      const lote = (await r.json()) as T[];
      filas.push(...lote);
      if (lote.length < 1000) break;
    }
    return filas;
  };
}

// ── Normalizacion de nombres ───────────────────────────────────────────────
/**
 * Trocea un nombre en palabras comparables: N con tilde -> N, sin tildes,
 * mayusculas, sin signos. Misma regla que normalizarNombre de
 * camaras-reglas.ts.
 *
 * El equivalente en PowerShell vive en biometrico-aplicar-ssn-zk.ps1 (funcion
 * Clave) y DEBE dar el mismo resultado: es la guarda que compara el nombre del
 * JSON contra el que tiene la base viva. Casos de prueba: "Munoz Varela",
 * "Cepeda Merino", "GUERRA  ACUNA", "Guadano De la hoz" (con sus tildes).
 */
export function tokens(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .replace(/[Ññ]/g, "N")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

/** Nombre normalizado en el ORDEN original: "GUERRA  ACUNA" -> "GUERRA ACUNA". */
export function claveNombre(s: string | null | undefined): string {
  return tokens(s).join(" ");
}

/** Nombre normalizado y ORDENADO: compara dos nombres sin importar el orden. */
export function claveOrdenada(s: string | null | undefined): string {
  return tokens(s).sort().join(" ");
}

/** Distancia de edicion. Solo para ORDENAR candidatos; no decide nada. */
export function distancia(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const act = [i, ...new Array<number>(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      act[j] = Math.min(prev[j] + 1, act[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = act;
  }
  return prev[n];
}

// ── Forma del zk.json ──────────────────────────────────────────────────────
export interface ZkPersona {
  Badgenumber: string;
  name: string | null;
  lastname: string | null;
  DEFAULTDEPTID: number | null;
}

/** Marcaciones por pin. Salen de acc_monitor_log con event_type = 14, no de CHECKINOUT. */
export interface ZkMarca {
  pin: string;
  n: number;
  primera: string | null;
  ultima: string | null;
}

export interface ZkExport {
  generado: string;
  origen: string;
  deptos: { DEPTID: number; DEPTNAME: string }[];
  personas: ZkPersona[];
  marcas: ZkMarca[];
}

// ── Forma del correspondencias.json ────────────────────────────────────────
export interface Correspondencia {
  /** USERINFO.Badgenumber, como texto. */
  badge: string;
  /** Nombre completo tal como lo tenia el biometrico cuando se resolvio. */
  nombreZk: string;
  /** claveNombre(nombreZk): lo que compara el script de PowerShell. */
  clave: string;
  /** La cedula de Gestivo que se va a escribir en USERINFO.SSN. */
  cedula: string;
  /** De que maestro salio la persona. */
  tipo: "conductor" | "empleado" | "";
  /** "automatico" = cruce unico del Excel; "manual" = lo eligio una persona. */
  origen: "automatico" | "manual";
}

export interface ArchivoCorrespondencias {
  generado: string;
  excel: string;
  resumen: {
    total: number;
    automatico: number;
    manual: number;
    correcciones: number;
    pendientes: number;
    errores: number;
    cedulasRepetidas: number;
  };
  correspondencias: Correspondencia[];
  pendientes: { badge: string; nombreZk: string; estado: string }[];
}
