import { NextRequest, NextResponse } from "next/server";
import { getCurrentPermissions, canAccessSub } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET_PADRINO, cedulaDelUsuario } from "@/lib/padrino/datos";

export const dynamic = "force-dynamic";

/** Abre el certificado de experiencia de un referido: revisa el permiso y redirige a una URL firmada de un minuto. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "candidatos", "padrino_consulta")) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const admin = createAdminClient();
  const { data: r } = await admin.from("padrino_referidos").select("cedula_padrino, certificado_ruta, certificado_nombre").eq("id", id).maybeSingle();
  if (!r?.certificado_ruta) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  // El padrino no ve su propio registro (RQ-07).
  const propia = await cedulaDelUsuario(perms.userId, perms.userEmail, admin);
  if (propia && propia === r.cedula_padrino) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const descargar = req.nextUrl.searchParams.get("descargar") === "1";
  const { data, error } = await admin.storage
    .from(BUCKET_PADRINO)
    .createSignedUrl(r.certificado_ruta as string, 60, descargar ? { download: (r.certificado_nombre as string) ?? "certificado" } : undefined);
  if (error || !data) return NextResponse.json({ error: "No se pudo abrir el archivo" }, { status: 502 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
