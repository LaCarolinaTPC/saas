import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { queryView, callProc } from "./client";
import {
  toStr,
  toNum,
  toBool,
  toCedula,
  toDate,
  toTimestamp,
  estadoConductor,
  normalizeCodigo,
} from "./map";

type Row = Record<string, unknown>;
type Admin = SupabaseClient;

export type SyncResult = { dataset: string; rows: number; error?: string };

const BATCH = 500;

/** Upsert por lotes hacia Supabase. */
async function upsertBatched(
  db: Admin,
  table: string,
  rows: Row[],
  onConflict: string
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await db.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
  }
}

/**
 * Última fecha realmente recibida en el rango; si vino vacío devuelve el
 * fallback (inicio del rango) para NO avanzar el marcador. GEMA genera los
 * cierres/liquidaciones con días de atraso: si marcáramos `fin` con 0 filas,
 * esos días quedarían fuera de la ventana incremental para siempre.
 */
function maxFecha(records: Row[], campo: string, fallback: string): string {
  let max = "";
  for (const r of records) {
    const f = r[campo];
    if (typeof f === "string" && f > max) max = f;
  }
  return max || fallback;
}

async function setState(
  db: Admin,
  dataset: string,
  patch: Record<string, unknown>
): Promise<void> {
  await db
    .from("gema_sync_state")
    .update({ ...patch, last_run_at: new Date().toISOString() })
    .eq("dataset", dataset);
}

// ── MAESTROS ────────────────────────────────────────────────────────────────

export async function syncConductores(db: Admin): Promise<SyncResult> {
  const raw = await queryView("vst_ext_get_conductores");

  // Correo/ciudad no están en la vista de conductores → cruzamos con personal.
  const personal = await queryView("vst_ext_get_personal");
  const correoPorCedula = new Map<string, string>();
  for (const p of personal) {
    const ced = toCedula(p.identificacion);
    const correo = toStr(p.correopersonal);
    if (ced && correo) correoPorCedula.set(ced, correo);
  }

  // Dedup por cédula (origen tiene cédulas repetidas; cedula es UNIQUE en la app).
  const byCedula = new Map<string, Row>();
  for (const r of raw) {
    const cedula = toCedula(r.identificacion);
    if (!cedula) continue;
    byCedula.set(cedula, {
      cedula,
      nombre: toStr(r.nombre) ?? "SIN NOMBRE",
      codigo: normalizeCodigo(r.codigo_personal),
      correo: correoPorCedula.get(cedula) ?? null,
      direccion: toStr(r.direccion),
      celular: toStr(r.celular),
      telefono: toStr(r.telefono),
      tipo_conductor: toStr(r.tipo_coductor),
      licencia: toStr(r.num_licencia),
      venc_licencia: toDate(r.vencimiento_licencia),
      venc_contrato: toDate(r.vencimiento_contrato),
      fecha_ingreso: toDate(r.fecha_ingreso),
      fecha_retiro: toDate(r.fecha_retiro),
      experiencia: toDate(r.fecha_inicio_exp),
      fecha_nacimiento: toDate(r.fecha_nacimiento),
      observacion: toStr(r.observacion),
      eps: toStr(r.eps),
      arl: toStr(r.arl),
      pension: toStr(r.pension),
      compensacion: toStr(r.compensacion),
      tipo_sangre: toStr(r.tipo_sangre),
      nivel_educativo: toStr(r.nivel_educativo),
      num_hijos: toNum(r.num_hijos),
      estado_civil: toStr(r.estado_civil),
      reubicado: toBool(r.reubicado) ? "SI" : null,
      estado: estadoConductor(r.estado),
    });
  }

  const records = [...byCedula.values()];
  await upsertBatched(db, "conductores", records, "cedula");
  await setState(db, "conductores", { rows_synced: records.length, status: "ok", error: null });
  return { dataset: "conductores", rows: records.length };
}

export async function syncPropietarios(db: Admin): Promise<SyncResult> {
  const raw = await queryView("vst_ext_get_propietarios");
  const byCedula = new Map<string, Row>();
  for (const r of raw) {
    const cedula = toCedula(r.identificacion);
    if (!cedula) continue;
    byCedula.set(cedula, {
      cedula,
      codigo: normalizeCodigo(r.codigo_personal),
      nombre: toStr(r.nombre),
      tipo_identificacion: toStr(r.tipo_identificacion),
      tipo_propietario: toStr(r.tipo_propietario),
      plazo_pago: toStr(r.plazo_pago),
      direccion: toStr(r.direccion),
      telefono: toStr(r.telefono),
      celular: toStr(r.celular),
      correo: toStr(r.correopersonal),
      estado: toBool(r.estado) ? "ACTIVO" : "INACTIVO",
    });
  }
  const records = [...byCedula.values()];
  await upsertBatched(db, "propietarios", records, "cedula");
  await setState(db, "propietarios", { rows_synced: records.length, status: "ok", error: null });
  return { dataset: "propietarios", rows: records.length };
}

export async function syncEmpleados(db: Admin): Promise<SyncResult> {
  const raw = await queryView("vst_ext_get_empleados");

  // El correo no está en la vista de empleados → lo traemos de personal.
  const personal = await queryView("vst_ext_get_personal");
  const correoPorCedula = new Map<string, string>();
  for (const p of personal) {
    const ced = toCedula(p.identificacion);
    const correo = toStr(p.correopersonal);
    if (ced && correo) correoPorCedula.set(ced, correo);
  }

  // Resolver/crear departamentos por nombre.
  const { data: depRows } = await db.from("departments").select("id, name");
  const depByName = new Map<string, string>(
    (depRows ?? []).map((d) => [d.name.toUpperCase(), d.id])
  );
  const faltantes = new Set<string>();
  for (const r of raw) {
    const dep = toStr(r.departamento);
    if (dep && !depByName.has(dep.toUpperCase())) faltantes.add(dep);
  }
  if (faltantes.size) {
    const { data: nuevos } = await db
      .from("departments")
      .upsert([...faltantes].map((name) => ({ name })), { onConflict: "name" })
      .select("id, name");
    for (const d of nuevos ?? []) depByName.set(d.name.toUpperCase(), d.id);
  }

  const byCodigo = new Map<string, Row>();
  for (const r of raw) {
    const codigo = normalizeCodigo(r.codigo_personal);
    if (!codigo) continue;
    // Los de cargo conductor van al módulo Conductores, no a Empleados.
    if ((toStr(r.cargo) ?? "").toUpperCase().includes("CONDUCTOR")) continue;
    const hireDate = toDate(r.fecha_ingreso); // puede ser null
    const dep = toStr(r.departamento);
    const cedula = toCedula(r.identificacion);
    byCodigo.set(codigo, {
      gema_codigo: codigo,
      source: "gema",
      full_name: toStr(r.nombre) ?? "SIN NOMBRE",
      document_number: cedula,
      email: cedula ? correoPorCedula.get(cedula) ?? null : null,
      phone: toStr(r.celular),
      department_id: dep ? depByName.get(dep.toUpperCase()) ?? null : null,
      position: toStr(r.cargo) ?? "SIN CARGO",
      status: toBool(r.estado) ? "activo" : "retirado",
      hire_date: hireDate,
      end_date: toDate(r.fecha_retiro),
    });
  }
  const records = [...byCodigo.values()];
  await upsertBatched(db, "employees", records, "gema_codigo");
  // Limpiar conductores que hubieran entrado a employees en sincros previas.
  await db
    .from("employees")
    .delete()
    .eq("source", "gema")
    .ilike("position", "%CONDUCTOR%");
  await setState(db, "empleados", { rows_synced: records.length, status: "ok", error: null });
  return { dataset: "empleados", rows: records.length };
}

// ── OPERACIONALES (por rango de fechas) ──────────────────────────────────────

export async function syncCierres(db: Admin, ini: string, fin: string): Promise<SyncResult> {
  const raw = await callProc("pa_ext_get_IngresoConductorByFecha", [ini, fin]);
  const byKey = new Map<string, Row>();
  for (const r of raw) {
    const cod = normalizeCodigo(r.codigoConductor);
    const fecha = toDate(r.fecha);
    if (!cod || !fecha) continue;
    const ruta = toStr(r.ruta) ?? "";
    byKey.set(`${cod}|${fecha}|${ruta}`, {
      cod_conductor: cod,
      conductor_nombre: toStr(r.conductor),
      fecha,
      tipo_cierre: toStr(r.tipoCierre),
      ruta,
      grupo_liquidacion: toStr(r.grupoLiquidacion),
      vehiculo: toStr(r.codigoVehiculo),
      viajes: toNum(r.viajes),
      timbradas: toNum(r.timbradas),
      diff_tim: null,
      prom_tim: toNum(r.promTimbradas),
      pct_indiv: toNum(r.porcentajeInd),
      pct_grupo: toNum(r.porcentajeGrupo),
      pct_total: toNum(r.totalPorcentaje),
      tim_grupo: null,
      viajes_grupo: null,
      prom_grupo: null,
      source_file: "GEMA",
      origen: "gema",
    });
  }
  const records = [...byKey.values()];
  await upsertBatched(db, "cierres_diarios", records, "cod_conductor,fecha,ruta");
  await setState(db, "cierres", {
    rows_synced: records.length, status: "ok", error: null,
    last_synced_date: maxFecha(records, "fecha", ini),
  });
  return { dataset: "cierres", rows: records.length };
}

export async function syncViajesPerdidos(db: Admin, ini: string, fin: string): Promise<SyncResult> {
  const raw = await callProc("pa_ext_get_ViajesByFecha", [ini, fin]);
  const records: Row[] = [];
  for (const r of raw) {
    // Viaje perdido = novedad distinta de NORMAL.
    if ((toStr(r.Novedad) ?? "NORMAL").toUpperCase() === "NORMAL") continue;
    const cedula = toCedula(r.ConductorCed);
    const fecha = toDate(r.FechaViaje);
    if (!cedula || !fecha) continue;
    const day = parseInt(fecha.split("-")[2], 10);
    records.push({
      cedula_conductor: cedula,
      tipologia: toStr(r.TipologiaNovedad),
      novedad: toStr(r.Novedad),
      detalle_novedad: toStr(r.DetalleNovedad),
      fecha,
      despacho: toStr(r.Despachador),
      tipo_propietario: toStr(r.TipoPropietario),
      vehiculo: toStr(r.Codigo),
      placa: toStr(r.Placa),
      conductor_nombre: toStr(r.Conductor),
      turno: toStr(r.Turno),
      viaje: toStr(r.Viaje),
      ruta: toStr(r.RutaProgramada) ?? toStr(r.RutaReprogramada),
      planillero: toStr(r.Planillero),
      periodo: fecha.slice(0, 7),
      quincena: day <= 15 ? 1 : 2,
      source_file: "GEMA",
      origen: "gema",
    });
  }
  // El esquema actual no tiene UNIQUE en viajes_perdidos: reemplazamos el rango.
  await db
    .from("viajes_perdidos")
    .delete()
    .eq("origen", "gema")
    .gte("fecha", ini)
    .lte("fecha", fin);
  for (let i = 0; i < records.length; i += BATCH) {
    const { error } = await db.from("viajes_perdidos").insert(records.slice(i, i + BATCH));
    if (error) throw new Error(`insert viajes_perdidos: ${error.message}`);
  }
  await setState(db, "viajes_perdidos", {
    rows_synced: records.length, status: "ok", error: null,
    last_synced_date: maxFecha(records, "fecha", ini),
  });
  return { dataset: "viajes_perdidos", rows: records.length };
}

export async function syncIngresoTercero(db: Admin, ini: string, fin: string): Promise<SyncResult> {
  const raw = await callProc("pa_ext_get_IngresoTerceroByFecha", [ini, fin]);
  const byKey = new Map<string, Row>();
  for (const r of raw) {
    const fecha = toDate(r.fecha);
    if (!fecha) continue;
    const veh = toStr(r.codigoVehiculo) ?? "";
    const ced = toCedula(r.cedulaConductor) ?? "";
    const ruta = toStr(r.ruta) ?? "";
    const grupo = toStr(r.grupoLiquidacion) ?? "";
    // Las 5 columnas de la clave única no pueden ser NULL (Postgres trata
    // los NULL como distintos y duplicaría en cada corrida).
    byKey.set(`${fecha}|${veh}|${ced}|${ruta}|${grupo}`, {
      fecha,
      tipo_cierre: toStr(r.tipoCierre),
      ruta,
      grupo_liquidacion: grupo,
      tipo_prom: toStr(r.tipoProm),
      tipo_gps: toStr(r.tipoGps),
      codigo_vehiculo: veh,
      placa: toStr(r.placa),
      cedula_conductor: ced,
      codigo_conductor: normalizeCodigo(r.codigoConductor),
      conductor_nombre: toStr(r.conductor),
      cedula_propietario: toCedula(r.cedulaPropietario),
      propietario_nombre: toStr(r.propietario),
      tipo_propietario: toStr(r.tipoPropietario),
      pasaje: toNum(r.pasaje),
      viajes: toNum(r.viajes),
      timbradas: toNum(r.timbradas),
      timbradas_cu: toNum(r.timbradasCU),
      descuento: toNum(r.descuento),
      fet: toNum(r.fet),
      factor_calidad: toNum(r.factorCalidad),
      valor_camb: toNum(r.valorCAMB),
      bruto: toNum(r.bruto),
      total_cartulina: toNum(r.totalCartulina),
      cartu_admon: toNum(r.cartuAdmon),
      cartu_estudio: toNum(r.cartuEstudio),
      cartu_fondo: toNum(r.cartuFondo),
      cartu_poliza: toNum(r.cartuPoliza),
      cartu_presta: toNum(r.cartuPresta),
      salario: toNum(r.salario),
      anticipo: toNum(r.anticipo),
      factura: toNum(r.factura),
      incentivo_c: toNum(r.incentivoC),
      valor_descuentos: toNum(r.valorDescuentos),
      combustible: toNum(r.combustible),
      sitra: toNum(r.sitra),
      rtica: toNum(r.rtica),
      admon: toNum(r.admon),
      liquido: toNum(r.liquido),
      source_file: "GEMA",
    });
  }
  const records = [...byKey.values()];
  await upsertBatched(
    db, "ingreso_tercero", records,
    "fecha,codigo_vehiculo,cedula_conductor,ruta,grupo_liquidacion"
  );
  await setState(db, "ingreso_tercero", {
    rows_synced: records.length, status: "ok", error: null,
    last_synced_date: maxFecha(records, "fecha", ini),
  });
  return { dataset: "ingreso_tercero", rows: records.length };
}

export async function syncViajesRecaudados(db: Admin, ini: string, fin: string): Promise<SyncResult> {
  const raw = await callProc("pa_ext_get_ViajesRecaudadosByFecha", [ini, fin]);
  const byNumero = new Map<number, Row>();
  for (const r of raw) {
    const numero = toNum(r.Numero);
    const fecha = toDate(r.FechaViaje);
    if (numero == null || !fecha) continue;
    byNumero.set(numero, {
      numero,
      fecha_viaje: fecha,
      hora_despacho: toStr(r.HoraDespacho),
      hora_llegada: toStr(r.HoraLlegada),
      codigo_vehiculo: toStr(r.Codigo),
      placa: toStr(r.Placa),
      conductor_nombre: toStr(r.Conductor),
      codigo_conductor: normalizeCodigo(r.ConductorCod),
      cedula_conductor: toCedula(r.ConductorCed),
      viaje: toStr(r.Viaje),
      inicial: toNum(r.Inicial),
      final: toNum(r.Final),
      descuento: toNum(r.Descuento),
      timbradas: toNum(r.Timbradas),
      timbradas_real: toNum(r.TimbradasReal),
      bruto: toNum(r.Bruto),
      anticipo: toNum(r.Anticipo),
      factura: toNum(r.factura),
      ahorro: toNum(r.Ahorro),
      neto: toNum(r.Neto),
      fecha_recaudo: toTimestamp(r.FechaRecaudo),
      is_extemporaneo: toBool(r.isExtemporaneo),
      cajero: toStr(r.Cajero),
      pasaje: toNum(r.Pasaje),
      propietario_nombre: toStr(r.Propietario),
      cedula_propietario: toCedula(r.PropietarioCed),
      estado: toStr(r.Estado),
      novedad: toStr(r.Novedad),
      ruta_programada: toStr(r.RutaProgramada),
      ruta_reprogramada: toStr(r.RutaReprogramada),
      is_viaje_contable: toBool(r.isViajeContable),
      source_file: "GEMA",
    });
  }
  const records = [...byNumero.values()];
  await upsertBatched(db, "viajes_recaudados", records, "numero");
  await setState(db, "viajes_recaudados", {
    rows_synced: records.length, status: "ok", error: null,
    last_synced_date: maxFecha(records, "fecha_viaje", ini),
  });
  return { dataset: "viajes_recaudados", rows: records.length };
}

// ── ORQUESTADOR ──────────────────────────────────────────────────────────────

const OPERACIONALES = [
  syncCierres,
  syncViajesPerdidos,
  syncIngresoTercero,
  syncViajesRecaudados,
] as const;

/**
 * Sincroniza maestros (refresco completo) + datos operacionales del rango
 * [ini, fin]. Cada dataset se aísla: un fallo registra el error en
 * gema_sync_state pero no aborta el resto.
 */
export async function runSync(ini: string, fin: string): Promise<SyncResult[]> {
  const db = createAdminClient();
  const results: SyncResult[] = [];

  const maestros = [syncConductores, syncEmpleados, syncPropietarios];
  for (const fn of maestros) {
    try {
      results.push(await fn(db));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ dataset: fn.name, rows: 0, error: msg });
    }
  }
  for (const fn of OPERACIONALES) {
    try {
      results.push(await fn(db, ini, fin));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ dataset: fn.name, rows: 0, error: msg });
    }
  }
  return results;
}
