"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { hoyBogota } from "@/lib/operativo/constants";
import {
  getRevisionesBusDia, getTiposNovedad, getViajesDelDia,
  type RevisionCamaras, type ViajeDespacho,
} from "@/lib/mantenimiento/camaras-data";
import {
  ELEMENTO_LABEL, ELEMENTOS, type ConductorOrigen, type Elemento, type RevisionEntrada, type TipoNovedad, validarRevision,
} from "@/lib/mantenimiento/camaras-reglas";
import { setSettingValue } from "@/lib/settings";
import { RESULTADO_REVISION_LABEL, validarResolucion, type ResultadoRevision } from "@/lib/tesoreria/recobros";
import {
  CLAVE_ABONOS_DESDE, enlazarRevisionDirecta, getDatosViajes, instantaneaRecobro,
} from "@/lib/tesoreria/recobros-solicitudes";
import { refrescarRecobrosDelDia, type RefrescoRecobros } from "@/lib/gema/recobros-al-dia";

const RUTA = "/mantenimiento/camaras";
/** Concepto de Mantenimiento con que una falla de cámara abre reporte de daño. */
const CONCEPTO_REPORTE = "ELECTRICO (Otros)";

/**
 * Permiso propio, como «Registrar daño»: al técnico de cámaras se le da solo
 * esta pantalla. La migración se lo concede también a quien tenía Mantenimiento.
 */
async function assertCamaras(editar: boolean) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "camaras") && !canAccess(perms, "mantenimiento")) {
    throw new Error("No tienes acceso al control de cámaras y sensores.");
  }
  if (editar && !puedeEditarEn(perms, "camaras", "mantenimiento")) throw new Error("Tu tipo de usuario es de solo consulta.");
  return perms;
}

/** Viajes del bus ese día en GEMA y lo que ya se revisó de ellos. */
export async function consultarViajes(fecha: string, codigo: string): Promise<{
  success: boolean;
  error?: string;
  viajes?: ViajeDespacho[];
  revisiones?: RevisionCamaras[];
}> {
  try {
    await assertCamaras(false);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{1,5}$/.test(codigo)) throw new Error("Fecha o vehículo no válidos.");
    const [viajes, revisiones] = await Promise.all([getViajesDelDia(fecha, codigo), getRevisionesBusDia(fecha, codigo)]);
    return { success: true, viajes, revisiones };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface RegistrarRevisionInput extends RevisionEntrada {
  /** historico_despacho.numero del viaje elegido de la lista; null si se digitó. */
  despachoNumero?: number | null;
  /** Cédula elegida a mano cuando el viaje no está en GEMA. */
  conductorCedula?: string | null;
  /** El técnico confirmó que ya había una revisión de ese viaje y elemento. */
  confirmarRepetida?: boolean;
  /** Abrir reporte de daño en Mantenimiento por la falla de cámara. */
  crearReporte?: boolean;
}

export async function registrarRevision(input: RegistrarRevisionInput): Promise<{
  success: boolean;
  error?: string;
  /** Ya hay revisión de ese viaje y elemento: la pantalla pide confirmar. */
  requiereConfirmar?: boolean;
  avisos?: string[];
}> {
  try {
    const perms = await assertCamaras(true);
    const hoy = hoyBogota();
    const tipos = await getTiposNovedad();
    const r = validarRevision(input, tipos, hoy);
    const db = createAdminClient();

    // El conductor sale del despacho de GEMA; lo que mande el navegador solo
    // dice qué viaje se eligió y se vuelve a leer aquí.
    let conductorCedula: string | null = null;
    let conductorNombre: string | null = null;
    let conductorOrigen: ConductorOrigen;
    let despachoNumero: number | null = null;
    if (input.despachoNumero != null) {
      const { data: viaje, error } = await db
        .from("historico_despacho")
        .select("numero, codigo, fecha_viaje, viaje, conductor, conductor_ced")
        .eq("numero", input.despachoNumero)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!viaje || String(viaje.codigo) !== r.vehiculoCodigo || viaje.fecha_viaje !== r.fechaViaje
        || String(viaje.viaje) !== r.viaje) {
        throw new Error("El viaje elegido no corresponde al vehículo y la fecha. Vuelva a elegirlo.");
      }
      despachoNumero = Number(viaje.numero);
      conductorCedula = viaje.conductor_ced;
      conductorNombre = viaje.conductor;
      conductorOrigen = "gema_viaje";
    } else {
      const cedula = String(input.conductorCedula ?? "").replace(/\D/g, "");
      if (!cedula) throw new Error("El viaje no está en GEMA: indique el conductor.");
      const { data: conductor, error } = await db
        .from("conductores").select("cedula, nombre").eq("cedula", cedula).maybeSingle();
      if (error) throw new Error(error.message);
      if (!conductor) throw new Error("El conductor no existe en Gestivo.");
      conductorCedula = conductor.cedula;
      conductorNombre = conductor.nombre;
      conductorOrigen = "formulario";
    }

    const { data: vehiculo, error: errVeh } = await db
      .from("vehiculos").select("codigo, placa").eq("codigo", r.vehiculoCodigo).maybeSingle();
    if (errVeh) throw new Error(errVeh.message);
    if (!vehiculo) throw new Error("El vehículo no existe en el maestro.");

    const { count: previas, error: errPrev } = await db
      .from("camaras_revisiones")
      .select("id", { count: "exact", head: true })
      .eq("fecha_viaje", r.fechaViaje)
      .eq("vehiculo_codigo", r.vehiculoCodigo)
      .eq("viaje", r.viaje)
      .eq("elemento", r.elemento)
      .is("eliminado_at", null);
    if (errPrev) throw new Error(errPrev.message);
    const repetida = (previas ?? 0) > 0;
    if (repetida && !input.confirmarRepetida) return { success: false, requiereConfirmar: true };

    const { data: revision, error: errRev } = await db.from("camaras_revisiones").insert({
      fecha_viaje: r.fechaViaje,
      fecha_revision: r.fechaRevision,
      vehiculo_codigo: r.vehiculoCodigo,
      viaje: r.viaje,
      despacho_numero: despachoNumero,
      conductor_cedula: conductorCedula,
      conductor_nombre: conductorNombre,
      conductor_origen: conductorOrigen,
      elemento: r.elemento,
      tipo_novedad: r.tipoNovedad,
      con_falla: r.conFalla,
      // El DFS Optocontrol ya no se diligencia: solo existe en el histórico del Forms.
      dfs_optocontrol: null,
      aforo: r.aforo,
      revision_repetida: repetida,
      observaciones: r.observaciones,
      tecnico_id: perms.userId,
      tecnico_email: perms.userEmail,
      origen: "formulario",
    }).select("id").single();
    if (errRev) throw new Error(errRev.message);

    const avisos = [...r.avisos];
    const tipo = tipos.find((t) => t.clave === r.tipoNovedad)!;

    // Un «Recobro» de cámara con conteo resuelve la solicitud de Tesorería de
    // ese viaje, o abre una para que llegue a caja.
    const avisoRecobro = await enlazarRevisionDirecta({
      id: revision.id,
      despachoNumero,
      fechaViaje: r.fechaViaje,
      vehiculoCodigo: r.vehiculoCodigo,
      viaje: r.viaje,
      conductorCedula,
      conductorNombre,
      tipoNovedad: r.tipoNovedad,
      aforo: r.aforo,
      observaciones: r.observaciones,
      tecnicoEmail: perms.userEmail,
    });
    if (avisoRecobro) avisos.push(avisoRecobro);
    if (input.crearReporte && r.conFalla) {
      // Si el reporte no entra, la revisión queda guardada y se avisa.
      const { data: concepto } = await db
        .from("mantenimiento_conceptos").select("id").eq("nombre", CONCEPTO_REPORTE).eq("activo", true).maybeSingle();
      if (!concepto) {
        avisos.push(`No se abrió el reporte de daño: el concepto ${CONCEPTO_REPORTE} no está activo.`);
      } else {
        const { data: rep, error } = await db.from("mantenimiento_reportes").insert({
          codigo_vehiculo: r.vehiculoCodigo,
          cedula_conductor: conductorCedula,
          concepto_id: concepto.id,
          descripcion: `${ELEMENTO_LABEL[r.elemento]}: ${tipo.nombre} (viaje ${r.viaje} del ${r.fechaViaje})`
            + (r.observaciones ? ` — ${r.observaciones}` : ""),
          fecha_reporte: new Date().toISOString(),
          created_by: perms.userId,
          created_by_email: perms.userEmail,
          origen_camaras_id: revision.id,
        }).select("id").single();
        if (error) {
          avisos.push(`No se abrió el reporte de daño: ${error.message}`);
        } else {
          await Promise.all([
            db.from("camaras_revisiones").update({ mantenimiento_reporte_id: rep.id }).eq("id", revision.id),
            db.from("mantenimiento_auditoria").insert({
              reporte_id: rep.id,
              accion: "reporte_creado",
              detalle: {
                codigo_vehiculo: r.vehiculoCodigo, placa: vehiculo.placa, cedula: conductorCedula,
                concepto: CONCEPTO_REPORTE, origen: "camaras", camaras_revision_id: revision.id,
              },
              user_id: perms.userId,
              user_email: perms.userEmail,
            }),
          ]);
        }
      }
    }

    await logTesoreriaAudit({
      accion: "camaras_revision_registrada",
      modulo: "mantenimiento",
      cedulaConductor: conductorCedula,
      conductorNombre,
      rol: perms.userType,
      valorNuevo: `${r.vehiculoCodigo} viaje ${r.viaje}: ${ELEMENTO_LABEL[r.elemento]} · ${tipo.nombre}`,
      detalle: {
        camaras_revision_id: revision.id,
        fecha_viaje: r.fechaViaje,
        fecha_revision: r.fechaRevision,
        vehiculo_codigo: r.vehiculoCodigo,
        viaje: r.viaje,
        elemento: r.elemento,
        tipo_novedad: r.tipoNovedad,
        aforo: r.aforo,
        repetida,
      },
    });

    revalidatePath(RUTA);
    if (avisoRecobro) revalidatePath(`${RUTA}/solicitudes`);
    if (input.crearReporte && r.conFalla) revalidatePath("/mantenimiento");
    return { success: true, avisos };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Eliminación lógica: la fila queda con la marca y sale de todas las vistas. */
export async function eliminarRevision(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertCamaras(true);
    const db = createAdminClient();
    const { data: fila, error } = await db
      .from("camaras_revisiones")
      .update({ eliminado_at: new Date().toISOString(), eliminado_por_email: perms.userEmail })
      .eq("id", id)
      .is("eliminado_at", null)
      .select("vehiculo_codigo, viaje, fecha_viaje, elemento, conductor_cedula, conductor_nombre")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!fila) throw new Error("La revisión no existe o ya estaba eliminada.");
    await logTesoreriaAudit({
      accion: "camaras_revision_eliminada",
      modulo: "mantenimiento",
      cedulaConductor: fila.conductor_cedula,
      conductorNombre: fila.conductor_nombre,
      rol: perms.userType,
      valorAnterior: `${fila.vehiculo_codigo} viaje ${fila.viaje} del ${fila.fecha_viaje} (${fila.elemento})`,
      detalle: { camaras_revision_id: id },
    });
    revalidatePath(RUTA);
    revalidatePath(`${RUTA}/historial`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Slug ASCII para la clave del concepto: minúsculas, sin tildes, con _ . */
function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export interface CrearTipoNovedadInput {
  elemento: Elemento;
  nombre: string;
  esFalla: boolean;
  exigeAforo: boolean;
}

/**
 * Crea un concepto (tipo de novedad) nuevo desde el formulario cuando el que el
 * técnico necesita no está en el catálogo. La clave se deriva del nombre; si
 * choca se le agrega un sufijo. Queda activo y de último en el orden de su
 * elemento. El DFS ya no se diligencia, así que `exige_dfs` siempre es false.
 */
export async function crearTipoNovedad(input: CrearTipoNovedadInput): Promise<{
  success: boolean;
  error?: string;
  tipo?: TipoNovedad;
}> {
  try {
    const perms = await assertCamaras(true);
    const elemento = input.elemento;
    if (!ELEMENTOS.includes(elemento)) throw new Error("Indique si el concepto es de cámara o de sensor.");
    const nombre = (input.nombre ?? "").trim().replace(/\s+/g, " ");
    if (nombre.length < 2) throw new Error("Escriba el nombre del concepto.");
    if (nombre.length > 60) throw new Error("El nombre no puede pasar de 60 caracteres.");
    const base = slug(nombre);
    if (!base) throw new Error("El nombre debe tener al menos una letra o número.");

    const db = createAdminClient();

    // No repetir un nombre que ya existe para ese elemento (ignora mayúsculas).
    const { data: existentes, error: eLee } = await db
      .from("camaras_tipos_novedad")
      .select("clave, nombre, orden")
      .eq("elemento", elemento);
    if (eLee) throw new Error(eLee.message);
    const filas = existentes ?? [];
    if (filas.some((t) => String(t.nombre).trim().toLowerCase() === nombre.toLowerCase())) {
      throw new Error(`Ya existe un concepto de ${ELEMENTO_LABEL[elemento].toLowerCase()} llamado «${nombre}».`);
    }

    // Clave única: base, y si choca con cualquier elemento, base_2, base_3…
    const { data: todasClaves, error: eClaves } = await db.from("camaras_tipos_novedad").select("clave");
    if (eClaves) throw new Error(eClaves.message);
    const usadas = new Set((todasClaves ?? []).map((t) => String(t.clave)));
    let clave = `${elemento}_${base}`;
    for (let i = 2; usadas.has(clave); i++) clave = `${elemento}_${base}_${i}`;

    const orden = Math.max(0, ...filas.map((t) => Number(t.orden) || 0)) + 10;

    const { data, error } = await db
      .from("camaras_tipos_novedad")
      .insert({
        clave,
        elemento,
        nombre,
        es_falla: !!input.esFalla,
        exige_dfs: false,
        exige_aforo: !!input.exigeAforo,
        activo: true,
        orden,
      })
      .select("clave, elemento, nombre, es_falla, exige_dfs, exige_aforo, activo, orden")
      .single();
    if (error) throw new Error(error.message);

    await logTesoreriaAudit({
      accion: "camaras_tipo_novedad_creado",
      modulo: "mantenimiento",
      rol: perms.userType,
      valorNuevo: `${ELEMENTO_LABEL[elemento]} · ${nombre}${input.esFalla ? " (falla)" : ""}`,
      detalle: { clave, elemento, nombre, es_falla: !!input.esFalla, exige_aforo: !!input.exigeAforo },
    });

    revalidatePath(RUTA);
    return { success: true, tipo: data as TipoNovedad };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Solicitudes de revisión (abonos de GEMA y Revisión cartulina → Cámaras) ──

/**
 * Tipo de novedad con que queda cada resultado en el historial de cámaras.
 * Con conteo se registra la cámara (el técnico vio el video); sin conteo,
 * el sensor, como se hacía antes.
 */
function tipoDeResultado(resultado: ResultadoRevision, conConteo: boolean): { preferido: string; respaldo: string } {
  if (resultado === "recobro") return { preferido: "camara_recobro", respaldo: "sensor_recobro" };
  if (resultado === "normalidad_timbradas") {
    return conConteo
      ? { preferido: "camara_normal", respaldo: "sensor_normalidad_timbradas" }
      : { preferido: "sensor_normalidad_timbradas", respaldo: "sensor_normalidad_timbradas" };
  }
  return { preferido: "sensor_recobro", respaldo: "sensor_recobro" };
}

const SELECT_SOL_ACCION =
  "id, fecha_viaje, numero, placa, viaje, vehiculo_codigo, conductor_cedula, conductor_nombre, estado, tipo, anulada_at, tomado_at";

async function eventoSolicitud(id: string, accion: string, despues: unknown, email: string | null) {
  const db = createAdminClient();
  const { error } = await db.from("tesoreria_camaras_solicitudes_eventos").insert({
    solicitud_id: id, accion, antes: null, despues, usuario_email: email,
  });
  if (error) console.warn(`[recobros] evento ${accion} sin guardar: ${error.message}`);
}

function revalidarSolicitudes() {
  revalidatePath(`${RUTA}/solicitudes`);
  revalidatePath("/tesoreria/revision-cartulina");
  revalidatePath("/tesoreria/revision-cartulina/solicitudes-camaras");
  revalidatePath("/tesoreria/devengados");
}

/** El técnico toma la revisión: desde aquí cuenta el día hábil de «En revisión». */
export async function tomarSolicitudCamaras(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertCamaras(true);
    const db = createAdminClient();
    const { data, error } = await db
      .from("tesoreria_camaras_solicitudes")
      .update({ tomado_at: new Date().toISOString(), tomado_por_email: perms.userEmail })
      .eq("id", id)
      .eq("tipo", "camara")
      .eq("estado", "pendiente")
      .is("tomado_at", null)
      .is("anulada_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("La solicitud ya fue tomada, resuelta o anulada. Recargue la página.");
    await eventoSolicitud(id, "revision_tomada", null, perms.userEmail);
    revalidarSolicitudes();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Resuelve una solicitud de revisión de cámara: Recobro (con el conteo del
 * video), Sin recobro o Sin conteo (decide subgerencia). La diferencia y el
 * valor los calcula Gestivo con las timbradas y el pasaje de GEMA, y quedan
 * fijos en la solicitud. Si el técnico ya había registrado ese conteo por el
 * formulario, se enlaza esa revisión en vez de crear otra.
 */
export async function resolverSolicitudCamaras(input: {
  id: string;
  resultado: ResultadoRevision;
  conteo?: number | null;
  nota?: string | null;
}): Promise<{ success: boolean; error?: string; avisos?: string[] }> {
  try {
    const perms = await assertCamaras(true);
    const db = createAdminClient();
    const { data: sol, error: eSol } = await db
      .from("tesoreria_camaras_solicitudes").select(SELECT_SOL_ACCION).eq("id", input.id).maybeSingle();
    if (eSol) throw new Error(eSol.message);
    if (!sol) throw new Error("La solicitud no existe.");
    if (sol.tipo !== "camara") throw new Error("Las revisiones de cartulina las resuelve la auxiliar de Tesorería.");
    if (sol.anulada_at) throw new Error("La solicitud fue anulada: GEMA anuló el abono.");
    if (sol.estado === "resuelto") throw new Error("Esa solicitud ya estaba resuelta. Para cambiarla, pida una corrección.");

    const numero = Number(sol.numero);
    const viaje = (await getDatosViajes([numero], db)).get(numero);
    const v = validarResolucion(input, { timbradas: viaje?.timbradas ?? null });
    if (!v.ok) throw new Error(v.error);

    const avisos: string[] = [];
    let revisionId: string | null = null;
    let conteoRevisionId: string | null = null;

    // ¿El técnico ya registró ese conteo por el formulario?
    if (v.conteo != null) {
      const { data: previa } = await db
        .from("camaras_revisiones")
        .select("id")
        .eq("despacho_numero", numero)
        .eq("elemento", "camara")
        .eq("aforo", v.conteo)
        .is("eliminado_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previa) revisionId = conteoRevisionId = previa.id;
    }

    const viajeStr = sol.viaje != null ? String(sol.viaje) : "";
    if (!revisionId && /^([1-9][0-9]?|C\.U)$/.test(viajeStr) && sol.vehiculo_codigo) {
      const tipos = await getTiposNovedad();
      const { preferido, respaldo } = tipoDeResultado(v.resultado, v.conteo != null);
      const tipo = tipos.find((t) => t.clave === preferido && t.activo !== false) ?? tipos.find((t) => t.clave === respaldo);
      if (!tipo) {
        avisos.push(`No se registró la revisión en el historial de cámaras: falta el tipo «${preferido}».`);
      } else {
        const { data: rev, error: eRev } = await db
          .from("camaras_revisiones")
          .insert({
            fecha_viaje: sol.fecha_viaje,
            fecha_revision: hoyBogota(),
            vehiculo_codigo: String(sol.vehiculo_codigo),
            viaje: viajeStr,
            despacho_numero: numero,
            conductor_cedula: sol.conductor_cedula,
            conductor_nombre: sol.conductor_nombre,
            conductor_origen: sol.conductor_cedula ? "gema_viaje" : "sin_cruce",
            elemento: tipo.elemento,
            tipo_novedad: tipo.clave,
            con_falla: tipo.es_falla,
            aforo: tipo.elemento === "camara" ? v.conteo : null,
            observaciones: v.nota,
            tecnico_id: perms.userId,
            tecnico_email: perms.userEmail,
            origen: "formulario",
          })
          .select("id")
          .single();
        if (eRev) {
          avisos.push(`No se registró la revisión en el historial de cámaras: ${eRev.message}`);
        } else {
          revisionId = rev.id;
          if (tipo.elemento === "camara") conteoRevisionId = rev.id;
          if (tipo.clave !== preferido) avisos.push(`La revisión quedó como «${tipo.nombre}»: el tipo «${preferido}» no existe.`);
        }
      }
    } else if (!revisionId) {
      avisos.push("La solicitud quedó resuelta sin registro en el historial de cámaras: el viaje o el bus no lo permiten.");
    }

    const snap = await instantaneaRecobro(numero, sol.fecha_viaje, v.resultado, v.conteo, db);
    const ahora = new Date().toISOString();
    const { data: upd, error: eUpd } = await db
      .from("tesoreria_camaras_solicitudes")
      .update({
        ...snap,
        estado: "resuelto",
        resultado: v.resultado,
        nota_camaras: v.nota,
        camaras_revision_id: revisionId,
        conteo_revision_id: conteoRevisionId,
        resuelto_por_email: perms.userEmail,
        resuelto_at: ahora,
        ...(sol.tomado_at ? {} : { tomado_at: ahora, tomado_por_email: perms.userEmail }),
      })
      .eq("id", input.id)
      .eq("estado", "pendiente")
      .is("anulada_at", null)
      .select("id");
    if (eUpd) throw new Error(eUpd.message);
    if (!upd?.length) throw new Error("La solicitud cambió mientras tanto. Recargue la página.");

    await eventoSolicitud(input.id, "revision_resuelta", { resultado: v.resultado, ...snap, camaras_revision_id: revisionId }, perms.userEmail);
    const label = RESULTADO_REVISION_LABEL[v.resultado];
    await logTesoreriaAudit({
      accion: "camaras_solicitud_resuelta",
      modulo: "mantenimiento",
      cedulaConductor: sol.conductor_cedula,
      conductorNombre: sol.conductor_nombre,
      rol: perms.userType,
      valorNuevo: `${sol.vehiculo_codigo ?? "—"} viaje ${sol.viaje ?? "—"} del ${sol.fecha_viaje}: ${label}`
        + (v.conteo != null ? ` · conteo ${v.conteo}, registradora ${snap.timbradas_registradora}` : ""),
      detalle: {
        solicitud_id: input.id, resultado: v.resultado, conteo: v.conteo, valor_recobro: snap.valor_recobro,
        camaras_revision_id: revisionId, despacho_numero: numero,
      },
    });

    revalidarSolicitudes();
    revalidatePath(RUTA);
    return { success: true, avisos };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * «Actualizar desde GEMA»: trae ya los abonos, el despacho y el recaudo de
 * hoy y ayer y abre las solicitudes de los abonos nuevos. Solo vuelve a traer
 * lo que ya es de GEMA, por eso basta con poder ver la pantalla.
 */
export async function actualizarSolicitudesDesdeGema(): Promise<{ ok: boolean; error?: string; refresco?: RefrescoRecobros }> {
  try {
    await assertCamaras(false);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const refresco = await refrescarRecobrosDelDia({ forzar: true });
  revalidarSolicitudes();
  return { ok: !refresco.error, error: refresco.error, refresco };
}

/**
 * Enciende (desde hoy) o apaga la apertura de solicitudes desde los abonos
 * «REVISIÓN CÁMARA» de GEMA. Solo administradores: decide cuándo arranca el
 * flujo, y los abonos anteriores no se cargan.
 */
export async function activarSolicitudesDesdeAbonos(activar: boolean): Promise<{ ok: boolean; error?: string; desde?: string | null }> {
  try {
    const perms = await getCurrentPermissions();
    if (!perms.isAdmin) throw new Error("Solo un administrador enciende o apaga las solicitudes desde abonos.");
    const desde = activar ? hoyBogota() : null;
    await setSettingValue(CLAVE_ABONOS_DESDE, desde ?? "", perms.userId ?? undefined);
    await logTesoreriaAudit({
      accion: "recobros_abonos_arranque",
      modulo: "mantenimiento",
      rol: perms.userType,
      valorNuevo: desde ? `Solicitudes desde abonos de GEMA activas desde ${desde}` : "Solicitudes desde abonos apagadas",
      detalle: { desde },
    });
    revalidarSolicitudes();
    return { ok: true, desde };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
