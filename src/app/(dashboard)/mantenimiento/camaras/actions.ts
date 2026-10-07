"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { hoyBogota } from "@/lib/operativo/constants";
import {
  getRevisionesBusDia, getTiposNovedad, getViajesDelDia,
  type RevisionCamaras, type ViajeDespacho,
} from "@/lib/mantenimiento/camaras-data";
import {
  ELEMENTO_LABEL, type ConductorOrigen, type RevisionEntrada, validarRevision,
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
  if (editar && !perms.isAdmin && !perms.puedeEditar) throw new Error("Tu tipo de usuario es de solo consulta.");
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
