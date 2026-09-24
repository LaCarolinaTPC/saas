/**
 * Carga y reversión del archivo contable — capa de datos (solo servidor).
 *
 * La lectura y la validación son puras (archivo-contable.ts); aquí se arma el
 * contexto real de cada período, se escribe en `financiera_contable_mes` por
 * lotes y se deja rastro en `financiera_cargas`. Nunca toca
 * `financiera_operativo_mes`: la parte de GEMA es de la consolidación.
 */

import ExcelJS from "exceljs";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  COLUMNAS_ARCHIVO,
  ETIQUETAS_COLUMNA,
  FILA_EJEMPLO,
  REEMPLAZO_EN_CERRADO_EXIGE_REAPERTURA,
  interpretarFilas,
  leerArchivo,
  validarContraConsolidado,
  type FilaArchivo,
  type PeriodoContexto,
  type ResultadoValidacion,
} from "./archivo-contable";
import { gastosContables, type EstadoPeriodo, type RubrosContables } from "./motor";

const LOTE = 500;
const PAGINA = 1000;

// ── Contexto real de los períodos que trae el archivo ────────────────────────

async function paginar<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const todo: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    const lote = data ?? [];
    todo.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return todo;
}

export async function contextoPeriodos(periodos: string[]): Promise<Map<string, PeriodoContexto>> {
  const mapa = new Map<string, PeriodoContexto>();
  if (periodos.length === 0) return mapa;
  const db = createAdminClient();

  const [estados, operativo, contable, flota, gema, maestro] = await Promise.all([
    paginar<{ periodo: string; estado: EstadoPeriodo }>((a, b) =>
      db.from("financiera_periodos").select("periodo, estado").in("periodo", periodos).range(a, b)
    ),
    paginar<{ periodo: string; codigo_vehiculo: string }>((a, b) =>
      db.from("financiera_operativo_mes").select("periodo, codigo_vehiculo").in("periodo", periodos).range(a, b)
    ),
    paginar<Record<string, string>>((a, b) =>
      db.from("financiera_contable_mes")
        .select("periodo, codigo_vehiculo, despacho, intereses, otros_gastos, repuestos, mano_de_obra, desc_fondo_conductor, combustible_vehiculos_nuevos, poliza_vehiculos_nuevos")
        .in("periodo", periodos).range(a, b)
    ),
    paginar<{ periodo: string; ingresos: string; gastos_gema: string }>((a, b) =>
      db.from("vw_financiera_flota_mes").select("periodo, ingresos, gastos_gema").in("periodo", periodos).range(a, b)
    ),
    paginar<{ periodo: string; codigo_vehiculo: string; combustible: string; poliza: string }>((a, b) =>
      db.from("vw_financiera_consolidado").select("periodo, codigo_vehiculo, combustible, poliza")
        .in("periodo", periodos).order("periodo").order("codigo_vehiculo").range(a, b)
    ),
    paginar<{ codigo: string }>((a, b) =>
      db.from("vehiculos").select("codigo").order("codigo").range(a, b)
    ),
  ]);
  const vehiculosMaestro = new Set(maestro.map((v) => String(v.codigo)));

  for (const e of estados) {
    mapa.set(e.periodo, {
      periodo: e.periodo,
      estado: e.estado,
      vehiculos: new Set<string>(),
      vehiculosMaestro,
      existentes: new Map<string, RubrosContables>(),
      ingresos: 0,
      gastosGema: 0,
      gemaPorVehiculo: new Map<string, { combustible: number; poliza: number }>(),
    });
  }
  for (const o of operativo) (mapa.get(o.periodo)?.vehiculos as Set<string> | undefined)?.add(o.codigo_vehiculo);
  for (const c of contable) {
    (mapa.get(c.periodo)?.existentes as Map<string, RubrosContables> | undefined)?.set(c.codigo_vehiculo, {
      despacho: Number(c.despacho), intereses: Number(c.intereses), otrosGastos: Number(c.otros_gastos),
      repuestos: Number(c.repuestos), manoDeObra: Number(c.mano_de_obra), descFondoConductor: Number(c.desc_fondo_conductor),
      combustibleVehiculosNuevos: Number(c.combustible_vehiculos_nuevos ?? 0),
      polizaVehiculosNuevos: Number(c.poliza_vehiculos_nuevos ?? 0),
    });
  }
  for (const f of flota) {
    const p = mapa.get(f.periodo);
    if (p) { p.ingresos = Number(f.ingresos); p.gastosGema = Number(f.gastos_gema); }
  }
  for (const g of gema) {
    const m = mapa.get(g.periodo)?.gemaPorVehiculo as Map<string, { combustible: number; poliza: number }> | undefined;
    m?.set(g.codigo_vehiculo, { combustible: Number(g.combustible), poliza: Number(g.poliza) });
  }
  return mapa;
}

/** Lee, interpreta y valida el archivo contra el estado real. No escribe nada. */
export async function previsualizarArchivo(nombre: string, datos: Buffer): Promise<ResultadoValidacion> {
  const tabla = leerArchivo(nombre, datos);
  if ("error" in tabla) {
    return { errorArchivo: tabla.error, validas: [], rechazadas: [], avisos: [], celdasVacias: 0, porPeriodo: [], totalFilas: 0 };
  }
  const interpretadas = interpretarFilas(tabla);
  if (interpretadas.errorArchivo) return validarContraConsolidado(interpretadas, new Map());
  const periodos = [...new Set(interpretadas.filas.map((f) => f.periodo))];
  const contexto = await contextoPeriodos(periodos);
  return validarContraConsolidado(interpretadas, contexto);
}

// ── Carga ────────────────────────────────────────────────────────────────────

export interface ResultadoCarga {
  cargaId: string;
  filas: number;
  rechazadas: number;
  periodos: string[];
}

/**
 * Escribe las filas válidas (upsert por período + vehículo, en lotes) y deja
 * la operación en la bitácora con el resumen de la previsualización. Se
 * vuelve a validar aquí: la confirmación llega en otra petición y el estado
 * pudo cambiar (un cierre entre la vista previa y el clic).
 */
export async function cargarArchivo(nombre: string, datos: Buffer, email: string | null): Promise<ResultadoCarga> {
  const r = await previsualizarArchivo(nombre, datos);
  if (r.errorArchivo) throw new Error(r.errorArchivo);
  if (r.validas.length === 0) throw new Error("Ninguna fila del archivo es válida; no hay nada que cargar.");

  const db = createAdminClient();
  const periodos = r.porPeriodo.map((p) => p.periodo);
  const { data: carga, error: e1 } = await db
    .from("financiera_cargas")
    .insert({
      tipo: "cargar_contable",
      periodo: periodos.length === 1 ? periodos[0] : null,
      usuario_email: email,
      archivo_nombre: nombre,
      filas: r.validas.length,
      detalle: {
        periodos,
        filas_archivo: r.totalFilas,
        validas: r.validas.length,
        rechazadas: r.rechazadas.length,
        celdas_vacias: r.celdasVacias,
        avisos: r.avisos.length,
        por_periodo: r.porPeriodo.map((p) => ({
          periodo: p.periodo, estado: p.estado, nuevas: p.nuevas, reemplazadas: p.reemplazadas, rechazadas: p.rechazadas,
          gastos_contables_antes: p.antes.gastosContables, gastos_contables_despues: p.despues.gastosContables,
          utilidad_antes: p.antes.utilidad, utilidad_despues: p.despues.utilidad,
        })),
        motivos_rechazo: resumirMotivos(r.rechazadas.map((x) => x.motivo)),
      },
    })
    .select("id")
    .single();
  if (e1) throw new Error(`No se pudo registrar la carga: ${e1.message}`);
  const cargaId = (carga as { id: string }).id;

  for (let i = 0; i < r.validas.length; i += LOTE) {
    const lote = r.validas.slice(i, i + LOTE).map((f: FilaArchivo) => ({
      periodo: f.periodo,
      codigo_vehiculo: f.vehiculo,
      despacho: f.despacho,
      intereses: f.intereses,
      otros_gastos: f.otrosGastos,
      repuestos: f.repuestos,
      mano_de_obra: f.manoDeObra,
      desc_fondo_conductor: f.descFondoConductor,
      combustible_vehiculos_nuevos: f.combustibleVehiculosNuevos,
      poliza_vehiculos_nuevos: f.polizaVehiculosNuevos,
      celdas_vacias: f.celdasVacias,
      carga_id: cargaId,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await db.from("financiera_contable_mes").upsert(lote, { onConflict: "periodo,codigo_vehiculo" });
    if (error) {
      await db.from("financiera_cargas").update({ detalle: { error: error.message, lote_fallido: i / LOTE + 1 } }).eq("id", cargaId);
      throw new Error(`Falló la escritura del lote ${i / LOTE + 1}: ${error.message}`);
    }
  }

  return { cargaId, filas: r.validas.length, rechazadas: r.rechazadas.length, periodos };
}

function resumirMotivos(motivos: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of motivos) {
    const clave = m.replace(/«[^»]*»/g, "«…»").replace(/\b\d{3,}\b/g, "N").replace(/\d{4}-\d{2}/g, "AAAA-MM");
    out[clave] = (out[clave] ?? 0) + 1;
  }
  return out;
}

// ── Reversión ────────────────────────────────────────────────────────────────

export interface ResultadoReversion {
  periodo: string;
  filas: number;
  gastosContables: number;
}

/**
 * Borra solo los rubros contables del período; la parte de GEMA queda igual y
 * la vista vuelve a marcar el mes como `sin_dato`. En un mes cerrado exige la
 * reapertura del administrador, por la misma razón que el reemplazo.
 */
export async function reversarContable(periodo: string, email: string | null): Promise<ResultadoReversion> {
  const db = createAdminClient();
  const { data: p, error: e0 } = await db.from("financiera_periodos").select("estado").eq("periodo", periodo).maybeSingle();
  if (e0) throw new Error(e0.message);
  if (!p) throw new Error(`El período ${periodo} no existe en Financiera.`);
  if ((p as { estado: EstadoPeriodo }).estado === "cerrado" && REEMPLAZO_EN_CERRADO_EXIGE_REAPERTURA) {
    throw new Error(`El período ${periodo} está cerrado: reversar su archivo contable cambia una cifra ya reportada. Pida al administrador que lo reabra.`);
  }

  const filas = await paginar<Record<string, string>>((a, b) =>
    db.from("financiera_contable_mes")
      .select("codigo_vehiculo, despacho, intereses, otros_gastos, repuestos, mano_de_obra, desc_fondo_conductor, combustible_vehiculos_nuevos, poliza_vehiculos_nuevos")
      .eq("periodo", periodo).range(a, b)
  );
  if (filas.length === 0) throw new Error(`El período ${periodo} no tiene archivo contable cargado.`);
  const total = filas.reduce((s, c) => s + gastosContables({
    despacho: Number(c.despacho), intereses: Number(c.intereses), otrosGastos: Number(c.otros_gastos),
    repuestos: Number(c.repuestos), manoDeObra: Number(c.mano_de_obra), descFondoConductor: Number(c.desc_fondo_conductor),
    combustibleVehiculosNuevos: Number(c.combustible_vehiculos_nuevos ?? 0),
    polizaVehiculosNuevos: Number(c.poliza_vehiculos_nuevos ?? 0),
  }), 0);

  const { error: e1 } = await db.from("financiera_contable_mes").delete().eq("periodo", periodo);
  if (e1) throw new Error(e1.message);

  const { error: e2 } = await db.from("financiera_cargas").insert({
    tipo: "reversar_contable",
    periodo,
    usuario_email: email,
    filas: filas.length,
    detalle: { vehiculos: filas.length, gastos_contables_retirados: total },
  });
  if (e2) console.error("[financiera] no se pudo registrar la reversión:", e2.message);

  return { periodo, filas: filas.length, gastosContables: total };
}

// ── Plantilla Excel ──────────────────────────────────────────────────────────

export async function plantillaXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestivo · Financiera";
  const ws = wb.addWorksheet("Contable", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNAS_ARCHIVO.map((c) => ({ header: c, key: c, width: c === "desc_fondo_conductor" ? 22 : Math.max(12, c.length + 2) }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  ws.addRow(COLUMNAS_ARCHIVO.map((c) => FILA_EJEMPLO[c]));
  ws.getColumn("periodo").numFmt = "@";
  ws.getColumn("vehiculo").numFmt = "@";
  for (const c of COLUMNAS_ARCHIVO.slice(2)) ws.getColumn(c).numFmt = "#,##0.00";

  const guia = wb.addWorksheet("Instrucciones");
  guia.columns = [{ width: 26 }, { width: 90 }];
  guia.addRow(["Columna", "Qué va"]).font = { bold: true };
  for (const c of COLUMNAS_ARCHIVO) guia.addRow([c, ETIQUETAS_COLUMNA[c]]);
  guia.addRow([]);
  guia.addRow(["Reglas", ""]).font = { bold: true };
  for (const t of [
    "Una fila por vehículo y mes. El período va como AAAA-MM (2026-03).",
    "El vehículo es el código de GEMA (el mismo de la operativa), no la placa.",
    "Celda vacía = 0. La carga informa cuántas celdas se tomaron así.",
    "Desc. fondo-conductor se RESTA de repuestos; no lo sume como gasto.",
    "Si no tuvo movimiento en GEMA ese mes, el vehículo debe existir en el maestro; se acepta con aviso y cero viajes e ingresos.",
    "Volver a cargar el mismo mes reemplaza sus rubros; no toca lo que vino de GEMA.",
    "Un mes cerrado que ya tiene archivo solo se reemplaza si el administrador lo reabre.",
    "Las dos últimas columnas son opcionales: si el archivo no las trae, valen 0 y el resto entra igual.",
    "Combustible y póliza de vehículos nuevos son los buses que GEMA todavía no factura. Si GEMA ya reporta ese gasto, la previsualización avisa para que no se cuente dos veces.",
    "También se acepta CSV (UTF-8, separador ; o , y decimal , o .).",
  ]) guia.addRow(["", t]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
