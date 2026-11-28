/**
 * Lectura con IA del certificado que una persona adjunta en «Lo revisé a mano»
 * (26-nov-2026): cuando Croma no responde, quien revisa descarga el certificado
 * del portal oficial (Policía, Procuraduría, Contraloría, RNMC, SIMIT, RUNT) y
 * la IA de «Documentos» lo lee para llenar la revisión: si tiene hallazgo, el
 * valor de los comparendos, la licencia. La persona revisa y guarda; la IA no
 * guarda nada sola. Puro (la llamada está en lectura-certificado-servidor.ts).
 */
import { nombresCoinciden, palabrasNombre } from "./nombres";

export type FuenteCertificado = "policia" | "procuraduria" | "contraloria" | "rnmc" | "simit" | "runt";

export const NOMBRE_CERTIFICADO: Record<FuenteCertificado, string> = {
  policia: "certificado de antecedentes judiciales de la Policía Nacional",
  procuraduria: "certificado de antecedentes disciplinarios de la Procuraduría General de la Nación",
  contraloria: "certificado de responsabilidad fiscal de la Contraloría General de la República (boletín SIBOR)",
  rnmc: "consulta del Registro Nacional de Medidas Correctivas (RNMC) de la Policía Nacional",
  simit: "estado de cuenta del SIMIT (multas y comparendos de tránsito)",
  runt: "certificado o consulta del RUNT (licencia de conducción)",
};

const QUE_ES_HALLAZGO: Record<FuenteCertificado, string> = {
  policia: "«hallazgo» es true si dice que tiene asuntos pendientes con las autoridades judiciales; false si dice que NO tiene asuntos pendientes.",
  procuraduria: "«hallazgo» es true si registra sanciones o inhabilidades vigentes; false si dice que no registra sanciones ni inhabilidades.",
  contraloria: "«hallazgo» es true si la persona aparece como responsable fiscal; false si no se encuentra reportada como responsable fiscal.",
  rnmc: "«hallazgo» es true si tiene medidas correctivas pendientes por cumplir; false si dice que no tiene medidas correctivas pendientes.",
  simit: "«valor» es el total en pesos de las multas y comparendos pendientes (0 si está a paz y salvo); «hallazgo» es true si el total es mayor que 0.",
  runt: "«categorias» son las categorías de licencia de conducción vigentes (p. ej. [\"C2\"]), «vence» la fecha de vencimiento de la de mayor categoría (AAAA-MM-DD) y «restricciones» las restricciones médicas si las hay; «hallazgo» siempre false.",
};

/**
 * El detalle de cada anotación (27-nov-2026): con él las reglas de Gestión Humana
 * cuentan las medidas del RNMC, buscan sus palabras por fuente y aplican las
 * tolerancias de la Contraloría (valor y antigüedad). Antes la revisión manual
 * solo guardaba «con hallazgo» y todo iba a revisión «sin el detalle para contarlas».
 */
const QUE_SON_REGISTROS: Record<FuenteCertificado, string> = {
  // El portal muestra el detalle al hacer clic en el expediente («Detalle Comportamiento Contrario a la
  // Convivencia»: Artículo, Numeral, Relato Hechos, Descargos y la tabla de Medidas Correctivas; visto el
  // 27-nov-2026). Si el PDF lo trae, va todo en «comportamiento» para que las palabras de las reglas lo encuentren.
  rnmc:
    "«registros» es la lista de expedientes que aparecen, uno por expediente: {\"expediente\": string|null, \"fecha\": \"AAAA-MM-DD\"|null, \"comportamiento\": string|null, \"medida\": string|null, \"estado\": string|null}. Si el documento trae el «Detalle Comportamiento Contrario a la Convivencia», «comportamiento» lleva, con sus palabras, el Artículo, el Numeral, el Relato Hechos y los Descargos (p. ej. «Art. 35 … Num. 2 … Relato: … Descargos: …»), y «medida» las medidas correctivas de esa tabla con su estado (p. ej. «Multa General Tipo 4 (EN PROCESO); Participación en programa comunitario (EN PROCESO)»). Si solo trae la tabla del expediente (Expediente, Formato, Fecha, Departamento, Municipio, Apelación, Estado), «comportamiento» es null y «estado» es la columna Estado (Abierto, En proceso, Cerrado).",
  policia:
    "«registros» es la lista de asuntos pendientes que aparezcan: {\"descripcion\": string|null (delito, requerimiento u orden con las palabras del documento), \"autoridad\": string|null, \"fecha\": \"AAAA-MM-DD\"|null, \"estado\": string|null}.",
  procuraduria:
    "«registros» es la lista de sanciones o inhabilidades que aparezcan: {\"descripcion\": string|null (sanción, falta o inhabilidad con las palabras del documento), \"entidad\": string|null, \"fecha\": \"AAAA-MM-DD\"|null, \"estado\": string|null (vigente, cumplida…)}.",
  contraloria:
    "«registros» es la lista de fallos con responsabilidad fiscal: {\"descripcion\": string|null, \"entidad\": string|null, \"valor\": number|null (en pesos), \"fecha\": \"AAAA-MM-DD\"|null (fecha del fallo), \"estado\": string|null}.",
  simit:
    "«registros» es la lista de comparendos o multas pendientes: {\"descripcion\": string|null (infracción con su código), \"fecha\": \"AAAA-MM-DD\"|null, \"valor\": number|null, \"estado\": string|null}.",
  runt: "«registros» es [] (no aplica).",
};

export const SISTEMA_CERTIFICADO =
  "Eres un asistente que lee certificados oficiales colombianos para Gestión Humana. Respondes solo con un objeto JSON, sin texto antes ni después. Si un dato no aparece en el documento, usa null; no inventes.";

export function instruccionCertificado(fuente: FuenteCertificado): string {
  return [
    `Este archivo debería ser el ${NOMBRE_CERTIFICADO[fuente]}.`,
    "Responde con este JSON:",
    '{"es_esa_fuente": boolean, "cedula": string|null, "nombre": string|null, "fecha_documento": "AAAA-MM-DD"|null, "hallazgo": boolean|null, "valor": number|null, "categorias": string[]|null, "vence": "AAAA-MM-DD"|null, "restricciones": string|null, "veredicto": string|null, "registros": object[], "detalle": string}',
    "«es_esa_fuente» es false si el archivo es otro documento (otra entidad, una foto que no es el certificado, etc.).",
    "«cedula» solo los dígitos del número de documento de la persona consultada.",
    QUE_ES_HALLAZGO[fuente],
    "«veredicto» es la frase del certificado que dice el resultado, copiada con sus palabras (p. ej. «NO TIENE ASUNTOS PENDIENTES CON LAS AUTORIDADES JUDICIALES»).",
    QUE_SON_REGISTROS[fuente],
    "Sin anotaciones, «registros» es []. No resumas ni cambies las palabras del documento en «comportamiento» y «descripcion»; si un dato no aparece, null.",
    "«detalle» es una frase corta con lo que dice el certificado (el veredicto con sus palabras y, si hay, el número del certificado).",
  ].join("\n");
}

export interface LecturaCertificado {
  /** El archivo es el certificado de esa fuente. */
  esDeLaFuente: boolean;
  cedula: string | null;
  /** false si la cédula del certificado no es la del candidato; null si no se pudo comparar. */
  cedulaCoincide: boolean | null;
  nombre: string | null;
  fecha: string | null;
  hallazgo: boolean | null;
  /** SIMIT: total de comparendos en pesos. */
  valor: number | null;
  /** RUNT. */
  categoria: string | null;
  vence: string | null;
  restricciones: string | null;
  detalle: string;
  /** La frase del resultado, con las palabras del certificado (27-nov-2026). */
  veredicto: string | null;
  /** Cada anotación con su detalle (medidas del RNMC, fallos de la Contraloría…). */
  registros: RegistroCertificado[];
  /** Avisos para la persona (cédula distinta, otro documento, certificado viejo). */
  avisos: string[];
}

/** Una anotación leída: solo textos, números o null (lo demás se descarta). */
export type RegistroCertificado = Record<string, string | number | null>;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CAMPOS_REGISTRO = ["expediente", "fecha", "comportamiento", "medida", "descripcion", "autoridad", "entidad", "valor", "estado"];

/** Los registros que devolvió la IA, limpios: campos conocidos, textos cortos, a lo sumo 20. Puro. */
export function limpiarRegistros(v: unknown): RegistroCertificado[] {
  if (!Array.isArray(v)) return [];
  const salida: RegistroCertificado[] = [];
  for (const x of v.slice(0, 20)) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const r: RegistroCertificado = {};
    for (const k of CAMPOS_REGISTRO) {
      const val = (x as Record<string, unknown>)[k];
      if (k === "valor") {
        const n = typeof val === "number" ? val : typeof val === "string" ? Number(val.replace(/[^\d]/g, "")) : NaN;
        if (Number.isFinite(n) && String(val ?? "").trim() !== "") r.valor = Math.max(0, Math.round(n));
      } else if (typeof val === "string" && val.trim()) {
        r[k] = k === "fecha" && !FECHA.test(val.trim()) ? null : val.trim().slice(0, 300);
      }
    }
    if (Object.values(r).some((y) => y != null && y !== "")) salida.push(r);
  }
  return salida;
}
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** El primer objeto JSON de la respuesta (el modelo a veces lo envuelve en ```json). */
function objetoJson(respuesta: string): Record<string, unknown> | null {
  const limpio = respuesta.replace(/```(?:json)?/gi, "");
  const ini = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (ini < 0 || fin <= ini) return null;
  try {
    const o = JSON.parse(limpio.slice(ini, fin + 1)) as unknown;
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * La respuesta del modelo → lectura con avisos. `hoy` (AAAA-MM-DD) sirve para
 * avisar si el certificado tiene más de 30 días. null si no se pudo leer.
 */
export function interpretarCertificado(respuesta: string, fuente: FuenteCertificado, cedulaProceso: string | null, hoy: string, nombreProceso: string | null = null): LecturaCertificado | null {
  const o = objetoJson(respuesta);
  if (!o) return null;
  const cedula = texto(o.cedula)?.replace(/\D/g, "") || null;
  const propia = (cedulaProceso ?? "").replace(/\D/g, "") || null;
  const cedulaCoincide = cedula && propia ? cedula === propia : null;
  const fecha = texto(o.fecha_documento);
  const valorCrudo = typeof o.valor === "number" ? o.valor : typeof o.valor === "string" ? Number(o.valor.replace(/[^\d]/g, "")) : null;
  const valor = valorCrudo != null && Number.isFinite(valorCrudo) ? Math.max(0, Math.round(valorCrudo)) : null;
  const categorias = Array.isArray(o.categorias) ? o.categorias.map(texto).filter((c): c is string => Boolean(c)).map((c) => c.toUpperCase()) : [];
  const vence = texto(o.vence);
  let hallazgo = typeof o.hallazgo === "boolean" ? o.hallazgo : null;
  if (fuente === "simit" && valor != null) hallazgo = valor > 0;
  if (fuente === "runt") hallazgo = false;
  const esDeLaFuente = o.es_esa_fuente !== false;

  const avisos: string[] = [];
  if (!esDeLaFuente) avisos.push("La IA dice que este archivo no parece ser el certificado de esta fuente: revíselo antes de guardar.");
  if (cedulaCoincide === false) avisos.push(`El certificado es de la cédula ${cedula}, no de la del candidato (${propia}).`);
  // 27-nov-2026: también el nombre (una cédula bien escrita en un certificado ajeno, o al revés).
  if (nombreProceso && texto(o.nombre) && palabrasNombre(texto(o.nombre)!).length >= 2 && palabrasNombre(nombreProceso).length >= 2 && !nombresCoinciden(texto(o.nombre), nombreProceso)) {
    avisos.push(`El certificado está a nombre de «${texto(o.nombre)}», no de «${nombreProceso}».`);
  }
  if (fecha && FECHA.test(fecha) && FECHA.test(hoy)) {
    const dias = Math.round((new Date(`${hoy}T12:00:00Z`).getTime() - new Date(`${fecha}T12:00:00Z`).getTime()) / 86_400_000);
    if (dias > 30) avisos.push(`El certificado es del ${fecha} (hace ${dias} días): conviene descargar uno de hoy.`);
  }
  if (fuente === "runt" && vence && FECHA.test(vence) && FECHA.test(hoy) && vence < hoy) avisos.push(`La licencia venció el ${vence}.`);
  if (hallazgo == null && fuente !== "runt") avisos.push("La IA no pudo decir si tiene hallazgo: elíjalo usted.");

  return {
    esDeLaFuente,
    cedula,
    cedulaCoincide,
    nombre: texto(o.nombre),
    fecha: fecha && FECHA.test(fecha) ? fecha : null,
    hallazgo,
    valor: fuente === "simit" ? valor : null,
    categoria: fuente === "runt" && categorias.length ? categorias.join(", ") : null,
    vence: fuente === "runt" && vence && FECHA.test(vence) ? vence : null,
    restricciones: fuente === "runt" ? texto(o.restricciones) : null,
    detalle: texto(o.detalle) ?? "",
    veredicto: texto(o.veredicto)?.slice(0, 300) ?? null,
    registros: fuente === "runt" ? [] : limpiarRegistros(o.registros),
    avisos,
  };
}
