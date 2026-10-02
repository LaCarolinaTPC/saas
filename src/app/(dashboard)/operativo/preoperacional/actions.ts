"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { hoyBogota } from "@/lib/operativo/constants";
import { getDocumentosPreop } from "@/lib/operativo/preoperacional-data";
import { VERSION_LISTA, nombrePunto } from "@/lib/operativo/preoperacional-lista";
import {
  MAX_OBSERVACIONES, RESULTADO_LABEL, calcularResultado, validarFallas,
  type FallaEntrada, type ResultadoPreop,
} from "@/lib/operativo/preoperacional-reglas";

const RUTA = "/operativo/preoperacional";

/**
 * Permiso propio, como «Registrar daño»: al inspector de patio se le da solo
 * esta pantalla. La migración se lo concede también a quien ya tenía Operativo.
 */
async function assertInspector() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "preoperacional")) {
    throw new Error("No tienes acceso a la revisión preoperacional.");
  }
  if (!perms.isAdmin && !perms.puedeEditar) throw new Error("Tu tipo de usuario es de solo consulta.");
  return perms;
}

export interface RegistrarPreopInput {
  codigoVehiculo: string;
  cedulaConductor: string;
  fallas: FallaEntrada[];
  observaciones?: string;
  /** Segundos desde que se abrió el formulario del bus. */
  duracionSeg?: number | null;
}

export async function registrarPreoperacional(input: RegistrarPreopInput): Promise<{
  success: boolean;
  error?: string;
  resultado?: ResultadoPreop;
  /** Lo que se guardó pero no pasó a Mantenimiento, para decírselo al inspector. */
  avisos?: string[];
}> {
  try {
    const perms = await assertInspector();
    const codigo = String(input.codigoVehiculo ?? "").trim();
    const cedula = String(input.cedulaConductor ?? "").replace(/\D/g, "");
    if (!codigo) throw new Error("Elige el vehículo.");
    if (!cedula) throw new Error("Indica el conductor que va a salir con el vehículo.");
    const observaciones = String(input.observaciones ?? "").trim();
    if (observaciones.length > MAX_OBSERVACIONES) {
      throw new Error(`Las observaciones no pueden pasar de ${MAX_OBSERVACIONES} caracteres.`);
    }
    const fallas = validarFallas(input.fallas ?? []);
    const dur = Math.trunc(Number(input.duracionSeg));
    // Más de un día abierto no es un tiempo de revisión: se descarta.
    const duracionSeg = Number.isFinite(dur) && dur >= 0 && dur <= 86400 ? dur : null;

    const db = createAdminClient();
    const hoy = hoyBogota();
    const [{ data: vehiculo, error: errVeh }, { data: conductor, error: errCond }, docsPorCodigo] = await Promise.all([
      db.from("vehiculos").select("codigo, placa").eq("codigo", codigo).eq("estado", 1).maybeSingle(),
      db.from("conductores").select("cedula, nombre").eq("cedula", cedula).maybeSingle(),
      getDocumentosPreop(hoy, codigo),
    ]);
    if (errVeh) throw new Error(errVeh.message);
    if (errCond) throw new Error(errCond.message);
    if (!vehiculo) throw new Error("El vehículo no existe en el maestro o no está activo.");
    if (!conductor) throw new Error("El conductor no existe en Gestivo.");

    // El resultado se recalcula aquí con los vencimientos del día: el semáforo
    // del navegador es solo una vista previa.
    const documentos = docsPorCodigo[codigo] ?? [];
    const calc = calcularResultado(fallas, documentos);

    // Antes de escribir nada: un punto que ya abrió reporte hoy en este bus
    // (revisión anterior del mismo día) no abre otro, se enlaza al que existe.
    const { data: previas, error: errPrev } = fallas.length === 0 ? { data: [], error: null } : await db
      .from("operativo_preoperacional_fallas")
      .select("item_key, mantenimiento_reporte_id, operativo_preoperacional!inner(fecha, codigo_vehiculo)")
      .eq("operativo_preoperacional.fecha", hoy)
      .eq("operativo_preoperacional.codigo_vehiculo", codigo)
      .not("mantenimiento_reporte_id", "is", null)
      .in("item_key", fallas.map((f) => f.key));
    if (errPrev) throw new Error(errPrev.message);
    const yaReportado = new Map((previas ?? []).map((p) => [p.item_key as string, p.mantenimiento_reporte_id as string]));

    const nombresConcepto = [...new Set(fallas.flatMap((f) => (f.concepto && !yaReportado.has(f.key) ? [f.concepto] : [])))];
    const conceptoId = new Map<string, string>();
    if (nombresConcepto.length > 0) {
      const { data: conceptos, error } = await db
        .from("mantenimiento_conceptos").select("id, nombre").eq("activo", true).in("nombre", nombresConcepto);
      if (error) throw new Error(error.message);
      for (const c of conceptos ?? []) conceptoId.set(c.nombre, c.id);
    }

    const { data: revision, error: errRev } = await db.from("operativo_preoperacional").insert({
      fecha: hoy,
      codigo_vehiculo: codigo,
      placa: vehiculo.placa,
      cedula_conductor: cedula,
      conductor_nombre: conductor.nombre,
      resultado: calc.resultado,
      fallas: calc.fallas,
      fallas_criticas: calc.fallasCriticas,
      documentos_vencidos: calc.documentosVencidos,
      documentos,
      observaciones: observaciones || null,
      version_lista: VERSION_LISTA,
      duracion_seg: duracionSeg,
      inspector_id: perms.userId,
      inspector_email: perms.userEmail,
    }).select("id").single();
    if (errRev) throw new Error(errRev.message);

    const avisos: string[] = [];
    if (fallas.length > 0) {
      // Primero las fallas: si no se guardan, la revisión diría «apto con
      // observación» sin decir por qué, así que se retira entera y el
      // inspector vuelve a guardar sin que haya quedado nada en Mantenimiento.
      const { error: errFallas } = await db.from("operativo_preoperacional_fallas").insert(fallas.map((f) => ({
        preoperacional_id: revision.id,
        item_key: f.key,
        critico: f.critico,
        nota: f.nota,
        concepto: f.concepto,
        mantenimiento_reporte_id: yaReportado.get(f.key) ?? null,
      })));
      if (errFallas) {
        await db.from("operativo_preoperacional").delete().eq("id", revision.id);
        throw new Error(`No se pudieron guardar las fallas: ${errFallas.message}`);
      }

      // Después, un reporte de daño por cada falla mecánica nueva. Si alguno
      // no entra, la revisión queda guardada y se avisa cuál no pasó.
      for (const f of fallas) {
        if (!f.concepto || yaReportado.has(f.key)) continue;
        const idConcepto = conceptoId.get(f.concepto);
        if (!idConcepto) {
          avisos.push(`«${nombrePunto(f.key)}» no pasó a Mantenimiento: el concepto ${f.concepto} no está activo.`);
          continue;
        }
        const { data: rep, error } = await db.from("mantenimiento_reportes").insert({
          codigo_vehiculo: codigo,
          cedula_conductor: cedula,
          concepto_id: idConcepto,
          descripcion: `Preoperacional: ${nombrePunto(f.key)}${f.nota ? ` — ${f.nota}` : ""}`,
          fecha_reporte: new Date().toISOString(),
          created_by: perms.userId,
          created_by_email: perms.userEmail,
          origen_preoperacional_id: revision.id,
        }).select("id").single();
        if (error) {
          avisos.push(`«${nombrePunto(f.key)}» no pasó a Mantenimiento: ${error.message}`);
          continue;
        }
        await Promise.all([
          db.from("operativo_preoperacional_fallas")
            .update({ mantenimiento_reporte_id: rep.id })
            .eq("preoperacional_id", revision.id)
            .eq("item_key", f.key),
          db.from("mantenimiento_auditoria").insert({
            reporte_id: rep.id,
            accion: "reporte_creado",
            detalle: { codigo_vehiculo: codigo, placa: vehiculo.placa, cedula, concepto: f.concepto, origen: "preoperacional", preoperacional_id: revision.id },
            user_id: perms.userId,
            user_email: perms.userEmail,
          }),
        ]);
      }
    }

    await logTesoreriaAudit({
      accion: "preoperacional_registrado",
      modulo: "operativo",
      cedulaConductor: cedula,
      conductorNombre: conductor.nombre,
      valor: calc.fallas,
      rol: perms.userType,
      valorNuevo: `${codigo}: ${RESULTADO_LABEL[calc.resultado]}`,
      detalle: {
        preoperacional_id: revision.id,
        codigo_vehiculo: codigo,
        fecha: hoy,
        resultado: calc.resultado,
        fallas: fallas.map((f) => f.key),
        documentos_vencidos: calc.documentosVencidos,
      },
    });

    revalidatePath(RUTA);
    revalidatePath(`${RUTA}/historial`);
    if (fallas.some((f) => f.concepto)) revalidatePath("/mantenimiento");
    return { success: true, resultado: calc.resultado, avisos };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
