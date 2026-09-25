import { NextRequest, NextResponse } from "next/server";
import { getCurrentPermissions, canAccessSub } from "@/lib/permissions";
import { leerSoporte, urlSoporte } from "@/lib/tesoreria/soportes";

export const dynamic = "force-dynamic";

/** Abre o descarga un soporte (Tesorería): revisa el permiso y redirige a una URL firmada de un minuto. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", "liq_afiliados")) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const s = await leerSoporte((await params).id);
  if (!s) return NextResponse.json({ error: "Soporte no encontrado" }, { status: 404 });
  const url = await urlSoporte(s.ruta, s.archivoNombre, req.nextUrl.searchParams.get("descargar") === "1");
  if (!url) return NextResponse.json({ error: "No se pudo abrir el archivo" }, { status: 502 });
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}
