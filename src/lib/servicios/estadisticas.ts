/**
 * Estadísticas de proveedores (26-nov-2026): con las llamadas registradas,
 * qué tanto responde cada proveedor y fuente, cuánto tarda, cuándo se cayó y
 * por cuánto tiempo. Sirve para decidir si conviene cambiar de proveedor.
 * Puro (sin base), para poder probarlo; lo lee estadisticas-servidor.ts.
 */
import { diaBogota } from "@/lib/comunicaciones/indicadores";

export interface LlamadaStats {
  servicio: string;
  proveedor: string;
  fuente: string;
  ok: boolean;
  /** ISO. */
  at: string;
  /** null cuando la fuente no guarda el tiempo (el histórico de Croma). */
  duracionMs: number | null;
  error?: string | null;
}

export interface Caida {
  inicio: string;
  /** La primera respuesta buena después; null si sigue caída. */
  fin: string | null;
  errores: number;
  /** Cuánto duró (la que sigue abierta, hasta `ahora`). */
  minutos: number;
}

export interface FilaProveedor {
  clave: string;
  servicio: string;
  proveedor: string;
  fuente: string;
  nombre: string;
  intentos: number;
  respondio: number;
  /** De 0 a 1; null sin intentos. */
  tasa: number | null;
  /** Tiempo típico (mediana) y el de las más lentas (percentil 95), en ms. */
  p50: number | null;
  p95: number | null;
  caidas: Caida[];
  /** Minutos caída en el periodo (la que sigue abierta, hasta ahora). */
  minutosCaida: number;
  ultimoError: { texto: string; at: string } | null;
  ultimaBuenaAt: string | null;
  porDia: { dia: string; intentos: number; respondio: number }[];
  /** Qué hacer con este proveedor, si hay algo que decir. */
  recomendacion: string | null;
}

/** Una caída: 3 o más errores seguidos de la misma fuente (como la barra de estado). */
export const ERRORES_PARA_CAIDA = 3;

const NOMBRES_FUENTE: Record<string, string> = {
  rnmc: "RNMC (medidas correctivas)",
  policia: "Policía (antecedentes judiciales)",
  procuraduria: "Procuraduría",
  contraloria: "Contraloría",
  simit: "SIMIT (multas)",
  runt: "RUNT (licencia)",
  adres: "ADRES (nombre)",
  trabajo: "Trabajos retomados por el cron",
  chat: "Chat del asistente",
  documentos: "Lectura de documentos",
  voz: "Transcripción de audios",
};

const NOMBRES_PROVEEDOR: Record<string, string> = {
  croma: "Croma",
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  local: "Modelo local",
};

export function nombreFila(servicio: string, proveedor: string, fuente: string): string {
  const p = NOMBRES_PROVEEDOR[proveedor] ?? proveedor;
  const f = NOMBRES_FUENTE[fuente] ?? fuente;
  return servicio === "croma" ? `${p} · ${f}` : `${f} · ${p}`;
}

function percentil(valores: number[], p: number): number | null {
  if (!valores.length) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const i = Math.min(orden.length - 1, Math.max(0, Math.ceil((p / 100) * orden.length) - 1));
  return orden[i];
}

/** Episodios de 3 o más errores seguidos (las llamadas, de la más vieja a la más nueva). */
export function caidasDe(llamadas: Pick<LlamadaStats, "ok" | "at">[], ahora: Date = new Date()): Caida[] {
  const minutos = (inicio: string, fin: string | null) => Math.round(((fin ? new Date(fin).getTime() : ahora.getTime()) - new Date(inicio).getTime()) / 60_000);
  const out: Caida[] = [];
  let racha: { inicio: string; errores: number } | null = null;
  for (const l of llamadas) {
    if (!l.ok) {
      if (racha) racha.errores++;
      else racha = { inicio: l.at, errores: 1 };
      continue;
    }
    if (racha && racha.errores >= ERRORES_PARA_CAIDA) out.push({ inicio: racha.inicio, fin: l.at, errores: racha.errores, minutos: minutos(racha.inicio, l.at) });
    racha = null;
  }
  if (racha && racha.errores >= ERRORES_PARA_CAIDA) out.push({ inicio: racha.inicio, fin: null, errores: racha.errores, minutos: minutos(racha.inicio, null) });
  return out;
}

function porcentaje(t: number): string {
  return `${Math.round(t * 100)} %`;
}

function segundos(ms: number): string {
  return ms >= 10_000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

/**
 * Qué decir de un proveedor: caído ahora, responde poco (con suficientes
 * intentos para que no sea casualidad), o es muy lento.
 */
export function recomendar(f: Pick<FilaProveedor, "servicio" | "fuente" | "intentos" | "tasa" | "p95" | "caidas">): string | null {
  const nombre = NOMBRES_FUENTE[f.fuente] ?? f.fuente;
  const abierta = f.caidas.find((c) => !c.fin);
  if (abierta) {
    return f.servicio === "croma"
      ? `Caída en curso: mientras tanto revise ${nombre} a mano en la ficha del candidato («Lo revisé a mano»).`
      : "Caída en curso: los chats quedan para una persona; revise la clave, el saldo o cambie de proveedor en Selección › IA.";
  }
  if (f.intentos >= 10 && f.tasa != null && f.tasa < 0.8) {
    return f.servicio === "croma"
      ? `Responde solo el ${porcentaje(f.tasa)} de las veces: si sigue así, conviene buscar otro proveedor para ${nombre} o dejar la revisión manual como paso normal.`
      : `Responde solo el ${porcentaje(f.tasa)} de las veces: conviene probar otro proveedor o modelo en Selección › IA.`;
  }
  const lento = f.servicio === "croma" ? 60_000 : 30_000;
  if (f.p95 != null && f.p95 > lento && f.intentos >= 10) {
    return `Lento: el 5 % más lento tarda más de ${segundos(f.p95)}.`;
  }
  return null;
}

/**
 * Las filas por servicio, proveedor y fuente. `dias` son los días del periodo
 * (AAAA-MM-DD, Bogotá) para la serie diaria. Primero las que tienen algo que
 * decir, después por servicio y nombre.
 */
export function estadisticasProveedores(llamadas: LlamadaStats[], dias: string[], ahora: Date = new Date()): FilaProveedor[] {
  const grupos = new Map<string, LlamadaStats[]>();
  for (const l of llamadas) {
    const clave = `${l.servicio}|${l.proveedor}|${l.fuente}`;
    const g = grupos.get(clave) ?? [];
    g.push(l);
    grupos.set(clave, g);
  }
  const filas: FilaProveedor[] = [];
  for (const [clave, g] of grupos) {
    const orden = [...g].sort((a, b) => a.at.localeCompare(b.at));
    const [servicio, proveedor, fuente] = clave.split("|");
    const respondio = orden.filter((l) => l.ok).length;
    const tiempos = orden.filter((l) => l.ok && l.duracionMs != null).map((l) => l.duracionMs as number);
    const caidas = caidasDe(orden, ahora);
    const minutosCaida = caidas.reduce((s, c) => s + c.minutos, 0);
    const error = [...orden].reverse().find((l) => !l.ok) ?? null;
    const buena = [...orden].reverse().find((l) => l.ok) ?? null;
    const cuenta = new Map<string, { intentos: number; respondio: number }>();
    for (const l of orden) {
      const d = diaBogota(l.at);
      const c = cuenta.get(d) ?? { intentos: 0, respondio: 0 };
      c.intentos++;
      if (l.ok) c.respondio++;
      cuenta.set(d, c);
    }
    const base = {
      clave,
      servicio,
      proveedor,
      fuente,
      nombre: nombreFila(servicio, proveedor, fuente),
      intentos: orden.length,
      respondio,
      tasa: orden.length ? respondio / orden.length : null,
      p50: percentil(tiempos, 50),
      p95: percentil(tiempos, 95),
      caidas,
      minutosCaida,
      ultimoError: error ? { texto: (error.error ?? "").trim().slice(0, 300) || "Sin detalle", at: error.at } : null,
      ultimaBuenaAt: buena?.at ?? null,
      porDia: dias.map((dia) => ({ dia, ...(cuenta.get(dia) ?? { intentos: 0, respondio: 0 }) })),
    };
    filas.push({ ...base, recomendacion: recomendar(base) });
  }
  return filas.sort(
    (a, b) => Number(Boolean(b.recomendacion)) - Number(Boolean(a.recomendacion)) || a.servicio.localeCompare(b.servicio) || a.nombre.localeCompare(b.nombre, "es")
  );
}

/** Minutos en palabras: «45 min», «3 h 20 min», «2 días 4 h». */
export function duracionLegible(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
  return `${Math.floor(h / 24)} días${h % 24 ? ` ${h % 24} h` : ""}`;
}

export function tiempoLegible(ms: number | null): string {
  return ms == null ? "—" : segundos(ms);
}
