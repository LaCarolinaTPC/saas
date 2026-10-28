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

// ── Solicitudes de Tesorería (Revisión cartulina → Revisión de cámaras) ──────
const RESULTADOS_CAMARAS = {
  recobro: { tipo: "sensor_recobro", conFalla: true, label: "Recobro" },
  normalidad_timbradas: { tipo: "sensor_normalidad_timbradas", conFalla: false, label: "Normalidad de timbradas" },
} as const;

type ResultadoCamarasKey = keyof typeof RESULTADOS_CAMARAS;

/**
 * Resuelve una solicitud que envió la Revisión cartulina: registra la novedad
 * de cámaras (Recobro o Normalidad de timbradas) como una revisión de sensor y
 * marca la solicitud como resuelta. El resultado se ve de vuelta en cartulina.
 */
export async function resolverSolicitudCamaras(input: {
  id: string;
  resultado: ResultadoCamarasKey;
  nota?: string | null;
}): Promise<{ success: boolean; error?: string; avisos?: string[] }> {
  try {
    const perms = await assertCamaras(true);
    const def = RESULTADOS_CAMARAS[input.resultado];
    if (!def) throw new Error("Indique si es un recobro o la normalidad de timbradas.");
    const nota = input.nota?.trim() || null;
    if (nota && nota.length > 1000) throw new Error("La nota no puede pasar de 1000 caracteres.");

    const db = createAdminClient();
    const { data: sol, error: eSol } = await db
      .from("tesoreria_camaras_solicitudes")
      .select("id, fecha_viaje, numero, placa, viaje, vehiculo_codigo, conductor_cedula, conductor_nombre, estado")
      .eq("id", input.id)
      .maybeSingle();
    if (eSol) throw new Error(eSol.message);
    if (!sol) throw new Error("La solicitud no existe.");
    if (sol.estado === "resuelto") throw new Error("Esa solicitud ya estaba resuelta.");

    const avisos: string[] = [];
    let camarasRevisionId: string | null = null;

    // Se registra como revisión de sensor si el viaje es válido para el catálogo
    // de cámaras (1–99 o C.U). Si no, se resuelve igual y se avisa.
    const viajeStr = sol.viaje != null ? String(sol.viaje) : "";
    if (/^([1-9][0-9]?|C\.U)$/.test(viajeStr) && sol.vehiculo_codigo) {
      const { data: rev, error: eRev } = await db
        .from("camaras_revisiones")
        .insert({
          fecha_viaje: sol.fecha_viaje,
          fecha_revision: hoyBogota(),
          vehiculo_codigo: String(sol.vehiculo_codigo),
          viaje: viajeStr,
          despacho_numero: Number(sol.numero),
          conductor_cedula: sol.conductor_cedula,
          conductor_nombre: sol.conductor_nombre,
          conductor_origen: sol.conductor_cedula ? "gema_viaje" : "sin_cruce",
          elemento: "sensor",
          tipo_novedad: def.tipo,
          con_falla: def.conFalla,
          aforo: null,
          observaciones: nota,
          tecnico_id: perms.userId,
          tecnico_email: perms.userEmail,
          origen: "formulario",
        })
        .select("id")
        .single();
      if (eRev) avisos.push(`No se pudo registrar la revisión de cámaras: ${eRev.message}`);
      else camarasRevisionId = rev.id;
    } else {
      avisos.push("La solicitud quedó resuelta sin registro de cámaras: el viaje o el bus no permiten crear la revisión.");
    }

    const { error: eUpd } = await db
      .from("tesoreria_camaras_solicitudes")
      .update({
        estado: "resuelto",
        resultado: input.resultado,
        nota_camaras: nota,
        camaras_revision_id: camarasRevisionId,
        resuelto_por_email: perms.userEmail,
        resuelto_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("estado", "pendiente");
    if (eUpd) throw new Error(eUpd.message);

    await logTesoreriaAudit({
      accion: "camaras_solicitud_resuelta",
      modulo: "mantenimiento",
      cedulaConductor: sol.conductor_cedula,
      conductorNombre: sol.conductor_nombre,
      rol: perms.userType,
      valorNuevo: `${sol.vehiculo_codigo ?? "—"} viaje ${sol.viaje ?? "—"} del ${sol.fecha_viaje}: ${def.label}`,
      detalle: { solicitud_id: input.id, resultado: input.resultado, camaras_revision_id: camarasRevisionId, despacho_numero: Number(sol.numero) },
    });

    revalidatePath(`${RUTA}/solicitudes`);
    revalidatePath("/tesoreria/revision-cartulina");
    revalidatePath("/tesoreria/revision-cartulina/consolidado");
    return { success: true, avisos };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
