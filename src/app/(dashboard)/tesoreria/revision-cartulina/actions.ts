"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessSub, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { hoyBogota } from "@/lib/operativo/constants";
import { MARCA_SELECT, getMarcasRevision, getNovedadesRevision, getRevisionTimbradas, mapMarca, mapNovedad, NOVEDAD_SELECT, type MarcaRevision, type NovedadRevision } from "@/lib/tesoreria/revision-timbradas-data";
import { CIERRE_SELECT, getCierresDia, guardarFotoDia, mapCierre } from "@/lib/tesoreria/revision-timbradas-consolidado-data";
import { avanceDia, fotoDesdeResultado, type CierreDia } from "@/lib/tesoreria/revision-timbradas-consolidado";
import { ESTADOS, type EstadoTimbrada } from "@/lib/tesoreria/revision-timbradas-reglas";
import { claveDesdeNombre } from "@/lib/ausentismo/constants";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const RUTA = "/tesoreria/revision-cartulina";

async function assertRevisor() {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", "cartulina")) {
    throw new Error("No tienes acceso a la revisión de cartulina.");
  }
  if (!puedeEditarEn(perms, "tesoreria.cartulina")) {
    throw new Error("Tu tipo de usuario es de solo consulta.");
  }
  return perms;
}

export interface MarcaInput {
  fecha: string;
  numero: number;
  placa: string;
  viaje: number;
  /** Opcional: sin resultado es el check simple de revisado. Es el NOMBRE de una novedad del catálogo. */
  resultado?: string | null;
  nota?: string | null;
  estadoCalculado: EstadoTimbrada;
  /** Snapshot para abrir la solicitud a cámaras si la novedad lo pide. */
  vehiculoCodigo?: string | null;
  conductorCedula?: string | null;
  conductorNombre?: string | null;
  ruta?: string | null;
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
    const resultado = input.resultado?.trim() || null;
    // El resultado se valida contra el catálogo editable (por NOMBRE).
    let novedad: NovedadRevision | null = null;
    if (resultado) {
      const { novedades } = await getNovedadesRevision(true);
      novedad = novedades.find((n) => n.nombre === resultado) ?? null;
      if (!novedad) throw new Error("La novedad de revisión no existe o está inactiva.");
    }
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

    // Novedad especial: abre una solicitud a la revisión de cámaras con el viaje
    // que se acaba de marcar. Si ya hay un hilo para ese viaje, no se reabre.
    let envioCamaras = false;
    if (novedad?.enviaACamaras) {
      const { error: errSol } = await db
        .from("tesoreria_camaras_solicitudes")
        .upsert(
          {
            fecha_viaje: input.fecha,
            numero,
            placa: input.placa,
            viaje: input.viaje,
            vehiculo_codigo: input.vehiculoCodigo ?? null,
            conductor_cedula: input.conductorCedula ?? null,
            conductor_nombre: input.conductorNombre ?? null,
            ruta: input.ruta ?? null,
            estado: "pendiente",
            nota_solicitud: nota,
            solicitado_por_email: perms.userEmail,
          },
          { onConflict: "fecha_viaje,numero", ignoreDuplicates: true },
        );
      if (errSol) throw new Error(`No se pudo enviar a cámaras: ${errSol.message}`);
      envioCamaras = true;
      revalidatePath("/mantenimiento/camaras/solicitudes");
    }

    await logTesoreriaAudit({
      accion: "timbrada_revisada",
      modulo: "tesoreria",
      rol: perms.userType,
      valorNuevo: `${resultado ?? "Revisado"}${nota ? ` · ${nota}` : ""}${envioCamaras ? " · enviado a cámaras" : ""}`,
      detalle: { fecha: input.fecha, numero, placa: input.placa, viaje: input.viaje, estado: input.estadoCalculado, enviado_camaras: envioCamaras },
    });

    revalidatePath(RUTA);
    revalidatePath(`${RUTA}/consolidado`);
    return { success: true, marca: mapMarca(data as Record<string, unknown>) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Lista las novedades del catálogo (activas e inactivas) para administrarlas. */
export async function listarNovedadesRevision(): Promise<{ success: boolean; error?: string; novedades?: NovedadRevision[] }> {
  try {
    await assertRevisor();
    const { novedades } = await getNovedadesRevision(false);
    return { success: true, novedades };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Crea una novedad nueva del campo "Revisión". La puede crear quien tenga la
 * revisión de cartulina. No permite enviar a cámaras (ese concepto es de sistema).
 */
export async function crearNovedadRevision(
  nombre: string,
): Promise<{ success: boolean; error?: string; novedad?: NovedadRevision }> {
  try {
    const perms = await assertRevisor();
    const limpio = nombre.trim().replace(/\s+/g, " ");
    if (limpio.length < 3) throw new Error("El nombre es muy corto.");
    if (limpio.length > 80) throw new Error("El nombre no puede pasar de 80 caracteres.");
    const clave = claveDesdeNombre(limpio) || `nov_${Date.now()}`;

    const db = createAdminClient();
    const { data: existentes } = await db.from("tesoreria_revision_novedades").select("orden").order("orden", { ascending: false }).limit(1);
    const orden = Number((existentes?.[0] as { orden?: number } | undefined)?.orden ?? 0) + 10;

    const { data, error } = await db
      .from("tesoreria_revision_novedades")
      .insert({ clave, nombre: limpio, orden, envia_a_camaras: false, es_sistema: false, creado_por_email: perms.userEmail })
      .select(NOVEDAD_SELECT)
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Ya existe una novedad con ese nombre.");
      throw new Error(error.message);
    }

    await logTesoreriaAudit({
      accion: "revision_novedad_creada",
      modulo: "tesoreria",
      rol: perms.userType,
      valorNuevo: limpio,
      detalle: { clave },
    });

    revalidatePath(RUTA);
    return { success: true, novedad: mapNovedad(data as Record<string, unknown>) };
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

/**
 * «Actualizar ahora» del día en curso: trae de GEMA los eventos del terminal,
 * el despacho, el recaudo y los descuentos de hoy sin esperar los 5 minutos.
 * Basta con poder ver la revisión: no escribe nada de lo revisado.
 */
export async function actualizarCartulinaHoy(): Promise<{ ok: boolean; error?: string; eventos?: number; ocupado?: boolean }> {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", "cartulina")) return { ok: false, error: "No tienes acceso a la revisión de cartulina." };
  const { refrescarCartulinaHoy } = await import("@/lib/tesoreria/cartulina-hoy");
  const r = await refrescarCartulinaHoy(hoyBogota(), { forzar: true });
  revalidatePath(RUTA);
  if (r.motivo === "lo está trayendo otro") return { ok: true, ocupado: true };
  if (r.motivo === "sin tabla") return { ok: false, error: "Falta aplicar la migración de los datos del día en curso (pv_terminal_hoy)." };
  return { ok: !r.error, error: r.error, eventos: r.eventos };
}
