/**
 * Excel de correspondencias huella -> persona de Gestivo.
 *
 * Solo LEE: la base del biometrico (via el JSON que exporta
 * biometrico-exportar-zk.ps1, porque el proveedor ACE es de Windows) y los
 * maestros de Gestivo.
 *
 * El archivo sale a %TEMP%: lleva nombres y cedulas, no va al repositorio.
 *
 * El 74 % de las personas del biometrico ya esta retirada (539 de 732 cruces),
 * asi que la hoja marca quien sigue trabajando y ordena por eso: resolver a
 * mano a quien marco hace dos anos no le sirve a nadie. El umbral de "activo"
 * son las marcaciones de los ultimos DIAS_ACTIVO dias.
 *
 * Uso:  npx tsx --tsconfig tsconfig.json scripts/biometrico-cruce-excel.mts
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  claveOrdenada,
  crearLector,
  distancia,
  DIR_SALIDA,
  leerEnv,
  RUTA_ZK,
  tokens,
  type ZkExport,
} from "./biometrico-comun.mjs";

/** Marco hace menos de esto = sigue trabajando, vale resolverlo a mano. */
const DIAS_ACTIVO = 90;

const env = leerEnv();
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
const LLAVE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SB || !LLAVE) {
  throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
}
const todo = crearLector(URL_SB, LLAVE);

// ── Datos ──────────────────────────────────────────────────────────────────
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

if (!fs.existsSync(RUTA_ZK)) {
  throw new Error(`No existe ${RUTA_ZK}. Corra primero biometrico-exportar-zk.ps1`);
}
const zk = JSON.parse(fs.readFileSync(RUTA_ZK, "utf8")) as ZkExport;

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

// ── Relevancia ─────────────────────────────────────────────────────────────
// La ultima marcacion es la unica senal de "sigue trabajando" que tiene el
// biometrico: su USERINFO no guarda estado ni fecha de retiro. Se usa para
// decidir en que vale la pena gastar trabajo humano.
const HOY = new Date();
function diasDesde(fecha: string | null | undefined): number | null {
  if (!fecha) return null;
  const t = Date.parse(fecha.replace(" ", "T"));
  if (!Number.isFinite(t)) return null;
  return Math.floor((HOY.getTime() - t) / 86_400_000);
}

// ── El cruce ───────────────────────────────────────────────────────────────
type Estado = "AMBIGUO" | "SIN CRUCE" | "OK";
interface Fila {
  estado: Estado;
  /** "SI" si marco en los ultimos DIAS_ACTIVO dias; "" si nunca marco. */
  activo: string;
  /** Dias desde la ultima marcacion. "" si nunca marco. */
  diasSinMarcar: number | "";
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
  /** Estado del maestro de Gestivo (activo / retirado). Solo en los OK. */
  estadoGestivo: string;
  nombreGestivo: string;
  candidatos: string;
}

function etiqueta(m: Maestro): string {
  const llave = m.cedula || m.id.slice(0, 8);
  const marca = m.tipo === "conductor" ? "C" : "E";
  return `${m.nombre} [${marca} ${llave}${m.estado ? " " + m.estado : ""}]`;
}

const filas: Fila[] = [];
interface Errata {
  badge: string; activo: string; zk: string;
  gestivo: string; cedula: string; distancia: number;
}
const erratas: Errata[] = [];

for (const p of zk.personas) {
  const badge = String(p.Badgenumber ?? "");
  const nomTok = tokens(p.name);
  const apeTok = tokens(p.lastname);
  const completo = [p.name, p.lastname].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const marca = porPin.get(badge);

  const dias = diasDesde(marca?.ultima);
  const base = {
    badge,
    activo: dias !== null && dias <= DIAS_ACTIVO ? "SI" : "",
    diasSinMarcar: (dias ?? "") as number | "",
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
      ...base, estado: "SIN CRUCE", tipo: "", cedula: "", estadoGestivo: "", nombreGestivo: "",
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
      cedula: m.cedula || m.id, estadoGestivo: m.estado, nombreGestivo: m.nombre, candidatos: "",
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
        cedula: preferido.cedula, estadoGestivo: preferido.estado, nombreGestivo: preferido.nombre,
        candidatos: `misma cedula en los dos maestros (${hits.map((m) => m.tipo).join(" + ")}); se tomo ${preferido.tipo} por el departamento`,
      });
    } else {
      filas.push({
        ...base, estado: "AMBIGUO", tipo: "", cedula: "", estadoGestivo: "", nombreGestivo: "",
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
      ...base, estado: "SIN CRUCE", tipo: "", cedula: "", estadoGestivo: "", nombreGestivo: "",
      candidatos: "parecidos: " + cerca.map((c) => `${etiqueta(c.m)} (dist ${c.d})`).join("   |   "),
    });
    if (cerca.length && cerca[0].d > 0 && cerca[0].d <= 2) {
      erratas.push({
        badge,
        activo: base.activo,
        zk: completo,
        gestivo: cerca[0].m.nombre,
        cedula: cerca[0].m.cedula,
        distancia: cerca[0].d,
      });
    }
  }
}

// Orden: primero lo que hay que resolver a mano Y sigue trabajando; despues el
// resto de lo dudoso; al final los cruces automaticos. El 74 % del biometrico
// ya esta retirado, asi que sin este orden las 12 filas que importan quedan
// enterradas entre 46 que no.
const orden: Record<Estado, number> = { AMBIGUO: 0, "SIN CRUCE": 1, OK: 2 };
filas.sort(
  (a, b) => {
    const porResolverA = a.estado === "OK" ? 1 : 0;
    const porResolverB = b.estado === "OK" ? 1 : 0;
    // Activo pendiente > pendiente antiguo > OK
    const rangoA = porResolverA === 0 && a.activo === "SI" ? 0 : porResolverA === 0 ? 1 : 2;
    const rangoB = porResolverB === 0 && b.activo === "SI" ? 0 : porResolverB === 0 ? 1 : 2;
    return (
      rangoA - rangoB ||
      orden[a.estado] - orden[b.estado] ||
      b.marcaciones - a.marcaciones ||
      a.completoZk.localeCompare(b.completoZk, "es")
    );
  }
);

// Pines con marcaciones que ya no existen en USERINFO
const badges = new Set(zk.personas.map((p) => String(p.Badgenumber ?? "")));
const huerfanos = zk.marcas.filter((m) => !badges.has(String(m.pin)));
const marcasHuerfanas = huerfanos.reduce((s, m) => s + m.n, 0);

const nOk = filas.filter((f) => f.estado === "OK").length;
const nAmb = filas.filter((f) => f.estado === "AMBIGUO").length;
const nSin = filas.filter((f) => f.estado === "SIN CRUCE").length;
const pendientes = filas.filter((f) => f.estado !== "OK");
const pendActivos = pendientes.filter((f) => f.activo === "SI");
const okRetirados = filas.filter((f) => f.estado === "OK" && /retir|inactiv/i.test(f.estadoGestivo)).length;

console.log(`personas biometrico: ${zk.personas.length}`);
console.log(`  OK ${nOk}  |  AMBIGUO ${nAmb}  |  SIN CRUCE ${nSin}`);
console.log(`  de los OK, retirados en Gestivo: ${okRetirados}`);
console.log(`  por resolver a mano que SIGUEN MARCANDO (<= ${DIAS_ACTIVO} dias): ${pendActivos.length}`);
console.log(`  por resolver antiguos (se descartan): ${pendientes.length - pendActivos.length}`);
console.log(`maestro Gestivo: ${conductores.length} conductores + ${empleados.length} empleados`);
console.log(`pines huerfanos: ${huerfanos.length} (${marcasHuerfanas} marcaciones)`);

// ── Conflictos ─────────────────────────────────────────────────────────────
// Todo lo que una persona deberia mirar antes de confiar en el cruce. Antes
// vivia en un script aparte (_dups-tmp.mts) que no quedaba en ninguna parte.
interface Conflicto {
  tipo: string;
  activo: string;
  clave: string;
  detalle: string;
  revisar: string;
}
const conflictos: Conflicto[] = [];

// 1. La misma cedula en dos badges: la persona esta enrolada dos veces en el
//    equipo. Los dos badges reciben la misma cedula (correcto), pero conviene
//    saber si uno es un enrolamiento viejo que deberia borrarse.
const porCedula = new Map<string, Fila[]>();
for (const f of filas) {
  if (f.estado !== "OK" || !f.cedula) continue;
  if (!porCedula.has(f.cedula)) porCedula.set(f.cedula, []);
  porCedula.get(f.cedula)!.push(f);
}
for (const [cedula, grupo] of porCedula) {
  if (grupo.length < 2) continue;
  conflictos.push({
    tipo: "CEDULA EN DOS BADGES",
    activo: grupo.some((f) => f.activo === "SI") ? "SI" : "",
    clave: cedula,
    detalle: grupo
      .map((f) => `badge ${f.badge} "${f.completoZk}" (${f.marcaciones} marc., ult ${f.ultima.slice(0, 10) || "nunca"})`)
      .join("   |   "),
    revisar: `${grupo[0].nombreGestivo}: enrolada ${grupo.length} veces. Los dos badges reciben la misma cedula; decida si borra el enrolamiento viejo en ZKAccess.`,
  });
}

// 2. Nombres repetidos en el maestro de Gestivo: rompen el desplegable de la
//    columna N (la formula de la columna O toma el primero en silencio), asi
//    que en esas filas hay que escribir la cedula a mano.
const porNombreGestivo = new Map<string, Maestro[]>();
for (const m of maestro) {
  const k = claveOrdenada(m.nombre);
  if (!k) continue;
  if (!porNombreGestivo.has(k)) porNombreGestivo.set(k, []);
  porNombreGestivo.get(k)!.push(m);
}
for (const grupo of porNombreGestivo.values()) {
  const cedulas = new Set(grupo.map((m) => m.cedula).filter(Boolean));
  if (grupo.length < 2 || cedulas.size < 2) continue;
  conflictos.push({
    tipo: "NOMBRE REPETIDO EN GESTIVO",
    activo: grupo.some((m) => !/retir|inactiv/i.test(m.estado)) ? "SI" : "",
    clave: grupo[0].nombre,
    detalle: grupo.map((m) => `${m.tipo} ${m.cedula} [${m.estado || "?"}] ${m.desde ?? "?"} a ${m.hasta ?? "activo"}`).join("   |   "),
    revisar: "Dos personas distintas con el mismo nombre. El desplegable no alcanza: escriba la CEDULA en la columna N.",
  });
}

// 3. Posible errata de digitacion en ZKAccess (distancia 1 o 2 del mejor
//    candidato). Corregir el nombre en el equipo arregla el dato en origen.
for (const e of erratas) {
  conflictos.push({
    tipo: "POSIBLE ERRATA EN ZK",
    activo: e.activo,
    clave: `badge ${e.badge}`,
    detalle: `"${e.zk}"  ->  "${e.gestivo}" (cedula ${e.cedula}, distancia ${e.distancia})`,
    revisar: "Parece el mismo nombre mal escrito en el equipo. Confirme y corrijalo en ZKAccess, o resuelva la fila en la columna N.",
  });
}

// 4. Dos badges del biometrico que apuntan a la misma persona por nombre
//    aunque no hayan cruzado (mismos apellidos y primer nombre contenido).
const personasZk = zk.personas.filter((p) => tokens(p.lastname).length && tokens(p.name).length);
const porFila = new Map(filas.map((f) => [f.badge, f]));
for (let i = 0; i < personasZk.length; i++) {
  for (let j = i + 1; j < personasZk.length; j++) {
    const a = personasZk[i];
    const b = personasZk[j];
    if (claveOrdenada(a.lastname) !== claveOrdenada(b.lastname)) continue;
    const na = tokens(a.name);
    const nb = tokens(b.name);
    if (na[0] !== nb[0]) continue;
    const sa = new Set(na);
    const sb = new Set(nb);
    if (!na.every((t) => sb.has(t)) && !nb.every((t) => sa.has(t))) continue;
    const fa = porFila.get(String(a.Badgenumber));
    const fb = porFila.get(String(b.Badgenumber));
    // Si los dos cruzaron a la misma cedula ya salio en el conflicto 1.
    if (fa?.cedula && fa.cedula === fb?.cedula) continue;
    conflictos.push({
      tipo: "DOS BADGES, MISMA PERSONA?",
      activo: fa?.activo === "SI" || fb?.activo === "SI" ? "SI" : "",
      clave: `${a.Badgenumber} + ${b.Badgenumber}`,
      detalle:
        `badge ${a.Badgenumber} "${a.name} ${a.lastname}" (${fa?.marcaciones ?? 0} marc., ${fa?.estado ?? "?"}` +
        `${fa?.cedula ? " -> " + fa.cedula : ""})   |   ` +
        `badge ${b.Badgenumber} "${b.name} ${b.lastname}" (${fb?.marcaciones ?? 0} marc., ${fb?.estado ?? "?"}` +
        `${fb?.cedula ? " -> " + fb.cedula : ""})`,
      revisar: "Mismos apellidos y primer nombre: puede ser la misma persona enrolada dos veces con el nombre escrito distinto.",
    });
  }
}

// 5. Pines huerfanos con muchas marcaciones: personas borradas de ZKAccess.
//    No tienen nombre en ninguna parte, asi que no se pueden cruzar.
for (const m of huerfanos.filter((h) => h.n >= 50).sort((x, y) => y.n - x.n)) {
  const dias = diasDesde(m.ultima);
  conflictos.push({
    tipo: "PIN BORRADO CON HISTORIA",
    activo: dias !== null && dias <= DIAS_ACTIVO ? "SI" : "",
    clave: `pin ${m.pin}`,
    detalle: `${m.n} marcaciones, ${m.primera?.slice(0, 10) ?? "?"} a ${m.ultima?.slice(0, 10) ?? "?"}`,
    revisar: "El pin tiene marcaciones pero ya no esta en USERINFO: lo borraron del equipo. Sin nombre no hay forma de cruzarlo.",
  });
}

// A la hoja solo van los conflictos de gente que SIGUE MARCANDO. Un
// enrolamiento duplicado de alguien que se fue en 2024, o una errata en el
// nombre de un retirado, no le sirve a nadie: solo esconde los que importan.
// Los demas se cuentan en el Resumen y nada mas.
conflictos.sort(
  (a, b) => a.tipo.localeCompare(b.tipo, "es") || a.clave.localeCompare(b.clave, "es")
);
const conflictosVivos = conflictos.filter((c) => c.activo === "SI");
const conflictosViejos = conflictos.length - conflictosVivos.length;
console.log(`conflictos por revisar: ${conflictosVivos.length} (${conflictosViejos} de gente retirada, omitidos)`);

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
// El orden de esta lista define las letras de columna. La que llena la persona
// y la que deriva la cedula se localizan por su clave (COL_CORREGIDO /
// COL_CEDULA_CORREGIDA) y NO a mano: agregar una columna al principio ya
// desalineo una vez la validacion y la formula.
const COLUMNAS = [
  { header: "Estado", key: "estado", width: 11 },
  { header: "Sigue marcando", key: "activo", width: 9 },
  { header: "Dias sin marcar", key: "diasSinMarcar", width: 9 },
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
  { header: "Estado en Gestivo", key: "estadoGestivo", width: 13 },
  { header: "Nombre en Gestivo (encontrado)", key: "nombreGestivo", width: 40 },
  { header: "Candidatos / parecidos", key: "candidatos", width: 70 },
  { header: "Nombre en Gestivo (corregir aqui)", key: "corregido", width: 44 },
  { header: "Cedula corregida (automatica)", key: "cedulaCorregida", width: 24 },
  { header: "Nota", key: "nota", width: 30 },
];
h.columns = COLUMNAS;
for (const f of filas) h.addRow(f);

/** Numero de columna (base 1) de una clave; letra para las formulas. */
const numCol = (clave: string) => COLUMNAS.findIndex((c) => c.key === clave) + 1;
const letraCol = (clave: string) => {
  let n = numCol(clave);
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};
const COL_CORREGIDO = numCol("corregido");
const COL_CEDULA_CORREGIDA = numCol("cedulaCorregida");
const LETRA_CORREGIDO = letraCol("corregido");
const LETRA_FINAL = letraCol("nota");

const ultima = filas.length + 1;
h.getRow(1).font = { bold: true };
h.getRow(1).alignment = { vertical: "middle", wrapText: true };
h.getRow(1).height = 32;
// Se congela hasta el nombre completo: a la derecha quedan las columnas de
// trabajo y el nombre tiene que seguir visible al llenarlas.
h.views = [{ state: "frozen", xSplit: numCol("completoZk"), ySplit: 1 }];
h.autoFilter = { from: "A1", to: `${LETRA_FINAL}${ultima}` };

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

  // "Sigue marcando": lo unico que decide si vale la pena resolver la fila.
  const activo = fila.getCell(numCol("activo"));
  if (String(activo.value ?? "") === "SI") {
    activo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    activo.font = { bold: true, color: { argb: "FF1D4ED8" } };
  }
  // Retirado en Gestivo: en gris, para que no distraiga.
  const estG = fila.getCell(numCol("estadoGestivo"));
  if (/retir|inactiv/i.test(String(estG.value ?? ""))) {
    estG.font = { color: { argb: "FF94A3B8" } };
  }

  // La columna a llenar, resaltada
  const destino = fila.getCell(COL_CORREGIDO);
  destino.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FF" } };
  destino.border = { left: { style: "medium", color: { argb: "FF4F46E5" } } };
  destino.dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [`='Maestro Gestivo'!$D$2:$D$${ultimaMaestro}`],
    showErrorMessage: false,
  };

  // La cedula se deriva del nombre elegido: no se puede guardar un par
  // incoherente. Es solo una ayuda visual: el resolvedor la RECALCULA y no
  // confia en este resultado (los nombres repetidos del maestro hacen que
  // INDEX/MATCH tome el primero en silencio; ver la hoja Conflictos).
  const derivada = fila.getCell(COL_CEDULA_CORREGIDA);
  derivada.value = {
    formula:
      `IF(${LETRA_CORREGIDO}${i}="","",IFERROR(INDEX('Maestro Gestivo'!$B$2:$B$${ultimaMaestro},` +
      `MATCH(${LETRA_CORREGIDO}${i},'Maestro Gestivo'!$D$2:$D$${ultimaMaestro},0)),"NO ENCONTRADO"))`,
  };
  derivada.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
}

// ── Hoja de conflictos ─────────────────────────────────────────────────────
const hConf = libro.addWorksheet("Conflictos");
hConf.columns = [
  { header: "Tipo", key: "tipo", width: 26 },
  { header: "Sigue marcando", key: "activo", width: 9 },
  { header: "Clave", key: "clave", width: 30 },
  { header: "Detalle", key: "detalle", width: 95 },
  { header: "Que revisar", key: "revisar", width: 72 },
];
for (const c of conflictosVivos) hConf.addRow(c);
if (!conflictosVivos.length) {
  hConf.addRow({
    tipo: "Sin conflictos",
    revisar: `Ninguno involucra a alguien que haya marcado en los ultimos ${DIAS_ACTIVO} dias.`,
  });
}
hConf.getRow(1).font = { bold: true };
hConf.getRow(1).alignment = { vertical: "middle", wrapText: true };
hConf.getRow(1).height = 28;
hConf.views = [{ state: "frozen", ySplit: 1 }];
if (conflictosVivos.length) {
  hConf.autoFilter = { from: "A1", to: `E${conflictosVivos.length + 1}` };
}
const COLOR_CONFLICTO: Record<string, string> = {
  "CEDULA EN DOS BADGES": "FFFEF3C7",
  "NOMBRE REPETIDO EN GESTIVO": "FFFEE2E2",
  "POSIBLE ERRATA EN ZK": "FFFEF9C3",
  "DOS BADGES, MISMA PERSONA?": "FFFFEDD5",
  "PIN BORRADO CON HISTORIA": "FFF1F5F9",
};
for (let i = 2; i <= conflictosVivos.length + 1; i++) {
  const fila = hConf.getRow(i);
  const tipo = String(fila.getCell(1).value ?? "");
  fila.getCell(1).fill = {
    type: "pattern", pattern: "solid",
    fgColor: { argb: COLOR_CONFLICTO[tipo] ?? "FFFFFFFF" },
  };
  fila.getCell(1).font = { bold: true };
  fila.getCell(4).alignment = { wrapText: true, vertical: "top" };
  fila.getCell(5).alignment = { wrapText: true, vertical: "top" };
  if (String(fila.getCell(2).value ?? "") === "SI") {
    fila.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    fila.getCell(2).font = { bold: true, color: { argb: "FF1D4ED8" } };
  }
}

const hRes = libro.addWorksheet("Resumen");
hRes.columns = [{ key: "a", width: 48 }, { key: "b", width: 78 }];
const pct = (n: number) => `${n} (${((n * 100) / filas.length).toFixed(1)} %)`;
const nPendViejos = pendientes.length - pendActivos.length;
const lineas: [string, string][] = [
  ["Cruce huella a persona de Gestivo", ""],
  ["Generado", new Date().toLocaleString("es-CO")],
  ["Origen del biometrico", zk.origen],
  ["Datos del biometrico exportados", zk.generado],
  ["", ""],
  ["LO QUE HAY QUE HACER A MANO", `${pendActivos.length} filas`],
  ["", `Son las que no cruzaron Y marcaron en los ultimos ${DIAS_ACTIVO} dias: estan arriba en la hoja Correspondencias, con "SI" en "Sigue marcando". Llene su columna "Nombre en Gestivo (corregir aqui)".`],
  ["Se descartan", `${nPendViejos} filas sin cruce de gente que ya no marca`],
  ["", "Decision del usuario (2026-10-19): si la persona ya no esta, su historial antiguo no interesa. Esas quedan sin cedula en el biometrico, a proposito."],
  ["", ""],
  ["Personas en el biometrico (USERINFO)", String(zk.personas.length)],
  ["   Cruce unico (automatico)", pct(nOk)],
  ["      de esos, retirados en Gestivo", `${okRetirados} (${((okRetirados * 100) / Math.max(nOk, 1)).toFixed(0)} % de los cruces)`],
  ["   Ambiguo: mas de un candidato", pct(nAmb)],
  ["   Sin cruce", pct(nSin)],
  ["", ""],
  ["Conflictos por revisar", `${conflictosVivos.length} (hoja Conflictos)`],
  ["Conflictos omitidos", `${conflictosViejos} de gente que ya no marca`],
  ["", ""],
  ["Maestro de Gestivo", `${conductores.length} conductores + ${empleados.length} empleados`],
  ["", ""],
  ["Regla aplicada", "El nombre de Gestivo debe contener TODOS los apellidos del biometrico mas su primer nombre de pila."],
  ["Por que no por igualdad", "El biometrico guarda un solo nombre de pila ('Jair') y Gestivo el nombre legal ('JAIR ENRIQUE DONADO BARRIOS'). Por igualdad cruzaba el 18 %; por contencion, el 92 %."],
  ["Regla de los ambiguos", "Nunca se resuelve con mas de un candidato: lo decide una persona en la columna 'Nombre en Gestivo (corregir aqui)'."],
  ["Los 'parecidos'", "Solo ORDENAN la decision humana (distancia de edicion). No resuelven nada por su cuenta."],
  ["Que es 'Sigue marcando'", `El biometrico no guarda estado ni retiro: la unica senal es la fecha de la ultima marcacion. "SI" = marco hace ${DIAS_ACTIVO} dias o menos.`],
  ["", ""],
  ["Pines con marcaciones que ya no estan en el equipo", `${huerfanos.length} pines, ${marcasHuerfanas.toLocaleString("es-CO")} marcaciones`],
  ["", "Son personas borradas de ZKAccess. No tienen nombre en ninguna parte, asi que no se pueden cruzar por nombre; la unica pista es su ventana de fechas."],
  ["", ""],
  ["Como llenar este archivo", `En la hoja Correspondencias, columna "${COLUMNAS[COL_CORREGIDO - 1].header}" (la azul, columna ${LETRA_CORREGIDO}), elija el nombre del desplegable. La cedula de al lado se calcula sola, pero el resolvedor la vuelve a calcular y no confia en ella.`],
  ["Cuando el desplegable no alcanza", "Si el nombre esta repetido en Gestivo (ver hoja Conflictos), escriba la CEDULA en esa misma columna en vez del nombre."],
  ["Orden de las filas", "Primero lo pendiente de gente que sigue marcando, luego el resto de lo pendiente, al final los cruces automaticos."],
  ["Advertencia", "Medido sobre una COPIA de la base del biometrico; con la base viva las cifras cambian un poco."],
];
for (const [a, b] of lineas) hRes.addRow({ a, b });
hRes.getRow(1).font = { bold: true, size: 13 };
hRes.getColumn(1).font = { bold: true };
hRes.getColumn(2).alignment = { wrapText: true, vertical: "top" };
// La linea del trabajo pendiente, resaltada: es la unica accion del archivo.
for (let i = 1; i <= hRes.rowCount; i++) {
  if (String(hRes.getRow(i).getCell(1).value ?? "") === "LO QUE HAY QUE HACER A MANO") {
    hRes.getRow(i).getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    hRes.getRow(i).getCell(2).font = { bold: true, size: 12 };
  }
}

fs.mkdirSync(DIR_SALIDA, { recursive: true });
const hoy = new Date().toISOString().slice(0, 10);
const destino = path.join(DIR_SALIDA, `cruce-biometrico-${hoy}.xlsx`);
await libro.xlsx.writeFile(destino);
console.log(`\nExcel: ${destino}`);
