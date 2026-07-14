import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiKey } from "@/lib/external/auth";
import { getResource, resourceIdColumn } from "@/lib/external/resources";

export const dynamic = "force-dynamic";

// GET /api/external/v1/<recurso>/<id>
// Detalle de un registro por su columna identificadora (idColumn del recurso;
// "id" por defecto, "cedula" para conductores_con_grupo).
//
// Ej: GET /api/external/v1/conductores_con_grupo/1023456789
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string; id: string }> }
) {
  const unauthorized = await requireApiKey(request);
  if (unauthorized) return unauthorized;

  const { resource: resourceName, id } = await params;

  const resource = getResource(resourceName);
  if (!resource) {
    return NextResponse.json(
      {
        error: `Recurso '${resourceName}' no permitido o inexistente. Consulte /api/external/v1/schema.`,
      },
      { status: 404 }
    );
  }

  const idColumn = resourceIdColumn(resource);
  const select = request.nextUrl.searchParams.get("select") ?? "*";

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(resource.name)
    .select(select)
    .eq(idColumn, id)
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json(
      { error: `No existe ${resource.name} con ${idColumn}='${id}'.` },
      { status: 404 }
    );
  }

  return NextResponse.json({ resource: resource.name, idColumn, data });
}
