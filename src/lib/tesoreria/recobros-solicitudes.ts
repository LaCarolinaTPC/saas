import { createAdminClient } from "@/lib/supabase/admin";
import { getSettingValue } from "@/lib/settings";
import { getTarifas } from "./recobros-data";
import {
  calcularRecobro, esConceptoRevisionCamara, planSolicitudesDesdeAbonos,
  type AbonoRevision, type OrigenSolicitud, type ResultadoRevision, type SolicitudExistente,
} from "./recobros";

/**
 * Escrituras del módulo de Recobros que no son de una pantalla sola: las
 * solicitudes que nacen de los abonos de GEMA (cron y refresco del día), la
 * instantánea del valor al resolver y el enlace de las revisiones que
 * Mantenimiento registra directo por el formulario.
 */

type Db = ReturnType<typeof createAdminClient>;

/** Desde qué día los abonos «REVISIÓN CÁMARA» abren solicitud. Sin valor, apagado. */
export const CLAVE_ABONOS_DESDE = "recobros_abonos_desde";

export async function getArranqueAbonos(): Promise<string | null> {
  const v = await getSettingValue(CLAVE_ABONOS_DESDE);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

const txt = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

// ── Datos del viaje en GEMA ──────────────────────────────────────────────────

export interface DatosViaje {
  timbradas: number | null;
  pasajeGema: number | null;
  fechaViaje: string | null;
  placa: string | null;
  codigo: string | null;
  viaje: number | null;
  conductorCedula: string | null;
  conductorNombre: string | null;
  ruta: string | null;
}

/** Timbradas (despacho) y pasaje (recaudo) de varios viajes, por número de despacho. */
export async function getDatosViajes(numeros: number[], db: Db = createAdminClient()): Promise<Map<number, DatosViaje>> {
  const out = new Map<number, DatosViaje>();
  const unicos = [...new Set(numeros.filter((n) => Number.isFinite(n)))];
  for (let i = 0; i < unicos.length; i += 300) {
    const lote = unicos.slice(i, i + 300);
    const [desp, rec] = await Promise.all([
      db.from("historico_despacho")
        .select("numero, fecha_viaje, placa, codigo, viaje, conductor_ced, conductor, ruta_programada, ruta_reprogramada, timbradas")
        .in("numero", lote),
      db.from("viajes_recaudados").select("numero, pasaje").in("numero", lote),
    ]);
    if (desp.error) throw new Error(desp.error.message);
    if (rec.error) throw new Error(rec.error.message);
    const pasajes = new Map((rec.data ?? []).map((r) => [Number(r.numero), num(r.pasaje)]));
    for (const r of desp.data ?? []) {
      out.set(Number(r.numero), {
        timbradas: num(r.timbradas),
        pasajeGema: pasajes.get(Number(r.numero)) ?? null,
        fechaViaje: txt(r.fecha_viaje),
        placa: txt(r.placa),
        codigo: txt(r.codigo),
        viaje: num(r.viaje),
        conductorCedula: txt(r.conductor_ced),
        conductorNombre: txt(r.conductor),
        ruta: txt(r.ruta_reprogramada)?.trim() || txt(r.ruta_programada),
      });
    }
    for (const n of lote) {
      if (!out.has(n) && pasajes.has(n)) {
        out.set(n, {
          timbradas: null, pasajeGema: pasajes.get(n) ?? null, fechaViaje: null, placa: null, codigo: null,
          viaje: null, conductorCedula: null, conductorNombre: null, ruta: null,
        });
      }
    }
  }
  return out;
}

/** Columnas de la instantánea del cálculo para guardar al resolver. */
export async function instantaneaRecobro(
  numero: number,
  fechaViaje: string,
  resultado: ResultadoRevision,
  conteo: number | null,
  db: Db = createAdminClient(),
): Promise<Record<string, unknown>> {
  const [datos, tarifas] = await Promise.all([getDatosViajes([numero], db), getTarifas()]);
  const v = datos.get(numero);
  const base = { timbradas_registradora: v?.timbradas ?? null, conteo_camara: conteo };
  if (resultado === "sin_conteo") return { ...base, diferencia: null, pasaje: null, pasaje_fuente: null, valor_recobro: null };
  const c = calcularRecobro({ conteo, timbradas: v?.timbradas ?? null, pasajeGema: v?.pasajeGema ?? null, fechaViaje, tarifas });
  if (!c) return { ...base, diferencia: null, pasaje: null, pasaje_fuente: null, valor_recobro: resultado === "recobro" ? null : 0 };
  return {
    ...base,
    diferencia: c.diferencia,
    pasaje: c.pasaje,
    pasaje_fuente: c.pasajeFuente,
    valor_recobro: resultado === "recobro" ? c.valor : 0,
  };
}

async function evento(db: Db, solicitudId: string, accion: string, despues: unknown, email: string | null) {
  const { error } = await db.from("tesoreria_camaras_solicitudes_eventos").insert({
    solicitud_id: solicitudId, accion, antes: null, despues, usuario_email: email,
  });
  if (error) console.warn(`[recobros] evento ${accion} sin guardar: ${error.message}`);
}

// ── Abonos de GEMA → solicitudes ─────────────────────────────────────────────

export interface ResultadoAbonos {
  apagado?: boolean;
  creadas: number;
  vinculadas: number;
  anuladas: number;
  alertadas: number;
  error?: string;
}

/** «2026-10-28T22:09:20» (hora de Colombia sin zona) → instante ISO. */
const instanteColombia = (local: string) => new Date(`${local.slice(0, 19)}-05:00`).toISOString();

/**
 * Abre una solicitud a Cámaras por cada abono «REVISIÓN CÁMARA» de GEMA del
 * rango (días del abono) y anula las de abonos que GEMA anuló o borró. Se
 * llama después de sincronizar los abonos: en el cron y en el refresco del
 * día. Nunca lanza.
 */
export async function sincronizarSolicitudesDesdeAbonos(desde: string, hasta: string): Promise<ResultadoAbonos> {
  const r: ResultadoAbonos = { creadas: 0, vinculadas: 0, anuladas: 0, alertadas: 0 };
  try {
    const arranque = await getArranqueAbonos();
    if (!arranque) return { ...r, apagado: true };
    const db = createAdminClient();
    const ini = desde < arranque ? arranque : desde;
    if (ini > hasta) return r;

    const { data: filas, error } = await db
      .from("abonos")
      .select("id_abono, id_viaje, fecha_abono, fecha_viaje, num_viaje, codigo_vehiculo, placa_vehiculo, valor_abono, estado, usuario_generacion, concepto_abono")
      .gte("dia_abono", ini)
      .lte("dia_abono", hasta)
      .ilike("concepto_abono", "revisi%n c%mara")
      .order("id_abono")
      .range(0, 4999);
    if (error) throw new Error(error.message);
    const abonos: AbonoRevision[] = (filas ?? [])
      .filter((f) => esConceptoRevisionCamara(f.concepto_abono))
      .map((f) => ({
        idAbono: Number(f.id_abono),
        idViaje: num(f.id_viaje),
        fechaAbono: String(f.fecha_abono),
        fechaViaje: txt(f.fecha_viaje),
        numViaje: num(f.num_viaje),
        codigoVehiculo: txt(f.codigo_vehiculo),
        placa: txt(f.placa_vehiculo),
        valor: num(f.valor_abono),
        estado: num(f.estado),
        usuario: txt(f.usuario_generacion),
      }));

    const numeros = [...new Set(abonos.map((a) => a.idViaje).filter((n): n is number => n != null))];
    const sel = "id, numero, origen, abono_id, abono_fecha, estado, tomado_at, anulada_at, alertas";
    const [porViaje, porFecha] = await Promise.all([
      numeros.length
        ? db.from("tesoreria_camaras_solicitudes").select(sel).in("numero", numeros)
        : Promise.resolve({ data: [], error: null }),
      db.from("tesoreria_camaras_solicitudes").select(sel).eq("origen", "abono_gema").gte("abono_fecha", ini).lte("abono_fecha", hasta),
    ]);
    if (porViaje.error) throw new Error(porViaje.error.message);
    if (porFecha.error) throw new Error(porFecha.error.message);
    const existentes = new Map<string, SolicitudExistente>();
    for (const s of [...(porViaje.data ?? []), ...(porFecha.data ?? [])] as Record<string, unknown>[]) {
      existentes.set(String(s.id), {
        id: String(s.id),
        numero: Number(s.numero),
        origen: s.origen as OrigenSolicitud,
        abonoId: num(s.abono_id),
        abonoFecha: txt(s.abono_fecha),
        estado: s.estado === "resuelto" ? "resuelto" : "pendiente",
        tomadoAt: txt(s.tomado_at),
        anuladaAt: txt(s.anulada_at),
        alertas: Array.isArray(s.alertas) ? (s.alertas as unknown[]).map(String) : [],
      });
    }

    const plan = planSolicitudesDesdeAbonos(abonos, [...existentes.values()], { arranque, rango: { desde: ini, hasta } });

    if (plan.crear.length) {
      const viajes = await getDatosViajes(plan.crear.map((a) => a.idViaje!), db);
      const nuevas = plan.crear.flatMap((a) => {
        const v = viajes.get(a.idViaje!);
        const fechaViaje = a.fechaViaje ?? v?.fechaViaje;
        if (!fechaViaje) return [];
        const valor = a.valor != null ? ` por $${Math.round(a.valor).toLocaleString("es-CO")}` : "";
        return [{
          fecha_viaje: fechaViaje,
          numero: a.idViaje,
          placa: a.placa ?? v?.placa ?? null,
          viaje: a.numViaje ?? v?.viaje ?? null,
          vehiculo_codigo: a.codigoVehiculo ?? v?.codigo ?? null,
          conductor_cedula: v?.conductorCedula ?? null,
          conductor_nombre: v?.conductorNombre ?? null,
          ruta: v?.ruta ?? null,
          estado: "pendiente",
          solicitado_at: instanteColombia(a.fechaAbono),
          nota_solicitud: `Abono «REVISIÓN CÁMARA» n.º ${a.idAbono}${valor} registrado en GEMA${a.usuario ? ` por ${a.usuario}` : ""}.`,
          motivo_solicitud: "Abono «REVISIÓN CÁMARA» en GEMA",
          tipo: "camara",
          origen: "abono_gema",
          abono_id: a.idAbono,
          abono_fecha: a.fechaAbono.slice(0, 10),
        }];
      });
      if (nuevas.length) {
        const { data: ins, error: eIns } = await db
          .from("tesoreria_camaras_solicitudes")
          .upsert(nuevas, { onConflict: "fecha_viaje,numero", ignoreDuplicates: true })
          .select("id, abono_id");
        if (eIns) throw new Error(eIns.message);
        r.creadas = ins?.length ?? 0;
        for (const s of ins ?? []) await evento(db, String(s.id), "solicitud_creada", { origen: "abono_gema", abono_id: s.abono_id }, null);
      }
    }

    for (const v of plan.vincular) {
      const { data, error: e } = await db
        .from("tesoreria_camaras_solicitudes")
        .update({ abono_id: v.abono.idAbono, abono_fecha: v.abono.fechaAbono.slice(0, 10) })
        .eq("id", v.solicitudId)
        .is("abono_id", null)
        .select("id");
      if (e) throw new Error(e.message);
      r.vinculadas += data?.length ?? 0;
    }

    for (const a of plan.anular) {
      const { data, error: e } = await db
        .from("tesoreria_camaras_solicitudes")
        .update({ anulada_at: new Date().toISOString(), anulada_motivo: a.motivo })
        .eq("id", a.solicitudId)
        .eq("estado", "pendiente")
        .is("tomado_at", null)
        .is("anulada_at", null)
        .select("id");
      if (e) throw new Error(e.message);
      if (data?.length) {
        r.anuladas++;
        await evento(db, a.solicitudId, "solicitud_anulada", { motivo: a.motivo }, null);
      }
    }

    for (const a of plan.alertar) {
      const actuales = existentes.get(a.solicitudId)?.alertas ?? [];
      const { error: e } = await db
        .from("tesoreria_camaras_solicitudes")
        .update({ alertas: [...actuales, a.alerta] })
        .eq("id", a.solicitudId);
      if (e) throw new Error(e.message);
      r.alertadas++;
    }
    return r;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[recobros] solicitudes desde abonos:", error);
    return { ...r, error };
  }
}

// ── Revisiones que Mantenimiento registra directo ────────────────────────────

export interface RevisionDirecta {
  id: string;
  despachoNumero: number | null;
  fechaViaje: string;
  vehiculoCodigo: string;
  viaje: string;
  conductorCedula: string | null;
  conductorNombre: string | null;
  tipoNovedad: string;
  aforo: number | null;
  observaciones: string | null;
  tecnicoEmail: string | null;
}

/** Tipo de novedad de cámara con que Mantenimiento marca un recobro con conteo. */
export const TIPO_CAMARA_RECOBRO = "camara_recobro";

/**
 * Después de guardar una revisión del formulario: si es un «Recobro» de
 * cámara con conteo, resuelve la solicitud pendiente de ese viaje o, si no
 * hay, abre una ya resuelta (origen Mantenimiento) para que llegue a caja.
 * Las demás revisiones solo quedan a la vista en la bandeja de solicitudes.
 * Devuelve un aviso para el técnico, o null. Nunca lanza.
 */
export async function enlazarRevisionDirecta(rev: RevisionDirecta): Promise<string | null> {
  try {
    if (rev.tipoNovedad !== TIPO_CAMARA_RECOBRO || rev.aforo == null || rev.despachoNumero == null) return null;
    const db = createAdminClient();
    const numero = rev.despachoNumero;
    const snap = await instantaneaRecobro(numero, rev.fechaViaje, "recobro", rev.aforo, db);
    const dif = snap.diferencia as number | null;
    if (dif == null) return "El recobro no llegó a Tesorería: GEMA no tiene las timbradas de ese viaje. Resuélvalo en Solicitudes cuando estén.";
    if (dif <= 0) return `El conteo (${rev.aforo}) no supera las timbradas de la registradora (${snap.timbradas_registradora}): no se creó recobro.`;

    const ahora = new Date().toISOString();
    const { data: sol, error } = await db
      .from("tesoreria_camaras_solicitudes")
      .select("id, estado, anulada_at, tomado_at")
      .eq("numero", numero)
      .order("solicitado_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const resolucion = {
      ...snap,
      estado: "resuelto",
      resultado: "recobro",
      nota_camaras: rev.observaciones,
      camaras_revision_id: rev.id,
      conteo_revision_id: rev.id,
      resuelto_por_email: rev.tecnicoEmail,
      resuelto_at: ahora,
    };

    if (sol) {
      if (sol.estado !== "pendiente" || sol.anulada_at) return null; // ya tiene resultado: lo cambia una corrección
      const { data: upd, error: eUpd } = await db
        .from("tesoreria_camaras_solicitudes")
        .update({ ...resolucion, ...(sol.tomado_at ? {} : { tomado_at: ahora, tomado_por_email: rev.tecnicoEmail }) })
        .eq("id", sol.id)
        .eq("estado", "pendiente")
        .select("id");
      if (eUpd) throw new Error(eUpd.message);
      if (upd?.length) await evento(db, sol.id, "revision_resuelta", { resultado: "recobro", ...snap, desde: "formulario" }, rev.tecnicoEmail);
      return `La solicitud de Tesorería de este viaje quedó resuelta como recobro de ${dif} ${dif === 1 ? "timbrada" : "timbradas"}.`;
    }

    const v = (await getDatosViajes([numero], db)).get(numero);
    const { data: nueva, error: eIns } = await db
      .from("tesoreria_camaras_solicitudes")
      .insert({
        fecha_viaje: rev.fechaViaje,
        numero,
        placa: v?.placa ?? null,
        viaje: /^\d+$/.test(rev.viaje) ? Number(rev.viaje) : null,
        vehiculo_codigo: rev.vehiculoCodigo,
        conductor_cedula: rev.conductorCedula,
        conductor_nombre: rev.conductorNombre,
        ruta: v?.ruta ?? null,
        solicitado_por_email: rev.tecnicoEmail,
        solicitado_at: ahora,
        nota_solicitud: "Recobro registrado por Mantenimiento sin solicitud.",
        tipo: "camara",
        origen: "mantenimiento",
        tomado_at: ahora,
        tomado_por_email: rev.tecnicoEmail,
        ...resolucion,
      })
      .select("id")
      .single();
    if (eIns) throw new Error(eIns.message);
    await evento(db, nueva.id, "solicitud_creada", { origen: "mantenimiento", camaras_revision_id: rev.id }, rev.tecnicoEmail);
    await evento(db, nueva.id, "revision_resuelta", { resultado: "recobro", ...snap, desde: "formulario" }, rev.tecnicoEmail);
    return `Se envió a Tesorería un recobro de ${dif} ${dif === 1 ? "timbrada" : "timbradas"}.`;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[recobros] enlace de revisión directa:", error);
    return `La revisión quedó guardada, pero no se pudo enviar el recobro a Tesorería: ${error}`;
  }
}
