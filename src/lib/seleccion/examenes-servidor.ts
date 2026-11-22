/**
 * Exámenes médicos del aspirante (entrega 3, M1–M3): lectura y registro (solo
 * servidor). Quien llama revisa los permisos. Reglas puras en ./examenes.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { cambiarEstadoProceso, registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { siguienteDiaHabil } from "./agenda";
import { avisarProceso, citarReconocimiento, crearCitaSimple, leerAjustesAgenda, type EnvioAgenda } from "./agenda-servidor";
import { rutasAprendidas } from "./agenda";
import { fechaFase2 } from "./laboratorios-servidor";
import { avanceRutas } from "./rutas";
import { rutasObligatorias } from "./rutas-servidor";
import { CAUSA_EXAMENES, efectoExamen, type ExamenGuardado, type FaseExamen, type ResultadoExamen } from "./examenes";

export interface ExamenVista extends ExamenGuardado {
  id: string;
  fecha: string | null;
  confirmadoPor: string | null;
  confirmadoAt: string | null;
}

/** Los exámenes registrados del proceso. null si falta la migración de la entrega 3. */
export async function examenesDeProceso(procesoId: string): Promise<ExamenVista[] | null> {
  const { data, error } = await createAdminClient()
    .from("seleccion_examenes")
    .select("id, fase, fecha, resultado, observacion, confirmado_por, confirmado_at")
    .eq("proceso_id", procesoId)
    .order("fase");
  if (error) return null;
  return (data ?? []).map((f) => ({
    id: f.id as string,
    fase: f.fase as FaseExamen,
    fecha: (f.fecha as string | null) ?? null,
    resultado: f.resultado as ExamenGuardado["resultado"],
    observacion: (f.observacion as string | null) ?? null,
    confirmadoPor: (f.confirmado_por as string | null) ?? null,
    confirmadoAt: (f.confirmado_at as string | null) ?? null,
  }));
}

export interface ResultadoRegistroExamen {
  ok: boolean;
  error?: string;
  /** Mensaje que salió (o quedó como borrador): la cita de la fase 2 o el reconocimiento de ruta. */
  envio?: EnvioAgenda;
  /** Texto de ese mensaje (lo muestra el chat de prueba). */
  texto?: string;
  proponeCierre?: boolean;
}

/**
 * Resultado de una fase de exámenes. Fase 1 apta: pasa a fase 2, lo cita en el
 * laboratorio el siguiente día hábil y le envía el mensaje (en ayunas). Fase 2
 * apta: pasa a reconocimiento de ruta y lo cita a la primera salida (el
 * siguiente día hábil, a la hora del ajuste) con el mensaje «reconocimiento_ruta»
 * (21-nov-2026). No a los reingresos, que no lo hacen, ni a quien ya completó
 * las rutas mientras salían los exámenes.
 * No apta: queda la propuesta de cerrar con «Exámenes médicos» para que la
 * confirme una persona.
 */
export async function registrarExamen(
  procesoId: string,
  d: { fase: FaseExamen; resultado: ResultadoExamen; observacion?: string | null },
  actor: ActorProceso
): Promise<ResultadoRegistroExamen> {
  const db = createAdminClient();
  const { data: p } = await db.from("procesos_contratacion").select("estado, reingreso").eq("id", procesoId).maybeSingle();
  if (!p) return { ok: false, error: "El proceso no existe." };
  const previos = await examenesDeProceso(procesoId);
  if (previos == null) return { ok: false, error: "Falta aplicar la migración de la entrega 3 de selección." };
  const efecto = efectoExamen(d.fase, d.resultado, p.estado as string, previos);
  if ("error" in efecto) return { ok: false, error: efecto.error };
  const observacion = String(d.observacion ?? "").trim().slice(0, 1000) || null;
  if (d.resultado === "no_apto" && !observacion) return { ok: false, error: "Escriba qué dice el laboratorio (motivo del no apto)." };
  if (d.resultado === "aplazado" && !observacion) return { ok: false, error: "Escriba por qué quedó aplazado (lo que dice el laboratorio)." };

  const hoy = fechaBogota(new Date().toISOString());
  const { error } = await db.from("seleccion_examenes").upsert(
    { proceso_id: procesoId, fase: d.fase, fecha: hoy, resultado: d.resultado, observacion, confirmado_por: actor.userEmail, confirmado_at: new Date().toISOString() },
    { onConflict: "proceso_id,fase" }
  );
  if (error) return { ok: false, error: `No se pudo guardar el examen (${error.message}).` };
  await registrarEvento(procesoId, { tipo: "examen_medico", detalle: { fase: d.fase, resultado: d.resultado, observacion } }, actor);

  let envio: EnvioAgenda | undefined;
  let texto: string | undefined;
  if (efecto.estado) await cambiarEstadoProceso(procesoId, efecto.estado, { actor, detalle: { motivo: `Exámenes, fase ${d.fase}: apto.` } });
  if (efecto.citarFase2) {
    const a = await leerAjustesAgenda();
    // En el mismo laboratorio de la fase 1, un día que atienda.
    const cuando = { fecha: await fechaFase2(procesoId, siguienteDiaHabil(hoy)).catch(() => siguienteDiaHabil(hoy)), hora: a.laboratorioHora };
    await db.from("procesos_contratacion").update({ fecha_examenes_fase2: cuando.fecha }).eq("id", procesoId);
    await crearCitaSimple(procesoId, "examen_f2", cuando, actor);
    const aviso = await avisarProceso(procesoId, "examenes_fase2", cuando);
    envio = aviso.envio;
    texto = aviso.texto;
  }
  if (efecto.estado === "reconocimiento_ruta" && p.reingreso !== true) {
    const [{ rutasMinimas }, obligatorias, { data: salidas }] = await Promise.all([
      leerAjustesAgenda(),
      rutasObligatorias(),
      db.from("seleccion_reconocimientos_ruta").select("ruta, resultado").eq("proceso_id", procesoId),
    ]);
    const avance = avanceRutas(rutasAprendidas((salidas ?? []) as { ruta: string; resultado: string }[]), rutasMinimas, obligatorias);
    if (!avance.completas) {
      const r = await citarReconocimiento(procesoId, "reconocimiento_ruta", actor, { rutas: String(avance.necesarias), aprendidas: String(avance.aprendidas.length) });
      envio = r.envio;
      texto = r.texto;
    }
  }
  return { ok: true, envio, texto, proponeCierre: efecto.proponeCierre };
}

/** Una persona confirma el cierre que propuso un examen no apto. */
export async function cerrarPorExamenes(procesoId: string, actor: ActorProceso): Promise<{ ok: boolean; error?: string }> {
  const examenes = await examenesDeProceso(procesoId);
  const noApto = examenes?.find((e) => e.resultado === "no_apto");
  if (!noApto) return { ok: false, error: "Este proceso no tiene un examen no apto." };
  await cambiarEstadoProceso(procesoId, "cierre", { actor, causa: CAUSA_EXAMENES, detalle: { motivo: noApto.observacion, fase: noApto.fase } });
  return { ok: true };
}
