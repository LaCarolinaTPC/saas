/**
 * La conducta de una medida correctiva, del portal de la Policía (27-nov-2026).
 *
 * Croma devuelve del RNMC solo la tabla de expedientes (Expediente, Formato,
 * Fecha, Municipio, Estado…), sin la conducta, y así las reglas de Gestión
 * Humana no pueden distinguir un tapabocas de una riña. El portal ciudadano
 * (srvcnpc.policia.gov.co, «Consulta Ciudadano») sí la muestra al hacer clic en
 * el expediente: «Detalle Comportamiento Contrario a la Convivencia» (Artículo,
 * Numeral, Literal, Relato Hechos, Descargos) y la tabla de Medidas Correctivas.
 *
 * Se consulta por número de expediente (no pide la cédula ni CAPTCHA): primero
 * «Consultar» y después el «ver» del expediente, como una persona. Si el portal
 * cambia o no responde, no pasa nada: la medida queda sin conducta y va a
 * revisión. Nunca lanza.
 */

import { detalleExpedienteCroma, interpretarRnmcCroma, type ProveedorRnmc } from "./proveedores";

export const URL_PORTAL_RNMC = "https://srvcnpc.policia.gov.co/PSC/frm_cnp_consulta.aspx";

export interface MedidaPortal {
  medida: string;
  atribucion: string | null;
  remitido: string | null;
  estado: string | null;
}

export interface DetalleRnmcPortal {
  expediente: string;
  articulo: string | null;
  numeral: string | null;
  literal: string | null;
  localidad: string | null;
  relato: string | null;
  descargos: string | null;
  medidas: MedidaPortal[];
}

const entidades = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const limpio = (s: string | undefined | null) => {
  const t = entidades(String(s ?? "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return t && !/^no aplica$/i.test(t) ? t.slice(0, 600) : null;
};

/** El detalle del expediente en el HTML del portal (puro). null si la página no lo trae. */
export function interpretarDetalleRnmc(html: string): DetalleRnmcPortal | null {
  const span = (id: string) => html.match(new RegExp(`id="ctl00_ContentPlaceHolder3_${id}"[^>]*>([\\s\\S]*?)</span>`))?.[1];
  const expediente = limpio(span("txt_expediente"));
  if (!expediente) return null;
  const tabla = html.match(/id="ctl00_ContentPlaceHolder3_gv_medida"[\s\S]*?<\/table>/)?.[0] ?? "";
  const medidas: MedidaPortal[] = [];
  for (const fila of tabla.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const celdas = [...fila[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => limpio(c[1]));
    if (celdas.length >= 5 && celdas[0]) medidas.push({ medida: celdas[0], atribucion: celdas[1], remitido: celdas[2], estado: celdas[4] });
  }
  return {
    expediente,
    articulo: limpio(span("txt_art")),
    numeral: limpio(span("txt_numeral")),
    literal: limpio(span("txt_literal")),
    localidad: limpio(span("txt_localidad")),
    relato: limpio(span("txt_relatoHechos")),
    descargos: limpio(span("txt_descargos")),
    medidas,
  };
}

/**
 * Los campos que se añaden a la medida guardada (pending_measures), en texto plano:
 * las reglas buscan sus palabras en todos los valores de la medida.
 */
export function camposDeDetalle(d: DetalleRnmcPortal, fuente: "croma" | "portal" = "portal"): Record<string, string> {
  const campos: Record<string, string> = {};
  if (d.articulo) campos["Artículo"] = d.articulo;
  if (d.numeral) campos["Numeral"] = d.numeral;
  if (d.literal) campos["Literal"] = d.literal;
  if (d.relato) campos["Relato Hechos"] = d.relato;
  if (d.descargos) campos["Descargos"] = d.descargos;
  if (d.medidas.length) campos["Medidas Correctivas"] = d.medidas.map((m) => `${m.medida}${m.estado ? ` (${m.estado})` : ""}`).join("; ");
  campos["Detalle"] = fuente === "croma" ? "Croma (consulta del expediente)" : "Portal de la Policía (consulta por expediente)";
  return campos;
}

/** Los campos ocultos del formulario ASP.NET (__VIEWSTATE, __EVENTVALIDATION…). */
function ocultos(html: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const nombre = m[0].match(/name="([^"]+)"/)?.[1];
    if (nombre) o[nombre] = entidades(m[0].match(/value="([^"]*)"/)?.[1] ?? "");
  }
  return o;
}

/** Consulta el detalle de un expediente en el portal. Nunca lanza. */
export async function detalleExpedienteRnmc(expediente: string, opciones: { timeoutMs?: number } = {}): Promise<{ ok: true; detalle: DetalleRnmcPortal } | { ok: false; error: string }> {
  const exp = String(expediente ?? "").trim();
  if (!/^[\d-]{6,40}$/.test(exp)) return { ok: false, error: "Número de expediente no válido." };
  const hasta = Date.now() + (opciones.timeoutMs ?? 20_000);
  const cookies = new Map<string, string>();
  const guardar = (r: Response) => {
    for (const c of r.headers.getSetCookie?.() ?? []) {
      const [par] = c.split(";");
      const i = par.indexOf("=");
      if (i > 0) cookies.set(par.slice(0, i).trim(), par.slice(i + 1));
    }
  };
  const cabeceras = () => ({ "User-Agent": "Mozilla/5.0 (Gestivo)", Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") });
  const restante = () => Math.max(1000, hasta - Date.now());
  const enviar = async (campos: Record<string, string>) => {
    const r = await fetch(URL_PORTAL_RNMC, {
      method: "POST",
      headers: { ...cabeceras(), "Content-Type": "application/x-www-form-urlencoded", Referer: URL_PORTAL_RNMC },
      body: new URLSearchParams(campos).toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(restante()),
    });
    guardar(r);
    if (r.status !== 200) throw new Error(`el portal respondió ${r.status}`);
    return r.text();
  };
  try {
    const inicio = await fetch(URL_PORTAL_RNMC, { headers: cabeceras(), signal: AbortSignal.timeout(restante()) });
    guardar(inicio);
    if (inicio.status !== 200) return { ok: false, error: `El portal de la Policía respondió ${inicio.status}.` };
    const formulario = { "ctl00$ContentPlaceHolder3$ddlTipoDoc": "0", "ctl00$ContentPlaceHolder3$txtExpediente": exp };
    const consulta = await enviar({ ...ocultos(await inicio.text()), __EVENTTARGET: "ctl00$ContentPlaceHolder3$btnConsultar", __EVENTARGUMENT: "", ...formulario });
    if (!consulta.includes("gv_expedientes")) return { ok: false, error: "El portal no encontró el expediente." };
    const detalle = await enviar({ ...ocultos(consulta), __EVENTTARGET: "ctl00$ContentPlaceHolder3$gv_expedientes", __EVENTARGUMENT: "ver$0", ...formulario });
    const d = interpretarDetalleRnmc(detalle);
    if (!d) return { ok: false, error: "El portal no mostró el detalle del expediente." };
    return { ok: true, detalle: d };
  } catch (e) {
    return { ok: false, error: `No se pudo consultar el portal de la Policía (${e instanceof Error ? e.message : "error"}).` };
  }
}

const valorDe = (m: Record<string, unknown>, clave: string) => {
  const k = Object.keys(m).find((x) => x.toLowerCase() === clave);
  return k ? String(m[k] ?? "").trim() : "";
};

/** El expediente en Croma, si está configurado y no en pausa. */
async function detalleDeCroma(expediente: string): Promise<{ ok: true; detalle: DetalleRnmcPortal } | { ok: false; error: string }> {
  try {
    const { cromaPausado } = await import("./pausa");
    if (await cromaPausado()) return { ok: false, error: "Croma en pausa" };
    return await detalleExpedienteCroma(expediente);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Croma no respondió" };
  }
}

/**
 * Completa las medidas del RNMC con su conducta (Croma o el portal): solo las que no la
 * traen, no están cerradas y tienen expediente; a lo sumo 5. Devuelve el
 * resultado con las medidas completadas (o el mismo, si no hubo nada que hacer).
 */
export async function completarConductaRnmc<T>(resultado: T, opciones: { timeoutMs?: number } = {}): Promise<T> {
  const r = resultado as unknown as Record<string, unknown> | null;
  if (!r || typeof r !== "object" || !Array.isArray(r.pending_measures) || !r.pending_measures.length) return resultado;
  const medidas = r.pending_measures as Record<string, unknown>[];
  let consultadas = 0;
  const nuevas: Record<string, unknown>[] = [];
  for (const m of medidas) {
    const expediente = valorDe(m, "expediente");
    const yaTiene = ["artículo", "articulo", "comportamiento", "relato hechos"].some((k) => valorDe(m, k));
    if (!expediente || yaTiene || /cerrad/i.test(valorDe(m, "estado")) || consultadas >= 5) {
      nuevas.push(m);
      continue;
    }
    consultadas++;
    // Primero Croma (endpoint del expediente, 27-nov-2026); si no responde, está en pausa o no lo
    // encuentra, el portal de la Policía.
    const croma = await detalleDeCroma(expediente);
    if (croma.ok) {
      nuevas.push({ ...m, ...camposDeDetalle(croma.detalle, "croma") });
      continue;
    }
    const d = await detalleExpedienteRnmc(expediente, opciones);
    nuevas.push(d.ok ? { ...m, ...camposDeDetalle(d.detalle) } : { ...m, "Detalle (error)": `${croma.error} · portal: ${d.error}` });
  }
  return consultadas ? ({ ...r, pending_measures: nuevas } as unknown as T) : resultado;
}

// ── Respaldo: el RNMC por cédula en el portal, si Croma no responde (27-nov-2026) ──

/**
 * Lo que respondió el portal a una consulta por cédula, con la misma forma que
 * los datos del RNMC de Croma (para que el resto de Gestivo no note la
 * diferencia). Puro. null si la página no trae un veredicto.
 *
 * Probado el 27-nov-2026: limpio → «NO TIENE MEDIDAS CORRECTIVAS PENDIENTES POR
 * CUMPLIR», con número de validación y sin nombre; con registros → «PRESENTA LOS
 * SIGUIENTES REGISTROS», el nombre y la tabla de expedientes. El portal NO valida
 * la fecha de expedición (con otra fecha responde igual): la identidad la
 * confirman el nombre o el RUNT, como con Croma.
 */
export function interpretarRespuestaCedula(html: string): {
  found: boolean;
  full_name: string | null;
  has_pending_measures: boolean;
  status: string;
  pending_measures: Record<string, string | null>[];
  validation_number: string | null;
  message: string;
  fuente_datos: "portal_policia";
} | null {
  const span = (id: string) => limpio(html.match(new RegExp(`id="ctl00_ContentPlaceHolder3_${id}"[^>]*>([\\s\\S]*?)</span>`))?.[1]);
  // Todo el texto de la página, sin cortar (el veredicto viene después del formulario).
  const texto = entidades(html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const mensaje = (() => {
    const i = texto.indexOf("La Policía Nacional de Colombia informa");
    return i >= 0 ? texto.slice(i, i + 600) : "";
  })();
  // A veces el portal valida la fecha y a veces no (el 18-nov respondió «La fecha de expedición de la
  // Cedula de Ciudadania no es correcta, por favor verifique»; el 27-nov respondió con cualquier fecha).
  // Cuando la rechaza, es como el found=false de Croma: el asistente vuelve a pedir la fecha.
  const fechaMala = texto.match(/La fecha de expedici[oó]n[^.]{0,80}no es correcta[^.]*\.?/i)?.[0];
  if (fechaMala) {
    return { found: false, full_name: null, has_pending_measures: false, status: fechaMala, pending_measures: [], validation_number: null, message: fechaMala, fuente_datos: "portal_policia" };
  }
  if (/NO TIENE MEDIDAS CORRECTIVAS PENDIENTES/i.test(texto)) {
    const nombre = span("txtNameUser");
    return {
      found: true,
      full_name: nombre && nombre !== "." ? nombre.replace(/^\.\s*/, "") : null,
      has_pending_measures: false,
      status: "NO TIENE MEDIDAS CORRECTIVAS PENDIENTES POR CUMPLIR",
      pending_measures: [],
      validation_number: span("txtCodigoVerifi"),
      message: mensaje,
      fuente_datos: "portal_policia",
    };
  }
  if (!/PRESENTA LOS SIGUIENTES REGISTROS/i.test(texto)) return null;
  const tabla = html.match(/id="gv_expedientes"[\s\S]*?<\/table>/)?.[0] ?? "";
  const encabezados = [...tabla.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => limpio(m[1]) ?? "");
  const medidas: Record<string, string | null>[] = [];
  for (const fila of tabla.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const celdas = [...fila[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => limpio(c[1]));
    if (!celdas.length) continue;
    const m: Record<string, string | null> = {};
    encabezados.forEach((e, i) => {
      if (e) m[e] = celdas[i] ?? null;
    });
    if (Object.values(m).some(Boolean)) medidas.push(m);
  }
  return {
    found: true,
    full_name: span("txtNameUser2"),
    has_pending_measures: true,
    status: "PRESENTA LOS SIGUIENTES REGISTROS",
    pending_measures: medidas,
    validation_number: null,
    message: mensaje,
    fuente_datos: "portal_policia",
  };
}

/**
 * El RNMC por cédula en el portal (~42 s, lo que tarda la Policía). `fechaIso`:
 * AAAA-MM-DD. Nunca lanza.
 */
export async function consultarRnmcPortal(
  cedula: string,
  fechaIso: string,
  opciones: { timeoutMs?: number } = {}
): Promise<{ ok: true; datos: NonNullable<ReturnType<typeof interpretarRespuestaCedula>> } | { ok: false; error: string }> {
  const ced = String(cedula ?? "").replace(/\D/g, "");
  if (ced.length < 5 || !/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) return { ok: false, error: "Faltan la cédula o la fecha de expedición." };
  const fecha = fechaIso.split("-").reverse().join("/");
  const hasta = Date.now() + (opciones.timeoutMs ?? 90_000);
  const cookies = new Map<string, string>();
  const guardar = (r: Response) => {
    for (const c of r.headers.getSetCookie?.() ?? []) {
      const [par] = c.split(";");
      const i = par.indexOf("=");
      if (i > 0) cookies.set(par.slice(0, i).trim(), par.slice(i + 1));
    }
  };
  const cabeceras = () => ({ "User-Agent": "Mozilla/5.0 (Gestivo)", Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") });
  const restante = () => Math.max(1000, hasta - Date.now());
  const enviar = async (campos: Record<string, string>) => {
    const r = await fetch(URL_PORTAL_RNMC, {
      method: "POST",
      headers: { ...cabeceras(), "Content-Type": "application/x-www-form-urlencoded", Referer: URL_PORTAL_RNMC },
      body: new URLSearchParams(campos).toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(restante()),
    });
    guardar(r);
    if (r.status !== 200) throw new Error(`el portal respondió ${r.status}`);
    return r.text();
  };
  try {
    const inicio = await fetch(URL_PORTAL_RNMC, { headers: cabeceras(), signal: AbortSignal.timeout(restante()) });
    guardar(inicio);
    if (inicio.status !== 200) return { ok: false, error: `El portal de la Policía respondió ${inicio.status}.` };
    // Elegir «Cédula de ciudadanía» hace postback y aparece la fecha; el botón es otro (btnConsultar2).
    const conTipo = await enviar({ ...ocultos(await inicio.text()), __EVENTTARGET: "ctl00$ContentPlaceHolder3$ddlTipoDoc", __EVENTARGUMENT: "", "ctl00$ContentPlaceHolder3$ddlTipoDoc": "55", "ctl00$ContentPlaceHolder3$txtExpediente": "" });
    const respuesta = await enviar({
      ...ocultos(conTipo),
      __EVENTTARGET: "ctl00$ContentPlaceHolder3$btnConsultar2",
      __EVENTARGUMENT: "",
      "ctl00$ContentPlaceHolder3$ddlTipoDoc": "55",
      "ctl00$ContentPlaceHolder3$txtExpediente": ced,
      "ctl00$ContentPlaceHolder3$txtFechaexp": fecha,
    });
    const datos = interpretarRespuestaCedula(respuesta);
    if (!datos) return { ok: false, error: "El portal de la Policía no devolvió un veredicto (puede haber cambiado la página)." };
    return { ok: true, datos };
  } catch (e) {
    return { ok: false, error: `No se pudo consultar el portal de la Policía (${e instanceof Error ? e.message : "error"}).` };
  }
}

/**
 * Respaldo del RNMC (27-nov-2026): el portal ciudadano de la Policía, cuando
 * Croma no responde o está en pausa. Devuelve lo mismo que Croma (los datos con
 * su forma), así que el resto de Gestivo lo trata igual; queda guardado con el
 * proveedor «policia_portal». No tiene trabajos en curso. Vive aquí y no en
 * proveedores.ts: ese lo importa el navegador (lectura de la cédula) y esto es solo del servidor.
 */
export function proveedorRnmcPortal(): ProveedorRnmc {
  return {
    nombre: "policia_portal",
    async consultarRnmc(cedula, fechaExpedicion, opciones = {}) {
      const r = await consultarRnmcPortal(cedula, fechaExpedicion, { timeoutMs: opciones.timeoutMs ?? 90_000 });
      if (!r.ok) return { estado: "error", resumen: null, crudo: null, error: r.error };
      return interpretarRnmcCroma(r.datos);
    },
    async consultarTrabajoRnmc() {
      return { estado: "error", resumen: null, crudo: null, error: "El portal de la Policía no deja consultas en curso." };
    },
  };
}
