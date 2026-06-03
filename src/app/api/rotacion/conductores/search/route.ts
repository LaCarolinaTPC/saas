import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  const estado = request.nextUrl.searchParams.get("estado") || "";

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const isNumeric = /^\d+$/.test(q);

  let query = supabase
    .from("conductores_con_grupo")
    .select(
      "cedula, nombre, codigo, tipo_conductor, estado, grupo_antiguedad, meses_antiguedad, fecha_ingreso"
    )
    .neq("cedula", "99999999")
    .limit(20);

  if (isNumeric) {
    query = query.or(`cedula.like.%${q}%,codigo.like.%${q}%`);
  } else {
    query = query.ilike("nombre", `%${q}%`);
  }

  if (estado) {
    query = query.eq("estado", estado);
  }

  query = query.order("estado").order("nombre");

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
