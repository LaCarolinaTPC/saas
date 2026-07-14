import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/external/auth";
import {
  runQuery,
  parseFilterParam,
  DEFAULT_LIMIT,
  type Filter,
} from "@/lib/external/query";

export const dynamic = "force-dynamic";

// Parámetros reservados (no se interpretan como filtros).
const RESERVED = new Set(["select", "limit", "offset", "order", "order_dir"]);

// GET /api/external/v1/<recurso>
// Endpoint REST de listado por recurso. Cualquier query param no reservado es
// un filtro; admite prefijo de operador: ?estado=ACTIVO, ?fecha=gte.2026-01-01,
// ?ruta=in.R1,R2, ?fecha_retiro=is.null
//
// Ej: GET /api/external/v1/conductores_con_grupo?estado=ACTIVO&limit=50
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> }
) {
  const unauthorized = await requireApiKey(request);
  if (unauthorized) return unauthorized;

  const { resource } = await params;
  const sp = request.nextUrl.searchParams;

  const filters: Filter[] = [];
  for (const [key, value] of sp.entries()) {
    if (RESERVED.has(key)) continue;
    filters.push(parseFilterParam(key, value));
  }

  const orderCol = sp.get("order");
  const orderDir = (sp.get("order_dir") ?? "desc").toLowerCase();

  return runQuery(resource, {
    select: sp.get("select") ?? "*",
    filters,
    order: orderCol ? { column: orderCol, ascending: orderDir === "asc" } : undefined,
    limit: sp.get("limit") ? Number(sp.get("limit")) : DEFAULT_LIMIT,
    offset: Number(sp.get("offset") ?? 0) || 0,
  });
}
