/**
 * Registro y decisiones del Plan Padrino sin la capa de permisos (27-nov-2026):
 * las acciones de actions.ts verifican el permiso y llaman a estas funciones,
 * y las baterías de prueba (scripts/padrino-probar-proceso.mts) las usan
 * directo. Solo servidor, sin "use server". Quien llama ya verificó los permisos.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaDe, hoyBogota, referidoVigente, validar } from "./datos";
import { bitacora, crearHitos, sincronizarConProceso } from "./servidor";
import {
  ESTADOS_DECISION, bloqueoPorRecomendado, esRegistroTardio, padrinoPuedeRegistrar, validarDecision,
  type DecisionEsquema, type Validacion,
} from "./reglas";

type Actor = { userId: string | null; userEmail: string | null };

/** Columnas del esquema que se guardan con la decisión (desde la v3). */
const columnasEsquema = (e: DecisionEsquema) => ({
  esquema: e.esquema,
  tipo_ingreso: e.tipoIngreso,
  meses_fuera: e.mesesFuera,
  sin_bonificacion_motivo: e.sinBonificacion,
});

/** Sin la migración de la v3 esas columnas no existen (PostgREST: PGRST204): se guarda sin ellas. */
const faltaColumna = (e: { code?: string; message?: string } | null) => Boolean(e && (e.code === "PGRST204" || /column/i.test(e.message ?? "")));

/** Lee el referido y bloquea al padrino sobre su propio registro. */
export async function leerReferido(id: string, cedulaUsuario: string | null) {
  const { data } = await createAdminClient().from("padrino_referidos").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("El referido no existe.");
  if (cedulaUsuario && data.cedula_padrino === cedulaUsuario) throw new Error("No puedes gestionar un registro en el que eres el padrino.");
  return data as {
    id: string; estado: string; esquema: "A" | "B" | "C"; proceso_id: string | null; cedula_padrino: string; cedula_referido: string;
    politica_id: string; fecha_ingreso: string | null; created_at: string; registrado_el?: string | null; nombre_referido: string | null;
    validacion: Validacion; experiencia_certificada: boolean; certificado_ruta: string | null; certificado_validado_at: string | null;
    anulado_at: string | null; created_by: string | null; hitos_bloqueados_motivo?: string | null;
  };
}


/** Registra al referido de un proceso con su padrino (RQ-01, RQ-02). Devuelve el id. */
export async function registrarReferidoNucleo(input: { procesoId: string; cedulaPadrino: string }, actor: Actor, propia: string | null): Promise<string> {
  const cedulaPadrino = input.cedulaPadrino.trim();
  if (!input.procesoId || !cedulaPadrino) throw new Error("Elija el proceso del referido y el padrino.");
  if (propia && cedulaPadrino === propia) throw new Error("No puedes registrarte como padrino.");
  const admin = createAdminClient();

  // El candidato dijo por WhatsApp que venía recomendado (queda «apadrinado»
  // hasta que aquí se le asigna el padrino): para el registro tardío (R13)
  // cuenta el día en que lo dijo, no el de hoy. Sin la migración
  // 20261121181420 la consulta falla y vale hoy, como siempre.
  const { data: rec } = await admin.from("procesos_contratacion").select("recomendado, recomendado_at, recomendado_por").eq("id", input.procesoId).maybeSingle();
  // Dijo que no venía recomendado: no se le pone padrino salvo que un administrador lo corrija.
  const dijoQueNo = bloqueoPorRecomendado((rec?.recomendado as boolean | null | undefined) ?? null);
  if (dijoQueNo) throw new Error(dijoQueNo);
  const hoy = hoyBogota();
  const dijo = rec?.recomendado === true ? fechaDe(rec.recomendado_at as string | null) : null;
  const registradoEl = dijo && dijo < hoy ? dijo : null;

  // Con la versión vigente hoy. Al contratar se reasigna la vigente en la
  // fecha de ingreso (servidor.ts, ajustarAlContratar).
  const { validacion, padrino, referido, politica, esquema } = await validar(input.procesoId, cedulaPadrino, admin, registradoEl ? { registradoEl } : {});
  if (referido.cedula === cedulaPadrino) throw new Error("El padrino y el referido no pueden ser la misma persona.");
  if (propia && referido.cedula === propia) throw new Error("No puedes registrar un referido con tu propia cédula.");
  const bloqueo = padrinoPuedeRegistrar(validacion.padrino);
  if (bloqueo) throw new Error(bloqueo);

  const previo = await referidoVigente(referido.cedula, admin);
  if (previo) {
    const cuando = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium" }).format(new Date(previo.created_at));
    throw new Error(`Este referido ya está registrado con el padrino ${previo.nombre_padrino ?? previo.cedula_padrino}, por ${previo.created_by_email ?? "otro usuario"} el ${cuando}.`);
  }

  if (!politica) throw new Error("No hay una versión de la política vigente hoy.");

  const esConductor = padrino.conductor?.estado === "ACTIVO";
  const fila = {
      politica_id: politica.id,
      candidate_id: referido.candidateId,
      proceso_id: input.procesoId,
      cedula_referido: referido.cedula,
      nombre_referido: referido.nombre,
      cedula_padrino: cedulaPadrino,
      nombre_padrino: esConductor ? padrino.conductor!.nombre : padrino.empleado?.nombre ?? padrino.conductor?.nombre ?? null,
      padrino_tipo: esConductor ? "conductor" : "empleado",
      padrino_cargo: esConductor ? padrino.conductor!.tipo : padrino.empleado?.cargo ?? null,
      estado: "en_validacion",
      validacion,
      validacion_at: new Date().toISOString(),
      created_by: actor.userId,
      created_by_email: actor.userEmail,
  };
  // El esquema según el tipo de referido (sin certificado validado todavía: B, o C si es reintegro).
  let { data, error } = await admin.from("padrino_referidos").insert({ ...fila, ...columnasEsquema(esquema), ...(registradoEl ? { registrado_el: registradoEl } : {}) }).select("id").single();
  // Sin la columna de la fecha de registro (migración 20261121181420): se guarda sin ella.
  if (registradoEl && faltaColumna(error)) ({ data, error } = await admin.from("padrino_referidos").insert({ ...fila, ...columnasEsquema(esquema) }).select("id").single());
  if (faltaColumna(error)) ({ data, error } = await admin.from("padrino_referidos").insert({ ...fila, esquema: esquema.esquema === "C" ? "B" : esquema.esquema }).select("id").single());
  if (error || !data) {
    if (error?.code === "23505") throw new Error("Este referido ya tiene un registro vigente.");
    throw new Error(error?.message ?? "No se pudo registrar el referido.");
  }
  await bitacora(data.id as string, "registro", { proceso_id: input.procesoId, cedula_padrino: cedulaPadrino, politica: politica.version, validacion, esquema: esquema.esquema, tipo_ingreso: esquema.tipoIngreso, sin_bonificacion: esquema.sinBonificacion, registro_tardio: esRegistroTardio(validacion), ...(rec?.recomendado === true ? { origen: "recomendado_en_chat", recomendado_el: dijo, recomendado_por: (rec.recomendado_por as string | null) ?? null } : {}) }, actor);
  return data.id as string;
}

/** Decide la elegibilidad (con excepción documentada si un requisito que bloquea no se cumple). */
export async function decidirElegibilidadNucleo(
  input: { id: string; decision: "elegible" | "no_elegible"; observacion: string; excepcion: boolean },
  actor: Actor,
  cedulaUsuario: string | null
): Promise<void> {
  const r = await leerReferido(input.id, cedulaUsuario);
  if (r.anulado_at || !ESTADOS_DECISION.includes(r.estado)) throw new Error("La elegibilidad de este referido ya se decidió.");
  if (!r.proceso_id && input.decision === "elegible") {
    throw new Error("Es un prerregistro: la elegibilidad se decide cuando Selección cree su proceso de contratación (se enlaza solo).");
  }
  // Con el proceso ya contratado, aprobar crea los hitos y congela el esquema:
  // un certificado adjunto sin validar dejaría al padrino en B ($200.000) sin remedio.
  if (input.decision === "elegible" && r.certificado_ruta && !r.certificado_validado_at) {
    throw new Error("Hay un certificado de experiencia sin validar. Valídelo o rechácelo antes de aprobar la elegibilidad: al contratar se crean los hitos y el esquema ya no cambia.");
  }
  const error = validarDecision(input.decision, r.validacion, input.excepcion, input.observacion);
  if (error) throw new Error(error);
  const excepcion = input.decision === "elegible" && input.excepcion;
  const { error: e } = await createAdminClient()
    .from("padrino_referidos")
    .update({
      estado: input.decision,
      elegibilidad_excepcion: excepcion,
      elegibilidad_observacion: input.observacion.trim() || null,
      elegibilidad_por_email: actor.userEmail,
      elegibilidad_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .in("estado", ESTADOS_DECISION);
  if (e) throw new Error(e.message);
  await bitacora(input.id, input.decision === "elegible" ? (excepcion ? "elegible_por_excepcion" : "elegible") : "no_elegible", { observacion: input.observacion.trim() || null }, actor);
  if (input.decision === "elegible" && r.proceso_id) await sincronizarConProceso(r.proceso_id, actor);
}

/**
 * Aprueba como excepción documentada los hitos que no se crearon al contratar
 * porque falló un requisito que bloquea (`hitos_bloqueados_motivo`): guarda
 * quién, cuándo y por qué, crea los hitos y lo deja en la bitácora.
 */
export async function aprobarHitosPorExcepcionNucleo(id: string, observacion: string, actor: Actor, cedulaUsuario: string | null): Promise<void> {
  const obs = observacion.trim();
  if (!obs) throw new Error("Escriba la observación: por qué se aprueban los hitos aunque no se cumpla el requisito.");
  if (obs.length > 2000) throw new Error("La observación no puede pasar de 2000 caracteres.");
  const r = await leerReferido(id, cedulaUsuario);
  if (r.anulado_at || r.estado !== "contratado") throw new Error("Solo se aprueban como excepción los hitos de un referido contratado.");
  const motivo = r.hitos_bloqueados_motivo ?? null;
  if (!motivo) throw new Error("Este referido no tiene hitos bloqueados.");
  const admin = createAdminClient();
  const { error } = await admin
    .from("padrino_referidos")
    .update({ hitos_bloqueados_motivo: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "contratado");
  if (error) throw new Error(error.message);
  await bitacora(id, "hitos_por_excepcion", { observacion: obs, motivo_bloqueo: motivo }, actor);
  await crearHitos(id, actor);
}
