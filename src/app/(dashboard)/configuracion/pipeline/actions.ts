"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";

async function assertAdmin() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) throw new Error("Solo un administrador puede gestionar el pipeline.");
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "etapa";
}

function revalidate() {
  revalidatePath("/configuracion/pipeline");
  revalidatePath("/candidatos");
}

export async function createStage(input: {
  label: string;
  color: string;
  text_color: string;
  tipo: string;
}) {
  await assertAdmin();
  const admin = createAdminClient();

  let key = slugify(input.label);
  const { data: existing } = await admin.from("pipeline_stages").select("key");
  const keys = new Set((existing ?? []).map((s) => s.key));
  if (keys.has(key)) {
    let n = 2;
    while (keys.has(`${key}_${n}`)) n++;
    key = `${key}_${n}`;
  }

  const { data: maxRow } = await admin
    .from("pipeline_stages")
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();
  const orden = (maxRow?.orden ?? 0) + 1;

  const { error } = await admin.from("pipeline_stages").insert({
    key,
    label: input.label.trim(),
    color: input.color,
    text_color: input.text_color,
    tipo: input.tipo,
    orden,
  });
  if (error) throw new Error(error.message);
  revalidate();
}

export async function updateStage(
  id: string,
  fields: Partial<{ label: string; color: string; text_color: string; tipo: string; activo: boolean }>
) {
  await assertAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("pipeline_stages").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function deleteStage(id: string, key: string) {
  await assertAdmin();
  const admin = createAdminClient();
  // No permitir borrar una etapa con candidatos asignados.
  const { count } = await admin
    .from("candidate_vacancy")
    .select("id", { count: "exact", head: true })
    .eq("current_stage", key);
  if (count && count > 0) {
    throw new Error(
      `No se puede eliminar: ${count} candidato(s) están en esta etapa. Desactívala o muévelos primero.`
    );
  }
  const { error } = await admin.from("pipeline_stages").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function moveStage(id: string, direction: "up" | "down") {
  await assertAdmin();
  const admin = createAdminClient();
  const { data: stages } = await admin
    .from("pipeline_stages")
    .select("id, orden")
    .order("orden", { ascending: true });
  if (!stages) return;
  const idx = stages.findIndex((s) => s.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= stages.length) return;

  const a = stages[idx];
  const b = stages[swapIdx];
  await admin.from("pipeline_stages").update({ orden: b.orden }).eq("id", a.id);
  await admin.from("pipeline_stages").update({ orden: a.orden }).eq("id", b.id);
  revalidate();
}
