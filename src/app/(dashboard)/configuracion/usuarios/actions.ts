"use server";

// refresh() en vez de revalidatePath(): esta ruta es force-dynamic, así que no
// hay caché de servidor que invalidar, y revalidatePath además purgaba el caché
// de router de las demás pantallas ya visitadas, forzando a recargarlas al
// navegar. refresh() solo vuelve a pedir los datos dinámicos de esta ruta.
import { refresh } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { estaBloqueado } from "@/lib/auth-estado";
import { getCurrentPermissions } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";

async function assertAdmin() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) throw new Error("Solo un administrador puede gestionar usuarios.");
  return perms;
}

/** Id del administrador que ejecuta la acción (para no dejarlo actuar sobre sí mismo). */
async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Clave provisional legible: sin caracteres ambiguos (O/0, I/l/1) porque el
 * administrador se la dicta al usuario por teléfono o WhatsApp.
 */
function generarClaveProvisional(): string {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const num = "23456789";
  const pick = (s: string, n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)))
      .map((r) => s[r % s.length])
      .join("");
  // Formato ABCD-2468-EFGH: 8 letras + 4 dígitos, fácil de dictar.
  return `${pick(abc, 4)}-${pick(num, 4)}-${pick(abc, 4)}`;
}

/**
 * Restablece la contraseña de un usuario desde el software. Devuelve la clave
 * provisional para que el administrador se la entregue; el usuario queda
 * obligado a cambiarla en su siguiente ingreso (must_change_password).
 */
export async function resetUserPassword(userId: string): Promise<{ password: string }> {
  await assertAdmin();
  // La propia clave se cambia en «Cambiar mi contraseña», con la clave actual:
  // restablecerla aquí dejaría al administrador con una provisional sin pedírsela.
  if ((await currentUserId()) === userId) {
    throw new Error("No puedes restablecer tu propia contraseña aquí. Usa «Cambiar mi contraseña».");
  }

  const admin = createAdminClient();
  const { data: perfil } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();

  const password = generarClaveProvisional();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    user_metadata: { must_change_password: true },
  });
  if (error) throw new Error(error.message);

  await logTesoreriaAudit({
    accion: "password_restablecido",
    modulo: "seguridad",
    // Nunca se registra la clave, solo a quién se le restableció.
    detalle: { userId, email: perfil?.email ?? null, fullName: perfil?.full_name ?? null },
  });

  // Sin refresco: la clave no se guarda en ningún sitio que la pantalla pinte
  // (se devuelve una sola vez para que el admin la entregue), así que no hay
  // nada que volver a leer del servidor.
  return { password };
}

/**
 * Activa o desactiva un usuario. Desactivar = bloqueo indefinido en Supabase
 * Auth: no puede iniciar sesión, pero se conserva su perfil y su rastro en la
 * auditoría. Es reversible.
 */
export async function setUserActive(userId: string, activo: boolean) {
  await assertAdmin();

  const yo = await currentUserId();
  if (yo && yo === userId && !activo) {
    throw new Error("No puedes desactivar tu propio usuario.");
  }

  const admin = createAdminClient();
  const { data: perfil } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();

  // No dejar el sistema sin ningún administrador activo: administrador = quien
  // tiene un rol super (puede tener varios roles).
  const idsAdmin = async (): Promise<string[]> => {
    const { data: supers } = await admin.from("roles").select("clave").eq("es_super", true).eq("activo", true);
    const claves = (supers ?? []).map((r) => r.clave as string);
    if (!claves.length) return [];
    const { data } = await admin.from("usuario_roles").select("user_id").in("rol", claves);
    return [...new Set((data ?? []).map((a) => a.user_id as string))];
  };
  const listaAdmin = await idsAdmin();
  if (!activo && listaAdmin.includes(userId)) {
    const admins = listaAdmin.map((id) => ({ id }));
    const { data: authList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const activos = (admins ?? []).filter((a) => {
      if (a.id === userId) return false;
      const au = authList?.users.find((u) => u.id === a.id);
      return !estaBloqueado(au?.banned_until);
    });
    if (activos.length === 0) {
      throw new Error("No se puede desactivar al último administrador activo.");
    }
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    // 100 años ≈ bloqueo permanente; "none" lo levanta.
    ban_duration: activo ? "none" : "876000h",
  });
  if (error) throw new Error(error.message);

  await logTesoreriaAudit({
    accion: activo ? "usuario_activado" : "usuario_desactivado",
    modulo: "seguridad",
    valorAnterior: activo ? "inactivo" : "activo",
    valorNuevo: activo ? "activo" : "inactivo",
    detalle: { userId, email: perfil?.email ?? null, fullName: perfil?.full_name ?? null },
  });

  refresh();
}
