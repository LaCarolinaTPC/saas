/**
 * Datos del tablero del Plan Padrino (solo servidor). Lee y arma los hechos;
 * los cálculos están en tablero.ts.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { MEDIOS_POSTULACION } from "@/lib/contratacion/constants";
import { sumarDias } from "./reglas";
import {
  FUENTE_PADRINO, REFERIDO_CONTRATADO, alertasReferidos, costoPorContratado, permanenciaPorFuente, resumenTablero,
  type Contratado, type HechosAlerta, type HitoTablero,
} from "./tablero";

type Admin = ReturnType<typeof createAdminClient>;

/** Medios de postulación que llegan por los anuncios de Meta (conversaciones de WhatsApp). */
export const MEDIOS_META = ["whatsapp", "manychat"];

async function todas<T>(q: (from: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from);
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as T[];
    out.push(...filas);
    if (filas.length < 1000) break;
  }
  return out;
}

const enLotes = <T,>(xs: T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const fechaBogota = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(ts));

interface RefFila {
  id: string;
  proceso_id: string | null;
  estado: string;
  cedula_referido: string;
  nombre_referido: string | null;
  cedula_padrino: string;
  nombre_padrino: string | null;
  fecha_ingreso: string | null;
}

export async function getTablero(f: { desde: string; hasta: string }, hoy: string, cedulaUsuario: string | null) {
  const admin = createAdminClient();

  // Referidos vigentes y sus hitos (nunca los del usuario como padrino).
  const referidos = (await todas<RefFila>((from) => {
    let q = admin.from("padrino_referidos").select("id, proceso_id, estado, cedula_referido, nombre_referido, cedula_padrino, nombre_padrino, fecha_ingreso").is("anulado_at", null).order("id").range(from, from + 999);
    if (cedulaUsuario) q = q.neq("cedula_padrino", cedulaUsuario);
    return q;
  }));
  const idsRef = new Set(referidos.map((r) => r.id));
  const porId = new Map(referidos.map((r) => [r.id, r]));
  const hitosCrudos = await todas<{ id: string; referido_id: string; numero: number; estado: string; valor: number; fecha_causacion: string; fecha_pago: string | null }>((from) =>
    admin.from("padrino_hitos").select("id, referido_id, numero, estado, valor, fecha_causacion, fecha_pago").order("id").range(from, from + 999)
  ).catch(() => []);
  const hitos = hitosCrudos.filter((h) => idsRef.has(h.referido_id)).map((h) => ({ ...h, valor: Number(h.valor) }));
  const hitosTablero: HitoTablero[] = hitos.map((h) => {
    const r = porId.get(h.referido_id)!;
    return { estado: h.estado, valor: h.valor, fecha_causacion: h.fecha_causacion, fecha_pago: h.fecha_pago, cedula_padrino: r.cedula_padrino, nombre_padrino: r.nombre_padrino };
  });
  const resumen = resumenTablero(referidos, hitosTablero, hoy);

  // ── Permanencia por fuente: conductores contratados en el rango ──────────
  // También entran los contratados sin fecha_contrato: su ingreso sale del
  // conductor o de la creación del proceso, y el rango se filtra abajo con esa fecha.
  const procesos = await todas<{ id: string; cedula: string; medio_postulacion: string | null; fecha_contrato: string | null; fecha_creacion: string }>((from) =>
    admin
      .from("procesos_contratacion")
      .select("id, cedula, medio_postulacion, fecha_contrato, fecha_creacion")
      .eq("estado", "contratado")
      .or(`and(fecha_contrato.gte.${f.desde},fecha_contrato.lte.${f.hasta}),fecha_contrato.is.null`)
      .order("fecha_contrato", { ascending: false, nullsFirst: false })
      .order("id")
      .range(from, from + 999)
  );
  // Un contratado por cédula: el proceso más reciente del rango.
  const porCedula = new Map<string, (typeof procesos)[number]>();
  for (const p of procesos) if (!porCedula.has(p.cedula.trim())) porCedula.set(p.cedula.trim(), p);
  const conductores = new Map<string, { estado: string; fecha_ingreso: string | null; fecha_retiro: string | null }>();
  for (const lote of enLotes([...porCedula.keys()])) {
    const { data } = await admin.from("conductores").select("cedula, estado, fecha_ingreso, fecha_retiro").in("cedula", lote);
    for (const c of data ?? []) conductores.set(c.cedula as string, { estado: c.estado as string, fecha_ingreso: c.fecha_ingreso as string | null, fecha_retiro: c.fecha_retiro as string | null });
  }
  // Plan Padrino solo si ESTE proceso es el del referido contratado: una
  // recontratación posterior por otro medio no se atribuye al plan.
  const procesosPadrino = new Set(referidos.filter((r) => REFERIDO_CONTRATADO.has(r.estado) && r.proceso_id).map((r) => r.proceso_id as string));
  const etiquetaMedio = (m: string | null) => MEDIOS_POSTULACION.find((x) => x.value === m)?.label ?? (m ? m : "Sin medio");
  const contratados: Contratado[] = [];
  const cohorte = new Map<string, { procesoId: string; fuente: string; medio: string | null }>();
  let sinConductor = 0;
  for (const [cedula, p] of porCedula) {
    const c = conductores.get(cedula);
    if (!c) {
      sinConductor++;
      continue;
    }
    const ingreso = (p.fecha_contrato ?? c.fecha_ingreso ?? p.fecha_creacion).slice(0, 10);
    if (ingreso < f.desde || ingreso > f.hasta) continue;
    const retiro = c.estado !== "ACTIVO" && c.fecha_retiro && c.fecha_retiro >= ingreso ? c.fecha_retiro : null;
    const fuente = procesosPadrino.has(p.id) ? FUENTE_PADRINO : etiquetaMedio(p.medio_postulacion);
    contratados.push({ cedula, fuente, ingreso, retiro });
    cohorte.set(cedula, { procesoId: p.id, fuente, medio: p.medio_postulacion });
  }
  const permanencia = permanenciaPorFuente(contratados, hoy);

  // ── Costo por contratado: Plan Padrino frente a Meta Ads ────────────────
  const procesosPadrinoCohorte = new Set([...cohorte.values()].filter((x) => x.fuente === FUENTE_PADRINO).map((x) => x.procesoId));
  const refsEnCohorte = new Set(referidos.filter((r) => r.proceso_id && procesosPadrinoCohorte.has(r.proceso_id)).map((r) => r.id));
  const costoPadrino = hitos.filter((h) => refsEnCohorte.has(h.referido_id) && ["por_aprobar", "aprobado", "pagado"].includes(h.estado)).reduce((s, h) => s + h.valor, 0);
  const contratadosPadrino = contratados.filter((c) => c.fuente === FUENTE_PADRINO).length;
  const gastoMeta = (await todas<{ gasto: number }>((from) =>
    admin.from("meta_spend_daily").select("gasto").gte("fecha", f.desde).lte("fecha", f.hasta).order("id").range(from, from + 999)
  ).catch(() => [])).reduce((s, g) => s + Number(g.gasto ?? 0), 0);
  const contratadosMeta = [...cohorte.values()].filter((x) => x.fuente !== FUENTE_PADRINO && MEDIOS_META.includes(x.medio ?? "")).length;

  // ── Alertas (RQ-11): referidos en seguimiento con hitos por venir ───────
  const enSeguimiento = referidos.filter((r) => r.estado === "en_seguimiento" && r.fecha_ingreso);
  const alertas = alertasReferidos(await hechosAlertas(admin, enSeguimiento, hitos));

  return {
    resumen,
    permanencia,
    sinConductor,
    costos: {
      padrino: { costo: costoPadrino, contratados: contratadosPadrino, porContratado: costoPorContratado(costoPadrino, contratadosPadrino) },
      meta: { costo: gastoMeta, contratados: contratadosMeta, porContratado: costoPorContratado(gastoMeta, contratadosMeta) },
    },
    alertas,
  };
}

async function hechosAlertas(admin: Admin, refs: RefFila[], hitos: { referido_id: string; numero: number; estado: string; valor: number; fecha_causacion: string }[]): Promise<HechosAlerta[]> {
  if (!refs.length) return [];
  const cedulas = refs.map((r) => r.cedula_referido);
  const desde = refs.map((r) => r.fecha_ingreso!).sort()[0];
  const faltas = new Map<string, string[]>();
  const accidentes = new Map<string, string[]>();
  for (const lote of enLotes(cedulas)) {
    const [aus, acc] = await Promise.all([
      // Con fecha_inicio/fecha_fin: una ausencia de varios días cuenta cada día (si no, la racha nunca pasa de 1).
      todas<{ cedula: string; fecha: string; fecha_inicio: string | null; fecha_fin: string | null }>((from) =>
        admin
          .from("ausentismo_registros")
          .select("cedula, fecha, fecha_inicio, fecha_fin")
          .in("cedula", lote)
          .eq("tipo", "no_justificada")
          .or(`fecha.gte.${desde},fecha_fin.gte.${desde},fecha_inicio.gte.${desde}`)
          .order("id")
          .range(from, from + 999)
      ).catch(() => []),
      todas<{ conductor_cedula: string; fecha_accidente: string }>((from) =>
        admin.from("accidentes").select("conductor_cedula, fecha_accidente").in("conductor_cedula", lote).gte("fecha_accidente", `${desde}T00:00:00-05:00`).order("id").range(from, from + 999)
      ).catch(() => []),
    ]);
    for (const a of aus) {
      const inicio = a.fecha_inicio ?? a.fecha;
      const fin = a.fecha_fin && a.fecha_fin >= inicio ? a.fecha_fin : inicio;
      const dias: string[] = [];
      for (let d = inicio; d <= fin && dias.length < 370; d = sumarDias(d, 1)) dias.push(d);
      faltas.set(a.cedula, [...(faltas.get(a.cedula) ?? []), ...dias]);
    }
    for (const a of acc) accidentes.set(a.conductor_cedula, [...(accidentes.get(a.conductor_cedula) ?? []), fechaBogota(a.fecha_accidente)]);
  }
  return refs.map((r) => {
    const proximo = hitos
      .filter((h) => h.referido_id === r.id && (h.estado === "pendiente" || h.estado === "por_aprobar"))
      .sort((a, b) => a.fecha_causacion.localeCompare(b.fecha_causacion))[0];
    return {
      referidoId: r.id,
      nombre: r.nombre_referido,
      cedula: r.cedula_referido,
      fechaIngreso: r.fecha_ingreso!,
      proximoHito: proximo ? { numero: proximo.numero, fecha: proximo.fecha_causacion, valor: proximo.valor } : null,
      faltas: [...new Set(faltas.get(r.cedula_referido) ?? [])].filter((d) => d >= r.fecha_ingreso!),
      accidentes: (accidentes.get(r.cedula_referido) ?? []).filter((d) => d >= r.fecha_ingreso!),
    };
  });
}

/** Alertas de un solo referido (para su ficha). */
export async function alertasDeReferido(r: RefFila, hitos: { referido_id: string; numero: number; estado: string; valor: number; fecha_causacion: string }[]) {
  if (r.estado !== "en_seguimiento" || !r.fecha_ingreso) return [];
  return alertasReferidos(await hechosAlertas(createAdminClient(), [r], hitos));
}
