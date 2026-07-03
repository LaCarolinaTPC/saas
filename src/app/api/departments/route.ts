import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("departments").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const perms = await getCurrentPermissions();
  if (!perms.puedeEditar) {
    return NextResponse.json({ error: "No tienes permiso para crear departamentos." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("departments")
    .upsert({ name }, { onConflict: "name" })
    .select("id, name")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const perms = await getCurrentPermissions();
  if (!perms.puedeEditar) {
    return NextResponse.json({ error: "No tienes permiso para eliminar departamentos." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("departments").delete().eq("id", id);
  if (error) {
    const msg =
      error.code === "23503"
        ? "No se puede eliminar: tiene vacantes o empleados asociados."
        : error.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
