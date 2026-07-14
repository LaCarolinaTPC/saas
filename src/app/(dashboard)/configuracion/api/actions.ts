"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPermissions } from "@/lib/permissions";
import { generateApiKey } from "@/lib/external/api-keys";

async function assertAdmin() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) throw new Error("Solo un administrador puede gestionar las API keys.");
}

/**
 * Crea una API key y devuelve la clave completa UNA sola vez.
 * En la base solo queda el hash; después de esta respuesta no hay forma
 * de recuperar la clave.
 */
export async function createApiKey(name: string): Promise<{ key: string }> {
  await assertAdmin();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("El nombre es obligatorio.");
  if (trimmed.length > 80) throw new Error("El nombre no puede superar 80 caracteres.");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { key, prefix, hash } = generateApiKey();

  const admin = createAdminClient();
  const { error } = await admin.from("api_keys").insert({
    name: trimmed,
    key_prefix: prefix,
    key_hash: hash,
    created_by: user?.id ?? null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/configuracion/api");
  return { key };
}

/** Revoca una clave: deja de autenticar de inmediato. Irreversible. */
export async function revokeApiKey(id: string) {
  await assertAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("api_keys")
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/configuracion/api");
}
