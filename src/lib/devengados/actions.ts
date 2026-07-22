"use server";

import { revalidatePath } from "next/cache";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccess, canAccessSub } from "@/lib/permissions";
import { setSettingValue } from "@/lib/settings";
import { nowBogotaISO } from "@/lib/utils";
import { quincenaDe } from "./engine";
import {
  getBloqueoActivo,
  getCajerosTesoreria,
  getEstadoConductor,
  getFechaOperativa,
  SETTING_BASE_DIARIA,
  SETTING_FECHA_OPERATIVA,
} from "./data";
import { getRequestMeta, logTesoreriaAudit } from "./audit";

/**
 * Verifica las credenciales de un administrador (autorización de segundo
 * pago) sin tocar la sesión del cajero: se valida contra Supabase Auth con
 * un cliente efímero y se confirma el tipo admin por profiles.user_type.
 */
async function verificarAdmin(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) {
    return { ok: false, error: "Ingresa el correo y la contraseña del administrador." };
  }
  const plain = createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data, error } = await plain.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });
  if (error || !data.user) {
    return { ok: false, error: "Credenciales de administrador inválidas." };
  }
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("user_type")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profile?.user_type !== "admin") {
    return { ok: false, error: "El usuario autorizante no es administrador." };
  }
  return { ok: true };
}

async function assertEditor(sub: string) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "tesoreria") || !perms.puedeEditar) {
    throw new Error("No tienes permisos para gestionar devengados.");
  }
  if (!canAccessSub(perms, "tesoreria", sub)) {
    throw new Error("Tu tipo de usuario no tiene habilitada esta función de Tesorería.");
  }
  return perms;
}

export interface RegistrarEntregaInput {
  cedula: string;
  valor: number;
  observacion: string | null;
  /**
   * Autorización de un administrador para el segundo pago del día
   * (política: un pago por conductor por día; máximo un segundo autorizado).
   */
  autorizacion?: {
    adminEmail: string;
    adminPassword: string;
    motivo: string;
  } | null;
}

export async function registrarEntrega(
  input: RegistrarEntregaInput
): Promise<{ success: boolean; error?: string; disponible?: number }> {
  try {
    const perms = await assertEditor("caja");

    const valor = Math.round(Number(input.valor) * 100) / 100;
    if (!Number.isFinite(valor) || valor <= 0) {
      return { success: false, error: "El valor a entregar debe ser mayor que cero." };
    }

    const cedula = input.cedula.replace(/\D/g, "");
    const supabase = createAdminClient();

    // Identidad del conductor resuelta en el servidor (auditoría T-07):
    // del cliente solo se acepta la cédula.
    const { data: conductor } = await supabase
      .from("conductores")
      .select("cedula, nombre, codigo")
      .eq("cedula", cedula)
      .maybeSingle();
    if (!conductor) {
      return { success: false, error: "Conductor no encontrado." };
    }

    // El día contable es la fecha operativa del módulo: el día real, salvo
    // que un administrador la haya fijado en un día cerrado (modo prueba).
    const { fecha } = await getFechaOperativa();

    // Recalcular en el servidor: la regla de oro no se confía al cliente.
    // Los viajes de soporte también salen del estado del servidor.
    const estado = await getEstadoConductor(cedula, fecha);
    if (estado.bloqueo) {
      return {
        success: false,
        error: `Conductor bloqueado por un administrador. Motivo: ${estado.bloqueo.motivo}`,
      };
    }
    if (valor > estado.resumen.disponible) {
      return {
        success: false,
        disponible: estado.resumen.disponible,
        error:
          estado.resumen.disponible <= 0
            ? "Entrega bloqueada: el acumulado de la quincena no ha cubierto la base exigida."
            : `El valor supera el excedente disponible ($${estado.resumen.disponible.toLocaleString("es-CO")}).`,
      };
    }

    // Política 1 pago/día: el segundo pago exige autorización de un
    // administrador (se registra quién autorizó, el motivo, fecha/hora y
    // el cajero que lo ejecutó). Nunca hay un tercer pago.
    const esSegundoPago = estado.pagosHoy >= 1;
    if (esSegundoPago) {
      if (estado.pagosHoy >= 2) {
        return {
          success: false,
          error: "El conductor ya tiene el máximo de pagos del día (pago + segundo pago autorizado).",
        };
      }
      const aut = input.autorizacion;
      if (!aut?.motivo?.trim()) {
        return {
          success: false,
          error: "segundo_pago_requiere_autorizacion",
        };
      }
      const admin = await verificarAdmin(aut.adminEmail, aut.adminPassword);
      if (!admin.ok) {
        await logTesoreriaAudit({
          accion: "segundo_pago_autorizado",
          cedulaConductor: cedula,
          conductorNombre: conductor.nombre,
          valor,
          resultado: "fallido",
          rol: perms.userType,
          detalle: { motivo: aut.motivo.trim(), error: admin.error },
        });
        return { success: false, error: admin.error };
      }
    }

    // Entrega + auditoría en UNA transacción serializada por conductor y
    // quincena (auditoría T-02/T-03): la función re-suma lo entregado bajo
    // lock y rechaza si supera el tope liberado, que solo depende de los
    // cierres GEMA (no de las entregas concurrentes).
    const { ip, equipo } = await getRequestMeta();
    const { error } = await supabase.rpc("registrar_entrega_devengado", {
      p_fecha: fecha,
      p_periodo: estado.quincena.periodo,
      p_quincena: estado.quincena.quincena,
      p_cedula: cedula,
      p_codigo: conductor.codigo,
      p_nombre: conductor.nombre,
      p_viajes: estado.viajesDia.map((v) => v.numero),
      p_valor: valor,
      p_observacion: input.observacion?.trim() || null,
      p_tope_liberado: estado.resumen.excedenteAcum,
      p_user_id: perms.userId,
      p_user_email: perms.userEmail,
      p_segundo_pago: esSegundoPago,
      p_autorizado_por: esSegundoPago
        ? input.autorizacion!.adminEmail.trim().toLowerCase()
        : null,
      p_autorizacion_motivo: esSegundoPago ? input.autorizacion!.motivo.trim() : null,
      p_ip: ip,
      p_equipo: equipo,
      p_rol: perms.userType,
    });
    if (error) {
      if (error.message.includes("supera_disponible")) {
        return {
          success: false,
          error: "Otra entrega simultánea agotó el disponible. Consulta el estado de nuevo.",
        };
      }
      if (error.message.includes("pago_duplicado")) {
        return { success: false, error: "segundo_pago_requiere_autorizacion" };
      }
      if (error.message.includes("limite_pagos_dia")) {
        return {
          success: false,
          error: "El conductor ya tiene el máximo de pagos del día (pago + segundo pago autorizado).",
        };
      }
      if (error.message.includes("conductor_bloqueado")) {
        return { success: false, error: "Conductor bloqueado por un administrador." };
      }
      throw error;
    }

    revalidatePath("/tesoreria/devengados");
    revalidatePath("/tesoreria/devengados/entregas");
    revalidatePath("/tesoreria/devengados/analisis");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface RegistrarEntregaExtemporaneaInput {
  cedula: string;
  /** Día contable de la entrega: un día YA CERRADO ('YYYY-MM-DD'). */
  fecha: string;
  valor: number;
  /** Perfil del cajero que realmente entregó el dinero (queda en su cuadre). */
  cajeroId: string;
  /** Por qué se registra fuera de tiempo (obligatorio, queda en auditoría). */
  motivo: string;
  observacion?: string | null;
}

/**
 * Entrega registrada A NOMBRE DE UN CAJERO por un administrador.
 *
 * Existe porque un cajero puede entregar el efectivo y no alcanzar a bajar el
 * pago en Gestivo: su cuadre de ese día queda con un faltante y el disponible
 * de la quincena sigue arrastrándose en los reportes de pago. Solo el
 * administrador puede hacerlo, acreditando al cajero que entregó el dinero y
 * dejando motivo.
 *
 * Admite el día EN CURSO y días ya cerrados. La entrega se marca
 * `extemporanea` solo cuando el día ya estaba cerrado; en ambos casos queda
 * como novedad, porque `registrada_por` (quien digitó) difiere de
 * `aprobada_por` (el cajero acreditado).
 *
 * El tope se recalcula en el servidor con el corte DEL DÍA de la entrega:
 * reproduce lo que habría pasado si el cajero baja el pago ese mismo día. Si
 * un día posterior de la quincena entró en déficit, la quincena puede quedar
 * sobre-entregada — la plata ya salió de la caja, así que se registra y se
 * informa el monto en lugar de rechazar la corrección.
 */
export async function registrarEntregaExtemporanea(
  input: RegistrarEntregaExtemporaneaInput
): Promise<{
  success: boolean;
  error?: string;
  disponible?: number;
  /** Sobre-entrega de la quincena al corte de hoy (0 si no la hay). */
  sobreEntrega?: number;
}> {
  try {
    const perms = await getCurrentPermissions();
    if (!perms.isAdmin) {
      return {
        success: false,
        error: "Solo un administrador puede registrar una entrega a nombre de un cajero.",
      };
    }

    const motivo = input.motivo?.trim() ?? "";
    if (!motivo) {
      return { success: false, error: "El motivo del registro extemporáneo es obligatorio." };
    }

    const valor = Math.round(Number(input.valor) * 100) / 100;
    if (!Number.isFinite(valor) || valor <= 0) {
      return { success: false, error: "El valor a entregar debe ser mayor que cero." };
    }

    const fecha = input.fecha;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return { success: false, error: "Fecha inválida (formato YYYY-MM-DD)." };
    }
    // Se admite el día en curso (el cajero entregó y no alcanzó a digitarlo) y
    // cualquier día cerrado hacia atrás. El futuro no es un día contable.
    const { hoyReal } = await getFechaOperativa();
    if (fecha > hoyReal) {
      return {
        success: false,
        error: "No se puede registrar una entrega con fecha futura.",
      };
    }

    // El cajero acreditado debe ser un usuario con acceso a Tesorería.
    const cajeros = await getCajerosTesoreria();
    const cajero = cajeros.find((c) => c.id === input.cajeroId);
    if (!cajero) {
      return { success: false, error: "Selecciona el cajero que entregó el dinero." };
    }

    const cedula = input.cedula.replace(/\D/g, "");
    const supabase = createAdminClient();
    const { data: conductor } = await supabase
      .from("conductores")
      .select("cedula, nombre, codigo")
      .eq("cedula", cedula)
      .maybeSingle();
    if (!conductor) {
      return { success: false, error: "Conductor no encontrado." };
    }

    // Estado con el corte del día de la entrega: es lo que era pagable ese
    // día. El bloqueo manual se informa aquí para que el administrador lo
    // retire de forma explícita (nunca se salta en silencio).
    const estadoFecha = await getEstadoConductor(cedula, fecha);
    if (estadoFecha.bloqueo) {
      return {
        success: false,
        error: `El conductor tiene un bloqueo activo (${estadoFecha.bloqueo.motivo}). Retíralo en Parámetros para registrar la entrega.`,
      };
    }
    if (estadoFecha.pagosHoy >= 2) {
      return {
        success: false,
        error: `El conductor ya tiene el máximo de pagos registrados el ${fecha}.`,
      };
    }

    // Tope del día: el excedente liberado al corte de la fecha de la entrega,
    // menos lo ya entregado hasta esa misma fecha.
    const tope = estadoFecha.resumen.excedenteAcum;
    const disponible = estadoFecha.resumen.disponible;
    if (valor > disponible) {
      return {
        success: false,
        disponible,
        error:
          disponible <= 0
            ? `Sin excedente disponible al ${fecha}: la quincena no cubrió la base exigida o ya está entregado.`
            : `El valor supera el excedente que estaba liberado el ${fecha} ($${disponible.toLocaleString("es-CO")}).`,
      };
    }

    // Cuánto queda sobre-entregada la quincena al corte de hoy por registrar
    // tarde (un día posterior en déficit pudo reducir el excedente acumulado).
    // No bloquea: el efectivo ya salió. Se informa y queda en auditoría.
    const corteVigente = estadoFecha.quincena.fin < hoyReal ? estadoFecha.quincena.fin : hoyReal;
    const estadoCorte =
      corteVigente === fecha ? estadoFecha : await getEstadoConductor(cedula, corteVigente);
    const sobreEntrega = Math.max(
      0,
      Math.round(
        (estadoCorte.resumen.entregado + valor - estadoCorte.resumen.excedenteAcum) * 100
      ) / 100
    );

    const esSegundoPago = estadoFecha.pagosHoy >= 1;
    const { ip, equipo } = await getRequestMeta();
    const { error } = await supabase.rpc("registrar_entrega_extemporanea", {
      p_fecha: fecha,
      p_periodo: estadoFecha.quincena.periodo,
      p_quincena: estadoFecha.quincena.quincena,
      p_cedula: cedula,
      p_codigo: conductor.codigo,
      p_nombre: conductor.nombre,
      p_valor: valor,
      p_observacion: input.observacion?.trim() || null,
      p_tope_liberado: tope,
      p_cajero_id: cajero.id,
      p_motivo: motivo,
      p_registrada_por: perms.userId,
      p_registrada_por_email: perms.userEmail,
      p_segundo_pago: esSegundoPago,
      p_ip: ip,
      p_equipo: equipo,
      p_rol: perms.userType,
      p_sobre_entrega: sobreEntrega,
    });
    if (error) {
      if (error.message.includes("supera_disponible")) {
        return {
          success: false,
          error: "Otra entrega simultánea agotó el disponible. Consulta el estado de nuevo.",
        };
      }
      if (error.message.includes("limite_pagos_dia") || error.message.includes("pago_duplicado")) {
        return {
          success: false,
          error: `El conductor ya tiene el máximo de pagos registrados el ${fecha}.`,
        };
      }
      if (error.message.includes("conductor_bloqueado")) {
        return { success: false, error: "Conductor bloqueado por un administrador." };
      }
      if (error.message.includes("fecha_futura")) {
        return {
          success: false,
          error: "No se puede registrar una entrega con fecha futura.",
        };
      }
      // La migración 040 aún no está aplicada: la función sigue rechazando el
      // día en curso.
      if (error.message.includes("fecha_no_cerrada")) {
        return {
          success: false,
          error:
            "El registro del día en curso requiere la migración 040 (pendiente de aplicar en la base).",
        };
      }
      throw error;
    }

    revalidatePath("/tesoreria/devengados");
    revalidatePath("/tesoreria/devengados/entregas");
    revalidatePath("/tesoreria/devengados/analisis");
    return { success: true, sobreEntrega };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Marca/desmarca una entrega como trasladada manualmente a GEMA. */
export async function marcarTrasladada(
  id: string,
  trasladada: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertEditor("entregas");
    const supabase = createAdminClient();
    const { data: row, error } = await supabase
      .from("devengados_entregas")
      .update({
        trasladada_gema: trasladada,
        trasladada_at: trasladada ? new Date().toISOString() : null,
        trasladada_por: trasladada ? perms.userId : null,
      })
      .eq("id", id)
      .select("cedula_conductor, conductor_nombre, valor_entregado, fecha")
      .single();
    if (error) throw error;

    await logTesoreriaAudit({
      accion: "traslado_gema",
      cedulaConductor: row?.cedula_conductor,
      conductorNombre: row?.conductor_nombre,
      valor: row?.valor_entregado,
      detalle: { entregaId: id, trasladada, fechaEntrega: row?.fecha },
    });

    revalidatePath("/tesoreria/devengados/entregas");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Fija o libera la fecha operativa del módulo (app_settings). Solo el
 * administrador puede moverla: con null vuelve al día real de Bogotá.
 */
export async function guardarFechaOperativa(
  fecha: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await getCurrentPermissions();
    if (!perms.isAdmin) {
      return { success: false, error: "Solo el administrador puede mover la fecha operativa." };
    }
    const hoyReal = nowBogotaISO().slice(0, 10);
    if (fecha !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return { success: false, error: "Fecha inválida (formato YYYY-MM-DD)." };
      }
      if (fecha > hoyReal) {
        return { success: false, error: "La fecha operativa no puede ser futura." };
      }
    }
    await setSettingValue(SETTING_FECHA_OPERATIVA, fecha ?? "", perms.userId ?? undefined);
    await logTesoreriaAudit({
      accion: "fecha_operativa",
      detalle: { fecha: fecha ?? "automatica (día real)" },
    });
    revalidatePath("/tesoreria/devengados");
    revalidatePath("/tesoreria/devengados/entregas");
    revalidatePath("/tesoreria/devengados/analisis");
    revalidatePath("/tesoreria/devengados/parametros");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Actualiza la base diaria parametrizada (app_settings). */
export async function guardarBaseDiaria(
  valor: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertEditor("parametros");
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0) {
      return { success: false, error: "La base diaria debe ser un valor mayor que cero." };
    }
    await setSettingValue(SETTING_BASE_DIARIA, String(Math.round(n)), perms.userId ?? undefined);
    await logTesoreriaAudit({
      accion: "base_diaria",
      valor: Math.round(n),
    });
    revalidatePath("/tesoreria/devengados");
    revalidatePath("/tesoreria/devengados/parametros");
    revalidatePath("/tesoreria/devengados/analisis");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Devolución TOTAL de una entrega: cualquier cajero puede hacerla, con
 * motivo obligatorio. Genera automáticamente el reverso contable (crédito)
 * del movimiento original y libera de nuevo el cupo de la quincena.
 */
export async function registrarDevolucion(
  entregaId: string,
  motivo: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertEditor("entregas");
    if (!motivo.trim()) {
      return { success: false, error: "El motivo de la devolución es obligatorio." };
    }
    const { fecha } = await getFechaOperativa();
    const q = quincenaDe(fecha);
    const { ip, equipo } = await getRequestMeta();
    const supabase = createAdminClient();
    const { error } = await supabase.rpc("registrar_devolucion_devengado", {
      p_entrega_id: entregaId,
      p_fecha: fecha,
      p_periodo: q.periodo,
      p_quincena: q.quincena,
      p_motivo: motivo.trim(),
      p_user_id: perms.userId,
      p_user_email: perms.userEmail,
      p_ip: ip,
      p_equipo: equipo,
      p_rol: perms.userType,
    });
    if (error) {
      if (error.message.includes("entrega_no_reversible")) {
        return { success: false, error: "La entrega ya fue devuelta o es un reverso." };
      }
      if (error.message.includes("entrega_no_encontrada")) {
        return { success: false, error: "Entrega no encontrada." };
      }
      throw error;
    }
    revalidatePath("/tesoreria/devengados");
    revalidatePath("/tesoreria/devengados/entregas");
    revalidatePath("/tesoreria/devengados/analisis");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Bloqueo manual de un conductor (solo administradores): impide nuevos
 * pagos hasta que un administrador lo retire. El cajero ve el motivo.
 */
export async function bloquearConductor(
  cedula: string,
  motivo: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await getCurrentPermissions();
    if (!perms.isAdmin) {
      return { success: false, error: "Solo un administrador puede bloquear conductores." };
    }
    if (!motivo.trim()) {
      return { success: false, error: "El motivo del bloqueo es obligatorio." };
    }
    const ced = cedula.replace(/\D/g, "");
    const supabase = createAdminClient();
    const { data: conductor } = await supabase
      .from("conductores")
      .select("cedula, nombre")
      .eq("cedula", ced)
      .maybeSingle();
    if (!conductor) return { success: false, error: "Conductor no encontrado." };
    if (await getBloqueoActivo(ced)) {
      return { success: false, error: "El conductor ya tiene un bloqueo activo." };
    }
    const { error } = await supabase.from("devengados_bloqueos").insert({
      cedula_conductor: ced,
      conductor_nombre: conductor.nombre,
      motivo: motivo.trim(),
      bloqueado_por: perms.userId,
      bloqueado_por_email: perms.userEmail,
    });
    if (error) throw error;
    await logTesoreriaAudit({
      accion: "bloqueo_conductor",
      cedulaConductor: ced,
      conductorNombre: conductor.nombre,
      rol: perms.userType,
      valorAnterior: "activo",
      valorNuevo: "bloqueado",
      detalle: { motivo: motivo.trim() },
    });
    revalidatePath("/tesoreria/devengados");
    revalidatePath("/tesoreria/devengados/parametros");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Retira el bloqueo manual de un conductor (solo administradores). */
export async function desbloquearConductor(
  cedula: string,
  motivo: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await getCurrentPermissions();
    if (!perms.isAdmin) {
      return { success: false, error: "Solo un administrador puede retirar bloqueos." };
    }
    const ced = cedula.replace(/\D/g, "");
    const bloqueo = await getBloqueoActivo(ced);
    if (!bloqueo) return { success: false, error: "El conductor no tiene bloqueo activo." };
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("devengados_bloqueos")
      .update({
        activo: false,
        desbloqueado_por: perms.userId,
        desbloqueado_por_email: perms.userEmail,
        desbloqueo_motivo: motivo?.trim() || null,
        desbloqueado_at: new Date().toISOString(),
      })
      .eq("id", bloqueo.id);
    if (error) throw error;
    await logTesoreriaAudit({
      accion: "desbloqueo_conductor",
      cedulaConductor: ced,
      conductorNombre: bloqueo.conductor_nombre,
      rol: perms.userType,
      valorAnterior: "bloqueado",
      valorNuevo: "activo",
      detalle: { motivoBloqueo: bloqueo.motivo, motivoDesbloqueo: motivo?.trim() || null },
    });
    revalidatePath("/tesoreria/devengados");
    revalidatePath("/tesoreria/devengados/parametros");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Deja constancia en auditoría de una exportación o reporte generado. */
export async function registrarEventoReporte(
  tipo: string,
  formato: "pdf" | "excel" | "pantalla",
  fecha: string
): Promise<void> {
  try {
    const perms = await getCurrentPermissions();
    if (!canAccess(perms, "tesoreria")) return;
    await logTesoreriaAudit({
      accion: formato === "excel" ? "exportacion" : "reporte_generado",
      rol: perms.userType,
      detalle: { tipo, formato, fecha },
    });
  } catch {
    // La auditoría de reportes nunca bloquea la operación.
  }
}
