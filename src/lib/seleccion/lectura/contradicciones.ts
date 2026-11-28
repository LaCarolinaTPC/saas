/**
 * ¿Lo que dice un documento contradice lo que ya sabemos del aspirante?
 * (27-nov-2026, pedido de GH: «que revise la hoja de vida si los datos no se
 * contradicen, y las cartas»). PURO.
 *
 * Compara los campos leídos con los datos del proceso (o del chat, si todavía no
 * es candidato) y con los otros documentos leídos: el nombre y la cédula del
 * documento, la fecha de nacimiento, la ciudad, el teléfono, los meses de
 * experiencia que dijo, y las cartas laborales contra la experiencia de la hoja
 * de vida (empresa y fechas). Las advertencias van como nota del campo (la ve
 * quien revisa «Documentos leídos») y en una lista para mostrar.
 *
 * Claras (algo no cuadra): nombre, cédula o fecha de nacimiento distintos,
 * fechas imposibles en una carta. Suaves (puede tener explicación): ciudad o
 * teléfono distinto, empresa que no está en la hoja de vida, fechas que no
 * coinciden del todo, menos experiencia de la que dijo.
 */
import { nombresCoinciden } from "@/lib/verificacion/nombres";
import { NOMBRE_CLASE, type CampoLeido, type ClaseDocumento, type ExperienciaLeida } from "./esquema";

export interface DatosAspirante {
  nombre?: string | null;
  cedula?: string | null;
  fecha_nacimiento?: string | null;
  edad?: number | null;
  /** La ciudad donde dijo que vive. */
  ciudad_residencia?: string | null;
  celular?: string | null;
  experiencia_meses?: number | null;
}

export interface LecturaPrevia {
  clase: ClaseDocumento;
  campos: readonly CampoLeido[];
}

export interface Contradiccion {
  /** El campo al que se le pone la nota (null: va solo en la lista). */
  campo: string | null;
  texto: string;
  /** clara: algo no cuadra; suave: puede tener explicación. */
  nivel: "clara" | "suave";
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const nombreValido = (n: string | null | undefined) => !!n && n.trim() !== "" && !/por confirmar/i.test(n);

/** «2019-03-15», «2019-03», «2019» → meses desde el año 0 (para comparar). null si no es fecha. */
export function mesDe(v: unknown, hoy: string): number | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (/actual|presente|hoy|la fecha/.test(s)) return mesDe(hoy, hoy);
  const m = s.match(/^(\d{4})(?:-(\d{1,2}))?/);
  if (!m) return null;
  return Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : 0);
}

function edadDe(fecha: string, hoy: string): number | null {
  const a = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const h = hoy.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!a || !h) return null;
  let e = Number(h[1]) - Number(a[1]);
  if (Number(h[2]) * 100 + Number(h[3]) < Number(a[2]) * 100 + Number(a[3])) e--;
  return e;
}

/** ¿Es la misma empresa? Una palabra significativa en común (sin S.A.S., Ltda., «empresa»…). */
export function mismaEmpresa(a: string | null | undefined, b: string | null | undefined): boolean {
  const comunes = new Set(["sas", "s", "a", "ltda", "sa", "y", "de", "del", "la", "el", "los", "las", "cia", "empresa", "transportes", "transporte", "cooperativa", "e", "u"]);
  const pal = (s: string) => sinTildes(s).replace(/[^a-z0-9ñ ]+/g, " ").split(/\s+/).filter((p) => p.length > 2 && !comunes.has(p));
  if (!a || !b) return false;
  const pa = pal(a);
  const pb = new Set(pal(b));
  return pa.some((p) => pb.has(p));
}

const valorDe = (campos: readonly CampoLeido[], campo: string) => campos.find((c) => c.campo === campo)?.valor;

/** El nombre de la persona que dice el documento, según su tipo. */
function nombreDelDocumento(clase: ClaseDocumento, campos: readonly CampoLeido[]): { campo: string; nombre: string } | null {
  if (clase === "cedula") {
    const n = [texto(valorDe(campos, "nombres")), texto(valorDe(campos, "apellidos"))].filter(Boolean).join(" ");
    return n ? { campo: valorDe(campos, "apellidos") ? "apellidos" : "nombres", nombre: n } : null;
  }
  const campo = clase === "certificado_bancario" ? "titular" : clase === "hoja_vida" || clase === "carta_laboral" || clase === "licencia" ? "nombre" : null;
  const n = campo ? texto(valorDe(campos, campo)) : null;
  return campo && n ? { campo, nombre: n } : null;
}

/** Las experiencias de la hoja de vida (la del documento o la de una lectura anterior). */
function experienciasDe(campos: readonly CampoLeido[]): ExperienciaLeida[] {
  const v = valorDe(campos, "experiencias");
  return Array.isArray(v) ? (v as ExperienciaLeida[]) : [];
}

/** Una carta laboral contra las experiencias de la hoja de vida. */
function cartaContraHoja(carta: readonly CampoLeido[], experiencias: readonly ExperienciaLeida[], hoy: string, campoNota: string | null): Contradiccion[] {
  const empresa = texto(valorDe(carta, "empresa"));
  if (!empresa || !experiencias.length) return [];
  const exp = experiencias.find((e) => mismaEmpresa(e.empresa, empresa));
  if (!exp) return [{ campo: campoNota, texto: `La empresa de la carta («${empresa}») no aparece en la experiencia de la hoja de vida.`, nivel: "suave" }];
  const fuera: string[] = [];
  for (const [k, etiqueta] of [["desde", "el inicio"], ["hasta", "el final"]] as const) {
    const enCarta = mesDe(valorDe(carta, k), hoy);
    const enHoja = mesDe(exp[k], hoy);
    if (enCarta != null && enHoja != null && Math.abs(enCarta - enHoja) > 6) fuera.push(`${etiqueta} (carta ${String(valorDe(carta, k))}, hoja de vida ${exp[k]})`);
  }
  return fuera.length ? [{ campo: campoNota, texto: `En ${empresa}, la carta y la hoja de vida no coinciden en ${fuera.join(" ni en ")}: más de 6 meses de diferencia.`, nivel: "suave" }] : [];
}

/**
 * Las contradicciones de un documento leído. `previas`: los otros documentos del
 * proceso (para cruzar la carta con la hoja de vida, y al revés).
 */
export function contradiccionesDocumento(
  clase: ClaseDocumento,
  campos: readonly CampoLeido[],
  aspirante: DatosAspirante,
  previas: readonly LecturaPrevia[],
  hoy: string
): Contradiccion[] {
  const out: Contradiccion[] = [];
  const doc = NOMBRE_CLASE[clase].toLowerCase();

  // Nombre: basta un nombre y un apellido en común.
  const n = nombreDelDocumento(clase, campos);
  if (n && nombreValido(aspirante.nombre) && !nombresCoinciden(n.nombre, aspirante.nombre)) {
    out.push({ campo: n.campo, texto: `${clase === "carta_laboral" ? "La carta está a nombre de" : `El nombre de la ${doc} es`} «${n.nombre}», no el del aspirante («${aspirante.nombre}»).`, nivel: "clara" });
  }

  // Cédula (si la lectura no la comparó ya: el calculado «¿la cédula coincide?»).
  const ced = clase === "cedula" ? valorDe(campos, "numero") : clase === "hoja_vida" || clase === "certificado_bancario" ? valorDe(campos, "cedula") : undefined;
  const yaComparada = campos.some((c) => c.campo === "cedula_coincide");
  if (!yaComparada && digitos(ced).length >= 5 && digitos(aspirante.cedula).length >= 5 && digitos(ced) !== digitos(aspirante.cedula)) {
    out.push({ campo: clase === "cedula" ? "numero" : "cedula", texto: `La cédula de la ${doc} (${digitos(ced)}) no es la del aspirante (${digitos(aspirante.cedula)}).`, nivel: "clara" });
  } else if (yaComparada && valorDe(campos, "cedula_coincide") === "no") {
    out.push({ campo: null, texto: `La cédula de la ${doc} no es la del aspirante.`, nivel: "clara" });
  }

  // Fecha de nacimiento: contra la que dio o, si no, contra la edad.
  const nac = texto(valorDe(campos, "fecha_nacimiento"));
  if (nac && /^\d{4}-\d{2}-\d{2}/.test(nac)) {
    if (aspirante.fecha_nacimiento && /^\d{4}-\d{2}-\d{2}/.test(aspirante.fecha_nacimiento) && nac.slice(0, 10) !== aspirante.fecha_nacimiento.slice(0, 10)) {
      out.push({ campo: "fecha_nacimiento", texto: `La fecha de nacimiento de la ${doc} (${nac.slice(0, 10)}) no es la que dio el aspirante (${aspirante.fecha_nacimiento.slice(0, 10)}).`, nivel: "clara" });
    } else if (!aspirante.fecha_nacimiento && aspirante.edad != null) {
      const e = edadDe(nac, hoy);
      if (e != null && Math.abs(e - aspirante.edad) > 1) out.push({ campo: "fecha_nacimiento", texto: `Según la ${doc} tiene ${e} años; en el chat dijo ${aspirante.edad}.`, nivel: "clara" });
    }
  }

  if (clase === "hoja_vida") {
    const ciudad = texto(valorDe(campos, "ciudad"));
    if (ciudad && aspirante.ciudad_residencia) {
      const a = sinTildes(ciudad);
      const b = sinTildes(aspirante.ciudad_residencia);
      if (!a.includes(b) && !b.includes(a)) out.push({ campo: "ciudad", texto: `La hoja de vida dice ${ciudad}; en el chat dijo que vive en ${aspirante.ciudad_residencia} (puede estar desactualizada).`, nivel: "suave" });
    }
    const tel = digitos(valorDe(campos, "telefono")).slice(-10);
    const cel = digitos(aspirante.celular).slice(-10);
    if (tel.length === 10 && cel.length === 10 && tel !== cel) out.push({ campo: "telefono", texto: `El teléfono de la hoja de vida (${tel}) no es el del WhatsApp (${cel}).`, nivel: "suave" });
    const meses = valorDe(campos, "experiencia_conduccion_meses");
    if (typeof meses === "number" && aspirante.experiencia_meses != null && aspirante.experiencia_meses - meses > 12) {
      out.push({ campo: "experiencia_conduccion_meses", texto: `Dijo ${aspirante.experiencia_meses} meses de experiencia; la hoja de vida suma ${meses} en conducción.`, nivel: "suave" });
    }
    // Las cartas que ya llegaron, contra esta hoja de vida.
    for (const p of previas.filter((x) => x.clase === "carta_laboral")) out.push(...cartaContraHoja(p.campos, experienciasDe(campos), hoy, "experiencias"));
  }

  if (clase === "carta_laboral") {
    const desde = mesDe(valorDe(campos, "desde"), hoy);
    const hasta = mesDe(valorDe(campos, "hasta"), hoy);
    const ahora = mesDe(hoy, hoy)!;
    if (desde != null && hasta != null && desde > hasta) out.push({ campo: "hasta", texto: `La carta dice que terminó (${String(valorDe(campos, "hasta"))}) antes de empezar (${String(valorDe(campos, "desde"))}).`, nivel: "clara" });
    if (desde != null && desde > ahora) out.push({ campo: "desde", texto: `La carta tiene una fecha de inicio futura (${String(valorDe(campos, "desde"))}).`, nivel: "clara" });
    if (hasta != null && hasta > ahora) out.push({ campo: "hasta", texto: `La carta tiene una fecha de retiro futura (${String(valorDe(campos, "hasta"))}).`, nivel: "clara" });
    const hoja = previas.find((x) => x.clase === "hoja_vida" && experienciasDe(x.campos).length);
    if (hoja) out.push(...cartaContraHoja(campos, experienciasDe(hoja.campos), hoy, "empresa"));
  }
  return out;
}

/** Los campos con las contradicciones como nota (sin pisar la que ya tenían) y la lista en texto. */
export function conContradicciones(
  clase: ClaseDocumento,
  campos: readonly CampoLeido[],
  aspirante: DatosAspirante,
  previas: readonly LecturaPrevia[],
  hoy: string
): { campos: CampoLeido[]; avisos: string[] } {
  const lista = contradiccionesDocumento(clase, campos, aspirante, previas, hoy);
  const nuevos = campos.map((c) => ({ ...c }));
  for (const x of lista) {
    const c = x.campo ? nuevos.find((y) => y.campo === x.campo) : null;
    if (c && !(c.nota ?? "").includes(x.texto)) c.nota = c.nota ? `${c.nota} · ${x.texto}` : x.texto;
  }
  return { campos: nuevos, avisos: lista.map((x) => (x.nivel === "clara" ? `⚠ ${x.texto}` : x.texto)) };
}

// ── Documento simulado en el chat de prueba ─────────────────────────────────

/** El tipo de un documento simulado, por el pie que escribió quien prueba. */
export function claseDePie(pie: string | null | undefined): ClaseDocumento {
  const t = sinTildes(String(pie ?? ""));
  if (/hoja de vida|curriculum|\bhv\b|\bcv\b/.test(t)) return "hoja_vida";
  if (/carta laboral|certificado laboral|certificacion laboral|carta de trabajo|referencia laboral/.test(t)) return "carta_laboral";
  if (/certificado bancario|certificacion bancaria|cuenta|banco/.test(t)) return "certificado_bancario";
  if (/licencia|pase/.test(t)) return "licencia";
  if (/cedula|documento de identidad/.test(t)) return "cedula";
  return "otro";
}

/** Lo que ve el asistente de un documento simulado: se da por bueno. */
export function lecturaSimulada(clase: ClaseDocumento): string {
  return `Documento simulado en el chat de prueba (${NOMBRE_CLASE[clase].toLowerCase()}): se da por bueno, legible, completo y con datos que coinciden con los del aspirante.`;
}
