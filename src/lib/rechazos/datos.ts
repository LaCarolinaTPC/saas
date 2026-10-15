/**
 * Lectura de rechazos para el reporte (solo servidor). La pantalla y el
 * Excel leen de aquí con los mismos filtros.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { EtapaReporte, FilaRechazo } from "./reporte";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface FiltrosRechazos {
  /** Fechas AAAA-MM-DD en hora de Bogotá, sobre la fecha del rechazo. */
  desde: string;
  hasta: string;
  vacante: string | null;
}

export function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

/** Filtros válidos a partir de la URL; por defecto, el año en curso hasta hoy. */
export function parseFiltrosRechazos(sp: { get(k: string): string | null }): FiltrosRechazos {
  const valida = (v: string | null) => (v && FECHA_RE.test(v) ? v : null);
  const hasta = valida(sp.get("hasta")) ?? hoyBogota();
  const desde = valida(sp.get("desde")) ?? `${hasta.slice(0, 4)}-01-01`;
  return { desde, hasta, vacante: sp.get("vacante") || null };
}

function diaSiguiente(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const COLUMNAS =
  "id, registrado_at, nombre, cedula, vacante, fase_origen, fase_origen_label, causa, nota, origen, registrado_por_email, revertido_at, revertido_por_email, revertido_a_fase";

/** Rechazos del rango (incluye los revertidos; el resumen los separa). */
export async function getRechazos(f: FiltrosRechazos): Promise<FilaRechazo[]> {
  const admin = createAdminClient();
  const filas: FilaRechazo[] = [];
  // PostgREST corta en 1.000 filas: se pagina con orden total.
  for (let from = 0; ; from += 1000) {
    let q = admin
      .from("rechazos_candidato")
      .select(COLUMNAS)
      // Colombia no tiene horario de verano: -05:00 todo el año.
      .gte("registrado_at", `${f.desde}T00:00:00-05:00`)
      .lt("registrado_at", `${diaSiguiente(f.hasta)}T00:00:00-05:00`)
      .order("registrado_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (f.vacante) q = q.eq("vacante", f.vacante);
    const { data, error } = await q;
    if (error) throw new Error(`No se pudieron leer los rechazos: ${error.message}`);
    filas.push(...((data ?? []) as FilaRechazo[]));
    if (!data || data.length < 1000) break;
  }
  return filas;
}

/** Todas las etapas (también las inactivas, para nombrar rechazos viejos). */
export async function getEtapasReporte(): Promise<EtapaReporte[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("pipeline_stages").select("key, label, orden").order("orden");
  return (data ?? []) as EtapaReporte[];
}

/** Vacantes que aparecen en algún rechazo, para el filtro. */
export async function getVacantesConRechazos(): Promise<string[]> {
  const admin = createAdminClient();
  const vistas = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("rechazos_candidato")
      .select("vacante")
      .not("vacante", "is", null)
      .order("id")
      .range(from, from + 999);
    for (const r of data ?? []) vistas.add(r.vacante as string);
    if (!data || data.length < 1000) break;
  }
  return [...vistas].sort((a, b) => a.localeCompare(b, "es"));
}
