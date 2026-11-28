/**
 * Operaciones de servidor sobre los procesos de contratación que comparten la
 * pantalla (actions.ts, con sesión y permisos), el asistente de WhatsApp y las
 * tareas automáticas (sin sesión). Quien llama decide los permisos; aquí solo
 * se escribe con el cliente admin y se deja el rastro de quién hizo cada cambio
 * (NF6: historial con usuario, fecha y hora).
 */
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROCESO_ESTADOS } from "@/lib/contratacion/constants";
import { cerrarReferidoPorProceso, reabrirReferidoPorProceso, sincronizarConProceso } from "@/lib/padrino/servidor";
import { buscarFichaReal, notaDeRevision } from "@/lib/conductores/duplicados";

export interface ActorProceso {
  tipo: "usuario" | "agente" | "sistema";
  userId: string | null;
  userEmail: string | null;
}

export const ACTOR_AGENTE: ActorProceso = { tipo: "agente", userId: null, userEmail: "Agente IA" };
export const ACTOR_SISTEMA: ActorProceso = { tipo: "sistema", userId: null, userEmail: "Sistema" };

export function actorUsuario(perms: { userId: string | null; userEmail: string | null }): ActorProceso {
  return { tipo: "usuario", userId: perms.userId, userEmail: perms.userEmail };
}

export interface EventoProceso {
  /**
   * «cita» y «prueba» (profesor) llegan con la entrega 2 de selección;
   * «examen» lo usó la prueba psicotécnica propia (quitada el 24-nov-2026):
   * queda para leer el historial.
   */
  tipo: "creado" | "estado" | "preseleccion" | "autorizacion" | "dato" | "cita" | "prueba" | "examen" | "examen_medico" | "carpeta" | "recomendado" | "laboratorio";
  estadoAnterior?: string | null;
  estadoNuevo?: string | null;
  causa?: string | null;
  detalle?: Record<string, unknown> | null;
}

/** Escribe una línea del historial. Nunca impide la operación que la origina. */
export async function registrarEvento(procesoId: string, evento: EventoProceso, actor: ActorProceso): Promise<void> {
  const { error } = await createAdminClient()
    .from("procesos_contratacion_eventos")
    .insert({
      proceso_id: procesoId,
      tipo: evento.tipo,
      estado_anterior: evento.estadoAnterior ?? null,
      estado_nuevo: evento.estadoNuevo ?? null,
      causa: evento.causa ?? null,
      detalle: evento.detalle ?? null,
      actor: actor.tipo,
      user_id: actor.userId,
      usuario_email: actor.userEmail,
    });
  // Sin la migración 20261113205625 la tabla no existe: el proceso se guarda igual.
  if (error) console.error("[contratacion] no se pudo escribir el historial:", error.message);
}

/**
 * Todo proceso de contratación es un candidato: busca por cédula y, si no
 * existe, lo crea para que aparezca en el módulo de Candidatos.
 */
export async function asegurarCandidato(row: {
  cedula: string;
  nombre: string;
  celular: string | null;
  medio_postulacion: string | null;
}): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("candidates").select("id").eq("document_number", row.cedula).maybeSingle();
  if (data) return data.id;

  const { data: created, error } = await admin
    .from("candidates")
    .insert({
      full_name: row.nombre,
      document_number: row.cedula,
      phone: row.celular,
      source: row.medio_postulacion ?? "contratacion",
    })
    .select("id")
    .single();
  // La creación del candidato no debe bloquear el guardado del proceso.
  if (error) return null;
  return created.id;
}

/** El pipeline usa los estados del proceso; solo difieren estos dos. */
const ESTADO_TO_STAGE: Record<string, string> = {
  pendiente: "recibido",
  cierre: "rechazado",
};
const stageForEstado = (estado: string) => ESTADO_TO_STAGE[estado] ?? estado;

/**
 * Vincula el candidato a la vacante en el pipeline (idempotente) y
 * sincroniza la etapa con el estado del proceso.
 */
export async function vincularCandidatoVacante(candidateId: string | null, vacancyId: string | null, estado: string) {
  if (!candidateId || !vacancyId) return;
  const admin = createAdminClient();
  // El vínculo al pipeline no debe bloquear el guardado del proceso.
  await admin
    .from("candidate_vacancy")
    .upsert({ candidate_id: candidateId, vacancy_id: vacancyId }, { onConflict: "candidate_id,vacancy_id", ignoreDuplicates: true });
  await admin
    .from("candidate_vacancy")
    .update({ current_stage: stageForEstado(estado) })
    .eq("candidate_id", candidateId)
    .eq("vacancy_id", vacancyId);
}

/**
 * Alta automática al pasar a "contratado": si la vacante es de conducción
 * el candidato se crea como CONDUCTOR (rotación); si no, como EMPLEADO.
 * Nunca duplica (busca por cédula) y no bloquea el guardado del proceso:
 * GEMA completará/actualizará los datos del conductor/empleado en el
 * siguiente sync (upsert por cédula/código).
 */
export async function asegurarAltaContratado(p: {
  cedula: string;
  nombre: string;
  celular: string | null;
  licencia_categoria: string | null;
  fecha_contrato: string | null;
  vacancy_id: string | null;
  candidate_id?: string | null;
}) {
  try {
    const admin = createAdminClient();

    let vacTitle: string | null = null;
    let vacDepartment: string | null = null;
    if (p.vacancy_id) {
      const { data: vac } = await admin.from("vacancies").select("title, department_id").eq("id", p.vacancy_id).maybeSingle();
      vacTitle = vac?.title ?? null;
      vacDepartment = vac?.department_id ?? null;
    }
    const esConductor = (vacTitle ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .includes("conductor");

    const fechaIngreso = p.fecha_contrato || new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

    if (esConductor) {
      const { data: existente } = await admin.from("conductores").select("id, estado").eq("cedula", p.cedula).maybeSingle();
      if (existente) {
        // Reingreso: reactivar sin pisar el histórico que mantiene GEMA.
        if (existente.estado !== "ACTIVO") {
          await admin
            .from("conductores")
            .update({ estado: "ACTIVO", fecha_reingreso: fechaIngreso, fecha_retiro: null })
            .eq("id", existente.id);
        }
      } else {
        // La ficha es PROVISIONAL: queda en ACTIVO esperando que GEMA la
        // confirme en el siguiente sync. Si la cédula se digitó mal, GEMA nunca
        // la reconoce —el upsert es por cédula y el sync no borra filas— y la
        // ficha se queda en ACTIVO para siempre, como un conductor que no
        // existe. Había 18 así el 2026-10-19 (ver src/lib/conductores/confirmacion.ts).
        //
        // No se bloquea la contratación por esto: se deja escrito en la propia
        // ficha cuál parece ser la cédula correcta, que es lo que necesita
        // quien la revise. `npm run conductores:revisar-altas` las lista.
        const { data: conocidos } = await admin.from("conductores").select("cedula, nombre, estado, codigo").not("codigo", "is", null);
        const parecidos = buscarFichaReal(p.cedula, p.nombre, conocidos ?? []);
        const aviso = notaDeRevision(parecidos);
        if (aviso) {
          console.warn(`[contratacion] cedula ${p.cedula} sospechosa: ${aviso}`);
        }

        await admin.from("conductores").insert({
          cedula: p.cedula,
          nombre: p.nombre,
          celular: p.celular,
          licencia: p.licencia_categoria,
          fecha_ingreso: fechaIngreso,
          estado: "ACTIVO",
          // Nace SOLO INFORMATIVA: GEMA es el dueño del maestro y todavía no la
          // conoce. El sync la pasa a `false` cuando aparezca en la vista; si
          // nunca aparece, la cédula está mal y la ficha no es de nadie.
          solo_informativo: true,
          observacion: aviso
            ? `Creado automáticamente al contratar (módulo Candidatos). ${aviso}`
            : "Creado automáticamente al contratar (módulo Candidatos)",
        });
      }
    } else {
      const { data: existente } = await admin
        .from("employees")
        .select("id, status")
        .eq("document_number", p.cedula)
        .limit(1)
        .maybeSingle();
      if (existente) {
        if (existente.status === "retirado" || existente.status === "inactivo") {
          await admin.from("employees").update({ status: "activo", end_date: null }).eq("id", existente.id);
        }
      } else {
        await admin.from("employees").insert({
          full_name: p.nombre,
          document_number: p.cedula,
          phone: p.celular,
          position: vacTitle ?? "Por definir",
          department_id: vacDepartment,
          hire_date: fechaIngreso,
          status: "activo",
          candidate_id: p.candidate_id ?? null,
          observations: "Creado automáticamente al contratar (módulo Candidatos)",
        });
      }
    }
    revalidatePath(esConductor ? "/conductores" : "/empleados");
  } catch (e) {
    // El alta automática nunca debe impedir guardar el proceso.
    console.error("[contratacion] no se pudo crear el empleado/conductor:", e);
  }
}

/** Mensaje claro cuando la base rechaza un segundo proceso abierto con la misma cédula. */
export function errorDuplicado(error: { code?: string; message: string }, cedula: string): Error {
  if (error.code === "23505" && error.message.includes("uq_procesos_cedula_abierto")) {
    return new Error(`Ya hay un proceso abierto para la cédula ${cedula}. Ciérrelo o edítelo en lugar de crear otro.`);
  }
  return new Error(error.message);
}

/** Proceso abierto (ni contratado ni cerrado) con esa cédula, si existe. */
export async function procesoAbiertoPorCedula(cedula: string, excluirId?: string): Promise<{ id: string; estado: string } | null> {
  const limpia = cedula.trim();
  if (!limpia) return null;
  let q = createAdminClient()
    .from("procesos_contratacion")
    .select("id, estado")
    .eq("cedula", limpia)
    .not("estado", "in", "(contratado,cierre)")
    .order("created_at", { ascending: false })
    .limit(1);
  if (excluirId) q = q.neq("id", excluirId);
  const { data } = await q.maybeSingle();
  return data ? { id: data.id as string, estado: data.estado as string } : null;
}

const COLUMNAS_ALTA = "candidate_id, vacancy_id, nombre, cedula, celular, licencia_categoria, fecha_contrato";

/**
 * Cambia el estado del proceso y deja el evento en el historial. No hace nada
 * si el estado ya es ese. Al cerrar exige causa; al salir del cierre la borra.
 * Al contratar crea el conductor o empleado y sincroniza el Plan Padrino.
 */
export async function cambiarEstadoProceso(
  id: string,
  nuevo: string,
  opciones: {
    actor: ActorProceso;
    causa?: string | null;
    detalle?: Record<string, unknown>;
    /**
     * Contratar aunque falten condiciones (entrega 3). Quien llama ya revisó el
     * permiso `candidatos.contratar_con_excepcion`; la justificación queda en el historial.
     */
    excepcion?: { justificacion: string };
  }
): Promise<{ cambiado: boolean; anterior: string | null }> {
  if (!PROCESO_ESTADOS.some((e) => e.value === nuevo)) throw new Error("Estado inválido.");
  const causa = opciones.causa?.trim() || null;
  if (nuevo === "cierre" && !causa) throw new Error("Para cerrar el proceso hay que indicar la causa.");

  const admin = createAdminClient();
  const { data: actual, error: errLectura } = await admin
    .from("procesos_contratacion")
    .select("estado, observacion")
    .eq("id", id)
    .maybeSingle();
  if (errLectura) throw new Error(errLectura.message);
  if (!actual) throw new Error("El proceso no existe.");
  const anterior = (actual.estado as string) ?? null;
  if (anterior === nuevo) return { cambiado: false, anterior };

  // Condiciones para contratar (entrega 3, H2): aquí pasan la ficha, el tablero y
  // el formulario. Import diferido: el módulo de selección usa este.
  let detalle = opciones.detalle ?? null;
  // «Listo para contratar» (25-nov-2026) no se pone a mano si no cumple: entra solo
  // cuando cumple todo menos el visto bueno. Así vale desde la lista, el formulario y el tablero.
  if (nuevo === "listo_contratar" && !opciones.detalle?.automatico) {
    const { condicionesDeProceso } = await import("@/lib/seleccion/contratacion-servidor");
    const { listoParaContratar } = await import("@/lib/seleccion/contratacion");
    const c = await condicionesDeProceso(id);
    const { listo, faltan } = listoParaContratar(c.condiciones);
    if (c.exigir && !listo) throw new Error(`Todavía no está listo para contratar. Falta: ${faltan.join("; ")}. Pasa solo a esta etapa cuando lo cumpla.`);
  }
  if (nuevo === "contratado") {
    const { condicionesDeProceso } = await import("@/lib/seleccion/contratacion-servidor");
    const c = await condicionesDeProceso(id);
    if (c.exigir && !c.ok) {
      const justificacion = opciones.excepcion?.justificacion?.trim();
      if (!justificacion) {
        const { mensajeFaltan } = await import("@/lib/seleccion/contratacion");
        throw new Error(mensajeFaltan(c.faltan));
      }
      detalle = { ...(detalle ?? {}), contratado_con_excepcion: true, justificacion, faltaban: c.faltan };
    }
  }

  const patch: Record<string, unknown> = {
    estado: nuevo,
    causa_no_contrato: nuevo === "cierre" ? causa : null,
    updated_by: opciones.actor.userId,
  };
  // 27-nov-2026 (pedido de GH): al cerrar, el porqué queda también en la observación (se ve en la
  // lista de Candidatos y en el Excel), sin borrar lo que ya hubiera escrito.
  if (nuevo === "cierre" && causa) {
    const motivo = typeof opciones.detalle?.motivo === "string" ? opciones.detalle.motivo.trim() : "";
    const linea = observacionDeCierre(causa, motivo, new Date());
    const previa = String((actual as { observacion?: string | null }).observacion ?? "").trim();
    if (!previa.includes(linea)) patch.observacion = (previa ? `${previa}\n${linea}` : linea).slice(0, 2000);
  }
  let { data: proc, error } = await admin.from("procesos_contratacion").update(patch).eq("id", id).select(COLUMNAS_ALTA).single();
  // Sin la migración 20261113205625 no existe updated_by: reintenta sin ella.
  if (error && /updated_by/.test(error.message)) {
    delete patch.updated_by;
    ({ data: proc, error } = await admin.from("procesos_contratacion").update(patch).eq("id", id).select(COLUMNAS_ALTA).single());
  }
  if (error || !proc) throw new Error(error?.message ?? "No se pudo cambiar el estado.");

  await registrarEvento(
    id,
    { tipo: "estado", estadoAnterior: anterior, estadoNuevo: nuevo, causa: nuevo === "cierre" ? causa : null, detalle },
    opciones.actor
  );
  await vincularCandidatoVacante(proc.candidate_id, proc.vacancy_id, nuevo);
  // Cerrado o contratado: las citas que seguían en pie se cancelan, para que el
  // cron no le mande el recordatorio ni lo marque «No asistió». Si se reabre, se cita de nuevo.
  if (nuevo === "cierre" || nuevo === "contratado") {
    const { error: eCitas } = await admin
      .from("seleccion_citas")
      .update({ estado: "cancelada" })
      .eq("proceso_id", id)
      .in("estado", ["programada", "confirmada", "pide_otra_fecha"]);
    // Sin la migración de la entrega 2 la tabla no existe: no impide el cambio de estado.
    if (eCitas && !/seleccion_citas/.test(eCitas.message)) console.error("[contratacion] no se cancelaron las citas:", eCitas.message);
  }
  if (nuevo === "contratado") {
    await asegurarAltaContratado(proc);
    await sincronizarConProceso(id, opciones.actor);
  }
  // 27-nov-2026 (reunión con Salud Ocupacional): cerrar por «Desistimiento» a quien estaba en exámenes
  // (desde el tablero o la ficha) deja la fase como «desistió», con las observaciones como causa, para
  // que se vea en qué fase se quedó y cuente en Indicadores › Exámenes médicos. Si viene de «Desistió»
  // en el resultado del examen (detalle.fase), ya quedó registrado.
  if (nuevo === "cierre" && /^desist/i.test(causa ?? "") && (anterior === "en_examenes" || anterior === "en_examenes_fase2") && detalle?.fase == null) {
    const fase = anterior === "en_examenes" ? 1 : 2;
    const motivo = typeof detalle?.motivo === "string" ? detalle.motivo.trim() : "";
    const { data: previo } = await admin.from("seleccion_examenes").select("resultado").eq("proceso_id", id).eq("fase", fase).maybeSingle();
    if (!previo || previo.resultado === "pendiente" || previo.resultado === "aplazado") {
      const fila = {
        proceso_id: id,
        fase,
        fecha: new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10),
        resultado: "desistio",
        observacion: motivo || null,
        causa: motivo.slice(0, 200) || "Sin explicación",
        confirmado_por: opciones.actor.userEmail,
        confirmado_at: new Date().toISOString(),
      };
      const { error: eEx } = await admin.from("seleccion_examenes").upsert(fila, { onConflict: "proceso_id,fase" });
      // Sin la migración 20261128035646 no existe «desistio»: el cierre sigue igual.
      if (eEx) console.warn("[contratacion] desistimiento en exámenes sin registrar:", eEx.message);
      else await registrarEvento(id, { tipo: "examen_medico", detalle: { fase, resultado: "desistio", causa: fila.causa, desde: "cierre" } }, opciones.actor);
    }
  }
  // Plan Padrino (27-nov-2026): al cerrar, el referido pasa solo a «No contratado»; al reabrir, vuelve a validación.
  if (nuevo === "cierre") await cerrarReferidoPorProceso(id, causa, opciones.actor);
  else if (anterior === "cierre") await reabrirReferidoPorProceso(id, opciones.actor);
  return { cambiado: true, anterior };
}

/** La línea que el cierre deja en la observación (puro): «Cierre 27/11/2026: causa (motivo)». */
export function observacionDeCierre(causa: string, motivo: string | null | undefined, cuando: Date): string {
  const fecha = new Date(cuando.getTime() - 5 * 3_600_000).toISOString().slice(0, 10).split("-").reverse().join("/");
  const m = String(motivo ?? "").trim();
  return `Cierre ${fecha}: ${causa}${m && !m.includes(causa) ? ` (${m})` : ""}`;
}
