/**
 * Desglose del costo de la selección (24-nov-2026). PURO: la lectura de la
 * base está en ./costos-servidor y el Excel en ./costos-excel.
 *
 * Separa lo que cobra la IA (chat, lectura de la conversación, documentos,
 * audios, laboratorio) de lo que cobra Croma (consultas reales por su valor en
 * Tiempos y reglas) y de WhatsApp, y da el costo por unidad de cada concepto:
 * por respuesta, por documento, por audio, por consulta.
 */
import { consultaCobrada, origenConsulta, type VerificacionInd } from "./indicadores";
import { MAX_DIAS_RANGO, fechaValida, largoRango, type Rango } from "@/lib/comunicaciones/indicadores";

// ── Entrada ──────────────────────────────────────────────────────────────────

export interface ConsumoCosto {
  concepto: string;
  proveedor: string | null;
  modelo: string | null;
  tokens_entrada: number | null;
  tokens_salida: number | null;
  costo_usd: number | string | null;
  proceso_id: string | null;
  conversacion_id: string | null;
  created_at: string;
}

export interface ConsultaCosto extends VerificacionInd {
  fuente: string | null;
  cedula?: string | null;
  proceso_id?: string | null;
  created_at: string;
}

export interface EntradaCostos {
  rango: Rango;
  consumos: ConsumoCosto[];
  consultas: ConsultaCosto[];
  /** Valor de una consulta a Croma en pesos (ajuste croma_costo_consulta). */
  cromaCostoCop: number;
  trm: number;
  /** Aspirantes creados y contratados en el periodo (sin el chat de prueba). */
  aspirantes: number;
  contratados: number;
}

// ── Salida ───────────────────────────────────────────────────────────────────

export type GrupoCosto = "ia" | "croma" | "whatsapp";

export interface FilaConcepto {
  clave: string;
  etiqueta: string;
  grupo: GrupoCosto;
  /** Unidades del concepto (respuestas, documentos, audios, consultas…). */
  unidades: number;
  unidad: [singular: string, plural: string];
  /** Llamadas al modelo registradas (un audio son dos: transcripción y control). */
  llamadas: number;
  tokensEntrada: number;
  tokensSalida: number;
  usd: number;
  cop: number;
  porUnidadUsd: number | null;
  porUnidadCop: number | null;
  nota?: string;
}

export interface FilaModelo {
  concepto: string;
  etiquetaConcepto: string;
  proveedor: string;
  modelo: string;
  etiquetaModelo: string;
  llamadas: number;
  tokensEntrada: number;
  tokensSalida: number;
  usd: number;
  cop: number;
  porLlamadaUsd: number | null;
  porLlamadaCop: number | null;
}

export interface FilaFuente {
  fuente: string;
  etiqueta: string;
  /** Las que cobra Croma (respondieron y no se reutilizaron). */
  cobradas: number;
  reutilizadas: number;
  conError: number;
  cop: number;
}

export interface DetalleCostos {
  rango: Rango;
  trm: number;
  cromaCostoCop: number;
  total: { usd: number; cop: number };
  ia: { usd: number; cop: number; llamadas: number };
  croma: { usd: number; cop: number; cobradas: number; reutilizadas: number; conError: number; sinValor: boolean };
  whatsapp: { usd: number; cop: number };
  aspirantes: number;
  contratados: number;
  porAspiranteCop: number | null;
  porContratadoCop: number | null;
  conceptos: FilaConcepto[];
  modelos: FilaModelo[];
  fuentes: FilaFuente[];
  porDia: { fecha: string; iaCop: number; cromaCop: number }[];
}

// ── Etiquetas ────────────────────────────────────────────────────────────────

export const CONCEPTOS_COSTO: Record<string, { etiqueta: string; grupo: GrupoCosto; unidad: [string, string]; nota?: string }> = {
  asistente: { etiqueta: "Chat del asistente", grupo: "ia", unidad: ["respuesta", "respuestas"] },
  extraccion: { etiqueta: "Lectura de la conversación", grupo: "ia", unidad: ["lectura", "lecturas"], nota: "Saca los datos del aspirante del chat" },
  lectura: { etiqueta: "Documentos y fotos", grupo: "ia", unidad: ["lectura", "lecturas"], nota: "Hoja de vida, cédula, licencia, certificados; varias fotos del mismo envío van en una lectura" },
  transcripcion: { etiqueta: "Audios", grupo: "ia", unidad: ["audio", "audios"], nota: "Cada audio se transcribe dos veces: la transcripción y el control con el otro modelo" },
  laboratorio: { etiqueta: "Mensajes del laboratorio", grupo: "ia", unidad: ["mensaje", "mensajes"] },
  antecedentes: { etiqueta: "Consultas a Croma", grupo: "croma", unidad: ["consulta", "consultas"], nota: "RUNT, SIMIT, RNMC y antecedentes; las reutilizadas no se cobran" },
  whatsapp: { etiqueta: "WhatsApp", grupo: "whatsapp", unidad: ["mensaje", "mensajes"] },
};

const FUENTES: Record<string, string> = {
  runt: "RUNT (licencia)",
  simit: "SIMIT (multas)",
  rnmc: "RNMC (medidas correctivas)",
  policia: "Policía",
  procuraduria: "Procuraduría",
  contraloria: "Contraloría",
};

const MODELOS: Record<string, string> = {
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-opus-5-5": "Claude Opus 5.5",
  "gpt-4o-mini-transcribe": "GPT-4o mini (transcripción)",
  "whisper-large-v3-turbo": "Whisper large v3 turbo",
  "whisper-1": "Whisper",
};

/** «anthropic/claude-sonnet-5.5» → «Claude Sonnet 5.5»; lo desconocido, tal cual. */
export function etiquetaModelo(modelo: string | null | undefined): string {
  const m = String(modelo ?? "").trim();
  if (!m) return "Sin modelo";
  const base = m.toLowerCase().split("/").pop()!.replace(/(\d)\.(\d)/g, "$1-$2");
  const id = Object.keys(MODELOS).find((k) => base === k || base.startsWith(`${k}-`));
  return id ? MODELOS[id] : m;
}

// ── Utilidades ───────────────────────────────────────────────────────────────

/** Ventana para tomar dos transcripciones seguidas como el mismo audio. */
const VENTANA_CONTROL_MS = 2 * 60_000;

/**
 * Audios a partir de las transcripciones: la de control va justo después de la
 * principal, con el otro modelo y en la misma conversación. Si el modelo no
 * devolvió texto no hay control, y ese audio es una sola fila.
 */
export function contarAudios(filas: Pick<ConsumoCosto, "modelo" | "conversacion_id" | "proceso_id" | "created_at">[]): number {
  const orden = [...filas].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let audios = 0;
  let abierta: (typeof orden)[number] | null = null;
  for (const f of orden) {
    const esControl =
      abierta != null &&
      abierta.modelo !== f.modelo &&
      (abierta.conversacion_id ?? null) === (f.conversacion_id ?? null) &&
      (abierta.proceso_id ?? null) === (f.proceso_id ?? null) &&
      new Date(f.created_at).getTime() - new Date(abierta.created_at).getTime() <= VENTANA_CONTROL_MS;
    if (esControl) {
      abierta = null;
    } else {
      audios++;
      abierta = f;
    }
  }
  return audios;
}

const DESFASE_BOGOTA_MS = 5 * 3600_000;
const diaBogota = (iso: string) => new Date(new Date(iso).getTime() - DESFASE_BOGOTA_MS).toISOString().slice(0, 10);
const porUnidad = (v: number, n: number) => (n > 0 ? v / n : null);

// ── Cálculo ──────────────────────────────────────────────────────────────────

export function calcularDetalleCostos(e: EntradaCostos): DetalleCostos {
  const trm = e.trm > 0 ? e.trm : 3270;
  const aCop = (usd: number) => usd * trm;

  // Por concepto y por modelo.
  const porConcepto = new Map<string, ConsumoCosto[]>();
  for (const c of e.consumos) porConcepto.set(c.concepto, [...(porConcepto.get(c.concepto) ?? []), c]);

  const modelos = new Map<string, FilaModelo>();
  for (const c of e.consumos) {
    const proveedor = c.proveedor ?? "—";
    const modelo = c.modelo ?? "";
    const k = `${c.concepto}|${proveedor}|${modelo}`;
    const f =
      modelos.get(k) ??
      ({
        concepto: c.concepto,
        etiquetaConcepto: CONCEPTOS_COSTO[c.concepto]?.etiqueta ?? c.concepto,
        proveedor,
        modelo,
        etiquetaModelo: etiquetaModelo(modelo),
        llamadas: 0,
        tokensEntrada: 0,
        tokensSalida: 0,
        usd: 0,
        cop: 0,
        porLlamadaUsd: null,
        porLlamadaCop: null,
      } satisfies FilaModelo);
    f.llamadas += 1;
    f.tokensEntrada += Number(c.tokens_entrada) || 0;
    f.tokensSalida += Number(c.tokens_salida) || 0;
    f.usd += Number(c.costo_usd) || 0;
    modelos.set(k, f);
  }
  const filasModelo = [...modelos.values()]
    .map((f) => ({ ...f, cop: aCop(f.usd), porLlamadaUsd: porUnidad(f.usd, f.llamadas), porLlamadaCop: porUnidad(aCop(f.usd), f.llamadas) }))
    .sort((a, b) => b.usd - a.usd);

  // Croma: las consultas reales por su valor en pesos, por fuente.
  const croma = e.consultas.filter((v) => v.proveedor === "croma");
  const cobradas = croma.filter(consultaCobrada);
  const reutilizadas = croma.filter((v) => origenConsulta(v) === "reutilizada").length;
  const conError = croma.filter((v) => v.estado === "error").length;
  const fuentes = new Map<string, FilaFuente>();
  for (const v of croma) {
    const k = v.fuente ?? "otra";
    const f = fuentes.get(k) ?? { fuente: k, etiqueta: FUENTES[k] ?? k, cobradas: 0, reutilizadas: 0, conError: 0, cop: 0 };
    if (consultaCobrada(v)) {
      f.cobradas += 1;
      f.cop += e.cromaCostoCop;
    } else if (origenConsulta(v) === "reutilizada") f.reutilizadas += 1;
    else if (v.estado === "error") f.conError += 1;
    fuentes.set(k, f);
  }
  const filasFuente = [...fuentes.values()].sort((a, b) => b.cobradas - a.cobradas || a.etiqueta.localeCompare(b.etiqueta));
  const cromaCop = cobradas.length * e.cromaCostoCop;

  // Conceptos: todos los conocidos (en cero si no hubo) y los que aparezcan.
  const claves = [...new Set([...Object.keys(CONCEPTOS_COSTO), ...porConcepto.keys()])];
  const conceptos: FilaConcepto[] = claves.map((clave) => {
    const def = CONCEPTOS_COSTO[clave] ?? { etiqueta: clave, grupo: "ia" as GrupoCosto, unidad: ["llamada", "llamadas"] as [string, string] };
    const filas = porConcepto.get(clave) ?? [];
    let usd = filas.reduce((s, f) => s + (Number(f.costo_usd) || 0), 0);
    let unidades = clave === "transcripcion" ? contarAudios(filas) : filas.length;
    if (clave === "antecedentes") {
      usd += cromaCop / trm;
      unidades = cobradas.length + filas.length;
    }
    const cop = aCop(usd);
    return {
      clave,
      etiqueta: def.etiqueta,
      grupo: def.grupo,
      unidades,
      unidad: def.unidad,
      llamadas: filas.length,
      tokensEntrada: filas.reduce((s, f) => s + (Number(f.tokens_entrada) || 0), 0),
      tokensSalida: filas.reduce((s, f) => s + (Number(f.tokens_salida) || 0), 0),
      usd,
      cop,
      porUnidadUsd: porUnidad(usd, unidades),
      porUnidadCop: porUnidad(cop, unidades),
      nota: def.nota,
    };
  });
  // Primero lo de IA, luego Croma y WhatsApp; dentro, de mayor a menor gasto.
  const ordenGrupo: Record<GrupoCosto, number> = { ia: 0, croma: 1, whatsapp: 2 };
  conceptos.sort((a, b) => ordenGrupo[a.grupo] - ordenGrupo[b.grupo] || b.usd - a.usd || a.etiqueta.localeCompare(b.etiqueta));

  const suma = (g: GrupoCosto) => conceptos.filter((c) => c.grupo === g).reduce((s, c) => s + c.usd, 0);
  const iaUsd = suma("ia");
  const cromaUsd = suma("croma");
  const waUsd = suma("whatsapp");
  const totalUsd = iaUsd + cromaUsd + waUsd;
  const totalCop = aCop(totalUsd);

  // Por día (Bogotá): IA y WhatsApp registrados, y Croma por su valor.
  const dias = new Map<string, { iaCop: number; cromaCop: number }>();
  const dia = (d: string) => dias.get(d) ?? dias.set(d, { iaCop: 0, cromaCop: 0 }).get(d)!;
  for (const c of e.consumos) {
    const v = aCop(Number(c.costo_usd) || 0);
    if (CONCEPTOS_COSTO[c.concepto]?.grupo === "croma") dia(diaBogota(c.created_at)).cromaCop += v;
    else dia(diaBogota(c.created_at)).iaCop += v;
  }
  for (const v of cobradas) dia(diaBogota(v.created_at)).cromaCop += e.cromaCostoCop;
  const porDia = [...dias.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, v]) => ({ fecha, ...v }));

  return {
    rango: e.rango,
    trm,
    cromaCostoCop: e.cromaCostoCop,
    total: { usd: totalUsd, cop: totalCop },
    ia: { usd: iaUsd, cop: aCop(iaUsd), llamadas: conceptos.filter((c) => c.grupo === "ia").reduce((s, c) => s + c.llamadas, 0) },
    croma: { usd: cromaUsd, cop: aCop(cromaUsd), cobradas: cobradas.length, reutilizadas, conError, sinValor: e.cromaCostoCop <= 0 },
    whatsapp: { usd: waUsd, cop: aCop(waUsd) },
    aspirantes: e.aspirantes,
    contratados: e.contratados,
    porAspiranteCop: e.aspirantes > 0 ? totalCop / e.aspirantes : null,
    porContratadoCop: e.contratados > 0 ? totalCop / e.contratados : null,
    conceptos,
    modelos: filasModelo,
    fuentes: filasFuente,
    porDia,
  };
}

/** Rango del mes en curso en Bogotá: del día 1 a hoy. */
export function rangoMesActual(ahora: Date = new Date()): Rango {
  const hoy = new Date(ahora.getTime() - DESFASE_BOGOTA_MS).toISOString().slice(0, 10);
  return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
}

/** Rango del mes anterior completo. */
export function rangoMesAnterior(ahora: Date = new Date()): Rango {
  const { desde } = rangoMesActual(ahora);
  const ultimo = new Date(new Date(`${desde}T12:00:00Z`).getTime() - 24 * 3600_000).toISOString().slice(0, 10);
  return { desde: `${ultimo.slice(0, 8)}01`, hasta: ultimo };
}

/** Pesos legibles: con centavos si es menos de $10 (un audio cuesta $0,30). */
export function pesosDetalle(v: number | null): string {
  if (v == null) return "—";
  if (v === 0) return "$0";
  const decimales = Math.abs(v) < 10 ? 2 : 0;
  return `$${v.toLocaleString("es-CO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;
}

/**
 * Periodo del desglose de costos, aparte del de la página: `costo_desde` y
 * `costo_hasta` en la URL; sin ellos, el mes en curso.
 */
export function resolverRangoCostos(p: { desde?: string; hasta?: string }, ahora: Date = new Date()): { rango: Rango; aviso: string | null } {
  const porDefecto = rangoMesActual(ahora);
  const desde = p.desde?.trim() ?? "";
  const hasta = p.hasta?.trim() ?? "";
  if (!desde && !hasta) return { rango: porDefecto, aviso: null };
  let aviso: string | null = null;
  if (!desde || !hasta) aviso = "Para el costo hay que elegir las dos fechas.";
  else if (!fechaValida(desde) || !fechaValida(hasta)) aviso = "Alguna de las fechas del costo no es válida.";
  else if (desde > hasta) aviso = "En el costo, «desde» es posterior a «hasta».";
  else if (largoRango({ desde, hasta }) > MAX_DIAS_RANGO) aviso = `El costo se puede ver hasta por ${MAX_DIAS_RANGO} días.`;
  if (aviso) return { rango: porDefecto, aviso: `${aviso} Se muestra el mes en curso.` };
  return { rango: { desde, hasta }, aviso: null };
}
