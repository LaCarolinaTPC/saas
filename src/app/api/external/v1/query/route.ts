import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/external/auth";
import {
  runQuery,
  parseFilterParam,
  DEFAULT_LIMIT,
  type Filter,
  type QueryInput,
} from "@/lib/external/query";

export const dynamic = "force-dynamic";

// Parámetros reservados en GET (no se interpretan como filtros).
const RESERVED = new Set([
  "resource",
  "select",
  "limit",
  "offset",
  "order",
  "order_dir",
]);

function parseGet(request: NextRequest): QueryInput & { resource?: string } {
  const sp = request.nextUrl.searchParams;
  const orderCol = sp.get("order") ?? undefined;
  const orderDir = (sp.get("order_dir") ?? "desc").toLowerCase();

  // Cualquier param no reservado se trata como filtro; admite prefijo de
  // operador: ?estado=ACTIVO, ?fecha=gte.2026-01-01, ?ruta=in.R1,R2
  const filters: Filter[] = [];
  for (const [key, value] of sp.entries()) {
    if (RESERVED.has(key)) continue;
    filters.push(parseFilterParam(key, value));
  }

  return {
    resource: sp.get("resource") ?? undefined,
    select: sp.get("select") ?? "*",
    filters,
    order: orderCol
      ? { column: orderCol, ascending: orderDir === "asc" }
      : undefined,
    limit: sp.get("limit") ? Number(sp.get("limit")) : DEFAULT_LIMIT,
    offset: Number(sp.get("offset") ?? 0) || 0,
  };
}

async function parsePost(
  request: NextRequest
): Promise<QueryInput & { resource?: string }> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const order = body.order as { column?: string; ascending?: boolean } | undefined;

  return {
    resource: typeof body.resource === "string" ? body.resource : undefined,
    select: typeof body.select === "string" ? body.select : "*",
    filters: Array.isArray(body.filters) ? (body.filters as Filter[]) : [],
    order:
      order && typeof order.column === "string"
        ? { column: order.column, ascending: order.ascending !== false }
        : undefined,
    limit: typeof body.limit === "number" ? body.limit : DEFAULT_LIMIT,
    offset: typeof body.offset === "number" ? body.offset : 0,
  };
}

// GET /api/external/v1/query?resource=conductores_con_grupo&estado=ACTIVO&limit=50
export async function GET(request: NextRequest) {
  const unauthorized = await requireApiKey(request);
  if (unauthorized) return unauthorized;
  const { resource, ...input } = parseGet(request);
  return runQuery(resource, input);
}

// POST /api/external/v1/query  { resource, select?, filters?, order?, limit? }
export async function POST(request: NextRequest) {
  const unauthorized = await requireApiKey(request);
  if (unauthorized) return unauthorized;
  const { resource, ...input } = await parsePost(request);
  return runQuery(resource, input);
}
