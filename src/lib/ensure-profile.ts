import { createAdminClient } from "@/lib/supabase/admin";

type AuthUserLike = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null;

/**
 * Garantiza que exista una fila en `profiles` para el usuario autenticado.
 * Necesario porque varias tablas referencian profiles(id) por FK y algunos
 * usuarios de auth.users pueden no tener perfil (creados sin el trigger).
 * Devuelve el id del usuario (apto para usar como FK) o null.
 */
export async function ensureProfile(user: AuthUserLike): Promise<string | null> {
  if (!user) return null;
  try {
    const admin = createAdminClient();
    const fullName =
      (user.user_metadata?.full_name as string | undefined) ||
      user.email ||
      "Usuario";
    await admin
      .from("profiles")
      .upsert(
        { id: user.id, full_name: fullName, email: user.email || "" },
        { onConflict: "id", ignoreDuplicates: true }
      );
    return user.id;
  } catch {
    return null;
  }
}
