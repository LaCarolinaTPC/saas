/**
 * Lectura de la base para el desglose de costos (24-nov-2026). El cálculo está
 * en ./costos. Lo usan la sección «Costo» de los indicadores y su Excel.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { leerTodo, type Consulta } from "@/lib/comunicaciones/leer-todo";
import { inicioDiaBogota, sumarDias, type Rango } from "@/lib/comunicaciones/indicadores";
import { calcularDetalleCostos, type ConsultaCosto, type ConsumoCosto, type DetalleCostos } from "./costos";
import { leerAjustes, valorAjuste } from "./servidor";

export interface CostosLeidos {
  detalle: DetalleCostos;
  /** Filas crudas, para el detalle del Excel. */
  consumos: ConsumoCosto[];
  consultas: ConsultaCosto[];
  faltantes: string[];
}

export async function leerCostosSeleccion(rango: Rango): Promise<CostosLeidos> {
  const db = createAdminClient();
  const inicio = inicioDiaBogota(rango.desde);
  const fin = inicioDiaBogota(sumarDias(rango.hasta, 1));
  const faltantes: string[] = [];
  const q = (tabla: string) => (sel: string, conteo: boolean): Consulta =>
    db.from(tabla).select(sel, conteo ? { count: "exact", head: true } : undefined).gte("created_at", inicio).lt("created_at", fin);

  const [consumos, consultas, ajustes, aspirantes, contratadosEv] = await Promise.all([
    leerTodo<ConsumoCosto>(
      "seleccion_consumos",
      ["concepto", "proveedor", "modelo", "tokens_entrada", "tokens_salida", "costo_usd", "proceso_id", "conversacion_id", "created_at"],
      [],
      q("seleccion_consumos"),
      ["created_at", "id"],
      faltantes
    ),
    leerTodo<ConsultaCosto>(
      "verificaciones_externas",
      ["proveedor", "fuente", "estado", "consultado_por", "cedula", "proceso_id", "created_at"],
      [],
      (sel, c) => q("verificaciones_externas")(sel, c).eq("proveedor", "croma"),
      ["created_at", "id"],
      faltantes
    ),
    leerAjustes().catch(() => []),
    db
      .from("procesos_contratacion")
      .select("id", { count: "exact", head: true })
      .gte("created_at", inicio)
      .lt("created_at", fin)
      .or("origen.is.null,origen.neq.chat_prueba"),
    db
      .from("procesos_contratacion_eventos")
      .select("proceso_id, proceso:procesos_contratacion(origen)")
      .eq("estado_nuevo", "contratado")
      .gte("created_at", inicio)
      .lt("created_at", fin)
      .limit(5000),
  ]);

  const contratados = new Set(
    ((contratadosEv.data ?? []) as unknown as { proceso_id: string; proceso: { origen: string | null } | null }[])
      .filter((e) => e.proceso?.origen !== "chat_prueba")
      .map((e) => e.proceso_id)
  ).size;

  const detalle = calcularDetalleCostos({
    rango,
    consumos,
    consultas,
    cromaCostoCop: Number(valorAjuste<unknown>(ajustes, "croma_costo_consulta", 0)) || 0,
    trm: Number(valorAjuste<unknown>(ajustes, "trm", 3270)) || 3270,
    aspirantes: aspirantes.count ?? 0,
    contratados,
  });
  return { detalle, consumos, consultas, faltantes: [...new Set(faltantes)] };
}

/** Nombre y cédula de los aspirantes que aparecen en el detalle. */
export async function aspirantesDeCostos(ids: string[]): Promise<Map<string, { nombre: string | null; cedula: string | null }>> {
  const db = createAdminClient();
  const unicos = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, { nombre: string | null; cedula: string | null }>();
  for (let i = 0; i < unicos.length; i += 150) {
    const { data } = await db.from("procesos_contratacion").select("id, nombre, cedula").in("id", unicos.slice(i, i + 150));
    for (const p of (data ?? []) as { id: string; nombre: string | null; cedula: string | null }[]) out.set(p.id, { nombre: p.nombre, cedula: p.cedula });
  }
  return out;
}
