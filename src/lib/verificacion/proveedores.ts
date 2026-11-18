/**
 * Proveedores de verificación de antecedentes y SIMIT.
 *
 * Croma (docs.usecroma.com) cubre, en Colombia, SIMIT, RUNT, Policía, RNMC,
 * Procuraduría y Contraloría. En la entrega 1 se usan el SIMIT y el RUNT de
 * personas (`/co/runt/citizen-by-document/v1`), que trae cada licencia con sus
 * categorías y la fecha de vencimiento de cada una: así el asistente no tiene
 * que preguntar la vigencia. Sin CROMA_API_KEY no hay proveedor y Gestión
 * Humana registra el SIMIT y la licencia a mano en la ficha (modo manual).
 *
 * El SIMIT de Croma puede responder al instante (200) o como trabajo
 * asíncrono (202 + id); en ese caso la consulta queda «pendiente» y el cron
 * de seguimiento la termina con `consultarTrabajoSimit`.
 */

export interface ResultadoSimit {
  /** ok: sin deuda · hallazgo: tiene deuda · pendiente: trabajo asíncrono en curso · error: falló. */
  estado: "ok" | "hallazgo" | "pendiente" | "error";
  /** Total adeudado en pesos (0 si está a paz y salvo); null si no hay resultado todavía. */
  valor: number | null;
  /** Respuesta del proveedor, tal cual, para auditoría (verificaciones_externas.resultado). */
  crudo: unknown;
  /** Id del trabajo asíncrono, si quedó pendiente. */
  trabajoId?: string | null;
  costo?: number | null;
  error?: string;
}

export interface ProveedorVerificacion {
  nombre: string;
  consultarSimit(cedula: string): Promise<ResultadoSimit>;
  consultarTrabajoSimit(trabajoId: string): Promise<ResultadoSimit>;
}

const CROMA_URL = "https://api.croma.run";
/** Espera en línea del trabajo (Croma admite hasta 55 s; el webhook tiene 60 s en total). */
const ESPERA_SEGUNDOS = 15;
const TIMEOUT_MS = (ESPERA_SEGUNDOS + 5) * 1000;
/**
 * Procuraduría y Contraloría son consultas en línea («Live», sin trabajo ni
 * callback): la Contraloría tarda decenas de segundos y la Procuraduría, el
 * 18-nov-2026, respondió una cédula a los 75 s. Se espera hasta 110 s (Croma
 * corta a los 180 s).
 */
const TIMEOUT_ANTECEDENTES_MS = 110_000;

function configCroma(): { url: string; clave: string } | null {
  const clave = process.env.CROMA_API_KEY?.trim();
  if (!clave) return null;
  const url = (process.env.CROMA_API_URL?.trim() || CROMA_URL).replace(/\/$/, "");
  return { url, clave };
}

interface SimitDataCroma {
  found?: boolean;
  is_plate?: boolean;
  clear?: boolean;
  summary?: { total?: number | null; total_fines?: number | null; total_agreements?: number | null } | null;
}

/** Datos del SIMIT de Croma → resultado. Puro, para poder probarlo. */
export function interpretarSimitCroma(data: SimitDataCroma | null | undefined): ResultadoSimit {
  if (!data || typeof data !== "object") return { estado: "error", valor: null, crudo: data ?? null, error: "Croma no devolvió datos del SIMIT." };
  if (data.found === false) return { estado: "ok", valor: 0, crudo: data };
  if (data.is_plate === true) return { estado: "error", valor: null, crudo: data, error: "Croma interpretó la cédula como una placa." };
  const s = data.summary ?? null;
  const total =
    typeof s?.total === "number"
      ? s.total
      : typeof s?.total_fines === "number" || typeof s?.total_agreements === "number"
        ? (s?.total_fines ?? 0) + (s?.total_agreements ?? 0)
        : data.clear
          ? 0
          : null;
  if (total == null) return { estado: "error", valor: null, crudo: data, error: "La respuesta del SIMIT no trae el total adeudado." };
  return { estado: total > 0 ? "hallazgo" : "ok", valor: total, crudo: data };
}

interface JobEnvelope {
  job?: { id?: string; status?: string };
  data?: unknown;
  error?: { message?: string; code?: string } | null;
}

/** Sobre de trabajo de Croma → resultado (completed / failed / en curso). */
export function interpretarTrabajoCroma(env: JobEnvelope): ResultadoSimit {
  const estado = env.job?.status;
  if (estado === "completed") return interpretarSimitCroma(env.data as SimitDataCroma);
  if (estado === "queued" || estado === "running") {
    return { estado: "pendiente", valor: null, crudo: env, trabajoId: env.job?.id ?? null };
  }
  return { estado: "error", valor: null, crudo: env, error: env.error?.message ?? `El trabajo de Croma terminó en «${estado ?? "desconocido"}».` };
}

async function llamarCroma(
  config: { url: string; clave: string },
  init: { metodo: "GET" | "POST"; ruta: string; cuerpo?: unknown; timeoutMs?: number; esperaSegundos?: number }
) {
  const espera = init.esperaSegundos ?? ESPERA_SEGUNDOS;
  const res = await fetch(`${config.url}${init.ruta}`, {
    method: init.metodo,
    headers: {
      Authorization: `Bearer ${config.clave}`,
      "Content-Type": "application/json",
      Prefer: `wait=${espera}`,
    },
    body: init.cuerpo ? JSON.stringify(init.cuerpo) : undefined,
    signal: AbortSignal.timeout(init.timeoutMs ?? (init.esperaSegundos != null ? (espera + 5) * 1000 : TIMEOUT_MS)),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, json };
}

function errorCroma(status: number, json: Record<string, unknown> | null): ResultadoSimit {
  const e = (json?.error ?? null) as { message?: string; code?: string } | null;
  const mensaje =
    status === 401
      ? "Croma rechazó la clave (CROMA_API_KEY)."
      : status === 429
        ? "Croma: límite de consultas alcanzado; se reintenta más tarde."
        : e?.message ?? `Croma respondió ${status}.`;
  return { estado: "error", valor: null, crudo: json, error: mensaje };
}

async function consultarSimitCroma(config: { url: string; clave: string }, cedula: string): Promise<ResultadoSimit> {
  try {
    const { status, json } = await llamarCroma(config, {
      metodo: "POST",
      ruta: "/co/simit/account-status/v1",
      cuerpo: { document_number: cedula.replace(/\D/g, "") },
    });
    if (status === 200) return interpretarSimitCroma((json?.data ?? null) as SimitDataCroma | null);
    if (status === 202) return interpretarTrabajoCroma((json ?? {}) as JobEnvelope);
    return errorCroma(status, json);
  } catch (e) {
    return { estado: "error", valor: null, crudo: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function consultarTrabajoCroma(config: { url: string; clave: string }, trabajoId: string): Promise<ResultadoSimit> {
  try {
    const { status, json } = await llamarCroma(config, { metodo: "GET", ruta: `/jobs/${encodeURIComponent(trabajoId)}` });
    if (status === 200) return interpretarTrabajoCroma((json ?? {}) as JobEnvelope);
    return errorCroma(status, json);
  } catch (e) {
    return { estado: "error", valor: null, crudo: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── RUNT: licencias de conducción ──────────────────────────────────────────

/** Una categoría de licencia según el RUNT. */
export interface CategoriaRunt {
  /** «C2», «B1»… */
  categoria: string;
  /** Fecha de vencimiento (AAAA-MM-DD); null si el RUNT no la trae. */
  vence: string | null;
  /** false si la licencia está cancelada, suspendida o retenida. */
  activa: boolean;
}

/** Lo que el semáforo necesita del RUNT, ya leído. Se guarda en procesos_contratacion.licencia_runt. */
export interface ResumenRunt {
  /** false si el RUNT no tiene registro de la cédula: puede estar mal escrita, así que no se descarta. Sin dato = true. */
  registrado?: boolean;
  /** Cédula consultada (solo dígitos): si el aspirante la corrige, se vuelve a consultar. */
  cedula?: string;
  /** false si la persona no tiene licencias (o no está en el RUNT). */
  tieneLicencia: boolean;
  categorias: CategoriaRunt[];
  consultadoEl: string;
  /** Nombre completo según el RUNT: el asistente ya no lo pregunta. */
  nombre?: string | null;
  /** Restricciones de las licencias en firme (p. ej. «CONDUCIR CON LENTES»); vacío si no tiene. */
  restricciones?: string[];
  /**
   * true si el nombre del RUNT no es el del registro civil (RNMC, validado con
   * la fecha de expedición): el registro del RUNT es de otra persona y la
   * licencia se revisa a mano. Pasó el 17-nov-2026 con una cédula de prueba.
   */
  nombreNoCoincide?: boolean;
  /** Nombre según el RNMC con el que se comparó. */
  nombreRegistro?: string | null;
  /**
   * true si la consulta se hizo con el primer apellido del registro civil
   * (RNMC): un «no aparece» quiere decir que esa persona no está en el RUNT.
   */
  identidadVerificada?: boolean;
}

const PARTICULAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "SAN", "SANTA", "VAN", "VON", "Y"]);

/**
 * Palabras del nombre agrupadas en bloques: cada partícula («DE», «LA»…) va
 * con la palabra que la sigue, así «DE LA HOZ» o «DE AVILA» son un solo bloque.
 * Como pide el RUNT, guiones, apóstrofes y demás símbolos se quitan y el texto
 * queda continuo («D'ALEMAN» → «DALEMAN», «GARCÍA-PÉREZ» → «GARCÍAPÉREZ»).
 */
function bloquesNombre(nombreCompleto: string | null | undefined): string[] {
  const t = (nombreCompleto ?? "")
    .toUpperCase()
    .replace(/[^\p{L}\s]+/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const bloques: string[] = [];
  let pendientes: string[] = [];
  for (const p of t) {
    if (PARTICULAS.has(p)) {
      pendientes.push(p);
      continue;
    }
    bloques.push([...pendientes, p].join(" "));
    pendientes = [];
  }
  // Partícula suelta al final: va con el bloque anterior.
  if (pendientes.length) {
    if (bloques.length) bloques[bloques.length - 1] += ` ${pendientes.join(" ")}`;
    else bloques.push(pendientes.join(" "));
  }
  return bloques;
}

/**
 * Posibles primeros apellidos de un nombre en el orden del registro civil
 * («NOMBRES APELLIDO1 APELLIDO2»), del más probable al menos: con tres bloques
 * o más, el penúltimo y, por si tiene un solo apellido («JUAN CARLOS PÉREZ»),
 * el último; con dos, el último. Las partículas van con su apellido
 * («MARÍA DE LA HOZ PÉREZ» → «DE LA HOZ»; «ROSA MARTÍNEZ DE ÁVILA» → «MARTÍNEZ»).
 */
export function apellidosPosibles(nombreCompleto: string | null | undefined): string[] {
  const b = bloquesNombre(nombreCompleto);
  if (b.length < 2) return [];
  if (b.length === 2) return [b[1]];
  return [...new Set([b[b.length - 2], b[b.length - 1]])];
}

/** Primer apellido más probable (ver apellidosPosibles); null si el nombre tiene una sola palabra. */
export function primerApellido(nombreCompleto: string | null | undefined): string | null {
  return apellidosPosibles(nombreCompleto)[0] ?? null;
}

/** Minúsculas, sin tildes ni signos, en palabras. */
function palabrasNombre(n: string): string[] {
  return n
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-ZÑ ]+/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 1);
}

/**
 * ¿Los dos nombres son de la misma persona? Basta con dos palabras en común
 * (un nombre y un apellido) o, si uno tiene menos de dos palabras, con todas las suyas.
 */
export function nombresCoinciden(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return true;
  const pa = palabrasNombre(a);
  const pb = new Set(palabrasNombre(b));
  const comunes = pa.filter((p) => pb.has(p)).length;
  return comunes >= Math.min(2, pa.length, pb.size);
}

export interface ResultadoRunt {
  /** ok: hay respuesta (con o sin licencia) · pendiente: trabajo asíncrono · error: falló. */
  estado: "ok" | "pendiente" | "error";
  resumen: ResumenRunt | null;
  crudo: unknown;
  trabajoId?: string | null;
  error?: string;
}

interface RuntCategoriaCroma {
  category?: string | null;
  expiry_date?: string | null;
  exam_expiry_date?: string | null;
  restrictions?: unknown;
}
interface RuntLicenciaCroma {
  status?: string | null;
  is_retained?: boolean | null;
  cancellation_date?: string | null;
  suspension_start_date?: string | null;
  suspension_end_date?: string | null;
  restrictions?: unknown;
  categories?: RuntCategoriaCroma[] | null;
}
interface RuntDataCroma {
  found?: boolean;
  person?: { full_name?: string | null; has_licenses?: boolean | null } | null;
  licenses?: RuntLicenciaCroma[] | null;
}

/** «Sin restricciones», «ninguna», «N/A»… no son restricciones. */
const SIN_RESTRICCION = /^(ninguna?|sin restricci\S*|no aplica|n\s*\/?\s*a|no registra|-+)$/i;

/**
 * Restricciones tal como vengan: la documentación de Croma no dice el tipo
 * (texto, lista de textos o lista de objetos), así que se aceptan los tres.
 */
export function textosRestriccion(v: unknown): string[] {
  if (v == null) return [];
  if (typeof v === "string") {
    const t = v.replace(/\s+/g, " ").trim();
    return t && !SIN_RESTRICCION.test(t) ? [t] : [];
  }
  if (Array.isArray(v)) return v.flatMap(textosRestriccion);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return textosRestriccion(o.description ?? o.descripcion ?? o.name ?? o.restriction ?? o.value ?? null);
  }
  return [];
}

/** Nombre del RUNT en mayúsculas y sin espacios de más; null si no viene. */
function nombreRunt(t: string | null | undefined): string | null {
  const n = (t ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  return n || null;
}

/** «2029-05-10», «2029-05-10T00:00:00» o «10/05/2029» → «2029-05-10»; lo demás, null. */
export function fechaRunt(t: string | null | undefined): string | null {
  if (!t) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(t.trim());
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return null;
}

/** ¿La licencia sigue en firme? No, si está cancelada, retenida o suspendida a la fecha. */
function licenciaActiva(l: RuntLicenciaCroma, hoy: string): boolean {
  if (l.is_retained === true) return false;
  if (fechaRunt(l.cancellation_date)) return false;
  const finSuspension = fechaRunt(l.suspension_end_date);
  const inicioSuspension = fechaRunt(l.suspension_start_date);
  if (inicioSuspension && inicioSuspension <= hoy && (!finSuspension || finSuspension >= hoy)) return false;
  return !/cancel|suspend|inactiv|anulad|retenid/i.test(l.status ?? "");
}

/** Datos del RUNT de Croma → resumen. Puro, para poder probarlo. `hoy` en AAAA-MM-DD. */
export function interpretarRuntCroma(data: RuntDataCroma | null | undefined, hoy = new Date().toISOString().slice(0, 10)): ResultadoRunt {
  if (!data || typeof data !== "object") return { estado: "error", resumen: null, crudo: data ?? null, error: "Croma no devolvió datos del RUNT." };
  const consultadoEl = new Date().toISOString();
  if (data.found === false) {
    return { estado: "ok", resumen: { registrado: false, tieneLicencia: false, categorias: [], consultadoEl }, crudo: data };
  }
  const nombre = nombreRunt(data.person?.full_name);
  if (data.person?.has_licenses === false || !data.licenses?.length) {
    return { estado: "ok", resumen: { registrado: true, tieneLicencia: false, categorias: [], consultadoEl, nombre, restricciones: [] }, crudo: data };
  }
  const categorias: CategoriaRunt[] = [];
  const restriccionesActivas: string[] = [];
  const restriccionesTodas: string[] = [];
  for (const l of data.licenses) {
    const activa = licenciaActiva(l, hoy);
    const deLicencia = [...textosRestriccion(l.restrictions), ...(l.categories ?? []).flatMap((c) => textosRestriccion(c.restrictions))];
    restriccionesTodas.push(...deLicencia);
    if (activa) restriccionesActivas.push(...deLicencia);
    for (const c of l.categories ?? []) {
      const cat = /([ABC])\s*-?\s*([123])/i.exec(c.category ?? "");
      if (!cat) continue;
      categorias.push({ categoria: `${cat[1].toUpperCase()}${cat[2]}`, vence: fechaRunt(c.expiry_date) ?? fechaRunt(c.exam_expiry_date), activa });
    }
  }
  // Las de las licencias en firme; si ninguna está en firme, las de todas (el historial).
  const restricciones = [...new Set(categorias.some((c) => c.activa) ? restriccionesActivas : restriccionesTodas)];
  return {
    estado: "ok",
    resumen: { registrado: true, tieneLicencia: categorias.length > 0, categorias, consultadoEl, nombre, restricciones },
    crudo: data,
  };
}

/** Sobre de trabajo de Croma con el RUNT → resultado. */
export function interpretarTrabajoRunt(env: JobEnvelope, hoy?: string): ResultadoRunt {
  const estado = env.job?.status;
  if (estado === "completed") return interpretarRuntCroma(env.data as RuntDataCroma, hoy);
  if (estado === "queued" || estado === "running") return { estado: "pendiente", resumen: null, crudo: env, trabajoId: env.job?.id ?? null };
  return { estado: "error", resumen: null, crudo: env, error: env.error?.message ?? `El trabajo de Croma terminó en «${estado ?? "desconocido"}».` };
}

function errorRunt(status: number, json: Record<string, unknown> | null): ResultadoRunt {
  const e = errorCroma(status, json);
  return { estado: "error", resumen: null, crudo: json, error: e.error };
}

export interface ProveedorRunt {
  nombre: string;
  /** Con `primerApellido`, el RUNT abre el registro de esa persona; sin él, Croma usa el apellido que encuentre (puede ser otra persona). */
  consultarRunt(cedula: string, primerApellido?: string | null): Promise<ResultadoRunt>;
  consultarTrabajoRunt(trabajoId: string): Promise<ResultadoRunt>;
}

/**
 * RUNT con la identidad del registro civil (pedido de GH del 17 y 18-nov-2026):
 * sin el primer apellido, Croma abrió con una cédula de prueba el registro de
 * otra persona. Con el nombre del RNMC (validado con la fecha de expedición)
 * siempre se manda un apellido: el más probable y, si no aparece, el otro
 * posible (apellidosPosibles). Nunca se consulta sin apellido teniendo el
 * nombre: si con ninguno aparece, esa persona no está en el RUNT. Sin nombre
 * del registro (consulta a mano de Gestión Humana), una sola consulta sin apellido.
 * Devuelve el resultado que vale y todas las consultas hechas (para guardarlas).
 */
export async function consultarRuntConIdentidad(
  proveedor: ProveedorRunt,
  cedula: string,
  nombreRegistro: string | null,
  /** Apellido ya conocido (p. ej. leído en la foto de la cédula): va primero. */
  apellidoConocido?: string | null
): Promise<{ resultado: ResultadoRunt; intentos: { resultado: ResultadoRunt; apellido: string | null }[] }> {
  const apellidos = [...new Set([...(apellidoConocido ? [apellidoConocido] : []), ...apellidosPosibles(nombreRegistro)])];
  const intentos: { resultado: ResultadoRunt; apellido: string | null }[] = [];
  const marcar = (r: ResultadoRunt, extra: Partial<ResumenRunt>): ResultadoRunt =>
    r.resumen ? { ...r, resumen: { ...r.resumen, nombreRegistro, ...extra } } : r;

  if (!apellidos.length) {
    const r = await proveedor.consultarRunt(cedula, null);
    intentos.push({ resultado: r, apellido: null });
    return { resultado: nombreRegistro ? marcar(r, { identidadVerificada: false }) : r, intentos };
  }

  let primero: ResultadoRunt | null = null;
  for (const apellido of apellidos) {
    const r = await proveedor.consultarRunt(cedula, apellido);
    intentos.push({ resultado: r, apellido });
    primero ??= r;
    // Error o en curso: no se sigue probando (el trabajo en curso lo termina el cron).
    if (r.estado !== "ok" || !r.resumen) return { resultado: marcar(r, { identidadVerificada: true }), intentos };
    if (r.resumen.registrado !== false) {
      const coincide = nombresCoinciden(r.resumen.nombre, nombreRegistro);
      return { resultado: marcar(r, { identidadVerificada: true, nombreNoCoincide: !coincide }), intentos };
    }
  }
  // Con ningún apellido posible aparece esta persona: no está en el RUNT.
  return { resultado: marcar(primero!, { identidadVerificada: true }), intentos };
}

/** Proveedor para el RUNT de personas, o null si no hay ninguno configurado (modo manual). */
export function proveedorRunt(): ProveedorRunt | null {
  const croma = configCroma();
  if (!croma) return null;
  return {
    nombre: "croma",
    async consultarRunt(cedula, apellido) {
      try {
        const { status, json } = await llamarCroma(croma, {
          metodo: "POST",
          ruta: "/co/runt/citizen-by-document/v1",
          cuerpo: { document_type: "CC", document_number: cedula.replace(/\D/g, ""), ...(apellido ? { first_surname: apellido } : {}) },
        });
        if (status === 200) return interpretarRuntCroma((json?.data ?? null) as RuntDataCroma | null);
        if (status === 202) return interpretarTrabajoRunt((json ?? {}) as JobEnvelope);
        return errorRunt(status, json);
      } catch (e) {
        return { estado: "error", resumen: null, crudo: null, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async consultarTrabajoRunt(trabajoId) {
      try {
        const { status, json } = await llamarCroma(croma, { metodo: "GET", ruta: `/jobs/${encodeURIComponent(trabajoId)}` });
        if (status === 200) return interpretarTrabajoRunt((json ?? {}) as JobEnvelope);
        return errorRunt(status, json);
      } catch (e) {
        return { estado: "error", resumen: null, crudo: null, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

// ── Policía: antecedentes judiciales (y nombre cuando el RUNT no lo trae) ──

/** Lo que se guarda de la consulta de la Policía. */
export interface ResumenPolicia {
  /** Nombre según la Policía; null si la fuente no lo trae. */
  nombre: string | null;
  /** true si tiene asuntos pendientes con autoridades judiciales; null si no se pudo leer. */
  tieneAntecedentes: boolean | null;
  /** Frase del certificado, tal cual. */
  estadoTexto: string | null;
  consultadoEl: string;
}

export interface ResultadoPolicia {
  estado: "ok" | "pendiente" | "error";
  resumen: ResumenPolicia | null;
  crudo: unknown;
  trabajoId?: string | null;
  error?: string;
}

interface PoliciaDataCroma {
  full_name?: string | null;
  has_records?: boolean | null;
  status?: string | null;
}

/** Datos de la Policía de Croma → resumen. Puro, para poder probarlo. */
export function interpretarPoliciaCroma(data: PoliciaDataCroma | null | undefined): ResultadoPolicia {
  if (!data || typeof data !== "object") return { estado: "error", resumen: null, crudo: data ?? null, error: "Croma no devolvió datos de la Policía." };
  return {
    estado: "ok",
    resumen: {
      nombre: nombreRunt(data.full_name),
      tieneAntecedentes: typeof data.has_records === "boolean" ? data.has_records : null,
      estadoTexto: data.status?.trim() || null,
      consultadoEl: new Date().toISOString(),
    },
    crudo: data,
  };
}

export function interpretarTrabajoPolicia(env: JobEnvelope): ResultadoPolicia {
  const estado = env.job?.status;
  if (estado === "completed") return interpretarPoliciaCroma(env.data as PoliciaDataCroma);
  if (estado === "queued" || estado === "running") return { estado: "pendiente", resumen: null, crudo: env, trabajoId: env.job?.id ?? null };
  return { estado: "error", resumen: null, crudo: env, error: env.error?.message ?? `El trabajo de Croma terminó en «${estado ?? "desconocido"}».` };
}

export interface ProveedorPolicia {
  nombre: string;
  consultarPolicia(cedula: string): Promise<ResultadoPolicia>;
  consultarTrabajoPolicia(trabajoId: string): Promise<ResultadoPolicia>;
}

/** Proveedor para los antecedentes de la Policía, o null si Croma no está configurado. */
export function proveedorPolicia(): ProveedorPolicia | null {
  const croma = configCroma();
  if (!croma) return null;
  const fallo = (status: number, json: Record<string, unknown> | null): ResultadoPolicia => ({
    estado: "error",
    resumen: null,
    crudo: json,
    error: errorCroma(status, json).error,
  });
  return {
    nombre: "croma",
    async consultarPolicia(cedula) {
      try {
        const { status, json } = await llamarCroma(croma, {
          metodo: "POST",
          ruta: "/co/policia/criminal-records/v1",
          cuerpo: { document_type: "CC", document_number: cedula.replace(/\D/g, "") },
        });
        if (status === 200) return interpretarPoliciaCroma((json?.data ?? null) as PoliciaDataCroma | null);
        if (status === 202) return interpretarTrabajoPolicia((json ?? {}) as JobEnvelope);
        return fallo(status, json);
      } catch (e) {
        return { estado: "error", resumen: null, crudo: null, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async consultarTrabajoPolicia(trabajoId) {
      try {
        const { status, json } = await llamarCroma(croma, { metodo: "GET", ruta: `/jobs/${encodeURIComponent(trabajoId)}` });
        if (status === 200) return interpretarTrabajoPolicia((json ?? {}) as JobEnvelope);
        return fallo(status, json);
      } catch (e) {
        return { estado: "error", resumen: null, crudo: null, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

// ── RNMC: medidas correctivas del Código de Policía (Ley 1801 de 2016) ─────

export interface ResumenRnmc {
  /** false si el registro rechazó la consulta porque la fecha de expedición no coincide con la cédula. */
  fechaCoincide: boolean;
  nombre: string | null;
  /** true si tiene medidas correctivas pendientes; null si no se pudo leer. */
  medidasPendientes: boolean | null;
  /** Cuántas medidas pendientes lista el registro. */
  cantidad: number;
  estadoTexto: string | null;
  consultadoEl: string;
}

export interface ResultadoRnmc {
  estado: "ok" | "pendiente" | "error";
  resumen: ResumenRnmc | null;
  crudo: unknown;
  trabajoId?: string | null;
  error?: string;
}

interface RnmcDataCroma {
  found?: boolean;
  full_name?: string | null;
  has_pending_measures?: boolean | null;
  status?: string | null;
  pending_measures?: unknown[] | null;
  message?: string | null;
}

/** Datos del RNMC de Croma → resumen. Puro, para poder probarlo. */
export function interpretarRnmcCroma(data: RnmcDataCroma | null | undefined): ResultadoRnmc {
  if (!data || typeof data !== "object") return { estado: "error", resumen: null, crudo: data ?? null, error: "Croma no devolvió datos del RNMC." };
  const fechaCoincide = data.found !== false;
  return {
    estado: "ok",
    resumen: {
      fechaCoincide,
      nombre: nombreRunt(data.full_name),
      medidasPendientes: typeof data.has_pending_measures === "boolean" ? data.has_pending_measures : null,
      cantidad: Array.isArray(data.pending_measures) ? data.pending_measures.length : 0,
      estadoTexto: (fechaCoincide ? data.status : data.message ?? data.status)?.trim() || null,
      consultadoEl: new Date().toISOString(),
    },
    crudo: data,
  };
}

export function interpretarTrabajoRnmc(env: JobEnvelope): ResultadoRnmc {
  const estado = env.job?.status;
  if (estado === "completed") return interpretarRnmcCroma(env.data as RnmcDataCroma);
  if (estado === "queued" || estado === "running") return { estado: "pendiente", resumen: null, crudo: env, trabajoId: env.job?.id ?? null };
  return { estado: "error", resumen: null, crudo: env, error: env.error?.message ?? `El trabajo de Croma terminó en «${estado ?? "desconocido"}».` };
}

/**
 * ¿El error fue de Croma o de la red (tiempo agotado, caída, 5xx, límite de
 * consultas) y no una respuesta sobre la persona? Esos se reintentan.
 */
export function errorTransitorio(error: string | null | undefined): boolean {
  // «Procuraduría is busy. Try again in 1 seconds.» (503 de Croma, 18-nov-2026): la fuente está ocupada.
  return /abort|timeout|timed out|tiempo|fetch failed|network|ECONN|ENOTFOUND|socket|\b5\d\d\b|429|rate limit|límite de consultas|unavailable|no respond|busy|try again|ocupad/i.test(
    error ?? ""
  );
}

export interface ProveedorRnmc {
  nombre: string;
  /**
   * `esperaSegundos`: cuánto espera Croma en línea antes de devolver el trabajo
   * en curso (por defecto 15; Croma admite hasta 55). `timeoutMs`: cuándo se
   * corta la llamada (por defecto la espera más 10 s, por si Croma se pasa).
   */
  consultarRnmc(cedula: string, fechaExpedicion: string, opciones?: { esperaSegundos?: number; timeoutMs?: number }): Promise<ResultadoRnmc>;
  consultarTrabajoRnmc(trabajoId: string): Promise<ResultadoRnmc>;
}

/** Proveedor para el RNMC, o null si Croma no está configurado. Para cédulas exige la fecha de expedición. */
export function proveedorRnmc(): ProveedorRnmc | null {
  const croma = configCroma();
  if (!croma) return null;
  const fallo = (status: number, json: Record<string, unknown> | null): ResultadoRnmc => ({
    estado: "error",
    resumen: null,
    crudo: json,
    error: errorCroma(status, json).error,
  });
  return {
    nombre: "croma",
    async consultarRnmc(cedula, fechaExpedicion, opciones = {}) {
      try {
        const { status, json } = await llamarCroma(croma, {
          metodo: "POST",
          ruta: "/co/policia-rnmc/corrective-measures/v1",
          cuerpo: { document_type: "CC", document_number: cedula.replace(/\D/g, ""), issue_date: fechaExpedicion },
          esperaSegundos: opciones.esperaSegundos,
          timeoutMs: opciones.timeoutMs ?? ((opciones.esperaSegundos ?? ESPERA_SEGUNDOS) + 10) * 1000,
        });
        if (status === 200) return interpretarRnmcCroma((json?.data ?? null) as RnmcDataCroma | null);
        if (status === 202) return interpretarTrabajoRnmc((json ?? {}) as JobEnvelope);
        return fallo(status, json);
      } catch (e) {
        return { estado: "error", resumen: null, crudo: null, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async consultarTrabajoRnmc(trabajoId) {
      try {
        const { status, json } = await llamarCroma(croma, { metodo: "GET", ruta: `/jobs/${encodeURIComponent(trabajoId)}` });
        if (status === 200) return interpretarTrabajoRnmc((json ?? {}) as JobEnvelope);
        return fallo(status, json);
      } catch (e) {
        return { estado: "error", resumen: null, crudo: null, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

// ── ADRES: afiliación a salud (BDUA), de aquí sale el nombre si el RNMC tarda ──

export interface ResultadoAdres {
  estado: "ok" | "pendiente" | "error";
  /** Nombre como lo registra la BDUA («NOMBRES APELLIDOS»); null si no aparece. */
  nombre: string | null;
  /** false si la cédula no está en la BDUA. */
  encontrado: boolean | null;
  crudo: unknown;
  trabajoId?: string | null;
  error?: string;
}

interface AdresDataCroma {
  found?: boolean;
  full_name?: string | null;
}

/** Datos de ADRES de Croma → resultado. Puro, para poder probarlo. */
export function interpretarAdresCroma(data: AdresDataCroma | null | undefined): ResultadoAdres {
  if (!data || typeof data !== "object") return { estado: "error", nombre: null, encontrado: null, crudo: data ?? null, error: "Croma no devolvió datos de ADRES." };
  return { estado: "ok", nombre: data.found === false ? null : nombreRunt(data.full_name), encontrado: data.found !== false, crudo: data };
}

export function interpretarTrabajoAdres(env: JobEnvelope): ResultadoAdres {
  const estado = env.job?.status;
  if (estado === "completed") return interpretarAdresCroma(env.data as AdresDataCroma);
  if (estado === "queued" || estado === "running") return { estado: "pendiente", nombre: null, encontrado: null, crudo: env, trabajoId: env.job?.id ?? null };
  return { estado: "error", nombre: null, encontrado: null, crudo: env, error: env.error?.message ?? `El trabajo de Croma terminó en «${estado ?? "desconocido"}».` };
}

export interface ProveedorAdres {
  nombre: string;
  consultarAdres(cedula: string, opciones?: { esperaSegundos?: number }): Promise<ResultadoAdres>;
  consultarTrabajoAdres(trabajoId: string): Promise<ResultadoAdres>;
}

/** Proveedor de ADRES (afiliación a salud), o null si Croma no está configurado. */
export function proveedorAdres(): ProveedorAdres | null {
  const croma = configCroma();
  if (!croma) return null;
  const fallo = (status: number, json: Record<string, unknown> | null): ResultadoAdres => ({
    estado: "error",
    nombre: null,
    encontrado: null,
    crudo: json,
    error: errorCroma(status, json).error,
  });
  const caida = (e: unknown): ResultadoAdres => ({ estado: "error", nombre: null, encontrado: null, crudo: null, error: e instanceof Error ? e.message : String(e) });
  return {
    nombre: "croma",
    async consultarAdres(cedula, opciones = {}) {
      try {
        const { status, json } = await llamarCroma(croma, {
          metodo: "POST",
          ruta: "/co/adres/affiliation-status/v1",
          cuerpo: { document_type: "CC", document_number: cedula.replace(/\D/g, "") },
          esperaSegundos: opciones.esperaSegundos,
          timeoutMs: ((opciones.esperaSegundos ?? ESPERA_SEGUNDOS) + 10) * 1000,
        });
        if (status === 200) return interpretarAdresCroma((json?.data ?? null) as AdresDataCroma | null);
        if (status === 202) return interpretarTrabajoAdres((json ?? {}) as JobEnvelope);
        return fallo(status, json);
      } catch (e) {
        return caida(e);
      }
    },
    async consultarTrabajoAdres(trabajoId) {
      try {
        const { status, json } = await llamarCroma(croma, { metodo: "GET", ruta: `/jobs/${encodeURIComponent(trabajoId)}` });
        if (status === 200) return interpretarTrabajoAdres((json ?? {}) as JobEnvelope);
        return fallo(status, json);
      } catch (e) {
        return caida(e);
      }
    },
  };
}

/**
 * Primer apellido a partir del campo «Apellidos» de la cédula (lectura de la
 * foto): el primer bloque, con sus partículas («MANJARRES DE AVILA» →
 * «MANJARRES»; «DE LA HOZ PEREZ» → «DE LA HOZ»). null si no hay.
 */
export function primerApellidoDeApellidos(apellidos: string | null | undefined): string | null {
  return bloquesNombre(apellidos)[0] ?? null;
}

// ── Procuraduría y Contraloría: antecedentes disciplinarios y fiscales ─────

export type FuenteAntecedenteCroma = "procuraduria" | "contraloria";

/** Resultado genérico de una fuente de antecedentes: la respuesta tal cual y el trabajo si quedó en curso. */
export interface ResultadoAntecedente {
  estado: "ok" | "pendiente" | "error";
  crudo: unknown;
  trabajoId?: string | null;
  error?: string;
}

const RUTA_ANTECEDENTE: Record<FuenteAntecedenteCroma, string> = {
  procuraduria: "/co/procuraduria/disciplinary-records/v1",
  contraloria: "/co/contraloria/fiscal-records/v1",
};

function trabajoAntecedente(env: JobEnvelope): ResultadoAntecedente {
  const estado = env.job?.status;
  if (estado === "completed") return { estado: env.data ? "ok" : "error", crudo: env.data ?? env, error: env.data ? undefined : "Croma no devolvió datos." };
  if (estado === "queued" || estado === "running") return { estado: "pendiente", crudo: env, trabajoId: env.job?.id ?? null };
  return { estado: "error", crudo: env, error: env.error?.message ?? `El trabajo de Croma terminó en «${estado ?? "desconocido"}».` };
}

export interface ProveedorAntecedentes {
  nombre: string;
  consultar(fuente: FuenteAntecedenteCroma, cedula: string): Promise<ResultadoAntecedente>;
  consultarTrabajo(trabajoId: string): Promise<ResultadoAntecedente>;
}

/** Procuraduría y Contraloría por Croma, o null si no está configurado. La Contraloría tarda decenas de segundos. */
export function proveedorAntecedentes(): ProveedorAntecedentes | null {
  const croma = configCroma();
  if (!croma) return null;
  const fallo = (status: number, json: Record<string, unknown> | null): ResultadoAntecedente => ({
    estado: "error",
    crudo: json,
    error: errorCroma(status, json).error,
  });
  return {
    nombre: "croma",
    async consultar(fuente, cedula) {
      try {
        const { status, json } = await llamarCroma(croma, {
          metodo: "POST",
          ruta: RUTA_ANTECEDENTE[fuente],
          cuerpo: { document_type: "CC", document_number: cedula.replace(/\D/g, "") },
          // La Contraloría tarda decenas de segundos y a veces Croma ni siquiera
          // devuelve el trabajo a los 20 s; los antecedentes no van en el camino
          // apurado del webhook, así que se le da más margen.
          timeoutMs: TIMEOUT_ANTECEDENTES_MS,
        });
        if (status === 200) return json?.data ? { estado: "ok", crudo: json.data } : { estado: "error", crudo: json, error: "Croma no devolvió datos." };
        if (status === 202) return trabajoAntecedente((json ?? {}) as JobEnvelope);
        return fallo(status, json);
      } catch (e) {
        return { estado: "error", crudo: null, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async consultarTrabajo(trabajoId) {
      try {
        const { status, json } = await llamarCroma(croma, { metodo: "GET", ruta: `/jobs/${encodeURIComponent(trabajoId)}` });
        if (status === 200) return trabajoAntecedente((json ?? {}) as JobEnvelope);
        return fallo(status, json);
      } catch (e) {
        return { estado: "error", crudo: null, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

/** Proveedor para el SIMIT, o null si no hay ninguno configurado (modo manual). */
export function proveedorSimit(): ProveedorVerificacion | null {
  const croma = configCroma();
  if (!croma) return null;
  return {
    nombre: "croma",
    consultarSimit: (cedula) => consultarSimitCroma(croma, cedula),
    consultarTrabajoSimit: (id) => consultarTrabajoCroma(croma, id),
  };
}
