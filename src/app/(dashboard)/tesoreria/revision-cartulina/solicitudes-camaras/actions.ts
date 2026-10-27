"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { hoyBogota } from "@/lib/operativo/constants";
import {
  fechaBogota, motivoNoPermitido, validarCobro, validarGestion, validarTexto,
  type AccionRecobro, type CobroInput, type GestionInput,
} from "@/lib/tesoreria/recobros-camaras";
import {
  getEventosSolicitud, mapGestion, mapRecobro, SELECT_GESTION, SELECT_RECOBRO,
  type EventoSolicitud, type GestionRecobro, type SolicitudRecobro,
} from "@/lib/tesoreria/recobros-camaras-data";

const RUTA = "/tesoreria/revision-cartulina";

type Resultado = { success: boolean; error?: string; solicitud?: SolicitudRecobro };

function revalidar() {
  revalidatePath(`${RUTA}/solicitudes-camaras`);
  revalidatePath(RUTA);
  revalidatePath("/tesoreria/devengados");
}

/**
 * Gestiones, cobro y solicitud de incobrable son de caja; autorizar, rechazar o reabrir el incobrable, de la directora
 * (recobros_incobrable). Todas exigen poder editar.
 */
async function assertPuede(sub: "caja" | "recobros_incobrable") {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", sub)) {
    throw new Error(
      sub === "caja"
        ? "Solo caja gestiona el cobro del recobro."
        : "Solo la directora de tesorería autoriza, rechaza o reabre el incobrable.",
    );
  }
  if (!perms.isAdmin && !perms.puedeEditar) throw new Error("Tu tipo de usuario es de solo consulta.");
  return perms;
}

async function leer(id: string): Promise<SolicitudRecobro> {
  const db = createAdminClient();
  const { data, error } = await db.from("tesoreria_camaras_solicitudes").select(SELECT_RECOBRO).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("La solicitud no existe.");
  return mapRecobro(data as unknown as Record<string, unknown>);
}

/** Lee la solicitud y comprueba que el rol pueda hacer la acción sobre ella. */
async function leerPara(id: string, accion: AccionRecobro, rol: { caja: boolean; autoriza: boolean }) {
  const sol = await leer(id);
  const no = motivoNoPermitido(accion, sol, rol);
  if (no) throw new Error(no);
  return sol;
}

async function evento(id: string, accion: string, antes: unknown, despues: unknown, email: string | null) {
  const db = createAdminClient();
  const { error } = await db.from("tesoreria_camaras_solicitudes_eventos").insert({
    solicitud_id: id, accion, antes, despues, usuario_email: email,
  });
  if (error) console.warn(`[recobros] evento ${accion} sin guardar: ${error.message}`);
}

const conductor = (s: SolicitudRecobro) => ({ cedulaConductor: s.conductorCedula, conductorNombre: s.conductorNombre });
const detalle = (s: SolicitudRecobro, extra: Record<string, unknown> = {}) => ({
  solicitud_id: s.id, fecha: s.fechaViaje, numero: s.numero, ...extra,
});

/**
 * Aplica un cambio a la solicitud solo si sigue como se leyó (la guarda evita
 * que dos personas decidan a la vez). Sin fila devuelta = otro llegó antes.
 */
interface Guarda {
  /** Columnas que deben estar vacías. */
  nulas?: string[];
  /** Columnas que deben tener valor. */
  conValor?: string[];
  /** Columnas con un valor exacto. */
  iguales?: Record<string, string>;
}

async function actualizar(id: string, cambios: Record<string, unknown>, guarda: Guarda): Promise<SolicitudRecobro> {
  const db = createAdminClient();
  let q = db.from("tesoreria_camaras_solicitudes").update(cambios).eq("id", id);
  for (const c of guarda.nulas ?? []) q = q.is(c, null);
  for (const c of guarda.conValor ?? []) q = q.not(c, "is", null);
  for (const [c, v] of Object.entries(guarda.iguales ?? {})) q = q.eq(c, v);
  const { data, error } = await q.select(SELECT_RECOBRO).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("La solicitud cambió mientras tanto. Recargue la página y revise su estado.");
  return mapRecobro(data as unknown as Record<string, unknown>);
}

const SIN_SOLICITUD_INCOBRABLE = {
  incobrable_motivo: null, incobrable_solicitado_por_email: null, incobrable_solicitado_at: null,
};

const fotoCobro = (s: SolicitudRecobro) => ({
  estado: s.cobroEstado, valor: s.cobroValor, fecha: s.cobroFecha, soporte: s.cobroSoporte, nota: s.cobroNota,
});

/**
 * Caja registra (o corrige) el cobro al conductor. Si había un incobrable
 * esperando autorización, el cobro lo deja sin efecto.
 */
export async function registrarCobroRecobro(id: string, input: CobroInput): Promise<Resultado> {
  try {
    const perms = await assertPuede("caja");
    const sol = await leerPara(id, "cobrar", { caja: true, autoriza: false });
    const v = validarCobro(input, { fechaViaje: sol.fechaViaje, hoy: hoyBogota() });
    if (!v.ok) throw new Error(v.error);
    const c = v.cobro;
    const corrige = sol.cobroEstado === "cobrado";

    const nueva = await actualizar(
      id,
      {
        cobro_estado: "cobrado",
        cobro_valor: c.valor,
        cobro_fecha: c.fecha,
        cobro_soporte: c.soporte,
        cobro_nota: c.nota,
        cobro_por_email: perms.userEmail,
        cobro_at: new Date().toISOString(),
        ...SIN_SOLICITUD_INCOBRABLE,
      },
      corrige ? { iguales: { cobro_estado: "cobrado" } } : { nulas: ["cobro_estado"] },
    );

    await evento(id, corrige ? "cobro_corregido" : "cobro_registrado", corrige ? fotoCobro(sol) : null,
      { estado: "cobrado", ...c, incobrable_pendiente_anulado: sol.incobrableSolicitadoAt != null || undefined }, perms.userEmail);
    await logTesoreriaAudit({
      accion: "recobro_camaras_cobro",
      modulo: "tesoreria",
      rol: perms.userType,
      ...conductor(sol),
      valor: c.valor,
      valorAnterior: corrige ? `Cobrado ${sol.cobroValor ?? ""}` : null,
      valorNuevo: `Cobrado · recibo ${c.soporte}`,
      detalle: detalle(sol, { corregido: corrige, gestiones: sol.gestionesN }),
    });
    revalidar();
    return { success: true, solicitud: nueva };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Caja registra una gestión sobre un recobro que no ha cobrado. Queda en el
 * histórico y el resumen de la solicitud (n.º, última y próxima fecha) se
 * recalcula desde las gestiones, para la alarma y los indicadores.
 */
export async function registrarGestionRecobro(
  id: string,
  input: GestionInput,
): Promise<Resultado & { gestion?: GestionRecobro }> {
  try {
    const perms = await assertPuede("caja");
    const sol = await leerPara(id, "gestion", { caja: true, autoriza: false });
    const hoy = hoyBogota();
    const v = validarGestion(input, { desde: sol.resueltoAt ? fechaBogota(sol.resueltoAt) : sol.fechaViaje, hoy });
    if (!v.ok) throw new Error(v.error);
    const g = v.gestion;

    const db = createAdminClient();
    const { data: ins, error: eIns } = await db
      .from("tesoreria_camaras_recobro_gestiones")
      .insert({ solicitud_id: id, fecha: g.fecha, gestion: g.gestion, proxima_fecha: g.proximaFecha, usuario_email: perms.userEmail })
      .select(SELECT_GESTION)
      .single();
    if (eIns) throw new Error(eIns.message);

    // La próxima fecha vigente es la de la gestión más reciente.
    const { data: todas, error: eTodas } = await db
      .from("tesoreria_camaras_recobro_gestiones")
      .select("fecha, proxima_fecha")
      .eq("solicitud_id", id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });
    if (eTodas) throw new Error(eTodas.message);
    const ultima = todas?.[0];
    const { data, error } = await db
      .from("tesoreria_camaras_solicitudes")
      .update({
        gestiones_n: todas?.length ?? 1,
        gestion_ultima_fecha: ultima?.fecha ?? g.fecha,
        gestion_proxima_fecha: ultima?.proxima_fecha ?? null,
      })
      .eq("id", id)
      .select(SELECT_RECOBRO)
      .single();
    if (error) throw new Error(error.message);

    await logTesoreriaAudit({
      accion: "recobro_camaras_gestion",
      modulo: "tesoreria",
      rol: perms.userType,
      ...conductor(sol),
      valorNuevo: `Gestión ${g.fecha}${g.proximaFecha ? ` · próxima ${g.proximaFecha}` : ""}`,
      detalle: detalle(sol, { gestion: g.gestion }),
    });
    revalidar();
    return {
      success: true,
      solicitud: mapRecobro(data as unknown as Record<string, unknown>),
      gestion: mapGestion(ins as Record<string, unknown>),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Caja pide dar el recobro por perdido; queda abierto hasta que la directora decida. */
export async function solicitarIncobrable(id: string, motivo: string): Promise<Resultado> {
  try {
    const perms = await assertPuede("caja");
    const sol = await leerPara(id, "solicitar_incobrable", { caja: true, autoriza: false });
    const v = validarTexto(motivo, "Indique por qué no se puede cobrar.");
    if (!v.ok) throw new Error(v.error);

    const nueva = await actualizar(
      id,
      {
        incobrable_motivo: v.texto,
        incobrable_solicitado_por_email: perms.userEmail,
        incobrable_solicitado_at: new Date().toISOString(),
        incobrable_rechazo_nota: null, incobrable_rechazado_por_email: null, incobrable_rechazado_at: null,
      },
      { nulas: ["cobro_estado", "incobrable_solicitado_at"] },
    );
    await evento(id, "incobrable_solicitado", null, { motivo: v.texto }, perms.userEmail);
    await logTesoreriaAudit({
      accion: "recobro_camaras_incobrable",
      modulo: "tesoreria",
      rol: perms.userType,
      ...conductor(sol),
      valorNuevo: `Incobrable solicitado · ${v.texto}`,
      detalle: detalle(sol),
    });
    revalidar();
    return { success: true, solicitud: nueva };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * La directora decide el incobrable. Autorizar cierra el recobro; rechazar
 * (con nota obligatoria) lo devuelve a seguimiento y la nota queda a la vista.
 */
export async function decidirIncobrable(
  id: string,
  decision: "autorizar" | "rechazar",
  nota: string | null,
): Promise<Resultado> {
  try {
    const perms = await assertPuede("recobros_incobrable");
    const sol = await leerPara(id, decision, { caja: false, autoriza: true });
    const ahora = new Date().toISOString();
    let notaLimpia: string | null = nota?.trim() || null;
    if (decision === "rechazar") {
      const v = validarTexto(nota, "Indique por qué rechaza el incobrable.");
      if (!v.ok) throw new Error(v.error);
      notaLimpia = v.texto;
    } else if (notaLimpia && notaLimpia.length > 500) {
      throw new Error("La nota no puede pasar de 500 caracteres.");
    }

    const nueva = await actualizar(
      id,
      decision === "autorizar"
        ? { cobro_estado: "incobrable", cobro_at: ahora, incobrable_autorizado_por_email: perms.userEmail, incobrable_autorizado_at: ahora }
        : {
            ...SIN_SOLICITUD_INCOBRABLE,
            incobrable_rechazo_nota: notaLimpia, incobrable_rechazado_por_email: perms.userEmail, incobrable_rechazado_at: ahora,
          },
      { nulas: ["cobro_estado"], conValor: ["incobrable_solicitado_at"] },
    );
    await evento(id, decision === "autorizar" ? "incobrable_autorizado" : "incobrable_rechazado",
      { motivo: sol.incobrableMotivo, solicitado_por: sol.incobrableSolicitadoPorEmail }, { nota: notaLimpia }, perms.userEmail);
    await logTesoreriaAudit({
      accion: "recobro_camaras_incobrable",
      modulo: "tesoreria",
      rol: perms.userType,
      ...conductor(sol),
      valorAnterior: `Solicitado · ${sol.incobrableMotivo ?? ""}`,
      valorNuevo: decision === "autorizar" ? "Incobrable autorizado" : `Incobrable rechazado · ${notaLimpia}`,
      detalle: detalle(sol, { nota: notaLimpia }),
    });
    revalidar();
    return { success: true, solicitud: nueva };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Solo la directora reabre un incobrable autorizado; vuelve a seguimiento de caja. */
export async function reabrirIncobrable(id: string, nota: string): Promise<Resultado> {
  try {
    const perms = await assertPuede("recobros_incobrable");
    const sol = await leerPara(id, "reabrir", { caja: false, autoriza: true });
    const v = validarTexto(nota, "Indique por qué reabre el recobro.");
    if (!v.ok) throw new Error(v.error);

    const nueva = await actualizar(
      id,
      {
        cobro_estado: null, cobro_at: null,
        ...SIN_SOLICITUD_INCOBRABLE,
        incobrable_autorizado_por_email: null, incobrable_autorizado_at: null,
      },
      { iguales: { cobro_estado: "incobrable" } },
    );
    await evento(id, "incobrable_reabierto",
      { motivo: sol.incobrableMotivo, autorizado_por: sol.incobrableAutorizadoPorEmail, autorizado_at: sol.incobrableAutorizadoAt },
      { nota: v.texto }, perms.userEmail);
    await logTesoreriaAudit({
      accion: "recobro_camaras_incobrable",
      modulo: "tesoreria",
      rol: perms.userType,
      ...conductor(sol),
      valorAnterior: "Incobrable",
      valorNuevo: `Reabierto · ${v.texto}`,
      detalle: detalle(sol),
    });
    revalidar();
    return { success: true, solicitud: nueva };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Historial de una solicitud, para quien puede ver la pestaña. */
export async function listarEventosSolicitud(id: string): Promise<{ success: boolean; error?: string; eventos?: EventoSolicitud[] }> {
  try {
    const perms = await getCurrentPermissions();
    if (!["cartulina", "caja", "recobros_incobrable"].some((sub) => canAccessSub(perms, "tesoreria", sub))) {
      throw new Error("No tienes acceso a las solicitudes a cámaras.");
    }
    return { success: true, eventos: await getEventosSolicitud(id) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
