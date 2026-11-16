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
import { reevaluarPreseleccion } from "@/lib/seleccion/servidor";
import { proveedorRunt, proveedorSimit, type ResultadoRunt, type ResultadoSimit } from "./proveedores";

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
 * Lleva el RUNT al proceso: guarda el resumen, marca la licencia como
 * verificada (ya no lo hace una persona), deja las categorías del RUNT en la
 * ficha y recalcula el semáforo.
 */
async function aplicarRunt(procesoId: string, r: ResultadoRunt, proveedor: string, actor: ActorProceso, cedula: string): Promise<void> {
  if (r.estado !== "ok" || !r.resumen) return;
  const resumen = { ...r.resumen, cedula: cedula.replace(/\D/g, "") };
  // En la ficha, solo las categorías de licencias en firme: el RUNT trae también el historial (INACTIVA).
  const enFirme = resumen.categorias.filter((c) => c.activa);
  const categorias = [...new Set((enFirme.length ? enFirme : resumen.categorias).map((c) => c.categoria))];
  await createAdminClient()
    .from("procesos_contratacion")
    .update({
      licencia_runt: resumen,
      // Si la cédula no aparece en el RUNT, la licencia no queda verificada.
      licencia_verificada_runt: resumen.registrado !== false,
      ...(categorias.length ? { licencia_categoria: categorias.join(", ") } : {}),
    })
    .eq("id", procesoId);
  await registrarEvento(
    procesoId,
    { tipo: "dato", detalle: { runt: { registrado: resumen.registrado !== false, tiene_licencia: resumen.tieneLicencia, categorias: resumen.categorias }, proveedor } },
    actor
  );
  await reevaluarPreseleccion(procesoId);
}

export async function consultarRuntProceso(procesoId: string, actor: ActorProceso): Promise<ResultadoConsultaRunt> {
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

  const r = await proveedor.consultarRunt(cedula);
  await admin.from("verificaciones_externas").insert({
    proceso_id: procesoId,
    cedula,
    proveedor: proveedor.nombre,
    fuente: "runt",
    estado: r.estado,
    valor: null,
    resultado: r.estado === "pendiente" ? { trabajo_id: r.trabajoId ?? null } : (r.crudo ?? null),
    error: r.error ?? null,
    consultado_por: actor.userEmail,
  });

  if (r.estado === "pendiente") return { modo: "pendiente", mensaje: "Croma está consultando el RUNT; el resultado llega en unos minutos." };
  if (r.estado === "error" || !r.resumen) return { modo: "error", mensaje: r.error ?? "La consulta del RUNT falló." };
  await aplicarRunt(procesoId, r, proveedor.nombre, actor, cedula);
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
