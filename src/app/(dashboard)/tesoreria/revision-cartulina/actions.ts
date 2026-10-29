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
import { refrescarRecobrosDelDia, type RefrescoRecobros } from "@/lib/gema/recobros-al-dia";
import { decidirMarcaCartulina, validarRecobroCartulina, valorDeDiferencia } from "@/lib/tesoreria/recobros";
import { getDatosViajes } from "@/lib/tesoreria/recobros-solicitudes";
import { getTarifas } from "@/lib/tesoreria/recobros-data";

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
  /** Diferencia sin justificar, si la novedad abre un recobro por cartulina. */
  diferenciaRecobro?: number | null;
  /** Snapshot para abrir la solicitud a cámaras si la novedad lo pide. */
  vehiculoCodigo?: string | null;
  conductorCedula?: string | null;
  conductorNombre?: string | null;
  ruta?: string | null;
}

/**
 * Marca un viaje como revisado (check), con resultado y nota opcionales;
 * reemplaza la marca anterior. Dos novedades hacen algo más:
 *  - «Enviar a revisión de cámaras» abre una solicitud a Cámaras;
 *  - «Recobro por cartulina» abre el recobro ya resuelto con la diferencia sin
 *    justificar que digita la auxiliar, para que caja lo gestione.
 * Un recobro ya creado no se deshace cambiando la marca: es una corrección.
 */
export async function marcarViajeRevisado(
  input: MarcaInput,
): Promise<{ success: boolean; error?: string; marca?: MarcaRevision; recobro?: { diferencia: number; valor: number } }> {
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
    // ¿El viaje ya tiene solicitud (de cámara o recobro por cartulina)?
    const { data: previa, error: errPrevia } = await db
      .from("tesoreria_camaras_solicitudes")
      .select("id, tipo, anulada_at")
      .eq("fecha_viaje", input.fecha)
      .eq("numero", numero)
      .maybeSingle();
    if (errPrevia) throw new Error(errPrevia.message);
    const decision = decidirMarcaCartulina(
      !!novedad?.generaRecobro,
      previa ? { tipo: previa.tipo === "cartulina" ? "cartulina" : "camara", anuladaAt: previa.anulada_at } : null,
    );
    if ("error" in decision) throw new Error(decision.error);
    let recobro: { diferencia: number; nota: string } | null = null;
    if (decision.accion === "crear") {
      const v = validarRecobroCartulina({ diferencia: input.diferenciaRecobro, nota });
      if (!v.ok) throw new Error(v.error);
      recobro = { diferencia: v.diferencia, nota: v.nota };
    }

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

    // Recobro por cartulina: queda creado y resuelto en un paso, con la
    // diferencia de la auxiliar y el pasaje del viaje en GEMA.
    let creado: { diferencia: number; valor: number } | null = null;
    if (recobro) {
      const [viajes, tarifas] = await Promise.all([getDatosViajes([numero], db), getTarifas()]);
      const datos = viajes.get(numero);
      const val = valorDeDiferencia(recobro.diferencia, datos?.pasajeGema ?? null, input.fecha, tarifas);
      const ahora = new Date().toISOString();
      const { data: sol, error: errRec } = await db
        .from("tesoreria_camaras_solicitudes")
        .insert({
          fecha_viaje: input.fecha,
          numero,
          placa: input.placa,
          viaje: input.viaje,
          vehiculo_codigo: input.vehiculoCodigo ?? null,
          conductor_cedula: datos?.conductorCedula ?? input.conductorCedula ?? null,
          conductor_nombre: datos?.conductorNombre ?? input.conductorNombre ?? null,
          ruta: input.ruta ?? null,
          tipo: "cartulina",
          origen: "cartulina",
          motivo_solicitud: "Diferencia de timbradas sin justificar",
          nota_solicitud: recobro.nota,
          solicitado_por_email: perms.userEmail,
          solicitado_at: ahora,
          tomado_por_email: perms.userEmail,
          tomado_at: ahora,
          estado: "resuelto",
          resultado: "recobro",
          resuelto_por_email: perms.userEmail,
          resuelto_at: ahora,
          timbradas_registradora: datos?.timbradas ?? null,
          diferencia: recobro.diferencia,
          pasaje: val.pasaje,
          pasaje_fuente: val.pasajeFuente,
          valor_recobro: val.valor,
        })
        .select("id")
        .single();
      if (errRec) {
        throw new Error(`La revisión quedó guardada, pero el recobro no se creó: ${errRec.message}. Guárdela de nuevo.`);
      }
      const snap = { diferencia: recobro.diferencia, pasaje: val.pasaje, valor_recobro: val.valor, timbradas_registradora: datos?.timbradas ?? null };
      await db.from("tesoreria_camaras_solicitudes_eventos").insert([
        { solicitud_id: sol.id, accion: "solicitud_creada", antes: null, despues: { origen: "cartulina", tipo: "cartulina" }, usuario_email: perms.userEmail },
        { solicitud_id: sol.id, accion: "revision_resuelta", antes: null, despues: { resultado: "recobro", ...snap }, usuario_email: perms.userEmail },
      ]);
      creado = { diferencia: recobro.diferencia, valor: val.valor };
    }

    // Novedad especial: abre una solicitud a la revisión de cámaras con el viaje
    // que se acaba de marcar. Si ya hay un hilo para ese viaje, no se reabre.
    let envioCamaras = false;
    if (novedad?.enviaACamaras) {
      const { data: abiertas, error: errSol } = await db
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
            tipo: "camara",
            origen: "cartulina",
            motivo_solicitud: `Revisión cartulina: ${input.estadoCalculado}`,
            nota_solicitud: nota,
            solicitado_por_email: perms.userEmail,
          },
          { onConflict: "fecha_viaje,numero", ignoreDuplicates: true },
        )
        .select("id");
      if (errSol) throw new Error(`No se pudo enviar a cámaras: ${errSol.message}`);
      for (const s of abiertas ?? []) {
        await db.from("tesoreria_camaras_solicitudes_eventos").insert({
          solicitud_id: s.id, accion: "solicitud_creada", antes: null, despues: { origen: "cartulina", tipo: "camara" }, usuario_email: perms.userEmail,
        });
      }
      envioCamaras = true;
      revalidatePath("/mantenimiento/camaras/solicitudes");
    }

    await logTesoreriaAudit({
      accion: "timbrada_revisada",
      modulo: "tesoreria",
      rol: perms.userType,
      valor: creado?.valor ?? null,
      valorNuevo: `${resultado ?? "Revisado"}${nota ? ` · ${nota}` : ""}${envioCamaras ? " · enviado a cámaras" : ""}`
        + (creado ? ` · recobro de ${creado.diferencia} timbradas` : ""),
      detalle: {
        fecha: input.fecha, numero, placa: input.placa, viaje: input.viaje, estado: input.estadoCalculado,
        enviado_camaras: envioCamaras, recobro_cartulina: creado,
      },
    });

    revalidatePath(RUTA);
    revalidatePath(`${RUTA}/consolidado`);
    if (creado) {
      revalidatePath(`${RUTA}/solicitudes-camaras`);
      revalidatePath("/tesoreria/devengados");
    }
    return { success: true, marca: mapMarca(data as Record<string, unknown>), recobro: creado ?? undefined };
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
    const { data: sol, error: errSol } = await db
      .from("tesoreria_camaras_solicitudes")
      .select("tipo, anulada_at")
      .eq("fecha_viaje", fecha)
      .eq("numero", numero)
      .maybeSingle();
    if (errSol) throw new Error(errSol.message);
    if (sol?.tipo === "cartulina" && !sol.anulada_at) {
      throw new Error("Este viaje ya generó un recobro por cartulina. Para cambiarlo, pida una corrección; la revisión no se quita.");
    }
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
 * «Actualizar desde GEMA» en Revisión cartulina: trae los abonos, el
 * despacho y el recaudo de hoy y ayer y abre las solicitudes a Cámaras de los
 * abonos «REVISIÓN CÁMARA» nuevos. Solo vuelve a traer lo que ya es de GEMA:
 * basta con poder ver la pantalla.
 */
export async function actualizarRecobrosDesdeGema(): Promise<{ ok: boolean; error?: string; refresco?: RefrescoRecobros }> {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", "cartulina")) return { ok: false, error: "No tienes acceso a la revisión de cartulina." };
  const refresco = await refrescarRecobrosDelDia({ forzar: true });
  revalidatePath(RUTA);
  revalidatePath("/mantenimiento/camaras/solicitudes");
  return { ok: !refresco.error, error: refresco.error, refresco };
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
