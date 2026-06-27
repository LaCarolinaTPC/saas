import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiKey } from "@/lib/external/auth";
import { getResource } from "@/lib/external/resources";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

// Operadores de filtro permitidos -> método del query builder de supabase-js.
const OPERATORS = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "in",
  "is",
]);

type Filter = { column: string; op: string; value: unknown };

type QueryInput = {
  resource: string;
  select: string;
  filters: Filter[];
  order?: { column: string; ascending: boolean };
  limit: number;
  offset: number;
};

// Parámetros reservados en GET (no se interpretan como filtros).
const RESERVED = new Set([
  "resource",
  "select",
  "limit",
  "offset",
  "order",
  "order_dir",
]);

function parseGet(request: NextRequest): Partial<QueryInput> & { resource?: string } {
  const sp = request.nextUrl.searchParams;
  const resource = sp.get("resource") ?? undefined;
  const select = sp.get("select") ?? "*";
  const limitRaw = sp.get("limit");
  const orderCol = sp.get("order") ?? undefined;
  const orderDir = (sp.get("order_dir") ?? "desc").toLowerCase();

  // Cualquier param no reservado se trata como filtro de igualdad: ?estado=ACTIVO
  const filters: Filter[] = [];
  for (const [key, value] of sp.entries()) {
    if (RESERVED.has(key)) continue;
    filters.push({ column: key, op: "eq", value });
  }

  return {
    resource,
    select,
    filters,
    order: orderCol
      ? { column: orderCol, ascending: orderDir === "asc" }
      : undefined,
    limit: limitRaw ? Number(limitRaw) : DEFAULT_LIMIT,
    offset: Number(sp.get("offset") ?? 0) || 0,
  };
}

async function parsePost(
  request: NextRequest
): Promise<Partial<QueryInput> & { resource?: string }> {
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

async function handle(
  request: NextRequest,
  input: Partial<QueryInput> & { resource?: string }
) {
  if (!input.resource) {
    return NextResponse.json(
      { error: "Falta 'resource'. Consulte /api/external/v1/schema." },
      { status: 400 }
    );
  }

  const resource = getResource(input.resource);
  if (!resource) {
    return NextResponse.json(
      {
        error: `Recurso '${input.resource}' no permitido o inexistente. Consulte /api/external/v1/schema.`,
      },
      { status: 404 }
    );
  }

  const limit = Math.min(Math.max(1, input.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.max(0, input.offset ?? 0);
  const select = input.select && input.select.trim() ? input.select : "*";

  const supabase = createAdminClient();
  let query = supabase.from(resource.name).select(select, { count: "exact" });

  // Aplicar filtros validados.
  for (const f of input.filters ?? []) {
    if (!f || typeof f.column !== "string" || !OPERATORS.has(f.op)) {
      return NextResponse.json(
        {
          error: `Filtro inválido. 'op' debe ser uno de: ${[...OPERATORS].join(", ")}.`,
        },
        { status: 400 }
      );
    }
    if (f.op === "in") {
      const list = Array.isArray(f.value)
        ? f.value
        : String(f.value).split(",");
      query = query.in(f.column, list as string[]);
    } else {
      // @ts-expect-error - método dinámico validado contra OPERATORS
      query = query[f.op](f.column, f.value);
    }
  }

  // Orden: el indicado, o el por defecto del recurso (descendente).
  const order =
    input.order ??
    (resource.defaultOrder
      ? { column: resource.defaultOrder, ascending: false }
      : undefined);
  if (order) {
    query = query.order(order.column, { ascending: order.ascending });
  }

  // Paginación: range es inclusivo en ambos extremos.
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const returned = data?.length ?? 0;
  const total = count ?? null;
  const nextOffset =
    total !== null && offset + returned < total ? offset + returned : null;

  return NextResponse.json({
    resource: resource.name,
    count: returned,
    total,
    limit,
    offset,
    nextOffset, // pásalo como 'offset' en la siguiente consulta para paginar
    data: data ?? [],
  });
}

// GET /api/external/v1/query?resource=conductores_con_grupo&estado=ACTIVO&limit=50
export async function GET(request: NextRequest) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;
  return handle(request, parseGet(request));
}

// POST /api/external/v1/query  { resource, select?, filters?, order?, limit? }
export async function POST(request: NextRequest) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;
  return handle(request, await parsePost(request));
}
