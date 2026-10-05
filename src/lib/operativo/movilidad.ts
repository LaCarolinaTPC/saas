/** Operativo · Movilidad — capa de datos (solo servidor). */
import { createAdminClient } from "@/lib/supabase/admin";
import { festivosColombia } from "@/lib/tesoreria/calendario-pago";
import type { FilaMovilidad, TipoDia } from "./movilidad-reglas";

interface FilaRaw {
  ruta: string;
  tipo_dia: TipoDia;
  hora: number;
  dias: number;
  salidas: number;
  con_duracion: number;
  mediana: number | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
  pasajeros: number | null;
  /** Desde la migración 20261005212328; antes no viene. */
  timbradas?: number | null;
  timbradas_promedio?: number | null;
}

const n = (v: number | string | null) => (v == null ? null : Number(v));

/**
 * Duración de la vuelta por ruta, tipo de día y hora de despacho en el rango
 * (fechas inclusivas). Los festivos de Colombia se calculan aquí y la base los
 * trata como domingo.
 */
export async function getMovilidadPorHora(desde: string, hasta: string): Promise<FilaMovilidad[]> {
  const festivos: string[] = [];
  for (let a = Number(desde.slice(0, 4)); a <= Number(hasta.slice(0, 4)); a++) {
    for (const f of festivosColombia(a)) if (f >= desde && f <= hasta) festivos.push(f);
  }
  const db = createAdminClient();
  const { data, error } = await db.rpc("get_movilidad_por_hora_json", {
    p_desde: desde,
    p_hasta: hasta,
    p_festivos: festivos,
  });
  if (error) throw new Error(`Movilidad por hora: ${error.message}`);
  const filas = (Array.isArray(data) ? data : []) as FilaRaw[];
  return filas.map((r) => ({
    ruta: r.ruta,
    tipoDia: r.tipo_dia,
    hora: Number(r.hora),
    dias: Number(r.dias),
    salidas: Number(r.salidas),
    conDuracion: Number(r.con_duracion),
    mediana: n(r.mediana),
    p10: n(r.p10),
    p25: n(r.p25),
    p75: n(r.p75),
    p90: n(r.p90),
    pasajeros: n(r.pasajeros),
    timbradas: n(r.timbradas ?? null),
    timbradasPromedio: n(r.timbradas_promedio ?? null),
  }));
}

/** Primer y último día del histórico de despacho, para orientar el filtro. */
export async function getRangoHistoricoDespacho(): Promise<{ desde: string | null; hasta: string | null }> {
  const db = createAdminClient();
  const [a, b] = await Promise.all([
    db.from("historico_despacho").select("fecha_viaje").order("fecha_viaje", { ascending: true }).limit(1).maybeSingle(),
    db.from("historico_despacho").select("fecha_viaje").order("fecha_viaje", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { desde: a.data?.fecha_viaje ?? null, hasta: b.data?.fecha_viaje ?? null };
}
