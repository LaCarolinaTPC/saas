/**
 * Prueba psicotécnica en PsicoAlianza (24-nov-2026). PURO.
 *
 * - La plantilla de carga masiva de la plataforma: hoja «Evaluados» con
 *   «Documento» y «Email», una fila por aspirante con el correo confirmado.
 * - Los resultados que devuelve la plataforma, en Excel/CSV (se buscan las
 *   columnas por su nombre) o en el informe PDF de cada aspirante (se busca
 *   la cédula y el concepto en el texto). Nada se guarda solo: una persona
 *   revisa la vista previa y confirma.
 */
import type { ResultadoPsicoExterna } from "./dia-contratacion";

export const ENTIDAD_PSICO = "PsicoAlianza";
export const HOJA_PLANTILLA = "Evaluados";
export const COLUMNAS_PLANTILLA = ["Documento", "Email"] as const;

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * El concepto en palabras → resultado. Primero lo negativo («no apto», «no
 * recomendado»), luego lo condicionado («apto con observaciones», «con
 * restricciones»), y por último lo positivo. null si no dice nada claro.
 */
export function interpretarConcepto(texto: unknown): ResultadoPsicoExterna | null {
  const t = norm(texto);
  if (!t) return null;
  if (/\bno (es )?(apto|recomendad[oa]|cumple|aprob[oa]d?[oa]?|favorable|idone[oa])\b|\bdesfavorable\b|\brechazad[oa]\b|\bno pasa\b|\breprob/.test(t)) return "no_apto";
  if (/\bapt[oa] con\b|\bcon (observaciones|restricciones|recomendaciones|reservas)\b|\bcondicionad[oa]\b|\brecomendad[oa] con\b|\bcon salvedad/.test(t)) return "apto_con_observaciones";
  if (/\bapt[oa]\b|\brecomendad[oa]\b|\bcumple\b|\bfavorable\b|\baprobad[oa]\b|\bidone[oa]\b|\bpasa\b/.test(t)) return "apto";
  return null;
}

/**
 * No presentó o no terminó la prueba (24-nov-2026): hay que volver a inscribirlo.
 * «No presentó», «ausente», «sin presentar» / «incompleta», «no terminó», «sin finalizar».
 */
export type EstadoPrueba = "no_presento" | "incompleta";
export const ETIQUETA_ESTADO_PRUEBA: Record<EstadoPrueba, string> = { no_presento: "No la presentó", incompleta: "No la terminó" };

export function interpretarEstadoPrueba(texto: unknown): EstadoPrueba | null {
  const t = norm(texto);
  if (!t) return null;
  if (/\bno (la )?(present|realiz|asisti|ingres)|\bausente\b|\bsin present|\bsin realizar\b|\bno se present/.test(t)) return "no_presento";
  if (/\bincomplet|\bno (la )?(termin|finaliz|complet)|\bsin (terminar|finalizar|completar)\b|\bparcial\b|\babandon/.test(t)) return "incompleta";
  return null;
}

/** «24/11/2026», «2026-11-24», «24-11-2026» o un número de fecha de Excel → AAAA-MM-DD. */
export function leerFecha(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Días desde 1899-12-30 (fechas de Excel).
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  let m = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(s);
  if (m) return valida(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/.exec(s);
  if (m) return valida(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}
function valida(a: number, mes: number, d: number): string | null {
  if (mes < 1 || mes > 12 || d < 1 || d > 31 || a < 2000 || a > 2100) return null;
  return `${a}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function leerPuntaje(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace("%", "").replace(",", ".").trim());
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : null;
}

const soloDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export interface FilaResultado {
  /** Fila del archivo (desde 1) o página. */
  fila: number;
  cedula: string | null;
  /** El texto del concepto tal como venía. */
  concepto: string | null;
  resultado: ResultadoPsicoExterna | null;
  fecha: string | null;
  puntaje: number | null;
  nombre: string | null;
  /** No la presentó o no la terminó: se vuelve a inscribir en vez de guardar un resultado. */
  estadoPrueba?: EstadoPrueba | null;
}

const CABECERAS = {
  cedula: /^(documento|cedula|c\.?c\.?|identificacion|numero de documento|no\.? documento|n[uú]mero de identificaci[oó]n|doc)/,
  concepto: /(concepto|resultado|dictamen|estado|calificacion|recomendacion|apto)/,
  fecha: /(fecha)/,
  puntaje: /(puntaje|puntuacion|nota|score|porcentaje|%)/,
  nombre: /(nombre|evaluado|candidato)/,
};

/**
 * Las filas de una hoja de resultados (primera fila con «Documento/Cédula» y
 * «Resultado/Concepto» como cabecera). null si no se encuentran esas columnas.
 */
export function leerFilasResultados(filas: unknown[][]): FilaResultado[] | null {
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const cab = (filas[i] ?? []).map(norm);
    const col = (re: RegExp, excluir: number[] = []) => cab.findIndex((c, j) => !!c && re.test(c) && !excluir.includes(j));
    const cCed = col(CABECERAS.cedula);
    if (cCed < 0) continue;
    const cCon = col(CABECERAS.concepto, [cCed]);
    if (cCon < 0) continue;
    const cFec = col(CABECERAS.fecha, [cCed, cCon]);
    const cPun = col(CABECERAS.puntaje, [cCed, cCon, cFec]);
    const cNom = col(CABECERAS.nombre, [cCed, cCon, cFec, cPun]);
    const out: FilaResultado[] = [];
    for (let k = i + 1; k < filas.length; k++) {
      const f = filas[k] ?? [];
      const cedula = soloDigitos(f[cCed]);
      const concepto = String(f[cCon] ?? "").trim() || null;
      if (!cedula && !concepto) continue;
      out.push({
        fila: k + 1,
        cedula: cedula.length >= 5 ? cedula : null,
        concepto,
        estadoPrueba: interpretarEstadoPrueba(concepto),
        resultado: interpretarEstadoPrueba(concepto) ? null : interpretarConcepto(concepto),
        fecha: cFec >= 0 ? leerFecha(f[cFec]) : null,
        puntaje: cPun >= 0 ? leerPuntaje(f[cPun]) : null,
        nombre: cNom >= 0 ? String(f[cNom] ?? "").trim() || null : null,
      });
    }
    return out;
  }
  return null;
}

// ── Informes de PsicoAlianza (Ethikos, Ten DISC…) ─────────────────────────────
//
// Muestras de GH del 24-nov-2026: un PDF por prueba y por aspirante, con
// «Identificación: 123…» y «Fecha: dd-mm-aaaa» en el encabezado; el nombre del
// archivo empieza por la prueba y trae la cédula («Ten DISC_123…_Nombre_…pdf»).
// - Ten DISC: «AJUSTE DEL CANDIDATO AL PERFIL: … 81.43%» y, en el texto, la
//   leyenda entera de la escala (No Recomendado / Recomendado con sugerencias /
//   Recomendado): esa leyenda no es el concepto.
// - Ethikos: el concepto («RECOMENDADO») es una imagen; en el texto solo queda
//   «RESULTADO FINAL 82% RESULTADO OBTENIDO». Se deduce del porcentaje y una
//   persona lo confirma.

/**
 * Cortes del porcentaje (Selección › Tiempos y reglas; por defecto, la escala de
 * Ten DISC): hasta `noRecomendado` %, no recomendado; hasta `conSugerencias` %,
 * recomendado con sugerencias; por encima, recomendado.
 */
export interface CortesPsico {
  noRecomendado: number;
  conSugerencias: number;
}
export const CORTES_PSICO_POR_DEFECTO: CortesPsico = { noRecomendado: 50, conSugerencias: 75 };

export function cortesPsico(valor: (clave: string) => unknown): CortesPsico {
  const n = (v: unknown, d: number) => {
    const x = Number(v);
    return v == null || v === "" || !Number.isFinite(x) ? d : Math.min(Math.max(x, 0), 100);
  };
  const noRecomendado = n(valor("psico_corte_no_recomendado"), CORTES_PSICO_POR_DEFECTO.noRecomendado);
  const conSugerencias = Math.max(noRecomendado, n(valor("psico_corte_con_sugerencias"), CORTES_PSICO_POR_DEFECTO.conSugerencias));
  return { noRecomendado, conSugerencias };
}

/** «hasta 50 % no recomendado; hasta 75 % con sugerencias; más de 75 % recomendado». */
export function textoCortes(c: CortesPsico): string {
  const f = (x: number) => x.toLocaleString("es-CO");
  return `hasta ${f(c.noRecomendado)} % no recomendado; hasta ${f(c.conSugerencias)} % con sugerencias; más de ${f(c.conSugerencias)} % recomendado`;
}

export function conceptoPorPorcentaje(p: number, c: CortesPsico = CORTES_PSICO_POR_DEFECTO): ResultadoPsicoExterna {
  return p <= c.noRecomendado ? "no_apto" : p <= c.conSugerencias ? "apto_con_observaciones" : "apto";
}

export const ETIQUETA_CONCEPTO: Record<ResultadoPsicoExterna, string> = {
  apto: "Recomendado",
  apto_con_observaciones: "Recomendado con sugerencias",
  no_apto: "No recomendado",
};

export interface InformePrueba {
  /** «Ethikos - Riesgos», «Ten DISC»… */
  prueba: string;
  cedula: string | null;
  nombre: string | null;
  fecha: string | null;
  porcentaje: number | null;
  resultado: ResultadoPsicoExterna | null;
  /** El concepto no estaba escrito: salió del porcentaje. */
  deducido: boolean;
  /** «Sin contestar» mayor que cero o el informe dice que no respondió todo. */
  incompleta: boolean;
  alertas: string[];
  /** El concepto del informe, antes de la sugerencia de Gestivo. */
  resultadoInforme?: ResultadoPsicoExterna | null;
  /** Riesgos para conducir que llevan a sugerir «con sugerencias» aunque el informe diga «Recomendado». */
  riesgosConducir?: string[];
}

// Riesgos para el cargo de conductor (27-nov-2026, pedido: «que los lea y sugiera si son aptos o no»).
// El informe puede decir «Recomendado» y aun así traer señales que pesan al volante.
const TEMA_CRITICO = /alcohol|sustancias? psicoactivas|\bspa\b|droga|violen|agresi/i;
const VALORES_ETHIKOS = /(abstinencia del uso de spa y alcohol|no violencia|conducta no fraudulenta|honestidad|normas|tendencia a la no corrupci[oó]n|veracidad|tratamiento de la informaci[oó]n)\s+(\d{1,3})[.,]\d\b/gi;
const CRITICOS_ETHIKOS = /abstinencia|violencia/i;
const RIESGOS_TEN_DISC = /(estabilidad emocional|control de impulsos|rumor)\s+ajuste\s*:\s*\(\s*(\d{1,3}(?:[.,]\d+)?)\s*%\s*\)/gi;
const capital = (s: string) => (s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).replace(/\bspa\b/g, "SPA");
/** Frases de la sección de riesgos, sin cortar en «Sr.» o «Sra.». */
const frases = (t: string) => t.split(/(?<!\b(?:Sr|Sra|Dr|Dra|Ud)\.)(?<=\.)\s+/);

/**
 * Lo que el informe dice que hay que revisar, y cuáles de esas cosas pesan para
 * conducir (alcohol o sustancias, violencia, impulsos, poca sinceridad). PURO.
 *  - Ethikos: los «Riesgos del evaluado frente al cargo» y los valores en
 *    «tendencia a mejorar» (70 o menos) o «inesperada» (40 o menos).
 *  - Ten DISC: estabilidad emocional, control de impulsos o rumor con ajuste
 *    por debajo del 75 %.
 */
export function riesgosDelInforme(plano: string, prueba: string): { alertas: string[]; criticos: string[] } {
  const alertas: string[] = [];
  const criticos: string[] = [];
  const seccion = /riesgo potencial\.?\s*(.+?)\s*especificaciones a considerar/i.exec(plano)?.[1] ?? "";
  for (const frase of frases(seccion).map((f) => f.replace(/^[>›»\s]+/, "").trim()).filter((f) => f.length > 20)) {
    alertas.push(`${prueba} · riesgo: ${frase}`);
    const tema = TEMA_CRITICO.exec(frase)?.[0].toLowerCase();
    if (tema) criticos.push(`riesgo señalado sobre ${/spa|sustancia|droga/.test(tema) ? "sustancias" : /agresi/.test(tema) ? "agresividad" : /violen/.test(tema) ? "violencia" : "alcohol"}`);
  }
  const vistos = new Set<string>();
  for (const m of plano.matchAll(VALORES_ETHIKOS)) {
    const nombre = capital(m[1]);
    const valor = Number(m[2]);
    if (vistos.has(nombre) || valor > 70) continue;
    vistos.add(nombre);
    const nivel = valor <= 40 ? "tendencia inesperada" : "tendencia a mejorar";
    alertas.push(`${prueba}: ${nombre} ${valor} (${nivel}).`);
    if (CRITICOS_ETHIKOS.test(nombre)) criticos.push(`${nombre} ${valor}`);
  }
  for (const m of plano.matchAll(RIESGOS_TEN_DISC)) {
    const ajuste = Number(m[2].replace(",", "."));
    if (ajuste >= 75) continue;
    const nombre = capital(m[1]);
    alertas.push(`${prueba}: ${nombre} con ajuste de ${ajuste.toLocaleString("es-CO")} %.`);
    if (!/rumor/i.test(nombre)) criticos.push(`${nombre} ${ajuste.toLocaleString("es-CO")} %`);
  }
  return { alertas, criticos };
}

const LEYENDA_ESCALA = /no\s+recomendad[oa]\s+recomendad[oa]\s+con\s+sugerencias\s+recomendad[oa]/gi;
const PCT = "(\\d{1,3}(?:[.,]\\d+)?)\\s*%";

export function leerInformePsicoAlianza(
  texto: string,
  nombreArchivo: string,
  cedulasConocidas: readonly string[] = [],
  cortes: CortesPsico = CORTES_PSICO_POR_DEFECTO
): InformePrueba {
  const sinEspacios = texto.replace(/\s+/g, " ");
  // El informe trae su propia escala (Ten DISC): el concepto que sale del porcentaje es el del informe.
  const conEscala = sinEspacios.search(LEYENDA_ESCALA) >= 0;
  const plano = sinEspacios.replace(LEYENDA_ESCALA, " ");
  const n = (re: RegExp) => re.exec(plano)?.[1] ?? null;
  const archivo = nombreArchivo.replace(/\.pdf$/i, "");

  // Lo que encuentra el lector general: sirve de respaldo si el informe no es de PsicoAlianza.
  const general = leerInformePdf(texto, cedulasConocidas);
  const cedula = soloDigitos(n(/identificaci[oó]n\s*:\s*([\d.\s]{5,16})/i)) || soloDigitos(/_(\d{5,11})_/.exec(archivo)?.[1]) || general.cedula || null;
  const prueba =
    archivo.split("_")[0]?.trim() ||
    (/ajuste del candidato al perfil/i.test(plano) ? "Ten DISC" : /valores con mayor puntaje/i.test(plano) ? "Ethikos" : "Prueba");

  const pctTexto =
    n(new RegExp(`ajuste del candidato al perfil\\s*:?\\s*(?:0\\s*%\\s*100\\s*%\\s*)?${PCT}`, "i")) ??
    n(new RegExp(`resultado final\\s*:?\\s*${PCT}`, "i")) ??
    n(new RegExp(`${PCT}\\s*resultado obtenido`, "i")) ??
    n(new RegExp(`resultado obtenido\\s*:?\\s*${PCT}`, "i"));
  const porcentaje = leerPuntaje(pctTexto) ?? general.puntaje;

  const escrito = n(/(?:resultado final|concepto(?: final)?)\s*:?\s*(no recomendad[oa]|recomendad[oa] con (?:sugerencias|observaciones)|recomendad[oa]|no apt[oa]|apt[oa] con observaciones|apt[oa])\b/i);
  const resultadoEscrito = interpretarConcepto(escrito) ?? general.resultado;
  const resultado = resultadoEscrito ?? (porcentaje != null ? conceptoPorPorcentaje(porcentaje, cortes) : null);

  const alertas: string[] = [];
  // Ethikos, última página: «TOTAL DE PREGUNTAS 72 CONTESTADAS SIN CONTESTAR 72 0».
  const sinContestar = /sin contestar\s*(\d{1,3})\s+(\d{1,3})\b/i.exec(plano);
  const total = n(/total de preguntas\s*(\d{1,3})/i);
  let incompleta = /no (respondi[oó]|contest[oó]) todas|prueba incompleta|no (termin[oó]|finaliz[oó]) la prueba/i.test(plano);
  if (sinContestar) {
    // Los dos números van seguidos (contestadas, sin contestar); el segundo es el que falta.
    const faltan = Number(sinContestar[2]);
    if (faltan > 0) {
      incompleta = true;
      alertas.push(`${prueba}: no la terminó (${faltan}${total ? ` de ${total}` : ""} preguntas sin contestar).`);
    }
  } else if (incompleta) alertas.push(`${prueba}: el informe dice que no respondió todas las preguntas.`);
  // El nombre del archivo trae una cédula y el PDF otra: alguno está mal (27-nov-2026).
  const delArchivo = soloDigitos(/_(\d{5,11})_/.exec(archivo)?.[1]);
  const delPdf = soloDigitos(n(/identificaci[oó]n\s*:\s*([\d.\s]{5,16})/i));
  if (delArchivo && delPdf && delArchivo !== delPdf) alertas.push(`${prueba}: el nombre del archivo dice la cédula ${delArchivo} y el informe ${delPdf}; se toma la del informe.`);
  const riesgos = riesgosDelInforme(plano, prueba);
  const sim = /escala de simulaci[oó]n.{0,160}?\b(alta|media|baja)\s+(\d{1,3})\b/i.exec(plano);
  if (sim && /alta/i.test(sim[1])) {
    alertas.push(`${prueba}: simulación alta (${sim[2]}), la respondió con poca sinceridad; interpretar con precaución.`);
    riesgos.criticos.push(`simulación alta (${sim[2]})`);
  }
  const sinc = /sinceridad en las respuestas.{0,200}?\b(bajo|medio|alto)\s+(\d{1,3})\b/i.exec(plano);
  if (sinc && /bajo/i.test(sinc[1])) {
    alertas.push(`${prueba}: nivel de sinceridad bajo (${sinc[2]}); los resultados no son concluyentes.`);
    riesgos.criticos.push(`sinceridad baja (${sinc[2]})`);
  }
  alertas.push(...riesgos.alertas);

  return {
    resultadoInforme: resultado,
    riesgosConducir: riesgos.criticos,
    prueba,
    cedula: cedula && cedula.length >= 5 ? cedula : null,
    nombre: n(/nombre\s*:\s*(.+?)\s+identificaci[oó]n/i)?.trim() ?? null,
    fecha: leerFecha(n(/fecha\s*:\s*(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})/i)) ?? general.fecha,
    porcentaje,
    resultado,
    deducido: !resultadoEscrito && resultado != null && !conEscala,
    incompleta,
    alertas,
  };
}

const PESO: Record<ResultadoPsicoExterna, number> = { apto: 0, apto_con_observaciones: 1, no_apto: 2 };

/**
 * Las pruebas de un mismo aspirante, en un solo resultado: el peor concepto
 * (si alguna no tiene, ninguno), la fecha más reciente, el porcentaje más
 * bajo, y el detalle de cada prueba para que quede en el proceso.
 */
export function combinarPruebas(pruebas: readonly InformePrueba[]): {
  resultado: ResultadoPsicoExterna | null;
  fecha: string | null;
  puntaje: number | null;
  detalle: string;
  deducido: boolean;
  incompleta: boolean;
  alertas: string[];
} {
  const delInforme = pruebas.some((x) => !x.resultado)
    ? null
    : pruebas.reduce<ResultadoPsicoExterna | null>((peor, x) => (!peor || PESO[x.resultado!] > PESO[peor] ? x.resultado : peor), null);
  // «Recomendado» con riesgos para conducir: se sugiere «con sugerencias» (sigue contando como apto) y se dice por qué.
  const riesgos = pruebas.flatMap((x) => (x.riesgosConducir ?? []).map((r) => `${x.prueba}: ${r}`));
  const resultado = delInforme === "apto" && riesgos.length ? "apto_con_observaciones" : delInforme;
  const sugerencia =
    resultado !== delInforme
      ? [`Sugerencia de Gestivo: «${ETIQUETA_CONCEPTO.apto_con_observaciones}» aunque el informe diga «${ETIQUETA_CONCEPTO.apto}», por riesgos para conducir: ${riesgos.join(" · ")}. Revíselo en la entrevista; puede cambiarlo antes de guardar.`]
      : [];
  const fechas = pruebas.map((x) => x.fecha).filter((f): f is string => !!f).sort();
  const pcts = pruebas.map((x) => x.porcentaje).filter((v): v is number => v != null);
  const detalle = pruebas
    .map((x) => `${x.prueba}: ${x.resultado ? ETIQUETA_CONCEPTO[x.resultado] : "sin concepto"}${x.porcentaje != null ? ` (${x.porcentaje.toLocaleString("es-CO")} %)` : ""}${x.deducido ? " deducido" : ""}`)
    .join(" · ");
  return {
    resultado,
    fecha: fechas.at(-1) ?? null,
    puntaje: pcts.length ? Math.min(...pcts) : null,
    detalle,
    deducido: pruebas.some((x) => x.deducido),
    incompleta: pruebas.some((x) => x.incompleta),
    alertas: [...sugerencia, ...pruebas.flatMap((x) => x.alertas)],
  };
}

/**
 * El informe PDF de un aspirante: la cédula (una de las conocidas, o la que
 * aparezca cerca de «documento/cédula»), el concepto (la frase con «concepto»
 * o «resultado», o el texto entero), la fecha y el puntaje si los dice.
 */
export function leerInformePdf(texto: string, cedulasConocidas: readonly string[]): Omit<FilaResultado, "fila"> {
  const plano = texto.replace(/\s+/g, " ").replace(/no\s+recomendad[oa]\s+recomendad[oa]\s+con\s+sugerencias\s+recomendad[oa]/gi, " ");
  const numeros = [...plano.matchAll(/\d[\d.\s]{4,14}\d/g)].map((m) => soloDigitos(m[0])).filter((n) => n.length >= 5 && n.length <= 11);
  const conocida = cedulasConocidas.find((c) => numeros.includes(c)) ?? null;
  const cerca = /(?:documento|c[eé]dula|c\.\s?c\.?|identificaci[oó]n)[^\d]{0,25}([\d.\s]{5,15}\d)/i.exec(plano);
  const cedula = conocida ?? (cerca ? soloDigitos(cerca[1]) : null);
  const frase = /(?:concepto(?: final)?|resultado(?: final| general)?|dictamen|recomendaci[oó]n)\s*[:\-–]?\s*([^.\n]{2,80})/i.exec(plano);
  const concepto = frase ? frase[1].trim() : null;
  const resultado = interpretarConcepto(concepto) ?? interpretarConcepto(plano.match(/\b(no\s+)?apt[oa](\s+con\s+\w+)?\b/i)?.[0]);
  const fechaTxt = /fecha[^\d]{0,30}(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})/i.exec(plano);
  const puntajeTxt = /(?:puntaje|puntuaci[oó]n)[^\d]{0,20}(\d{1,3}(?:[.,]\d+)?)/i.exec(plano);
  return {
    cedula: cedula && cedula.length >= 5 ? cedula : null,
    concepto,
    resultado,
    fecha: fechaTxt ? leerFecha(fechaTxt[1]) : null,
    puntaje: puntajeTxt ? leerPuntaje(puntajeTxt[1]) : null,
    nombre: null,
  };
}
