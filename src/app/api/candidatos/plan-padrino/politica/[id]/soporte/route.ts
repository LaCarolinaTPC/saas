import { NextRequest, NextResponse } from "next/server";
import { getCurrentPermissions, canAccessSub } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET_PADRINO } from "@/lib/padrino/datos";

export const dynamic = "force-dynamic";

/** Abre el soporte firmado de una versión de la política: revisa el permiso y redirige a una URL firmada de un minuto. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "candidatos", "padrino_consulta")) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const admin = createAdminClient();
  const { data: p } = await admin.from("padrino_politicas").select("version, soporte_ruta").eq("id", id).maybeSingle();
  if (!p?.soporte_ruta) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const ext = String(p.soporte_ruta).split(".").pop() ?? "pdf";
  // Siempre como descarga: el navegador no interpreta el contenido.
  const { data, error } = await admin.storage
    .from(BUCKET_PADRINO)
    .createSignedUrl(p.soporte_ruta as string, 60, { download: `politica-plan-padrino-${p.version}.${ext}` });
  if (error || !data) return NextResponse.json({ error: "No se pudo abrir el archivo" }, { status: 502 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
