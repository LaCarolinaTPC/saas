/** Capa de datos de la liquidación de afiliados (solo servidor). */
import { createAdminClient } from "@/lib/supabase/admin";
import { REGLAS_DEFECTO, esPlazo, type Plazo, type ReglaPago } from "./calendario-pago";
import { TERCERO_SELECT, esDeAfiliado, type FilaTercero } from "./liquidacion-afiliados";

/** Tope de filas por consulta: 150 vehículos × 2 cierres × 1 año sobra. */
const TOPE_FILAS = 120_000;

/**
 * Filas de ingreso_tercero de afiliados en el rango, paginadas (PostgREST
 * recorta cada respuesta a 1.000 filas aunque se pida más). Con `cedula`
 * solo las de ese propietario: el vehículo cuenta únicamente en los días en
 * que GEMA lo liquidó a su nombre, así un bus vendido no le muestra al dueño
 * anterior los días del nuevo.
 */
export async function getFilasAfiliados(f: { desde: string; hasta: string; cedula?: string | null }): Promise<FilaTercero[]> {
  const db = createAdminClient();
  const [vehiculos, filas] = await Promise.all([getVehiculosAfiliados(), (async () => {
    const out: FilaTercero[] = [];
    const PAGINA = 1000;
    for (let inicio = 0; inicio < TOPE_FILAS; inicio += PAGINA) {
      let q = db
        .from("ingreso_tercero")
        .select(TERCERO_SELECT)
        .gte("fecha", f.desde)
        .lte("fecha", f.hasta)
        .eq("tipo_propietario", "AFILIADO")
        .not("codigo_vehiculo", "is", null)
        .order("fecha", { ascending: true })
        .order("id", { ascending: true })
        .range(inicio, inicio + PAGINA - 1);
      if (f.cedula) q = q.eq("cedula_propietario", f.cedula);
      const { data, error } = await q;
      if (error) throw error;
      // El select es una cadena compuesta: el tipado de supabase-js no la interpreta.
      const pagina = (data ?? []) as unknown as FilaTercero[];
      for (const r of pagina) {
        out.push({ ...r, codigo_vehiculo: String(r.codigo_vehiculo).trim(), cedula_propietario: String(r.cedula_propietario ?? "").trim() });
      }
      if (pagina.length < PAGINA) break;
    }
    return out;
  })()]);
  return filas.filter((r) => esDeAfiliado(r, vehiculos));
}

/** Códigos de vehículo que la operación tiene como AFILIADO (maestro de hoy). */
export async function getVehiculosAfiliados(): Promise<Set<string>> {
  const { data, error } = await createAdminClient()
    .from("vehiculos")
    .select("codigo")
    .eq("tipo_propietario_op", "AFILIADO")
    .range(0, 1999);
  if (error) throw error;
  return new Set((data ?? []).map((v) => String(v.codigo).trim()));
}

export interface PropietarioFicha {
  cedula: string;
  codigo: string | null;
  nombre: string | null;
  /** Plazo de GEMA; si falta o no se reconoce, se trata como SEMANAL y se avisa. */
  plazo: Plazo;
  plazoReconocido: boolean;
  estado: string | null;
}

export async function getPropietarios(cedulas: string[]): Promise<Map<string, PropietarioFicha>> {
  const out = new Map<string, PropietarioFicha>();
  const unicas = [...new Set(cedulas)].filter(Boolean);
  const db = createAdminClient();
  for (let i = 0; i < unicas.length; i += 400) {
    const { data, error } = await db
      .from("propietarios")
      .select("cedula, codigo, nombre, plazo_pago, estado")
      .in("cedula", unicas.slice(i, i + 400));
    if (error) throw error;
    for (const p of data ?? []) {
      const plazo = String(p.plazo_pago ?? "").trim().toUpperCase();
      out.set(String(p.cedula).trim(), {
        cedula: String(p.cedula).trim(),
        codigo: (p.codigo as string | null) ?? null,
        nombre: (p.nombre as string | null) ?? null,
        plazo: esPlazo(plazo) ? plazo : "SEMANAL",
        plazoReconocido: esPlazo(plazo),
        estado: (p.estado as string | null) ?? null,
      });
    }
  }
  return out;
}

/** Busca afiliados por cédula (prefijo), código (A406) o nombre. */
export async function buscarPropietarios(q: string): Promise<PropietarioFicha[]> {
  const t = q.trim();
  if (t.length < 2) return [];
  let consulta = createAdminClient()
    .from("propietarios")
    .select("cedula")
    .in("tipo_propietario", ["AFILIADO"])
    .limit(30);
  if (/^\d+$/.test(t)) consulta = consulta.like("cedula", `${t}%`);
  else if (/^[A-Za-z]\d+$/.test(t)) consulta = consulta.ilike("codigo", t);
  else consulta = consulta.ilike("nombre", `%${t}%`);
  const { data, error } = await consulta;
  if (error) throw error;
  const fichas = await getPropietarios((data ?? []).map((r) => String(r.cedula).trim()));
  return [...fichas.values()].sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es"));
}

/**
 * Reglas de pago por plazo (tesoreria_calendario_pago). Si la tabla aún no
 * existe (migración 20260925194027 sin aplicar) se usan las acordadas.
 */
export async function getReglasPago(): Promise<{ reglas: Record<Plazo, ReglaPago>; desdeTabla: boolean }> {
  const { data, error } = await createAdminClient()
    .from("tesoreria_calendario_pago")
    .select("plazo, etiqueta, dia_corte, dia_pago, dia_pago_alterno, correr_si_lunes_festivo, correr_si_dia_pago_festivo");
  if (error || !data?.length) {
    if (error) console.warn("[liquidacion-afiliados] sin tabla de calendario, reglas por defecto:", error.message);
    return { reglas: REGLAS_DEFECTO, desdeTabla: false };
  }
  const reglas = { ...REGLAS_DEFECTO };
  for (const r of data) {
    if (!esPlazo(r.plazo)) continue;
    reglas[r.plazo] = {
      plazo: r.plazo,
      etiqueta: r.etiqueta,
      diaCorte: r.dia_corte,
      diaPago: r.dia_pago,
      diaPagoAlterno: r.dia_pago_alterno,
      correrSiLunesFestivo: r.correr_si_lunes_festivo,
      correrSiDiaPagoFestivo: r.correr_si_dia_pago_festivo,
    };
  }
  return { reglas, desdeTabla: true };
}

/** Último día que la sincronización de GEMA trajo de ingreso_tercero. */
export async function getUltimoDiaSincronizado(): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("gema_sync_state")
    .select("last_synced_date")
    .eq("dataset", "ingreso_tercero")
    .maybeSingle();
  return (data?.last_synced_date as string | null) ?? null;
}
