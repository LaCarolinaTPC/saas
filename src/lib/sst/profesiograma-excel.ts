/**
 * Lector del Excel del profesiograma (formato de Chess Consultorías / ARL).
 * PURO: recibe las hojas como filas (sheet_to_json con header: 1) y devuelve
 * la tabla; lo usa la pestaña Profesiograma al subir un archivo nuevo.
 *
 * De cada hoja de empresa (LA CAROLINA, METRORECAUDOS, ANAYA GIRALDO…):
 * - la fila de encabezado es la que tiene «CARGO»;
 * - la periodicidad es la columna «Periodicidad del EMO (Res 1843)» («Cada 36
 *   meses»), y el proceso, «Tipo Proceso» («Admon», «Admon - Oper», «Oper»);
 * - las filas del pie («FECHA DE ACTUALIZACION: 05/10/2025», «PROFESIONAL…»)
 *   no son cargos; de la primera se toma la fecha del documento.
 */
import {
  EMPRESAS_PROFESIOGRAMA,
  type CargoProfesiograma,
  type EmpresaProfesiograma,
  type TablaProfesiograma,
  type TipoCargo,
} from "./profesiograma";

export interface HojaExcel {
  nombre: string;
  filas: unknown[][];
}

export interface LecturaProfesiograma {
  tabla: TablaProfesiograma;
  /** Fecha de actualización del documento (AAAA-MM-DD), si la trae. */
  fecha: string | null;
  hojas: { nombre: string; empresa: EmpresaProfesiograma; cargos: number }[];
  avisos: string[];
}

const txt = (v: unknown) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());
const norm = (v: unknown) => txt(v).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function empresaDeHoja(nombre: string): EmpresaProfesiograma | null {
  const n = norm(nombre);
  if (n.includes("carolina")) return "la_carolina";
  if (n.includes("metrorecaudo")) return "metrorecaudo";
  if (n.includes("anaya")) return "anaya_giraldo";
  return null;
}

/** «Cada 36 meses» → 36; un número suelto también sirve. */
export function mesesDe(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  const m = /(\d{1,2})\s*mes/i.exec(txt(v)) ?? /^(\d{1,2})$/.exec(txt(v));
  return m ? Number(m[1]) : null;
}

/** «Admon» / «Admon - Oper» / «Oper»; sin dato, se deduce de la periodicidad. */
export function tipoDe(v: unknown, meses: number): TipoCargo {
  const n = norm(v).replace(/[^a-z]/g, "");
  if (n === "admonoper" || (n.includes("admon") && n.includes("oper"))) return "admon_oper";
  if (n.includes("admon")) return "admon";
  if (n.includes("oper")) return "oper";
  return meses >= 36 ? "admon" : meses >= 24 ? "admon_oper" : "oper";
}

const PIE = /fecha de actualizacion|profesional:|medico laboral|consultorias/;

function fechaDe(texto: string): string | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(texto);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/**
 * La tabla nueva: las empresas que trae el archivo se reemplazan; las que no
 * trae se conservan como están.
 */
export function tablaDesdeLectura(actual: TablaProfesiograma, l: LecturaProfesiograma): TablaProfesiograma {
  const leidas = new Set(l.hojas.map((h) => h.empresa));
  const out = {} as Record<EmpresaProfesiograma, readonly CargoProfesiograma[]>;
  for (const { key } of EMPRESAS_PROFESIOGRAMA) out[key] = leidas.has(key) ? l.tabla[key] : actual[key];
  return out;
}

export function leerProfesiograma(hojas: readonly HojaExcel[]): LecturaProfesiograma | { error: string } {
  const tabla: Record<EmpresaProfesiograma, CargoProfesiograma[]> = { la_carolina: [], metrorecaudo: [], anaya_giraldo: [] };
  const leidas: LecturaProfesiograma["hojas"] = [];
  const avisos: string[] = [];
  let fecha: string | null = null;

  for (const hoja of hojas) {
    const empresa = empresaDeHoja(hoja.nombre);
    if (!empresa) continue;
    if (leidas.some((l) => l.empresa === empresa)) {
      avisos.push(`La hoja «${hoja.nombre}» se ignoró: ya se leyó otra de la misma empresa.`);
      continue;
    }
    const filas = hoja.filas;
    const h = filas.slice(0, 15).findIndex((f) => (f ?? []).some((c) => norm(c) === "cargo"));
    if (h < 0) {
      avisos.push(`La hoja «${hoja.nombre}» no tiene la columna «CARGO»: se ignoró.`);
      continue;
    }
    const colCargo = filas[h].findIndex((c) => norm(c) === "cargo");
    let colMeses = -1;
    let colTipo = -1;
    for (let r = h; r < Math.min(filas.length, h + 4); r++) {
      (filas[r] ?? []).forEach((c, j) => {
        const n = norm(c);
        if (colMeses < 0 && n.includes("periodicidad del emo")) colMeses = j;
        if (colTipo < 0 && n.includes("tipo proceso")) colTipo = j;
      });
    }
    if (colMeses < 0) {
      avisos.push(`La hoja «${hoja.nombre}» no tiene la columna «Periodicidad del EMO»: se ignoró.`);
      continue;
    }

    let cargos = 0;
    for (let r = h + 1; r < filas.length; r++) {
      const fila = filas[r] ?? [];
      const cargo = txt(fila[colCargo]);
      if (!cargo) continue;
      if (PIE.test(norm(cargo))) {
        fecha = fecha ?? fechaDe(cargo);
        continue;
      }
      const meses = mesesDe(fila[colMeses]);
      if (meses == null) {
        avisos.push(`«${cargo}» (${hoja.nombre}): no se entiende la periodicidad «${txt(fila[colMeses])}»; no se cargó.`);
        continue;
      }
      if (meses < 6 || meses > 60) {
        avisos.push(`«${cargo}» (${hoja.nombre}): periodicidad de ${meses} meses fuera de rango (6 a 60); no se cargó.`);
        continue;
      }
      tabla[empresa].push({ cargo, meses, tipo: tipoDe(colTipo >= 0 ? fila[colTipo] : null, meses) });
      cargos++;
    }
    leidas.push({ nombre: hoja.nombre, empresa, cargos });
  }

  if (leidas.length === 0) {
    const esperadas = EMPRESAS_PROFESIOGRAMA.map((e) => e.label).join(", ");
    return { error: `El archivo no tiene hojas de empresa reconocibles (${esperadas}).` };
  }
  for (const e of EMPRESAS_PROFESIOGRAMA) {
    if (!leidas.some((l) => l.empresa === e.key)) avisos.push(`El archivo no trae la hoja de ${e.label}: se conservan sus cargos actuales.`);
  }
  return { tabla, fecha, hojas: leidas, avisos };
}
