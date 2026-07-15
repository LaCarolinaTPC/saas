import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import { getEstadoConductor } from "@/lib/devengados/data";

export const dynamic = "force-dynamic";

/**
 * Estado de devengados de un conductor (pantalla de caja).
 * GET /api/devengados/estado?cedula=123&fecha=2026-07-15
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "devengados")) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const cedula = req.nextUrl.searchParams.get("cedula")?.replace(/\D/g, "");
  const fecha = req.nextUrl.searchParams.get("fecha");
  if (!cedula || !fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json(
      { error: "Parámetros requeridos: cedula, fecha (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  try {
    const estado = await getEstadoConductor(cedula, fecha);
    return NextResponse.json(estado);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
