/**
 * Excel resuelto -> correspondencias.json, lo que el script de PowerShell
 * escribira en USERINFO.SSN del biometrico.
 *
 * Solo LEE el Excel. No toca Supabase ni el biometrico, asi que corre sin
 * llaves configuradas: las cedulas salen de la hoja "Maestro Gestivo" del
 * mismo libro, que es exactamente la lista de la que eligio la persona.
 *
 * NO confia en la columna "Cedula corregida (automatica)": su formula
 * INDEX/MATCH toma el primer nombre que coincide, y en el maestro hay nombres
 * repetidos con cedulas distintas (ver la hoja Conflictos). La cedula se
 * recalcula aqui y cualquier ambiguedad es un error que detiene todo.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.json scripts/biometrico-resolver-correspondencias.mts
 *   ... --excel "C:\\ruta\\cruce-biometrico-2026-10-19.xlsx"
 *   ... --aceptar-correcciones     (permitir cambiar un cruce automatico)
 *   ... --incluir-inactivos        (tambien exigir las filas de gente que ya no marca)
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  claveNombre,
  claveOrdenada,
  DIR_SALIDA,
  RUTA_CORRESPONDENCIAS,
  type ArchivoCorrespondencias,
  type Correspondencia,
} from "./biometrico-comun.mjs";

// ── Argumentos ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const bandera = (n: string) => args.includes(`--${n}`);
function valor(n: string): string | null {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}
const ACEPTAR_CORRECCIONES = bandera("aceptar-correcciones");
const INCLUIR_INACTIVOS = bandera("incluir-inactivos");

/** El Excel mas reciente de la carpeta de trabajo, si no se da uno. */
function excelMasReciente(): string {
  if (!fs.existsSync(DIR_SALIDA)) {
    throw new Error(`No existe ${DIR_SALIDA}. Corra primero biometrico-cruce-excel.mts`);
  }
  const candidatos = fs
    .readdirSync(DIR_SALIDA)
    .filter((f) => /^cruce-biometrico-.*\.xlsx$/i.test(f) && !f.startsWith("~$"))
    .map((f) => ({ f, t: fs.statSync(path.join(DIR_SALIDA, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!candidatos.length) {
    throw new Error(`No hay ningun cruce-biometrico-*.xlsx en ${DIR_SALIDA}`);
  }
  return path.join(DIR_SALIDA, candidatos[0].f);
}

const rutaExcel = valor("excel") ?? excelMasReciente();
if (!fs.existsSync(rutaExcel)) throw new Error(`No existe el Excel: ${rutaExcel}`);

// ── Lectura del Excel ──────────────────────────────────────────────────────
const libro = new ExcelJS.Workbook();
await libro.xlsx.readFile(rutaExcel);

/**
 * Texto plano de una celda. Aplana lo que ExcelJS devuelve segun el caso:
 * numero, texto enriquecido, hipervinculo o formula con su ultimo resultado
 * calculado.
 */
function texto(celda: ExcelJS.Cell | undefined): string {
  const v = celda?.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v).trim();
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace("T", " ");
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("richText" in o && Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map((t) => t.text).join("").trim();
    }
    if ("text" in o) return String(o.text ?? "").trim();
    if ("result" in o) return String(o.result ?? "").trim();
  }
  return String(v).trim();
}

/** Indices de columna por su cabecera, para no depender de letras fijas. */
function indicesPorCabecera(hoja: ExcelJS.Worksheet): Map<string, number> {
  const m = new Map<string, number>();
  hoja.getRow(1).eachCell((celda, n) => {
    const k = texto(celda).toLowerCase();
    if (k && !m.has(k)) m.set(k, n);
  });
  return m;
}

function exigirColumna(m: Map<string, number>, cabecera: string, hoja: string): number {
  const n = m.get(cabecera.toLowerCase());
  if (!n) {
    throw new Error(
      `La hoja "${hoja}" no tiene la columna "${cabecera}". ` +
        `Columnas encontradas: ${[...m.keys()].join(", ")}`
    );
  }
  return n;
}

// ── Maestro de Gestivo ─────────────────────────────────────────────────────
const hMaestro = libro.getWorksheet("Maestro Gestivo");
if (!hMaestro) throw new Error('El Excel no tiene la hoja "Maestro Gestivo".');
const colM = indicesPorCabecera(hMaestro);
const mTipo = exigirColumna(colM, "Tipo", "Maestro Gestivo");
const mCedula = exigirColumna(colM, "Cedula", "Maestro Gestivo");
const mNombre = exigirColumna(colM, "Nombre en Gestivo", "Maestro Gestivo");
const mEstado = exigirColumna(colM, "Estado", "Maestro Gestivo");

interface Persona {
  tipo: "conductor" | "empleado" | "";
  cedula: string;
  nombre: string;
  estado: string;
}
const maestro: Persona[] = [];
hMaestro.eachRow((fila, i) => {
  if (i === 1) return;
  const nombre = texto(fila.getCell(mNombre));
  if (!nombre) return;
  const t = texto(fila.getCell(mTipo)).toLowerCase();
  maestro.push({
    tipo: t === "conductor" || t === "empleado" ? t : "",
    cedula: texto(fila.getCell(mCedula)),
    nombre,
    estado: texto(fila.getCell(mEstado)),
  });
});

/** Agrupa por una llave, descartando las vacias. */
function agrupar<T>(items: T[], llave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = llave(it);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(it);
  }
  return m;
}
const porNombreExacto = agrupar(maestro, (p) => p.nombre);
const porNombreClave = agrupar(maestro, (p) => claveNombre(p.nombre));
const porCedula = agrupar(maestro, (p) => p.cedula);
/**
 * Agrupado SIN importar el orden de las palabras. Gestivo tiene la misma
 * persona dos veces con el nombre al reves y la cedula mal digitada
 * ("IVAN ANTONIO MARTINEZ HOYOS" 724432641 y "MARTINEZ HOYOS IVAN ANTONIO"
 * 72432641, un digito de mas). El desplegable las ofrece como dos entradas
 * distintas, asi que elegir una PARECE inequivoco y se escribiria una cedula
 * posiblemente errada. Con esto se detecta y se exige escribir la cedula.
 */
const porNombreOrdenado = agrupar(maestro, (p) => claveOrdenada(p.nombre));

// ── Correspondencias ───────────────────────────────────────────────────────
const hCorr = libro.getWorksheet("Correspondencias");
if (!hCorr) throw new Error('El Excel no tiene la hoja "Correspondencias".');
const colC = indicesPorCabecera(hCorr);
const cEstado = exigirColumna(colC, "Estado", "Correspondencias");
const cActivo = exigirColumna(colC, "Sigue marcando", "Correspondencias");
const cBadge = exigirColumna(colC, "Badge", "Correspondencias");
const cNombreZk = exigirColumna(colC, "Nombre (ZK)", "Correspondencias");
const cApellidoZk = exigirColumna(colC, "Apellido (ZK)", "Correspondencias");
const cCompleto = exigirColumna(colC, "Nombre completo (ZK)", "Correspondencias");
const cDepto = exigirColumna(colC, "Departamento (ZK)", "Correspondencias");
const cTipo = exigirColumna(colC, "Tipo", "Correspondencias");
const cCedula = exigirColumna(colC, "Cedula / Id", "Correspondencias");
const cCorregido = exigirColumna(colC, "Nombre en Gestivo (corregir aqui)", "Correspondencias");

const CEDULA_RE = /^\d{5,20}$/;

interface Problema { badge: string; nombre: string; motivo: string; activo: boolean }
const errores: Problema[] = [];
const pendientes: { badge: string; nombreZk: string; estado: string; activo: boolean }[] = [];
const correcciones: Problema[] = [];
const correspondencias: Correspondencia[] = [];
const vistos = new Map<string, number>();

hCorr.eachRow((fila, i) => {
  if (i === 1) return;
  const badge = texto(fila.getCell(cBadge));
  const estado = texto(fila.getCell(cEstado)).toUpperCase();
  const activo = texto(fila.getCell(cActivo)).toUpperCase() === "SI";
  const nombreZk = texto(fila.getCell(cCompleto)) ||
    [texto(fila.getCell(cNombreZk)), texto(fila.getCell(cApellidoZk))].filter(Boolean).join(" ");
  const cedulaAuto = texto(fila.getCell(cCedula));
  const tipoAuto = texto(fila.getCell(cTipo)).toLowerCase();
  const corregido = texto(fila.getCell(cCorregido));
  const esOperativo = texto(fila.getCell(cDepto)).toUpperCase().startsWith("OPERA");

  if (!badge) {
    errores.push({ badge: `fila ${i}`, nombre: nombreZk, motivo: "SIN BADGE en la fila", activo });
    return;
  }
  // Un badge dos veces en la hoja: el Excel se edito mal (filas copiadas).
  const anterior = vistos.get(badge);
  if (anterior) {
    errores.push({
      badge, nombre: nombreZk, activo,
      motivo: `BADGE REPETIDO en la hoja (filas ${anterior} y ${i})`,
    });
    return;
  }
  vistos.set(badge, i);

  const agregar = (cedula: string, tipo: string, origen: "automatico" | "manual") => {
    if (!CEDULA_RE.test(cedula)) {
      errores.push({
        badge, nombre: nombreZk, activo,
        motivo:
          `CEDULA NO VALIDA "${cedula}". Si es un id de empleado (UUID), esa persona no ` +
          `tiene numero de documento en Gestivo: corrijalo alla antes de aplicar.`,
      });
      return;
    }
    correspondencias.push({
      badge,
      nombreZk,
      clave: claveNombre(nombreZk),
      cedula,
      tipo: tipo === "conductor" || tipo === "empleado" ? tipo : "",
      origen,
    });
  };

  // ── Caso 1: la persona no escribio nada ──────────────────────────────────
  if (!corregido) {
    if (estado === "OK") {
      agregar(cedulaAuto, tipoAuto, "automatico");
    } else {
      pendientes.push({ badge, nombreZk, estado, activo });
    }
    return;
  }

  // ── Caso 2: escribio algo. Se resuelve contra el maestro ─────────────────
  let candidatos: Persona[] | undefined;
  let comoSeHallo = "";
  /** Si eligio por nombre, hay que descartar el gemelo con las palabras al reves. */
  let porNombre = false;

  if (/^\d+$/.test(corregido)) {
    // Escribio una cedula: es la salida cuando el nombre esta repetido.
    candidatos = porCedula.get(corregido);
    comoSeHallo = "cedula escrita a mano";
    if (!candidatos) {
      errores.push({
        badge, nombre: nombreZk, activo,
        motivo: `La cedula "${corregido}" no esta en el maestro de Gestivo.`,
      });
      return;
    }
  } else {
    candidatos = porNombreExacto.get(corregido) ?? porNombreClave.get(claveNombre(corregido));
    comoSeHallo = "nombre elegido";
    porNombre = true;
    if (!candidatos) {
      errores.push({
        badge, nombre: nombreZk, activo,
        motivo:
          `NO ENCONTRADO: "${corregido}" no esta en la hoja Maestro Gestivo. ` +
          `Use el desplegable, o escriba la cedula.`,
      });
      return;
    }
  }

  const cedulas = new Set(candidatos.map((p) => p.cedula).filter(Boolean));
  if (cedulas.size === 0) {
    errores.push({
      badge, nombre: nombreZk, activo,
      motivo: `"${corregido}" existe en el maestro pero sin cedula en Gestivo.`,
    });
    return;
  }
  if (cedulas.size > 1) {
    errores.push({
      badge, nombre: nombreZk, activo,
      motivo:
        `AMBIGUO: "${corregido}" corresponde a ${cedulas.size} personas distintas ` +
        `(${[...cedulas].join(", ")}). Escriba la CEDULA en vez del nombre.`,
    });
    return;
  }

  // El mismo nombre con las palabras en otro orden y OTRA cedula: en Gestivo
  // hay registros duplicados con la cedula mal digitada. Elegir del
  // desplegable no distingue cual es la buena, asi que se exige la cedula.
  if (porNombre) {
    const gemelos = porNombreOrdenado.get(claveOrdenada(corregido)) ?? [];
    const cedulasGemelas = new Set(gemelos.map((p) => p.cedula).filter(Boolean));
    if (cedulasGemelas.size > 1) {
      errores.push({
        badge, nombre: nombreZk, activo,
        motivo:
          `NOMBRE DUPLICADO EN GESTIVO: "${corregido}" tambien existe con las palabras en ` +
          `otro orden y cedula distinta (${[...cedulasGemelas].join(", ")}). ` +
          `Son registros duplicados: averigue cual cedula es la correcta y ESCRIBALA aqui.\n` +
          `          ` + gemelos.map((p) => `${p.cedula} "${p.nombre}" [${p.estado || "?"}]`).join("  |  "),
      });
      return;
    }
  }

  // Una sola cedula: si aparece en los dos maestros es la misma persona, se
  // elige por el departamento del equipo, igual que hace el cruce.
  const cedula = [...cedulas][0];
  const elegido =
    (esOperativo
      ? candidatos.find((p) => p.tipo === "conductor")
      : candidatos.find((p) => p.tipo === "empleado")) ?? candidatos[0];

  // Cambiar un cruce automatico es legitimo, pero es el unico caso en que dos
  // fuentes se contradicen: se exige reconocerlo con la bandera.
  if (estado === "OK" && cedulaAuto && cedula !== cedulaAuto) {
    correcciones.push({
      badge, nombre: nombreZk, activo,
      motivo: `el cruce automatico dio ${cedulaAuto} y a mano se puso ${cedula} (${comoSeHallo})`,
    });
    if (!ACEPTAR_CORRECCIONES) {
      errores.push({
        badge, nombre: nombreZk, activo,
        motivo:
          `CORRECCION de un cruce automatico (${cedulaAuto} -> ${cedula}). ` +
          `Si es correcto, vuelva a correr con --aceptar-correcciones.`,
      });
      return;
    }
  }

  agregar(cedula, elegido.tipo, estado === "OK" && cedula === cedulaAuto ? "automatico" : "manual");
});

// ── Informe ────────────────────────────────────────────────────────────────
const automaticos = correspondencias.filter((c) => c.origen === "automatico").length;
const manuales = correspondencias.filter((c) => c.origen === "manual").length;
const pendActivos = pendientes.filter((p) => p.activo);
const pendViejos = pendientes.filter((p) => !p.activo);
const repetidas = [...agrupar(correspondencias, (c) => c.cedula).values()].filter((g) => g.length > 1);

console.log(`Excel: ${rutaExcel}\n`);
console.log(`  automaticos ${automaticos}  |  manuales ${manuales}  |  correcciones ${correcciones.length}`);
console.log(`  pendientes que siguen marcando ${pendActivos.length}  |  pendientes antiguos ${pendViejos.length}`);
console.log(`  errores ${errores.length}`);

if (repetidas.length) {
  console.log(`\nLa misma cedula en varios badges (${repetidas.length}): es legitimo, la persona`);
  console.log(`esta enrolada dos veces en el equipo; los dos badges reciben la misma cedula.`);
  for (const g of repetidas) {
    console.log(`  ${g[0].cedula}  badges ${g.map((c) => c.badge).join(", ")}  (${g[0].nombreZk})`);
  }
}

if (correcciones.length) {
  console.log(`\nCorrecciones de cruces automaticos (${correcciones.length}):`);
  for (const c of correcciones) console.log(`  badge ${c.badge}  ${c.nombre}: ${c.motivo}`);
}

if (pendActivos.length) {
  console.log(`\nSIN RESOLVER y la persona SIGUE MARCANDO (${pendActivos.length}):`);
  for (const p of pendActivos) console.log(`  badge ${p.badge}  [${p.estado}]  ${p.nombreZk}`);
}
if (pendViejos.length) {
  console.log(`\nSin resolver, ya no marcan: ${pendViejos.length} (se descartan; quedan sin cedula)`);
}

if (errores.length) {
  console.log(`\n=== ERRORES: no se escribio nada ===`);
  for (const e of errores) {
    console.log(`  ${e.activo ? "[sigue marcando] " : ""}badge ${e.badge}  ${e.nombre}`);
    console.log(`      ${e.motivo}`);
  }
  process.exit(1);
}

// Las filas de gente que ya no marca no detienen el proceso: varias son
// personas que nunca existieron en Gestivo y no se van a resolver nunca.
// Decision del usuario (2026-10-19): si ya esta retirada, su historial antiguo
// no interesa. Las que SIGUEN marcando si detienen: esas importan.
const faltan = INCLUIR_INACTIVOS ? pendientes : pendActivos;
if (faltan.length) {
  console.log(
    `\n=== FALTAN ${faltan.length} FILAS POR RESOLVER: no se escribio nada ===\n` +
      `Llene su columna "Nombre en Gestivo (corregir aqui)" en la hoja Correspondencias\n` +
      `(estan al principio) y vuelva a correr este script.`
  );
  process.exit(1);
}

const archivo: ArchivoCorrespondencias = {
  generado: new Date().toISOString().slice(0, 19).replace("T", " "),
  excel: rutaExcel,
  resumen: {
    total: correspondencias.length,
    automatico: automaticos,
    manual: manuales,
    correcciones: correcciones.length,
    pendientes: pendientes.length,
    errores: 0,
    cedulasRepetidas: repetidas.length,
  },
  correspondencias,
  pendientes: pendientes.map((p) => ({ badge: p.badge, nombreZk: p.nombreZk, estado: p.estado })),
};

fs.mkdirSync(DIR_SALIDA, { recursive: true });
fs.writeFileSync(RUTA_CORRESPONDENCIAS, JSON.stringify(archivo, null, 2), "utf8");
console.log(`\nJSON: ${RUTA_CORRESPONDENCIAS}`);
console.log(`${correspondencias.length} badges listos para escribir en USERINFO.SSN.`);
console.log(`\nSiguiente paso (ensayo, no escribe nada):`);
console.log(`  powershell -ExecutionPolicy Bypass -File scripts\\biometrico-aplicar-ssn-zk.ps1 -Mdb "<ruta del Access.mdb>"`);
