/**
 * Reconocimiento de ruta (24-nov-2026): lo hace un encargado, no el profesor
 * de manejo. Desde su pantalla (/reconocimiento) ve a los aspirantes que están
 * en exámenes o en reconocimiento, registra las rutas que hicieron y las que
 * faltan, los cita (día y hora a su elección) y da la fase por terminada.
 *
 * Estado del reconocimiento (procesos_contratacion.reconocimiento_estado):
 *   pendiente: hay que citarlo (dijo que conoce menos rutas que el mínimo, o
 *     todavía no respondió);
 *   por_verificar: dijo en el chat que conoce las rutas: el encargado lo verifica;
 *   en_curso: ya tiene salidas registradas o una cita;
 *   finalizado: el encargado lo dio por terminado (cuenta para contratar).
 * Solo servidor; quien llama revisa los permisos.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { citaVigente, hhmm, type Cita } from "./agenda";
import { cancelarReconocimientos, citarReconocimientoEn, leerAjustesAgenda, marcarLlegada, marcarNoAsistio, type ResultadoAgenda } from "./agenda-servidor";
import { registrarReconocimiento, registrarReconocimientos, rutasParaReconocimiento, type ResultadoProfesor } from "./profesor-servidor";
import { avanceRutas } from "./rutas";
import { rutasObligatorias } from "./rutas-servidor";
import { examenesPorRevisar } from "./examenes-servidor";
import { revisarListoContratar } from "./listo-contratar-revisar";

export type EstadoReconocimiento = "pendiente" | "por_verificar" | "en_curso" | "finalizado";

export const ESTADOS_PROCESO_RECONOCIMIENTO = ["en_examenes", "en_examenes_fase2", "reconocimiento_ruta"] as const;

export interface SalidaRuta {
  fecha: string;
  ruta: string;
  resultado: "aprendida" | "repetir" | "no_continua";
  observacion: string | null;
  por: string | null;
}

export interface AspiranteReconocimiento {
  procesoId: string;
  nombre: string;
  cedula: string;
  celular: string | null;
  estadoProceso: string;
  prueba: boolean;
  estado: EstadoReconocimiento | null;
  rutasDeclaradas: number | null;
  respondioAt: string | null;
  aprendidas: string[];
  necesarias: number;
  faltanObligatorias: string[];
  completas: boolean;
  salidas: SalidaRuta[];
  cita: Pick<Cita, "id" | "fecha" | "hora" | "estado"> | null;
  finalizadoAt: string | null;
  finalizadoPor: string | null;
  nota: string | null;
  /** Examen no apto en revisión (o aplazado): sigue en el reconocimiento mientras se decide (24-nov-2026). */
  examen: { fase: 1 | 2; resultado: "no_apto" | "aplazado" } | null;
}

export interface PantallaReconocimiento {
  disponible: boolean;
  aspirantes: AspiranteReconocimiento[];
  rutas: string[];
  obligatorias: string[];
  minimas: number;
}

/** El estado que se muestra: el guardado o, sin él, lo que se deduce. */
export function estadoEfectivo(guardado: string | null, salidas: number, conCita: boolean): EstadoReconocimiento {
  if (guardado === "finalizado" || guardado === "por_verificar" || guardado === "en_curso") return guardado;
  return salidas > 0 || conCita ? "en_curso" : "pendiente";
}

/** Los aspirantes que pueden estar en reconocimiento, con su avance. */
export async function pantallaReconocimiento(opciones: { incluirPrueba?: boolean } = {}): Promise<PantallaReconocimiento> {
  const db = createAdminClient();
  const [a, obligatorias, rutas] = await Promise.all([leerAjustesAgenda(), rutasObligatorias().catch(() => [] as string[]), rutasParaReconocimiento()]);
  const base = "id, nombre, cedula, celular, estado, origen, reingreso, rutas_declaradas, rutas_respondido_at";
  const completa = await db
    .from("procesos_contratacion")
    .select(`${base}, reconocimiento_estado, reconocimiento_finalizado_at, reconocimiento_finalizado_por, reconocimiento_nota`)
    .in("estado", [...ESTADOS_PROCESO_RECONOCIMIENTO])
    .order("updated_at", { ascending: false })
    .limit(300);
  // Sin la migración 20261124203802 no hay estado del reconocimiento: se muestra lo deducido.
  const disponible = !completa.error;
  const filas: unknown[] = completa.error
    ? ((await db.from("procesos_contratacion").select(base).in("estado", [...ESTADOS_PROCESO_RECONOCIMIENTO]).limit(300)).data ?? [])
    : (completa.data ?? []);
  const procesos = (filas as Record<string, unknown>[]).filter((p) => p.reingreso !== true && (opciones.incluirPrueba || p.origen !== "chat_prueba"));
  const ids = procesos.map((p) => p.id as string);
  const [salidasR, citasR] = ids.length
    ? await Promise.all([
        db.from("seleccion_reconocimientos_ruta").select("proceso_id, fecha, ruta, resultado, observacion, profesor_email, created_at").in("proceso_id", ids).order("created_at"),
        db.from("seleccion_citas").select("id, proceso_id, fecha, hora, estado, tipo").in("proceso_id", ids).eq("tipo", "reconocimiento").order("fecha"),
      ])
    : [{ data: [] }, { data: [] }];
  const salidas = (salidasR.data ?? []) as Record<string, unknown>[];
  const citas = (citasR.data ?? []) as unknown as (Cita & { proceso_id: string })[];
  const porRevisar = await examenesPorRevisar(procesos.map((p) => p.id as string)).catch(() => new Map());
  const aspirantes = procesos.map((p): AspiranteReconocimiento => {
    const id = p.id as string;
    const suyas: SalidaRuta[] = salidas
      .filter((s) => s.proceso_id === id)
      .map((s) => ({ fecha: s.fecha as string, ruta: s.ruta as string, resultado: s.resultado as SalidaRuta["resultado"], observacion: (s.observacion as string | null) ?? null, por: (s.profesor_email as string | null) ?? null }));
    const av = avanceRutas(suyas.filter((s) => s.resultado === "aprendida").map((s) => s.ruta), a.rutasMinimas, obligatorias);
    const cita = citas.filter((c) => c.proceso_id === id).find((c) => citaVigente(c)) ?? null;
    return {
      procesoId: id,
      nombre: String(p.nombre ?? ""),
      cedula: String(p.cedula ?? ""),
      celular: (p.celular as string | null) ?? null,
      estadoProceso: String(p.estado),
      prueba: p.origen === "chat_prueba",
      estado: estadoEfectivo((p.reconocimiento_estado as string | null) ?? null, suyas.length, !!cita),
      rutasDeclaradas: (p.rutas_declaradas as number | null) ?? null,
      respondioAt: (p.rutas_respondido_at as string | null) ?? null,
      aprendidas: av.aprendidas,
      necesarias: av.necesarias,
      faltanObligatorias: av.faltanObligatorias,
      completas: av.completas,
      salidas: suyas,
      cita: cita ? { id: cita.id, fecha: cita.fecha, hora: hhmm(cita.hora), estado: cita.estado } : null,
      finalizadoAt: (p.reconocimiento_finalizado_at as string | null) ?? null,
      finalizadoPor: (p.reconocimiento_finalizado_por as string | null) ?? null,
      nota: (p.reconocimiento_nota as string | null) ?? null,
      examen: porRevisar.has(id) ? { fase: porRevisar.get(id)!.fase, resultado: porRevisar.get(id)!.resultado } : null,
    };
  });
  return { disponible, aspirantes, rutas, obligatorias, minimas: avanceRutas([], a.rutasMinimas, obligatorias).necesarias };
}

type Resultado = { ok: true; texto?: string; envio?: string } | { ok: false; error: string };

async function enEtapa(procesoId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("procesos_contratacion").select("estado").eq("id", procesoId).maybeSingle();
  if (!data) return "El proceso no existe.";
  return (ESTADOS_PROCESO_RECONOCIMIENTO as readonly string[]).includes(data.estado as string) ? null : "El aspirante ya no está en exámenes ni en reconocimiento de ruta.";
}

/** Rutas de una salida (las que aprendió y las que debe repetir). */
export async function registrarRutas(procesoId: string, d: { salidas: { ruta: string; resultado: "aprendida" | "repetir" }[]; observacion?: string | null }, actor: ActorProceso): Promise<ResultadoProfesor> {
  const mal = await enEtapa(procesoId);
  if (mal) return { ok: false, error: mal };
  return registrarReconocimientos(procesoId, d, actor);
}

/** Cita (o mueve la cita) al reconocimiento y le avisa al aspirante. */
export async function citarReconocimiento(procesoId: string, cuando: { fecha: string; hora: string }, actor: ActorProceso): Promise<ResultadoAgenda> {
  const mal = await enEtapa(procesoId);
  if (mal) return { ok: false, error: mal };
  const r = await citarReconocimientoEn(procesoId, cuando, actor);
  if (r.ok) await createAdminClient().from("procesos_contratacion").update({ reconocimiento_estado: "en_curso" }).eq("id", procesoId).or("reconocimiento_estado.is.null,reconocimiento_estado.in.(pendiente,por_verificar)");
  return r;
}

export async function llegadaReconocimiento(citaId: string, llego: boolean, actor: ActorProceso): Promise<ResultadoAgenda> {
  return llego ? marcarLlegada(citaId, actor) : marcarNoAsistio(citaId, actor);
}

/** El encargado da el reconocimiento por terminado (verificó que conoce las rutas o las aprendió). */
export async function finalizarReconocimiento(procesoId: string, nota: string, actor: ActorProceso): Promise<Resultado> {
  const mal = await enEtapa(procesoId);
  if (mal) return { ok: false, error: mal };
  const texto = String(nota ?? "").trim().slice(0, 500) || null;
  const { error } = await createAdminClient()
    .from("procesos_contratacion")
    .update({ reconocimiento_estado: "finalizado", reconocimiento_finalizado_at: new Date().toISOString(), reconocimiento_finalizado_por: actor.userEmail ?? null, reconocimiento_nota: texto })
    .eq("id", procesoId);
  if (error) return { ok: false, error: /reconocimiento_/.test(error.message) ? "Falta aplicar la migración 20261124203802." : error.message };
  await cancelarReconocimientos(procesoId, actor, "Reconocimiento terminado");
  await registrarEvento(procesoId, { tipo: "prueba", detalle: { accion: "reconocimiento_finalizado", nota: texto } }, actor);
  await revisarListoContratar(procesoId, actor);
  return { ok: true };
}

/** Deshace «terminado» (por error): vuelve a «en curso». */
export async function reabrirReconocimiento(procesoId: string, actor: ActorProceso): Promise<Resultado> {
  const { data, error } = await createAdminClient()
    .from("procesos_contratacion")
    .update({ reconocimiento_estado: "en_curso", reconocimiento_finalizado_at: null, reconocimiento_finalizado_por: null })
    .eq("id", procesoId)
    .eq("reconocimiento_estado", "finalizado")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "No estaba terminado." };
  await registrarEvento(procesoId, { tipo: "prueba", detalle: { accion: "reconocimiento_reabierto" } }, actor);
  await revisarListoContratar(procesoId, actor);
  return { ok: true };
}

/** No continúa: cierra el proceso con su motivo (como lo hacía el profesor). */
export async function noContinuaReconocimiento(procesoId: string, motivo: string, ruta: string | null, actor: ActorProceso): Promise<ResultadoProfesor> {
  const mal = await enEtapa(procesoId);
  if (mal) return { ok: false, error: mal };
  return registrarReconocimiento(procesoId, { ruta: ruta?.trim() || "Reconocimiento de ruta", resultado: "no_continua", observacion: motivo }, actor);
}
