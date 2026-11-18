/**
 * Consulta del SIMIT de un proceso: llama al proveedor configurado (Croma),
 * guarda cada consulta en verificaciones_externas, actualiza el SIMIT del
 * proceso y recalcula el semáforo. Exige la autorización de datos (Ley 1581).
 * Si Croma responde con un trabajo asíncrono, la consulta queda pendiente y
 * `resolverSimitPendientes` (cron de seguimiento) la termina. La licencia se
 * consulta igual en el RUNT (`consultarRuntProceso`), con `resolverRuntPendientes`.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTOR_SISTEMA, registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { evaluarAntecedentesProceso, marcarListoParaCitar, marcarRevisionAntecedentes, reevaluarPreseleccion } from "@/lib/seleccion/servidor";
import { hallazgoDe, type EvaluacionAntecedentes } from "@/lib/seleccion/antecedentes";
import {
  consultarRuntConIdentidad,
  interpretarRnmcCroma,
  nombresCoinciden,
  proveedorAntecedentes,
  proveedorPolicia,
  proveedorRnmc,
  proveedorRunt,
  proveedorSimit,
  type FuenteAntecedenteCroma,
  type ResultadoPolicia,
  type ResultadoRnmc,
  type ResultadoRunt,
  type ResultadoSimit,
  type ResumenRunt,
} from "./proveedores";

export type ResultadoConsultaSimit =
  | { modo: "manual"; mensaje: string }
  | { modo: "consultado"; estado: "ok" | "hallazgo"; valor: number }
  | { modo: "pendiente"; mensaje: string }
  | { modo: "error"; mensaje: string };

/** Lleva un resultado terminado al proceso: SIMIT, historial y semáforo. */
async function aplicarResultado(procesoId: string, r: ResultadoSimit, proveedor: string, actor: ActorProceso): Promise<void> {
  if (r.valor == null || (r.estado !== "ok" && r.estado !== "hallazgo")) return;
  await createAdminClient()
    .from("procesos_contratacion")
    .update({ simit: r.valor > 0 ? "deuda" : "ok", simit_valor: r.valor })
    .eq("id", procesoId);
  await registrarEvento(procesoId, { tipo: "dato", detalle: { simit: r.valor, proveedor } }, actor);
  await reevaluarPreseleccion(procesoId);
}

export async function consultarSimitProceso(procesoId: string, actor: ActorProceso): Promise<ResultadoConsultaSimit> {
  const admin = createAdminClient();
  const { data: p } = await admin
    .from("procesos_contratacion")
    .select("id, cedula, autorizacion_datos")
    .eq("id", procesoId)
    .maybeSingle();
  if (!p) return { modo: "error", mensaje: "El proceso no existe." };
  if (p.autorizacion_datos !== "si") {
    return { modo: "error", mensaje: "El aspirante no ha autorizado el tratamiento de datos: no se puede consultar." };
  }
  const cedula = String(p.cedula ?? "").trim();
  if (!cedula) return { modo: "error", mensaje: "El proceso no tiene cédula." };

  const proveedor = proveedorSimit();
  if (!proveedor) {
    return { modo: "manual", mensaje: "No hay proveedor configurado (falta CROMA_API_KEY): registre el SIMIT a mano en la ficha." };
  }

  // Si ya hay una consulta en curso, no se lanza otra.
  const { data: enCurso } = await admin
    .from("verificaciones_externas")
    .select("id")
    .eq("proceso_id", procesoId)
    .eq("fuente", "simit")
    .eq("estado", "pendiente")
    .limit(1)
    .maybeSingle();
  if (enCurso) return { modo: "pendiente", mensaje: "La consulta del SIMIT sigue en curso en Croma; el resultado llega solo." };

  const r = await proveedor.consultarSimit(cedula);
  await admin.from("verificaciones_externas").insert({
    proceso_id: procesoId,
    cedula,
    proveedor: proveedor.nombre,
    fuente: "simit",
    estado: r.estado,
    valor: r.valor,
    resultado: r.estado === "pendiente" ? { trabajo_id: r.trabajoId ?? null } : (r.crudo ?? null),
    costo: r.costo ?? null,
    error: r.error ?? null,
    consultado_por: actor.userEmail,
  });

  if (r.estado === "pendiente") return { modo: "pendiente", mensaje: "Croma está consultando el SIMIT; el resultado llega en unos minutos." };
  if (r.estado === "error" || r.valor == null) return { modo: "error", mensaje: r.error ?? "La consulta del SIMIT falló." };
  await aplicarResultado(procesoId, r, proveedor.nombre, actor);
  return { modo: "consultado", estado: r.estado, valor: r.valor };
}

/**
 * Termina las consultas del SIMIT que quedaron como trabajo asíncrono de
 * Croma. Lo llama el cron de seguimiento cada 15 minutos. Las que pasan de
 * 24 horas sin resultado se dan por fallidas.
 */
export async function resolverSimitPendientes(limite = 20): Promise<{ revisadas: number; terminadas: number }> {
  const proveedor = proveedorSimit();
  if (!proveedor) return { revisadas: 0, terminadas: 0 };
  const admin = createAdminClient();
  const { data: filas, error } = await admin
    .from("verificaciones_externas")
    .select("id, proceso_id, resultado, created_at")
    .eq("fuente", "simit")
    .eq("estado", "pendiente")
    .order("created_at")
    .limit(limite);
  if (error || !filas?.length) return { revisadas: 0, terminadas: 0 };

  let terminadas = 0;
  for (const f of filas) {
    const trabajoId = (f.resultado as { trabajo_id?: string } | null)?.trabajo_id;
    const vencida = Date.now() - new Date(f.created_at as string).getTime() > 24 * 3_600_000;
    if (!trabajoId || vencida) {
      await admin
        .from("verificaciones_externas")
        .update({ estado: "error", error: trabajoId ? "Croma no terminó la consulta en 24 horas." : "Consulta pendiente sin id de trabajo." })
        .eq("id", f.id);
      terminadas++;
      continue;
    }
    const r = await proveedor.consultarTrabajoSimit(trabajoId);
    if (r.estado === "pendiente") continue;
    await admin
      .from("verificaciones_externas")
      .update({ estado: r.estado, valor: r.valor, resultado: r.crudo ?? null, error: r.error ?? null })
      .eq("id", f.id);
    terminadas++;
    if (f.proceso_id) await aplicarResultado(f.proceso_id as string, r, proveedor.nombre, ACTOR_SISTEMA);
  }
  return { revisadas: filas.length, terminadas };
}

// ── RUNT: licencia de conducción ───────────────────────────────────────────

export type ResultadoConsultaRunt =
  | { modo: "manual"; mensaje: string }
  | { modo: "consultado"; tieneLicencia: boolean }
  | { modo: "pendiente"; mensaje: string }
  | { modo: "error"; mensaje: string };

/**
 * Nombre de la persona según el RNMC (registro civil, validado con la fecha de
 * expedición): el que manda. null si no se ha consultado o la fecha no coincidió.
 */
async function nombreRegistroRnmc(procesoId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("verificaciones_externas")
    .select("resultado")
    .eq("proceso_id", procesoId)
    .eq("fuente", "rnmc")
    .eq("estado", "ok")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const r = (data?.resultado ?? null) as { found?: boolean; full_name?: string | null } | null;
  if (!r || r.found === false) return null;
  return interpretarRnmcCroma(r).resumen?.nombre ?? null;
}

/**
 * Lleva el RUNT al proceso: guarda el resumen, marca la licencia como
 * verificada (ya no lo hace una persona), deja las categorías del RUNT en la
 * ficha y recalcula el semáforo. Si el RUNT trae la cédula a nombre de otra
 * persona (no coincide con el RNMC), nada de ese registro se usa.
 */
async function aplicarRunt(
  procesoId: string,
  r: ResultadoRunt,
  proveedor: string,
  actor: ActorProceso,
  cedula: string,
  nombreRegistro?: string | null
): Promise<void> {
  if (r.estado !== "ok" || !r.resumen) return;
  const registro = nombreRegistro ?? r.resumen.nombreRegistro ?? (await nombreRegistroRnmc(procesoId));
  const resumen: ResumenRunt = { ...r.resumen, cedula: cedula.replace(/\D/g, ""), nombreRegistro: registro };
  if (registro && resumen.registrado !== false && resumen.nombre && !nombresCoinciden(resumen.nombre, registro)) {
    resumen.nombreNoCoincide = true;
  }
  const ajeno = resumen.nombreNoCoincide === true;
  // En la ficha, solo las categorías de licencias en firme: el RUNT trae también el historial (INACTIVA).
  const enFirme = resumen.categorias.filter((c) => c.activa);
  const categorias = ajeno ? [] : [...new Set((enFirme.length ? enFirme : resumen.categorias).map((c) => c.categoria))];
  const admin = createAdminClient();
  // El asistente ya no pregunta el nombre. Manda el del RNMC; el del RUNT solo
  // si no hay RNMC y el registro no es de otra persona. Los procesos que creó
  // Gestión Humana no se tocan.
  const { data: actual } = await admin.from("procesos_contratacion").select("origen, nombre, candidate_id").eq("id", procesoId).maybeSingle();
  const nombreNuevo =
    !registro && !ajeno && resumen.nombre && (actual?.origen === "whatsapp_agente" || actual?.origen === "chat_prueba") && actual.nombre !== resumen.nombre
      ? resumen.nombre
      : null;
  await admin
    .from("procesos_contratacion")
    .update({
      licencia_runt: resumen,
      // Si la cédula no aparece en el RUNT o el registro es de otra persona, la licencia no queda verificada.
      licencia_verificada_runt: resumen.registrado !== false && !ajeno,
      ...(categorias.length ? { licencia_categoria: categorias.join(", ") } : {}),
      ...(nombreNuevo ? { nombre: nombreNuevo } : {}),
    })
    .eq("id", procesoId);
  if (nombreNuevo && actual?.candidate_id) {
    await admin.from("candidates").update({ full_name: nombreNuevo }).eq("id", actual.candidate_id);
  }
  await registrarEvento(
    procesoId,
    {
      tipo: "dato",
      detalle: {
        runt: {
          registrado: resumen.registrado !== false,
          tiene_licencia: resumen.tieneLicencia,
          categorias: resumen.categorias,
          ...(resumen.restricciones?.length ? { restricciones: resumen.restricciones } : {}),
          ...(ajeno ? { nombre_no_coincide: true } : {}),
          ...(resumen.identidadVerificada ? { identidad_verificada: true } : {}),
        },
        ...(nombreNuevo ? { nombre: { anterior: actual?.nombre ?? null, nuevo: nombreNuevo, origen: "runt" } } : {}),
        proveedor,
      },
    },
    actor
  );
  await reevaluarPreseleccion(procesoId);
}

export async function consultarRuntProceso(
  procesoId: string,
  actor: ActorProceso,
  opciones: { nombreRegistro?: string | null } = {}
): Promise<ResultadoConsultaRunt> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("procesos_contratacion").select("id, cedula, autorizacion_datos").eq("id", procesoId).maybeSingle();
  if (!p) return { modo: "error", mensaje: "El proceso no existe." };
  if (p.autorizacion_datos !== "si") {
    return { modo: "error", mensaje: "El aspirante no ha autorizado el tratamiento de datos: no se puede consultar." };
  }
  const cedula = String(p.cedula ?? "").trim();
  if (!cedula) return { modo: "error", mensaje: "El proceso no tiene cédula." };

  const proveedor = proveedorRunt();
  if (!proveedor) {
    return { modo: "manual", mensaje: "No hay proveedor configurado (falta CROMA_API_KEY): verifique la licencia a mano en el RUNT." };
  }
  const { data: enCurso } = await admin
    .from("verificaciones_externas")
    .select("id")
    .eq("proceso_id", procesoId)
    .eq("fuente", "runt")
    .eq("estado", "pendiente")
    .limit(1)
    .maybeSingle();
  if (enCurso) return { modo: "pendiente", mensaje: "La consulta del RUNT sigue en curso en Croma; el resultado llega solo." };

  // Con el nombre del registro civil (RNMC) se consulta con su primer apellido.
  const nombreRegistro = opciones.nombreRegistro ?? (await nombreRegistroRnmc(procesoId));
  const { resultado: r, intentos } = await consultarRuntConIdentidad(proveedor, cedula, nombreRegistro);
  for (const i of intentos) {
    await admin.from("verificaciones_externas").insert({
      proceso_id: procesoId,
      cedula,
      proveedor: proveedor.nombre,
      fuente: "runt",
      estado: i.resultado.estado,
      valor: null,
      resultado: i.resultado.estado === "pendiente" ? { trabajo_id: i.resultado.trabajoId ?? null } : (i.resultado.crudo ?? null),
      error: i.resultado.error ?? null,
      consultado_por: actor.userEmail,
    });
  }

  if (r.estado === "pendiente") return { modo: "pendiente", mensaje: "Croma está consultando el RUNT; el resultado llega en unos minutos." };
  if (r.estado === "error" || !r.resumen) return { modo: "error", mensaje: r.error ?? "La consulta del RUNT falló." };
  await aplicarRunt(procesoId, r, proveedor.nombre, actor, cedula, nombreRegistro);
  return { modo: "consultado", tieneLicencia: r.resumen.tieneLicencia };
}

/** Termina las consultas del RUNT que quedaron como trabajo asíncrono (cron de seguimiento). */
export async function resolverRuntPendientes(limite = 20): Promise<{ revisadas: number; terminadas: number }> {
  const proveedor = proveedorRunt();
  if (!proveedor) return { revisadas: 0, terminadas: 0 };
  const admin = createAdminClient();
  const { data: filas, error } = await admin
    .from("verificaciones_externas")
    .select("id, proceso_id, cedula, resultado, created_at")
    .eq("fuente", "runt")
    .eq("estado", "pendiente")
    .order("created_at")
    .limit(limite);
  if (error || !filas?.length) return { revisadas: 0, terminadas: 0 };

  let terminadas = 0;
  for (const f of filas) {
    const trabajoId = (f.resultado as { trabajo_id?: string } | null)?.trabajo_id;
    const vencida = Date.now() - new Date(f.created_at as string).getTime() > 24 * 3_600_000;
    if (!trabajoId || vencida) {
      await admin
        .from("verificaciones_externas")
        .update({ estado: "error", error: trabajoId ? "Croma no terminó la consulta en 24 horas." : "Consulta pendiente sin id de trabajo." })
        .eq("id", f.id);
      terminadas++;
      continue;
    }
    const r = await proveedor.consultarTrabajoRunt(trabajoId);
    if (r.estado === "pendiente") continue;
    await admin.from("verificaciones_externas").update({ estado: r.estado, resultado: r.crudo ?? null, error: r.error ?? null }).eq("id", f.id);
    terminadas++;
    if (f.proceso_id) await aplicarRunt(f.proceso_id as string, r, proveedor.nombre, ACTOR_SISTEMA, String(f.cedula ?? ""));
  }
  return { revisadas: filas.length, terminadas };
}

// ── Policía: antecedentes judiciales y, si el RUNT no lo trae, el nombre ────

export type ResultadoConsultaPolicia =
  | { modo: "manual" | "omitida"; mensaje: string }
  | { modo: "consultado"; nombre: string | null }
  | { modo: "pendiente"; mensaje: string }
  | { modo: "error"; mensaje: string };

/**
 * Lleva la consulta de la Policía al proceso. El nombre solo se usa si el
 * RUNT no trajo uno y el proceso lo creó el asistente o el chat de prueba: si
 * la cédula quedó mal escrita, sería el nombre de otra persona, así que el
 * asistente nunca lo usa con el aspirante (solo queda en la ficha).
 */
async function aplicarPolicia(procesoId: string, r: ResultadoPolicia, proveedor: string, actor: ActorProceso): Promise<string | null> {
  if (r.estado !== "ok" || !r.resumen) return null;
  const admin = createAdminClient();
  const { data: p } = await admin.from("procesos_contratacion").select("origen, nombre, candidate_id, licencia_runt").eq("id", procesoId).maybeSingle();
  const runt = (p?.licencia_runt as ResumenRunt | null) ?? null;
  const runtNombre = runt && !runt.nombreNoCoincide ? (runt.nombre ?? null) : null;
  const nombre = r.resumen.nombre;
  const usar = nombre && !runtNombre && !(await nombreRegistroRnmc(procesoId)) && (p?.origen === "whatsapp_agente" || p?.origen === "chat_prueba") && p.nombre !== nombre ? nombre : null;
  if (usar) {
    await admin.from("procesos_contratacion").update({ nombre: usar }).eq("id", procesoId);
    if (p?.candidate_id) await admin.from("candidates").update({ full_name: usar }).eq("id", p.candidate_id);
  }
  await registrarEvento(
    procesoId,
    {
      tipo: "dato",
      detalle: {
        policia: { tiene_antecedentes: r.resumen.tieneAntecedentes, estado: r.resumen.estadoTexto },
        ...(usar ? { nombre: { anterior: p?.nombre ?? null, nuevo: usar, origen: "policia" } } : {}),
        proveedor,
      },
    },
    actor
  );
  return usar;
}

/**
 * Consulta la Policía para el proceso, una sola vez por cédula. Exige la
 * autorización (que incluye consultar antecedentes). El resultado de
 * antecedentes queda guardado para la entrega 3; hoy se usa por el nombre.
 */
export async function consultarPoliciaProceso(procesoId: string, actor: ActorProceso): Promise<ResultadoConsultaPolicia> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("procesos_contratacion").select("id, cedula, autorizacion_datos").eq("id", procesoId).maybeSingle();
  if (!p) return { modo: "error", mensaje: "El proceso no existe." };
  if (p.autorizacion_datos !== "si") return { modo: "error", mensaje: "El aspirante no ha autorizado el tratamiento de datos: no se puede consultar." };
  const cedula = String(p.cedula ?? "").replace(/\D/g, "");
  if (!cedula) return { modo: "error", mensaje: "El proceso no tiene cédula." };
  const proveedor = proveedorPolicia();
  if (!proveedor) return { modo: "manual", mensaje: "No hay proveedor configurado (falta CROMA_API_KEY)." };
  const { data: previa } = await admin
    .from("verificaciones_externas")
    .select("id")
    .eq("proceso_id", procesoId)
    .eq("fuente", "policia")
    .eq("cedula", cedula)
    .in("estado", ["ok", "pendiente"])
    .limit(1)
    .maybeSingle();
  if (previa) return { modo: "omitida", mensaje: "La Policía ya se consultó para esta cédula." };

  const r = await proveedor.consultarPolicia(cedula);
  await admin.from("verificaciones_externas").insert({
    proceso_id: procesoId,
    cedula,
    proveedor: proveedor.nombre,
    fuente: "policia",
    estado: r.estado,
    valor: null,
    resultado: r.estado === "pendiente" ? { trabajo_id: r.trabajoId ?? null } : (r.crudo ?? null),
    error: r.error ?? null,
    consultado_por: actor.userEmail,
  });
  if (r.estado === "pendiente") return { modo: "pendiente", mensaje: "Croma está consultando la Policía; el resultado llega en unos minutos." };
  if (r.estado === "error" || !r.resumen) return { modo: "error", mensaje: r.error ?? "La consulta de la Policía falló." };
  return { modo: "consultado", nombre: await aplicarPolicia(procesoId, r, proveedor.nombre, actor) };
}

/** Termina las consultas de la Policía que quedaron como trabajo asíncrono (cron de seguimiento). */
export async function resolverPoliciaPendientes(limite = 20): Promise<{ revisadas: number; terminadas: number }> {
  const proveedor = proveedorPolicia();
  if (!proveedor) return { revisadas: 0, terminadas: 0 };
  const admin = createAdminClient();
  const { data: filas, error } = await admin
    .from("verificaciones_externas")
    .select("id, proceso_id, resultado, created_at")
    .eq("fuente", "policia")
    .eq("estado", "pendiente")
    .order("created_at")
    .limit(limite);
  if (error || !filas?.length) return { revisadas: 0, terminadas: 0 };
  let terminadas = 0;
  for (const f of filas) {
    const trabajoId = (f.resultado as { trabajo_id?: string } | null)?.trabajo_id;
    const vencida = Date.now() - new Date(f.created_at as string).getTime() > 24 * 3_600_000;
    if (!trabajoId || vencida) {
      await admin
        .from("verificaciones_externas")
        .update({ estado: "error", error: trabajoId ? "Croma no terminó la consulta en 24 horas." : "Consulta pendiente sin id de trabajo." })
        .eq("id", f.id);
      terminadas++;
      continue;
    }
    const r = await proveedor.consultarTrabajoPolicia(trabajoId);
    if (r.estado === "pendiente") continue;
    await admin.from("verificaciones_externas").update({ estado: r.estado, resultado: r.crudo ?? null, error: r.error ?? null }).eq("id", f.id);
    terminadas++;
    if (f.proceso_id) await aplicarPolicia(f.proceso_id as string, r, proveedor.nombre, ACTOR_SISTEMA);
  }
  return { revisadas: filas.length, terminadas };
}

// ── RNMC: medidas correctivas (solo se guarda; las reglas llegan en la E3) ──

export type ResultadoConsultaRnmc =
  | { modo: "manual" | "omitida"; mensaje: string }
  | { modo: "consultado"; medidasPendientes: boolean | null; fechaCoincide: boolean }
  | { modo: "pendiente"; mensaje: string }
  | { modo: "error"; mensaje: string };

async function aplicarRnmc(procesoId: string, r: ResultadoRnmc, proveedor: string, actor: ActorProceso): Promise<void> {
  if (r.estado !== "ok" || !r.resumen) return;
  const admin = createAdminClient();
  const nombre = r.resumen.fechaCoincide ? r.resumen.nombre : null;
  let nombreNuevo: string | null = null;
  let runt: ResumenRunt | null = null;
  if (nombre) {
    // El nombre del registro civil manda (en los procesos del asistente y del chat de prueba).
    const { data: p } = await admin.from("procesos_contratacion").select("origen, nombre, candidate_id, licencia_runt").eq("id", procesoId).maybeSingle();
    runt = (p?.licencia_runt as ResumenRunt | null) ?? null;
    if ((p?.origen === "whatsapp_agente" || p?.origen === "chat_prueba") && p.nombre !== nombre) {
      nombreNuevo = nombre;
      await admin.from("procesos_contratacion").update({ nombre }).eq("id", procesoId);
      if (p.candidate_id) await admin.from("candidates").update({ full_name: nombre }).eq("id", p.candidate_id);
    }
  }
  await registrarEvento(
    procesoId,
    {
      tipo: "dato",
      detalle: {
        rnmc: {
          fecha_coincide: r.resumen.fechaCoincide,
          medidas_pendientes: r.resumen.medidasPendientes,
          cantidad: r.resumen.cantidad,
          estado: r.resumen.estadoTexto,
        },
        ...(nombreNuevo ? { nombre: { nuevo: nombreNuevo, origen: "rnmc" } } : {}),
        proveedor,
      },
    },
    actor
  );
  // El RUNT ya se había consultado sin el apellido: si el registro era de otra
  // persona o no apareció, se vuelve a consultar con el primer apellido.
  const revisar = runt && !runt.identidadVerificada && (runt.registrado === false || (runt.nombre && !nombresCoinciden(runt.nombre, nombre)));
  if (nombre && revisar) await consultarRuntProceso(procesoId, actor, { nombreRegistro: nombre });
}

/** Fecha de expedición guardada en el proceso; null si no hay o falta la migración 20261117214219. */
async function fechaExpedicionDe(procesoId: string): Promise<string | null> {
  const { data, error } = await createAdminClient().from("procesos_contratacion").select("cedula_fecha_expedicion").eq("id", procesoId).maybeSingle();
  if (error || !data) return null;
  return (data.cedula_fecha_expedicion as string | null)?.slice(0, 10) ?? null;
}

/**
 * Consulta el RNMC del proceso (Croma exige la fecha de expedición de la
 * cédula). Una sola vez por cédula y fecha: si el registro dijo que la fecha
 * no coincide, se vuelve a intentar solo cuando cambie la fecha.
 */
export async function consultarRnmcProceso(procesoId: string, actor: ActorProceso, fechaExpedicion?: string | null): Promise<ResultadoConsultaRnmc> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("procesos_contratacion").select("id, cedula, autorizacion_datos").eq("id", procesoId).maybeSingle();
  if (!p) return { modo: "error", mensaje: "El proceso no existe." };
  if (p.autorizacion_datos !== "si") return { modo: "error", mensaje: "El aspirante no ha autorizado el tratamiento de datos: no se puede consultar." };
  const cedula = String(p.cedula ?? "").replace(/\D/g, "");
  if (!cedula) return { modo: "error", mensaje: "El proceso no tiene cédula." };
  const fecha = fechaExpedicion ?? (await fechaExpedicionDe(procesoId));
  if (!fecha) return { modo: "omitida", mensaje: "Falta la fecha de expedición de la cédula." };
  const proveedor = proveedorRnmc();
  if (!proveedor) return { modo: "manual", mensaje: "No hay proveedor configurado (falta CROMA_API_KEY)." };

  const { data: previa } = await admin
    .from("verificaciones_externas")
    .select("estado, error")
    .eq("proceso_id", procesoId)
    .eq("fuente", "rnmc")
    .eq("cedula", cedula)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previa?.estado === "ok" || previa?.estado === "pendiente") return { modo: "omitida", mensaje: "El RNMC ya se consultó para esta cédula." };
  // La fecha va en el error de la consulta fallida: con la misma fecha no se repite.
  if (previa?.estado === "error" && String(previa.error ?? "").includes(fecha)) {
    return { modo: "omitida", mensaje: "El RNMC ya se intentó con esa fecha de expedición." };
  }

  const r = await proveedor.consultarRnmc(cedula, fecha);
  const noCoincide = r.estado === "ok" && r.resumen?.fechaCoincide === false;
  await admin.from("verificaciones_externas").insert({
    proceso_id: procesoId,
    cedula,
    proveedor: proveedor.nombre,
    fuente: "rnmc",
    // Fecha que no coincide: queda como error para poder reintentar con otra.
    estado: noCoincide ? "error" : r.estado,
    valor: r.resumen?.cantidad ?? null,
    resultado: r.estado === "pendiente" ? { trabajo_id: r.trabajoId ?? null } : (r.crudo ?? null),
    error: noCoincide
      ? `La fecha de expedición ${fecha} no coincide con la cédula según el RNMC.`
      : r.error
        ? `${r.error} (fecha de expedición ${fecha})`
        : null,
    consultado_por: actor.userEmail,
  });
  if (r.estado === "pendiente") return { modo: "pendiente", mensaje: "Croma está consultando el RNMC; el resultado llega en unos minutos." };
  if (r.estado === "error" || !r.resumen) return { modo: "error", mensaje: r.error ?? "La consulta del RNMC falló." };
  await aplicarRnmc(procesoId, r, proveedor.nombre, actor);
  return { modo: "consultado", medidasPendientes: r.resumen.medidasPendientes, fechaCoincide: r.resumen.fechaCoincide };
}

/** Termina las consultas del RNMC que quedaron como trabajo asíncrono (cron de seguimiento). */
export async function resolverRnmcPendientes(limite = 20): Promise<{ revisadas: number; terminadas: number }> {
  const proveedor = proveedorRnmc();
  if (!proveedor) return { revisadas: 0, terminadas: 0 };
  const admin = createAdminClient();
  const { data: filas, error } = await admin
    .from("verificaciones_externas")
    .select("id, proceso_id, resultado, created_at")
    .eq("fuente", "rnmc")
    .eq("estado", "pendiente")
    .order("created_at")
    .limit(limite);
  if (error || !filas?.length) return { revisadas: 0, terminadas: 0 };
  let terminadas = 0;
  for (const f of filas) {
    const trabajoId = (f.resultado as { trabajo_id?: string } | null)?.trabajo_id;
    const vencida = Date.now() - new Date(f.created_at as string).getTime() > 24 * 3_600_000;
    if (!trabajoId || vencida) {
      await admin
        .from("verificaciones_externas")
        .update({ estado: "error", error: trabajoId ? "Croma no terminó la consulta en 24 horas." : "Consulta pendiente sin id de trabajo." })
        .eq("id", f.id);
      terminadas++;
      continue;
    }
    const r = await proveedor.consultarTrabajoRnmc(trabajoId);
    if (r.estado === "pendiente") continue;
    const noCoincide = r.estado === "ok" && r.resumen?.fechaCoincide === false;
    await admin
      .from("verificaciones_externas")
      .update({
        estado: noCoincide ? "error" : r.estado,
        valor: r.resumen?.cantidad ?? null,
        resultado: r.crudo ?? null,
        error: noCoincide ? "La fecha de expedición no coincide con la cédula según el RNMC." : (r.error ?? null),
      })
      .eq("id", f.id);
    terminadas++;
    if (f.proceso_id) await aplicarRnmc(f.proceso_id as string, r, proveedor.nombre, ACTOR_SISTEMA);
  }
  return { revisadas: filas.length, terminadas };
}

// ── Antecedentes: Policía, Procuraduría, Contraloría y RNMC ────────────────

/** Procuraduría o Contraloría para el proceso, una sola vez por cédula. */
async function consultarFuenteAntecedentes(procesoId: string, cedula: string, fuente: FuenteAntecedenteCroma, actor: ActorProceso): Promise<void> {
  const proveedor = proveedorAntecedentes();
  if (!proveedor) return;
  const admin = createAdminClient();
  const { data: previa } = await admin
    .from("verificaciones_externas")
    .select("id")
    .eq("proceso_id", procesoId)
    .eq("fuente", fuente)
    .eq("cedula", cedula)
    .in("estado", ["ok", "pendiente"])
    .limit(1)
    .maybeSingle();
  if (previa) return;
  const r = await proveedor.consultar(fuente, cedula);
  await admin.from("verificaciones_externas").insert({
    proceso_id: procesoId,
    cedula,
    proveedor: proveedor.nombre,
    fuente,
    estado: r.estado,
    valor: null,
    resultado: r.estado === "pendiente" ? { trabajo_id: r.trabajoId ?? null } : (r.crudo ?? null),
    error: r.error ?? null,
    consultado_por: actor.userEmail,
  });
  if (r.estado === "ok") {
    await registrarEvento(procesoId, { tipo: "dato", detalle: { antecedente: { fuente, hallazgo: hallazgoDe(fuente, r.crudo) } } }, actor);
  }
}

/**
 * Consulta las cuatro fuentes de antecedentes (en paralelo; Policía y RNMC se
 * reutilizan si ya se consultaron en la preselección) y, si salen limpias,
 * deja el chat «Listo para citar». Exige la autorización de datos.
 */
export async function consultarAntecedentesProceso(procesoId: string, actor: ActorProceso): Promise<EvaluacionAntecedentes | null> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("procesos_contratacion").select("cedula, autorizacion_datos").eq("id", procesoId).maybeSingle();
  if (!p || p.autorizacion_datos !== "si") return null;
  const cedula = String(p.cedula ?? "").replace(/\D/g, "");
  if (!cedula || !proveedorAntecedentes()) return null;
  const nunca = (fuente: string) => (e: unknown) => console.error(`[seleccion] antecedentes ${fuente}:`, e);
  await Promise.all([
    consultarPoliciaProceso(procesoId, actor).catch(nunca("policía")),
    consultarFuenteAntecedentes(procesoId, cedula, "procuraduria", actor).catch(nunca("procuraduría")),
    consultarFuenteAntecedentes(procesoId, cedula, "contraloria", actor).catch(nunca("contraloría")),
    consultarRnmcProceso(procesoId, actor).catch(nunca("rnmc")),
  ]);
  const evaluacion = await evaluarAntecedentesProceso(procesoId);
  await marcarListoParaCitar(procesoId);
  await marcarRevisionAntecedentes(procesoId).catch((e) => console.error("[seleccion] revisión de antecedentes:", e));
  return evaluacion;
}

/** Termina las consultas de Procuraduría y Contraloría que quedaron en curso (cron) y revisa si ya queda listo para citar. */
export async function resolverAntecedentesPendientes(limite = 20): Promise<{ revisadas: number; terminadas: number }> {
  const proveedor = proveedorAntecedentes();
  if (!proveedor) return { revisadas: 0, terminadas: 0 };
  const admin = createAdminClient();
  const { data: filas, error } = await admin
    .from("verificaciones_externas")
    .select("id, proceso_id, fuente, resultado, created_at")
    .in("fuente", ["procuraduria", "contraloria"])
    .eq("estado", "pendiente")
    .order("created_at")
    .limit(limite);
  if (error || !filas?.length) return { revisadas: 0, terminadas: 0 };
  let terminadas = 0;
  const procesos = new Set<string>();
  for (const f of filas) {
    const trabajoId = (f.resultado as { trabajo_id?: string } | null)?.trabajo_id;
    const vencida = Date.now() - new Date(f.created_at as string).getTime() > 24 * 3_600_000;
    if (!trabajoId || vencida) {
      await admin
        .from("verificaciones_externas")
        .update({ estado: "error", error: trabajoId ? "Croma no terminó la consulta en 24 horas." : "Consulta pendiente sin id de trabajo." })
        .eq("id", f.id);
      terminadas++;
      continue;
    }
    const r = await proveedor.consultarTrabajo(trabajoId);
    if (r.estado === "pendiente") continue;
    await admin.from("verificaciones_externas").update({ estado: r.estado, resultado: r.crudo ?? null, error: r.error ?? null }).eq("id", f.id);
    terminadas++;
    if (f.proceso_id) {
      procesos.add(f.proceso_id as string);
      if (r.estado === "ok") {
        const fuente = f.fuente as FuenteAntecedenteCroma;
        await registrarEvento(f.proceso_id as string, { tipo: "dato", detalle: { antecedente: { fuente, hallazgo: hallazgoDe(fuente, r.crudo) } } }, ACTOR_SISTEMA);
      }
    }
  }
  for (const id of procesos) {
    await marcarListoParaCitar(id);
    await marcarRevisionAntecedentes(id).catch((e) => console.error("[seleccion] revisión de antecedentes:", e));
  }
  return { revisadas: filas.length, terminadas };
}

/**
 * Lanza los antecedentes de los procesos que ya están en «Antecedentes» con la
 * autorización y todavía no los tienen completos (cron). Así no dependen de
 * que el aspirante vuelva a escribir ni de que quepan en el tiempo del webhook.
 */
export async function lanzarAntecedentesPendientes(limite = 10): Promise<{ revisados: number }> {
  if (!proveedorAntecedentes()) return { revisados: 0 };
  const admin = createAdminClient();
  const desde = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();
  const { data: procesos } = await admin
    .from("procesos_contratacion")
    .select("id")
    .eq("estado", "antecedentes")
    .eq("autorizacion_datos", "si")
    // Solo los del asistente y del chat de prueba: los que lleva Gestión Humana a mano no se consultan solos.
    .in("origen", ["whatsapp_agente", "chat_prueba"])
    .gte("updated_at", desde)
    .order("updated_at", { ascending: false })
    .limit(50);
  let revisados = 0;
  for (const p of procesos ?? []) {
    if (revisados >= limite) break;
    const ev = await evaluarAntecedentesProceso(p.id as string);
    if (ev && ev.fuentes.every((f) => f.estado !== "sin_consultar" && f.estado !== "error")) {
      // Ya consultados: puede que ahora sí quede listo (por ejemplo, llegó la hoja de vida).
      await marcarListoParaCitar(p.id as string).catch(() => false);
      await marcarRevisionAntecedentes(p.id as string).catch(() => null);
      continue;
    }
    await consultarAntecedentesProceso(p.id as string, ACTOR_SISTEMA).catch((e) => console.error("[seleccion] antecedentes:", e));
    revisados++;
  }
  return { revisados };
}
