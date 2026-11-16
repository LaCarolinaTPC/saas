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

async function llamarCroma(config: { url: string; clave: string }, init: { metodo: "GET" | "POST"; ruta: string; cuerpo?: unknown }) {
  const res = await fetch(`${config.url}${init.ruta}`, {
    method: init.metodo,
    headers: {
      Authorization: `Bearer ${config.clave}`,
      "Content-Type": "application/json",
      Prefer: `wait=${ESPERA_SEGUNDOS}`,
    },
    body: init.cuerpo ? JSON.stringify(init.cuerpo) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
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
}
interface RuntLicenciaCroma {
  status?: string | null;
  is_retained?: boolean | null;
  cancellation_date?: string | null;
  suspension_start_date?: string | null;
  suspension_end_date?: string | null;
  categories?: RuntCategoriaCroma[] | null;
}
interface RuntDataCroma {
  found?: boolean;
  person?: { has_licenses?: boolean | null } | null;
  licenses?: RuntLicenciaCroma[] | null;
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
  if (data.person?.has_licenses === false || !data.licenses?.length) {
    return { estado: "ok", resumen: { registrado: true, tieneLicencia: false, categorias: [], consultadoEl }, crudo: data };
  }
  const categorias: CategoriaRunt[] = [];
  for (const l of data.licenses) {
    const activa = licenciaActiva(l, hoy);
    for (const c of l.categories ?? []) {
      const cat = /([ABC])\s*-?\s*([123])/i.exec(c.category ?? "");
      if (!cat) continue;
      categorias.push({ categoria: `${cat[1].toUpperCase()}${cat[2]}`, vence: fechaRunt(c.expiry_date) ?? fechaRunt(c.exam_expiry_date), activa });
    }
  }
  return { estado: "ok", resumen: { registrado: true, tieneLicencia: categorias.length > 0, categorias, consultadoEl }, crudo: data };
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
  consultarRunt(cedula: string): Promise<ResultadoRunt>;
  consultarTrabajoRunt(trabajoId: string): Promise<ResultadoRunt>;
}

/** Proveedor para el RUNT de personas, o null si no hay ninguno configurado (modo manual). */
export function proveedorRunt(): ProveedorRunt | null {
  const croma = configCroma();
  if (!croma) return null;
  return {
    nombre: "croma",
    async consultarRunt(cedula) {
      try {
        const { status, json } = await llamarCroma(croma, {
          metodo: "POST",
          ruta: "/co/runt/citizen-by-document/v1",
          cuerpo: { document_type: "CC", document_number: cedula.replace(/\D/g, "") },
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
