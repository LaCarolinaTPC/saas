import { createAdminClient } from "@/lib/supabase/admin";

// Consultas de reportes de daños y alertas de recurrencia. Todo entra por
// service_role desde Server Components: las tablas tienen RLS y los permisos
// los valida Gestivo antes.

export type ReporteDano = {
  id: string;
  codigo_vehiculo: string;
  cedula_conductor: string;
  descripcion: string | null;
  fecha_reporte: string;
  alerta_id: string | null;
  vehiculos: { placa: string | null } | null;
  mantenimiento_conceptos: { nombre: string } | null;
  conductores: { nombre: string } | null;
};

export type AlertaRecurrencia = {
  id: string;
  codigo_vehiculo: string;
  cantidad: number;
  estado: string;
  orden_taller: string | null;
  notas_cierre: string | null;
  cerrada_at: string | null;
  created_at: string;
  vehiculos: { placa: string | null } | null;
  mantenimiento_conceptos: { nombre: string } | null;
};

const CAMPOS_REPORTE =
  "id, codigo_vehiculo, cedula_conductor, descripcion, fecha_reporte, alerta_id, vehiculos(placa), mantenimiento_conceptos(nombre), conductores(nombre)";

const CAMPOS_ALERTA =
  "id, codigo_vehiculo, cantidad, estado, orden_taller, notas_cierre, cerrada_at, created_at, vehiculos(placa), mantenimiento_conceptos(nombre)";

/**
 * Historial de reportes. El tope de 1000 es el mismo del sistema del que sale
 * este módulo; a ~20 reportes al mes cubre varios años, y el filtrado fino se
 * hace en el cliente para que cambiar de filtro no cueste un viaje al servidor.
 */
export async function cargarReportes(limite = 1000) {
  const db = createAdminClient();
  return db
    .from("mantenimiento_reportes")
    .select(CAMPOS_REPORTE)
    .order("fecha_reporte", { ascending: false })
    .limit(limite)
    .returns<ReporteDano[]>();
}

export async function cargarAlertas(limite = 500) {
  const db = createAdminClient();
  return db
    .from("mantenimiento_alertas")
    .select(CAMPOS_ALERTA)
    .order("created_at", { ascending: false })
    .limit(limite)
    .returns<AlertaRecurrencia[]>();
}

/** Los reportes que originaron una alerta, para poder revisarla antes de cerrarla. */
export async function cargarReportesDeAlerta(alertaId: string) {
  const db = createAdminClient();
  return db
    .from("mantenimiento_reportes")
    .select(CAMPOS_REPORTE)
    .eq("alerta_id", alertaId)
    .order("fecha_reporte", { ascending: false })
    .returns<ReporteDano[]>();
}

export async function cargarVehiculosActivos() {
  const db = createAdminClient();
  return db.from("vehiculos").select("codigo, placa").eq("estado", 1).order("codigo");
}

export async function cargarConceptosActivos() {
  const db = createAdminClient();
  return db.from("mantenimiento_conceptos").select("id, nombre").eq("activo", true).order("nombre");
}

export type IndicadoresMantenimiento = {
  reportes: number;
  alertasAbiertas: number;
  vehiculosActivos: number;
  conductoresActivos: number;
  frenosVencidos: number;
};

/**
 * Contadores del tablero, los mismos cinco del sistema que este módulo
 * reemplaza. Se cuentan en la base con `head: true`: el indicador de reportes
 * tiene que ser el total, no cuántos cabían en la tabla de la página.
 *
 * `frenosVencidos` cuenta los vehículos activos sin graduación en más de 30
 * días, tratando "nunca graduado" (NULL) como el caso más grave.
 */
export async function cargarIndicadoresTablero(): Promise<IndicadoresMantenimiento> {
  const db = createAdminClient();
  const [reportes, alertas, vehiculos, conductores, frenos] = await Promise.all([
    db.from("mantenimiento_reportes").select("id", { count: "exact", head: true }),
    db.from("mantenimiento_alertas").select("id", { count: "exact", head: true }).eq("estado", "abierta"),
    db.from("vehiculos").select("codigo", { count: "exact", head: true }).eq("estado", 1),
    db.from("conductores").select("cedula", { count: "exact", head: true }).eq("estado", "ACTIVO"),
    db.from("vw_frenos_resumen_vehiculo").select("dias_desde_ultima"),
  ]);

  const resumen = (frenos.data ?? []) as { dias_desde_ultima: number | null }[];
  return {
    reportes: reportes.count ?? 0,
    alertasAbiertas: alertas.count ?? 0,
    vehiculosActivos: vehiculos.count ?? 0,
    conductoresActivos: conductores.count ?? 0,
    frenosVencidos: resumen.filter((v) => v.dias_desde_ultima === null || v.dias_desde_ultima > 30).length,
  };
}
