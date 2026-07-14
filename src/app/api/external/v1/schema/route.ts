import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiKey } from "@/lib/external/auth";
import { EXTERNAL_RESOURCES, resourceIdColumn } from "@/lib/external/resources";

export const dynamic = "force-dynamic";

// GET /api/external/v1/schema
// Catálogo autodescriptivo de la Data API: lista los recursos disponibles, su
// dominio, descripción y las columnas reales (introspectadas en vivo). Pensado
// para que un consultor de IA descubra qué puede consultar antes de pedir datos.
export async function GET(request: NextRequest) {
  const unauthorized = await requireApiKey(request);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();

  const resources = await Promise.all(
    EXTERNAL_RESOURCES.map(async (r) => {
      // Una fila basta para descubrir los nombres de columna reales.
      const { data, error } = await supabase
        .from(r.name)
        .select("*")
        .limit(1);

      const columns = error || !data?.[0] ? [] : Object.keys(data[0]);

      return {
        resource: r.name,
        domain: r.domain,
        description: r.description,
        defaultOrder: r.defaultOrder ?? null,
        idColumn: resourceIdColumn(r),
        endpoints: {
          list: `/api/external/v1/${r.name}`,
          detail: `/api/external/v1/${r.name}/{${resourceIdColumn(r)}}`,
        },
        columns,
      };
    })
  );

  return NextResponse.json({
    version: "v1",
    description:
      "Data API de solo lectura de GESTIVO. Use /api/external/v1/query para consultar cualquiera de estos recursos.",
    operators: [
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
    ],
    resources,
  });
}
