import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResource } from "@/lib/external/resources";

// Motor de consultas de la Data API externa. Lo comparten el endpoint genérico
// (/api/external/v1/query) y los endpoints REST por recurso
// (/api/external/v1/<recurso> y /api/external/v1/<recurso>/<id>).

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 1000;

// Operadores de filtro permitidos -> método del query builder de supabase-js.
export const OPERATORS = new Set([
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

export type Filter = { column: string; op: string; value: unknown };

export type QueryInput = {
  select?: string;
  filters?: Filter[];
  order?: { column: string; ascending: boolean };
  limit?: number;
  offset?: number;
};

/**
 * Interpreta el valor de un query param como filtro. Admite el prefijo de
 * operador estilo PostgREST: `?fecha=gte.2026-01-01`, `?estado=in.R1,R2`,
 * `?fecha_retiro=is.null`. Sin prefijo, es igualdad: `?estado=ACTIVO`.
 */
export function parseFilterParam(column: string, raw: string): Filter {
  const match = raw.match(/^(eq|neq|gt|gte|lt|lte|like|ilike|in|is)\.([\s\S]*)$/);
  if (!match) return { column, op: "eq", value: raw };

  const [, op, rest] = match;
  if (op === "is") {
    const value =
      rest === "null" ? null : rest === "true" ? true : rest === "false" ? false : rest;
    return { column, op, value };
  }
  if (op === "in") return { column, op, value: rest.split(",") };
  return { column, op, value: rest };
}

/**
 * Ejecuta una consulta paginada sobre un recurso de la whitelist y devuelve la
 * NextResponse lista para retornar (datos o error).
 */
export async function runQuery(
  resourceName: string | undefined,
  input: QueryInput
): Promise<NextResponse> {
  if (!resourceName) {
    return NextResponse.json(
      { error: "Falta 'resource'. Consulte /api/external/v1/schema." },
      { status: 400 }
    );
  }

  const resource = getResource(resourceName);
  if (!resource) {
    return NextResponse.json(
      {
        error: `Recurso '${resourceName}' no permitido o inexistente. Consulte /api/external/v1/schema.`,
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
      const list = Array.isArray(f.value) ? f.value : String(f.value).split(",");
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
