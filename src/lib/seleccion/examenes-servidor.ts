/**
 * Exámenes médicos del aspirante (entrega 3, M1–M3): lectura y registro (solo
 * servidor). Quien llama revisa los permisos. Reglas puras en ./examenes.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { cambiarEstadoProceso, registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { siguienteDiaHabil } from "./agenda";
import { avisarProceso, crearCitaSimple, leerAjustesAgenda, type EnvioAgenda } from "./agenda-servidor";
import { enviarOrdenAlCitar, fechaFase2 } from "./laboratorios-servidor";
import { CAUSA_EXAMENES, efectoExamen, type ExamenGuardado, type FaseExamen, type ResultadoExamen } from "./examenes";
import { revisarListoContratar } from "./listo-contratar-revisar";

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
    const citaF2 = await crearCitaSimple(procesoId, "examen_f2", cuando, actor);
    const aviso = await avisarProceso(procesoId, "examenes_fase2", cuando);
    envio = aviso.envio;
    texto = aviso.texto;
    // Las rutas ya no se preguntan aquí: se preguntan en la fase 1 (aviso del reconocimiento).
    // La orden de la fase 2 al laboratorio, si el envío es automático (23-nov-2026).
    await enviarOrdenAlCitar(citaF2, actor);
  }
  // Desde el 24-nov-2026 el reconocimiento de ruta no se cita solo al pasar la fase 2:
  // lo cita su encargado (pantalla «Reconocimiento de ruta»).
  // 25-nov-2026: con este resultado puede quedar (o dejar de estar) «Listo para contratar».
  await revisarListoContratar(procesoId, actor);
  return { ok: true, envio, texto, proponeCierre: efecto.proponeCierre };
}

/** Una persona confirma el cierre que propuso un examen no apto. */
export async function cerrarPorExamenes(procesoId: string, actor: ActorProceso, decision?: string | null): Promise<{ ok: boolean; error?: string }> {
  const examenes = await examenesDeProceso(procesoId);
  const noApto = examenes?.find((e) => e.resultado === "no_apto");
  if (!noApto) return { ok: false, error: "Este proceso no tiene un examen no apto." };
  const nota = String(decision ?? "").trim().slice(0, 1000) || null;
  await cambiarEstadoProceso(procesoId, "cierre", { actor, causa: CAUSA_EXAMENES, detalle: { motivo: noApto.observacion, fase: noApto.fase, ...(nota ? { decision: nota } : {}) } });
  return { ok: true };
}

/**
 * Revisión manual de un no apto (24-nov-2026). El no apto queda marcado en el
 * tablero; una persona revisa por qué y decide:
 *  - «sigue»: el examen queda apto con la decisión anotada y el proceso avanza
 *    como con un apto (fase 1: cita y mensaje de la fase 2, y la orden al
 *    laboratorio; fase 2: reconocimiento de ruta);
 *  - «no sigue»: se cierra con «Exámenes médicos».
 * La decisión (por qué) es obligatoria y queda en el historial. Mientras se
 * decide, el aspirante sigue en el reconocimiento de ruta.
 */
export async function decidirNoApto(procesoId: string, sigue: boolean, decision: string, actor: ActorProceso): Promise<ResultadoRegistroExamen> {
  const nota = String(decision ?? "").trim().slice(0, 1000);
  if (nota.length < 5) return { ok: false, error: "Escriba qué se decidió y por qué (queda en el historial)." };
  const { data: p } = await createAdminClient().from("procesos_contratacion").select("estado").eq("id", procesoId).maybeSingle();
  if (!p) return { ok: false, error: "El proceso no existe." };
  if (p.estado === "cierre" || p.estado === "contratado") return { ok: false, error: "El proceso ya está cerrado o contratado: ya se decidió." };
  const examenes = await examenesDeProceso(procesoId);
  if (examenes == null) return { ok: false, error: "Falta aplicar la migración de la entrega 3 de selección." };
  const noApto = examenes.find((e) => e.resultado === "no_apto");
  if (!noApto) return { ok: false, error: "Este proceso no tiene un examen no apto por revisar." };
  if (!sigue) {
    const r = await cerrarPorExamenes(procesoId, actor, nota);
    return r.ok ? { ok: true } : r;
  }
  const observacion = `Revisión manual: sigue pese al no apto del laboratorio${noApto.observacion ? ` («${noApto.observacion.slice(0, 300)}»)` : ""}. Decisión: ${nota}`;
  const r = await registrarExamen(procesoId, { fase: noApto.fase, resultado: "apto", observacion }, actor);
  if (!r.ok) return r;
  // Ya no es lo que propuso el laboratorio: lo decidió una persona.
  await createAdminClient().from("seleccion_examenes").update({ propuesto_por_laboratorio: false }).eq("proceso_id", procesoId).eq("fase", noApto.fase);
  await registrarEvento(procesoId, { tipo: "dato", detalle: { revision_no_apto: "sigue", fase: noApto.fase, decision: nota } }, actor);
  return r;
}

/** No aptos sin decidir y aplazados de esos procesos (para marcarlos en el tablero). */
export async function examenesPorRevisar(procesoIds: readonly string[]): Promise<Map<string, { fase: FaseExamen; resultado: "no_apto" | "aplazado"; observacion: string | null }>> {
  const mapa = new Map<string, { fase: FaseExamen; resultado: "no_apto" | "aplazado"; observacion: string | null }>();
  if (!procesoIds.length) return mapa;
  const db = createAdminClient();
  for (let i = 0; i < procesoIds.length; i += 200) {
    const { data, error } = await db.from("seleccion_examenes").select("proceso_id, fase, resultado, observacion").in("resultado", ["no_apto", "aplazado"]).in("proceso_id", procesoIds.slice(i, i + 200));
    if (error) return mapa;
    for (const f of data ?? []) {
      const previo = mapa.get(f.proceso_id as string);
      // El no apto (hay que decidir) pesa más que un aplazado.
      if (previo?.resultado === "no_apto") continue;
      mapa.set(f.proceso_id as string, { fase: f.fase as FaseExamen, resultado: f.resultado as "no_apto" | "aplazado", observacion: (f.observacion as string | null) ?? null });
    }
  }
  return mapa;
}
