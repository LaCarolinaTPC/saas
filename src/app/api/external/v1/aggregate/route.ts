import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiKey } from "@/lib/external/auth";
import { getResource } from "@/lib/external/resources";

export const dynamic = "force-dynamic";

const AGGS = new Set(["count", "sum", "avg", "min", "max"]);

// POST /api/external/v1/aggregate
// Agregación del lado del servidor sobre TODAS las filas (sin volcar registros).
// Body: { resource, group_by: string[], agg?, metric?, filters?, limit? }
//
// Ej. "quién tiene más viajes perdidos en la historia":
//   { "resource": "viajes_perdidos", "group_by": ["cedula"], "agg": "count", "limit": 10 }
export async function POST(request: NextRequest) {
  const unauthorized = await requireApiKey(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const resourceName = typeof body.resource === "string" ? body.resource : "";
  const resource = getResource(resourceName);
  if (!resource) {
    return NextResponse.json(
      { error: `Recurso '${resourceName}' no permitido. Consulte /api/external/v1/schema.` },
      { status: 404 }
    );
  }

  const groupBy = Array.isArray(body.group_by)
    ? (body.group_by as unknown[]).filter((c): c is string => typeof c === "string")
    : [];
  if (groupBy.length === 0) {
    return NextResponse.json(
      { error: "Falta 'group_by' (lista de columnas por las que agrupar)." },
      { status: 400 }
    );
  }

  const agg = typeof body.agg === "string" ? body.agg : "count";
  if (!AGGS.has(agg)) {
    return NextResponse.json(
      { error: `'agg' debe ser uno de: ${[...AGGS].join(", ")}.` },
      { status: 400 }
    );
  }

  const metric = typeof body.metric === "string" ? body.metric : null;
  if (agg !== "count" && !metric) {
    return NextResponse.json(
      { error: `Para agg='${agg}' debe indicar 'metric' (columna numérica).` },
      { status: 400 }
    );
  }

  const filters = Array.isArray(body.filters) ? body.filters : [];
  const limit = typeof body.limit === "number" ? body.limit : 100;

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("external_aggregate", {
    p_resource: resource.name,
    p_group_by: groupBy,
    p_agg: agg,
    p_metric: metric,
    p_filters: filters,
    p_limit: limit,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = Array.isArray(data) ? data : [];
  return NextResponse.json({
    resource: resource.name,
    groupBy,
    agg,
    metric,
    count: rows.length,
    data: rows, // [{ <group cols...>, value }] ordenado desc por value
  });
}
