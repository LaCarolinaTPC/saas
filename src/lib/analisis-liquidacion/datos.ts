/**
 * Lectura del Análisis de liquidación: el maestro de conductores y la vista
 * mensual `liquidacion_conductor_mes` (migraciones 20261007192020 y
 * 20261007204847, que le agrega el vehículo principal del mes). Las páginas
 * de 1.000 filas se piden en paralelo: son unas 8 mil filas y en serie la
 * pantalla tardaría varios segundos más.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { Conductor } from "@/lib/riesgo/variables";
import type { MesLiq } from "./analisis";

const PAGINA = 1000;

const SEL_CONDUCTORES =
  "cedula, nombre, codigo, tipo_conductor, estado, fecha_ingreso, fecha_retiro, fecha_nacimiento, num_hijos, estado_civil, nivel_educativo";

const SEL_MESES =
  "cedula, mes, dias, dias_con_valores, viajes, timbradas, bruto, neto, ahorro, anticipo, dias_bajo_base, neto_sd, rutas, vehiculos, ruta_principal, ultimo_dia, base_diaria, vehiculo_principal, clase_vehiculo, capacidad_vehiculo, modelo_vehiculo";

type Admin = ReturnType<typeof createAdminClient>;

async function todo<T>(db: Admin, tabla: string, cols: string, orden: string[]): Promise<T[]> {
  const { count, error } = await db.from(tabla).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${tabla}: ${error.message}`);
  const paginas = Math.ceil((count ?? 0) / PAGINA);
  const resultados = await Promise.all(
    Array.from({ length: paginas }, (_, i) => {
      let q = db.from(tabla).select(cols);
      for (const o of orden) q = q.order(o, { ascending: true });
      return q.range(i * PAGINA, (i + 1) * PAGINA - 1);
    })
  );
  const out: T[] = [];
  for (const r of resultados) {
    if (r.error) throw new Error(`${tabla}: ${r.error.message}`);
    out.push(...((r.data ?? []) as T[]));
  }
  return out;
}

const num = (v: unknown) => (v == null ? null : Number(v));

export async function leerDatos(): Promise<{ conductores: Conductor[]; meses: MesLiq[] }> {
  const db = createAdminClient();
  const [conductores, crudos] = await Promise.all([
    todo<Conductor>(db, "conductores", SEL_CONDUCTORES, ["id"]),
    // Orden total (cédula + mes es única en la vista): sin él la paginación
    // en paralelo podría repetir o perder filas.
    todo<Record<string, unknown>>(db, "liquidacion_conductor_mes", SEL_MESES, ["cedula", "mes"]),
  ]);
  const meses: MesLiq[] = crudos.map((r) => ({
    cedula: String(r.cedula),
    mes: String(r.mes).slice(0, 10),
    dias: Number(r.dias ?? 0),
    dias_con_valores: Number(r.dias_con_valores ?? 0),
    viajes: Number(r.viajes ?? 0),
    timbradas: Number(r.timbradas ?? 0),
    bruto: num(r.bruto),
    neto: num(r.neto),
    ahorro: num(r.ahorro),
    anticipo: num(r.anticipo),
    dias_bajo_base: Number(r.dias_bajo_base ?? 0),
    neto_sd: num(r.neto_sd),
    rutas: Number(r.rutas ?? 0),
    vehiculos: Number(r.vehiculos ?? 0),
    ruta_principal: (r.ruta_principal as string | null) ?? null,
    ultimo_dia: String(r.ultimo_dia).slice(0, 10),
    base_diaria: num(r.base_diaria),
    vehiculo_principal: (r.vehiculo_principal as string | null) ?? null,
    clase_vehiculo: (r.clase_vehiculo as string | null) ?? null,
    capacidad_vehiculo: num(r.capacidad_vehiculo),
    modelo_vehiculo: num(r.modelo_vehiculo),
  }));
  return { conductores, meses };
}
