"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccess, canAccessSub, puedeEditarEn, tienePermiso, type Permissions } from "@/lib/permissions";
import { nowBogotaISO } from "@/lib/utils";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import {
  NOMBRE_NOVEDAD,
  TIPOS_TRASLADO,
  VALOR_UNITARIO_SUGERIDO,
  quincenaDeFecha,
  siguienteCorte,
  type TipoNovedad,
} from "./calculo";
import { INICIO_OTROS_DEVENGADOS, cargarCruce, corteCerrado, getPeriodo } from "./data";
import type { SupabaseClient } from "@supabase/supabase-js";

const MODULO_AUDIT = "otros_devengados";
/** Lo que digita Operativo; el casino solo llega por la plantilla de Excel. */
const TIPOS_OPERATIVO: readonly TipoNovedad[] = ["perdida_turno", "perdida_viaje", "devolucion_viaje"];
/** Tipos que se cargan con plantilla de Excel. */
const TIPOS_PLANTILLA = ["casino", "perdida_turno"] as const;
export type TipoPlantilla = (typeof TIPOS_PLANTILLA)[number];
/** Solo Tesorería: el casino y el traslado de saldo. */
const SOLO_TESORERIA: readonly TipoNovedad[] = ["casino", ...TIPOS_TRASLADO];

function puedeTesoreria(perms: Permissions) {
  return (
    canAccess(perms, "tesoreria") &&
    canAccessSub(perms, "tesoreria", "otros_devengados") &&
    tienePermiso(perms, "tesoreria.otros_devengados.editar")
  );
}
function puedeOperativo(perms: Permissions) {
  return perms.isAdmin || (canAccess(perms, "operativo") && puedeEditarEn(perms, "operativo"));
}

/** Mensaje de error (o null) según quién puede registrar ese tipo. */
async function faltaPermisoNovedad(tipo: TipoNovedad) {
  const perms = await getCurrentPermissions();
  const ok = SOLO_TESORERIA.includes(tipo) ? puedeTesoreria(perms) : puedeOperativo(perms) || puedeTesoreria(perms);
  return { perms, error: ok ? null : `No tienes permisos para registrar ${NOMBRE_NOVEDAD[tipo].toLowerCase()}.` };
}

/** Corte válido: desde el primer corte de la opción hasta el actual. */
function validarCorte(periodo: string, quincena: number): string | null {
  if (!/^\d{4}-\d{2}$/.test(periodo) || (quincena !== 1 && quincena !== 2)) return "Corte inválido.";
  const actual = quincenaDeFecha(nowBogotaISO().slice(0, 10));
  const clave = `${periodo}-${quincena}`;
  const primero = quincenaDeFecha(INICIO_OTROS_DEVENGADOS);
  if (clave < `${primero.periodo}-${primero.quincena}`) return "Otros devengados arranca en la 1.ª quincena de noviembre de 2026.";
  if (clave > `${actual.periodo}-${actual.quincena}`) return "No se registran descuentos de un corte que no ha empezado.";
  return null;
}

/** Mensaje si el corte ya está cerrado (no admite novedades), o null. */
async function bloqueoCorte(db: SupabaseClient, periodo: string, quincena: number): Promise<string | null> {
  return (await corteCerrado(db, { periodo, quincena }))
    ? `La ${quincena === 1 ? "1.ª" : "2.ª"} quincena de ${periodo} ya está cerrada: no admite cambios.`
    : null;
}

function revalidar() {
  revalidatePath("/operativo/descuentos-conductores");
  revalidatePath("/tesoreria/otros-devengados");
}

export interface NovedadInput {
  periodo: string;
  quincena: number;
  cedula: string;
  tipo: TipoNovedad;
  fecha: string | null;
  cantidad: number | null;
  valor: number;
  observacion: string | null;
}

export async function registrarNovedad(input: NovedadInput): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!TIPOS_OPERATIVO.includes(input.tipo)) return { ok: false, error: "Tipo de novedad no válido en este formulario." };
    const { perms, error: sinPermiso } = await faltaPermisoNovedad(input.tipo);
    if (sinPermiso) return { ok: false, error: sinPermiso };
    const quincena = Number(input.quincena);
    const corte = validarCorte(input.periodo, quincena);
    if (corte) return { ok: false, error: corte };
    const valor = Math.round(Number(input.valor));
    if (!Number.isFinite(valor) || valor <= 0) return { ok: false, error: "El valor debe ser mayor que cero." };
    const cantidad = input.cantidad == null || input.cantidad === ("" as unknown) ? null : Number(input.cantidad);
    if (cantidad != null && (!Number.isFinite(cantidad) || cantidad <= 0)) return { ok: false, error: "La cantidad debe ser mayor que cero." };
    if (input.fecha) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return { ok: false, error: "Fecha inválida." };
      const q = quincenaDeFecha(input.fecha);
      if (q.periodo !== input.periodo || q.quincena !== quincena) return { ok: false, error: "La fecha no está dentro del corte elegido." };
    }

    const db = createAdminClient();
    const cerrado = await bloqueoCorte(db, input.periodo, quincena);
    if (cerrado) return { ok: false, error: cerrado };
    const cedula = String(input.cedula).replace(/\D/g, "");
    const { data: c } = await db.from("conductores").select("cedula, codigo, nombre").eq("cedula", cedula).maybeSingle();
    if (!c) return { ok: false, error: "Conductor no encontrado." };

    const { data, error } = await db
      .from("otros_devengados_novedades")
      .insert({
        periodo: input.periodo,
        quincena,
        cedula_conductor: c.cedula,
        codigo_conductor: c.codigo,
        conductor_nombre: c.nombre,
        tipo: input.tipo,
        fecha: input.fecha || null,
        cantidad,
        valor,
        observacion: input.observacion?.trim() || null,
        origen: "operativo",
        registrada_por: perms.userId,
        registrada_por_email: perms.userEmail,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: `No se pudo registrar: ${error.message}` };

    await logTesoreriaAudit({
      accion: "otros_devengados_novedad",
      modulo: MODULO_AUDIT,
      cedulaConductor: c.cedula,
      conductorNombre: c.nombre,
      valor,
      rol: perms.userType,
      detalle: { novedad_id: data.id, tipo: input.tipo, corte: `${input.periodo} Q${quincena}`, cantidad, fecha: input.fecha },
    });
    revalidar();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function anularNovedad(input: { id: string; motivo: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const db = createAdminClient();
    const { data: n } = await db
      .from("otros_devengados_novedades")
      .select("id, tipo, estado, cedula_conductor, conductor_nombre, valor, periodo, quincena, carga_id")
      .eq("id", input.id)
      .maybeSingle();
    if (!n) return { ok: false, error: "La novedad no existe." };
    const { perms, error: sinPermiso } = await faltaPermisoNovedad(n.tipo as TipoNovedad);
    if (sinPermiso) return { ok: false, error: sinPermiso };
    const motivo = String(input.motivo ?? "").trim();
    if (motivo.length < 5) return { ok: false, error: "Escribe el motivo de la anulación." };
    if (n.estado !== "activa") return { ok: false, error: "La novedad ya estaba anulada." };
    const cerrado = await bloqueoCorte(db, n.periodo, n.quincena);
    if (cerrado) return { ok: false, error: cerrado };
    if (TIPOS_TRASLADO.includes(n.tipo as TipoNovedad) && n.carga_id) {
      // La pareja del traslado vive en otro corte: tampoco puede estar cerrado.
      const { data: pareja } = await db
        .from("otros_devengados_novedades")
        .select("periodo, quincena")
        .eq("carga_id", n.carga_id)
        .neq("id", n.id);
      for (const q of pareja ?? []) {
        const c2 = await bloqueoCorte(db, q.periodo, q.quincena);
        if (c2) return { ok: false, error: `No se puede anular el traslado: ${c2}` };
      }
    }

    // Un traslado de saldo son dos filas (ajuste y saldo del corte siguiente):
    // se anulan juntas por su carga_id.
    const esTraslado = TIPOS_TRASLADO.includes(n.tipo as TipoNovedad) && n.carga_id;
    let upd = db
      .from("otros_devengados_novedades")
      .update({ estado: "anulada", anulada_motivo: motivo, anulada_at: new Date().toISOString(), anulada_por_email: perms.userEmail })
      .eq("estado", "activa");
    upd = esTraslado ? upd.eq("carga_id", n.carga_id).in("tipo", [...TIPOS_TRASLADO]) : upd.eq("id", input.id);
    const { error } = await upd;
    if (error) return { ok: false, error: `No se pudo anular: ${error.message}` };

    await logTesoreriaAudit({
      accion: "otros_devengados_novedad_anulada",
      modulo: MODULO_AUDIT,
      cedulaConductor: n.cedula_conductor,
      conductorNombre: n.conductor_nombre,
      valor: Number(n.valor),
      rol: perms.userType,
      detalle: { novedad_id: n.id, tipo: n.tipo, corte: `${n.periodo} Q${n.quincena}`, motivo },
    });
    revalidar();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface FilaPlantilla {
  /** Fila del Excel (para los mensajes de error). */
  fila: number;
  cedula: string;
  cantidad?: number | null;
  /** Valor total; si viene vacío y hay cantidad, se usa cantidad × valor sugerido. */
  valor: number | null;
  observacion?: string | null;
}

export interface ResultadoPlantilla {
  ok: boolean;
  error?: string;
  cargadas?: number;
  total?: number;
  reemplazadas?: number;
  /** Filas rechazadas, con su motivo. */
  rechazadas?: { fila: number; cedula: string; motivo: string }[];
}

/**
 * Carga una plantilla de Excel (casino o pérdida de turno) para un corte.
 * Reemplaza lo que se hubiera cargado ANTES POR EXCEL de ese tipo y corte
 * (queda anulado con el motivo «reemplazado por el cargue …»); lo digitado a
 * mano en el formulario no se toca. Si alguna fila es inválida no se carga
 * nada.
 */
export async function cargarPlantillaNovedad(input: {
  tipo: TipoPlantilla;
  periodo: string;
  quincena: number;
  archivo: string;
  filas: FilaPlantilla[];
}): Promise<ResultadoPlantilla> {
  try {
    if (!TIPOS_PLANTILLA.includes(input.tipo)) return { ok: false, error: "Tipo de plantilla no válido." };
    const tipo = input.tipo;
    const { perms, error: sinPermiso } = await faltaPermisoNovedad(tipo);
    if (sinPermiso) return { ok: false, error: sinPermiso };
    const quincena = Number(input.quincena);
    const corte = validarCorte(input.periodo, quincena);
    if (corte) return { ok: false, error: corte };
    if (!Array.isArray(input.filas) || input.filas.length === 0) return { ok: false, error: "La plantilla no trae filas." };
    if (input.filas.length > 3000) return { ok: false, error: "La plantilla trae más de 3.000 filas." };
    const unitario = VALOR_UNITARIO_SUGERIDO[tipo] ?? 0;

    const db = createAdminClient();
    const cerrado = await bloqueoCorte(db, input.periodo, quincena);
    if (cerrado) return { ok: false, error: cerrado };
    const rechazadas: NonNullable<ResultadoPlantilla["rechazadas"]> = [];
    // Una fila por cédula: si viene repetida, se suma.
    const porCedula = new Map<string, { valor: number; cantidad: number | null; obs: string[]; filas: number[] }>();
    for (const f of input.filas) {
      const ced = String(f.cedula ?? "").replace(/\D/g, "");
      const cantidad = f.cantidad == null || !Number.isFinite(Number(f.cantidad)) ? null : Number(f.cantidad);
      let valor = f.valor == null ? null : Math.round(Number(f.valor));
      if ((valor == null || valor === 0) && cantidad && unitario) valor = Math.round(cantidad * unitario);
      if (!ced) { rechazadas.push({ fila: f.fila, cedula: String(f.cedula ?? ""), motivo: "Sin cédula" }); continue; }
      if (cantidad != null && cantidad < 0) { rechazadas.push({ fila: f.fila, cedula: ced, motivo: "Cantidad negativa" }); continue; }
      if (valor == null || !Number.isFinite(valor) || valor < 0) { rechazadas.push({ fila: f.fila, cedula: ced, motivo: "Valor inválido" }); continue; }
      if (valor === 0) continue;
      const p = porCedula.get(ced) ?? { valor: 0, cantidad: null, obs: [], filas: [] };
      p.valor += valor;
      if (cantidad != null) p.cantidad = (p.cantidad ?? 0) + cantidad;
      if (f.observacion?.trim()) p.obs.push(f.observacion.trim());
      p.filas.push(f.fila);
      porCedula.set(ced, p);
    }
    const cedulas = [...porCedula.keys()];
    const maestro = new Map<string, { cedula: string; codigo: string | null; nombre: string | null }>();
    for (let i = 0; i < cedulas.length; i += 300) {
      const { data, error } = await db.from("conductores").select("cedula, codigo, nombre").in("cedula", cedulas.slice(i, i + 300));
      if (error) return { ok: false, error: error.message };
      for (const c of data ?? []) maestro.set(c.cedula, c);
    }
    for (const [ced, p] of porCedula) {
      if (!maestro.has(ced)) rechazadas.push({ fila: p.filas[0], cedula: ced, motivo: "La cédula no es de un conductor" });
    }
    if (rechazadas.length) {
      return { ok: false, error: `Hay ${rechazadas.length} fila(s) con error. Corrige la plantilla y vuelve a cargarla.`, rechazadas };
    }
    if (porCedula.size === 0) return { ok: false, error: "La plantilla no trae valores mayores que cero." };

    const cargaId = randomUUID();
    const archivo = String(input.archivo ?? "").slice(0, 200) || `${tipo}.xlsx`;
    const { data: previas, error: e1 } = await db
      .from("otros_devengados_novedades")
      .update({
        estado: "anulada",
        anulada_motivo: `Reemplazado por el cargue ${archivo}`,
        anulada_at: new Date().toISOString(),
        anulada_por_email: perms.userEmail,
      })
      .eq("periodo", input.periodo)
      .eq("quincena", quincena)
      .eq("tipo", tipo)
      .eq("origen", "excel")
      .eq("estado", "activa")
      .select("id");
    if (e1) return { ok: false, error: `No se pudo reemplazar el cargue anterior: ${e1.message}` };

    const registros = [...porCedula].map(([ced, p]) => {
      const c = maestro.get(ced)!;
      return {
        periodo: input.periodo,
        quincena,
        cedula_conductor: c.cedula,
        codigo_conductor: c.codigo,
        conductor_nombre: c.nombre,
        tipo,
        cantidad: p.cantidad,
        valor: p.valor,
        observacion: p.obs.join(" · ") || null,
        origen: "excel",
        carga_id: cargaId,
        archivo,
        registrada_por: perms.userId,
        registrada_por_email: perms.userEmail,
      };
    });
    for (let i = 0; i < registros.length; i += 500) {
      const { error } = await db.from("otros_devengados_novedades").insert(registros.slice(i, i + 500));
      if (error) {
        // Deshace lo insertado de este cargue para no dejarlo a medias.
        await db.from("otros_devengados_novedades").update({ estado: "anulada", anulada_motivo: "Cargue incompleto" }).eq("carga_id", cargaId);
        return { ok: false, error: `No se pudo cargar: ${error.message}. El cargue anterior quedó anulado; vuelve a cargar la plantilla.` };
      }
    }
    const total = registros.reduce((t, r) => t + r.valor, 0);
    await logTesoreriaAudit({
      accion: tipo === "casino" ? "otros_devengados_casino" : "otros_devengados_plantilla",
      modulo: MODULO_AUDIT,
      valor: total,
      rol: perms.userType,
      detalle: { tipo, carga_id: cargaId, archivo, corte: `${input.periodo} Q${quincena}`, conductores: registros.length, reemplazadas: previas?.length ?? 0 },
    });
    revalidar();
    return { ok: true, cargadas: registros.length, total, reemplazadas: previas?.length ?? 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Lleva a cero el saldo negativo de un conductor en un corte (descuento sin
 * cubrir o entrega de más) y descuenta la misma diferencia en el corte
 * siguiente. Se recalcula en el servidor; del cliente solo llega la cédula.
 */
export async function trasladarSaldoNegativo(input: {
  codPer: string;
  cedula: string;
  observacion: string | null;
}): Promise<{ ok: true; valor: number; corteSiguiente: string } | { ok: false; error: string }> {
  try {
    const { perms, error: sinPermiso } = await faltaPermisoNovedad("ajuste_saldo");
    if (sinPermiso) return { ok: false, error: sinPermiso };
    const db = createAdminClient();
    const periodo = await getPeriodo(db, String(input.codPer));
    if (!periodo) return { ok: false, error: "El período no es de la nómina de conductores de Otros devengados." };
    if (!periodo.cerrada) return { ok: false, error: "La nómina todavía no está cerrada: el saldo del corte no es definitivo." };
    const cedula = String(input.cedula).replace(/\D/g, "");
    const cruce = await cargarCruce(db, periodo);
    const fila = cruce.filas.find((f) => f.cedula === cedula);
    if (!fila) return { ok: false, error: "El conductor no está en el cruce de este corte." };
    const valor = Math.round(fila.saldoNegativo);
    if (valor <= 0) return { ok: false, error: "El conductor no tiene saldo negativo en este corte." };

    const q = periodo.quincena;
    const sig = siguienteCorte(q);
    for (const c of [q, sig]) {
      const cerrado = await bloqueoCorte(db, c.periodo, c.quincena);
      if (cerrado) return { ok: false, error: cerrado };
    }
    const cargaId = randomUUID();
    const obs = input.observacion?.trim() || null;
    const base = {
      cedula_conductor: cedula,
      codigo_conductor: fila.codigo,
      conductor_nombre: fila.nombre,
      valor,
      origen: "traslado",
      carga_id: cargaId,
      registrada_por: perms.userId,
      registrada_por_email: perms.userEmail,
    };
    // Las dos filas en un solo insert: o quedan las dos o ninguna.
    const { error } = await db.from("otros_devengados_novedades").insert([
      {
        ...base,
        periodo: q.periodo,
        quincena: q.quincena,
        tipo: "ajuste_saldo",
        observacion: `Saldo negativo llevado a cero; se descuenta en ${sig.periodo} Q${sig.quincena}${obs ? ` · ${obs}` : ""}`,
      },
      {
        ...base,
        periodo: sig.periodo,
        quincena: sig.quincena,
        tipo: "saldo_anterior",
        observacion: `Saldo negativo de ${q.periodo} Q${q.quincena} (nómina ${periodo.codigo})${obs ? ` · ${obs}` : ""}`,
      },
    ]);
    if (error) return { ok: false, error: `No se pudo registrar el traslado: ${error.message}` };

    await logTesoreriaAudit({
      accion: "otros_devengados_traslado_saldo",
      modulo: MODULO_AUDIT,
      cedulaConductor: cedula,
      conductorNombre: fila.nombre,
      valor,
      rol: perms.userType,
      valorAnterior: String(-valor),
      valorNuevo: "0",
      detalle: { carga_id: cargaId, desde: `${q.periodo} Q${q.quincena}`, hacia: `${sig.periodo} Q${sig.quincena}`, cod_per: periodo.codigo, observacion: obs },
    });
    revalidar();
    return { ok: true, valor, corteSiguiente: `${sig.periodo} Q${sig.quincena}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface FilaGestor {
  /** Fila del archivo (para los mensajes de error). */
  fila: number;
  fecha: string; // 'YYYY-MM-DD'
  novedad: string | null;
  detalle: string | null;
  vehiculo: string | null;
  placa: string | null;
  conductor: string | null;
  turno: string | null;
  viaje: string | null;
  ruta: string | null;
  tipoGestor: string | null;
  valor: number;
  observacion: string | null;
}

const normalizarNombre = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Carga el «Reporte Gestor Viajes Perdidos» de GEMA como pérdida de viaje.
 * GEMA no expone el valor del gestor por sus procedimientos externos
 * (verificado el 2026-11-04), así que se sube el reporte tal cual lo exporta.
 *
 * - Entra cada viaje con VALOR GESTOR > 0 (los justificados vienen en 0).
 * - El reporte no trae cédula: se toma del viaje perdido sincronizado de GEMA
 *   (fecha + bus + turno + viaje) y, si no está, del maestro por nombre.
 * - El corte es la quincena de la fecha del viaje.
 * - Reemplaza lo cargado antes desde el reporte en el mismo rango de fechas
 *   (origen 'gema'); lo digitado a mano no se toca.
 * - Si alguna fila no se puede resolver, no se carga nada.
 */
export async function cargarReporteGestor(input: {
  archivo: string;
  filas: FilaGestor[];
}): Promise<ResultadoPlantilla & { ignoradas?: number; cortes?: string[] }> {
  try {
    const { perms, error: sinPermiso } = await faltaPermisoNovedad("perdida_viaje");
    if (sinPermiso) return { ok: false, error: sinPermiso };
    if (!Array.isArray(input.filas) || input.filas.length === 0) return { ok: false, error: "El reporte no trae viajes." };
    if (input.filas.length > 5000) return { ok: false, error: "El reporte trae más de 5.000 viajes." };

    const rechazadas: NonNullable<ResultadoPlantilla["rechazadas"]> = [];
    const validas: FilaGestor[] = [];
    let ignoradas = 0;
    for (const f of input.filas) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.fecha))) {
        rechazadas.push({ fila: f.fila, cedula: f.conductor ?? "", motivo: "Fecha inválida" });
        continue;
      }
      const valor = Math.round(Number(f.valor));
      if (!Number.isFinite(valor) || valor < 0) {
        rechazadas.push({ fila: f.fila, cedula: f.conductor ?? "", motivo: "Valor gestor inválido" });
        continue;
      }
      if (valor === 0) {
        ignoradas++;
        continue;
      }
      const q = quincenaDeFecha(f.fecha);
      const corte = validarCorte(q.periodo, q.quincena);
      if (corte) {
        rechazadas.push({ fila: f.fila, cedula: f.conductor ?? "", motivo: corte });
        continue;
      }
      validas.push({ ...f, valor });
    }
    if (validas.length === 0 && rechazadas.length === 0) {
      return { ok: false, error: "El reporte no trae viajes con valor gestor mayor que cero." };
    }

    const db = createAdminClient();
    const cortesArchivo = [...new Map(validas.map((f) => { const q = quincenaDeFecha(f.fecha); return [`${q.periodo}-${q.quincena}`, q]; })).values()];
    for (const q of cortesArchivo) {
      const cerrado = await bloqueoCorte(db, q.periodo, q.quincena);
      if (cerrado) return { ok: false, error: `${cerrado} Quita esas fechas del reporte.` };
    }
    const fechas = validas.map((f) => f.fecha).sort();
    const desde = fechas[0];
    const hasta = fechas[fechas.length - 1];

    // Cédula por viaje perdido sincronizado de GEMA.
    const clave = (fecha: string, veh: unknown, turno: unknown, viaje: unknown) =>
      `${fecha}|${String(veh ?? "").trim()}|${String(turno ?? "").trim()}|${String(viaje ?? "").trim()}`;
    const porViaje = new Map<string, string>();
    if (desde) {
      for (let d = 0; ; d += 1000) {
        const { data, error } = await db
          .from("viajes_perdidos")
          .select("id, cedula_conductor, fecha, vehiculo, turno, viaje")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("id", { ascending: true })
          .range(d, d + 999);
        if (error) return { ok: false, error: error.message };
        for (const v of data ?? []) {
          if (v.cedula_conductor && v.cedula_conductor !== "99999999") {
            porViaje.set(clave(v.fecha, v.vehiculo, v.turno, v.viaje), v.cedula_conductor);
          }
        }
        if (!data || data.length < 1000) break;
      }
    }
    // Respaldo por nombre (maestro completo de conductores, paginado).
    const porNombre = new Map<string, string[]>();
    const maestro = new Map<string, { cedula: string; codigo: string | null; nombre: string | null }>();
    for (let d = 0; ; d += 1000) {
      const { data, error } = await db
        .from("conductores")
        .select("cedula, codigo, nombre")
        .order("cedula", { ascending: true })
        .range(d, d + 999);
      if (error) return { ok: false, error: error.message };
      for (const c of data ?? []) {
        maestro.set(c.cedula, c);
        const k = normalizarNombre(c.nombre);
        porNombre.set(k, [...(porNombre.get(k) ?? []), c.cedula]);
      }
      if (!data || data.length < 1000) break;
    }

    const registros: Record<string, unknown>[] = [];
    const cargaId = randomUUID();
    const archivo = String(input.archivo ?? "").slice(0, 200) || "reporte_gestor_viajes_perdidos";
    for (const f of validas) {
      let ced = porViaje.get(clave(f.fecha, f.vehiculo, f.turno, f.viaje)) ?? null;
      if (!ced) {
        const candidatos = porNombre.get(normalizarNombre(f.conductor)) ?? [];
        if (candidatos.length === 1) ced = candidatos[0];
      }
      const c = ced ? maestro.get(ced) : undefined;
      if (!c) {
        rechazadas.push({ fila: f.fila, cedula: f.conductor ?? "", motivo: "No se pudo identificar al conductor (ni por el viaje ni por el nombre)" });
        continue;
      }
      const q = quincenaDeFecha(f.fecha);
      const partes = [
        [f.novedad, f.detalle].filter(Boolean).join(" · "),
        `bus ${f.vehiculo ?? "?"} turno ${f.turno ?? "?"} viaje ${f.viaje ?? "?"}`,
        f.ruta,
        f.observacion ? `gestor: ${f.observacion}` : null,
      ].filter(Boolean);
      registros.push({
        periodo: q.periodo,
        quincena: q.quincena,
        cedula_conductor: c.cedula,
        codigo_conductor: c.codigo,
        conductor_nombre: c.nombre,
        tipo: "perdida_viaje",
        fecha: f.fecha,
        cantidad: 1,
        valor: f.valor,
        observacion: partes.join(" · ").slice(0, 500),
        origen: "gema",
        carga_id: cargaId,
        archivo,
        registrada_por: perms.userId,
        registrada_por_email: perms.userEmail,
      });
    }
    if (rechazadas.length) {
      return { ok: false, error: `Hay ${rechazadas.length} fila(s) con error. No se cargó nada.`, rechazadas };
    }

    const { data: previas, error: e1 } = await db
      .from("otros_devengados_novedades")
      .update({
        estado: "anulada",
        anulada_motivo: `Reemplazado por el cargue ${archivo}`,
        anulada_at: new Date().toISOString(),
        anulada_por_email: perms.userEmail,
      })
      .eq("tipo", "perdida_viaje")
      .eq("origen", "gema")
      .eq("estado", "activa")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .select("id");
    if (e1) return { ok: false, error: `No se pudo reemplazar el cargue anterior: ${e1.message}` };

    for (let i = 0; i < registros.length; i += 500) {
      const { error } = await db.from("otros_devengados_novedades").insert(registros.slice(i, i + 500));
      if (error) {
        await db.from("otros_devengados_novedades").update({ estado: "anulada", anulada_motivo: "Cargue incompleto" }).eq("carga_id", cargaId);
        return { ok: false, error: `No se pudo cargar: ${error.message}. El cargue anterior quedó anulado; vuelve a cargar el reporte.` };
      }
    }
    const total = registros.reduce((t, r) => t + Number(r.valor), 0);
    const cortes = [...new Set(registros.map((r) => `${r.periodo} Q${r.quincena}`))];
    await logTesoreriaAudit({
      accion: "otros_devengados_plantilla",
      modulo: MODULO_AUDIT,
      valor: total,
      rol: perms.userType,
      detalle: { tipo: "perdida_viaje", fuente: "reporte gestor GEMA", carga_id: cargaId, archivo, desde, hasta, cortes, viajes: registros.length, ignoradas, reemplazadas: previas?.length ?? 0 },
    });
    revalidar();
    return { ok: true, cargadas: registros.length, total, reemplazadas: previas?.length ?? 0, ignoradas, cortes };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
