/**
 * Indicadores de la selección de conductores (entrega 4, K1). Cálculo puro:
 * la lectura de la base está en ./indicadores-servidor.
 *
 * La base son los aspirantes cuyo proceso se creó en el periodo (una cohorte):
 * así la conversión entre etapas compara siempre a las mismas personas. Dos
 * cifras no son de la cohorte porque miden otra cosa: los días hasta la
 * contratación (contratados en el periodo) y la asistencia (citas del periodo).
 */
import { diaBogota, etiquetaDia, sumarDias, tiempos, type Rango, type Tiempos } from "@/lib/comunicaciones/indicadores";
import { CAUSA_ANTECEDENTES, MEDIOS_POSTULACION, PROCESO_ESTADOS, type ProcesoEstado } from "@/lib/contratacion/constants";

// ── Entrada ──────────────────────────────────────────────────────────────────

export interface ProcesoInd {
  id: string;
  created_at: string;
  estado: string;
  medio_postulacion: string | null;
  origen: string | null;
  causa_no_contrato: string | null;
  hoja_vida_recibida_at: string | null;
}

export interface EventoInd {
  proceso_id: string;
  tipo: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  created_at: string;
}

export interface CitaInd {
  proceso_id: string;
  tipo: string;
  estado: string;
  fecha: string;
}

export interface VerificacionInd {
  proveedor: string | null;
  consultado_por: string | null;
  estado: string | null;
}

export interface ConsumoInd {
  concepto: string;
  costo_usd: number | string | null;
}

/** Un proceso contratado en el periodo y cuándo empezó (primer mensaje o creación). */
export interface ContratacionInd {
  proceso_id: string;
  contratado_at: string;
  inicio: string;
}

export interface EntradaIndicadoresSeleccion {
  rango: Rango;
  hoy: string;
  procesos: ProcesoInd[];
  /** Eventos de los procesos de la cohorte. */
  eventos: EventoInd[];
  /** Citas con fecha en el periodo. */
  citas: CitaInd[];
  /** Consultas de antecedentes del periodo. */
  verificaciones: VerificacionInd[];
  /** Costo registrado en el periodo (seleccion_consumos). */
  consumos: ConsumoInd[];
  contrataciones: ContratacionInd[];
  /** Valor de una consulta a Croma en pesos (ajuste croma_costo_consulta) y TRM. */
  cromaCostoCop: number;
  trm: number;
  faltantes: string[];
}

// ── Salida ───────────────────────────────────────────────────────────────────

export interface Fila {
  clave: string;
  etiqueta: string;
  n: number;
  detalle?: string;
}

export interface IndicadoresSeleccion {
  rango: Rango & { dias: number };
  aspirantes: number;
  contratados: number;
  cerrados: number;
  enCurso: number;
  /** Los cinco prometidos a la junta. */
  clave: {
    hojaVida: { base: number; n: number; pct: number | null };
    asistencia: { citas: number; asistieron: number; noAsistieron: number; sinRegistrar: number; pct: number | null };
    diasHastaContratar: Tiempos;
    antecedentes: { total: number; automaticas: number; persona: number; reutilizadas: number; manuales: number; pctAutomaticas: number | null };
    costo: { totalUsd: number; totalCop: number; porAspiranteCop: number | null; porContratadoCop: number | null; consultasCroma: number };
  };
  /** Aspirantes de la cohorte en su etapa actual. */
  porEtapa: Fila[];
  /** Cuántos llegaron a cada etapa (o la pasaron). */
  embudo: Fila[];
  /** Cuánto tardan en salir de cada etapa hacia la siguiente que alcanzaron. */
  tiempoEnEtapa: { estado: string; etiqueta: string; tiempos: Tiempos }[];
  causasCierre: Fila[];
  porSemana: { fecha: string; etiqueta: string; aspirantes: number; contratados: number }[];
  porCanal: (Fila & { contratados: number })[];
  asistenciaPorTipo: Fila[];
  costoPorConcepto: Fila[];
  antecedentesFilas: Fila[];
  faltantes: string[];
}

// ── Utilidades ───────────────────────────────────────────────────────────────

const DIA_MS = 24 * 60 * 60 * 1000;

/** Etapas del embudo en orden (sin el cierre). */
export const ETAPAS_EMBUDO: ProcesoEstado[] = PROCESO_ESTADOS.map((e) => e.value).filter((v): v is ProcesoEstado => v !== "cierre");
const etiquetaEstado = (v: string) => PROCESO_ESTADOS.find((e) => e.value === v)?.label ?? v;
const indiceEtapa = (v: string | null | undefined) => (v ? ETAPAS_EMBUDO.indexOf(v as ProcesoEstado) : -1);

/** Lunes (YYYY-MM-DD) de la semana de un día. */
export function lunesDe(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  const desdeLunes = (d.getUTCDay() + 6) % 7;
  return sumarDias(dia, -desdeLunes);
}

function largo(r: Rango): number {
  return Math.round((new Date(`${r.hasta}T12:00:00Z`).getTime() - new Date(`${r.desde}T12:00:00Z`).getTime()) / DIA_MS) + 1;
}

const pct = (n: number, base: number) => (base > 0 ? (n / base) * 100 : null);

/** Cómo se lanzó una consulta de antecedentes. */
export type OrigenConsulta = "automatica" | "persona" | "reutilizada" | "manual" | "simulada";
export function origenConsulta(v: VerificacionInd): OrigenConsulta {
  const por = (v.consultado_por ?? "").toLowerCase();
  if (v.proveedor === "simulado" || por.includes("simulad")) return "simulada";
  if (v.proveedor === "manual" || por.includes("revisión manual")) return "manual";
  if (por.includes("reutilizada")) return "reutilizada";
  if (por.startsWith("sistema") || por.startsWith("agente ia")) return "automatica";
  return "persona";
}

/** ¿La cobra Croma? Las que respondieron, sin reutilizar (como en consumos-servidor). */
function consultaCobrada(v: VerificacionInd): boolean {
  const o = origenConsulta(v);
  return v.proveedor === "croma" && (o === "automatica" || o === "persona") && ["ok", "hallazgo", "reiniciada"].includes(v.estado ?? "");
}

const ETIQUETA_CANAL: Record<string, string> = Object.fromEntries(MEDIOS_POSTULACION.map((m) => [m.value, m.label]));
function canalDe(p: ProcesoInd): string {
  if (p.medio_postulacion) return p.medio_postulacion;
  return p.origen === "whatsapp_agente" ? "whatsapp" : "sin_dato";
}

const TIPOS_CITA: Record<string, string> = {
  prueba_manejo: "Prueba de manejo",
  examen_f1: "Exámenes fase 1",
  examen_f2: "Exámenes fase 2",
  psicotecnica: "Psicotécnica",
};

const CONCEPTOS: Record<string, string> = {
  asistente: "Asistente (chat)",
  extraccion: "Lectura de la conversación",
  lectura: "Lectura de documentos",
  transcripcion: "Audios",
  laboratorio: "Mensajes del laboratorio",
  antecedentes: "Consultas a Croma",
  whatsapp: "WhatsApp",
};

function contar<T>(xs: T[], clave: (x: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(clave(x), (m.get(clave(x)) ?? 0) + 1);
  return m;
}

// ── Cálculo ──────────────────────────────────────────────────────────────────

export function calcularIndicadoresSeleccion(e: EntradaIndicadoresSeleccion): IndicadoresSeleccion {
  // Los del chat de prueba no son aspirantes.
  const procesos = e.procesos.filter((p) => p.origen !== "chat_prueba");
  const ids = new Set(procesos.map((p) => p.id));
  const eventos = e.eventos.filter((ev) => ids.has(ev.proceso_id));
  const aspirantes = procesos.length;
  const contratados = procesos.filter((p) => p.estado === "contratado").length;
  const cerrados = procesos.filter((p) => p.estado === "cierre").length;

  // Primera entrada a cada etapa, por proceso. La preselección empieza al crear el proceso.
  const entradas = new Map<string, Map<string, number>>();
  for (const p of procesos) entradas.set(p.id, new Map([["pendiente", new Date(p.created_at).getTime()]]));
  for (const ev of [...eventos].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!ev.estado_nuevo || indiceEtapa(ev.estado_nuevo) < 0) continue;
    const m = entradas.get(ev.proceso_id)!;
    if (!m.has(ev.estado_nuevo)) m.set(ev.estado_nuevo, new Date(ev.created_at).getTime());
  }

  // Embudo: la etapa más avanzada a la que llegó (si se saltó una, cuenta como pasada).
  const maxIndice = new Map<string, number>();
  for (const p of procesos) {
    let max = Math.max(0, indiceEtapa(p.estado));
    for (const etapa of entradas.get(p.id)!.keys()) max = Math.max(max, indiceEtapa(etapa));
    maxIndice.set(p.id, max);
  }
  // Un cierre desde una etapa dice que llegó a ella aunque no haya evento de entrada.
  for (const ev of eventos) maxIndice.set(ev.proceso_id, Math.max(maxIndice.get(ev.proceso_id)!, indiceEtapa(ev.estado_anterior)));
  const embudo: Fila[] = ETAPAS_EMBUDO.map((etapa, i) => ({
    clave: etapa,
    etiqueta: etiquetaEstado(etapa),
    n: procesos.filter((p) => maxIndice.get(p.id)! >= i).length,
  }));

  const porEstado = contar(procesos, (p) => p.estado);
  const porEtapa: Fila[] = PROCESO_ESTADOS.map((s) => ({ clave: s.value, etiqueta: s.label, n: porEstado.get(s.value) ?? 0 }));

  // Tiempo en cada etapa: de su entrada a la entrada de la siguiente etapa alcanzada.
  const duraciones = new Map<string, number[]>();
  for (const m of entradas.values()) {
    const orden = [...m.entries()].sort((a, b) => indiceEtapa(a[0]) - indiceEtapa(b[0]));
    for (let i = 0; i + 1 < orden.length; i++) {
      const [etapa, t0] = orden[i];
      const t1 = orden[i + 1][1];
      if (t1 >= t0) duraciones.set(etapa, [...(duraciones.get(etapa) ?? []), t1 - t0]);
    }
  }
  const tiempoEnEtapa = ETAPAS_EMBUDO.filter((s) => s !== "contratado").map((s) => ({
    estado: s,
    etiqueta: etiquetaEstado(s),
    tiempos: tiempos(duraciones.get(s) ?? []),
  }));

  const causas = contar(
    procesos.filter((p) => p.estado === "cierre"),
    (p) => p.causa_no_contrato?.trim() || "Sin causa registrada"
  );
  const causasCierre: Fila[] = [...causas.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => ({ clave: c, etiqueta: c, n, detalle: c === CAUSA_ANTECEDENTES ? "Al aspirante no se le dice el motivo" : undefined }));

  // Por semana (lunes a domingo).
  const semanas: string[] = [];
  for (let d = lunesDe(e.rango.desde); d <= e.rango.hasta; d = sumarDias(d, 7)) semanas.push(d);
  const porSemana = semanas.map((s) => {
    const fin = sumarDias(s, 6);
    const enSemana = (iso: string) => {
      const d = diaBogota(iso);
      return d >= s && d <= fin;
    };
    return {
      fecha: s,
      etiqueta: `sem. ${etiquetaDia(s)}`,
      aspirantes: procesos.filter((p) => enSemana(p.created_at)).length,
      contratados: e.contrataciones.filter((c) => enSemana(c.contratado_at)).length,
    };
  });

  // Por canal.
  const canales = new Map<string, { n: number; contratados: number }>();
  for (const p of procesos) {
    const c = canalDe(p);
    const v = canales.get(c) ?? { n: 0, contratados: 0 };
    v.n += 1;
    if (p.estado === "contratado") v.contratados += 1;
    canales.set(c, v);
  }
  const porCanal = [...canales.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([c, v]) => ({ clave: c, etiqueta: c === "sin_dato" ? "Sin dato" : (ETIQUETA_CANAL[c] ?? c), n: v.n, contratados: v.contratados }));

  // 1. Hoja de vida: entre los que llegaron por el asistente de WhatsApp.
  const delChat = procesos.filter((p) => p.origen === "whatsapp_agente");
  const conHoja = delChat.filter((p) => p.hoja_vida_recibida_at).length;

  // 2. Asistencia: citas ya pasadas del periodo, de aspirantes reales.
  const citas = e.citas.filter((c) => c.fecha < e.hoy && !["cancelada", "reprogramada"].includes(c.estado));
  const manejo = citas.filter((c) => c.tipo === "prueba_manejo");
  const asistieron = manejo.filter((c) => c.estado === "asistio").length;
  const noAsistieron = manejo.filter((c) => c.estado === "no_asistio").length;
  // Por tipo: n = asistieron; el porcentaje se muestra sobre las que tienen registro.
  const asistenciaPorTipo: Fila[] = [];
  for (const [tipo, etiqueta] of Object.entries(TIPOS_CITA)) {
    const delTipo = citas.filter((c) => c.tipo === tipo);
    if (!delTipo.length) continue;
    const si = delTipo.filter((c) => c.estado === "asistio").length;
    const no = delTipo.filter((c) => c.estado === "no_asistio").length;
    asistenciaPorTipo.push({ clave: tipo, etiqueta, n: si, detalle: `${si} asistieron, ${no} no asistieron, ${delTipo.length - si - no} sin registrar` });
  }

  // 3. Días del primer mensaje a la contratación.
  const diasHastaContratar = tiempos(
    e.contrataciones.map((c) => new Date(c.contratado_at).getTime() - new Date(c.inicio).getTime()).filter((x) => x >= 0)
  );

  // 4. Antecedentes automáticos frente a manuales (sin las simuladas del chat de prueba).
  const origenes = contar(e.verificaciones.map(origenConsulta).filter((o) => o !== "simulada"), (o) => o);
  const auto = origenes.get("automatica") ?? 0;
  const persona = origenes.get("persona") ?? 0;
  const reutilizadas = origenes.get("reutilizada") ?? 0;
  const manuales = origenes.get("manual") ?? 0;
  const totalConsultas = auto + persona + reutilizadas + manuales;
  const antecedentesFilas: Fila[] = [
    { clave: "automatica", etiqueta: "Automáticas (Gestivo)", n: auto },
    { clave: "reutilizada", etiqueta: "Reutilizadas (sin costo)", n: reutilizadas, detalle: "Una consulta reciente de la misma cédula" },
    { clave: "persona", etiqueta: "Lanzadas por una persona", n: persona, detalle: "Botón «Consultar» de la ficha" },
    { clave: "manual", etiqueta: "Revisadas a mano", n: manuales, detalle: "«Lo revisé a mano»: sin Croma" },
  ];

  // 5. Costo: lo registrado más las consultas reales a Croma por su valor.
  const porConcepto = new Map<string, number>();
  for (const c of e.consumos) porConcepto.set(c.concepto, (porConcepto.get(c.concepto) ?? 0) + (Number(c.costo_usd) || 0));
  const consultasCroma = e.verificaciones.filter(consultaCobrada).length;
  const trm = e.trm > 0 ? e.trm : 3270;
  if (e.cromaCostoCop > 0 && consultasCroma) {
    porConcepto.set("antecedentes", (porConcepto.get("antecedentes") ?? 0) + (consultasCroma * e.cromaCostoCop) / trm);
  }
  const totalUsd = [...porConcepto.values()].reduce((s, v) => s + v, 0);
  const totalCop = Math.round(totalUsd * trm);
  const costoPorConcepto: Fila[] = [...porConcepto.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => ({ clave: c, etiqueta: CONCEPTOS[c] ?? c, n: Math.round(v * trm) }));

  return {
    rango: { ...e.rango, dias: largo(e.rango) },
    aspirantes,
    contratados,
    cerrados,
    enCurso: aspirantes - contratados - cerrados,
    clave: {
      hojaVida: { base: delChat.length, n: conHoja, pct: pct(conHoja, delChat.length) },
      asistencia: {
        citas: manejo.length,
        asistieron,
        noAsistieron,
        sinRegistrar: manejo.length - asistieron - noAsistieron,
        pct: pct(asistieron, asistieron + noAsistieron),
      },
      diasHastaContratar,
      antecedentes: { total: totalConsultas, automaticas: auto, persona, reutilizadas, manuales, pctAutomaticas: pct(auto + reutilizadas, totalConsultas) },
      costo: {
        totalUsd,
        totalCop,
        porAspiranteCop: aspirantes ? Math.round(totalCop / aspirantes) : null,
        porContratadoCop: e.contrataciones.length ? Math.round(totalCop / e.contrataciones.length) : null,
        consultasCroma,
      },
    },
    porEtapa,
    embudo,
    tiempoEnEtapa,
    causasCierre,
    porSemana,
    porCanal,
    asistenciaPorTipo,
    costoPorConcepto,
    antecedentesFilas,
    faltantes: e.faltantes,
  };
}

/** «3,5 días», «18 h», «40 min». */
export function duracionLegible(ms: number | null): string {
  if (ms == null) return "—";
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toLocaleString("es-CO", { maximumFractionDigits: 1 })} días`;
}
