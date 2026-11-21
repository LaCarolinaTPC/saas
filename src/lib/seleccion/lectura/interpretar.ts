/**
 * Interpretación de lo que lee el modelo (entrega 4, R2–R4). PURO.
 * Valida la respuesta, calcula los meses de experiencia en conducción (y
 * marca los periodos sin fecha), la edad, y compara la cédula leída con la
 * del proceso. También arma el resumen que ve el asistente y lo que se
 * aplica al proceso cuando una persona acepta los campos.
 */
import {
  esquemaRespuesta,
  NOMBRE_CLASE,
  type CampoLeido,
  type ClaseDocumento,
  type DocumentoModelo,
  type ExperienciaLeida,
  type ReferenciaLeida,
} from "./esquema";

/** El primer objeto JSON del texto (el modelo a veces lo envuelve en ```json). */
export function extraerJson(texto: string): unknown {
  const t = texto.replace(/```(?:json)?/gi, "");
  const ini = t.indexOf("{");
  const fin = t.lastIndexOf("}");
  if (ini < 0 || fin <= ini) return null;
  try {
    return JSON.parse(t.slice(ini, fin + 1));
  } catch {
    return null;
  }
}

/** Un documento leído, con los archivos (índices desde 0) que lo forman. */
export interface DocumentoLeido {
  archivos: number[];
  clase: ClaseDocumento;
  estado: "leido" | "ilegible";
  resumen: string;
  campos: CampoLeido[];
  experiencias: ExperienciaLeida[];
  referencias: ReferenciaLeida[];
}

const MES_RE = /^(\d{4})-(\d{2})/;
function mesIndice(v: string | null, hoy: string): number | null {
  if (!v) return null;
  if (/actual|presente|hoy|la fecha/i.test(v)) return mesIndice(hoy, hoy);
  const m = MES_RE.exec(v) ?? /^(\d{4})$/.exec(v);
  if (!m) return null;
  const mes = m[2] ? Number(m[2]) : 1;
  return Number(m[1]) * 12 + (mes - 1);
}

/**
 * Meses de experiencia en conducción: suma de los periodos de conducción con
 * fecha de inicio y de fin (o «actual»), sin contar dos veces los que se cruzan.
 */
export function mesesConduccion(experiencias: readonly ExperienciaLeida[], hoy: string): { meses: number; sinFecha: number; periodos: number } {
  const tramos: [number, number][] = [];
  let sinFecha = 0;
  let periodos = 0;
  for (const e of experiencias) {
    if (!e.conduccion) continue;
    periodos++;
    const a = mesIndice(e.desde, hoy);
    const b = mesIndice(e.hasta, hoy);
    if (a == null || b == null || b < a) {
      sinFecha++;
      continue;
    }
    tramos.push([a, b + 1]);
  }
  tramos.sort((x, y) => x[0] - y[0]);
  let meses = 0;
  let hasta = -Infinity;
  for (const [a, b] of tramos) {
    const ini = Math.max(a, hasta);
    if (b > ini) meses += b - ini;
    hasta = Math.max(hasta, b);
  }
  return { meses, sinFecha, periodos };
}

/** Edad cumplida a `hoy` (AAAA-MM-DD). null si la fecha no sirve. */
export function edadDe(fecha: string | null | undefined, hoy: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha ?? ""));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [hy, hm, hd] = hoy.split("-").map(Number);
  let edad = hy - y;
  if (hm < mo || (hm === mo && hd < d)) edad--;
  return edad >= 0 && edad < 120 ? edad : null;
}

const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** ¿La cédula leída es la del proceso? null si falta alguna. */
export function compararCedula(leida: unknown, delProceso: unknown): boolean | null {
  const a = digitos(leida);
  const b = digitos(delProceso);
  if (a.length < 5 || b.length < 5) return null;
  return a === b;
}

function campo(c: Partial<CampoLeido> & Pick<CampoLeido, "campo" | "valor">): CampoLeido {
  return { confianza: "alta", evidencia: null, pagina: null, decision: null, valor_final: null, ...c };
}

/** Campos guardados de un documento: los leídos más las listas y los calculados. */
export function camposDeDocumento(doc: Pick<DocumentoModelo, "clase" | "campos" | "experiencias" | "referencias">, ctx: { hoy: string; cedulaProceso?: string | null }): CampoLeido[] {
  const out: CampoLeido[] = doc.campos
    .filter((c) => c.valor != null)
    .map((c) => campo({ campo: c.campo, valor: c.campo === "numero" && doc.clase === "cedula" ? digitos(c.valor) : c.valor, confianza: c.confianza, evidencia: c.evidencia, pagina: c.pagina }));
  const valor = (k: string) => out.find((c) => c.campo === k)?.valor as string | undefined;

  if (doc.clase === "hoja_vida" && doc.experiencias.length) {
    out.push(campo({ campo: "experiencias", valor: doc.experiencias, confianza: "media" }));
    const m = mesesConduccion(doc.experiencias, ctx.hoy);
    if (m.periodos > 0) {
      out.push(
        campo({
          campo: "experiencia_conduccion_meses",
          valor: m.meses,
          confianza: m.sinFecha ? "baja" : "media",
          calculado: true,
          nota: m.sinFecha ? `${m.sinFecha} ${m.sinFecha === 1 ? "periodo de conducción sin fecha completa: no se contó" : "periodos de conducción sin fecha completa: no se contaron"}` : null,
        })
      );
    }
  }
  if ((doc.clase === "hoja_vida" || doc.clase === "carta_laboral") && doc.referencias.some((r) => r.nombre || r.telefono)) {
    out.push(campo({ campo: "referencias", valor: doc.referencias.filter((r) => r.nombre || r.telefono), confianza: "media" }));
  }
  const nacimiento = valor("fecha_nacimiento");
  const edad = edadDe(nacimiento, ctx.hoy);
  if (edad != null) out.push(campo({ campo: "edad", valor: edad, calculado: true, confianza: out.find((c) => c.campo === "fecha_nacimiento")!.confianza }));
  const ced = doc.clase === "cedula" ? valor("numero") : doc.clase === "hoja_vida" ? valor("cedula") : undefined;
  const coincide = compararCedula(ced, ctx.cedulaProceso);
  if (coincide != null) {
    out.push(campo({ campo: "cedula_coincide", valor: coincide ? "sí" : "no", calculado: true, nota: coincide ? null : `La leída (${digitos(ced)}) no es la del proceso (${digitos(ctx.cedulaProceso)})` }));
  }
  return out;
}

/**
 * Valida la respuesta del modelo para `n` archivos. Los archivos que el
 * modelo no ubicó en ningún documento quedan como «otro» ilegible. null si la
 * respuesta no es JSON con la forma esperada.
 */
export function interpretarRespuesta(texto: string, n: number, ctx: { hoy: string; cedulaProceso?: string | null }): DocumentoLeido[] | null {
  const r = esquemaRespuesta.safeParse(extraerJson(texto));
  if (!r.success) return null;
  const usados = new Set<number>();
  const docs: DocumentoLeido[] = [];
  for (const d of r.data.documentos) {
    // Números desde 1 → índices desde 0; sin repetir un archivo en dos documentos.
    const archivos = [...new Set(d.archivos.map((x) => x - 1))].filter((i) => i >= 0 && i < n && !usados.has(i));
    if (!archivos.length) continue;
    archivos.forEach((i) => usados.add(i));
    const legible = d.legible !== false;
    docs.push({
      archivos,
      clase: d.clase,
      estado: legible ? "leido" : "ilegible",
      resumen: (legible ? d.resumen : d.motivo || d.resumen) ?? (legible ? NOMBRE_CLASE[d.clase] : "no se pudo leer"),
      campos: legible ? camposDeDocumento(d, ctx) : [],
      experiencias: legible ? d.experiencias : [],
      referencias: legible ? d.referencias : [],
    });
  }
  for (let i = 0; i < n; i++) {
    if (!usados.has(i)) docs.push({ archivos: [i], clase: "otro", estado: "ilegible", resumen: "el modelo no dijo qué es este archivo", campos: [], experiencias: [], referencias: [] });
  }
  return docs;
}

/** Lo que ve el asistente junto al archivo, en una línea. */
export function resumenParaAsistente(d: Pick<DocumentoLeido, "clase" | "estado" | "resumen" | "campos">): string {
  if (d.estado === "ilegible") {
    return `no se pudo leer (${d.resumen}): pídele con amabilidad que la vuelva a enviar con buena luz, sin flash y con el documento completo`;
  }
  const v = (k: string) => d.campos.find((c) => c.campo === k)?.valor;
  const partes: string[] = [NOMBRE_CLASE[d.clase].toLowerCase()];
  if (d.clase === "licencia") {
    if (v("categorias")) partes.push(`categorías: ${v("categorias")}`);
    if (v("restricciones")) partes.push(`restricciones: ${v("restricciones")}`);
  } else if (d.clase === "hoja_vida") {
    const meses = v("experiencia_conduccion_meses");
    if (typeof meses === "number") partes.push(`unos ${meses} meses de experiencia manejando según la hoja de vida`);
    const refs = v("referencias");
    if (Array.isArray(refs) && refs.length) partes.push(`${refs.length} referencias`);
  } else if (d.clase === "carta_laboral") {
    if (v("empresa")) partes.push(`de ${v("empresa")}`);
    if (v("cargo")) partes.push(`cargo: ${v("cargo")}`);
  } else if (d.clase === "cedula" && v("numero")) {
    partes.push(`número ${v("numero")}`);
  }
  if (v("cedula_coincide") === "no") partes.push("la cédula no coincide con la que dio");
  partes.push("pendiente de revisión por Gestión Humana: no le confirmes datos que él no haya dicho");
  return partes.join("; ");
}

/** De qué campo leído sale cada calculado: sigue su decisión. */
const ORIGEN_CALCULADO: Record<string, string> = {
  experiencia_conduccion_meses: "experiencias",
  edad: "fecha_nacimiento",
};

/**
 * Los calculados no se deciden a mano: si se acepta el campo del que salen,
 * quedan aceptados (la edad con la fecha corregida, si se corrigió); si se
 * rechaza, rechazados.
 */
export function conCalculados(campos: readonly CampoLeido[], hoy?: string): CampoLeido[] {
  return campos.map((c) => {
    const origen = c.calculado ? campos.find((x) => x.campo === ORIGEN_CALCULADO[c.campo]) : undefined;
    if (!origen?.decision) return c;
    if (origen.decision === "rechazado") return { ...c, decision: "rechazado", valor_final: null };
    if (c.campo === "edad" && origen.decision === "corregido") {
      const edad = edadDe(String(origen.valor_final ?? ""), hoy ?? new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10));
      return edad == null ? { ...c, decision: "rechazado", valor_final: null } : { ...c, decision: "corregido", valor_final: edad };
    }
    return { ...c, decision: "aceptado", valor_final: null };
  });
}

/** Valor aceptado de un campo: el corregido o el leído; null si se rechazó o no se ha decidido. */
export function valorAceptado(c: CampoLeido): unknown {
  if (c.decision === "rechazado" || c.decision == null) return null;
  return c.decision === "corregido" ? c.valor_final : c.valor;
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Qué se escribe en el proceso con los campos aceptados de un documento.
 * Solo llena lo que está vacío (`actual`), salvo las restricciones de la
 * licencia, que son nuevas. Devuelve los cambios y el origen de cada dato.
 */
export function cambiosParaProceso(
  clase: ClaseDocumento,
  campos: readonly CampoLeido[],
  actual: { fecha_nacimiento?: string | null; cedula_fecha_expedicion?: string | null; experiencia_meses?: number | null; licencia_restricciones?: string | null; edad?: number | null },
  hoy: string
): { cambios: Record<string, unknown>; origen: Record<string, "leido"> } {
  const cambios: Record<string, unknown> = {};
  const acepta = (k: string) => {
    const c = campos.find((x) => x.campo === k);
    return c ? valorAceptado(c) : null;
  };
  const nac = acepta("fecha_nacimiento");
  if (typeof nac === "string" && FECHA_RE.test(nac) && !actual.fecha_nacimiento) {
    cambios.fecha_nacimiento = nac;
    const edad = edadDe(nac, hoy);
    if (edad != null && actual.edad == null) cambios.edad = edad;
  }
  if (clase === "cedula") {
    const exp = acepta("fecha_expedicion");
    if (typeof exp === "string" && FECHA_RE.test(exp) && !actual.cedula_fecha_expedicion) cambios.cedula_fecha_expedicion = exp;
  }
  if (clase === "licencia") {
    const r = acepta("restricciones");
    if (typeof r === "string" && r.trim()) cambios.licencia_restricciones = r.trim().slice(0, 300);
  }
  if (clase === "hoja_vida") {
    const meses = Number(acepta("experiencia_conduccion_meses"));
    if (Number.isFinite(meses) && meses > 0 && actual.experiencia_meses == null) cambios.experiencia_meses = Math.round(meses);
  }
  const origen = Object.fromEntries(Object.keys(cambios).map((k) => [k, "leido" as const]));
  return { cambios, origen };
}

/** Referencias aceptadas (para crearlas en la carpeta). */
export function referenciasAceptadas(campos: readonly CampoLeido[]): ReferenciaLeida[] {
  const c = campos.find((x) => x.campo === "referencias");
  const v = c ? valorAceptado(c) : null;
  return Array.isArray(v) ? (v as ReferenciaLeida[]).filter((r) => r && (r.nombre || r.telefono)) : [];
}

/** Ítem de la carpeta que corresponde a la clase, por palabras («Fotocopia de la licencia» → licencia). */
export function itemDeClase(clase: ClaseDocumento, items: readonly string[]): string | null {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const clave: Partial<Record<ClaseDocumento, RegExp>> = {
    cedula: /cedula/,
    licencia: /licencia/,
    hoja_vida: /hoja de vida/,
    carta_laboral: /carta laboral|certificado laboral/,
  };
  const re = clave[clase];
  return re ? (items.find((i) => re.test(norm(i))) ?? null) : null;
}
