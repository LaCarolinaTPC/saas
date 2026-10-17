/**
 * Excel de correspondencias huella -> persona de Gestivo.
 *
 * Solo LEE: la base del biometrico (via el JSON que exporta exportar-zk.ps1,
 * porque el proveedor ACE es de Windows) y los maestros de Gestivo.
 *
 * El archivo sale a %TEMP%: lleva nombres y cedulas, no va al repositorio.
 *
 * Uso:  npx tsx --tsconfig tsconfig.json scripts/biometrico-cruce-excel.mts
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import ExcelJS from "exceljs";

// ── Entorno ────────────────────────────────────────────────────────────────
function leerEnv(): Record<string, string> {
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
const env = leerEnv();
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
const LLAVE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SB || !LLAVE) {
  throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
}

async function todo<T>(tabla: string, columnas: string): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const url = `${URL_SB}/rest/v1/${tabla}?select=${columnas}&limit=1000&offset=${desde}`;
    const r = await fetch(url, { headers: { apikey: LLAVE!, Authorization: `Bearer ${LLAVE}` } });
    if (!r.ok) throw new Error(`${tabla}: ${r.status} ${await r.text()}`);
    const lote = (await r.json()) as T[];
    filas.push(...lote);
    if (lote.length < 1000) break;
  }
  return filas;
}

// ── Normalizacion de nombres ───────────────────────────────────────────────
/** Misma regla que normalizarNombre de camaras-reglas.ts: N con tilde -> N, sin tildes, mayusculas. */
function tokens(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .replace(/[Ññ]/g, "N")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

/** Distancia de edicion. Solo para ORDENAR los candidatos de quienes no cruzan. */
function distancia(a: string, b: string): number {
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

// ── Datos ──────────────────────────────────────────────────────────────────
interface ZkPersona {
  Badgenumber: string;
  name: string | null;
  lastname: string | null;
  DEFAULTDEPTID: number | null;
}
interface ZkMarca { pin: string; n: number; primera: string | null; ultima: string | null }
interface ZkExport {
  generado: string;
  origen: string;
  deptos: { DEPTID: number; DEPTNAME: string }[];
  personas: ZkPersona[];
  marcas: ZkMarca[];
}

interface Conductor {
  cedula: string; nombre: string; estado: string | null;
  fecha_ingreso: string | null; fecha_retiro: string | null;
}
interface Empleado {
  id: string; full_name: string; document_number: string | null;
  status: string | null; hire_date: string | null; end_date: string | null;
}

interface Maestro {
  tipo: "conductor" | "empleado";
  cedula: string;
  id: string;
  nombre: string;
  estado: string;
  desde: string | null;
  hasta: string | null;
  tok: Set<string>;
}

const rutaZk = path.join(os.tmpdir(), "gestivo-biometrico", "zk.json");
if (!fs.existsSync(rutaZk)) {
  throw new Error(`No existe ${rutaZk}. Corra primero exportar-zk.ps1`);
}
const zk = JSON.parse(fs.readFileSync(rutaZk, "utf8")) as ZkExport;

const [conductores, empleados] = await Promise.all([
  todo<Conductor>("conductores", "cedula,nombre,estado,fecha_ingreso,fecha_retiro"),
  todo<Empleado>("employees", "id,full_name,document_number,status,hire_date,end_date"),
]);

const maestro: Maestro[] = [
  ...conductores.map((c): Maestro => ({
    tipo: "conductor",
    cedula: c.cedula ?? "",
    id: "",
    nombre: c.nombre ?? "",
    estado: c.estado ?? "",
    desde: c.fecha_ingreso,
    hasta: c.fecha_retiro,
    tok: new Set(tokens(c.nombre)),
  })),
  ...empleados.map((e): Maestro => ({
    tipo: "empleado",
    cedula: e.document_number ?? "",
    id: e.id ?? "",
    nombre: e.full_name ?? "",
    estado: e.status ?? "",
    desde: e.hire_date,
    hasta: e.end_date,
    tok: new Set(tokens(e.full_name)),
  })),
];

const porPin = new Map(zk.marcas.map((m) => [String(m.pin), m]));
const deptos = new Map(zk.deptos.map((d) => [d.DEPTID, d.DEPTNAME]));

// ── El cruce ───────────────────────────────────────────────────────────────
type Estado = "AMBIGUO" | "SIN CRUCE" | "OK";
interface Fila {
  estado: Estado;
  badge: string;
  nombreZk: string;
  apellidoZk: string;
  completoZk: string;
  depto: string;
  marcaciones: number;
  primera: string;
  ultima: string;
  tipo: string;
  cedula: string;
  nombreGestivo: string;
  candidatos: string;
}

function etiqueta(m: Maestro): string {
  const llave = m.cedula || m.id.slice(0, 8);
  const marca = m.tipo === "conductor" ? "C" : "E";
  return `${m.nombre} [${marca} ${llave}${m.estado ? " " + m.estado : ""}]`;
}

const filas: Fila[] = [];
const erratas: string[] = [];

for (const p of zk.personas) {
  const badge = String(p.Badgenumber ?? "");
  const nomTok = tokens(p.name);
  const apeTok = tokens(p.lastname);
  const completo = [p.name, p.lastname].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const marca = porPin.get(badge);

  const base = {
    badge,
    nombreZk: (p.name ?? "").trim(),
    apellidoZk: (p.lastname ?? "").trim(),
    completoZk: completo,
    depto: deptos.get(p.DEFAULTDEPTID ?? -1) ?? String(p.DEFAULTDEPTID ?? ""),
    marcaciones: marca?.n ?? 0,
    primera: marca?.primera ?? "",
    ultima: marca?.ultima ?? "",
  };

  if (!nomTok.length || !apeTok.length) {
    filas.push({
      ...base, estado: "SIN CRUCE", tipo: "", cedula: "", nombreGestivo: "",
      candidatos: "sin nombre o sin apellido en el equipo",
    });
    continue;
  }

  // Regla: el nombre de Gestivo contiene TODOS los apellidos y el primer nombre.
  const requeridos = [nomTok[0], ...apeTok];
  const hits = maestro.filter((m) => requeridos.every((t) => m.tok.has(t)));

  if (hits.length === 1) {
    const m = hits[0];
    filas.push({
      ...base, estado: "OK", tipo: m.tipo,
      cedula: m.cedula || m.id, nombreGestivo: m.nombre, candidatos: "",
    });
  } else if (hits.length > 1) {
    // Varios candidatos con la MISMA cedula son la misma persona registrada en
    // los dos maestros (pasa de verdad: un conductor que tambien figura en
    // employees). No es ambiguedad: se elige el maestro que corresponde al
    // departamento del equipo y se deja constancia.
    const cedulas = new Set(hits.map((m) => m.cedula).filter(Boolean));
    if (cedulas.size === 1 && hits.every((m) => m.cedula)) {
      const esOperativo = (deptos.get(p.DEFAULTDEPTID ?? -1) ?? "").toUpperCase().startsWith("OPERA");
      const preferido =
        (esOperativo
          ? hits.find((m) => m.tipo === "conductor")
          : hits.find((m) => m.tipo === "empleado")) ?? hits[0];
      filas.push({
        ...base, estado: "OK", tipo: preferido.tipo,
        cedula: preferido.cedula, nombreGestivo: preferido.nombre,
        candidatos: `misma cedula en los dos maestros (${hits.map((m) => m.tipo).join(" + ")}); se tomo ${preferido.tipo} por el departamento`,
      });
    } else {
      filas.push({
        ...base, estado: "AMBIGUO", tipo: "", cedula: "", nombreGestivo: "",
        candidatos: hits
          .map((m) => `${etiqueta(m)} ${m.desde ?? "?"} a ${m.hasta ?? "activo"}`)
          .join("   |   "),
      });
    }
  } else {
    // Sin cruce: se ofrecen los 3 mas parecidos, solo para ORDENAR la decision humana.
    const objetivo = [...apeTok, nomTok[0]].sort().join(" ");
    const cerca = maestro
      .map((m) => ({ m, d: distancia(objetivo, [...m.tok].sort().join(" ")) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    filas.push({
      ...base, estado: "SIN CRUCE", tipo: "", cedula: "", nombreGestivo: "",
      candidatos: "parecidos: " + cerca.map((c) => `${etiqueta(c.m)} (dist ${c.d})`).join("   |   "),
    });
    if (cerca.length && cerca[0].d > 0 && cerca[0].d <= 2) {
      erratas.push(`${completo}  ->  ${cerca[0].m.nombre}?  (badge ${badge}, distancia ${cerca[0].d})`);
    }
  }
}

// Lo dudoso arriba y, dentro de cada grupo, lo de mas marcaciones primero:
// resolver a quien tiene 1.400 marcaciones vale mas que a quien tiene 2.
const orden: Record<Estado, number> = { AMBIGUO: 0, "SIN CRUCE": 1, OK: 2 };
filas.sort(
  (a, b) =>
    orden[a.estado] - orden[b.estado] ||
    b.marcaciones - a.marcaciones ||
    a.completoZk.localeCompare(b.completoZk, "es")
);

// Pines con marcaciones que ya no existen en USERINFO
const badges = new Set(zk.personas.map((p) => String(p.Badgenumber ?? "")));
const huerfanos = zk.marcas.filter((m) => !badges.has(String(m.pin)));
const marcasHuerfanas = huerfanos.reduce((s, m) => s + m.n, 0);

const nOk = filas.filter((f) => f.estado === "OK").length;
const nAmb = filas.filter((f) => f.estado === "AMBIGUO").length;
const nSin = filas.filter((f) => f.estado === "SIN CRUCE").length;

console.log(`personas biometrico: ${zk.personas.length}`);
console.log(`  OK ${nOk}  |  AMBIGUO ${nAmb}  |  SIN CRUCE ${nSin}`);
console.log(`maestro Gestivo: ${conductores.length} conductores + ${empleados.length} empleados`);
console.log(`pines huerfanos: ${huerfanos.length} (${marcasHuerfanas} marcaciones)`);

// ── Excel ──────────────────────────────────────────────────────────────────
const libro = new ExcelJS.Workbook();
libro.creator = "Gestivo";
libro.created = new Date();

// El maestro va primero: la hoja de correspondencias referencia su rango.
const hMaestro = libro.addWorksheet("Maestro Gestivo");
hMaestro.columns = [
  { header: "Tipo", key: "tipo", width: 12 },
  { header: "Cedula", key: "cedula", width: 14 },
  { header: "Id empleado", key: "id", width: 38 },
  { header: "Nombre en Gestivo", key: "nombre", width: 44 },
  { header: "Estado", key: "estado", width: 12 },
  { header: "Desde", key: "desde", width: 12 },
  { header: "Hasta", key: "hasta", width: 12 },
];
const maestroOrdenado = [...maestro].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
for (const m of maestroOrdenado) {
  hMaestro.addRow({
    tipo: m.tipo, cedula: m.cedula, id: m.id, nombre: m.nombre,
    estado: m.estado, desde: m.desde ?? "", hasta: m.hasta ?? "",
  });
}
hMaestro.getRow(1).font = { bold: true };
hMaestro.views = [{ state: "frozen", ySplit: 1 }];
const ultimaMaestro = maestroOrdenado.length + 1;
hMaestro.autoFilter = { from: "A1", to: `G${ultimaMaestro}` };

const h = libro.addWorksheet("Correspondencias");
h.columns = [
  { header: "Estado", key: "estado", width: 11 },
  { header: "Badge", key: "badge", width: 8 },
  { header: "Nombre (ZK)", key: "nombreZk", width: 20 },
  { header: "Apellido (ZK)", key: "apellidoZk", width: 24 },
  { header: "Nombre completo (ZK)", key: "completoZk", width: 36 },
  { header: "Departamento (ZK)", key: "depto", width: 16 },
  { header: "Marcaciones", key: "marcaciones", width: 12 },
  { header: "Primera", key: "primera", width: 19 },
  { header: "Ultima", key: "ultima", width: 19 },
  { header: "Tipo", key: "tipo", width: 11 },
  { header: "Cedula / Id", key: "cedula", width: 16 },
  { header: "Nombre en Gestivo (encontrado)", key: "nombreGestivo", width: 40 },
  { header: "Candidatos / parecidos", key: "candidatos", width: 70 },
  { header: "Nombre en Gestivo (corregir aqui)", key: "corregido", width: 44 },
  { header: "Cedula corregida (automatica)", key: "cedulaCorregida", width: 24 },
  { header: "Nota", key: "nota", width: 30 },
];
for (const f of filas) h.addRow(f);

const ultima = filas.length + 1;
h.getRow(1).font = { bold: true };
h.getRow(1).alignment = { vertical: "middle", wrapText: true };
h.getRow(1).height = 32;
h.views = [{ state: "frozen", xSplit: 5, ySplit: 1 }];
h.autoFilter = { from: "A1", to: `P${ultima}` };

const COLOR: Record<Estado, string> = {
  AMBIGUO: "FFFEF3C7",
  "SIN CRUCE": "FFFEE2E2",
  OK: "FFDCFCE7",
};
for (let i = 2; i <= ultima; i++) {
  const fila = h.getRow(i);
  const est = String(fila.getCell(1).value) as Estado;
  fila.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR[est] ?? "FFFFFFFF" } };
  fila.getCell(1).font = { bold: true };

  // La columna a llenar, resaltada
  const destino = fila.getCell(14);
  destino.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FF" } };
  destino.border = { left: { style: "medium", color: { argb: "FF4F46E5" } } };
  destino.dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [`='Maestro Gestivo'!$D$2:$D$${ultimaMaestro}`],
    showErrorMessage: false,
  };

  // La cedula se deriva del nombre elegido: no se puede guardar un par incoherente
  const derivada = fila.getCell(15);
  derivada.value = {
    formula: `IF(N${i}="","",IFERROR(INDEX('Maestro Gestivo'!$B$2:$B$${ultimaMaestro},MATCH(N${i},'Maestro Gestivo'!$D$2:$D$${ultimaMaestro},0)),"NO ENCONTRADO"))`,
  };
  derivada.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
}

const hRes = libro.addWorksheet("Resumen");
hRes.columns = [{ key: "a", width: 48 }, { key: "b", width: 78 }];
const pct = (n: number) => `${n} (${((n * 100) / filas.length).toFixed(1)} %)`;
const lineas: [string, string][] = [
  ["Cruce huella a persona de Gestivo", ""],
  ["Generado", new Date().toLocaleString("es-CO")],
  ["Origen del biometrico", zk.origen],
  ["Datos del biometrico exportados", zk.generado],
  ["", ""],
  ["Personas en el biometrico (USERINFO)", String(zk.personas.length)],
  ["   Cruce unico (automatico)", pct(nOk)],
  ["   Ambiguo: mas de un candidato", pct(nAmb)],
  ["   Sin cruce", pct(nSin)],
  ["", ""],
  ["Maestro de Gestivo", `${conductores.length} conductores + ${empleados.length} empleados`],
  ["", ""],
  ["Regla aplicada", "El nombre de Gestivo debe contener TODOS los apellidos del biometrico mas su primer nombre de pila."],
  ["Por que no por igualdad", "El biometrico guarda un solo nombre de pila ('Jair') y Gestivo el nombre legal ('JAIR ENRIQUE DONADO BARRIOS'). Por igualdad cruzaba el 18 %; por contencion, el 92 %."],
  ["Regla de los ambiguos", "Nunca se resuelve con mas de un candidato: lo decide una persona en la columna 'Nombre en Gestivo (corregir aqui)'."],
  ["Los 'parecidos'", "Solo ORDENAN la decision humana (distancia de edicion). No resuelven nada por su cuenta."],
  ["", ""],
  ["Pines con marcaciones que ya no estan en el equipo", `${huerfanos.length} pines, ${marcasHuerfanas.toLocaleString("es-CO")} marcaciones`],
  ["", "Son personas borradas de ZKAccess. No tienen nombre en ninguna parte, asi que no se pueden cruzar por nombre; la unica pista es su ventana de fechas."],
  ["", ""],
  ["Como llenar este archivo", "En la hoja Correspondencias, columna N (la azul), elija el nombre del desplegable. La cedula de la columna O se calcula sola."],
  ["Orden de las filas", "Primero AMBIGUO, luego SIN CRUCE, al final OK."],
  ["Advertencia", "Medido sobre una COPIA de la base del biometrico; con la base viva las cifras cambian un poco."],
];
for (const [a, b] of lineas) hRes.addRow({ a, b });
hRes.getRow(1).font = { bold: true, size: 13 };
hRes.getColumn(1).font = { bold: true };
hRes.getColumn(2).alignment = { wrapText: true, vertical: "top" };

if (erratas.length) {
  hRes.addRow({ a: "", b: "" });
  const cab = hRes.addRow({
    a: `Posibles erratas en ZKAccess (${erratas.length})`,
    b: "Corregir el nombre en el equipo arregla el dato en origen",
  });
  cab.font = { bold: true };
  for (const e of erratas) hRes.addRow({ a: "", b: e });
}

const dir = path.join(os.tmpdir(), "gestivo-biometrico");
fs.mkdirSync(dir, { recursive: true });
const hoy = new Date().toISOString().slice(0, 10);
const destino = path.join(dir, `cruce-biometrico-${hoy}.xlsx`);
await libro.xlsx.writeFile(destino);
console.log(`\nExcel: ${destino}`);
if (erratas.length) console.log(`posibles erratas en ZKAccess: ${erratas.length}`);
