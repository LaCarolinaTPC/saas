// Combustible de buses — capa de datos (solo servidor). La lectura y las
// alertas son puras (combustible-archivo.ts); aquí se cruza con el maestro de
// vehículos y con lo ya cargado, se escribe por lotes y se deja cada archivo en
// combustible_cargas. Entra por service_role: las tablas tienen RLS sin
// políticas y Gestivo valida el permiso. Los scripts pasan su propio cliente.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  crearMaestro, interpretarArchivo, leerLibro, resumirTanqueos, tanqueoCambio,
  type FilaRechazada, type LecturaCombustible, type MaestroVehiculos, type ResumenTanqueos, type Tanqueo,
} from "./combustible-archivo";

const PAGINA = 1000;
const LOTE = 500;
/** Llaves por consulta `in`: cada una ronda 30 caracteres y viajan en la URL. */
const LOTE_LLAVES = 150;

/** Lee todas las páginas: PostgREST corta en 1.000 filas aunque se pida más. */
async function paginar<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  tope = 60000,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; desde < tope; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as T[];
    filas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return filas;
}

export async function getMaestroVehiculos(db: SupabaseClient = createAdminClient()): Promise<MaestroVehiculos> {
  const filas = await paginar<{ codigo: string; placa: string | null }>((a, b) =>
    db.from("vehiculos").select("codigo, placa").order("codigo").range(a, b)
  );
  return crearMaestro(filas);
}

interface TanqueoGuardado {
  llave: string;
  galones: number;
  valor: number;
  placa: string | null;
  producto: string | null;
  alertas: string[];
}

async function tanqueosExistentes(db: SupabaseClient, llaves: string[]): Promise<Map<string, TanqueoGuardado>> {
  const mapa = new Map<string, TanqueoGuardado>();
  for (let i = 0; i < llaves.length; i += LOTE_LLAVES) {
    const { data, error } = await db
      .from("combustible_tanqueos")
      .select("llave, galones, valor, placa, producto, alertas")
      .in("llave", llaves.slice(i, i + LOTE_LLAVES));
    if (error) throw new Error(error.message);
    for (const f of (data ?? []) as TanqueoGuardado[]) mapa.set(f.llave, f);
  }
  return mapa;
}

// ── Preparación (común a la vista previa y a la carga) ───────────────────────

export interface ArchivoSubido {
  nombre: string;
  datos: Buffer;
}

export interface CambioTanqueo {
  fecha: string;
  hora: string | null;
  vehiculo: string;
  factura: string;
  antes: { galones: number; valor: number };
  despues: { galones: number; valor: number };
}

export interface ResumenArchivo {
  archivo: string;
  fechaNombre: string | null;
  errorArchivo: string | null;
  filasArchivo: number;
  resumen: ResumenTanqueos;
  nuevas: number;
  corregidas: number;
  sinCambio: number;
  /** Ya venían en un archivo anterior de la misma subida (el del día siguiente trae la madrugada). */
  enOtroArchivo: number;
  /** De esos, cuántos traían otros galones o valor; se conserva el del primer archivo. */
  enOtroArchivoDistinto: number;
  /** Tanqueos anteriores a `desde` que se dejaron por fuera (solo en el histórico). */
  fueraDeRango: number;
  rechazadas: FilaRechazada[];
  rechazadasTotal: number;
  avisos: string[];
  cambios: CambioTanqueo[];
}

interface ArchivoPreparado {
  resumen: ResumenArchivo;
  /** Nuevos y corregidos: lo que se escribe. */
  escribir: Tanqueo[];
}

export interface OpcionesCarga {
  /** Cliente propio (los scripts); por defecto el de service_role del servidor. */
  db?: SupabaseClient;
  maestro?: MaestroVehiculos;
  /** Solo tanqueos desde esta fecha (AAAA-MM-DD); el histórico arranca en 2026. */
  desde?: string;
  /** Ensayo antes de aplicar la migración: no consulta lo ya cargado (todo sale nuevo). */
  sinBase?: boolean;
}

/**
 * Lee cada archivo y lo clasifica contra la base. Un tanqueo que ya vino en un
 * archivo anterior de la misma subida se cuenta solo en el primero.
 */
export async function prepararArchivos(archivos: ArchivoSubido[], hoy: string, opciones: OpcionesCarga = {}): Promise<ArchivoPreparado[]> {
  const db = opciones.db ?? createAdminClient();
  const m = opciones.maestro ?? (await getMaestroVehiculos(db));
  const lecturas: { nombre: string; lectura: LecturaCombustible }[] = archivos.map((a) => {
    try {
      return { nombre: a.nombre, lectura: interpretarArchivo(a.nombre, leerLibro(a.datos), m, hoy) };
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      return {
        nombre: a.nombre,
        lectura: { errorArchivo: `No se pudo leer el Excel: ${motivo}`, tanqueos: [], rechazadas: [], avisos: [], filasArchivo: 0, fechaNombre: null },
      };
    }
  });
  const fueraDeRango = new Map<string, number>();
  if (opciones.desde) {
    for (const l of lecturas) {
      const dentro = l.lectura.tanqueos.filter((t) => t.fecha >= opciones.desde!);
      fueraDeRango.set(l.nombre, l.lectura.tanqueos.length - dentro.length);
      l.lectura = { ...l.lectura, tanqueos: dentro };
    }
  }
  const existentes = opciones.sinBase ? new Map<string, TanqueoGuardado>() : await tanqueosExistentes(db, [...new Set(lecturas.flatMap((l) => l.lectura.tanqueos.map((t) => t.llave)))]);

  const vistas = new Map<string, Tanqueo>();
  return lecturas.map(({ nombre, lectura }) => {
    const escribir: Tanqueo[] = [];
    const cambios: CambioTanqueo[] = [];
    let nuevas = 0, corregidas = 0, sinCambio = 0, enOtroArchivo = 0, enOtroArchivoDistinto = 0;
    for (const t of lectura.tanqueos) {
      const previo = vistas.get(t.llave);
      if (previo) {
        enOtroArchivo++;
        if (previo.galones !== t.galones || previo.valor !== t.valor) enOtroArchivoDistinto++;
        continue;
      }
      vistas.set(t.llave, t);
      const actual = existentes.get(t.llave);
      if (!actual) { nuevas++; escribir.push(t); continue; }
      if (!tanqueoCambio(t, actual)) { sinCambio++; continue; }
      corregidas++;
      escribir.push(t);
      cambios.push({
        fecha: t.fecha, hora: t.hora, vehiculo: t.vehiculoCodigo, factura: t.factura,
        antes: { galones: Number(actual.galones), valor: Number(actual.valor) },
        despues: { galones: t.galones, valor: t.valor },
      });
    }
    return {
      escribir,
      resumen: {
        archivo: nombre,
        fechaNombre: lectura.fechaNombre,
        errorArchivo: lectura.errorArchivo,
        filasArchivo: lectura.filasArchivo,
        resumen: resumirTanqueos(lectura.tanqueos),
        nuevas, corregidas, sinCambio, enOtroArchivo, enOtroArchivoDistinto,
        fueraDeRango: fueraDeRango.get(nombre) ?? 0,
        rechazadas: lectura.rechazadas.slice(0, 50),
        rechazadasTotal: lectura.rechazadas.length,
        avisos: lectura.avisos,
        cambios: cambios.slice(0, 50),
      },
    };
  });
}

// ── Carga ────────────────────────────────────────────────────────────────────

export interface ResultadoCarga {
  archivo: string;
  cargaId: string | null;
  nuevas: number;
  corregidas: number;
  sinCambio: number;
  rechazadas: number;
  errorArchivo: string | null;
}

/**
 * Escribe cada archivo (upsert por llave, en lotes) y deja su fila en
 * combustible_cargas aunque no traiga nada nuevo: así queda constancia de que
 * el día se subió. Un archivo rechazado entero no deja carga.
 */
export async function cargarArchivos(
  archivos: ArchivoSubido[],
  hoy: string,
  email: string | null,
  origen: "pantalla" | "historico" = "pantalla",
  opciones: OpcionesCarga = {},
): Promise<ResultadoCarga[]> {
  const db = opciones.db ?? createAdminClient();
  const preparados = await prepararArchivos(archivos, hoy, { ...opciones, db });
  const resultados: ResultadoCarga[] = [];
  for (const { resumen: r, escribir } of preparados) {
    // En el histórico, un archivo de antes de `desde` no deja carga.
    if (opciones.desde && !r.errorArchivo && r.resumen.tanqueos === 0) continue;
    if (r.errorArchivo) {
      resultados.push({ archivo: r.archivo, cargaId: null, nuevas: 0, corregidas: 0, sinCambio: 0, rechazadas: 0, errorArchivo: r.errorArchivo });
      continue;
    }
    const { data: carga, error: e1 } = await db
      .from("combustible_cargas")
      .insert({
        archivo_nombre: r.archivo,
        origen,
        usuario_email: email,
        filas_archivo: r.filasArchivo,
        nuevas: r.nuevas,
        corregidas: r.corregidas,
        sin_cambio: r.sinCambio,
        rechazadas: r.rechazadasTotal,
        fecha_desde: r.resumen.desde,
        fecha_hasta: r.resumen.hasta,
        galones: r.resumen.galones,
        valor: r.resumen.valor,
        detalle: {
          fecha_nombre: r.fechaNombre,
          en_otro_archivo: r.enOtroArchivo,
          en_otro_archivo_distinto: r.enOtroArchivoDistinto,
          fuera_de_rango: r.fueraDeRango,
          buses: r.resumen.buses,
          alertas: r.resumen.alertas,
          avisos: r.avisos,
          rechazadas: r.rechazadas,
          cambios: r.cambios,
        },
      })
      .select("id")
      .single();
    if (e1) throw new Error(`No se pudo registrar la carga de ${r.archivo}: ${e1.message}`);
    const cargaId = (carga as { id: string }).id;

    for (let i = 0; i < escribir.length; i += LOTE) {
      const ahora = new Date().toISOString();
      const lote = escribir.slice(i, i + LOTE).map((t) => ({
        llave: t.llave,
        fecha: t.fecha,
        hora: t.hora,
        factura: t.factura,
        vehiculo_codigo: t.vehiculoCodigo,
        placa: t.placa,
        producto: t.producto,
        galones: t.galones,
        valor: t.valor,
        alertas: t.alertas,
        archivo_nombre: r.archivo,
        carga_id: cargaId,
        updated_at: ahora,
      }));
      const { error } = await db.from("combustible_tanqueos").upsert(lote, { onConflict: "llave" });
      if (error) {
        await db.from("combustible_cargas").update({ detalle: { error: error.message, lote_fallido: i / LOTE + 1 } }).eq("id", cargaId);
        throw new Error(`Falló la escritura de ${r.archivo} (lote ${i / LOTE + 1}): ${error.message}`);
      }
    }
    resultados.push({
      archivo: r.archivo, cargaId, nuevas: r.nuevas, corregidas: r.corregidas, sinCambio: r.sinCambio,
      rechazadas: r.rechazadasTotal, errorArchivo: null,
    });
  }
  return resultados;
}

// ── Reversión ────────────────────────────────────────────────────────────────

/** Borra los tanqueos cuya última carga fue esta y la marca como reversada. */
export async function reversarCarga(id: string, email: string | null, db: SupabaseClient = createAdminClient()): Promise<{ archivo: string; tanqueos: number }> {
  const { data: carga, error: e0 } = await db.from("combustible_cargas").select("archivo_nombre, reversada_at").eq("id", id).maybeSingle();
  if (e0) throw new Error(e0.message);
  if (!carga) throw new Error("La carga no existe.");
  if (carga.reversada_at) throw new Error("La carga ya estaba reversada.");
  const { count, error: e1 } = await db.from("combustible_tanqueos").delete({ count: "exact" }).eq("carga_id", id);
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await db
    .from("combustible_cargas")
    .update({ reversada_at: new Date().toISOString(), reversada_por_email: email })
    .eq("id", id);
  if (e2) throw new Error(e2.message);
  return { archivo: carga.archivo_nombre as string, tanqueos: count ?? 0 };
}

// ── Consultas de pantalla ────────────────────────────────────────────────────

export interface CargaCombustible {
  id: string;
  archivo_nombre: string;
  origen: "pantalla" | "historico";
  usuario_email: string | null;
  nuevas: number;
  corregidas: number;
  sin_cambio: number;
  rechazadas: number;
  fecha_desde: string | null;
  fecha_hasta: string | null;
  galones: number;
  valor: number;
  reversada_at: string | null;
  created_at: string;
}

export async function getUltimasCargas(limite = 15): Promise<CargaCombustible[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("combustible_cargas")
    .select("id, archivo_nombre, origen, usuario_email, nuevas, corregidas, sin_cambio, rechazadas, fecha_desde, fecha_hasta, galones, valor, reversada_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return ((data ?? []) as CargaCombustible[]).map((c) => ({ ...c, galones: Number(c.galones), valor: Number(c.valor) }));
}

/** Último día con tanqueos cargados, para decir hasta dónde llega la información. */
export async function getUltimoDiaCargado(): Promise<string | null> {
  const db = createAdminClient();
  const { data, error } = await db.from("combustible_tanqueos").select("fecha").order("fecha", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.fecha as string | undefined) ?? null;
}

export interface TanqueoFila {
  id: string;
  fecha: string;
  hora: string | null;
  factura: string;
  vehiculo_codigo: string;
  placa: string | null;
  producto: string | null;
  galones: number;
  valor: number;
  precio_galon: number;
  alertas: string[];
  archivo_nombre: string | null;
}

export interface FiltrosHistorialCombustible {
  desde: string;
  hasta: string;
  codigo: string | null;
  placa: string | null;
  conAlertas: boolean;
}

export async function getHistorialCombustible(f: FiltrosHistorialCombustible): Promise<TanqueoFila[]> {
  const db = createAdminClient();
  const filas = await paginar<TanqueoFila>((a, b) => {
    let q = db
      .from("combustible_tanqueos")
      .select("id, fecha, hora, factura, vehiculo_codigo, placa, producto, galones, valor, precio_galon, alertas, archivo_nombre")
      .gte("fecha", f.desde)
      .lte("fecha", f.hasta);
    if (f.codigo) q = q.eq("vehiculo_codigo", f.codigo);
    if (f.placa) q = q.ilike("placa", `%${f.placa}%`);
    if (f.conAlertas) q = q.neq("alertas", "{}");
    return q
      .order("fecha", { ascending: false })
      .order("hora", { ascending: false, nullsFirst: false })
      .order("vehiculo_codigo")
      .order("id")
      .range(a, b);
  });
  return filas.map((t) => ({ ...t, galones: Number(t.galones), valor: Number(t.valor), precio_galon: Number(t.precio_galon) }));
}
