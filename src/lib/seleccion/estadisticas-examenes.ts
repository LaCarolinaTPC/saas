/**
 * Estadísticas de los exámenes médicos de ingreso (27-nov-2026), como las lleva
 * Salud Ocupacional en «INFORMACIÓN EXÁMENES DE INGRESO»: por mes de la fase 1,
 * cuántos se citaron y cómo salieron en cada fase (apto, no apto, desistió,
 * aplazado o pendiente), cuántos quedaron aptos para contratar, por qué no
 * fueron aptos o desistieron, y por laboratorio. PURO.
 *
 * Dos fuentes con la misma forma: el registro histórico cargado del Excel y lo
 * que se registra en Gestivo. Si un aspirante está en las dos (misma cédula y
 * fase 1 con menos de 30 días de diferencia), vale Gestivo.
 */

export type ResultadoFase = "apto" | "no_apto" | "desistio" | "aplazado" | "pendiente";

export interface FilaExamen {
  cedula: string;
  nombre: string | null;
  laboratorio: string | null;
  /** AAAA-MM-DD de la fase 1 (la cita o el resultado). */
  fechaFase1: string | null;
  resultadoFase1: ResultadoFase;
  fechaFase2: string | null;
  /** null: no llegó a la fase 2 (la fase 1 no fue apta). */
  resultadoFase2: ResultadoFase | null;
  /** Por qué no fue apto o desistió (texto libre o de la lista). */
  causa: string | null;
  fuente: "historico" | "gestivo";
}

export interface ConteoFase {
  apto: number;
  no_apto: number;
  desistio: number;
  aplazado: number;
  pendiente: number;
}

export interface FilaCausa {
  causa: string;
  n: number;
}

export interface EstadisticasExamenes {
  meses: { mes: string; citados: number; fase1: ConteoFase; fase2: ConteoFase; aptosContratar: number }[];
  total: { citados: number; fase1: ConteoFase; fase2: ConteoFase; aptosContratar: number };
  causasNoApto: FilaCausa[];
  causasDesistio: { fase1: FilaCausa[]; fase2: FilaCausa[] };
  laboratorios: { laboratorio: string; citados: number; aptosContratar: number; noApto: number; desistio: number }[];
  fuentes: { historico: number; gestivo: number };
}

export const CAUSAS_DESISTIMIENTO = ["Sin explicación", "Mejor oferta laboral", "Calamidad familiar", "Viaje", "Vive lejos", "Todavía trabaja", "Enfermedad", "Otra"] as const;
export const CAUSAS_NO_APTO_EXAMEN = [
  "Columna",
  "Sustancias psicoactivas",
  "Diabetes no controlada",
  "Hipertensión no controlada",
  "Corazón",
  "Cálculos renales",
  "Visión",
  "Edad",
  "Otra",
] as const;

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** «APTO», «NO APTO», «DESISTIMIENTO», «Pendiente», «aplazado»… → resultado. */
export function resultadoDeTexto(v: unknown): ResultadoFase | null {
  const t = norm(v);
  if (!t) return null;
  if (/^no apt/.test(t)) return "no_apto";
  if (/desist|no se present|no asisti/.test(t)) return "desistio";
  if (/aplaz/.test(t)) return "aplazado";
  if (/^apt/.test(t)) return "apto";
  if (/pendiente|en proceso/.test(t)) return "pendiente";
  return null;
}

/**
 * Las causas en categorías (una fila puede traer varias: «CÁLCULOS RENALES +
 * COLUMNA»). Lo que no encaja se deja con sus palabras, en mayúscula inicial.
 */
export function categoriasDeCausa(texto: string | null | undefined): string[] {
  const out = new Set<string>();
  for (const parte of String(texto ?? "").split(/\s*\+\s*|\s*\/\s*|,\s*/)) {
    const t = norm(parte);
    if (!t) continue;
    if (/columna|espondil|escolio|lumbar|cobb|artrosis|osteofit|listesis/.test(t)) out.add("Columna");
    else if (/sustancia|psico ?a?c?tiva|cocaina|marihuana|spa\b|droga/.test(t)) out.add("Sustancias psicoactivas");
    else if (/diabet/.test(t)) out.add("Diabetes no controlada");
    else if (/hiperten|presion/.test(t)) out.add("Hipertensión no controlada");
    else if (/corazon|cardi/.test(t)) out.add("Corazón");
    else if (/calculo|renal|rinon|nefrolit/.test(t)) out.add("Cálculos renales");
    else if (/daltoni|vision|visual|vista|optometr|lentes/.test(t)) out.add("Visión");
    else if (/^edad/.test(t)) out.add("Edad");
    else if (/sin explicacion|sin motivo|no contesta/.test(t)) out.add("Sin explicación");
    else if (/oferta|mejor laboral|otro trabajo|otra empresa/.test(t)) out.add("Mejor oferta laboral");
    else if (/calamidad/.test(t)) out.add("Calamidad familiar");
    else if (/viaje|viaj/.test(t)) out.add("Viaje");
    else if (/vive|lejos|santa marta|valledupar|es de /.test(t)) out.add("Vive lejos");
    else if (/todavia trabaja|aun trabaja|sigue trabajando/.test(t)) out.add("Todavía trabaja");
    else if (/enferm/.test(t)) out.add("Enfermedad");
    else if (/aplaz/.test(t)) out.add("Aplazado");
    else out.add(parte.trim().charAt(0).toUpperCase() + parte.trim().slice(1).toLowerCase());
  }
  return [...out];
}

const fecha = (v: unknown): string | null => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86_400_000)).toISOString().slice(0, 10);
  const t = String(v ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(t);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return null;
};

/**
 * Las filas del Excel de Salud Ocupacional (hoja de cálculo como matriz). Busca la
 * fila de encabezados («CEDULAS», «RESULTADO FASE 1»…) en las primeras 20 filas.
 * Devuelve las filas y cuántas se omitieron (sin cédula o sin fase 1).
 */
export function leerRegistroExamenes(matriz: unknown[][]): { filas: FilaExamen[]; omitidas: number; error?: string } {
  const iEnc = matriz.slice(0, 20).findIndex((f) => f.some((c) => /resultado fase 1/.test(norm(c))) && f.some((c) => /cedula/.test(norm(c))));
  if (iEnc < 0) return { filas: [], omitidas: 0, error: "No se encontró la fila de encabezados (CÉDULAS, RESULTADO FASE 1…)." };
  const enc = matriz[iEnc].map(norm);
  const col = (re: RegExp) => enc.findIndex((c) => re.test(c));
  const c = {
    cedula: col(/^cedula/),
    nombre: col(/^nombre/),
    laboratorio: col(/^laboratorio/),
    f1: col(/^fecha fase 1/),
    r1: col(/^resultado fase 1/),
    f2: col(/^fecha fase 2/),
    r2: col(/^resultado fase 2/),
    causa: col(/^causa/),
  };
  const filas: FilaExamen[] = [];
  let omitidas = 0;
  for (const f of matriz.slice(iEnc + 1)) {
    const cedula = String(f[c.cedula] ?? "").replace(/\D/g, "");
    const r1 = resultadoDeTexto(f[c.r1]);
    const f1 = fecha(f[c.f1]);
    if (!cedula && !r1) continue;
    if (cedula.length < 5 || (!r1 && !f1)) {
      omitidas++;
      continue;
    }
    const resultadoFase1 = r1 ?? "pendiente";
    // La fase 2 solo cuenta si la fase 1 fue apta («Pendiente» en la fase 2 de un no apto no es una cita).
    const r2 = resultadoFase1 === "apto" ? (resultadoDeTexto(f[c.r2]) ?? "pendiente") : null;
    filas.push({
      cedula,
      nombre: String(f[c.nombre] ?? "").trim() || null,
      laboratorio: String(f[c.laboratorio] ?? "").trim().toUpperCase() || null,
      fechaFase1: f1,
      resultadoFase1,
      fechaFase2: r2 ? fecha(f[c.f2]) : null,
      resultadoFase2: r2,
      causa: c.causa >= 0 ? String(f[c.causa] ?? "").trim() || null : null,
      fuente: "historico",
    });
  }
  return { filas, omitidas };
}

/** Quita del histórico a quien ya está en Gestivo (misma cédula, fase 1 a menos de 30 días). */
export function unirFuentes(historico: readonly FilaExamen[], gestivo: readonly FilaExamen[]): FilaExamen[] {
  const dias = (a: string | null, b: string | null) => (a && b ? Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000 : Infinity);
  const porCedula = new Map<string, FilaExamen[]>();
  for (const g of gestivo) porCedula.set(g.cedula, [...(porCedula.get(g.cedula) ?? []), g]);
  const quedan = historico.filter((h) => !(porCedula.get(h.cedula) ?? []).some((g) => dias(g.fechaFase1, h.fechaFase1) < 30));
  return [...quedan, ...gestivo];
}

const vacio = (): ConteoFase => ({ apto: 0, no_apto: 0, desistio: 0, aplazado: 0, pendiente: 0 });
const contar = (m: Map<string, number>) => [...m.entries()].map(([causa, n]) => ({ causa, n })).sort((a, b) => b.n - a.n || a.causa.localeCompare(b.causa));

/** Las cifras de las filas de un periodo (ya filtradas por la fecha de la fase 1). */
export function calcularEstadisticasExamenes(filas: readonly FilaExamen[]): EstadisticasExamenes {
  const porMes = new Map<string, EstadisticasExamenes["meses"][number]>();
  const total = { citados: 0, fase1: vacio(), fase2: vacio(), aptosContratar: 0 };
  const noApto = new Map<string, number>();
  const des1 = new Map<string, number>();
  const des2 = new Map<string, number>();
  const labs = new Map<string, EstadisticasExamenes["laboratorios"][number]>();
  const fuentes = { historico: 0, gestivo: 0 };
  for (const f of filas) {
    fuentes[f.fuente]++;
    const mes = (f.fechaFase1 ?? "sin fecha").slice(0, 7);
    const m = porMes.get(mes) ?? { mes, citados: 0, fase1: vacio(), fase2: vacio(), aptosContratar: 0 };
    const apto = f.resultadoFase1 === "apto" && f.resultadoFase2 === "apto";
    for (const x of [m, total]) {
      x.citados++;
      x.fase1[f.resultadoFase1]++;
      if (f.resultadoFase2) x.fase2[f.resultadoFase2]++;
      if (apto) x.aptosContratar++;
    }
    porMes.set(mes, m);
    const cats = categoriasDeCausa(f.causa);
    const sinCausa = cats.length ? cats : ["Sin causa registrada"];
    if (f.resultadoFase1 === "no_apto" || f.resultadoFase2 === "no_apto") for (const k of sinCausa) noApto.set(k, (noApto.get(k) ?? 0) + 1);
    if (f.resultadoFase1 === "desistio") for (const k of sinCausa) des1.set(k, (des1.get(k) ?? 0) + 1);
    if (f.resultadoFase2 === "desistio") for (const k of sinCausa) des2.set(k, (des2.get(k) ?? 0) + 1);
    // «BIOBAC SST - IPS» (Gestivo) y «BIOBAC» (Excel) son el mismo: se agrupa por la primera palabra.
    const lab = f.laboratorio?.trim().split(/[\s-]+/)[0]?.toUpperCase() || "Sin laboratorio";
    const l = labs.get(lab) ?? { laboratorio: lab, citados: 0, aptosContratar: 0, noApto: 0, desistio: 0 };
    l.citados++;
    if (apto) l.aptosContratar++;
    if (f.resultadoFase1 === "no_apto" || f.resultadoFase2 === "no_apto") l.noApto++;
    if (f.resultadoFase1 === "desistio" || f.resultadoFase2 === "desistio") l.desistio++;
    labs.set(lab, l);
  }
  return {
    meses: [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes)),
    total,
    causasNoApto: contar(noApto),
    causasDesistio: { fase1: contar(des1), fase2: contar(des2) },
    laboratorios: [...labs.values()].sort((a, b) => b.citados - a.citados),
    fuentes,
  };
}
