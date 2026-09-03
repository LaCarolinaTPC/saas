"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Formulario público del conductor: sin sesión, se identifica con la cédula.
// Ninguna acción de este archivo puede llamar a getCurrentPermissions.
//
// El catálogo de conductores nunca sale completo al navegador: se valida una
// cédula a la vez contra el servidor. Los vehículos y los conceptos sí se
// entregan, pero solo después de que la cédula resulte válida.

export type VehiculoPublico = { codigo: string; placa: string | null };
export type ConceptoPublico = { id: string; nombre: string; descripcion: string | null };

export type IdentificacionResultado =
  | { success: true; nombre: string; vehiculos: VehiculoPublico[]; conceptos: ConceptoPublico[] }
  | { success: false; error: string };

export type ReportePublicoInput = {
  cedula: string;
  codigoVehiculo: string;
  conceptoId: string;
  descripcion: string;
};

export async function identificarConductor(cedulaCruda: string): Promise<IdentificacionResultado> {
  try {
    const cedula = cedulaCruda.replace(/\D/g, "");
    if (!cedula) return { success: false, error: "Escribe tu número de cédula." };

    const db = createAdminClient();
    const { data: conductor, error } = await db
      .from("conductores")
      .select("nombre, estado")
      .eq("cedula", cedula)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conductor) {
      return { success: false, error: "No encontramos esa cédula. Habla con tu supervisor." };
    }
    if (conductor.estado !== "ACTIVO") {
      return { success: false, error: "Tu cédula figura como inactiva. Habla con tu supervisor." };
    }

    const [vehiculosRes, conceptosRes] = await Promise.all([
      db.from("vehiculos").select("codigo, placa").eq("estado", 1).order("codigo"),
      db.from("mantenimiento_conceptos").select("id, nombre, descripcion").eq("activo", true).order("nombre"),
    ]);
    if (vehiculosRes.error) throw new Error(vehiculosRes.error.message);
    if (conceptosRes.error) throw new Error(conceptosRes.error.message);

    return {
      success: true,
      nombre: conductor.nombre,
      vehiculos: vehiculosRes.data ?? [],
      conceptos: conceptosRes.data ?? [],
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo verificar la cédula." };
  }
}

export async function crearReportePublico(input: ReportePublicoInput) {
  try {
    const cedula = input.cedula.replace(/\D/g, "");
    const codigoVehiculo = input.codigoVehiculo.trim();
    if (!cedula || !codigoVehiculo || !input.conceptoId) {
      throw new Error("Completa el vehículo y el tipo de daño.");
    }

    const db = createAdminClient();
    // Se revalida todo en el servidor: el navegador no es de fiar y este
    // formulario no exige sesión.
    const [{ data: conductor }, { data: vehiculo }, { data: concepto }] = await Promise.all([
      db.from("conductores").select("cedula, nombre, estado").eq("cedula", cedula).maybeSingle(),
      db.from("vehiculos").select("codigo, placa").eq("codigo", codigoVehiculo).eq("estado", 1).maybeSingle(),
      db.from("mantenimiento_conceptos").select("id, nombre").eq("id", input.conceptoId).eq("activo", true).maybeSingle(),
    ]);
    if (!conductor || conductor.estado !== "ACTIVO") throw new Error("Tu cédula ya no está habilitada. Habla con tu supervisor.");
    if (!vehiculo) throw new Error("Ese vehículo ya no está activo. Selecciona otro.");
    if (!concepto) throw new Error("Ese tipo de daño ya no está disponible.");

    // La fecha la pone el servidor: en el formulario público el conductor
    // reporta lo que acaba de ocurrir, no carga histórico.
    const { data, error } = await db.from("mantenimiento_reportes").insert({
      codigo_vehiculo: codigoVehiculo,
      cedula_conductor: cedula,
      concepto_id: input.conceptoId,
      descripcion: input.descripcion.trim() || null,
      fecha_reporte: new Date().toISOString(),
    }).select("id").single();
    if (error) throw new Error(error.message);

    // Sin user_id: no hay sesión. El origen queda en el detalle para poder
    // distinguir después lo que entró por el formulario del conductor.
    await db.from("mantenimiento_auditoria").insert({
      reporte_id: data.id,
      accion: "reporte_creado",
      detalle: {
        origen: "formulario_publico",
        codigo_vehiculo: codigoVehiculo,
        placa: vehiculo.placa,
        cedula,
        concepto: concepto.nombre,
      },
    });

    return { success: true, vehiculo: vehiculo.placa ?? vehiculo.codigo, concepto: concepto.nombre };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo enviar el reporte." };
  }
}
