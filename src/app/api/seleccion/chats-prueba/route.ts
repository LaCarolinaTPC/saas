import { NextRequest, NextResponse } from "next/server";
import { getCurrentPermissions, puedeEditarEn, tienePermiso } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Chats de prueba de la selección, compartidos entre equipos (26-nov-2026).
 * Antes vivían solo en el navegador; ahora la tabla seleccion_chats_prueba es
 * la fuente y el navegador queda como copia por si la base no responde.
 *
 * Va por ruta y no por server action: las actions de una página van en fila
 * (una a la vez) y el chat de prueba ya hace muchas; el guardado frecuente de
 * la conversación las demoraría todas.
 *
 *  GET                 → lista de chats abiertos (sin la conversación)
 *  GET ?id=…           → la conversación de un chat
 *  PUT {id, …}         → crea o actualiza (solo los campos que vienen)
 *  DELETE ?id=…        → cierra el chat para todos (queda marcado, no se borra)
 *
 * Sin la migración 20261126183515 responde 503 con `sinTabla: true` y el
 * navegador sigue guardando como antes.
 */

const TABLA = "seleccion_chats_prueba";
/** Tope de la conversación guardada (las fotos ya van sin la vista previa). */
const MAX_BYTES = 4_000_000;

async function exigir() {
  const perms = await getCurrentPermissions();
  const puede =
    perms.isAdmin || tienePermiso(perms, "candidatos.seleccion_config.ver") || puedeEditarEn(perms, "candidatos.seleccion_config");
  return puede ? perms : null;
}

const prohibido = () => NextResponse.json({ ok: false, error: "No tienes permiso para usar el chat de prueba de la selección." }, { status: 403 });

function idValido(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : null;
}

function falla(error: { code?: string; message: string }) {
  const sinTabla = error.code === "PGRST205" || error.code === "42P01";
  return NextResponse.json(
    { ok: false, sinTabla, error: sinTabla ? "Falta la migración 20261126183515 (seleccion_chats_prueba)." : error.message },
    { status: sinTabla ? 503 : 500 }
  );
}

export async function GET(req: NextRequest) {
  if (!(await exigir())) return prohibido();
  const admin = createAdminClient();
  const id = req.nextUrl.searchParams.get("id");
  if (id !== null) {
    const n = idValido(id);
    if (!n) return NextResponse.json({ ok: false, error: "Chat no válido." }, { status: 400 });
    const { data, error } = await admin.from(TABLA).select("estado, updated_at, cerrado_at").eq("id", n).maybeSingle();
    if (error) return falla(error);
    return NextResponse.json({ ok: true, chat: data ?? null });
  }
  const { data, error } = await admin
    .from(TABLA)
    .select("id, numero, config, resumen, creado_por, actualizado_por, created_at, updated_at")
    .is("cerrado_at", null)
    .order("id", { ascending: false })
    .limit(200);
  if (error) return falla(error);
  return NextResponse.json({ ok: true, chats: data ?? [] });
}

export async function PUT(req: NextRequest) {
  const perms = await exigir();
  if (!perms) return prohibido();
  const texto = await req.text();
  if (texto.length > MAX_BYTES) return NextResponse.json({ ok: false, error: "La conversación es demasiado grande para guardarla." }, { status: 413 });
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Cuerpo no válido." }, { status: 400 });
  }
  const id = idValido(cuerpo.id);
  if (!id) return NextResponse.json({ ok: false, error: "Chat no válido." }, { status: 400 });

  const ahora = new Date().toISOString();
  const fila: Record<string, unknown> = { id, updated_at: ahora, actualizado_por: perms.userEmail ?? null };
  if (typeof cuerpo.numero === "number" && Number.isSafeInteger(cuerpo.numero)) fila.numero = cuerpo.numero;
  if (cuerpo.config && typeof cuerpo.config === "object") fila.config = cuerpo.config;
  if ("resumen" in cuerpo) fila.resumen = cuerpo.resumen ?? null;
  if ("estado" in cuerpo) fila.estado = cuerpo.estado ?? null;

  const admin = createAdminClient();
  // Primero se intenta actualizar (lo normal); si no existe, se crea con quién lo abrió.
  const { data: actualizada, error } = await admin.from(TABLA).update(fila).eq("id", id).select("updated_at, cerrado_at").maybeSingle();
  if (error) return falla(error);
  if (actualizada) return NextResponse.json({ ok: true, updated_at: actualizada.updated_at, cerrado: Boolean(actualizada.cerrado_at) });

  const { data: creada, error: errorCrear } = await admin
    .from(TABLA)
    .insert({ ...fila, creado_por: perms.userEmail ?? null })
    .select("updated_at")
    .single();
  if (errorCrear) {
    // Otro equipo lo creó al mismo tiempo: se actualiza.
    if (errorCrear.code === "23505") {
      const { data: otra, error: e2 } = await admin.from(TABLA).update(fila).eq("id", id).select("updated_at").single();
      if (e2) return falla(e2);
      return NextResponse.json({ ok: true, updated_at: otra.updated_at, cerrado: false });
    }
    return falla(errorCrear);
  }
  return NextResponse.json({ ok: true, updated_at: creada.updated_at, cerrado: false });
}

export async function DELETE(req: NextRequest) {
  const perms = await exigir();
  if (!perms) return prohibido();
  const id = idValido(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false, error: "Chat no válido." }, { status: 400 });
  const { error } = await createAdminClient()
    .from(TABLA)
    .update({ cerrado_at: new Date().toISOString(), cerrado_por: perms.userEmail ?? null })
    .eq("id", id)
    .is("cerrado_at", null);
  if (error) return falla(error);
  return NextResponse.json({ ok: true });
}
