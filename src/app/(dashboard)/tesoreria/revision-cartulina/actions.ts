"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { hoyBogota } from "@/lib/operativo/constants";
import { MARCA_SELECT, getMarcasRevision, getRevisionTimbradas, mapMarca, type MarcaRevision } from "@/lib/tesoreria/revision-timbradas-data";
import { CIERRE_SELECT, getCierresDia, guardarFotoDia, mapCierre } from "@/lib/tesoreria/revision-timbradas-consolidado-data";
import { avanceDia, fotoDesdeResultado, type CierreDia } from "@/lib/tesoreria/revision-timbradas-consolidado";
import { ESTADOS, RESULTADOS_REVISION, type EstadoTimbrada, type ResultadoRevision } from "@/lib/tesoreria/revision-timbradas-reglas";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const RUTA = "/tesoreria/revision-cartulina";

async function assertRevisor() {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", "cartulina")) {
    throw new Error("No tienes acceso a la revisión de cartulina.");
  }
  if (!perms.isAdmin && !perms.puedeEditar) {
    throw new Error("Tu tipo de usuario es de solo consulta.");
  }
  return perms;
}

export interface MarcaInput {
  fecha: string;
  numero: number;
  placa: string;
  viaje: number;
  /** Opcional: sin resultado es el check simple de revisado. */
  resultado?: ResultadoRevision | null;
  nota?: string | null;
  estadoCalculado: EstadoTimbrada;
}

/** Marca un viaje como revisado (check), con resultado y nota opcionales; reemplaza la marca anterior. */
export async function marcarViajeRevisado(
  input: MarcaInput,
): Promise<{ success: boolean; error?: string; marca?: MarcaRevision }> {
  try {
    const perms = await assertRevisor();
    if (!FECHA_RE.test(input.fecha)) throw new Error("Fecha no válida.");
    const numero = Math.trunc(Number(input.numero));
    if (!Number.isFinite(numero) || numero <= 0) throw new Error("Viaje no válido.");
    const resultado = input.resultado || null;
    if (resultado && !(RESULTADOS_REVISION as readonly string[]).includes(resultado)) throw new Error("Resultado no válido.");
    if (!(ESTADOS as readonly string[]).includes(input.estadoCalculado)) throw new Error("Estado no válido.");
    const nota = input.nota?.trim() || null;
    if (nota && nota.length > 500) throw new Error("La nota no puede pasar de 500 caracteres.");
    if (resultado === "Otro (ver nota)" && !nota) throw new Error("Con «Otro» escribe la nota.");

    const db = createAdminClient();
    const { data, error } = await db
      .from("tesoreria_revision_timbradas")
      .upsert(
        {
          fecha_viaje: input.fecha,
          numero,
          placa: input.placa,
          viaje: input.viaje,
          resultado,
          nota,
          estado_calculado: input.estadoCalculado,
          revisado_por: perms.userId,
          revisado_por_email: perms.userEmail,
          revisado_at: new Date().toISOString(),
        },
        { onConflict: "fecha_viaje,numero" },
      )
      .select(MARCA_SELECT)
      .single();
    if (error) throw new Error(error.message);

    await logTesoreriaAudit({
      accion: "timbrada_revisada",
      modulo: "tesoreria",
      rol: perms.userType,
      valorNuevo: `${resultado ?? "Revisado"}${nota ? ` · ${nota}` : ""}`,
      detalle: { fecha: input.fecha, numero, placa: input.placa, viaje: input.viaje, estado: input.estadoCalculado },
    });

    revalidatePath(RUTA);
    revalidatePath(`${RUTA}/consolidado`);
    return { success: true, marca: mapMarca(data as Record<string, unknown>) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type MarcaLoteInput = Omit<MarcaInput, "fecha" | "resultado" | "nota">;

/**
 * Marca varios viajes del día como revisados de una vez (check simple, sin
 * resultado ni nota). Los que ya tienen marca no se tocan, para no pisar el
 * resultado o la nota que alguien dejó. Una sola entrada de auditoría con los
 * números marcados.
 */
export async function marcarViajesRevisados(
  fecha: string,
  viajes: MarcaLoteInput[],
): Promise<{ success: boolean; error?: string; marcas?: MarcaRevision[] }> {
  try {
    const perms = await assertRevisor();
    if (!FECHA_RE.test(fecha)) throw new Error("Fecha no válida.");
    if (!viajes.length) return { success: true, marcas: [] };
    if (viajes.length > 3000) throw new Error("Demasiados viajes en un solo lote.");
    const ahora = new Date().toISOString();
    const filas = viajes.map((v) => {
      const numero = Math.trunc(Number(v.numero));
      if (!Number.isFinite(numero) || numero <= 0) throw new Error("Viaje no válido.");
      if (!(ESTADOS as readonly string[]).includes(v.estadoCalculado)) throw new Error("Estado no válido.");
      return {
        fecha_viaje: fecha,
        numero,
        placa: v.placa,
        viaje: v.viaje,
        resultado: null,
        nota: null,
        estado_calculado: v.estadoCalculado,
        revisado_por: perms.userId,
        revisado_por_email: perms.userEmail,
        revisado_at: ahora,
      };
    });

    const db = createAdminClient();
    const { data, error } = await db
      .from("tesoreria_revision_timbradas")
      .upsert(filas, { onConflict: "fecha_viaje,numero", ignoreDuplicates: true })
      .select(MARCA_SELECT);
    if (error) throw new Error(error.message);
    const marcas = (data ?? []).map((r) => mapMarca(r as Record<string, unknown>));

    if (marcas.length) {
      await logTesoreriaAudit({
        accion: "timbrada_revisada",
        modulo: "tesoreria",
        rol: perms.userType,
        valor: marcas.length,
        valorNuevo: `Revisado en lote · ${marcas.length} viaje(s)`,
        detalle: { fecha, lote: true, numeros: marcas.map((m) => m.numero) },
      });
    }

    revalidatePath(RUTA);
    revalidatePath(`${RUTA}/consolidado`);
    return { success: true, marcas };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Quita la marca de revisión de un viaje (queda el rastro en la auditoría). */
export async function quitarRevisionViaje(fecha: string, numero: number): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertRevisor();
    if (!FECHA_RE.test(fecha)) throw new Error("Fecha no válida.");
    const db = createAdminClient();
    const { data, error } = await db
      .from("tesoreria_revision_timbradas")
      .delete()
      .eq("fecha_viaje", fecha)
      .eq("numero", numero)
      .select(MARCA_SELECT);
    if (error) throw new Error(error.message);
    const previa = data?.[0] ? mapMarca(data[0] as Record<string, unknown>) : null;

    await logTesoreriaAudit({
      accion: "timbrada_revision_quitada",
      modulo: "tesoreria",
      rol: perms.userType,
      valorAnterior: previa ? `${previa.resultado ?? "Revisado"}${previa.nota ? ` · ${previa.nota}` : ""} (${previa.revisadoPorEmail ?? "—"})` : null,
      detalle: { fecha, numero },
    });

    revalidatePath(RUTA);
    revalidatePath(`${RUTA}/consolidado`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Cierre formal del día: recalcula el día con lo último de GEMA (no se cierra
 * sobre un cálculo viejo), guarda la foto y exige que no quede ningún viaje
 * por revisar sin check. El cierre queda como historial; no se borra.
 */
export async function cerrarDiaRevision(fecha: string): Promise<{ success: boolean; error?: string; cierre?: CierreDia }> {
  try {
    const perms = await assertRevisor();
    if (!FECHA_RE.test(fecha)) throw new Error("Fecha no válida.");
    if (fecha >= hoyBogota()) throw new Error("El día de hoy no se puede cerrar: todavía no está completo.");

    const [rev, marcas, cierresPrevios] = await Promise.all([getRevisionTimbradas(fecha), getMarcasRevision(fecha), getCierresDia(fecha)]);
    if (!marcas.disponible) throw new Error("La evidencia de revisión no está disponible.");
    const errFoto = await guardarFotoDia(rev);
    if (errFoto) throw new Error(`No se pudo guardar el cálculo del día: ${errFoto}`);

    const foto = fotoDesdeResultado(rev);
    const checks = marcas.marcas.map((m) => ({ fecha, numero: m.numero, revisadoPorEmail: m.revisadoPorEmail, revisadoAt: m.revisadoAt }));
    const avance = avanceDia(fecha, foto, checks, null);
    if (avance.pendientes > 0) {
      throw new Error(`Faltan ${avance.pendientes} viaje(s) por revisar con lo último de GEMA. Revisa los pendientes y vuelve a cerrar.`);
    }
    const vigente = cierresPrevios[0] ?? null;
    if (vigente && avanceDia(fecha, foto, checks, vigente).estadoDia === "cerrado") {
      throw new Error("El día ya está cerrado.");
    }

    const db = createAdminClient();
    const numeros = foto.viajes.map((v) => v.numero);
    const { data, error } = await db
      .from("tesoreria_revision_timbradas_cierres")
      .insert({
        fecha_viaje: fecha,
        por_revisar: avance.porRevisar,
        revisados: avance.revisados,
        numeros,
        cerrado_por: perms.userId,
        cerrado_por_email: perms.userEmail,
      })
      .select(CIERRE_SELECT)
      .single();
    if (error) throw new Error(error.message);

    await logTesoreriaAudit({
      accion: "timbrada_dia_cerrado",
      modulo: "tesoreria",
      rol: perms.userType,
      valor: avance.porRevisar,
      valorAnterior: vigente ? `Cerrado antes el ${vigente.cerradoAt} por ${vigente.cerradoPorEmail ?? "—"}` : null,
      valorNuevo: `Día ${fecha} cerrado · ${avance.revisados} de ${avance.porRevisar} revisados`,
      detalle: { fecha, por_revisar: avance.porRevisar, revisados: avance.revisados, recierre: !!vigente },
    });

    revalidatePath(RUTA);
    revalidatePath(`${RUTA}/consolidado`);
    return { success: true, cierre: mapCierre(data as Record<string, unknown>) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
