import { createAdminClient } from "@/lib/supabase/admin";

// Consultas de la bitácora de graduación de frenos. Todo entra por
// service_role desde Server Components: la tabla tiene RLS y los permisos los
// valida Gestivo antes.

export type VehiculoFrenos = { codigo: string; placa: string | null };

export type RegistroFrenos = {
  id: string;
  fecha: string;
  codigo_vehiculo: string;
  graduacion: boolean;
  observacion: string | null;
  registrado_por_email: string | null;
  vehiculos: { placa: string | null } | null;
};

export type ResumenFrenos = {
  codigo: string;
  placa: string | null;
  total_registros: number;
  total_graduaciones: number;
  ultima_graduacion: string | null;
  dias_desde_ultima: number | null;
  con_observacion: number;
};

export type IndicadoresFrenos = {
  graduacionesDelMes: number;
  vehiculosAtendidos: number;
  conObservacion: number;
};

/** Fecha de hoy en Bogotá, como AAAA-MM-DD. */
export function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Un vehículo nunca graduado es el caso más grave, no el más leve. */
export function diasOInfinito(dias: number | null): number {
  return dias === null ? Number.POSITIVE_INFINITY : dias;
}

export async function cargarVehiculosActivos() {
  const db = createAdminClient();
  return db.from("vehiculos").select("codigo, placa").eq("estado", 1).order("codigo");
}

export async function cargarUltimosRegistros(limite = 15) {
  const db = createAdminClient();
  return db
    .from("mantenimiento_frenos")
    .select("id, fecha, codigo_vehiculo, graduacion, observacion, registrado_por_email, vehiculos(placa)")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite)
    .returns<RegistroFrenos[]>();
}

export async function cargarResumen() {
  const db = createAdminClient();
  return db.from("vw_frenos_resumen_vehiculo").select("*").order("codigo").returns<ResumenFrenos[]>();
}

export async function cargarHistorial(limite = 1000) {
  const db = createAdminClient();
  return db
    .from("mantenimiento_frenos")
    .select("id, fecha, codigo_vehiculo, graduacion, observacion, registrado_por_email, vehiculos(placa)")
    .order("fecha", { ascending: false })
    .limit(limite)
    .returns<RegistroFrenos[]>();
}

/** Indicadores del mes en curso. */
export async function cargarIndicadores(): Promise<IndicadoresFrenos> {
  const db = createAdminClient();
  const desdeMes = `${hoyBogota().slice(0, 8)}01`;

  const [graduadas, conObs] = await Promise.all([
    db.from("mantenimiento_frenos").select("codigo_vehiculo").eq("graduacion", true).gte("fecha", desdeMes),
    db.from("mantenimiento_frenos").select("id", { count: "exact", head: true }).not("observacion", "is", null).gte("fecha", desdeMes),
  ]);

  const filas = graduadas.data ?? [];
  return {
    graduacionesDelMes: filas.length,
    vehiculosAtendidos: new Set(filas.map((f) => f.codigo_vehiculo)).size,
    conObservacion: conObs.count ?? 0,
  };
}
